import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "auth/AuthContext";
import { useToast } from "components/Toast/ToastContext";

// Wraps every route except /login (see App.jsx). No user -> bounce to /login, remembering
// where they were headed so login can send them back. `roles` (optional) further
// restricts to specific roles — a Cashier hitting an Owner-only URL directly (typed in,
// bookmarked, or just clicked from muscle memory) is redirected to "/" instead of shown
// a blank/broken page, with a toast explaining why, matching how a real system responds
// to a permissions wall rather than silently doing nothing. `feature` (optional) does the
// same for a tier-gated page — a locked feature is simply absent from user.shop.features
// (/api/auth/me), so this needs no tier-comparison logic of its own.
export default function ProtectedRoute({ children, roles, feature }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const forbiddenByRole = !loading && user && roles && !roles.includes(user.role);
  const forbiddenByFeature = !loading && user && feature && !user.shop?.features?.includes(feature);
  const forbidden = forbiddenByRole || forbiddenByFeature;

  // toast.error triggers a state update (ToastContext) — deferred to an effect rather
  // than called straight in the render body, which React (correctly) doesn't allow a
  // component to do to another component's state mid-render.
  useEffect(() => {
    if (forbidden) toast.error("You don't have access to that page.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbidden]);

  if (loading) return null; // avoids a login-page flash while the initial /me call is in flight

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (forbidden) {
    return <Navigate to="/" replace />;
  }

  return children;
}
