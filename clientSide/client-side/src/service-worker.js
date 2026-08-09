/* eslint-disable no-restricted-globals */

// This service worker only caches the app's own static shell (JS/CSS/HTML/images) so it
// installs instantly and opens full-screen from the home-screen icon. It deliberately does
// NOT intercept API calls to the Express backend — this is a POS app, sales/inventory/credit
// data must always come straight from the network, never a cached copy (stale stock counts
// or prices would be actively wrong, not just slow). Because no route below matches the
// backend's origin/port, those requests simply aren't touched by this service worker at all.

import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

clientsClaim();

// Precache everything Webpack emitted for this build (injected at build time).
precacheAndRoute(self.__WB_MANIFEST);

// App-shell routing: any navigation request (e.g. opening the installed icon) is served
// index.html from the cache first, so the app opens instantly even on a flaky connection —
// React Router then takes over client-side as usual.
const fileExtensionRegexp = new RegExp("/[^/?]+\\.[^/]+$");
registerRoute(({ request, url }) => {
  if (request.mode !== "navigate") return false;
  if (url.pathname.startsWith("/_")) return false;
  if (url.pathname.match(fileExtensionRegexp)) return false;
  return true;
}, createHandlerBoundToURL(process.env.PUBLIC_URL + "/index.html"));

// Static images the app ships with (icons, product placeholders etc.) — cache-first with
// revalidation in the background, capped so it can't grow unbounded.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.match(/\.(png|jpe?g|svg|gif)$/),
  new StaleWhileRevalidate({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  })
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
