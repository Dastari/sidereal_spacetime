import { table, t } from "spacetimedb/server";

/** Private native installation. No reducer accepts the canonical contract or
 * physical-part/aperture evidence: installation belongs to validated spawn. */
export const constructionTraversalLink = table(
  {
    name: "construction_traversal_link",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    instanceId: t.string(),
    sourceLinkId: t.string(),
    lowerDeckId: t.string(),
    upperDeckId: t.string(),
    instanceRevision: t.u64(),
    revision: t.u64(),
    adapterId: t.string(),
    adapterRevision: t.string(),
    auditSha256: t.string(),
    installationJson: t.string(),
    contractJson: t.string(),
    fingerprint: t.string(),
  },
);

/** A character retains its original constructionLocation deck during transit.
 * Accepted path/progress is persisted here; wall-clock time cannot reconstruct it. */
export const constructionTraversal = table(
  {
    name: "construction_traversal",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    id: t.string(),
    owner: t.identity(),
    instanceId: t.string(),
    linkId: t.string(),
    visitId: t.string(),
    sourceDeckId: t.string(),
    destinationDeckId: t.string(),
    instanceRevision: t.u64(),
    linkRevision: t.u64(),
    revision: t.u64(),
    locationRevision: t.u64(),
    stateJson: t.string(),
    acceptedX: t.f64(),
    acceptedY: t.f64(),
    acceptedZ: t.f64(),
    phase: t.string(),
    interruption: t.string(),
    lastTick: t.u64(),
  },
);

/** One user per link; both accepted landing footprints stay reserved until an
 * arrival or return-to-source commit. Blocking never silently releases them. */
export const constructionTraversalReservation = table(
  {
    name: "construction_traversal_reservation",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    linkId: t.string().primaryKey(),
    instanceId: t.string(),
    owner: t.identity(),
    traversalId: t.string(),
    characterId: t.string(),
    sourceDeckId: t.string(),
    destinationDeckId: t.string(),
    reservationJson: t.string(),
  },
);

export const constructionTraversalClock = table(
  { name: "construction_traversal_clock" },
  {
    id: t.string().primaryKey(),
    tick: t.u64(),
    lastScheduleMicros: t.u64(),
  },
);

/** Bounded terminal audit retained after active state/reservation are released. */
export const constructionTraversalAudit = table(
  {
    name: "construction_traversal_audit",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    characterId: t.string(),
    instanceId: t.string(),
    linkId: t.string(),
    visitId: t.string(),
    sourceDeckId: t.string(),
    destinationDeckId: t.string(),
    outcome: t.string(),
    interruption: t.string(),
    revision: t.u64(),
    completedTick: t.u64(),
  },
);
