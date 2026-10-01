// The Windows app: one window showing the POS, served by the device runtime running inside
// this same process (the local database and the backend — see ../runtime.js).
const path = require("path");
const { app, BrowserWindow, dialog, session } = require("electron");
const { startDevice } = require("../runtime");

const PORT = 4100;

// Two copies of the app would open the same database folder at once and corrupt it: a second
// launch just brings the running window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window = null;
  let device = null;

  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  // Waits for the backend to answer before showing the app, instead of a blank error page.
  const waitForServer = async (url) => {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${url}/api/health`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`The POS server didn't start at ${url}`);
  };

  app.whenReady().then(async () => {
    try {
      device = await startDevice({
        dataDir: path.join(app.getPath("userData"), "pos-data"),
        port: PORT,
        devShop: process.env.POS_DEV_SHOP,
      });
      await waitForServer(device.url);
      // The web app's service worker caches the build for offline use in a browser. Here the
      // server is on this machine, so it only adds a risk: an updated app showing the old
      // build from cache. Cleared on every start, so an update shows at once.
      await session.defaultSession.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
    } catch (err) {
      dialog.showErrorBox("POS could not start", String(err?.stack || err));
      app.exit(1);
      return;
    }
    window = new BrowserWindow({
      width: 1366,
      height: 850,
      title: "POS",
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    // Only the POS itself opens in the app; any other link goes to the normal browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(device.url)) require("electron").shell.openExternal(url);
      return { action: "deny" };
    });
    window.loadURL(device.url);
  });

  app.on("window-all-closed", () => app.quit());

  // Close the database cleanly on the way out (a hard power-off is covered by the power-cut
  // test; a normal quit shouldn't need to rely on that).
  let closing = false;
  app.on("before-quit", (event) => {
    if (closing || !device) return;
    event.preventDefault();
    closing = true;
    device.close().finally(() => app.exit(0));
  });
}
