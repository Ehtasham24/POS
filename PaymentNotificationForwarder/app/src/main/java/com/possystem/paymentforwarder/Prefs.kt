package com.possystem.paymentforwarder

import android.content.Context

// Thin SharedPreferences wrapper — the only local config store this app has. serverUrl is
// the POS backend's LAN address on its dedicated plain-HTTP webhook port (see
// ExpressBackend/Server.js's comment on why that port exists — a phone can't be expected
// to trust the app's own HTTPS dev certificate), e.g. "http://192.168.1.5:4001". secret
// must match ExpressBackend/Development.env's NOTIFICATION_FORWARDER_SECRET exactly —
// typed in once here, checked by Middleware/requireForwarderSecret.js on every request.
class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("forwarder_prefs", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value.trimEnd('/')).apply()

    var secret: String
        get() = prefs.getString(KEY_SECRET, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SECRET, value).apply()

    // Which installed apps' notifications actually get forwarded — picked by the owner
    // from their own phone's installed-apps list (MainActivity's picker), not a hardcoded
    // guess at package names, since those aren't something worth guessing wrong on.
    var monitoredPackages: Set<String>
        get() = prefs.getStringSet(KEY_MONITORED_PACKAGES, emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet(KEY_MONITORED_PACKAGES, value).apply()

    var lastForwardResult: String
        get() = prefs.getString(KEY_LAST_RESULT, "") ?: ""
        set(value) = prefs.edit().putString(KEY_LAST_RESULT, value).apply()

    // Which SMS senders' texts actually get forwarded — same explicit-opt-in shape as
    // monitoredPackages above, just typed in by the owner (e.g. "JazzCash" or a shortcode
    // like "8080") rather than picked from a list, since there's no OS-level "list of
    // possible SMS senders" the way there is for installed apps. See SmsReceiver.kt.
    var monitoredSmsSenders: Set<String>
        get() = prefs.getStringSet(KEY_MONITORED_SMS_SENDERS, emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet(KEY_MONITORED_SMS_SENDERS, value).apply()

    fun isConfigured(): Boolean = serverUrl.isNotBlank() && secret.isNotBlank()

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_SECRET = "secret"
        private const val KEY_MONITORED_PACKAGES = "monitored_packages"
        private const val KEY_MONITORED_SMS_SENDERS = "monitored_sms_senders"
        private const val KEY_LAST_RESULT = "last_forward_result"
    }
}
