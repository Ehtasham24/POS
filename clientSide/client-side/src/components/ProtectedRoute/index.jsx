import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "auth/AuthContext";
import { useToast } from "components/Toast/ToastContext";

// Wraps every route except /login (see App.jsx). No user -> bounce to /login, remembering
// where they were headed so login can send them back. `roles` (optional) further
// restricts to specific roles — a Cashier hitting an Owner-only URL directly (typed in,
// bookmarked, or just clicked from muscle memory) is redirected home instead of shown
// a blank/broken page, with a toast explaining why, matching how a real system responds
// to a permissions wall rather than silently doing nothing. `feature` (optional) does the
// same for a tier-gated page — a locked feature is simply absent from user.shop.features
// (/api/auth/me), so this needs no tier-comparison logic of its own.
//
// `adminOnly` marks the one route (/admin) meant for a platform superadmin (migration 022)
// rather than a shop's own Owner/Cashier. A superadmin belongs to no shop at all, so "home"
// for them is /admin, not "/" (which assumes a shop context every shop-scoped page reads
// from) — every OTHER route implicitly excludes a superadmin the same way an admin-only
// route excludes everyone else, since the two roles live in genuinely separate worlds.
export default function ProtectedRoute({ children, roles, feature, adminOnly = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const isSuperAdmin = user?.role === "superadmin";
  const homePath = isSuperAdmin ? "/admin" : "/";
  const forbiddenByRole = !loading && user && roles && !roles.includes(user.role);
  const forbiddenByFeature = !loading && user && feature && !user.shop?.features?.includes(feature);
  const forbiddenByAdminBoundary = !loading && user && isSuperAdmin !== adminOnly;
  const forbidden = forbiddenByRole || forbiddenByFeature || forbiddenByAdminBoundary;

  // toast.error triggers a state update (ToastContext) — deferred to an effect rather
  // than called straight in the render body, which React (correctly) doesn't allow a
  // component to do to another component's state mid-render.
  useEffect(() => {
    if (forbidden) toast.error("You don't have access to that page.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbidden]);

  if (loading) return null; // avoids a login-page flash while the initial /me call is in flight

  if (!user) {
    // Two separate sign-in surfaces (App.jsx) — an admin-only route sends an unauthenticated
    // visitor to the admin portal's own login, never the shop staff one, so nobody types a
    // platform-admin username into a form whose "Forgot password?" is deliberately scoped
    // to shop accounts only (see passwordResetService.js's role != 'superadmin' filter).
    return (
      <Navigate to={adminOnly ? "/admin/login" : "/login"} state={{ from: location.pathname }} replace />
    );
  }

  // A temp password (issued by an admin-approved forgot-password request — see
  // passwordResetService.js) forces a stop here before anything else is reachable, the
  // same way the !user check above forces a stop at /login. Checked before `forbidden`
  // so a locked-out user isn't shown a "you don't have access" toast for a page they'd
  // otherwise be allowed to see once they've actually set a real password.
  if (user.mustChangePassword && location.pathname !== "/set-new-password") {
    return <Navigate to="/set-new-password" replace />;
  }
  if (!user.mustChangePassword && location.pathname === "/set-new-password") {
    return <Navigate to={homePath} replace />;
  }

  if (forbidden) {
    return <Navigate to={homePath} replace />;
  }

  return children;
}
