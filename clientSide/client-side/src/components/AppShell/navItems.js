import {
  HiOutlineSquares2X2,
  HiOutlineClipboardDocumentList,
  HiOutlineBanknotes,
  HiOutlineChartBarSquare,
  HiOutlineArchiveBox,
  HiOutlineUserGroup,
  HiOutlineCog6Tooth,
  HiOutlineBuildingOffice2,
  HiOutlineReceiptRefund,
  HiOutlineQrCode,
  HiOutlineClock,
  HiOutlineArchiveBoxXMark,
} from "react-icons/hi2";

// `roles` omitted = visible to everyone logged in (Owner and Cashier alike). A Cashier's
// role is restricted to selling + their own Sales History — matches the ProtectedRoute
// guards in App.jsx (a matching "roles" list here just keeps a Cashier from ever *seeing*
// a link to a page they'd be redirected away from anyway).
export const navItems = [
  { to: "/", label: "Categories", labelKey: "nav.categories", icon: HiOutlineSquares2X2, end: true },
  {
    to: "/inventory",
    label: "Inventory",
    labelKey: "nav.inventory",
    icon: HiOutlineArchiveBox,
    roles: ["owner"],
  },
  // Owner-only, same as Inventory — the full restock/damage/expiry/theft/count-correction
  // history (Sevices/stockAdjustmentService.js), each traceable back to the lot it came
  // from where one exists. Smart-tier+ (`stockAdjustments` — see config/features.js).
  {
    to: "/stock-adjustments",
    label: "Stock Adjustments",
    labelKey: "nav.stockAdjustments",
    icon: HiOutlineArchiveBoxXMark,
    roles: ["owner"],
    feature: "stockAdjustments",
  },
  {
    to: "/sales-history",
    label: "Sales History",
    labelKey: "nav.salesHistory",
    icon: HiOutlineClipboardDocumentList,
  },
  // Smart-tier+ (`partyLedger`).
  {
    to: "/credit-debit",
    label: "Credit / Debit",
    labelKey: "nav.creditDebit",
    icon: HiOutlineBanknotes,
    roles: ["owner"],
    feature: "partyLedger",
  },
  // Smart-tier+ (`contacts`).
  {
    to: "/contacts",
    label: "Contacts",
    labelKey: "nav.contacts",
    icon: HiOutlineUserGroup,
    roles: ["owner"],
    feature: "contacts",
  },
  // Smart-tier+ (`storeCredit`).
  {
    to: "/store-credit",
    label: "Store Credit",
    labelKey: "nav.storeCredit",
    icon: HiOutlineReceiptRefund,
    roles: ["owner"],
    feature: "storeCredit",
  },
  // No `roles` restriction — any staff can confirm/cancel a bank-transfer payment (same
  // trust level as refunds), so they can see this list too. See Routes/API/bankPaymentRoutes.js.
  // Broadened from "Bank Payments" to cover all 3 mediums (cash/card/bank transfer), not
  // just the bank-transfer queue this page still manages — see pages/BankPayments/index.jsx.
  // Smart-tier+ (`bankTransfer`) — a Basic shop only ever has Cash/Card, so this whole page
  // (still primarily about the bank-transfer QR queue) has nothing for it to show.
  {
    to: "/payment-mediums",
    label: "Payment Mediums",
    labelKey: "nav.paymentMediums",
    icon: HiOutlineQrCode,
    feature: "bankTransfer",
  },
  // No `roles` restriction — shift open/close is self-service for any staff (like voiding
  // one's own same-day sale); an Owner sees every shift here too. See
  // Routes/API/shiftRoutes.js and Sevices/shiftService.js's self-vs-owner scoping.
  // Advanced-tier only (`shifts`).
  {
    to: "/shifts",
    label: "Shifts",
    labelKey: "nav.shifts",
    icon: HiOutlineClock,
    feature: "shifts",
  },
  {
    to: "/report",
    label: "Sales Report",
    labelKey: "nav.report",
    icon: HiOutlineChartBarSquare,
    roles: ["owner"],
  },
  {
    to: "/company",
    label: "Company",
    labelKey: "nav.company",
    icon: HiOutlineBuildingOffice2,
    roles: ["owner"],
  },
  {
    to: "/settings",
    label: "Settings",
    labelKey: "nav.settings",
    icon: HiOutlineCog6Tooth,
    roles: ["owner"],
  },
];
