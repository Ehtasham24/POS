// Page/pageSize from a request, clamped to sane bounds.
const parsePaging = ({ page, pageSize } = {}, { defaultSize = 25, maxSize = 100 } = {}) => {
  const size = Math.min(Math.max(parseInt(pageSize, 10) || defaultSize, 1), maxSize);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { page: safePage, pageSize: size, offset: (safePage - 1) * size };
};

// The paginated response shape, from rows selected with `COUNT(*) OVER () AS total_count`
// (one query for the page and the total).
const pagedResult = (rows, { page, pageSize }) => {
  const totalCount = rows.length ? Number(rows[0].total_count) : 0;
  return {
    rows: rows.map(({ total_count, ...row }) => row),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
  };
};

module.exports = { parsePaging, pagedResult };
