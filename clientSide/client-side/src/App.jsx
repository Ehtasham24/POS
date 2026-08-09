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
import NotFound from "pages/NotFound";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastProvider } from "components/Toast/ToastContext";
import { LanguageProvider } from "i18n/LanguageContext";
import { tryAutoReconnect } from "utils/thermalPrinter/connection";

function App() {
  // Best-effort silent reconnect to a previously-paired thermal printer (Chromium only,
  // no-ops elsewhere) — see utils/thermalPrinter/connection.js.
  useEffect(() => {
    tryAutoReconnect();
  }, []);

  return (
    <LanguageProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/" element={<CategorieswithSidebar />} />
            <Route path="/categories/:prodNum" element={<ProductList />} />
            <Route path="/productlist/:prodNum" element={<ProductList />} />
            <Route path="/report" element={<SalesDataComponent />} />
            <Route path="/sales-history" element={<SalesHistory />} />
            <Route path="/credit-debit" element={<CreditDebit />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/company" element={<Company />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
