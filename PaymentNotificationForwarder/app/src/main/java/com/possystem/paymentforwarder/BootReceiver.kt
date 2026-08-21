package com.possystem.paymentforwarder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Re-arms the heartbeat schedule after a reboot. Notification access itself doesn't need
// re-requesting here — Android rebinds a granted NotificationListenerService automatically
// once the OS finishes booting — this is purely a safety net for WorkManager's own
// schedule, which is usually boot-persistent already but this costs nothing extra to add.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            HeartbeatWorker.schedule(context)
        }
    }
}
