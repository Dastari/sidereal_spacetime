import type { InventoryDefinition } from "@sidereal/content/inventory";
import { weaponDefinitionOf } from "@sidereal/content/item-presentation";

/** The own `visible_combat_actions` fields the HUD reads. */
export interface OwnCombatAction {
  definitionId: string;
  reloadSequence: bigint;
}

/**
 * Presentation-only reload timer: a new accepted reload (reloadSequence change) shows "Reloading"
 * for the weapon's reload time. The server refuses fire until its own reload time; this only labels
 * the HUD. The first sequence seen is a baseline.
 */
export function trackReload(
  action: OwnCombatAction | undefined,
  until: { current: number },
  seen: { current: bigint | undefined },
  now = performance.now(),
) {
  if (!action) return;
  if (seen.current !== undefined && action.reloadSequence !== seen.current)
    until.current =
      now +
      (weaponDefinitionOf({ definitionId: action.definitionId })?.reloadMs ??
        0);
  seen.current = action.reloadSequence;
}

/**
 * Second HUD line under the weapon name. Tools, medical and utility items are held and equipped in
 * batch A, but their use (repair, heal, scan, cut) is batch B: say so instead of showing energy.
 */
export function combatNote(
  weaponDefinitionId: string | undefined,
  held: InventoryDefinition | undefined,
  action: OwnCombatAction | undefined,
  reloadingUntil: number,
  now = performance.now(),
  /** The weapon instance, so its pinned revision (X-2) names mode and reach. */
  weaponItemId?: string,
): string | undefined {
  if (weaponDefinitionId) {
    const weapon = weaponDefinitionOf({
      id: weaponItemId,
      definitionId: weaponDefinitionId,
    });
    if (reloadingUntil > now && action?.definitionId === weaponDefinitionId)
      return "Reloading…";
    if (weapon?.mode === "thrown")
      return "Throw · lands at the aim · area damage";
    if (weapon?.mode === "melee")
      return "Melee · reach " + weapon.rangeMeters + " m";
    return weapon?.reloadMs ? "R reload" : undefined;
  }
  if (held?.category && held.category !== "weapon")
    return `${held.category === "medical" ? "Medical" : held.category === "tool" ? "Tool" : "Utility"} · not yet usable (arrives in the next items batch)`;
  return undefined;
}
