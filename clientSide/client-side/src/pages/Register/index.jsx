import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineSquares2X2,
  HiOutlineListBullet,
  HiOutlineQrCode,
  HiOutlineClock,
  HiOutlineChevronDown,
  HiOutlinePlusCircle,
  HiOutlineTag,
  HiOutlinePencilSquare,
  HiOutlineShoppingCart,
  HiOutlineCube,
} from "react-icons/hi2";
import AppShell from "components/AppShell";
import { EmptyState } from "components";
import CartPanel from "categoriesComponents/CartPanel";
import AddProductModal from "categoriesComponents/addProductModel";
import AddCategoryModal from "categoriesComponents/addCategoryModal";
import UpdateProductModal from "categoriesComponents/updateProductModal";
import OpenShiftModal from "categoriesComponents/OpenShiftModal";
import { addCart } from "cartRedux/cartSlice";
import { useLanguage } from "i18n/LanguageContext";
import { useAuth } from "auth/AuthContext";
import { useToast } from "components/Toast/ToastContext";
import useDebounce from "hooks/useDebounce";
import useMediaQuery from "hooks/useMediaQuery";
import useShiftStatus, { isShiftOpenTooLong } from "hooks/useShiftStatus";
import { apiGet } from "utils/api";
import * as offlineCache from "offline/cache";
import { formatPKR } from "utils/money";
import { loadLastPrices, priceFrom, rememberPrices, loadRegisterView, saveRegisterView } from "utils/posMemory";
import { buildCategoryColors } from "./categoryColors";
import ProductGrid from "./ProductGrid";
import SellDialog from "./SellDialog";

// Same breakpoint as tailwind.config.js's `posSplit` screen.
const SPLIT_QUERY = "(min-width: 860px)";

// GET /products rows (and the offline mirror's, where booleans are 0/1 and numbers may be
// strings) -> one shape every register component works with.
const normalizeProduct = (p) => ({
  productId: p.id,
  productname: p.productname,
  category_id: p.category_id,
  batch_tracked: !!p.batch_tracked,
  buyingprice: Number(p.buyingprice) || 0,
  quantity: Number(p.quantity) || 0,
});

// /api/search rows -> same shape; a lot-code match carries its lot along.
const normalizeSearchResult = (r) => ({
  productId: r.product_id,
  productname: r.productname,
  category_id: r.category_id,
  batch_tracked: !!r.batch_tracked,
  buyingprice: Number(r.buyingprice) || 0,
  quantity: Number(r.quantity) || 0,
  lot: r.lot_id
    ? { id: r.lot_id, lot_code: r.matched_lot_code, buying_price: r.lot_buying_price, qty_remaining: r.lot_qty_remaining }
    : undefined,
});

const toolbarButtonClass =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors";

