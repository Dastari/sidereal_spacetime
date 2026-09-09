/** Minimal in-memory sidecars for legacy authority fixtures. Production always
 * uses registered private tables; there is no missing-table fallback there. */
export function inventoryMetadataTestTables() {
  const table = (key: string) => {
    const rows = new Map<string, Record<string, unknown>>();
    return {
      [key]: {
        find: (id: string) => rows.get(id),
        update: (row: Record<string, unknown>) => {
          rows.set(String(row[key]), row);
        },
        delete: (id: string) => rows.delete(id),
      },
      insert: (row: Record<string, unknown>) => {
        rows.set(String(row[key]), row);
        return row;
      },
    };
  };
  return {
    inventoryContainerScope: table("containerId"),
    inventoryItemMembership: table("itemId"),
  };
}
