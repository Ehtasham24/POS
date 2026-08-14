import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";
import "./styles/index.css";
import store from "./store/store";
import { Provider } from "react-redux";
import "./styles/font.css";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <Provider store={store}>
    <App />
  </Provider>
);

// Registers the static-shell service worker (production builds only — see
// service-worker.js) so the app can be installed to a mobile home screen and open
// full-screen like a native app, without caching any live POS data.
//
// onUpdate: without this, a new deploy's service worker installs but sits "waiting"
// indefinitely — service-worker.js only calls self.skipWaiting() on receiving this
// message, and browsers otherwise hold a waiting worker until every open tab/instance of
// the app is fully closed and reopened. On a phone that's an easy trap: the page still
// looks "up to date" (pull-to-refresh doesn't help) while actually running yesterday's
// JS. Telling the waiting worker to activate now and reloading once it does (via
// controllerchange, which only fires once) means the next visit after any deploy just
// picks up the new build on its own.
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  },
});

let reloadedForUpdate = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (reloadedForUpdate) return;
  reloadedForUpdate = true;
  window.location.reload();
});
