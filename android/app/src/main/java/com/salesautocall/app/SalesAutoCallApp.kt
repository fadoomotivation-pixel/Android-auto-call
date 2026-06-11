package com.salesautocall.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.salesautocall.app.data.AppPrefs
import java.io.PrintWriter
import java.io.StringWriter

class SalesAutoCallApp : Application() {

    override fun onCreate() {
        super.onCreate()
        installCrashHandler()
        createDialerChannel()
        createFollowUpChannel()
    }

    /** Saves the stack trace of any uncaught crash so it can be shown on next launch. */
    private fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                val sw = StringWriter()
                throwable.printStackTrace(PrintWriter(sw))
                AppPrefs.setLastCrash(this, sw.toString().take(4000))
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    private fun createDialerChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                DIALER_CHANNEL_ID,
                getString(R.string.dialer_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.dialer_channel_desc)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    /** Heads-up channel for "your follow-up callback is due now" reminders. */
    private fun createFollowUpChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                com.salesautocall.app.notify.FollowUpReminder.CHANNEL_ID,
                getString(R.string.followup_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = getString(R.string.followup_channel_desc)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    companion object {
        const val DIALER_CHANNEL_ID = "auto_dialer"
    }
}
