import { table, t } from "spacetimedb/server";
/** Private, one versioned fixture receipt per ship. No public base table or client pose arguments. */
export const pilotLayoutReceipt = table({ name: "pilot_layout_receipt" }, {
  shipId: t.string().primaryKey(), revision: t.u32(), stationId: t.string(),
  previousX: t.f64(), previousY: t.f64(), appliedMicros: t.u64(),
});
