package com.salesautocall.app.dialer

import android.Manifest
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.salesautocall.app.R
import com.salesautocall.app.SalesAutoCallApp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Repository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.time.Instant

/**
 * Foreground service that drives the auto-dial queue:
 *
 *  for each contact:
 *    1. place an outgoing call through the SIM (ACTION_CALL)
 *    2. watch the telephony state to know when the call ends
 *    3. infer an outcome from the talk duration
 *    4. log the call + advance the contact's status in Supabase
 *    5. pause [gapSeconds], then dial the next one
 *
 * NOTE on outcome detection: Android does not expose, for *outgoing* calls,
 * whether the remote party actually answered. We approximate: a call shorter
 * than [DialerConfig.connectedThresholdSeconds] is logged as "no_answer",
 * otherwise "connected". The salesperson can correct any call afterwards.
 */
class AutoDialerService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var loopJob: Job? = null

    /** Telephony states pushed by the listener and drained by the dial loop. */
    private val stateChannel = Channel<Int>(Channel.UNLIMITED)

    private lateinit var telephonyManager: TelephonyManager
    private var telephonyCallback: TelephonyCallback? = null
    private var legacyListener: PhoneStateListener? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        telephonyManager = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
        registerCallStateListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopRun()
                return START_NOT_STICKY
            }
            else -> startRun()
        }
        return START_STICKY
    }

    /** phoneCall + microphone FGS types so SIM-call recording is allowed on Android 14+. */
    private fun callFgsType(): Int =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R)
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        else 0

    private fun startRun() {
        // Best-effort foreground promotion. On some OEMs / Android 14 the phoneCall
        // FGS type can be restricted; never let that crash the app — the dial loop
        // still runs while the app is in the foreground.
        runCatching {
            androidx.core.app.ServiceCompat.startForeground(this, NOTIF_ID, buildNotification("Starting auto-dial…"), callFgsType())
        }.onFailure {
            runCatching { startForeground(NOTIF_ID, buildNotification("Starting auto-dial…")) }
        }
        if (loopJob?.isActive == true) return
        loopJob = scope.launch { runQueue() }
    }

    private suspend fun runQueue() {
        DialerController.update {
            it.copy(isRunning = true, finished = false, sessionStartMillis = System.currentTimeMillis())
        }
        val queue = DialerController.queue
        val cfg = DialerController.config

        for ((i, contact) in queue.withIndex()) {
            // Wait here if the campaign is paused (manual pause or after-call review).
            DialerController.awaitResume()

            DialerController.update {
                it.copy(currentName = contact.name, currentPhone = contact.phone)
            }
            updateNotification("Calling ${contact.name ?: contact.phone}  (${i + 1}/${queue.size})")

            // Drain any stale states before we dial.
            while (stateChannel.tryReceive().isSuccess) { /* discard */ }

            val startedAt = Instant.now()
            // Prefer the phone's OWN native recording (both sides, real
            // quality) — the OS records, we harvest. Only fall back to the
            // mic-only MediaRecorder when no native folder is configured.
            val useNative = cfg.recordingEnabled &&
                NativeRecordingHarvester.isConfigured(this@AutoDialerService)
            SimCallMonitor.begin(contact.phone, contact.name, nativeRec = useNative)
            val placed = placeCall(contact.phone, cfg.simSlot)
            var outcome: String
            var durationSec = 0
            var recordingPath: String? = null

            if (!placed) {
                outcome = "failed"
            } else {
                // Wait for the call to go off-hook (dialing/active); cap the wait.
                val wentOffhook = withTimeoutOrNull(OFFHOOK_TIMEOUT_MS) {
                    awaitState(TelephonyManager.CALL_STATE_OFFHOOK)
                } != null

                if (!wentOffhook) {
                    outcome = "no_answer"
                } else {
                    var recStarted = false
                    if (cfg.recordingEnabled && !useNative) {
                        recStarted = runCatching { SimRecorder.start(this) }.getOrDefault(false)
                    }
                    SimCallMonitor.onActive(recording = recStarted, speakerForced = recStarted && SimRecorder.usedSpeaker)
                    // The phone's native in-call screen stays in front — we no longer
                    // float a cockpit over it or yank the CRM forward (that was laggy).
                    // Now wait for it to return to idle = call ended.
                    awaitState(TelephonyManager.CALL_STATE_IDLE)
                    durationSec = (Instant.now().epochSecond - startedAt.epochSecond).toInt()
                    outcome = if (durationSec >= cfg.connectedThresholdSeconds) "connected" else "no_answer"
                    // Manual REC toggle may have stopped (and stashed) the recorder already.
                    val micPath = runCatching { SimRecorder.stop() }.getOrNull()
                        ?: SimCallMonitor.takeManualRecording()
                    // Native mode never runs the mic recorder, so harvest for any
                    // call with a few seconds of talk (not only ones past the
                    // "connected" threshold) so a short but real conversation the
                    // phone recorded isn't dropped. The 3s floor skips instant
                    // no-answers, whose harvest poll would find nothing.
                    recordingPath = when {
                        useNative && durationSec >= NATIVE_HARVEST_MIN_SEC ->
                            harvestNative(startedAt, contact.phone) ?: micPath
                        else -> micPath
                    }
                }
            }
            SimCallMonitor.end(this)
            val endedAt = Instant.now()

            persistResult(contact.id, contact, startedAt, endedAt, durationSec, outcome, cfg.simSlot, recordingPath)

            val wasDialed = placed
            val talked = durationSec
            DialerController.update {
                it.copy(
                    completed = i + 1,
                    lastOutcome = outcome,
                    dialedCount = it.dialedCount + if (wasDialed) 1 else 0,
                    talkSeconds = it.talkSeconds + talked,
                    lastContactId = contact.id,
                    lastContactName = contact.name,
                    lastContactPhone = contact.phone,
                )
            }

            // Pause for quick review (disposition / WhatsApp) after each call.
            if (cfg.reviewAfterEachCall && i < queue.lastIndex) {
                DialerController.pause()
                updateNotification("Paused — review ${contact.name ?: contact.phone}")
            } else if (i < queue.lastIndex) {
                delay(cfg.gapSeconds * 1000L)
            }
        }

        DialerController.update {
            it.copy(
                isRunning = false,
                finished = true,
                currentName = null,
                currentPhone = null,
                sessionEndMillis = System.currentTimeMillis(),
            )
        }
        updateNotification("Auto-dial finished — ${queue.size} calls")
        stopForeground(STOP_FOREGROUND_DETACH)
    }

    /** Pulls the OEM's native recording for the just-ended call and stages it as a
     *  cache file so it flows through the same upload path as a mic recording. */
    private suspend fun harvestNative(startedAt: Instant, phone: String): String? {
        val bytes = runCatching {
            NativeRecordingHarvester.harvest(this@AutoDialerService, startedAt.toEpochMilli(), phone)
        }.getOrNull() ?: return null
        return runCatching {
            File(cacheDir, "native_${System.currentTimeMillis()}.m4a").also { it.writeBytes(bytes) }.absolutePath
        }.getOrNull()
    }

    private fun persistResult(
        contactId: String?,
        contact: com.salesautocall.app.data.Contact,
        startedAt: Instant,
        endedAt: Instant,
        durationSec: Int,
        outcome: String,
        simSlot: Int?,
        recordingPath: String?,
    ) {
        // NonCancellable: a Stop tap (or service teardown) right after a call must
        // not kill the insert/upload mid-flight — that's how calls went missing.
        scope.launch(Dispatchers.IO + kotlinx.coroutines.NonCancellable) {
            runCatching {
                val logId = Repository.logCall(
                    CallLog(
                        companyId = contact.companyId,
                        salespersonId = contact.salespersonId ?: (Repository.currentUserId() ?: return@runCatching),
                        campaignId = contact.campaignId,
                        contactId = contactId,
                        phone = contact.phone,
                        outcome = outcome,
                        startedAt = startedAt.toString(),
                        endedAt = endedAt.toString(),
                        durationSeconds = durationSec,
                        simSlot = simSlot,
                        recordingStatus = if (recordingPath != null) "uploading" else "none",
                        recordingSource = if (recordingPath != null) "sim" else null,
                    ),
                )
                // The lead's stage is NOT written here, deliberately.
                //
                // This used to do, unconditionally:
                //     val newStatus = if (outcome == "connected") "called" else "no_answer"
                //     Repository.updateContactStatus(contactId, newStatus)
                //
                // with no look at where the lead already was. So auto-dialling a
                // customer who was Interested, at Site Visit, Negotiating or even
                // Booked dragged them back to "called" — a rep's recorded work,
                // erased by a machine that only knows whether a phone was
                // answered. 64 leads sit in those stages right now. It also
                // raced the after-call prompt: the service wrote its guess while
                // the rep was tapping "Interested" on screen, and whichever
                // landed last won.
                //
                // A call result is not a sales stage. The call log above is the
                // record of the attempt, and inserting it fires
                // apply_call_to_new_lead() (migration 0120), which applies the
                // one rule the whole platform shares: a lead still in the calling
                // pile moves to called / no_answer with the attempt counted, and
                // a lead whose rep has already said what happened is never
                // touched. Every call path — auto-dial, manual, cloud — gets that
                // same rule for free by simply not second-guessing it here.
                // Ship the recording (if any) to Drive via the edge function.
                if (logId != null && recordingPath != null) {
                    val f = File(recordingPath)
                    if (f.exists() && f.length() > 0) {
                        runCatching { Repository.uploadRecording(logId, "sim", durationSec, f.readBytes()) }
                        runCatching { f.delete() }
                    }
                }
            }
        }
    }

    /** Suspends until the telephony listener reports [target]. */
    private suspend fun awaitState(target: Int) {
        while (true) {
            val s = stateChannel.receive()
            if (s == target) return
        }
    }

    /**
     * Places an outgoing call. On dual-SIM devices a [simSlot] (0/1) selects the
     * subscription via its PhoneAccountHandle; otherwise the system default SIM
     * is used.
     */
    private fun placeCall(phone: String, simSlot: Int?): Boolean {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) return false

        return try {
            fun buildIntent(withPackage: Boolean) = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                phoneAccountForSlot(simSlot)?.let {
                    putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
                }
                // Force the device's default phone app so a SIP app (e.g. ZoiPer) can't
                // intercept the SIM call with an "Open with" chooser.
                if (withPackage) systemDialerPackage()?.let { pkg -> setPackage(pkg) }
            }
            try {
                startActivity(buildIntent(true))
            } catch (_: android.content.ActivityNotFoundException) {
                startActivity(buildIntent(false))
            }
            true
        } catch (e: SecurityException) {
            false
        }
    }

    private fun systemDialerPackage(): String? = runCatching {
        (getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage
    }.getOrNull()

    private fun phoneAccountForSlot(simSlot: Int?): android.telecom.PhoneAccountHandle? {
        if (simSlot == null) return null
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) return null
        return try {
            val telecom = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val subs = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val info = subs.activeSubscriptionInfoList?.firstOrNull { it.simSlotIndex == simSlot }
                ?: return null
            telecom.callCapablePhoneAccounts.firstOrNull { handle ->
                handle.id.contains(info.subscriptionId.toString())
            }
        } catch (e: SecurityException) {
            null
        }
    }

    // ---------- telephony listener ----------

    private fun registerCallStateListener() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    stateChannel.trySend(state)
                }
            }
            telephonyCallback = cb
            telephonyManager.registerTelephonyCallback(mainExecutor, cb)
        } else {
            @Suppress("DEPRECATION")
            val listener = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    stateChannel.trySend(state)
                }
            }
            legacyListener = listener
            @Suppress("DEPRECATION")
            telephonyManager.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
        }
    }

    private fun unregisterCallStateListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { telephonyManager.unregisterTelephonyCallback(it) }
        } else {
            @Suppress("DEPRECATION")
            legacyListener?.let { telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE) }
        }
    }

    private fun stopRun() {
        loopJob?.cancel()
        DialerController.update { it.copy(isRunning = false, finished = true) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        unregisterCallStateListener()
        loopJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }

    // ---------- notification ----------

    private fun buildNotification(text: String): Notification =
        NotificationCompat.Builder(this, SalesAutoCallApp.DIALER_CHANNEL_ID)
            .setContentTitle("Auto-dialing")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setOngoing(true)
            .build()

    private fun updateNotification(text: String) {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        ) return
        androidx.core.app.NotificationManagerCompat.from(this).notify(NOTIF_ID, buildNotification(text))
    }

    companion object {
        const val ACTION_START = "com.salesautocall.app.START"
        const val ACTION_STOP = "com.salesautocall.app.STOP"
        private const val NOTIF_ID = 4242
        private const val OFFHOOK_TIMEOUT_MS = 30_000L
        private const val NATIVE_HARVEST_MIN_SEC = 3

        fun start(context: Context) {
            // Plain startService (the app is in the foreground when the user taps
            // Start). The service promotes itself to foreground best-effort, so a
            // restricted FGS type can't trigger the "did not start in time" crash.
            val intent = Intent(context, AutoDialerService::class.java).setAction(ACTION_START)
            context.startService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, AutoDialerService::class.java).setAction(ACTION_STOP))
        }
    }
}
