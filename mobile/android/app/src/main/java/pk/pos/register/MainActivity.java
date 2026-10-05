package pk.pos.register;

import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
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
    // shows, which is why this one does nothing but set the bars' icon colour.
    private String theme = null;

    private class PosShell {

        @JavascriptInterface
        public void setTheme(String value) {
            runOnUiThread(() -> {
                theme = value;
                applyTheme();
            });
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
