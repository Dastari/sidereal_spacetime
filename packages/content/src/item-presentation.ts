/**
 * Presentation lookup of an item instance's pinned definitions (roadmap X-2), for the game client
 * and its UI packages. The client installs a source fed by the server's `published_item_definitions`
 * and `own_item_definition_pins` views; until then (and for instances whose pin it cannot see) the
 * code catalogue is used, which is revision 1, the seed. The server never uses this module: its
 * reducers resolve pins from the database (`packages/world/src/item-definitions.ts`).
 */
import { INVENTORY_DEFINITIONS, type InventoryDefinition } from "./inventory";
import { LAB_WEAPONS, type WeaponDefinition } from "./weapons";

/** `id` is the instance UUID when known; without it the instance resolves as revision 1. */
export type ItemInstanceRef = { id?: string; definitionId: string };
export interface ItemPresentationSource {
  item(instance: ItemInstanceRef): InventoryDefinition | undefined;
  weapon(instance: ItemInstanceRef): WeaponDefinition | undefined;
}
let source: ItemPresentationSource | null = null;
const CODE = new Map(INVENTORY_DEFINITIONS.map((d) => [d.id, d]));

export function setItemPresentationSource(next: ItemPresentationSource | null) {
  source = next;
}
export function itemDefinitionOf(
  instance: ItemInstanceRef | undefined,
): InventoryDefinition | undefined {
  if (!instance) return undefined;
  return source ? source.item(instance) : CODE.get(instance.definitionId);
}
export function weaponDefinitionOf(
  instance: ItemInstanceRef | undefined,
): WeaponDefinition | undefined {
  if (!instance) return undefined;
  return source ? source.weapon(instance) : LAB_WEAPONS[instance.definitionId];
}
