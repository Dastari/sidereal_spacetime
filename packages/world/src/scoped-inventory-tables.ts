import { table, t } from "spacetimedb/server";

/** Unregistered additive sidecars. Existing inventory payload rows and UUIDs stay
 * intact. Registration requires all legacy mutations to maintain these indices. */
export const inventoryContainerScope = table(
  {
    name: "inventory_container_scope",
    indexes: [
      { accessor: "by_root", algorithm: "btree", columns: ["rootContainerId"] },
      {
        accessor: "by_character",
        algorithm: "btree",
        columns: ["rootCharacterId"],
      },
      {
        accessor: "by_instance_deck",
        algorithm: "btree",
        columns: ["instanceId", "deckId"],
      },
    ],
  },
  {
    containerId: t.string().primaryKey(),
    rootContainerId: t.string(),
    revision: t.u64(),
    rootKind: t.string(),
    rootCharacterId: t.string(),
    instanceId: t.string(),
    deckId: t.string(),
    placedObjectId: t.string(),
    instanceRevision: t.u64(),
    definitionRevision: t.string(),
    accessX: t.f64(),
    accessY: t.f64(),
    accessZ: t.f64(),
    lifecycle: t.string(),
  },
);
export const inventoryItemMembership = table(
  {
    name: "inventory_item_membership",
    indexes: [
      { accessor: "by_root", algorithm: "btree", columns: ["rootContainerId"] },
      {
        accessor: "by_container",
        algorithm: "btree",
        columns: ["containerId"],
      },
      {
        accessor: "by_character",
        algorithm: "btree",
        columns: ["rootCharacterId"],
      },
    ],
  },
  {
    itemId: t.string().primaryKey(),
    revision: t.u64(),
    containerId: t.string(),
    rootContainerId: t.string(),
    rootCharacterId: t.string(),
  },
);
/** Unique placed identity prevents duplicate empty-container allocation on replay. */
export const instanceInventoryBinding = table(
  {
    name: "instance_inventory_binding",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    placedObjectId: t.string().primaryKey(),
    containerId: t.string().unique(),
    instanceId: t.string(),
    deckId: t.string(),
    definitionRevision: t.string(),
  },
);
export const scopedInventoryReceipt = table(
  {
    name: "scoped_inventory_receipt",
    indexes: [
      { accessor: "by_actor", algorithm: "btree", columns: ["actorId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    actorId: t.string(),
    operationId: t.string(),
    request: t.string(),
    itemId: t.string(),
    sourceContainerId: t.string(),
    destinationContainerId: t.string(),
    resultingItemRevision: t.u64(),
  },
);

export const scopedCargoContainerProjection = t.row(
  "ScopedCargoContainerStatus",
  {
    capacityLitres: t.f64(),
    amountLitres: t.f64(),
    liquidType: t.string(),
    name: t.string(),
    placedObjectId: t.string(),
    id: t.string().primaryKey(),
    parentItemId: t.string(),
    kind: t.string(),
    width: t.u32(),
    height: t.u32(),
    maxMassKg: t.f64(),
    revision: t.u64(),
  },
);
export const scopedCargoItemProjection = t.row("ScopedCargoItemStatus", {
  id: t.string().primaryKey(),
  definitionId: t.string(),
  containerId: t.string(),
  x: t.i32(),
  y: t.i32(),
  rotated: t.bool(),
  revision: t.u64(),
});

export const scopedCarriedRevisionProjection = t.row(
  "ScopedCarriedInventoryRevision",
  {
    id: t.string().primaryKey(),
    kind: t.string(),
    revision: t.u64(),
  },
);
