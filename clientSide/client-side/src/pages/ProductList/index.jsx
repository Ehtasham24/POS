import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { addCart } from "cartRedux/cartSlice";
import { Modal } from "components";
import { useParams, Link } from "react-router-dom";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineCube,
  HiOutlineShoppingCart,
  HiOutlineQrCode,
  HiOutlinePlusCircle,
} from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows, EmptyState } from "components";
import CartDock from "categoriesComponents/CartDock";
import AddProductModal from "categoriesComponents/addProductModel";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";
import * as offlineCache from "offline/cache";

export default function ProductListPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellingPrice, setSellingPrice] = useState("");
  const [sellQuantity, setSellQuantity] = useState("1");
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  // Lot picker for batch-tracked products
  const [lotPickProduct, setLotPickProduct] = useState(null);
  const [availableLots, setAvailableLots] = useState([]);

  const { prodNum } = useParams(); // Get the category ID from the URL
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategories(
          await offlineCache.withFallback(() => apiGet("/categories"), offlineCache.getCategories)
        );
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Couldn't load categories — check your connection and try again.");
      }
    };

    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProducts = async () => {
    if (!prodNum) return; // Don't fetch products if no category is selected
    setLoading(true);
    try {
      const data = await offlineCache.withFallback(
        () => apiGet(`/categories/${prodNum}`),
        () => offlineCache.getProductsForCategory(prodNum)
      );
      const filteredProducts = data.filter((product) =>
        product.productname.toLowerCase().includes(searchValue.toLowerCase())
      );
      setProducts(filteredProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Couldn't load products — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodNum, searchValue]);

  const handleSearchInputChange = (event) => {
    setSearchValue(event.target.value);
  };

  const handleSellClick = async (product) => {
    setSellQuantity("1");

    if (!product.batch_tracked) {
      setSelectedProduct(product);
      setShowPopup(true);
      return;
    }

    setLotPickProduct(product);
    try {
      const lots = await offlineCache.withFallback(
        () => apiGet(`/api/products/${product.id}/lots`),
        () => offlineCache.getProductLots(product.id)
      );
      setAvailableLots(lots.filter((lot) => lot.qty_remaining > 0));
    } catch (error) {
      console.error("Error fetching lots:", error);
      toast.error("Couldn't load lots — check your connection and try again.");
      setAvailableLots([]);
    }
  };

  const handleLotPick = (lot) => {
    setSellQuantity("1");
    setSelectedProduct({
      id: `lot-${lot.id}`,
      productId: lotPickProduct.id,
      productname: lotPickProduct.productname,
      category_id: lotPickProduct.category_id,
      quantity: lot.qty_remaining,
      buyingprice: lot.buying_price,
      lotId: lot.id,
      lotCode: lot.lot_code,
    });
    setLotPickProduct(null);
    setAvailableLots([]);
    setShowPopup(true);
  };

  const sellMaxQty = selectedProduct?.quantity || 0;
  const sellQtyNum = parseInt(sellQuantity, 10) || 0;
  const sellQtyInvalid = !selectedProduct || sellQtyNum < 1 || sellQtyNum > sellMaxQty;

  const handlePopupSubmit = () => {
    if (!sellingPrice || sellQtyInvalid) return;

    const productWithPrice = {
      ...selectedProduct,
      productId: selectedProduct.productId || selectedProduct.id,
      sellingPrice: parseInt(sellingPrice, 10),
      sellingQuantity: sellQtyNum,
    };
    dispatch(addCart(productWithPrice));
    setShowPopup(false);
    setSellingPrice("");
    setSellQuantity("1");
  };

  const visibleProducts = products.filter((product) => product.quantity >= 1);

  return (
    <>
      <AppShell
        title={t("productList.title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-72 max-w-full">
              <input
                type="text"
                value={searchValue}
                onChange={handleSearchInputChange}
                placeholder={t("productList.filterPlaceholder")}
                className="h-10 w-full rounded-xl border border-surface-border bg-surface-subtle pl-4 pr-10 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute inset-y-0 right-3 my-auto text-lg text-gray-500 dark:text-gray-400" />
            </div>
            <button
              type="button"
              onClick={() => setIsAddProductOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
            >
              <HiOutlinePlusCircle className="text-lg" />
              {t("pos.addProduct")}
            </button>
          </div>
        }
      >
        <div className="cartDock:pr-96 pb-16 cartDock:pb-0">
        {/* Category pill filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((category) => {
            const isActive = String(category.id) === String(prodNum);
            return (
              <Link
                key={category.id}
                to={`/categories/${category.id}`}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary-600 text-white-A700 shadow-md shadow-primary-900/20"
                    : "bg-surface-subtle text-gray-700 hover:bg-surface-muted dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {category.category_name}
              </Link>
            );
          })}
        </div>

        <div className="w-full overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="max-h-[70vh] overflow-auto">
            {/* table-fixed + fixed px widths on every column but Product (which gets the
                remainder): auto layout was letting a long product name wrap onto several
                lines, and since the "N lots" badge sits beside it in the same items-center
                flex row, it ended up vertically centered against that multi-line block —
                landing visually on top of the Quantity column's badge on a phone-narrow
                table. Product now truncates to one line (title attr for the full name)
                instead of wrapping, so the row height — and every badge's position — stays
                predictable regardless of name length. */}
            <table className="w-full min-w-[640px] table-fixed border-collapse">
              <thead className="sticky top-0 bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="pl-5 pr-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("inventory.product")}
                  </th>
                  <th className="w-32 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("productList.quantity")}
                  </th>
                  <th className="w-24 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("productList.buyingPrice")}
                  </th>
                  <th className="w-40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={4}>
                      <SkeletonRows count={5} />
                    </td>
                  </tr>
                ) : visibleProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4">
                      <EmptyState icon={HiOutlineCube} title={t("productList.empty")} />
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60"
                    >
                      <td className="pl-5 pr-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
                            <HiOutlineCube className="text-lg text-primary-600 dark:text-primary-400" />
                          </div>
                          {/* min-w-0 is what actually lets a flex child shrink below its
                              content size — without it, truncate has no room to kick in and
                              the name just wraps instead, dragging the "N lots" badge (kept
                              on one line via shrink-0) down with it. */}
                          <span
                            className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
                            title={product.productname}
                          >
                            {product.productname}
                          </span>
                          {product.batch_tracked && (
                            <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                              {product.lot_count} lot{Number(product.lot_count) === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex max-w-full truncate rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          {product.quantity} {t("sell.inStock").toLowerCase()}
                        </span>
                      </td>
                      <td className="truncate px-3 py-3 text-gray-800 dark:text-gray-100">
                        Rs.{product.buyingprice}
                      </td>
                      <td className="py-3 pr-5 text-right whitespace-nowrap space-x-2">
                        <button
                          onClick={() => handleSellClick(product)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-bold uppercase text-white-A700 transition-colors hover:bg-primary-700"
                        >
                          {product.batch_tracked ? <HiOutlineQrCode /> : <HiOutlineShoppingCart />}
                          {product.batch_tracked ? t("productList.pickLot") : t("sell.addToCart")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </AppShell>

      <CartDock />

      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        defaultCategoryId={prodNum}
        onAdded={fetchProducts}
      />

      {/* Lot picker (batch-tracked products) */}
      <Modal
        isOpen={!!lotPickProduct}
        onClose={() => setLotPickProduct(null)}
        title={`Pick a lot — ${lotPickProduct?.productname || ""}`}
      >
        {availableLots.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No stock available in any lot.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {availableLots.map((lot) => (
              <li key={lot.id}>
                <button
                  type="button"
                  onClick={() => handleLotPick(lot)}
                  className="flex w-full items-center justify-between rounded-lg border border-surface-border px-4 py-3 text-left transition-colors hover:bg-surface-subtle dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <span>
                    <span className="block font-semibold text-gray-800 dark:text-gray-100">
                      {lot.lot_code}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t("inventory.vendor")}: {lot.vendor_name || "—"}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block font-medium text-gray-800 dark:text-gray-100">
                      Rs.{lot.buying_price}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {lot.qty_remaining} left
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Sell detail: full product info + quantity + price, in one place */}
      <Modal isOpen={showPopup} onClose={() => setShowPopup(false)} title={t("sell.title")}>
        {selectedProduct && (
          <>
            <div className="mb-4 rounded-xl bg-surface-subtle p-3 dark:bg-gray-900/40">
              <p className="font-poppins text-base font-bold text-gray-800 dark:text-gray-100">
                {selectedProduct.productname}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-gray-500 dark:text-gray-400">{t("sell.category")}</dt>
                <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                  {categories.find((c) => c.id === selectedProduct.category_id)?.category_name || "—"}
                </dd>
                {selectedProduct.lotCode && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">{t("sell.lot")}</dt>
                    <dd className="text-right font-medium text-primary-600 dark:text-primary-400">
                      {selectedProduct.lotCode}
                    </dd>
                  </>
                )}
                <dt className="text-gray-500 dark:text-gray-400">{t("sell.inStock")}</dt>
                <dd className="text-right font-medium text-gray-800 dark:text-gray-100">{sellMaxQty}</dd>
                <dt className="text-gray-500 dark:text-gray-400">{t("sell.costPrice")}</dt>
                <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                  Rs.{selectedProduct.buyingprice}
                </dd>
              </dl>
            </div>

            <div className="mb-1 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {t("sell.quantity")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={sellMaxQty}
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(e.target.value)}
                  className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {t("sell.sellingPrice")}
                </label>
                <input
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  placeholder={t("sell.sellingPrice")}
                  autoFocus
                />
              </div>
            </div>
            {sellQtyInvalid && (
              <p className="mb-2 text-xs font-medium text-danger-600">
                {t("sell.quantityError", { max: sellMaxQty })}
              </p>
            )}

            <div className="mt-3 flex justify-end gap-3">
              <button
                onClick={() => setShowPopup(false)}
                className="px-4 py-2 bg-surface-muted dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-surface-border dark:hover:bg-gray-600 transition-colors"
              >
                {t("sell.cancel")}
              </button>
              <button
                onClick={handlePopupSubmit}
                disabled={sellQtyInvalid || !sellingPrice}
                className="px-4 py-2 bg-primary-600 text-white-A700 rounded-lg hover:bg-primary-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("sell.addToCart")}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