// The POS register: everything needed to ring up a sale on one screen — search/scan,
// category tabs, product grid, and the current sale beside it. Replaces the old two-step
// flow (Categories page -> a category's Product List page -> a modal per item). Deep links
// to "/categories/:id" and "/productlist/:id" still work: they open the register with that
// category's tab selected.
export default function RegisterPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { prodNum } = useParams();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  // Refreshed on every visit — the shift may have been opened/closed on the Shifts page.
  const { shift: currentShift, refresh: refreshShift } = useShiftStatus({ refreshOnMount: true });
  const isSplit = useMediaQuery(SPLIT_QUERY);
  const cart = useSelector((state) => state.cart.carts);

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [lastPrices, setLastPrices] = useState(loadLastPrices);
  const [view, setView] = useState(loadRegisterView);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [lotMatches, setLotMatches] = useState([]);
  const [dialogProduct, setDialogProduct] = useState(null);
  const [poppedId, setPoppedId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [modal, setModal] = useState(null); // "addProduct" | "addCategory" | "editProducts" | "openShift"
  const searchRef = useRef(null);
  const manageRef = useRef(null);

  const activeCategoryId = prodNum ? Number(prodNum) : null;

  const fetchCatalog = useCallback(async () => {
    try {
      const [cats, prods, settings] = await Promise.all([
        offlineCache.withFallback(() => apiGet("/categories"), offlineCache.getCategories),
        offlineCache.withFallback(() => apiGet("/products"), offlineCache.getProducts),
        offlineCache.withFallback(() => apiGet("/api/settings"), offlineCache.getSettings).catch(() => ({})),
      ]);
      setCategories(cats);
      setProducts(prods.map(normalizeProduct));
      setLowStockThreshold(Number(settings.low_stock_threshold) || 10);
    } catch (error) {
      console.error("Error loading the register:", error);
      toast.error("Couldn't load products — check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Lot codes are the one thing the catalog on screen can't match by itself (they live on
  // lots, not products) — a scanned/typed code is looked up on the server (or the offline
  // mirror) and shown above the grid as a direct "sell this lot" shortcut.
  const searchLots = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];
    try {
      const results = await offlineCache.withFallback(
        () => apiGet(`/api/search?q=${encodeURIComponent(trimmed)}`),
        () => offlineCache.searchProducts(trimmed)
      );
      return results.filter((r) => r.lot_id).map(normalizeSearchResult);
    } catch (error) {
      console.error("Error searching lots:", error);
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    searchLots(debouncedQuery).then((matches) => !cancelled && setLotMatches(matches));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, searchLots]);

  // F2 jumps to search from anywhere on the register (a scanner types straight into it).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!manageOpen) return;
    const onDown = (e) => manageRef.current && !manageRef.current.contains(e.target) && setManageOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [manageOpen]);

  const colorFor = useMemo(() => buildCategoryColors(categories), [categories]);
  const categoryName = (id) => categories.find((c) => c.id === id)?.category_name;

  const productCountByCategory = useMemo(() => {
    const counts = new Map();
    for (const p of products) counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
    return counts;
  }, [products]);

  // Searching looks across every category; otherwise the selected tab filters. In-stock
  // first, then by name — a stable order, so a product stays where the cashier learned it.
  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (q ? p.productname.toLowerCase().includes(q) : !activeCategoryId || p.category_id === activeCategoryId))
      .sort((a, b) => (b.quantity > 0) - (a.quantity > 0) || a.productname.localeCompare(b.productname));
  }, [products, query, activeCategoryId]);

  const inCartQty = useCallback(
    (lineId) => cart.find((line) => line.id === lineId)?.sellingQuantity || 0,
    [cart]
  );
  const inCartQtyFor = useCallback(
    (productId) => cart.reduce((sum, line) => sum + ((line.productId || line.id) === productId ? line.sellingQuantity : 0), 0),
    [cart]
  );

  const pop = (productId) => {
    setPoppedId(null);
    requestAnimationFrame(() => setPoppedId(productId));
  };

  const addLine = (line) => {
    dispatch(addCart(line));
    rememberPrices([line]);
    setLastPrices(loadLastPrices());
    pop(line.productId);
  };

  // One tap sells at the price this product last went for on this till; the price stays
  // editable in the sale. Batch products (which lot?) and never-sold products (what price?)
  // open the dialog instead.
  const pick = (product) => {
    if (product.quantity <= 0) return;
    const remembered = priceFrom(lastPrices, product.productId);
    if (product.batch_tracked || product.lot || !remembered) {
      setDialogProduct(product);
      return;
    }
    if (inCartQty(product.productId) >= product.quantity) {
      toast.warning(t("register.onlyNLeft", { n: product.quantity }));
      return;
    }
    addLine({
      id: product.productId,
      productId: product.productId,
      productname: product.productname,
      category_id: product.category_id,
      quantity: product.quantity,
      sellingPrice: remembered,
      sellingQuantity: 1,
      costPrice: product.buyingprice,
    });
  };

  // Enter in search: an exact lot code (what a scanner sends) sells that lot; otherwise a
  // single matching product is picked. Anything ambiguous just stays filtered on screen.
  const handleSearchKeyDown = async (e) => {
    if (e.key === "Escape") {
      setQuery("");
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // A scanner types faster than the debounce — look up this exact code right now.
    const matches = debouncedQuery === query ? lotMatches : await searchLots(q);
    const exactLot = matches.find((m) => m.lot?.lot_code?.toLowerCase() === q.toLowerCase());
    if (exactLot) {
      setQuery("");
      setDialogProduct(exactLot);
    } else if (visibleProducts.length === 1) {
      setQuery("");
      pick(visibleProducts[0]);
    } else if (matches.length === 1 && visibleProducts.length === 0) {
      setQuery("");
      setDialogProduct(matches[0]);
    }
  };

  const selectCategory = (id) => navigate(id ? `/categories/${id}` : "/", { replace: true });

  const setViewMode = (mode) => {
    setView(mode);
    saveRegisterView(mode);
  };

  const refreshAfterChange = () => {
    fetchCatalog();
    setLastPrices(loadLastPrices());
  };

  const cartCount = cart.reduce((sum, line) => sum + line.sellingQuantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.sellingPrice * line.sellingQuantity, 0);

  const shiftPill =
    currentShift !== null ? (
      currentShift && isShiftOpenTooLong(currentShift) ? (
        <Link
          to="/shifts"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30"
        >
          <HiOutlineClock className="text-sm" />
          {t("register.shiftOpenLong", {
            since: new Date(currentShift.opened_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }),
          })}
        </Link>
      ) : currentShift ? (
        <Link
          to="/shifts"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success-50 px-3 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-500"
        >
          <span className="h-2 w-2 rounded-full bg-success-500" />
          {t("register.shiftOpen")}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setModal("openShift")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30"
        >
          <HiOutlineClock className="text-sm" />
          {t("register.noShift")} · {t("shifts.openShift")}
        </button>
      )
    ) : null;

  // Adding/editing products and categories is inventory management — Owner only, same as
  // the Inventory page. Tucked into one menu so it doesn't crowd the selling surface.
  const manageMenu = isOwner && (
    <div className="relative" ref={manageRef}>
      <button
        type="button"
        onClick={() => setManageOpen((v) => !v)}
        className={`${toolbarButtonClass} bg-surface-muted text-gray-700 hover:bg-surface-border dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700`}
      >
        {t("register.manage")}
        <HiOutlineChevronDown className="text-sm" />
      </button>
      {manageOpen && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-52 rounded-xl border border-surface-border bg-white-A700 py-1.5 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          {[
            ["addProduct", HiOutlinePlusCircle, t("pos.addProduct")],
            ["addCategory", HiOutlineTag, t("pos.addCategory")],
            ["editProducts", HiOutlinePencilSquare, t("register.editProducts")],
          ].map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setManageOpen(false);
                setModal(key);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-gray-700 hover:bg-surface-subtle dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Icon className="text-base text-gray-500 dark:text-gray-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const tabClass = (active) =>
    `inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors ${
      active
        ? "bg-primary-600 text-white-A700 shadow-md shadow-primary-900/20"
        : "bg-white-A700 text-gray-700 ring-1 ring-surface-border hover:bg-surface-muted dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700"
    }`;

  return (
    <>
      <AppShell
        title={t("register.title")}
        hideSearch
        fullBleed
        actions={
          (shiftPill || manageMenu) && (
            <div className="flex items-center gap-2">
              {shiftPill}
              {manageMenu}
            </div>
          )
        }
      >
        <div className="flex h-full">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-col gap-3 border-b border-surface-border px-6 py-3 dark:border-gray-800 md:px-4 sm:px-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <HiOutlineMagnifyingGlass className="pointer-events-none absolute inset-y-0 left-4 my-auto text-lg text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t("register.searchPlaceholder")}
                    autoFocus={isSplit}
                    className="h-12 w-full rounded-xl border border-surface-border bg-white-A700 pl-11 pr-20 text-sm shadow-card focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-surface-muted dark:hover:bg-gray-700"
                    >
                      <HiOutlineXMark />
                    </button>
                  ) : (
                    <kbd className="pointer-events-none absolute inset-y-0 right-3 my-auto h-6 rounded-md border border-surface-border bg-surface-subtle px-1.5 text-xs leading-6 text-gray-400 dark:border-gray-700 dark:bg-gray-900 sm:hidden">
                      F2
                    </kbd>
                  )}
                </div>
                <div className="flex shrink-0 rounded-xl bg-surface-muted p-1 dark:bg-gray-800">
                  {[
                    ["grid", HiOutlineSquares2X2, t("register.gridView")],
                    ["list", HiOutlineListBullet, t("register.listView")],
                  ].map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      aria-label={label}
                      title={label}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                        view === mode
                          ? "bg-white-A700 text-primary-600 shadow-card dark:bg-gray-700 dark:text-primary-400"
                          : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                      }`}
                    >
                      <Icon className="text-lg" />
                    </button>
                  ))}
                </div>
              </div>

              {/* One scrollable row, never wrapping — on a phone the old wrapped pills could
                  fill the whole first screen before a single product was visible. */}
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                <button type="button" onClick={() => selectCategory(null)} className={tabClass(!activeCategoryId && !query)}>
                  {t("register.all")}
                  <span className="text-xs opacity-70">{products.length}</span>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setQuery("");
                      selectCategory(category.id);
                    }}
                    className={tabClass(activeCategoryId === category.id && !query)}
                  >
                    <span className={`h-2 w-2 rounded-full ${colorFor(category.id).dot}`} />
                    {category.category_name}
                    <span className="text-xs opacity-70">{productCountByCategory.get(category.id) || 0}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-4 sm:px-3 ${isSplit ? "" : "pb-24"}`}>
              {lotMatches.length > 0 && query.trim() && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {lotMatches.map((match) => (
                    <button
                      key={match.lot.id}
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setDialogProduct(match);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300"
                    >
                      <HiOutlineQrCode />
                      {t("register.lotMatch", { code: match.lot.lot_code })}
                      <span className="font-normal text-primary-600/80 dark:text-primary-300/80">· {match.productname}</span>
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:grid-cols-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-2xl bg-white-A700 dark:bg-gray-800" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <EmptyState icon={HiOutlineCube} title={t("register.emptyCatalog")} />
              ) : visibleProducts.length === 0 ? (
                lotMatches.length === 0 && (
                  <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("register.noResults", { q: query.trim() })}
                  </p>
                )
              ) : (
                <ProductGrid
                  products={visibleProducts}
                  view={view}
                  colorFor={colorFor}
                  lastPrices={lastPrices}
                  lowStockThreshold={lowStockThreshold}
                  inCartQtyFor={inCartQtyFor}
                  onPick={pick}
                  poppedId={poppedId}
                />
              )}

              {isSplit && (
                <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">{t("register.shortcuts")}</p>
              )}
            </div>
          </section>

          {isSplit && (
            <aside className="flex w-[22rem] shrink-0 flex-col border-l border-surface-border bg-white-A700 dark:border-gray-800 dark:bg-gray-800">
              <CartPanel hotkeys onSold={refreshAfterChange} />
            </aside>
          )}
        </div>
      </AppShell>

      {/* Phones / narrow tablets: a pinned summary bar that opens the sale as a sheet. */}
      {!isSplit && cart.length > 0 && !sheetOpen && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-3 bottom-3 z-30 flex h-14 items-center justify-between rounded-2xl bg-primary-600 px-5 text-white-A700 shadow-modal"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <HiOutlineShoppingCart className="text-lg" />
            {cartCount === 1 ? t("register.oneItem") : t("register.itemsCount", { n: cartCount })}
          </span>
          <span className="font-poppins text-base font-bold">
            {t("register.pay")} · {formatPKR(cartTotal)}
          </span>
        </button>
      )}
      {!isSplit && sheetOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-gray-900/60" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 flex h-[min(88vh,44rem)] flex-col rounded-t-2xl bg-white-A700 shadow-modal dark:bg-gray-800">
            <CartPanel
              onSold={refreshAfterChange}
              onCheckedOut={() => setSheetOpen(false)}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </>
      )}

      {dialogProduct && (
        <SellDialog
          product={dialogProduct}
          categoryName={categoryName(dialogProduct.category_id)}
          inCartQty={inCartQty}
          onClose={() => setDialogProduct(null)}
          onAdd={(line) => {
            addLine(line);
            setDialogProduct(null);
          }}
        />
      )}

      <AddProductModal
        isOpen={modal === "addProduct"}
        onClose={() => setModal(null)}
        defaultCategoryId={activeCategoryId || undefined}
        onAdded={refreshAfterChange}
      />
      <AddCategoryModal
        isOpen={modal === "addCategory"}
        onClose={() => setModal(null)}
        onCategoryAdded={refreshAfterChange}
      />
      <UpdateProductModal
        isOpen={modal === "editProducts"}
        onClose={() => {
          setModal(null);
          refreshAfterChange();
        }}
      />
      <OpenShiftModal
        isOpen={modal === "openShift"}
        onClose={() => setModal(null)}
        onOpened={() => {
          setModal(null);
          refreshShift();
        }}
      />
    </>
  );
}
