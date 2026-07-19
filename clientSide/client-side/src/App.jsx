import React from "react";
import CategorieswithSidebar from "pages/CategorieswithSidebar";
import ProductList from "pages/ProductList";
import SalesDataComponent from "pages/Report/Report";
import Receipt from "pages/Bill";
import SalesHistory from "pages/SalesHistory";
import CreditDebit from "pages/CreditDebit";
import NotFound from "pages/NotFound";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CategorieswithSidebar />} />
        <Route path="/categories/:prodNum" element={<ProductList />} />
        <Route path="/productlist/:prodNum" element={<ProductList />} />
        <Route path="/bill" element={<Receipt />} />
        <Route path="/report" element={<SalesDataComponent />} />
        <Route path="/sales-history" element={<SalesHistory />} />
        <Route path="/credit-debit" element={<CreditDebit />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
