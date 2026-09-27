import { lazy } from "react";

const RETRY_DELAYS_MS = [1000, 3000];

// React.lazy for a page, so each page's code is its own chunk, downloaded when the page is
// first opened instead of all up front in one big bundle (slow first load on a weak link).
// A chunk request that drops on a flaky connection is retried a couple of times before
// giving up, instead of the page failing on the first hiccup. Offline, the service worker
// serves every chunk from its precache (service-worker.js), so this never needs the network
// once the app has been installed.
export default function lazyPage(importPage) {
  return lazy(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await importPage();
      } catch (error) {
        if (attempt >= RETRY_DELAYS_MS.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  });
}
