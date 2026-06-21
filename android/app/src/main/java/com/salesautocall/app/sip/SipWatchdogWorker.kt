package com.salesautocall.app.sip

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.salesautocall.app.data.AppPrefs
import java.util.concurrent.TimeUnit

/**
 * Periodic safety net that re-starts the SIP foreground service if it isn't
 * running. Aggressive OEM battery managers (Xiaomi/Oppo/Vivo/Samsung) kill
 * foreground services even with START_STICKY; this watchdog (plus the
 * onTaskRemoved restart and BootReceiver) brings the inbound-call listener back
 * so calls keep arriving. It only acts when the rep has opted in and has creds.
 *
 * Note: code can't fully defeat OEM killers — the user must also keep the app's
 * "Autostart" enabled and battery optimization off (we prompt for both).
 */
class SipWatchdogWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (AppPrefs.getIncomingEnabled(ctx) &&
            AppPrefs.getAgentId(ctx).isNotBlank() &&
            AppPrefs.getSipPassword(ctx).isNotBlank()
        ) {
            // start() is a no-op if already running; otherwise it revives the service
            // and re-registers SIP from prefs.
            runCatching { SipBackgroundService.start(ctx) }
        }
        return Result.success()
    }

    companion object {
        private const val NAME = "SipWatchdog"

        /** Schedules the watchdog (every 15 min — WorkManager's minimum period). */
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<SipWatchdogWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
