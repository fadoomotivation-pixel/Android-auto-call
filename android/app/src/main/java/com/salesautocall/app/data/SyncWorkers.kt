package com.salesautocall.app.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
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
        val logConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        val logWork = PeriodicWorkRequestBuilder<CallLogSyncWorker>(1, TimeUnit.HOURS)
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
}
