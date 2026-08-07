import {
  HiOutlineSquares2X2,
  HiOutlineClipboardDocumentList,
  HiOutlineBanknotes,
  HiOutlineChartBarSquare,
  HiOutlineArchiveBox,
  HiOutlineUserGroup,
  HiOutlineCog6Tooth,
} from "react-icons/hi2";

export const navItems = [
  { to: "/", label: "Categories", labelKey: "nav.categories", icon: HiOutlineSquares2X2, end: true },
  { to: "/inventory", label: "Inventory", labelKey: "nav.inventory", icon: HiOutlineArchiveBox },
  {
    to: "/sales-history",
    label: "Sales History",
    labelKey: "nav.salesHistory",
    icon: HiOutlineClipboardDocumentList,
  },
  { to: "/credit-debit", label: "Credit / Debit", labelKey: "nav.creditDebit", icon: HiOutlineBanknotes },
  { to: "/contacts", label: "Contacts", labelKey: "nav.contacts", icon: HiOutlineUserGroup },
  { to: "/report", label: "Sales Report", labelKey: "nav.report", icon: HiOutlineChartBarSquare },
  { to: "/settings", label: "Settings", labelKey: "nav.settings", icon: HiOutlineCog6Tooth },
];
