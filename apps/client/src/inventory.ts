import { itemDefinitionOf } from "@sidereal/content/item-presentation";
import type { DbConnection } from "@sidereal/net";
import type { InventoryState } from "../../../packages/canvas-ui/src";
import {
  CHARACTER_CARRY_LIMIT_KG,
  characterEquipmentFromInventory,
} from "../../../packages/content/src/inventory";
import type { CrewAppearance } from "../../../packages/render/src/crew/appearance";
import {
  EQUIPMENT_ASSETS,
  type EquipmentAsset,
} from "../../../packages/render/src/equipment";

/** Only server-filtered projections enter the game UI; no private base table is subscribed. */
export function inventoryView(
  connection: DbConnection | null,
  ready: boolean,
): InventoryState {
  const status =
    ready && connection
      ? [...connection.db.ownInventoryState.iter()][0]
      : undefined;
  return {
    revision: status?.revision.toString() ?? "0",
    items:
      ready && connection
        ? ([
            ...connection.db.ownInventoryItems.iter(),
            ...[...connection.db.ownReachableCargoItems.iter()].map((item) => ({
              ...item,
              equipmentSlot: "" as const,
            })),
          ] as InventoryState["items"])
        : [],
    containers:
      ready && connection
        ? ([
            ...connection.db.ownInventoryContainers.iter(),
            ...[...connection.db.ownReachableCargoContainers.iter()].map(
              (container) => ({
                ...container,
                placementId: container.placedObjectId,
                carried: false,
              }),
            ),
          ] as InventoryState["containers"])
        : [],
    hotbar:
      ready && connection ? [...connection.db.ownInventoryHotbar.iter()] : [],
    carriedMassKg: status?.carriedMassKg ?? 0,
    carryLimitKg: status?.carryLimitKg ?? CHARACTER_CARRY_LIMIT_KG,
  };
}
/** Equipped authority always overrides the cosmetic preview's hand/back slots. */
export function inventoryAppearance(
  inventory: InventoryState,
  cosmetics: CrewAppearance,
): {
  crewAppearance: CrewAppearance;
  equippedAsset: EquipmentAsset | null;
  heldItem: string | null;
} {
  return equipmentAppearance(inventory.items, cosmetics);
}
/** Crew look from worn items (definition id + slot): the local character and crewmates alike. */
export function equipmentAppearance(
  items: readonly { definitionId: string; equipmentSlot: string }[],
  cosmetics: CrewAppearance,
): {
  crewAppearance: CrewAppearance;
  /** Legacy r008 crew only: the 2026-09-08 equipment asset, when the item has one. */
  equippedAsset: EquipmentAsset | null;
  /** Voxel crew: the r001 item in hand (the definition's crewItemId, the only art mapping). */
  heldItem: string | null;
} {
  const held = items.find((item) => item.equipmentSlot === "hand");
  const definition = itemDefinitionOf(held);
  const equippedComponents = characterEquipmentFromInventory(items);
  const backpack = items.some((item) => item.equipmentSlot === "back");
  return {
    crewAppearance: {
      ...cosmetics,
      equippedComponents,
      weapon: definition?.pose ?? "none",
      backpack,
      backpackStyle: "utility",
    },
    equippedAsset: EQUIPMENT_ASSETS.includes(
      definition?.assetId as EquipmentAsset,
    )
      ? (definition!.assetId as EquipmentAsset)
      : null,
    heldItem: definition?.crewItemId ?? null,
  };
}
