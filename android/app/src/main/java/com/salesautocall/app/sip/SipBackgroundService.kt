package com.salesautocall.app.sip

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.salesautocall.app.R
import com.salesautocall.app.SalesAutoCallApp

class SipBackgroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIF_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            SipManager.stop()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Ensure SIP is running and has context even if the UI was killed
        SipManager.appContext = applicationContext
        SipManager.registerFromPrefs(applicationContext)
        return START_STICKY
    }

    /**
     * The user swiped the app off Recents. Many OEMs kill our service along with
     * the task; if the rep is listening for inbound calls, schedule an immediate
     * restart so the phone keeps ringing for incoming calls.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (com.salesautocall.app.data.AppPrefs.getIncomingEnabled(applicationContext)) {
            val restart = Intent(applicationContext, SipBackgroundService::class.java).setAction(ACTION_START)
            val flags = PendingIntent.FLAG_ONE_SHOT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            val pi = PendingIntent.getService(applicationContext, 1, restart, flags)
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            runCatching { am.set(AlarmManager.RTC, System.currentTimeMillis() + 1500, pi) }
        }
        super.onTaskRemoved(rootIntent)
    }

    private fun buildNotification(): Notification {
        val channelId = SalesAutoCallApp.DIALER_CHANNEL_ID
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm?.getNotificationChannel(channelId) == null) {
                nm?.createNotificationChannel(
                    NotificationChannel(channelId, "SIP Service", NotificationManager.IMPORTANCE_LOW)
                )
            }
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Available for Calls")
            .setContentText("Listening for inbound UrOperator calls...")
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_START = "com.salesautocall.app.sip.START"
        const val ACTION_STOP = "com.salesautocall.app.sip.STOP"
        private const val NOTIF_ID = 5252

        fun start(context: Context) {
            val intent = Intent(context, SipBackgroundService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(Intent(context, SipBackgroundService::class.java).setAction(ACTION_STOP))
        }
    }
}
