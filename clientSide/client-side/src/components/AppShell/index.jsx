import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { HiOutlineBars3, HiOutlineXMark } from "react-icons/hi2";
import Logo from "components/Logo";
import SidebarContent from "./SidebarContent";
import GlobalSearch from "components/GlobalSearch";
import LowStockBell from "./LowStockBell";
import PendingBankPaymentsBell from "./PendingBankPaymentsBell";
import StorageWarningBadge from "./StorageWarningBadge";
import ShopNotices from "./ShopNotices";
import OfflineStatusBadge from "./OfflineStatusBadge";
import DeviceSyncStatus, { DeviceSyncNotice } from "./DeviceSyncStatus";
import UserMenu from "./UserMenu";
import CartCheckout from "categoriesComponents/cartCheckout";

// `fullBleed` (the Register): the page gets exactly the viewport below the top bar, with no
// padding and no page-level scroll — it lays out and scrolls its own regions (product grid
// on one side, order panel on the other). Its title and actions share one compact row, so
// the selling surface starts as high up the screen as possible.
export default function AppShell({ title, actions, hideSearch, fullBleed = false, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className={`${fullBleed ? "h-screen overflow-hidden safe-pb" : "min-h-screen"} bg-surface-subtle dark:bg-gray-900`}>
      <Helmet>
        <title>{title ? `${title} · POS System` : "POS System"}</title>
        <meta name="description" content="Web site created using create-react-app" />
      </Helmet>

      {/* Desktop persistent sidebar */}
      <aside className="md:hidden fixed inset-y-0 left-0 z-40 w-64 border-r border-black/10 bg-gray-900 safe-pt">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="hidden md:block fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-gray-900/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 h-full w-64 bg-gray-900 shadow-2xl safe-pt">
            <div className="relative h-full">
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
        </div>
      )}

      <div className={`md:pl-0 pl-64 flex flex-col ${fullBleed ? "h-full" : "min-h-screen"}`}>
        {/* Mobile top bar */}
        {/* Its background runs up under a phone's status bar (safe-pt); its content starts below. */}
        <header className="hidden md:block sticky top-0 z-30 border-b border-surface-border bg-white-A700 safe-pt dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <HiOutlineBars3 className="text-xl" />
              </button>
              {/* One line, shortened with "…" when the icons leave no room (large text sizes). */}
              <Link to="/" className="flex min-w-0 items-center gap-2">
                <Logo className="h-6 w-6 shrink-0" />
                <span className="truncate whitespace-nowrap font-poppins text-base font-bold text-gray-800 dark:text-gray-100">
                  POS System
                </span>
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <OfflineStatusBadge />
              <DeviceSyncStatus />
              <StorageWarningBadge />
              <PendingBankPaymentsBell />
              <LowStockBell />
              <UserMenu />
            </div>
          </div>
        </header>

        {/* Page top bar */}
        <div className="sticky top-0 md:static z-20 border-b border-surface-border bg-white-A700/80 backdrop-blur safe-pt-wide dark:border-gray-800 dark:bg-gray-900/80">
          <div
            className={`flex flex-wrap items-center justify-between gap-3 ${
              fullBleed ? "px-6 py-3 md:px-4 sm:px-3 sm:py-2" : "px-8 pt-5 md:px-5 sm:px-4"
            }`}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="font-poppins text-2xl font-bold text-gray-800 dark:text-gray-100 sm:text-xl">
                {title}
              </h1>
              {fullBleed && actions}
            </div>
            <div className="flex items-center gap-2">
              {!hideSearch && <GlobalSearch />}
              {/* The "Mobile top bar" header above already shows this exact icon cluster
                  at md: (this project's max-width/mobile breakpoint — see
                  tailwind.config.js) — without md:hidden here, both rows render at once
                  on any phone/tablet width, showing every icon twice. Real desktop
                  (where that header is itself hidden) still needs this row, so it can't
                  just be deleted. */}
              <div className="flex items-center gap-2 md:hidden">
                <OfflineStatusBadge />
                <DeviceSyncStatus />
                <StorageWarningBadge />
                <PendingBankPaymentsBell />
                <LowStockBell />
                <UserMenu />
              </div>
            </div>
          </div>
          {!fullBleed && actions && (
            <div className="flex flex-wrap items-center gap-2 px-8 pb-5 pt-3 md:px-5 sm:px-4">
              {actions}
            </div>
          )}
          {!fullBleed && !actions && <div className="pb-5" />}
        </div>

        <ShopNotices />
        <DeviceSyncNotice />

        <main className={fullBleed ? "min-h-0 flex-1" : "flex-1 px-8 py-8 md:px-5 md:py-6 sm:px-4 safe-pb"}>{children}</main>
      </div>

      <CartCheckout />
    </div>
  );
}
