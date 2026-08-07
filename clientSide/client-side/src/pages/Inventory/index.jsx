import React, { useEffect, useState } from "react";
import {
  HiOutlineArchiveBox,
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineXCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineQrCode,
} from "react-icons/hi2";
import AppShell from "components/AppShell";

const statusStyles = {
  in_stock: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500",
  low_stock: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  out_of_stock: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
};

const statusLabels = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

function LotsRow({ productId }) {
  const [lots, setLots] = useState(null);

  useEffect(() => {
    const fetchLots = async () => {
      try {
        const response = await fetch(`http://localhost:4000/api/products/${productId}/lots`);
        const data = await response.json();
        setLots(data);
      } catch (error) {
        console.error("Error fetching lots:", error);
        setLots([]);
      }
    };
    fetchLots();
  }, [productId]);

  return (
    <tr>
      <td colSpan={7} className="bg-surface-subtle px-5 py-4 dark:bg-gray-900">
        {lots === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading lots...</p>
        ) : lots.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No lots recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="bg-surface-muted dark:bg-gray-800">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Lot Code
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Vendor
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Price
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Remaining
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Received
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
  const [inventory, setInventory] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const fetchInventory = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/inventory");
      const data = await response.json();
      setInventory(data);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  if (!inventory) {
    return (
      <AppShell title="Inventory">
        <p className="text-gray-500 dark:text-gray-400">Loading inventory...</p>
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
      label: "Total SKUs",
      value: inventory.summary.totalSkus,
      icon: HiOutlineArchiveBox,
      tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    },
    {
      label: "Total Stock Value",
      value: `Rs.${Number(inventory.summary.totalStockValue).toLocaleString()}`,
      icon: HiOutlineBanknotes,
      tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    },
    {
      label: "Low Stock",
      value: inventory.summary.lowStockCount,
      icon: HiOutlineExclamationTriangle,
      tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    },
    {
      label: "Out of Stock",
      value: inventory.summary.outOfStockCount,
      icon: HiOutlineXCircle,
      tint: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
    },
  ];

  return (
    <AppShell title="Inventory">
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
          placeholder="Search by name..."
          className="h-10 w-64 max-w-full rounded-xl border border-surface-border bg-surface-subtle px-4 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-xl border border-surface-border bg-surface-subtle px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="all">All categories</option>
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
          <option value="all">All statuses</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      <div className="mt-6 w-full overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] border-collapse">
            <thead className="bg-surface-subtle dark:bg-gray-800">
              <tr>
                <th className="w-8"></th>
                <th className="w-[30%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Product
                </th>
                <th className="w-[15%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Category
                </th>
                <th className="w-[10%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Qty
                </th>
                <th className="w-[13%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Price
                </th>
                <th className="w-[14%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Value
                </th>
                <th className="w-[15%] px-2 py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border dark:divide-gray-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-500 dark:text-gray-400">
                    No products match these filters.
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
                          {statusLabels[item.status]}
                        </span>
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
  );
}
