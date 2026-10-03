import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { table, t } from "spacetimedb/server";
import { readFurnishingOverrides } from "@sidereal/content/wayfarer-furnishings";
/** Mutable cold instance state; never part of the exact registered prefab source. */
export const shipFurnishingState = table(
  { name: "ship_furnishing_state" },
  {
    shipId: t.string().primaryKey(),
    revision: t.u64(),
    overridesJson: t.string(),
  },
);
export function furnishingState(
  db: {
    shipFurnishingState?: {
      shipId: {
        find(
          id: string,
        ): { revision: bigint; overridesJson: string } | null | undefined;
      };
    };
  },
  shipId: string,
) {
  const row = db.shipFurnishingState?.shipId.find(shipId);
  return {
    revision: row?.revision ?? 0n,
    overrides: readFurnishingOverrides(row?.overridesJson ?? "{}"),
    overridesJson: row?.overridesJson ?? "{}",
  };
}

/** A deletion can retain a root identity only when it contains absolutely no payload. */
export function emptyFurnishingStorage(
  db: Pick<
    ReducerCtx<InferSchema<typeof world>>["db"],
    "inventoryItemMembership" | "inventoryContainer" | "inventoryContainerScope"
  >,
  containerId: string,
): boolean {
  if ([...db.inventoryItemMembership.by_root.filter(containerId)].length)
    return false;
  const root = db.inventoryContainer.id.find(containerId);
  if (!root || root.parentItemId || root.amountLitres !== 0) return false;
  const scopes = [...db.inventoryContainerScope.by_root.filter(containerId)];
  // Descendant containers require a parent item; a disconnected descendant is corrupt, not empty.
  if (scopes.length !== 1 || scopes[0].containerId !== containerId)
    return false;
  return true;
}
