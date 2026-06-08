package com.salesautocall.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class SalesAutoCallApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createDialerChannel()
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

    companion object {
        const val DIALER_CHANNEL_ID = "auto_dialer"
    }
}
