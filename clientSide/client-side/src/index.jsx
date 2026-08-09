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
serviceWorkerRegistration.register();
