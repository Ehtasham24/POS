import React, { useEffect, useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import useDebounce from "hooks/useDebounce";
import { HiOutlineMagnifyingGlass, HiOutlineCube, HiOutlinePlusCircle } from "react-icons/hi2";
import PriceEntryField from "./PriceEntryField";
import { apiGet, apiPut, apiPost, apiPatch } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// `initialProduct` (shape: {product_id, productname, category_id, batch_tracked,
// buyingprice, quantity}) skips the search step — used when opened for a specific,
// already-known product (e.g. Inventory's row menu) instead of the general "find any
// product" entry point (Categories toolbar's Update button).
const UpdateProductModal = ({ isOpen, onClose, initialProduct, onChanged }) => {
  const toast = useToast();
  const { t } = useLanguage();

  // --- Searchable product picker ---
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [categoryFilter, setCategoryFilter] = useState(""); // "" = all categories
  const [results, setResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null); // {product_id, productname, category_id, batch_tracked, buyingprice, quantity}

  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [formData, setFormData] = useState({ name: "", buying_price: "", quantity: "", category_id: "" });

  // --- Batch lots ---
  const [lots, setLots] = useState([]);
  const [showNewLotForm, setShowNewLotForm] = useState(false);
  const [newLot, setNewLot] = useState({ vendor_id: "", buying_price: "", quantity: "" });
  const [addStockLotId, setAddStockLotId] = useState("");
  const [addStockQty, setAddStockQty] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    apiGet("/categories")
      .then(setCategories)
      .catch((err) => console.error("Error fetching categories:", err));
    apiGet("/api/contacts?type=vendor")
      .then(setVendors)
      .catch((err) => console.error("Error fetching vendors:", err));
  }, [isOpen]);

  // Search narrows by category when one's picked (matches by name/lot code, then keeps
  // only that category's hits); with no query at all, picking a category browses that
  // category's full product list instead of requiring the user to type something first.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    let cancelled = false;

    const dedupeByProduct = (rows) => {
      const seen = new Set();
      return rows.filter((r) => {
        if (seen.has(r.product_id)) return false;
        seen.add(r.product_id);
        return true;
      });
    };

    if (trimmed) {
      apiGet(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (cancelled) return;
          const filtered = categoryFilter
            ? data.filter((r) => String(r.category_id) === categoryFilter)
            : data;
          setResults(dedupeByProduct(filtered));
        })
        .catch((err) => console.error("Error searching:", err));
    } else if (categoryFilter) {
      apiGet(`/categories/${categoryFilter}`)
        .then((data) => {
          if (cancelled) return;
          setResults(
            data.map((p) => ({
              product_id: p.id,
              productname: p.productname,
              category_id: p.category_id,
              batch_tracked: p.batch_tracked,
              buyingprice: p.buyingprice,
              quantity: p.quantity,
            }))
          );
        })
        .catch((err) => console.error("Error fetching category products:", err));
    } else {
      setResults([]);
    }

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, categoryFilter]);

  const fetchLots = async (productId) => {
    try {
      const data = await apiGet(`/api/products/${productId}/lots`);
      setLots(data);
    } catch (error) {
      console.error("Error fetching lots:", error);
    }
  };

  const handleSelectProduct = (result) => {
    setSelectedProduct(result);
    setQuery("");
    setResults([]);
    setFormData({
      name: result.productname,
      buying_price: result.buyingprice,
      quantity: result.quantity,
      category_id: result.category_id,
    });
    setShowNewLotForm(false);
    setAddStockLotId("");
    setAddStockQty("");
    if (result.batch_tracked) fetchLots(result.product_id);
  };

  useEffect(() => {
    if (isOpen && initialProduct) handleSelectProduct(initialProduct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialProduct]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveSimple = async (e) => {
    e.preventDefault();
    // Quantity can only go up here — a decrease needs "Adjust Stock" (Inventory page) so
    // it's reason-coded and attributed instead of a silent overwrite. Checked client-side
    // for immediate feedback; Sevices/productsService.js's updateItems enforces the same
    // floor server-side so it can't be bypassed by calling the API directly.
    if (Number(formData.quantity) < Number(selectedProduct.quantity)) {
      toast.error(t("inventory.quantityDecreaseBlocked"));
      return;
    }
    try {
      await apiPut(`/products/${selectedProduct.product_id}`, {
        name: formData.name,
        price: formData.buying_price,
        Quantity: formData.quantity,
        Category_id: formData.category_id,
      });
      toast.success("Product updated successfully!");
      onChanged?.();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddNewLot = async (e) => {
    e.preventDefault();
    try {
      const lot = await apiPost(`/api/products/${selectedProduct.product_id}/lots`, newLot);
      toast.success(`New lot created: ${lot.lot_code}`);
      setNewLot({ vendor_id: "", buying_price: "", quantity: "" });
      setShowNewLotForm(false);
      fetchLots(selectedProduct.product_id);
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    try {
      await apiPatch(`/api/lots/${addStockLotId}/add-stock`, { quantity: addStockQty });
      toast.success("Stock added to lot!");
      setAddStockQty("");
      fetchLots(selectedProduct.product_id);
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleClose = () => {
    setSelectedProduct(null);
    setQuery("");
    setCategoryFilter("");
    setResults([]);
    onClose();
  };

  const selectedLotForAddStock = lots.find((lot) => String(lot.id) === String(addStockLotId));

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Update Product">
      {!selectedProduct ? (
        <div className="relative">
          <label className={labelClass}>Find a product</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or lot code..."
              className={inputClass}
              autoFocus
            />
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          {/* Narrows search to one category, or — with the search box left empty —
              browses that category's full product list on its own. */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.category_name}
              </option>
            ))}
          </select>
          {results.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-surface-border dark:border-gray-700">
              {results.map((result) => (
                <li key={result.product_id}>
                  <button
                    type="button"
                    onClick={() => handleSelectProduct(result)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-subtle dark:hover:bg-gray-700"
                  >
                    <HiOutlineCube className="shrink-0 text-primary-600 dark:text-primary-400" />
                    <span className="flex-1 truncate text-gray-800 dark:text-gray-100">
                      {result.productname}
                    </span>
                    {result.batch_tracked && (
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                        batch
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedProduct(null)}
            className="text-sm text-primary-600 hover:underline"
          >
            &larr; Choose a different product
          </button>

          <form className="space-y-4" onSubmit={handleSaveSimple}>
            <div>
              <label htmlFor="up_product_name" className={labelClass}>
                Product Name
              </label>
              <input
                type="text"
                name="name"
                id="up_product_name"
                value={formData.name}
                onChange={handleChange}
                className={inputClass}
                required
              />
            </div>

            {!selectedProduct.batch_tracked && (
              <>
                <div>
                  <label htmlFor="up_buying_price" className={labelClass}>
                    Buying Price
                  </label>
                  <input
                    type="number"
                    name="buying_price"
                    id="up_buying_price"
                    value={formData.buying_price}
                    onChange={handleChange}
                    className={inputClass}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="up_quantity" className={labelClass}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    id="up_quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    className={inputClass}
                    min="0"
                    step="1"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="up_category_id" className={labelClass}>
                Category
              </label>
              <select
                name="category_id"
                id="up_category_id"
                value={formData.category_id}
                onChange={handleChange}
                className={inputClass}
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700"
            >
              Save Changes
            </button>
          </form>

          {selectedProduct.batch_tracked && (
            <div className="space-y-4 border-t border-surface-border pt-4 dark:border-gray-700">
              <p className={labelClass}>Lots (inventory at a glance)</p>
              <div className="overflow-hidden rounded-lg border border-surface-border dark:border-gray-700">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-subtle dark:bg-gray-800">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Code</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Vendor</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Price</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {lots.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">
                          No lots yet.
                        </td>
                      </tr>
                    ) : (
                      lots.map((lot) => (
                        <tr key={lot.id}>
                          <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-100">{lot.lot_code}</td>
                          <td className="px-2 py-2 text-gray-600 dark:text-gray-300">{lot.vendor_name || "—"}</td>
                          <td className="px-2 py-2 text-gray-800 dark:text-gray-100">Rs.{lot.buying_price}</td>
                          <td className="px-2 py-2 text-gray-800 dark:text-gray-100">{lot.qty_remaining}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add to existing lot */}
              <form onSubmit={handleAddStock} className="rounded-lg border border-surface-border p-3 dark:border-gray-700">
                <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">Add to existing stock</p>
                <select
                  value={addStockLotId}
                  onChange={(e) => setAddStockLotId(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="" disabled>
                    Select lot
                  </option>
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lot_code} — Rs.{lot.buying_price} ({lot.qty_remaining} left)
                    </option>
                  ))}
                </select>
                {selectedLotForAddStock && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Current price Rs.{selectedLotForAddStock.buying_price}, {selectedLotForAddStock.qty_remaining} remaining.
                  </p>
                )}
                <input
                  type="number"
                  value={addStockQty}
                  onChange={(e) => setAddStockQty(e.target.value)}
                  placeholder="Quantity to add"
                  className={inputClass}
                  min="1"
                  step="1"
                  required
                />
                <button
                  type="submit"
                  disabled={!addStockLotId}
                  className="mt-2 w-full rounded-lg bg-surface-muted py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-surface-border disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  Add Stock
                </button>
              </form>

              {/* New lot */}
              {!showNewLotForm ? (
                <button
                  type="button"
                  onClick={() => setShowNewLotForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-border py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-500/10"
                >
                  <HiOutlinePlusCircle />
                  New lot (price changed / new batch)
                </button>
              ) : (
                <form onSubmit={handleAddNewLot} className="rounded-lg border border-surface-border p-3 dark:border-gray-700">
                  <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">New lot</p>
                  <select
                    value={newLot.vendor_id}
                    onChange={(e) => setNewLot((prev) => ({ ...prev, vendor_id: e.target.value }))}
                    className={inputClass}
                    required
                  >
                    <option value="" disabled>
                      Select vendor
                    </option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={newLot.quantity}
                    onChange={(e) => setNewLot((prev) => ({ ...prev, quantity: e.target.value }))}
                    placeholder="Quantity"
                    className={inputClass}
                    min="1"
                    step="1"
                    required
                  />
                  <div className="mt-3">
                    <PriceEntryField
                      idPrefix="new_lot"
                      quantity={newLot.quantity}
                      price={newLot.buying_price}
                      onPriceChange={(value) => setNewLot((prev) => ({ ...prev, buying_price: value }))}
                      label="Buying price"
                      inputClassName={inputClass}
                      labelClassName={labelClass}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewLotForm(false)}
                      className="flex-1 rounded-lg bg-surface-muted py-2 text-sm font-medium text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newLot.buying_price}
                      className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Create Lot
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default UpdateProductModal;
