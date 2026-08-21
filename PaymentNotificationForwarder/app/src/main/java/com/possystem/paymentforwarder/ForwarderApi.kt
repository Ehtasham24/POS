package com.possystem.paymentforwarder

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

// Plain HttpURLConnection on purpose — no OkHttp/Retrofit — this app makes exactly two
// kinds of call (forward a notification, send a heartbeat), both simple POSTs, so a real
// HTTP client library would be more dependency than the job needs. Every call is a plain
// blocking request; callers (NotificationForwarderService, HeartbeatWorker) are already
// off the main thread (a NotificationListenerService callback and a WorkManager worker,
// respectively) so no extra threading is needed here.
object ForwarderApi {
    private const val TAG = "ForwarderApi"

    data class Result(val success: Boolean, val statusCode: Int, val body: String)

    private fun post(urlString: String, secret: String, jsonBody: String): Result {
        return try {
            val url = URL(urlString)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-Forwarder-Secret", secret)
            conn.outputStream.use { it.write(jsonBody.toByteArray(StandardCharsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
            conn.disconnect()
            Result(code in 200..299, code, body)
        } catch (e: Exception) {
            Log.w(TAG, "Request to $urlString failed: ${e.message}")
            Result(false, -1, e.message ?: "network error")
        }
    }

    // packageName/title/text/postedAt map straight onto
    // Controller/paymentNotificationController.js's ReceiveNotification body shape.
    fun forwardNotification(
        serverUrl: String,
        secret: String,
        packageName: String,
        title: String?,
        text: String,
        postedAt: Long
    ): Result {
        val json = JSONObject()
            .put("packageName", packageName)
            .put("title", title ?: "")
            .put("text", text)
            .put("postedAt", postedAt)
        return post("$serverUrl/api/bank-payments/webhook/notification", secret, json.toString())
    }

    fun sendHeartbeat(serverUrl: String, secret: String): Result {
        return post("$serverUrl/api/bank-payments/webhook/heartbeat", secret, "{}")
    }
}
