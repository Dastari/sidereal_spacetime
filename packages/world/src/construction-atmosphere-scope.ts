import type { AtmosphereTable } from "./construction-atmosphere";
/** Restrict a solver to its own admitted instances. The old pressure-room adapter
 * must use this too on registration, so two clocks never step the same gas row. */
export function scopedAtmosphereTable(
  table: AtmosphereTable,
  ids: readonly string[],
): AtmosphereTable {
  const allowed = new Set(ids);
  return {
    iter: function* () {
      for (const id of allowed) {
        const row = table.id.find(id);
        if (row) yield row;
      }
    },
    insert(row) {
      if (!allowed.has(row.id)) throw Error("Scoped atmosphere insert denied");
      return table.insert(row);
    },
    id: {
      find(id) {
        return allowed.has(id) ? table.id.find(id) : undefined;
      },
      update(row) {
        if (!allowed.has(row.id))
          throw Error("Scoped atmosphere update denied");
        return table.id.update(row);
      },
    },
    by_owner: {
      filter: function* (owner) {
        for (const row of table.by_owner.filter(owner))
          if (allowed.has(row.id)) yield row;
      },
    },
  };
}
