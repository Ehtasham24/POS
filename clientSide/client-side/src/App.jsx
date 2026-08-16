import React, { useEffect } from "react";
import CategorieswithSidebar from "pages/CategorieswithSidebar";
import ProductList from "pages/ProductList";
import SalesDataComponent from "pages/Report/Report";
import SalesHistory from "pages/SalesHistory";
import CreditDebit from "pages/CreditDebit";
import Settings from "pages/Settings";
import Company from "pages/Company";
import Inventory from "pages/Inventory";
import Contacts from "pages/Contacts";
import StoreCredit from "pages/StoreCredit";
import LoginPage from "pages/Login";
import NotFound from "pages/NotFound";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastProvider } from "components/Toast/ToastContext";
import { LanguageProvider } from "i18n/LanguageContext";
import { AuthProvider } from "auth/AuthContext";
import { TimezoneProvider } from "timezone/TimezoneContext";
import ProtectedRoute from "components/ProtectedRoute";
import { tryAutoReconnect } from "utils/thermalPrinter/connection";

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

  return (
    <LanguageProvider>
      <ToastProvider>
        <TimezoneProvider>
          <AuthProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <CategorieswithSidebar />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/categories/:prodNum"
                  element={
                    <ProtectedRoute>
                      <ProductList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/productlist/:prodNum"
                  element={
                    <ProtectedRoute>
                      <ProductList />
                    </ProtectedRoute>
                  }
                />
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
                    <ProtectedRoute roles={OWNER_ONLY}>
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
                  path="/contacts"
                  element={
                    <ProtectedRoute roles={OWNER_ONLY}>
                      <Contacts />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/store-credit"
                  element={
                    <ProtectedRoute roles={OWNER_ONLY}>
                      <StoreCredit />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
          </AuthProvider>
        </TimezoneProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
