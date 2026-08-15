import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost } from "utils/api";
import { useToast } from "components/Toast/ToastContext";

const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const checkSession = useCallback(async () => {
    try {
      setUser(await apiGet("/api/auth/me"));
    } catch {
      // Any error here (401 "not authenticated", or a network failure while offline)
      // means "treat as logged out" — there's no partial-auth state in this app.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Fired from utils/api.js the instant *any* request anywhere in the app comes back
  // 401 — e.g. a session that expired while the app was already open — so the whole app
  // reacts immediately (ProtectedRoute redirects to /login) instead of only the one
  // component that happened to make that particular call.
  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  // Distinct from the generic "you're logged out" handling above — fired specifically by
  // offline/syncManager.js when the background outbox-flush (runs with no user
  // interaction at all) fails because the session is gone, which would otherwise stall
  // silently forever with no way for the cashier to know why their sales aren't syncing.
  useEffect(() => {
    const handleSyncAuthError = (e) => {
      const count = e.detail?.pendingCount ?? 0;
      toast.error(
        count > 0
          ? `Session expired — log in again to sync ${count} pending sale${count === 1 ? "" : "s"}.`
          : "Session expired — please log in again."
      );
    };
    window.addEventListener("sync:auth-error", handleSyncAuthError);
    return () => window.removeEventListener("sync:auth-error", handleSyncAuthError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username, password) => {
    const loggedInUser = await apiPost("/api/auth/login", { username, password });
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      // Cleared locally regardless of whether the request itself succeeded — logout
      // should never leave the UI in a stuck "still looks logged in" state.
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
