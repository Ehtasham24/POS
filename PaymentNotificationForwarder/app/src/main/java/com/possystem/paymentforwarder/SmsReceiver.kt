package com.possystem.paymentforwarder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// The SMS counterpart to NotificationForwarderService — same "forward raw text, let the
// backend parse/match/confirm" philosophy, just triggered by a different Android signal.
// SMS is read via a dedicated BroadcastReceiver rather than through
// NotificationForwarderService's NotificationListenerService, because the notification
// banner Android shows for an incoming text can be truncated or grouped ("3 new
// messages") — this receiver gets the SMS_RECEIVED broadcast's full, un-truncated body
// directly instead, at the cost of needing its own RECEIVE_SMS permission.
//
// Deliberately opt-in, not blanket: only SMS from a sender the owner explicitly added to
// Prefs.monitoredSmsSenders get forwarded (mirrors NotificationForwarderService's own
// `sbn.packageName !in prefs.monitoredPackages` gate) — personal texts on this phone never
// leave the device just because they don't happen to parse as a payment. An empty
// allowlist means the SMS channel is effectively off, same "off until configured" shape
// as Prefs.isConfigured() already has for the whole app.
class SmsReceiver : BroadcastReceiver() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = Prefs(context.applicationContext)
        if (!prefs.isConfigured()) return
        val monitoredSenders = prefs.monitoredSmsSenders
        if (monitoredSenders.isEmpty()) return

        // A single logical SMS can arrive as several PDU parts (long messages get split by
        // the carrier) — getMessagesFromIntent returns one SmsMessage per part, in order.
        // Group by sender and concatenate bodies to reconstruct the full text, rather than
        // forwarding (and trying to parse) each fragment separately.
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val bodyBySender = LinkedHashMap<String, StringBuilder>()
        val timestampBySender = HashMap<String, Long>()
        for (msg in messages) {
            val sender = msg.originatingAddress ?: continue
            bodyBySender.getOrPut(sender) { StringBuilder() }.append(msg.messageBody ?: "")
            timestampBySender.putIfAbsent(sender, msg.timestampMillis)
        }

        val toForward = bodyBySender.filterKeys { it in monitoredSenders }
        if (toForward.isEmpty()) return

        // goAsync() tells the OS this receiver isn't finished when onReceive returns, so
        // the process isn't torn down before the network call(s) below complete. A plain
        // fire-and-forget coroutine (the pattern NotificationForwarderService uses) is
        // safe there because that code runs inside a long-lived bound Service — a
        // manifest-registered BroadcastReceiver has no such lifetime guarantee on its own.
        val pendingResult = goAsync()
        scope.launch {
            try {
                for ((sender, body) in toForward) {
                    val fullText = body.toString()
                    if (fullText.isBlank()) continue

                    // Synthetic packageName, not a real Android package — the backend only
                    // ever treats packageName as an opaque parser-lookup key (see
                    // ExpressBackend/Sevices/PaymentNotifications/parsers/index.js), so
                    // "sms:<sender>" slots into the exact same lookup a real app's package
                    // name would, and lets a tuned per-sender parser be registered later
                    // the same way one gets registered per-app.
                    val result = ForwarderApi.forwardNotification(
                        serverUrl = prefs.serverUrl,
                        secret = prefs.secret,
                        packageName = "sms:$sender",
                        title = sender,
                        text = fullText,
                        postedAt = timestampBySender[sender] ?: System.currentTimeMillis()
                    )
                    val summary = if (result.success) "OK (${result.statusCode}): ${result.body}" else "FAILED (${result.statusCode}): ${result.body}"
                    Log.i(TAG, "Forwarded SMS from $sender -> $summary")
                    prefs.lastForwardResult = "${java.util.Date()}: $summary"
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
