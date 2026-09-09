import type { DbConnection } from "@sidereal/net";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "@sidereal/content/inventory";
import { firstInventoryPlacement } from "@sidereal/sim/inventory";
import type { InventoryState } from "@sidereal/canvas-ui";
import { inventoryView } from "./inventory";
import { createOperationId } from "./operation-id";

type Move = {
  itemId: string;
  containerId: string;
  x: number;
  y: number;
  rotated: boolean;
};
type Revision = { id: string; revision: bigint };
export interface CargoRead {
  inventory: InventoryState;
  pocketsId: string;
  containers: (Revision & { parentItemId: string })[];
  items: Revision[];
  carried: (Revision & { kind: string })[];
}
export function readCargo(c: DbConnection): CargoRead {
  return {
    inventory: inventoryView(c, true),
    pocketsId: [...c.db.ownInventoryState.iter()][0]?.pocketsId ?? "",
    containers: [...c.db.ownReachableCargoContainers.iter()],
    items: [...c.db.ownReachableCargoItems.iter()],
    carried: [...c.db.ownCarriedInventoryRevisions.iter()],
  };
}
export function usesScopedCargo(
  s: CargoRead,
  itemId: string,
  destinationId: string,
) {
  return (
    s.items.some((i) => i.id === itemId) ||
    s.containers.some((c) => c.id === destinationId)
  );
}
/** Coordinates are a placement proposal only. The reducer independently checks
 * current access, containment, capacity and every expected revision. */
export function planCargoMove(
  s: CargoRead,
  itemId: string,
  destinationId: string,
  exact?: Move,
) {
  const item = s.inventory.items.find((i) => i.id === itemId);
  if (!item) throw Error("Item is no longer available.");
  if (!item.containerId)
    throw Error("Stow the equipped item before moving it to cargo.");
  const revision = (kind: string, id: string) => {
    const row =
      (kind === "item" ? s.items : s.containers).find((r) => r.id === id) ??
      s.carried.find((r) => r.kind === kind && r.id === id);
    if (!row)
      throw Error(
        "Storage access changed. Reopen the container and try again.",
      );
    return row.revision;
  };
  const containers = new Map(s.inventory.containers.map((c) => [c.id, c]));
  const items = new Map(s.inventory.items.map((i) => [i.id, i]));
  const root = (id: string) => {
    const seen = new Set<string>();
    while (id) {
      if (seen.has(id)) throw Error("Invalid container tree.");
      seen.add(id);
      const c = containers.get(id);
      if (!c) throw Error("Container is no longer available.");
      if (!c.parentItemId) return id;
      const parent = items.get(c.parentItemId);
      if (!parent) throw Error("Parent item is no longer available.");
      if (parent.equipmentSlot) return id;
      id = parent.containerId;
    }
    throw Error("Invalid container root.");
  };
  const candidates = destinationId
    ? [destinationId]
    : s.inventory.containers
        .filter((c) => c.carried && c.kind === "grid")
        .sort((a, b) => Number(!a.parentItemId) - Number(!b.parentItemId))
        .map((c) => c.id);
  const selectedRoots = new Set([
    root(item.containerId),
    ...candidates.map(root),
  ]);
  const subset = s.inventory.containers.filter(
    (c) => c.carried || selectedRoots.has(root(c.id)),
  );
  const included = new Set(subset.map((c) => c.id));
  const snapshot = {
    containers: subset,
    items: s.inventory.items.filter(
      (i) => i.equipmentSlot || included.has(i.containerId),
    ),
  };
  const location = exact
    ? { ...exact, equipmentSlot: "" }
    : candidates
        .map((id) =>
          firstInventoryPlacement(
            snapshot,
            INVENTORY_DEFINITIONS,
            LIQUID_DENSITY_KG_PER_LITRE,
            s.pocketsId,
            s.inventory.carryLimitKg,
            itemId,
            id,
          ),
        )
        .find(Boolean);
  if (!location) throw Error("No compatible storage space is available.");
  return {
    itemId,
    expectedItemRevision: revision("item", itemId),
    sourceContainerId: item.containerId,
    expectedSourceRevision: revision("container", item.containerId),
    destinationContainerId: location.containerId,
    expectedDestinationRevision: revision("container", location.containerId),
    expectedCharacterRevision: BigInt(s.inventory.revision),
    x: location.x,
    y: location.y,
    rotated: location.rotated,
  };
}
export async function moveScopedCargo(
  c: DbConnection,
  itemId: string,
  destinationId: string,
  exact?: Move,
) {
  const plan = planCargoMove(readCargo(c), itemId, destinationId, exact);
  await c.reducers.transferScopedCargoItem({
    ...plan,
    operationId: createOperationId(),
  });
  // Bulk operations must use the next accepted cache revision, never optimistic
  // local balances. Stop cleanly if authority/connection disappears mid-batch.
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if (!c.isActive)
      throw Error(
        "Connection lost; some transfers may already have completed.",
      );
    const state = readCargo(c),
      row =
        state.items.find((r) => r.id === itemId) ??
        state.carried.find((r) => r.kind === "item" && r.id === itemId);
    if (row && row.revision > plan.expectedItemRevision) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error(
    "Transfer accepted; waiting for refreshed inventory. Reopen storage before continuing.",
  );
}
export async function moveCargoBatch(
  c: DbConnection,
  sourceId: string,
  destinationId: string,
) {
  const ids = readCargo(c)
    .inventory.items.filter((i) => i.containerId === sourceId)
    .map((i) => i.id);
  let completed = 0;
  try {
    for (const id of ids) {
      await moveScopedCargo(c, id, destinationId);
      completed++;
    }
  } catch (error) {
    throw Error(
      `${completed} of ${ids.length} items transferred. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
