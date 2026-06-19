package com.salesautocall.app.sip

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import org.linphone.core.Account
import org.linphone.core.AudioDevice
import org.linphone.core.Call
import org.linphone.core.Core
import org.linphone.core.CoreListenerStub
import org.linphone.core.Factory
import org.linphone.core.RegistrationState
import org.linphone.core.TransportType

/**
 * Thin wrapper around the Linphone SDK that turns the app into a real SIP
 * endpoint — it registers over SIP-UDP (exactly like Zoiper does), dials the
 * customer directly, and carries two-way audio natively (with STUN/ICE for NAT
 * and earpiece/speaker routing). It also auto-answers an inbound leg, in case
 * the PBX is driven via click-to-call. This replaces the WebRTC/WebView
 * softphone, which couldn't register because the PBX only exposes SIP-UDP.
 *
 * All state changes are surfaced through [onState] as short status strings the
 * ViewModel maps to user-facing text:
 *   registering / registered / regfailed:<msg> / ringing / connected / ended
 */
object SipManager {

    private var core: Core? = null
    private var account: Account? = null
    private var domain: String = "sip.uroperator.com"
    private var speakerOn: Boolean = false
    private var recordFile: String? = null
    private var recordingActive: Boolean = false
    
    var appContext: Context? = null
    var incomingCall: Call? = null

    /** Called on every meaningful state change. Set by the ViewModel. */
    var onState: ((String) -> Unit)? = null

    /** Observable call state for the in-call UI (ringing/connected/ended). */
    val callState = MutableStateFlow("idle")

    fun acceptIncomingCall() {
        val call = incomingCall ?: core?.currentCall ?: return
        val p = runCatching { core?.createCallParams(call) }.getOrNull()
        if (p != null && recordFile != null) runCatching { p.recordFile = recordFile }
        runCatching { if (p != null) call.acceptWithParams(p) else call.accept() }
        incomingCall = null
    }

    /** Set the path the next call should record to (null = no recording). */
    fun setRecordFile(path: String?) {
        recordFile = path
    }

    /** Path of the recording captured for the last call, or null. */
    fun takeRecording(): String? = recordFile

    fun isRecording(): Boolean = recordingActive

    /** Manually pause/resume recording for the active call. Returns the new state. */
    fun toggleRecording(): Boolean {
        val c = core?.currentCall ?: return recordingActive
        if (recordingActive) {
            runCatching { c.stopRecording() }
            recordingActive = false
        } else if (recordFile != null) {
            runCatching { c.startRecording() }.onSuccess { recordingActive = true }
        }
        return recordingActive
    }

    private val listener = object : CoreListenerStub() {
        override fun onAccountRegistrationStateChanged(
            core: Core,
            account: Account,
            state: RegistrationState?,
            message: String,
        ) {
            when (state) {
                RegistrationState.Progress -> onState?.invoke("registering")
                RegistrationState.Ok -> onState?.invoke("registered")
                RegistrationState.Cleared -> onState?.invoke("unregistered")
                RegistrationState.Failed -> onState?.invoke("regfailed:$message")
                else -> { /* None / Refreshing — ignore */ }
            }
        }

        override fun onCallStateChanged(
            core: Core,
            call: Call,
            state: Call.State?,
            message: String,
        ) {
            when (state) {
                Call.State.IncomingReceived -> {
                    onState?.invoke("ringing")
                    callState.value = "ringing"
                    incomingCall = call
                    // Ring with our own full-screen call screen (reliable, unlike the
                    // Telecom calling-account which must be manually enabled).
                    val from = runCatching { call.remoteAddress?.username }.getOrNull()
                        ?: runCatching { call.remoteAddress?.asStringUriOnly() }.getOrNull() ?: "Unknown"
                    appContext?.let { ctx ->
                        runCatching { com.salesautocall.app.notify.IncomingCallNotifier.show(ctx, from) }
                    }
                }
                Call.State.OutgoingProgress,
                Call.State.OutgoingRinging -> onState?.invoke("ringing")
                Call.State.Connected,
                Call.State.StreamsRunning -> {
                    appContext?.let { runCatching { com.salesautocall.app.notify.IncomingCallNotifier.cancel(it) } }
                    applyAudioRoute(core)
                    if (recordFile != null && !recordingActive) {
                        runCatching { call.startRecording() }.onSuccess { recordingActive = true }
                    }
                    onState?.invoke("connected")
                    callState.value = "connected"
                }
                Call.State.End,
                Call.State.Released,
                Call.State.Error -> {
                    appContext?.let { runCatching { com.salesautocall.app.notify.IncomingCallNotifier.cancel(it) } }
                    if (recordingActive) {
                        runCatching { call.stopRecording() }
                        recordingActive = false
                    }
                    // Surface the SIP failure code (403/404/488/603…) so the cause is visible.
                    val code = runCatching { call.errorInfo?.protocolCode ?: 0 }.getOrDefault(0)
                    val phrase = runCatching { call.errorInfo?.phrase ?: "" }.getOrDefault("")
                    if (code >= 300) onState?.invoke("callfailed:$code $phrase") else onState?.invoke("ended")
                    callState.value = "ended"
                }
                else -> { /* nothing */ }
            }
        }
    }

