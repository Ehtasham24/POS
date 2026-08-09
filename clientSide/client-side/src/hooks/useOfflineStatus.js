import { useEffect, useState } from "react";
import * as connectivity from "offline/connectivity";
import * as syncManager from "offline/syncManager";

// Reactive view over connectivity + syncManager, for the status indicator (and anything else
// that wants to know "are we offline / is there anything still queued").
export default function useOfflineStatus() {
  const [online, setOnline] = useState(connectivity.isOnline);
  const [sync, setSync] = useState(syncManager.getState);

  useEffect(() => {
    syncManager.start();
    const unsubConn = connectivity.subscribe(setOnline);
    const unsubSync = syncManager.subscribe(setSync);
    return () => {
      unsubConn();
      unsubSync();
    };
  }, []);

  return { online, ...sync };
}
