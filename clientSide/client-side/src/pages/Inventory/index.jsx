import React, { useEffect, useRef, useState } from "react";
import {
  HiOutlineArchiveBox,
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineXCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineQrCode,
  HiOutlineEllipsisVertical,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineArchiveBoxArrowDown,
} from "react-icons/hi2";
import AppShell from "components/AppShell";
import { Modal, Skeleton, SkeletonRows, EmptyState } from "components";
import EditProductModal from "categoriesComponents/editProductModal";
import UpdateProductModal from "categoriesComponents/updateProductModal";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet, apiDelete } from "utils/api";
import * as offlineCache from "offline/cache";

const statusStyles = {
  in_stock: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500",
  low_stock: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  out_of_stock: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
};

const statusLabelKeys = {
  in_stock: "inventory.inStock",
  low_stock: "inventory.lowStock",
  out_of_stock: "inventory.outOfStock",
};

function RowActionsMenu({ onEdit, onUpdate, onDelete }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Row actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <HiOutlineEllipsisVertical className="text-lg" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-surface-subtle dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <HiOutlinePencil className="text-base" />
            {t("common.edit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onUpdate();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-surface-subtle dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <HiOutlineArchiveBoxArrowDown className="text-base" />
            {t("pos.update")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10"
          >
            <HiOutlineTrash className="text-base" />
            {t("common.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

function LotsRow({ productId }) {
  const { t } = useLanguage();
  const [lots, setLots] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const fetchLots = async () => {
      try {
        setLots(
          await offlineCache.withFallback(
            () => apiGet(`/api/products/${productId}/lots`),
            () => offlineCache.getProductLots(productId)
          )
        );
      } catch (error) {
        console.error("Error fetching lots:", error);
        setLoadError(true);
        setLots([]);
      }
    };
    fetchLots();
  }, [productId]);

  return (
    <tr>
      <td colSpan={8} className="bg-surface-subtle px-5 py-4 dark:bg-gray-900">
        {lots === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("inventory.loadingLots")}</p>
        ) : loadError ? (
          <p className="text-sm text-danger-600 dark:text-danger-400">
            Couldn't load lots — check your connection and try again.
          </p>
        ) : lots.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("inventory.noLots")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="bg-surface-muted dark:bg-gray-800">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("inventory.lotCode")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("inventory.vendor")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("inventory.price")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("inventory.remaining")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("inventory.received")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                      {lot.lot_code}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {lot.vendor_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-100">Rs.{lot.buying_price}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          Number(lot.qty_remaining) > 0
                            ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500"
                            : "bg-surface-muted text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {lot.qty_remaining} / {lot.qty_received}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {new Date(lot.received_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function InventoryPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [inventory, setInventory] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [updateItem, setUpdateItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchInventory = async () => {
    try {
      setInventory(
        await offlineCache.withFallback(() => apiGet("/api/inventory"), offlineCache.getInventory)
      );
    } catch (error) {
      console.error("Error fetching inventory:", error);
      toast.error("Couldn't load inventory — check your connection and try again.");
    }
  };

  useEffect(() => {
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await apiDelete(`/product/${deleteItem.id}`);
      toast.success(`${deleteItem.productname} deleted successfully`);
      setDeleteItem(null);
      fetchInventory();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!inventory) {
    return (
      <AppShell title={t("inventory.title")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
            >
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="mb-2 h-3 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <SkeletonRows count={8} />
        </div>
      </AppShell>
    );
  }

  const categories = [
    ...new Map(
      inventory.items
        .filter((item) => item.category_id)
        .map((item) => [item.category_id, item.category_name])
    ),
  ];

  const filteredItems = inventory.items.filter((item) => {
    if (categoryFilter !== "all" && String(item.category_id) !== categoryFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (search.trim() && !item.productname.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  const statCards = [
    {
      label: t("inventory.totalSkus"),
      value: inventory.summary.totalSkus,
      icon: HiOutlineArchiveBox,
      tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    },
    {
      label: t("inventory.totalStockValue"),
      value: `Rs.${Number(inventory.summary.totalStockValue).toLocaleString()}`,
      icon: HiOutlineBanknotes,
      tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    },
    {
      label: t("inventory.lowStock"),
      value: inventory.summary.lowStockCount,
      icon: HiOutlineExclamationTriangle,
      tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    },
    {
      label: t("inventory.outOfStock"),
      value: inventory.summary.outOfStockCount,
      icon: HiOutlineXCircle,
      tint: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
    },
  ];

  return (
    <>
    <AppShell title={t("inventory.title")}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="flex items-center gap-4 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.tint}`}>
              <card.icon className="text-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className="truncate font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("inventory.searchPlaceholder")}
          className="h-10 w-64 max-w-full rounded-xl border border-surface-border bg-surface-subtle px-4 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-xl border border-surface-border bg-surface-subtle px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="all">{t("inventory.allCategories")}</option>
          {categories.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl border border-surface-border bg-surface-subtle px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="all">{t("inventory.allStatuses")}</option>
          <option value="in_stock">{t("inventory.inStock")}</option>
          <option value="low_stock">{t("inventory.lowStock")}</option>
          <option value="out_of_stock">{t("inventory.outOfStock")}</option>
        </select>
      </div>

      <div className="mt-6 w-full overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] border-collapse">
            <thead className="bg-surface-subtle dark:bg-gray-800">
              <tr>
                <th className="w-8"></th>
                <th className="w-[30%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.product")}
                </th>
                <th className="w-[15%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.category")}
                </th>
                <th className="w-[10%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.qty")}
                </th>
                <th className="w-[13%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.price")}
                </th>
                <th className="w-[14%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.value")}
                </th>
                <th className="w-[15%] px-2 py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.status")}
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border dark:divide-gray-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4">
                    <EmptyState icon={HiOutlineArchiveBox} title={t("inventory.noMatch")} />
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                      <td className="pl-3">
                        {item.isLotTracked && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                          >
                            {expandedId === item.id ? (
                              <HiOutlineChevronDown />
                            ) : (
                              <HiOutlineChevronRight />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="overflow-hidden px-3 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100">
                          <span className="truncate">{item.productname}</span>
                          {item.isLotTracked && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                              <HiOutlineQrCode />
                              {item.lot_count} lot{Number(item.lot_count) === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="overflow-hidden px-3 py-3 text-gray-600 dark:text-gray-300">
                        <span className="truncate block">{item.category_name || "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-800 dark:text-gray-100">{item.quantity}</td>
                      <td className="px-3 py-3 text-gray-800 dark:text-gray-100">
                        Rs.{item.buyingprice}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800 dark:text-gray-100">
                        Rs.{Number(item.stock_value).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 pr-5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>
                          {t(statusLabelKeys[item.status])}
                        </span>
                      </td>
                      <td className="px-2 py-3 pr-3">
                        <RowActionsMenu
                          onEdit={() => setEditItem(item)}
                          onUpdate={() => setUpdateItem(item)}
                          onDelete={() => setDeleteItem(item)}
                        />
                      </td>
                    </tr>
                    {expandedId === item.id && <LotsRow productId={item.id} />}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>

    <EditProductModal
      isOpen={!!editItem}
      onClose={() => setEditItem(null)}
      product={editItem}
      onUpdated={() => {
        setEditItem(null);
        fetchInventory();
      }}
    />

    <UpdateProductModal
      isOpen={!!updateItem}
      onClose={() => setUpdateItem(null)}
      initialProduct={
        updateItem && {
          product_id: updateItem.id,
          productname: updateItem.productname,
          category_id: updateItem.category_id,
          batch_tracked: updateItem.batch_tracked,
          buyingprice: updateItem.buyingprice,
          quantity: updateItem.quantity,
        }
      }
      onChanged={fetchInventory}
    />

    <Modal isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} title={t("common.delete")}>
      {deleteItem && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-danger-50 p-4 text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
            <HiOutlineExclamationTriangle className="mt-0.5 shrink-0 text-lg" />
            <p className="text-sm">
              Delete <span className="font-bold">{deleteItem.productname}</span> permanently?
              This can't be undone.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteItem(null)}
              disabled={deleting}
              className="flex-1 rounded-lg bg-surface-muted py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-surface-border disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              {t("sell.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="flex-1 rounded-lg bg-danger-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-danger-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
          </div>
        </div>
      )}
    </Modal>
    </>
  );
}
