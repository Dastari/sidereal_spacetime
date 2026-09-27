import {
  characterComponent,
  type EquippedCharacterComponents,
} from "@sidereal/content/character-components";

/** Clearance padding in metres for the solver's upper-body proxies. The authored
 * bounds are Blender X/Y/Z (width/depth/height), not the inventory footprint.
 * These retain the calibrated light/heavy padding; they are not mesh collision. */
export function equipmentPoseArmorBulk(
  equippedComponents?: EquippedCharacterComponents,
  legacyArmor?: string,
): number {
  if (equippedComponents === undefined)
    return legacyArmor === "heavy" ? 0.045 : 0.02;
  for (const slot of ["chest", "shoulders", "helmet"] as const) {
    const id = equippedComponents[slot];
    const component = id ? characterComponent(id) : undefined;
    if (component?.slot !== slot) continue;
    const [width, depth, height] = component.boundsMeters.size;
    if (
      (slot === "chest" && depth >= 0.5) ||
      (slot === "shoulders" && width >= 0.95) ||
      (slot === "helmet" && width >= 0.82 && height >= 0.65)
    )
      return 0.045;
  }
  return 0.02;
}
