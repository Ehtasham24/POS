import React from "react";
import CategorieswithSidebar from "pages/CategorieswithSidebar";
import ProductList from "pages/ProductList";
import SalesDataComponent from "pages/Report/Report";
import SalesHistory from "pages/SalesHistory";
import CreditDebit from "pages/CreditDebit";
import Settings from "pages/Settings";
import Inventory from "pages/Inventory";
import Contacts from "pages/Contacts";
import NotFound from "pages/NotFound";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastProvider } from "components/Toast/ToastContext";
import { LanguageProvider } from "i18n/LanguageContext";

function App() {
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
