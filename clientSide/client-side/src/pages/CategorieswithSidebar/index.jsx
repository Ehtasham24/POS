import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  HiOutlinePlusCircle,
  HiOutlineTag,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineSquares2X2,
  HiOutlineArrowRight,
  HiOutlineMagnifyingGlass,
  HiOutlineCube,
  HiOutlineQrCode,
} from "react-icons/hi2";
import { addCart } from "cartRedux/cartSlice";
import useDebounce from "hooks/useDebounce";
import { useLanguage } from "i18n/LanguageContext";

import AppShell from "components/AppShell";
import { Modal } from "components";
import AddProductModal from "categoriesComponents/addProductModel";
import AddCategoryModal from "categoriesComponents/addCategoryModal";
import DeleteProductModal from "categoriesComponents/deleteProductModal";
import UpdateProductModal from "categoriesComponents/updateProductModal";
import CartPanel from "categoriesComponents/CartPanel";

const toolbarButtonClass =
  "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";

export default function CategorieswithSidebarPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [categories, setCategories] = useState([]);

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isDeleteProductOpen, setIsDeleteProductOpen] = useState(false);
  const [isUpdateProductOpen, setIsUpdateProductOpen] = useState(false);

  // --- Sell search (name or lot code) ---
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // --- Sell flow: pick a lot (batch products only) -> enter selling price -> add to cart ---
  const [lotPickProduct, setLotPickProduct] = useState(null); // product being lot-picked
  const [availableLots, setAvailableLots] = useState([]);
  const [sellContext, setSellContext] = useState(null); // { product, lot? }
  const [sellingPrice, setSellingPrice] = useState("");
  const [sellQuantity, setSellQuantity] = useState("1");

  const fetchData = async () => {
    try {
      const response = await fetch("http://localhost:4000/categories");
      if (!response.ok) throw new Error("Failed to fetch categories: " + response.status);
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `http://localhost:4000/api/search?q=${encodeURIComponent(trimmed)}`
        );
        const data = await response.json();
        if (!cancelled) {
          setResults(data);
          setHighlightedIndex(data.length > 0 ? 0 : -1);
        }
      } catch (error) {
        console.error("Error searching:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const productsPage = (prodNum) => navigate(`/categories/${prodNum}`);

  const handleSearchKeyDown = (e) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleResultClick(results[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setResults([]);
      setHighlightedIndex(-1);
    }
  };

  const handleResultClick = async (result) => {
    setQuery("");
    setResults([]);
    setHighlightedIndex(-1);

    if (result.lot_id) {
      // Searched/scanned an exact lot code — skip straight to the sell detail panel.
      setSellQuantity("1");
      setSellContext({
        product: result,
        lot: {
          id: result.lot_id,
          lot_code: result.matched_lot_code,
          buying_price: result.lot_buying_price,
          qty_remaining: result.lot_qty_remaining,
        },
      });
      return;
    }

    if (result.batch_tracked) {
      setLotPickProduct(result);
      try {
        const response = await fetch(
          `http://localhost:4000/api/products/${result.product_id}/lots`
        );
        const lots = await response.json();
        setAvailableLots(lots.filter((lot) => lot.qty_remaining > 0));
      } catch (error) {
        console.error("Error fetching lots:", error);
        setAvailableLots([]);
      }
      return;
    }

    setSellQuantity("1");
    setSellContext({ product: result });
  };

  const handleLotPick = (lot) => {
    setSellQuantity("1");
    setSellContext({ product: lotPickProduct, lot });
    setLotPickProduct(null);
    setAvailableLots([]);
  };

  const sellMaxQty = sellContext
    ? sellContext.lot
      ? sellContext.lot.qty_remaining
      : sellContext.product.quantity
    : 0;
  const sellQtyNum = parseInt(sellQuantity, 10) || 0;
  const sellQtyInvalid = !sellContext || sellQtyNum < 1 || sellQtyNum > sellMaxQty;

  const handlePriceSubmit = () => {
    if (!sellingPrice || sellQtyInvalid || !sellContext) return;
    const { product, lot } = sellContext;

    dispatch(
      addCart({
        id: lot ? `lot-${lot.id}` : product.product_id,
        productId: product.product_id,
        productname: product.productname,
        category_id: product.category_id,
        quantity: sellMaxQty,
        lotId: lot?.id,
        lotCode: lot?.lot_code,
        sellingPrice: parseInt(sellingPrice, 10),
        sellingQuantity: sellQtyNum,
      })
    );

    setSellContext(null);
    setSellingPrice("");
    setSellQuantity("1");
  };

  return (
    <>
      <AddProductModal isOpen={isAddProductOpen} onClose={() => setIsAddProductOpen(false)} />
      <AddCategoryModal
        isOpen={isAddCategoryOpen}
        onClose={() => setIsAddCategoryOpen(false)}
        onCategoryAdded={fetchData}
      />
      <DeleteProductModal isOpen={isDeleteProductOpen} onClose={() => setIsDeleteProductOpen(false)} />
      <UpdateProductModal isOpen={isUpdateProductOpen} onClose={() => setIsUpdateProductOpen(false)} />

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
                      Vendor: {lot.vendor_name || "—"}
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
      <Modal isOpen={!!sellContext} onClose={() => setSellContext(null)} title={t("sell.title")}>
        {sellContext && (
          <>
            <div className="mb-4 rounded-xl bg-surface-subtle p-3 dark:bg-gray-900/40">
              <p className="font-poppins text-base font-bold text-gray-800 dark:text-gray-100">
                {sellContext.product.productname}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-gray-500 dark:text-gray-400">{t("sell.category")}</dt>
                <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                  {categories.find((c) => c.id === sellContext.product.category_id)?.category_name || "—"}
                </dd>
                {sellContext.lot && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">{t("sell.lot")}</dt>
                    <dd className="text-right font-medium text-primary-600 dark:text-primary-400">
                      {sellContext.lot.lot_code}
                    </dd>
                  </>
                )}
                <dt className="text-gray-500 dark:text-gray-400">{t("sell.inStock")}</dt>
                <dd className="text-right font-medium text-gray-800 dark:text-gray-100">{sellMaxQty}</dd>
                <dt className="text-gray-500 dark:text-gray-400">{t("sell.costPrice")}</dt>
                <dd className="text-right font-medium text-gray-800 dark:text-gray-100">
                  Rs.{sellContext.lot ? sellContext.lot.buying_price : sellContext.product.buyingprice}
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
                onClick={() => setSellContext(null)}
                className="rounded-lg bg-surface-muted px-4 py-2 text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              >
                {t("sell.cancel")}
              </button>
              <button
                onClick={handlePriceSubmit}
                disabled={sellQtyInvalid || !sellingPrice}
                className="rounded-lg bg-primary-600 px-4 py-2 text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("sell.addToCart")}
              </button>
            </div>
          </>
        )}
      </Modal>

      <AppShell
        title={t("nav.categories")}
        hideSearch
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsAddProductOpen(true)}
              className={`${toolbarButtonClass} bg-primary-600 text-white-A700 hover:bg-primary-700`}
            >
              <HiOutlinePlusCircle className="text-lg" />
              {t("pos.addProduct")}
            </button>
            <button
              type="button"
              onClick={() => setIsAddCategoryOpen(true)}
              className={`${toolbarButtonClass} bg-surface-muted text-gray-800 hover:bg-surface-border dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`}
            >
              <HiOutlineTag className="text-lg" />
              {t("pos.addCategory")}
            </button>
            <button
              type="button"
              onClick={() => setIsUpdateProductOpen(true)}
              className={`${toolbarButtonClass} bg-surface-muted text-gray-800 hover:bg-surface-border dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`}
            >
              <HiOutlinePencil className="text-lg" />
              {t("pos.update")}
            </button>
            <button
              type="button"
              onClick={() => setIsDeleteProductOpen(true)}
              className={`${toolbarButtonClass} bg-danger-50 text-danger-600 hover:bg-danger-100 dark:bg-danger-500/10 dark:hover:bg-danger-500/20`}
            >
              <HiOutlineTrash className="text-lg" />
              {t("pos.delete")}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-6 md:flex-col">
          {/* Main column: sell search + category grid */}
          <div className="min-w-0 flex-1">
            <div className="relative mb-6">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("pos.searchPlaceholder")}
                className="h-12 w-full rounded-xl border border-surface-border bg-white-A700 pl-11 pr-4 text-sm shadow-card focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                autoFocus
              />
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute inset-y-0 left-4 my-auto text-lg text-gray-500 dark:text-gray-400" />

              {results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
                  <ul className="max-h-96 overflow-y-auto">
                    {results.map((result, index) => (
                      <li key={`${result.product_id}-${result.lot_id || ""}`}>
                        <button
                          type="button"
                          onClick={() => handleResultClick(result)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors dark:hover:bg-gray-700 ${
                            index === highlightedIndex
                              ? "bg-surface-subtle dark:bg-gray-700"
                              : "hover:bg-surface-subtle"
                          }`}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-gray-700">
                            <HiOutlineCube className="text-lg text-primary-600 dark:text-primary-400" />
                          </div>
                          <span className="flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                            {result.productname}
                          </span>
                          {result.matched_lot_code && (
                            <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                              <HiOutlineQrCode />
                              {result.matched_lot_code}
                            </span>
                          )}
                          {result.batch_tracked && !result.matched_lot_code && (
                            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                              {t("pos.pickLot")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-border py-24 text-center dark:border-gray-700">
                <HiOutlineSquares2X2 className="text-4xl text-gray-400" />
                <p className="text-gray-500 dark:text-gray-400">{t("pos.noCategories")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-5 md:grid-cols-2 sm:grid-cols-1 sm:gap-2.5">
                {categories.map((category) => (
                  <button
                    onClick={() => productsPage(category.id)}
                    key={category.id}
                    className="group text-left rounded-2xl bg-white-A700 dark:bg-gray-800 border border-surface-border dark:border-gray-700 shadow-card hover:border-primary-300 hover:shadow-cardHover dark:hover:border-primary-500/40 transition-all duration-200 sm:rounded-xl sm:shadow-none"
                  >
                    {/* Rich card on tablet/desktop; compact single-row list on phones (sm) */}
                    <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-3 sm:p-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-50 dark:bg-gray-700 sm:h-10 sm:w-10 sm:rounded-lg">
                        <HiOutlineSquares2X2 className="text-2xl text-primary-600 dark:text-primary-400 sm:text-lg" />
                      </div>
                      <div className="min-w-0 sm:flex-1">
                        <h2 className="truncate font-poppins text-lg font-bold text-gray-800 dark:text-gray-100 sm:text-base">
                          {category.category_name}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 sm:hidden">{t("pos.collection")}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 dark:text-primary-400 sm:hidden">
                        {t("pos.viewProducts")}
                        <HiOutlineArrowRight className="transition-transform group-hover:translate-x-1" />
                      </div>
                      <HiOutlineArrowRight className="hidden shrink-0 text-gray-400 dark:text-gray-500 sm:block" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Always-visible live cart — only on genuinely wide screens (>=1400px).
              Narrower widths (incl. portrait monitors, tablets, phones) don't have room
              to spare for a reserved cart column, so they get the floating icon instead
              (rendered globally by AppShell). */}
          <div className="hidden cartRail:block sticky top-24 w-96 shrink-0 rounded-2xl border border-surface-border bg-white-A700 shadow-card dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-surface-border px-4 py-3 font-poppins font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
              {t("cart.title")}
            </div>
            <div className="h-[70vh] max-h-[560px]">
              <CartPanel />
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
