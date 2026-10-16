package pk.pos.register;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Process;

// Restarts the app so a downloaded code update (mobile/node/index.js) takes over: the register's
// Node.js runtime can only start once per process, so a new process is needed. This activity
// runs in a process of its own (AndroidManifest.xml, android:process=":restart"): it ends the
// app's main process, opens the app again — allowed, since this activity is in the foreground —
// and then ends itself.
public class RestartActivity extends Activity {

    static final String EXTRA_MAIN_PID = "mainPid";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int mainPid = getIntent().getIntExtra(EXTRA_MAIN_PID, -1);
        if (mainPid > 0) Process.killProcess(mainPid);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(launch);
        }
        finish();
        Runtime.getRuntime().exit(0);
    }
}
