package com.possystem.paymentforwarder

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// The actual "sensor" — bound by the OS once the owner grants Notification Access
// (MainActivity's button deep-links to that system settings screen). Every notification
// posted anywhere on the phone passes through onNotificationPosted; this only acts on the
// ones from apps the owner explicitly selected (Prefs.monitoredPackages, picked from a
// list of their own installed apps — see MainActivity), everything else is ignored
// immediately with no network call at all.
//
// Deliberately dumb: no attempt is made here to parse the amount or decide whether this
// looks like a payment — that's ExpressBackend/Sevices/PaymentNotifications' job (a
// pluggable per-app parser + the same matching engine the manual "Mark as Paid" button's
// confirmIntent() goes through). This service's only responsibility is "forward the raw
// text of anything from a watched app," which keeps it simple and means fixing/tuning a
// parser later never requires reinstalling anything on this phone.
class NotificationForwarderService : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured()) return
        if (sbn.packageName !in prefs.monitoredPackages) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        if (text.isNullOrBlank()) return // nothing to forward — e.g. a group-summary notification

        val packageName = sbn.packageName
        val postedAt = sbn.postTime

        scope.launch {
            val result = ForwarderApi.forwardNotification(
                serverUrl = prefs.serverUrl,
                secret = prefs.secret,
                packageName = packageName,
                title = title,
                text = text,
                postedAt = postedAt
            )
            val summary = if (result.success) "OK (${result.statusCode}): ${result.body}" else "FAILED (${result.statusCode}): ${result.body}"
            Log.i(TAG, "Forwarded notification from $packageName -> $summary")
            prefs.lastForwardResult = "${java.util.Date()}: $summary"
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Notification listener connected")
    }

    companion object {
        private const val TAG = "NotifForwarder"
    }
}
