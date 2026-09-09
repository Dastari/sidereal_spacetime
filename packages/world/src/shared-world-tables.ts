import { table, t } from "spacetimedb/server";
/** All authoritative/shared candidate rows remain private. Client SQL is not admission. */
export const worldSystem = table(
  { name: "world_system" },
  {
    id: t.string().primaryKey(),
    seedRevision: t.u64(),
    seedSha256: t.string(),
    migrationRevision: t.u64(),
    lastSimulationTick: t.u64().default(0n),
  },
);
const motion = {
  systemId: t.string(),
  x: t.f64(),
  y: t.f64(),
  vx: t.f64(),
  vy: t.f64(),
  heading: t.f64(),
  omega: t.f64(),
  serverTick: t.u64(),
  cellX: t.i64(),
  cellY: t.i64(),
};
const motionIndexes = [
  {
    accessor: "by_system" as const,
    algorithm: "btree" as const,
    columns: ["systemId"] as ["systemId"],
  },
  {
    accessor: "by_cell" as const,
    algorithm: "btree" as const,
    columns: ["systemId", "cellX", "cellY"] as ["systemId", "cellX", "cellY"],
  },
];
export const shipWorldMotion = table(
  { name: "ship_world_motion", indexes: motionIndexes },
  { shipId: t.string().primaryKey(), ...motion },
);
export const systemBody = table(
  {
    name: "system_body",
    indexes: [
      { accessor: "by_system", algorithm: "btree", columns: ["systemId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    systemId: t.string(),
    authoredKey: t.string(),
    kind: t.string(),
    appearance: t.string(),
    seed: t.u32(),
    radius: t.f64(),
    height: t.f64(),
    massKg: t.f64(),
    charted: t.bool(),
  },
);
export const bodyWorldMotion = table(
  { name: "body_world_motion", indexes: motionIndexes },
  { bodyId: t.string().primaryKey(), ...motion },
);
export const worldAdmission = table(
  {
    name: "world_admission",
    indexes: [
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
      { accessor: "by_system", algorithm: "btree", columns: ["systemId"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    shipId: t.string(),
    systemId: t.string(),
    revision: t.u64(),
  },
);
export const worldJoinReceipt = table(
  {
    name: "world_join_receipt",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    characterId: t.string(),
    shipId: t.string(),
    systemId: t.string(),
    requestJson: t.string(),
    revision: t.u64(),
    oldMotionJson: t.string(),
    newMotionJson: t.string(),
    createdMicros: t.u64(),
  },
);
export const legacyBodyAlias = table(
  {
    name: "legacy_body_alias",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    legacyBodyId: t.string().primaryKey(),
    owner: t.identity(),
    shipId: t.string(),
    canonicalBodyId: t.string(),
    systemId: t.string(),
    legacySnapshotJson: t.string(),
  },
);
