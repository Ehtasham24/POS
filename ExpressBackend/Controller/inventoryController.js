const { getInventory } = require("../Sevices/inventoryService");
const asyncHandler = require("../utils/asyncHandler");

// getInventory itself stays a single cached (30s) full-catalog aggregate, unchanged — it's
// shared with LowStockBell (needs every low/out-of-stock item, not one page of them) and
// the offline cache (needs the whole catalog to work offline). Search/category/status
// filtering and pagination happen HERE, server-side, on top of that cached result, only
// when a `page` param is actually present — the bell's and offline-cache's calls omit it
// and get back the exact same unfiltered `{ items, summary }` shape as before.
const GetInventory = asyncHandler(async (req, res) => {
  const { search, category, status, page, pageSize } = req.query;
  const inventory = await getInventory(req.user.shopId);

  if (page === undefined) {
    return res.send(inventory);
  }

  let items = inventory.items;
  if (category && category !== "all") {
    items = items.filter((item) => String(item.category_id) === String(category));
  }
  if (status && status !== "all") {
    items = items.filter((item) => item.status === status);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter((item) => item.productname.toLowerCase().includes(q));
  }

  const effectivePageSize = pageSize ? Number(pageSize) : 20;
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));
  const safePage = Math.min(Math.max(1, Number(page)), totalPages);
  const pagedItems = items.slice((safePage - 1) * effectivePageSize, safePage * effectivePageSize);

  // Every category present anywhere in the FULL catalog, not just this page/filter — the
  // dropdown itself needs every option available regardless of what's currently selected.
  const categories = [
    ...new Map(
      inventory.items.filter((item) => item.category_id).map((item) => [item.category_id, item.category_name])
    ),
  ].map(([id, name]) => ({ id, name }));

  // Reflects the active filter (matches this endpoint's previous frontend-side behavior,
  // where the stat cards tracked whatever was actually filtered in, not the server's
  // unfiltered totals) but computed over the full FILTERED set, not just the current page.
  const filteredSummary = {
    totalSkus: items.length,
    totalStockValue: items.reduce((sum, item) => sum + Number(item.stock_value || 0), 0),
    lowStockCount: items.filter((item) => item.status === "low_stock").length,
    outOfStockCount: items.filter((item) => item.status === "out_of_stock").length,
    lowStockThreshold: inventory.summary.lowStockThreshold,
  };

  res.send({
    items: pagedItems,
    summary: filteredSummary,
    categories,
    totalCount,
    totalPages,
    page: safePage,
    pageSize: effectivePageSize,
  });
});

module.exports = { GetInventory };
