import React, { Suspense, useEffect } from "react";
import Register from "pages/Register";
import CartPersistence from "components/CartPersistence";
import LoginPage from "pages/Login";
import NotFound from "pages/NotFound";
import lazyPage, { preloadPages } from "utils/lazyPage";
import PageLoading from "components/PageLoading";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastProvider } from "components/Toast/ToastContext";
import { LanguageProvider } from "i18n/LanguageContext";
import { AuthProvider } from "auth/AuthContext";
import { TimezoneProvider } from "timezone/TimezoneContext";
import ProtectedRoute from "components/ProtectedRoute";
import { tryAutoReconnect } from "utils/thermalPrinter/connection";

// The register and login are what almost every session opens first, so they ship in the main
// bundle; every other page (and its heavy dependencies, e.g. the report's and admin's
// charts) is its own chunk, fetched only when that page is first visited.
const SalesDataComponent = lazyPage(() => import("pages/Report/Report"));
const SalesHistory = lazyPage(() => import("pages/SalesHistory"));
const CreditDebit = lazyPage(() => import("pages/CreditDebit"));
const Settings = lazyPage(() => import("pages/Settings"));
const Company = lazyPage(() => import("pages/Company"));
const Inventory = lazyPage(() => import("pages/Inventory"));
const StockAdjustments = lazyPage(() => import("pages/StockAdjustments"));
const Contacts = lazyPage(() => import("pages/Contacts"));
const StoreCredit = lazyPage(() => import("pages/StoreCredit"));
const BankPayments = lazyPage(() => import("pages/BankPayments"));
const Shifts = lazyPage(() => import("pages/Shifts"));
const AdminOverview = lazyPage(() => import("pages/Admin/Overview"));
const AdminShops = lazyPage(() => import("pages/Admin"));
const AdminHealth = lazyPage(() => import("pages/Admin/Health"));
const AdminUsage = lazyPage(() => import("pages/Admin/Usage"));
const AdminActivity = lazyPage(() => import("pages/Admin/Activity"));
const AdminAnnouncements = lazyPage(() => import("pages/Admin/Announcements"));
const AdminEstimator = lazyPage(() => import("pages/Admin/Estimator"));
const AdminLoginPage = lazyPage(() => import("pages/AdminLogin"));
const SetNewPasswordPage = lazyPage(() => import("pages/SetNewPassword"));

// Shown while a page's chunk downloads — a thin bar at the top rather than a full-screen
// spinner, so a fast load doesn't flash anything noticeable.
// Owner-only pages — Inventory, Credit/Debit, Contacts, Sales Report, Settings, Company —
// a Cashier's role is restricted to the selling screens (Categories/Product List) plus
// their own sales (Sales History, server-filtered — see salesController.js's
// getBilledHistory), so it isn't wrapped with a roles restriction here.
const OWNER_ONLY = ["owner"];

function App() {
  // Best-effort silent reconnect to a previously-paired thermal printer (Chromium only,
  // no-ops elsewhere) — see utils/thermalPrinter/connection.js.
  useEffect(() => {
    tryAutoReconnect();
  }, []);

  // A few seconds after the app opens, fetch every other page's code in the background, so
  // opening a page for the first time doesn't wait on it (see utils/lazyPage.js).
  useEffect(() => {
    const timer = setTimeout(preloadPages, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LanguageProvider>
      <ToastProvider>
        <TimezoneProvider>
          <AuthProvider>
            <CartPersistence />
            <Router>
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  {/* Separate from /login, deliberately — see pages/AdminLogin's own
                      top comment for why the two used to be one shared screen and no
                      longer are. */}
                  <Route path="/admin/login" element={<AdminLoginPage />} />
                  {/* Reached only via ProtectedRoute's own mustChangePassword redirect (a
                      temp password issued by an admin-approved forgot-password request) —
                      not linked from anywhere, and not reachable once the flag is cleared. */}
                  <Route
                    path="/set-new-password"
                    element={
                      <ProtectedRoute>
                        <SetNewPasswordPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Platform admin console (migration 022) — a superadmin's only route.
                      ProtectedRoute's adminOnly boundary keeps a shop's own Owner/Cashier out
                      of this exactly as strictly as it keeps a superadmin out of every route
                      below it. */}
                  {[
                    ["/admin", AdminOverview],
                    ["/admin/shops", AdminShops],
                    ["/admin/health", AdminHealth],
                    ["/admin/usage", AdminUsage],
                    ["/admin/activity", AdminActivity],
                    ["/admin/announcements", AdminAnnouncements],
                    ["/admin/estimator", AdminEstimator],
                  ].map(([path, Page]) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <ProtectedRoute adminOnly>
                          <Page />
                        </ProtectedRoute>
                      }
                    />
                  ))}
                  {/* The register. "/categories/:id" and "/productlist/:id" are older deep links
                      (Global Search still navigates to the first) — they open the same screen
                      with that category's tab selected. */}
                  {["/", "/categories/:prodNum", "/productlist/:prodNum"].map((path) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <ProtectedRoute>
                          <Register />
                        </ProtectedRoute>
                      }
                    />
                  ))}
                  <Route
                    path="/report"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY}>
                        <SalesDataComponent />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales-history"
                    element={
                      <ProtectedRoute>
                        <SalesHistory />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/credit-debit"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY} feature="partyLedger">
                        <CreditDebit />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY}>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/company"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY}>
                        <Company />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY}>
                        <Inventory />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/stock-adjustments"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY} feature="stockAdjustments">
                        <StockAdjustments />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contacts"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY} feature="contacts">
                        <Contacts />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/store-credit"
                    element={
                      <ProtectedRoute roles={OWNER_ONLY} feature="storeCredit">
                        <StoreCredit />
                      </ProtectedRoute>
                    }
                  />
                  {/* No roles restriction — confirming/cancelling a bank-transfer payment is
                      any-staff, same trust level as refunds (see Routes/API/bankPaymentRoutes.js).
                      Route renamed from /bank-payments to reflect the page now covering all 3
                      payment mediums, not just the bank-transfer queue it still manages.
                      Smart-tier+ (`bankTransfer`) — a Basic shop has no bank-transfer QR queue
                      to manage. */}
                  <Route
                    path="/payment-mediums"
                    element={
                      <ProtectedRoute feature="bankTransfer">
                        <BankPayments />
                      </ProtectedRoute>
                    }
                  />
                  {/* No roles restriction — shift open/close is self-service for any staff;
                      shiftService.js scopes what each role can see/act on. Advanced-tier only
                      (`shifts`). */}
                  <Route
                    path="/shifts"
                    element={
                      <ProtectedRoute feature="shifts">
                        <Shifts />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Router>
          </AuthProvider>
        </TimezoneProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
