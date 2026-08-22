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
  {
    to: "/sales-history",
    label: "Sales History",
    labelKey: "nav.salesHistory",
    icon: HiOutlineClipboardDocumentList,
  },
  {
    to: "/credit-debit",
    label: "Credit / Debit",
    labelKey: "nav.creditDebit",
    icon: HiOutlineBanknotes,
    roles: ["owner"],
  },
  {
    to: "/contacts",
    label: "Contacts",
    labelKey: "nav.contacts",
    icon: HiOutlineUserGroup,
    roles: ["owner"],
  },
  {
    to: "/store-credit",
    label: "Store Credit",
    labelKey: "nav.storeCredit",
    icon: HiOutlineReceiptRefund,
    roles: ["owner"],
  },
  // No `roles` restriction — any staff can confirm/cancel a bank-transfer payment (same
  // trust level as refunds), so they can see this list too. See Routes/API/bankPaymentRoutes.js.
  // Broadened from "Bank Payments" to cover all 3 mediums (cash/card/bank transfer), not
  // just the bank-transfer queue this page still manages — see pages/BankPayments/index.jsx.
  {
    to: "/payment-mediums",
    label: "Payment Mediums",
    labelKey: "nav.paymentMediums",
    icon: HiOutlineQrCode,
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
