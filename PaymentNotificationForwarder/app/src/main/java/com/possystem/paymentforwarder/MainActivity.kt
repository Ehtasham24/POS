package com.possystem.paymentforwarder

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Single-screen setup UI — server URL + secret, the two permission grants Android requires
// (notification access is mandatory, battery-optimization exemption is strongly
// recommended so the OS doesn't kill NotificationForwarderService), a connection test, and
// the installed-apps picker that decides what Prefs.monitoredPackages actually is.
class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var statusText: TextView
    private lateinit var notificationAccessStatus: TextView
    private lateinit var smsPermissionStatus: TextView
    private lateinit var appsAdapter: InstalledAppsAdapter

    // Standard runtime-permission launcher — RECEIVE_SMS is "dangerous" (API 23+), unlike
    // notification access/battery exemption above, which are handled by deep-linking to a
    // system Settings screen instead. Only updates the status line here; SmsReceiver
    // re-checks Prefs.monitoredSmsSenders itself and no-ops until senders are configured
    // regardless of this permission's grant state.
    private val requestSmsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            refreshSmsPermissionStatus()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        val serverUrlInput = findViewById<EditText>(R.id.serverUrlInput)
        val secretInput = findViewById<EditText>(R.id.secretInput)
        statusText = findViewById(R.id.statusText)
        notificationAccessStatus = findViewById(R.id.notificationAccessStatus)
        smsPermissionStatus = findViewById(R.id.smsPermissionStatus)

        serverUrlInput.setText(prefs.serverUrl)
        secretInput.setText(prefs.secret)

        findViewById<Button>(R.id.saveButton).setOnClickListener {
            prefs.serverUrl = serverUrlInput.text.toString().trim()
            prefs.secret = secretInput.text.toString().trim()
            HeartbeatWorker.schedule(this)
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        }

        findViewById<Button>(R.id.notificationAccessButton).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.batteryButton).setOnClickListener {
            requestIgnoreBatteryOptimizations()
        }

        findViewById<Button>(R.id.testConnectionButton).setOnClickListener {
            testConnection(serverUrlInput.text.toString().trim(), secretInput.text.toString().trim())
        }

        val smsSendersInput = findViewById<EditText>(R.id.smsSendersInput)
        smsSendersInput.setText(prefs.monitoredSmsSenders.joinToString(", "))

        findViewById<Button>(R.id.smsPermissionButton).setOnClickListener {
            requestSmsPermission.launch(Manifest.permission.RECEIVE_SMS)
        }

        findViewById<Button>(R.id.saveSmsSendersButton).setOnClickListener {
            prefs.monitoredSmsSenders = smsSendersInput.text.toString()
                .split(",")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toSet()
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        }

        setupAppsList()

        findViewById<EditText>(R.id.appSearchInput).addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                appsAdapter.filter(s?.toString() ?: "")
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    override fun onResume() {
        super.onResume()
        refreshNotificationAccessStatus()
        refreshSmsPermissionStatus()
    }

    private fun refreshNotificationAccessStatus() {
        val enabled = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)
        notificationAccessStatus.text = if (enabled) {
            "Notification access: granted ✓"
        } else {
            "Notification access: NOT granted — tap the button below"
        }
    }

    private fun refreshSmsPermissionStatus() {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED
        smsPermissionStatus.text = if (granted) {
            "SMS permission: granted ✓"
        } else {
            "SMS permission: NOT granted — tap the button below"
        }
    }

    private fun requestIgnoreBatteryOptimizations() {
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !powerManager.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            intent.data = Uri.parse("package:$packageName")
            startActivity(intent)
        } else {
            Toast.makeText(this, "Already exempted from battery optimization", Toast.LENGTH_SHORT).show()
        }
    }

    private fun testConnection(serverUrl: String, secret: String) {
        if (serverUrl.isBlank() || secret.isBlank()) {
            Toast.makeText(this, "Enter server URL and secret first", Toast.LENGTH_SHORT).show()
            return
        }
        statusText.text = "Testing…"
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) { ForwarderApi.sendHeartbeat(serverUrl, secret) }
            statusText.text = if (result.success) {
                "✓ Connected — heartbeat accepted (HTTP ${result.statusCode})"
            } else {
                "✗ Failed (HTTP ${result.statusCode}): ${result.body}"
            }
        }
    }

    private fun setupAppsList() {
        val recyclerView = findViewById<RecyclerView>(R.id.appsRecyclerView)
        recyclerView.layoutManager = LinearLayoutManager(this)

        val apps = loadInstalledApps()
        val selected = prefs.monitoredPackages.toMutableSet()
        appsAdapter = InstalledAppsAdapter(apps, selected) { updated ->
            prefs.monitoredPackages = updated
        }
        recyclerView.adapter = appsAdapter
    }

    // Only apps with their own launcher entry — i.e. ones the owner would recognize as
    // "an app on my phone" (JazzCash, Easypaisa, a bank's app) — not the hundreds of
    // system/background packages Android also reports, which would make the picker
    // unusable and aren't ever going to send a "payment received" notification anyway.
    private fun loadInstalledApps(): List<AppInfo> {
        val pm = packageManager
        val launcherIntent = Intent(Intent.ACTION_MAIN, null).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = pm.queryIntentActivities(launcherIntent, 0)
        return resolved
            .map { it.activityInfo.packageName }
            .distinct()
            .filter { it != packageName } // no point monitoring this app's own notifications
            .map { pkg ->
                val label = try {
                    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
                } catch (e: Exception) {
                    pkg
                }
                AppInfo(pkg, label)
            }
            .sortedBy { it.label.lowercase() }
    }
}
