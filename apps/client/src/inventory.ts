import type { DbConnection } from "@sidereal/net";
import type { InventoryState } from "../../../packages/canvas-ui/src";
import {
  INVENTORY_DEFINITIONS,
  CHARACTER_CARRY_LIMIT_KG,
  characterEquipmentFromInventory,
} from "../../../packages/content/src/inventory";
import type { CrewAppearance } from "../../../packages/render/src/crew/appearance";
import type { EquipmentAsset } from "../../../packages/render/src/equipment";

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
): { crewAppearance: CrewAppearance; equippedAsset: EquipmentAsset | null } {
  const held = inventory.items.find((item) => item.equipmentSlot === "hand");
  const definition = INVENTORY_DEFINITIONS.find(
    (d) => d.id === held?.definitionId,
  );
  const equippedComponents = characterEquipmentFromInventory(inventory.items);
  const backpack = inventory.items.some(
    (item) => item.equipmentSlot === "back",
  );
  return {
    crewAppearance: {
      ...cosmetics,
      equippedComponents,
      weapon: definition?.pose ?? "none",
      backpack,
      backpackStyle: "utility",
    },
    equippedAsset: (definition?.assetId as EquipmentAsset) ?? null,
  };
}
