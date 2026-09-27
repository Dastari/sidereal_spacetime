import { table, t } from "spacetimedb/server";
export const systemZone = table(
  {
    name: "system_zone",
    indexes: [
      { accessor: "by_system", algorithm: "btree", columns: ["systemId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    systemId: t.string(),
    zoneId: t.string(),
    revision: t.u64(),
    definitionJson: t.string(),
  },
);
/** Bounded snapshot + retained transition tail are one atomic row per ship. */
export const shipZoneState = table(
  {
    name: "ship_zone_state",
    indexes: [
      { accessor: "by_system", algorithm: "btree", columns: ["systemId"] },
    ],
  },
  {
    shipId: t.string().primaryKey(),
    systemId: t.string(),
    mapRevision: t.u64(),
    stateRevision: t.u64(),
    sequence: t.u64(),
    earliestSequence: t.u64(),
    activeJson: t.string(),
    transitionsJson: t.string(),
  },
);
export const shipZoneProjection = t.row("ShipZoneProjection", {
  shipId: t.string().primaryKey(),
  systemId: t.string(),
  mapRevision: t.u64(),
  stateRevision: t.u64(),
  sequence: t.u64(),
  earliestSequence: t.u64(),
  activeJson: t.string(),
  transitionsJson: t.string(),
});
