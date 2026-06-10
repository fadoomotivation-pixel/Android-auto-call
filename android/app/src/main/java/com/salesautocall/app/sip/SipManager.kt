package com.salesautocall.app.sip

import android.content.Context
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
 * endpoint — it registers over SIP-UDP (exactly like Zoiper does), auto-answers
 * the leg that uroperator's click-to-call rings, and carries two-way audio
 * natively. This replaces the WebRTC/WebView softphone, which couldn't work
 * because the tenant's PBX only exposes SIP-UDP on a private address.
 *
 * All state changes are surfaced through [onState] as short status strings the
 * ViewModel maps to user-facing text:
 *   registering / registered / regfailed:<msg> / ringing / connected / ended
 */
object SipManager {

    private var core: Core? = null
    private var account: Account? = null
    private var domain: String = "sip.uroperator.com"

    /** Called on every meaningful state change. Set by the ViewModel. */
    var onState: ((String) -> Unit)? = null

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
                    // uroperator is ringing our extension — answer immediately.
                    onState?.invoke("ringing")
                    runCatching { call.accept() }
                }
                Call.State.OutgoingProgress,
                Call.State.OutgoingRinging -> onState?.invoke("ringing")
                Call.State.Connected,
                Call.State.StreamsRunning -> {
                    enableSpeaker(core)
                    onState?.invoke("connected")
                }
                Call.State.End,
                Call.State.Released -> onState?.invoke("ended")
                Call.State.Error -> onState?.invoke("callerror:$message")
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
        c.start()
        core = c
        return c
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

        val acc = c.createAccount(params)
        c.addAccount(acc)
        c.defaultAccount = acc
        account = acc
    }

    /** Places a direct outbound call to [number] on the registered domain. */
    fun call(number: String) {
        val c = core ?: return
        c.invite("sip:$number@$domain")
    }

    fun setMuted(muted: Boolean) {
        core?.isMicEnabled = !muted
    }

    fun hangup() {
        val c = core ?: return
        c.currentCall?.terminate() ?: c.terminateAllCalls()
    }

    /** Ends the call (if any) and tears down registration (removing the account
     *  sends an un-REGISTER to the PBX). */
    fun stop() {
        runCatching { hangup() }
        val c = core ?: return
        runCatching { c.clearAccounts() }
        runCatching { c.clearAllAuthInfo() }
        account = null
    }

    private fun enableSpeaker(c: Core) {
        // Route audio to the loudspeaker so it behaves like a phone call on speaker.
        val speaker = c.audioDevices.firstOrNull { it.type == AudioDevice.Type.Speaker }
        if (speaker != null) c.outputAudioDevice = speaker
    }
}
