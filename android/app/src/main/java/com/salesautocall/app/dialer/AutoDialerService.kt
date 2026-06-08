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

    private fun startRun() {
        startForeground(NOTIF_ID, buildNotification("Starting auto-dial…"))
        if (loopJob?.isActive == true) return
        loopJob = scope.launch { runQueue() }
    }

    private suspend fun runQueue() {
        DialerController.update { it.copy(isRunning = true, finished = false) }
        val queue = DialerController.queue
        val cfg = DialerController.config

        for ((i, contact) in queue.withIndex()) {
            DialerController.update {
                it.copy(currentName = contact.name, currentPhone = contact.phone)
            }
            updateNotification("Calling ${contact.name ?: contact.phone}  (${i + 1}/${queue.size})")

            // Drain any stale states before we dial.
            while (stateChannel.tryReceive().isSuccess) { /* discard */ }

            val startedAt = Instant.now()
            val placed = placeCall(contact.phone, cfg.simSlot)
            var outcome: String
            var durationSec = 0

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
                    // Now wait for it to return to idle = call ended.
                    awaitState(TelephonyManager.CALL_STATE_IDLE)
                    durationSec = (Instant.now().epochSecond - startedAt.epochSecond).toInt()
                    outcome = if (durationSec >= cfg.connectedThresholdSeconds) "connected" else "no_answer"
                }
            }
            val endedAt = Instant.now()

            persistResult(contact.id, contact, startedAt, endedAt, durationSec, outcome, cfg.simSlot)

            DialerController.update {
                it.copy(completed = i + 1, lastOutcome = outcome)
            }

            if (i < queue.lastIndex) delay(cfg.gapSeconds * 1000L)
        }

        DialerController.update { it.copy(isRunning = false, finished = true, currentName = null, currentPhone = null) }
        updateNotification("Auto-dial finished — ${queue.size} calls")
        stopForeground(STOP_FOREGROUND_DETACH)
    }

    private fun persistResult(
        contactId: String?,
        contact: com.salesautocall.app.data.Contact,
        startedAt: Instant,
        endedAt: Instant,
        durationSec: Int,
        outcome: String,
        simSlot: Int?,
    ) {
        scope.launch(Dispatchers.IO) {
            runCatching {
                Repository.logCall(
                    CallLog(
                        companyId = contact.companyId,
                        salespersonId = contact.salespersonId ?: (Repository.currentUserId() ?: return@runCatching),
                        contactId = contactId,
                        phone = contact.phone,
                        outcome = outcome,
                        startedAt = startedAt.toString(),
                        endedAt = endedAt.toString(),
                        durationSeconds = durationSec,
                        simSlot = simSlot,
                    ),
                )
                contactId?.let {
                    val newStatus = if (outcome == "connected") "called" else "no_answer"
                    Repository.updateContactStatus(it, newStatus)
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
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                phoneAccountForSlot(simSlot)?.let {
                    putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
                }
            }
            startActivity(intent)
            true
        } catch (e: SecurityException) {
            false
        }
    }

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

        fun start(context: Context) {
            val intent = Intent(context, AutoDialerService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(Intent(context, AutoDialerService::class.java).setAction(ACTION_STOP))
        }
    }
}
