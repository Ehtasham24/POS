package com.possystem.paymentforwarder

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

data class AppInfo(val packageName: String, val label: String)

// Backs MainActivity's app picker — reads the phone's OWN installed-apps list (see
// MainActivity.loadInstalledApps) rather than any hardcoded guess at package names, so
// "which apps can I monitor" is always accurate to this specific phone, not a list that
// could silently go stale as apps get renamed/replaced.
class InstalledAppsAdapter(
    private val allApps: List<AppInfo>,
    private val selectedPackages: MutableSet<String>,
    private val onSelectionChanged: (Set<String>) -> Unit
) : RecyclerView.Adapter<InstalledAppsAdapter.ViewHolder>() {

    private var filtered: List<AppInfo> = allApps

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val checkbox: CheckBox = view.findViewById(R.id.checkbox)
        val appName: TextView = view.findViewById(R.id.appName)
        val packageName: TextView = view.findViewById(R.id.packageName)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_app, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val app = filtered[position]
        holder.appName.text = app.label
        holder.packageName.text = app.packageName
        // Cleared first — RecyclerView recycles rows, so a stale listener from a
        // different (scrolled-away) app would otherwise fire on the wrong package.
        holder.checkbox.setOnCheckedChangeListener(null)
        holder.checkbox.isChecked = selectedPackages.contains(app.packageName)
        holder.checkbox.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) selectedPackages.add(app.packageName) else selectedPackages.remove(app.packageName)
            onSelectionChanged(selectedPackages)
        }
    }

    override fun getItemCount(): Int = filtered.size

    fun filter(query: String) {
        filtered = if (query.isBlank()) {
            allApps
        } else {
            allApps.filter {
                it.label.contains(query, ignoreCase = true) || it.packageName.contains(query, ignoreCase = true)
            }
        }
        notifyDataSetChanged()
    }
}
