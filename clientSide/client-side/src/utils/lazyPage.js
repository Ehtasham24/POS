import { createElement, lazy, useState } from "react";

const RETRY_DELAYS_MS = [1000, 3000];
const loaders = [];

// React.lazy for a page, so each page's code is its own chunk, downloaded when the page is
// first opened instead of all up front in one big bundle (slow first load on a weak link).
// A chunk request that drops on a flaky connection is retried a couple of times before
// giving up, instead of the page failing on the first hiccup. Offline, the service worker
// serves every chunk from its precache (service-worker.js), so this never needs the network
// once the app has been installed.
//
// Once preloadPages() has fetched a page's chunk, the page renders straight away instead of
// going through React.lazy — which would otherwise suspend for a moment even for code that's
// already downloaded, flashing the loading screen on every first visit.
export default function lazyPage(importPage) {
  let loaded = null;
  let pending = null;
  const load = () => {
    pending ??= (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          loaded = await importPage();
          return loaded;
        } catch (error) {
          if (attempt >= RETRY_DELAYS_MS.length) {
            pending = null; // let a later visit try again
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
    })();
    return pending;
  };
  loaders.push(load);

  const LazyPage = lazy(load);
  return function Page(props) {
    // Chosen once per mount: switching from LazyPage to the loaded component while the page
    // is on screen would remount it and lose its state.
    const [Component] = useState(() => (loaded ? loaded.default : LazyPage));
    return createElement(Component, props);
  };
}

// Fetches every page's code in the background, one at a time, while the app is idle — so by
// the time someone opens a page, it's already there. Failures are ignored here; the page
// simply loads (and retries) when it's opened.
export async function preloadPages() {
  for (const load of loaders) {
    await new Promise((resolve) => (window.requestIdleCallback || setTimeout)(resolve));
    await load().catch(() => {});
  }
}
