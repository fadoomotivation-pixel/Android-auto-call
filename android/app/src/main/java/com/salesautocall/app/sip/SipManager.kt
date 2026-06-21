package com.salesautocall.app.sip

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
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
    // For a public PBX we want plain STUN (no ICE) on the *media* so the call's SDP
    // advertises the phone's public address (the Zoiper-style traversal that gives
    // two-way audio behind carrier NAT). But enabling STUN *during* REGISTER stalls
    // login on some carriers, so we hold the STUN server here and turn it on only
    // after the account has registered. Null = private PBX (no STUN at all).
    private var pendingMediaStun: String? = null
    private var mediaStunApplied: Boolean = false
    // VoIP audio session. linphone 5.x leaves the Android AudioManager mode and
    // audio focus to the app (that's why we route the device manually). Without
    // MODE_IN_COMMUNICATION + voice-call focus the mic/earpiece never engage when a
    // call is driven from a backgrounded/locked context — i.e. an answered INCOMING
    // call → "connected but no audio either way". We hold the focus request so we
    // can release it (and restore MODE_NORMAL) when the call ends.
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    
    var appContext: Context? = null
    var incomingCall: Call? = null

    /** Called on every meaningful state change. Set by the ViewModel. */
    var onState: ((String) -> Unit)? = null

    /**
     * True only while the ViewModel is placing an OUTBOUND cloud call. The PBX's
     * click-to-call bridge rings our own extension as the agent leg of that call,
     * which we must auto-answer (not ring). A *genuine* inbound call arrives when
     * this is false and must ring full-screen instead.
     *
     * This used to be inferred from `onState != null`, but that flag leaked when a
     * call ended remotely (the in-call UI didn't dismiss), so later real inbound
     * calls were silently auto-answered with no ringtone. An explicit flag that we
     * clear on every call end fixes that.
     */
    @Volatile
    var expectingOutbound: Boolean = false

    /** Observable call state for the in-call UI (ringing/connected/ended). */
    val callState = MutableStateFlow("idle")

    // Background-safe logging/recording for a genuine INBOUND call (the ViewModel
    // only handles outbound). Active only when no outbound call is in progress.
    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var handlingIncoming = false
    private var inLogId: String? = null
    private var inNumber: String? = null
    private var inStartMs: Long = 0L
    private var inConnectedMs: Long = 0L
    private var inRecordPath: String? = null

    fun acceptIncomingCall() {
        val call = incomingCall ?: core?.currentCall ?: return
        // Claim the voice-call audio session BEFORE accepting. linphone builds the
        // call's audio graph as the media starts; if the device is still in
        // MODE_NORMAL at that moment (the usual case for a call answered from the
        // background / lock screen) the capture + earpiece path binds to the wrong
        // state and stays silent even though RTP is flowing. Setting
        // MODE_IN_COMMUNICATION + focus up front makes the graph initialise against
        // the voice-call route. It's re-applied at StreamsRunning too (idempotent).
        startAudioSession()
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
                RegistrationState.Ok -> {
                    // Login is done — now turn on plain STUN (no ICE) for media so the
                    // next call's SDP carries the phone's public address. Doing it here
                    // (not during REGISTER) keeps login fast while restoring two-way
                    // audio. ICE stays OFF because the PBX (UrOperator) ignores it and
                    // then sends RTP to our private address → silence both ways.
                    val stun = pendingMediaStun
                    if (stun != null && !mediaStunApplied) {
                        runCatching {
                            val nat = core.natPolicy ?: core.createNatPolicy()
                            nat.stunServer = stun
                            nat.isStunEnabled = true
                            nat.isIceEnabled = false
                            nat.isTurnEnabled = false
                            core.natPolicy = nat
                            mediaStunApplied = true
                        }
                    }
                    onState?.invoke("registered")
                }
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
                    incomingCall = call
                    val from = runCatching { call.remoteAddress?.username }.getOrNull()
                        ?: runCatching { call.remoteAddress?.asStringUriOnly() }.getOrNull() ?: "Unknown"
                    if (expectingOutbound) {
                        // Agent leg of an outbound click-to-call bridge (UrOperator) →
                        // auto-answer, don't ring. The ViewModel drives the outbound log.
                        onState?.invoke("ringing")
                        callState.value = "ringing"
                        acceptIncomingCall()
                    } else {
                        // Genuine inbound call → ring full-screen + log + arm recording.
                        callState.value = "ringing"
                        appContext?.let { ctx ->
                            runCatching { com.salesautocall.app.notify.IncomingCallNotifier.show(ctx, from) }
                        }
                        handlingIncoming = true
                        inNumber = from
                        inStartMs = System.currentTimeMillis()
                        inConnectedMs = 0L
                        inRecordPath = appContext?.let { java.io.File(it.cacheDir, "rec_in_$inStartMs.wav").absolutePath }
                        setRecordFile(inRecordPath)
                    }
                }
                Call.State.OutgoingProgress,
                Call.State.OutgoingRinging -> onState?.invoke("ringing")
                Call.State.Connected,
                Call.State.StreamsRunning -> {
                    appContext?.let { runCatching { com.salesautocall.app.notify.IncomingCallNotifier.cancel(it) } }
                    startAudioSession()
                    applyAudioRoute(core)
                    if (recordFile != null && !recordingActive) {
                        runCatching { call.startRecording() }.onSuccess { recordingActive = true }
                    }
                    onState?.invoke("connected")
                    callState.value = "connected"
                    // Create the inbound call_logs row once we know it connected.
                    if (handlingIncoming && inConnectedMs == 0L) inConnectedMs = System.currentTimeMillis()
                    if (handlingIncoming && inLogId == null) {
                        val num = inNumber ?: "Unknown"
                        val rec = inRecordPath != null
                        ioScope.launch {
                            runCatching { com.salesautocall.app.data.Repository.awaitSession() }
                            inLogId = runCatching {
                                com.salesautocall.app.data.Repository.logIncomingCloudCall(num, rec)
                            }.getOrNull()
                        }
                    }
                }
                Call.State.End,
                Call.State.Released,
                Call.State.Error -> {
                    appContext?.let { runCatching { com.salesautocall.app.notify.IncomingCallNotifier.cancel(it) } }
                    stopAudioSession()
                    if (recordingActive) {
                        runCatching { call.stopRecording() }
                        recordingActive = false
                    }
                    // Finalize a genuine inbound call: ensure it's logged + upload (or
                    // mark failed if there was no audio to record).
                    if (handlingIncoming) {
                        val logId = inLogId
                        val num = inNumber ?: "Unknown"
                        val path = inRecordPath
                        // Outcome: a call that reached StreamsRunning was answered;
                        // otherwise it's a missed (unanswered) inbound call. Talk time
                        // is measured from answer, not from when it started ringing.
                        val connected = inConnectedMs > 0
                        val dur = if (connected) ((System.currentTimeMillis() - inConnectedMs) / 1000).toInt() else 0
                        val outcome = if (connected) "connected" else "no_answer"
                        handlingIncoming = false; inLogId = null; inNumber = null; inRecordPath = null
                        inStartMs = 0L; inConnectedMs = 0L
                        setRecordFile(null)
                        ioScope.launch {
                            runCatching { com.salesautocall.app.data.Repository.awaitSession() }
                            val id = logId ?: runCatching {
                                com.salesautocall.app.data.Repository.logIncomingCloudCall(num, path != null)
                            }.getOrNull()
                            if (id != null) runCatching {
                                com.salesautocall.app.data.Repository.updateCallResult(id, outcome, dur)
                            }
                            if (id != null && path != null) {
                                val f = java.io.File(path)
                                if (f.exists() && f.length() > 44) {
                                    runCatching { com.salesautocall.app.data.Repository.uploadRecording(id, "sip", dur, f.readBytes()) }
                                } else {
                                    runCatching { com.salesautocall.app.data.Repository.markRecordingStatus(id, "failed") }
                                }
                                runCatching { f.delete() }
                            }
                        }
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
        // Safe default: no STUN/ICE. The real policy is chosen per server in
        // applyNatPolicy() during register() — STUN on for a public PBX behind
        // carrier NAT, off for a private PBX reached over VPN.
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
        applyNatPolicy(c, server)
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

    /**
     * Chooses NAT traversal per server. On a **public** PBX (e.g. uroperator)
     * reached over mobile data the phone sits behind carrier-grade NAT, so the
     * SDP must advertise the phone's *public* address or the PBX sends the audio
     * into a black hole — that's the "connected but no voice either way" symptom.
     * Plain STUN makes linphone discover and advertise that public address (the
     * same non-ICE traversal Zoiper uses, which has working audio here). But STUN
     * is NOT turned on here: enabling it during REGISTER stalls login on some
     * carriers ("Logging in…" forever). Instead we only record the STUN server in
     * [pendingMediaStun] and flip STUN on after the account registers (see
     * onAccountRegistrationStateChanged) — fast login *and* two-way audio.
     *
     * ICE/TURN stay off (UrOperator ignores ICE and then sends RTP to our private
     * address → silence). On a **private** PBX reached over VPN (a 10.x/192.168
     * address) STUN is left off entirely — a STUN server is unreachable inside the
     * VPN and gathering candidates against it can make the PBX drop the call.
     */
    private fun applyNatPolicy(c: Core, server: String) {
        runCatching {
            val nat = c.natPolicy ?: c.createNatPolicy()
            val private = isPrivateAddress(server)
            // Always REGISTER with NAT traversal OFF: enabling STUN during login
            // stalled registration on some carriers (calls stuck on "Logging in…").
            nat.isStunEnabled = false
            nat.isIceEnabled = false
            nat.isTurnEnabled = false
            c.natPolicy = nat
            if (private) {
                // Private PBX over VPN — no STUN ever; the VPN already gives a
                // routable path for both signalling and media.
                pendingMediaStun = null
                mediaStunApplied = false
            } else {
                // Public PBX behind carrier NAT — defer plain STUN (no ICE) until
                // after the account registers (see onAccountRegistrationStateChanged).
                // Plain STUN rewrites the call SDP to the phone's public address so
                // audio flows both ways; this is the non-ICE traversal Zoiper uses,
                // which has working audio here. ICE is deliberately NOT used because
                // UrOperator ignores it and then sends RTP to our private address.
                pendingMediaStun = "stun.l.google.com:19302"
                mediaStunApplied = false
            }
        }
    }

    /** True for RFC-1918 / loopback hosts — i.e. a private PBX reached over VPN. */
    private fun isPrivateAddress(host: String): Boolean {
        val h = host.substringBefore(':').trim()
        if (h.equals("localhost", ignoreCase = true) || h.startsWith("127.")) return true
        if (h.startsWith("10.") || h.startsWith("192.168.")) return true
        // 172.16.0.0 – 172.31.255.255
        if (h.startsWith("172.")) {
            val second = h.split('.').getOrNull(1)?.toIntOrNull()
            if (second != null && second in 16..31) return true
        }
        return false
    }

    /**
     * Claim the voice-call audio session: request audio focus and switch the device
     * into MODE_IN_COMMUNICATION so the mic captures and the earpiece/speaker plays.
     * Required for an answered INCOMING call (launched from the background/lock
     * screen) to have two-way audio; harmless to re-run for an outgoing call.
     */
    private fun startAudioSession() {
        val ctx = appContext ?: return
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = am
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attrs)
                    .build()
                audioFocusRequest = req
                am.requestAudioFocus(req)
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            }
            am.mode = AudioManager.MODE_IN_COMMUNICATION
        }
    }

    /** Release the voice-call audio session when the call ends. */
    private fun stopAudioSession() {
        val am = audioManager ?: return
        runCatching {
            am.mode = AudioManager.MODE_NORMAL
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(null)
            }
        }
        audioFocusRequest = null
        audioManager = null
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
