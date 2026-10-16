package pk.pos.register;

import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The app draws edge to edge, so the status bar's icons sit on the page's own header. The page
    // says which theme it's showing (hooks/useTheme.js calls window.PosShell.setTheme) and the
    // icons follow: light on the dark theme, dark on the light one. Without this they'd follow
    // the phone's system theme and could vanish against the header.
    //
    // The page is the register's own (127.0.0.1, capacitor.config.json allowNavigation), so it
    // can't reach Capacitor's plugins; a JavaScript interface is visible to whatever this WebView
    // shows, so this one only offers what the page needs and checks what it's given: the bars'
    // icon colour, and the two steps of an update (device/updater.js) — restarting into
    // downloaded code, and installing a downloaded APK (Android asks the person to confirm, and
    // only accepts one signed with this app's own key).
    private String theme = null;

    private class PosShell {

        @JavascriptInterface
        public void setTheme(String value) {
            runOnUiThread(() -> {
                theme = value;
                applyTheme();
            });
        }

        @JavascriptInterface
        public void restart() {
            Intent intent = new Intent(MainActivity.this, RestartActivity.class);
            intent.putExtra(RestartActivity.EXTRA_MAIN_PID, Process.myPid());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }

        // `path` must be a downloaded update's APK, inside the updater's own folder. Returns
        // "started", "needs-permission" (the settings page to allow installing was opened), or
        // "refused".
        @JavascriptInterface
        public String installApk(String path) {
            File apk;
            try {
                File updates = new File(getFilesDir(), "nodejs/data/updates/apk").getCanonicalFile();
                apk = new File(path).getCanonicalFile();
                if (!updates.equals(apk.getParentFile()) || !apk.getName().matches("pos-register-[0-9.]+\\.apk") || !apk.isFile()) return "refused";
            } catch (IOException e) {
                return "refused";
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(allow);
                return "needs-permission";
            }
            Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
            return "started";
        }
    }

    private void applyTheme() {
        if (theme == null) return;
        boolean dark = "dark".equals(theme);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark);
        bars.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new PosShell(), "PosShell");
    }

    // Capacitor's SystemBars resets the icons to the system theme on a configuration change
    // (rotation, dark mode switched); put the page's back.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyTheme();
    }
}
