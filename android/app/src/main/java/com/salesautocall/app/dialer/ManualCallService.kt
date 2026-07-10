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
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.salesautocall.app.SalesAutoCallApp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Repository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.time.Instant

/**
 * Places a single, manually-dialed SIM call and — like the auto-dialer — watches
 * the telephony state to record it (best-effort), infer an outcome from the talk
 * time, then log the call and upload the recording. Used by the in-app keypad.
 */
class ManualCallService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val stateChannel = Channel<Int>(Channel.UNLIMITED)
    private lateinit var telephonyManager: TelephonyManager
    private var telephonyCallback: TelephonyCallback? = null
    private var legacyListener: PhoneStateListener? = null
    private var job: Job? = null
    private var leadName: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        telephonyManager = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
        registerListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val phone = intent?.getStringExtra(EXTRA_PHONE)
        if (phone.isNullOrBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }
        val companyId = intent.getStringExtra(EXTRA_COMPANY_ID)
        val salespersonId = intent.getStringExtra(EXTRA_SALESPERSON_ID)
        val record = intent.getBooleanExtra(EXTRA_RECORD, true)
        leadName = intent.getStringExtra(EXTRA_NAME)
        runCatching {
            androidx.core.app.ServiceCompat.startForeground(this, NOTIF_ID, notification("Calling $phone…"), callFgsType())
        }.onFailure {
            runCatching { startForeground(NOTIF_ID, notification("Calling $phone…")) }
        }
        if (job?.isActive != true) {
            job = scope.launch { runCall(phone, companyId, salespersonId, record) }
        }
        return START_NOT_STICKY
    }

    private suspend fun runCall(phone: String, companyId: String?, salespersonId: String?, record: Boolean) {
        while (stateChannel.tryReceive().isSuccess) { /* drain */ }
        val startedAt = Instant.now()
        var durationSec = 0
        var outcome = "failed"
        var recordingPath: String? = null

        // Prefer the phone's native both-sides recording; MediaRecorder
        // (mic-only) is the fallback when no native folder is set.
        val useNative = record && NativeRecordingHarvester.isConfigured(this@ManualCallService)
        SimCallMonitor.begin(phone, name = leadName, nativeRec = useNative)

        if (placeCall(phone)) {
            val wentOffhook = withTimeoutOrNull(OFFHOOK_TIMEOUT_MS) {
                awaitState(TelephonyManager.CALL_STATE_OFFHOOK)
            } != null
            if (!wentOffhook) {
                outcome = "no_answer"
            } else {
                var recStarted = false
                if (record && !useNative) {
                    recStarted = runCatching { SimRecorder.start(this) }.getOrDefault(false)
                }
                SimCallMonitor.onActive(recording = recStarted, speakerForced = recStarted && SimRecorder.usedSpeaker)
                // The phone's native in-call screen stays in front — no floating
                // cockpit or forced bring-to-front (that was the laggy part).
                awaitState(TelephonyManager.CALL_STATE_IDLE)
                durationSec = (Instant.now().epochSecond - startedAt.epochSecond).toInt()
                outcome = if (durationSec >= CONNECTED_THRESHOLD_SEC) "connected" else "no_answer"
                // Manual REC toggle may have stopped (and stashed) the recorder already.
                val micPath = runCatching { SimRecorder.stop() }.getOrNull()
                    ?: SimCallMonitor.takeManualRecording()
                // Native mode never runs the mic recorder, so harvest for any call
                // with a few seconds of talk — not only ones past the "connected"
                // threshold — so a short but real conversation the phone recorded
                // isn't dropped. The 3s floor skips instant no-answers (whose 9s
                // harvest poll would otherwise find nothing).
                recordingPath = when {
                    useNative && durationSec >= NATIVE_HARVEST_MIN_SEC -> harvestNative(startedAt, phone) ?: micPath
                    else -> micPath
                }
            }
        }
        SimCallMonitor.end(this)
        // Persist BEFORE stopping — stopSelf() cancels this scope, and a launched
        // persist coroutine used to die mid-insert (calls vanished from history).
        persist(phone, companyId, salespersonId, startedAt, durationSec, outcome, recordingPath)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** Stages the OEM's native recording as a cache file for the shared uploader. */
    private suspend fun harvestNative(startedAt: Instant, phone: String): String? {
        val bytes = runCatching {
            NativeRecordingHarvester.harvest(this@ManualCallService, startedAt.toEpochMilli(), phone)
        }.getOrNull() ?: return null
        return runCatching {
            File(cacheDir, "native_${System.currentTimeMillis()}.m4a").also { it.writeBytes(bytes) }.absolutePath
        }.getOrNull()
    }

    /** Runs to completion even while the service shuts down (non-cancellable). */
    private suspend fun persist(
        phone: String, companyId: String?, salespersonId: String?,
        startedAt: Instant, durationSec: Int, outcome: String, recordingPath: String?,
    ) {
        kotlinx.coroutines.withContext(Dispatchers.IO + kotlinx.coroutines.NonCancellable) {
            runCatching {
                val company = companyId ?: Repository.myCompany()?.id ?: return@runCatching
                val sales = salespersonId ?: Repository.currentUserId() ?: return@runCatching
                val logId = Repository.logCall(
                    CallLog(
                        companyId = company,
                        salespersonId = sales,
                        phone = phone,
                        outcome = outcome,
                        startedAt = startedAt.toString(),
                        endedAt = Instant.now().toString(),
                        durationSeconds = durationSec,
                        recordingStatus = if (recordingPath != null) "uploading" else "none",
                        recordingSource = if (recordingPath != null) "sim" else null,
                    ),
                )
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

    private suspend fun awaitState(target: Int) {
        while (true) if (stateChannel.receive() == target) return
    }

    private fun placeCall(phone: String): Boolean {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        return try {
            fun buildIntent(withPackage: Boolean) = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
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
        (getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager).defaultDialerPackage
    }.getOrNull()

    private fun registerListener() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) { stateChannel.trySend(state) }
            }
            telephonyCallback = cb
            telephonyManager.registerTelephonyCallback(mainExecutor, cb)
        } else {
            @Suppress("DEPRECATION")
            val l = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) { stateChannel.trySend(state) }
            }
            legacyListener = l
            @Suppress("DEPRECATION")
            telephonyManager.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
        }
    }

    /** phoneCall + microphone FGS types so SIM-call recording is allowed on Android 14+. */
    private fun callFgsType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        else 0

    private fun notification(text: String): Notification =
        NotificationCompat.Builder(this, SalesAutoCallApp.DIALER_CHANNEL_ID)
            .setContentTitle("Call in progress")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setOngoing(true)
            .build()

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { telephonyManager.unregisterTelephonyCallback(it) }
        } else {
            @Suppress("DEPRECATION")
            legacyListener?.let { telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE) }
        }
        job?.cancel()
        scope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }

    companion object {
        private const val NOTIF_ID = 4343
        private const val OFFHOOK_TIMEOUT_MS = 30_000L
        private const val CONNECTED_THRESHOLD_SEC = 8
        private const val NATIVE_HARVEST_MIN_SEC = 3
        private const val EXTRA_PHONE = "phone"
        private const val EXTRA_COMPANY_ID = "company_id"
        private const val EXTRA_SALESPERSON_ID = "salesperson_id"
        private const val EXTRA_RECORD = "record"
        private const val EXTRA_NAME = "name"

        fun dial(
            context: Context, phone: String, companyId: String?, salespersonId: String?,
            record: Boolean, name: String? = null,
        ) {
            val i = Intent(context, ManualCallService::class.java)
                .putExtra(EXTRA_PHONE, phone)
                .putExtra(EXTRA_COMPANY_ID, companyId)
                .putExtra(EXTRA_SALESPERSON_ID, salespersonId)
                .putExtra(EXTRA_RECORD, record)
                .putExtra(EXTRA_NAME, name)
            context.startService(i)
        }
    }
}
