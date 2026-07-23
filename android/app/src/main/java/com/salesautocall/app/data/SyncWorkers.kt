package com.salesautocall.app.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Single source of truth for the background sync jobs. Recording capture is the
 * revenue-critical path (commission rides on it), so these are scheduled from
 * BOTH app launch and device boot / app update — and they must keep running even
 * when the telecaller never opens the app.
 *
 * Hardening vs. the old inline setup:
 *  - Recording sync runs every 15 min (WorkManager's floor), not hourly, so a
 *    missed window is minutes of exposure, not an hour.
 *  - No "battery not low" constraint on recordings — a dying battery must not
 *    silently drop a recording. Only a network is required (the upload needs it).
 *  - Exponential backoff so a transient failure retries instead of waiting a
 *    whole period.
 *  - UPDATE (not KEEP) so existing installs pick up this tighter schedule on the
 *    next launch without a reinstall.
 */
object SyncWorkers {

    fun schedule(context: Context) {
        val wm = WorkManager.getInstance(context)

        // Call logs: a network is enough; skip on very low battery (non-critical).
        // Every 15 min (was hourly) so a lead's call reaches the CRM in minutes,
        // not up to an hour — the manager needs to see activity promptly.
        val logConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        val logWork = PeriodicWorkRequestBuilder<CallLogSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(logConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        wm.enqueueUniquePeriodicWork("CallLogSync", ExistingPeriodicWorkPolicy.UPDATE, logWork)

        // Recordings: the crucial one. Only a network is required — capture must
        // survive low battery. Every 15 min with fast backoff.
        val recConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val recWork = PeriodicWorkRequestBuilder<RecordingSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(recConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        wm.enqueueUniquePeriodicWork("RecordingSync", ExistingPeriodicWorkPolicy.UPDATE, recWork)
    }

    /**
     * Fire an IMMEDIATE one-off sync — call this the moment a call ends so the
     * log (and its recording, once the phone finishes writing the file) reaches
     * the CRM in seconds instead of waiting for the next 15-min window. Expedited
     * so the OS runs it right away; REPLACE so rapid back-to-back calls coalesce.
     */
    fun syncNow(context: Context) {
        val wm = WorkManager.getInstance(context)
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        val logNow = OneTimeWorkRequestBuilder<CallLogSyncWorker>()
            .setConstraints(net)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        wm.enqueueUniqueWork("CallLogSyncNow", ExistingWorkPolicy.REPLACE, logNow)

        val recNow = OneTimeWorkRequestBuilder<RecordingSyncWorker>()
            .setConstraints(net)
            .setInitialDelay(20, TimeUnit.SECONDS) // let the phone finish writing the recording file
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        wm.enqueueUniqueWork("RecordingSyncNow", ExistingWorkPolicy.REPLACE, recNow)
    }
}
