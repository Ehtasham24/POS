import React from "react";
import { NavLink, Link } from "react-router-dom";
import { HiOutlineSun, HiOutlineMoon } from "react-icons/hi2";
import useTheme from "hooks/useTheme";
import { useLanguage } from "i18n/LanguageContext";
import { useAuth } from "auth/AuthContext";
import Logo from "components/Logo";
import { navItems } from "./navItems";

export default function SidebarContent({ onNavigate = () => {} }) {
  const [theme, toggleTheme] = useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  // Items with no `roles` are visible to anyone logged in; otherwise the current role
  // must be listed — this is what keeps a Cashier from ever seeing a link to a page
  // they'd just get redirected away from (App.jsx's ProtectedRoute enforces the same
  // restriction server-adjacent; this is purely "don't show it in the first place").
  // `feature` is the same idea for a tier-gated page — locked features are simply absent
  // from user.shop.features (/api/auth/me), so a Basic/Smart shop never sees a link to a
  // page it would just get redirected away from either.
  const visibleItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(user?.role)) &&
      (!item.feature || user?.shop?.features?.includes(item.feature))
  );

  return (
    <div className="flex h-full flex-col bg-gray-900 text-gray-300">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-6 py-6">
        <Logo className="h-9 w-9" />
        <span className="font-poppins text-lg font-bold tracking-tight text-white-A700">
          POS System
        </span>
      </Link>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {visibleItems.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-600 text-white-A700 shadow-md shadow-primary-900/30"
                  : "text-gray-400 hover:bg-white-A700/5 hover:text-white-A700"
              }`
            }
          >
            <Icon className="text-lg shrink-0" />
            <span className="truncate">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white-A700/10 px-3 py-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white-A700/5 hover:text-white-A700"
        >
          {theme === "dark" ? (
            <HiOutlineSun className="text-lg shrink-0" />
          ) : (
            <HiOutlineMoon className="text-lg shrink-0" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <p className="mt-3 px-3.5 text-xs text-gray-500">POS System &copy; v1.0</p>
      </div>
    </div>
  );
}