    private fun ensureCore(context: Context): Core {
        core?.let { return it }
        val factory = Factory.instance()
        val c = factory.createCore(null, null, context.applicationContext)
        c.addListener(listener)
        // Audio only — never offer video.
        c.isVideoCaptureEnabled = false
        c.isVideoDisplayEnabled = false
        c.isMicEnabled = true
        // Direct media, no ICE/STUN — matches Zoiper's behaviour on the private
        // VPN path. (ICE candidates pointing at an unreachable STUN server inside
        // the VPN can make the PBX drop the call instantly.)
        runCatching {
            val nat = c.createNatPolicy()
            nat.isStunEnabled = false
            nat.isIceEnabled = false
            nat.isTurnEnabled = false
            c.natPolicy = nat
        }
        // Keep the engine processing even when the UI is dead — without this the
        // background service never refreshes the registration or receives the
        // inbound INVITE, so incoming calls silently never ring.
        runCatching { c.isAutoIterateEnabled = true }
        // Send a SIP/NAT keepalive so the carrier NAT pinhole stays open between
        // re-registrations (this is what lets the PBX push an incoming call back
        // to a phone behind mobile NAT — exactly what Zoiper does).
        runCatching { c.config?.setInt("net", "nat_sip_keepalive", 20) }
        runCatching { c.config?.setInt("sip", "keepalive_period", 20000) }
        c.start()
        core = c
        return c
    }

    /** Called by SipBackgroundService to ensure SIP is running even if the UI is dead. */
    fun registerFromPrefs(context: Context) {
        val agentId = com.salesautocall.app.data.AppPrefs.getAgentId(context)
        val sipPass = com.salesautocall.app.data.AppPrefs.getSipPassword(context)
        if (agentId.isBlank() || sipPass.isBlank()) return
        
        var server = com.salesautocall.app.data.AppPrefs.getSipServer(context)
        if (server.isBlank()) server = "sip.uroperator.com"
        
        // Standard SIP port; self-hosted FreeSWITCH/Asterisk listen on 5060 by default.
        val p = com.salesautocall.app.data.AppPrefs.getSipPort(context).toIntOrNull() ?: 5060
        register(context, agentId, sipPass, server, p, "udp")
    }

    /**
     * Registers [username] against the PBX. [server]/[port] default to the public
     * uroperator gateway but can be overridden (e.g. a private IP reached via VPN).
     */
    fun register(
        context: Context,
        username: String,
        password: String,
        server: String,
        port: Int,
        transport: String,
    ) {
        val c = ensureCore(context)
        domain = server
        onState?.invoke("registering")

        val factory = Factory.instance()

        // Clear any previous account/auth so re-registering with new creds is clean.
        c.clearAccounts()
        c.clearAllAuthInfo()

        val auth = factory.createAuthInfo(username, null, password, null, null, server)
        c.addAuthInfo(auth)

        val params = c.createAccountParams()
        val identity = factory.createAddress("sip:$username@$server")
        params.identityAddress = identity

        val proxy = factory.createAddress("sip:$server:$port")
        proxy?.transport = when (transport.lowercase()) {
            "tcp" -> TransportType.Tcp
            "tls" -> TransportType.Tls
            else -> TransportType.Udp
        }
        params.serverAddress = proxy
        params.isRegisterEnabled = true
        // Short registration so the carrier NAT pinhole is refreshed often enough
        // that the PBX can still reach us for INCOMING calls (mobile NAT closes the
        // hole in ~30-60s). Zoiper does the same; without it, inbound never rings.
        runCatching { params.expires = 30 }
        // Send REGISTER and all in-dialog requests straight to this server.
        runCatching { params.isOutboundProxyEnabled = true }

        val acc = c.createAccount(params)
        c.addAccount(acc)
        c.defaultAccount = acc
        account = acc
    }

    /** Places a direct outbound call to [number] on the registered domain. */
    fun call(number: String) {
        val c = core ?: return
        val remote = Factory.instance().createAddress("sip:$number@$domain")
        val p = c.createCallParams(null)
        if (p != null && recordFile != null) runCatching { p.recordFile = recordFile }
        if (remote != null && p != null) c.inviteAddressWithParams(remote, p) else c.invite("sip:$number@$domain")
    }

    fun setMuted(muted: Boolean) {
        core?.isMicEnabled = !muted
    }

    /** Toggles loudspeaker vs earpiece for the active call. */
    fun setSpeaker(on: Boolean) {
        speakerOn = on
        core?.let { applyAudioRoute(it) }
    }

    fun hangup() {
        val c = core ?: return
        c.currentCall?.terminate() ?: c.terminateAllCalls()
    }

    /** Ends the call (if any) and tears down registration (removing the account
     *  sends an un-REGISTER to the PBX). */
    fun stop() {
        if (recordingActive) {
            runCatching { core?.currentCall?.stopRecording() }
            recordingActive = false
        }
        runCatching { hangup() }
        val c = core ?: return
        runCatching { c.clearAccounts() }
        runCatching { c.clearAllAuthInfo() }
        account = null
    }

    private fun applyAudioRoute(c: Core) {
        val wanted = if (speakerOn) AudioDevice.Type.Speaker else AudioDevice.Type.Earpiece
        val dev = c.audioDevices.firstOrNull {
            it.type == wanted && it.hasCapability(AudioDevice.Capabilities.CapabilityPlay)
        } ?: c.audioDevices.firstOrNull { it.type == wanted }
        if (dev != null) {
            c.outputAudioDevice = dev
            c.currentCall?.outputAudioDevice = dev
        }
    }
}
