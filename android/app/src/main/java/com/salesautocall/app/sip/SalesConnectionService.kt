package com.salesautocall.app.sip

import android.content.Context
import android.net.Uri
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log

class SalesConnectionService : ConnectionService() {

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection {
        val connection = SalesConnection()
        connection.setInitializing()
        
        // Grab the incoming phone number passed from SipManager via TelecomManager
        val number = request?.extras?.getString(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS) ?: "Unknown"
        connection.setAddress(Uri.parse("tel:$number"), TelecomManager.PRESENTATION_ALLOWED)
        connection.setCallerDisplayName(number, TelecomManager.PRESENTATION_ALLOWED)
        
        connection.setRinging()
        
        // Store a reference so SipManager can update it when the call ends
        activeConnection = connection
        
        return connection
    }

    override fun onCreateIncomingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ) {
        super.onCreateIncomingConnectionFailed(connectionManagerPhoneAccount, request)
        Log.e("SalesConnectionSvc", "Failed to create incoming connection")
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection {
        // Only used if the app registers as a calling app for outbound dials via Telecom,
        // but currently AutoDialerService dials directly through the SIM Intent.
        return super.onCreateOutgoingConnection(connectionManagerPhoneAccount, request)
    }

    companion object {
        var activeConnection: SalesConnection? = null
        
        fun endCall(cause: DisconnectCause = DisconnectCause(DisconnectCause.REMOTE)) {
            activeConnection?.setDisconnected(cause)
            activeConnection?.destroy()
            activeConnection = null
        }
    }
}

class SalesConnection : Connection() {
    override fun onAnswer() {
        super.onAnswer()
        setActive()
        // Tell SipManager to accept the incoming Linphone call
        SipManager.acceptIncomingCall()
    }

    override fun onReject() {
        super.onReject()
        setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
        destroy()
        SipManager.hangup()
        SalesConnectionService.activeConnection = null
    }

    override fun onDisconnect() {
        super.onDisconnect()
        setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
        destroy()
        SipManager.hangup()
        SalesConnectionService.activeConnection = null
    }

    override fun onAbort() {
        super.onAbort()
        setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
        destroy()
        SipManager.hangup()
        SalesConnectionService.activeConnection = null
    }
}
