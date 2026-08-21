import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { HiOutlineBars3, HiOutlineXMark } from "react-icons/hi2";
import Logo from "components/Logo";
import SidebarContent from "./SidebarContent";
import GlobalSearch from "components/GlobalSearch";
import LowStockBell from "./LowStockBell";
import PendingBankPaymentsBell from "./PendingBankPaymentsBell";
import OfflineStatusBadge from "./OfflineStatusBadge";
import UserMenu from "./UserMenu";
import CartCheckout from "categoriesComponents/cartCheckout";

export default function AppShell({ title, actions, hideSearch, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>{title ? `${title} · POS System` : "POS System"}</title>
        <meta name="description" content="Web site created using create-react-app" />
      </Helmet>

      {/* Desktop persistent sidebar */}
      <aside className="md:hidden fixed inset-y-0 left-0 z-40 w-64 border-r border-black/10">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="hidden md:block fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-gray-900/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 h-full w-64 shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-white-A700/10 hover:text-white-A700"
            >
              <HiOutlineXMark className="text-lg" />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="md:pl-0 pl-64 flex min-h-screen flex-col">
        {/* Mobile top bar */}
        <header className="hidden md:flex sticky top-0 z-30 items-center justify-between gap-3 border-b border-surface-border bg-white-A700 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <HiOutlineBars3 className="text-xl" />
            </button>
            <Link to="/" className="flex items-center gap-2">
              <Logo className="h-6 w-6" />
              <span className="font-poppins text-base font-bold text-gray-800 dark:text-gray-100">
                POS System
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <OfflineStatusBadge />
            <PendingBankPaymentsBell />
            <LowStockBell />
            <UserMenu />
          </div>
        </header>

        {/* Page top bar */}
        <div className="sticky top-0 md:static z-20 border-b border-surface-border bg-white-A700/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3 px-8 pt-5 md:px-5 sm:px-4">
            <h1 className="font-poppins text-2xl font-bold text-gray-800 dark:text-gray-100 sm:text-xl">
              {title}
            </h1>
            <div className="flex items-center gap-2">
              {!hideSearch && <GlobalSearch />}
              <OfflineStatusBadge />
              <PendingBankPaymentsBell />
              <LowStockBell />
              <UserMenu />
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 px-8 pb-5 pt-3 md:px-5 sm:px-4">
              {actions}
            </div>
          )}
          {!actions && <div className="pb-5" />}
        </div>

        <main className="flex-1 px-8 py-8 md:px-5 md:py-6 sm:px-4">{children}</main>
      </div>

      <CartCheckout />
    </div>
  );
}
