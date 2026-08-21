package com.possystem.paymentforwarder

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

// Periodic "I'm still alive and listening" ping — lets Controller/paymentNotificationController.js's
// GetForwarderStatus tell the owner (via the Pending Bank Payments page) when this phone
// has gone offline/been killed/lost notification access, instead of automatic confirmation
// just silently stopping with no visible signal that anything's wrong.
//
// 15 minutes is WorkManager's own minimum periodic interval (a hard OS-level floor, not a
// choice made here) — ExpressBackend's STALE_AFTER_MINUTES is set to 20 specifically to
// give one interval's worth of slack before flagging an outage.
class HeartbeatWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured()) return Result.success() // nothing configured yet — not a failure, just idle

        val result = ForwarderApi.sendHeartbeat(prefs.serverUrl, prefs.secret)
        // Retry on failure (a transient WiFi drop shouldn't need the owner to notice and
        // manually intervene) rather than giving up after one attempt — WorkManager's own
        // built-in backoff handles the retry timing.
        return if (result.success) Result.success() else Result.retry()
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "heartbeat"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
