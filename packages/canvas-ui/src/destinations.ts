/** Pagination keeps every destination reachable without drawing controls below the viewport. */
export function destinationPagination(
  count: number,
  height: number,
  top: number,
  requestedPage: number,
) {
  top = Math.min(top, height - 245);
  const rows = Math.max(1, Math.min(5, Math.floor((height - top - 211) / 34)));
  const pages = Math.max(1, Math.ceil(count / rows));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  return {
    top,
    rows,
    pages,
    page,
    start: page * rows,
    end: Math.min(count, (page + 1) * rows),
    panelHeight: 197 + rows * 34,
  };
}
