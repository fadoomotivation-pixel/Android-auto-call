package com.salesautocall.app.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.time.Instant
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/**
 * Hourly background job that pulls the dialer's new call recordings into the CRM
 * and lets the AI summarise them — all on its own, during working hours only.
 *
 * It runs every hour (WorkManager periodic) but does real work only between
 * 10 AM and 7 PM local time, so it never wakes the phone overnight. Each run
 * matches recent calls to files in the connected folder and uploads any it finds
 * (Repository.syncRecordings also kicks the AI summary for each new recording).
 */
class RecordingSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val hour = LocalTime.now().hour
        // Only 10 AM … 7 PM (19:00). Outside that, do nothing but stay scheduled.
        if (hour < START_HOUR || hour >= END_HOUR) return Result.success()
        return try {
            // Look back a couple of days so a missed run still catches up.
            val since = Instant.now().minus(2, ChronoUnit.DAYS).toString()
            Repository.syncRecordings(applicationContext, since)
            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }

    private companion object {
        const val START_HOUR = 10
        const val END_HOUR = 19
    }
}
