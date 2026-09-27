/**
 * Theme material pool for prefab ships (docs/shipyard_player_builder_design.md §12.2): one
 * PBRMaterial per (scene, theme, slot), shared by every ship in the scene. Geometry never changes
 * per theme; switching theme only reassigns these materials.
 *
 * Detail bump (§12.3) is not implemented yet: the exported kit GLBs carry no UVs, so it needs a
 * triplanar material plugin rather than a plain bump texture.
 */
import type { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { SHIP_KIT_SLOTS, type ShipKitSlot } from "@sidereal/content/ship-kit";
import { SHIP_THEMES } from "@sidereal/content/ship-themes";
import type { ShipThemeId } from "@sidereal/content/ship-prefab";

const pools = new WeakMap<Scene, Map<string, PBRMaterial | StandardMaterial>>();

function pool(scene: Scene) {
  let p = pools.get(scene);
  if (!p) {
    p = new Map();
    pools.set(scene, p);
    scene.onDisposeObservable.addOnce(() => pools.delete(scene));
  }
  return p;
}

export function isShipKitSlot(name: string): name is ShipKitSlot {
  return (SHIP_KIT_SLOTS as readonly string[]).includes(name);
}

/** Resolve a glTF material name to a slot ("primary", "primary.001" -> primary); unknown -> null. */
export function slotOfMaterialName(
  name: string | undefined,
): ShipKitSlot | null {
  if (!name) return null;
  // Kit GLBs name materials by slot ("primary"); SHIPS-COMPONENTS GLBs use "slot0_primary".
  const base = name
    .split(".")[0]
    .toLowerCase()
    .replace(/^slot\d+_/, "");
  return isShipKitSlot(base) ? base : null;
}

/**
 * Emissive intensity for a theme strength (Blender emission strength 6-9 -> 1.0-1.3). Kept low so
 * ACES tone mapping leaves the slot colour saturated instead of clipping to white; the glow
 * layer supplies the bloom.
 */
export const emissiveIntensity = (strength: number) =>
  Math.min(1.3, strength / 6.5);

/**
 * Interior finish (deck view): floors and interior walls use a neutral architectural palette
 * instead of the hull's dark trim slots, so decks read as light-grey panelled rooms with patterned
 * mid-grey deck plates (reference cut-away), while hull, accent and emissive slots stay themed.
 * Linear RGB; emissive and accent slots are never overridden.
 */
const INTERIOR: Partial<
  Record<
    "floor" | "wall",
    Partial<Record<ShipKitSlot, [number, number, number]>>
  >
> = {
  floor: {
    trim: [0.27, 0.27, 0.31],
    dark: [0.06, 0.062, 0.08],
    secondary: [0.13, 0.135, 0.175],
    metal: [0.34, 0.34, 0.38],
    primary: [0.36, 0.35, 0.4],
  },
  wall: {
    primary: [0.4, 0.39, 0.43],
    secondary: [0.07, 0.072, 0.11],
    trim: [0.18, 0.18, 0.22],
  },
};

/** Slot material for a mesh role: interior roles get the architectural palette. */
export function roleSlotMaterial(
  scene: Scene,
  theme: ShipThemeId,
  slot: ShipKitSlot,
  role: string,
): PBRMaterial {
  // Navigation is a separate finish of the existing emitter slot, not a tenth
  // authoring slot. Only the dedicated canopy.nav kit piece uses this role.
  if (role === "effect" && slot === "emit_b") {
    const key = `navigation:${theme}`;
    const p = pool(scene);
    const found = p.get(key);
    if (found) return found as PBRMaterial;
    const m = slotMaterial(scene, theme, slot).clone(
      `prefab-${key}`,
    ) as PBRMaterial;
    m.albedoColor = new Color3(0.35, 0.002, 0.006);
    m.emissiveColor = new Color3(1, 0.008, 0.025);
    m.emissiveIntensity = 1.3;
    p.set(key, m);
    return m;
  }
  const colour = (
    INTERIOR as Record<
      string,
      Partial<Record<ShipKitSlot, [number, number, number]>> | undefined
    >
  )[role]?.[slot];
  if (!colour) return slotMaterial(scene, theme, slot);
  const key = `interior:${theme}:${role}:${slot}`;
  const p = pool(scene);
  const found = p.get(key);
  if (found) return found as PBRMaterial;
  const base = slotMaterial(scene, theme, slot);
  const m = base.clone(`prefab-${theme}-${role}-${slot}`) as PBRMaterial;
  m.albedoColor = new Color3(...colour);
  m.roughness = role === "floor" ? 0.62 : 0.55;
  m.metallic = role === "floor" ? 0.12 : 0.05;
  p.set(key, m);
  return m;
}

/** The pooled material for a theme slot. */
export function slotMaterial(
  scene: Scene,
  theme: ShipThemeId,
  slot: ShipKitSlot,
): PBRMaterial {
  const key = `slot:${theme}:${slot}`;
  const p = pool(scene);
  const found = p.get(key);
  if (found) return found as PBRMaterial;
  const t = SHIP_THEMES[theme].slots[slot];
  const m = new PBRMaterial(`prefab-${theme}-${slot}`, scene);
  m.maxSimultaneousLights = 12; // up to 8 room lights plus scene key/fill lights
  m.albedoColor = new Color3(...t.colour);
  m.metallic = t.metallic;
  m.roughness = t.roughness;
  if (t.emissive) {
    m.emissiveColor = new Color3(...t.colour);
    m.emissiveIntensity =
      slot === "glass" ? 0.06 : emissiveIntensity(t.emissive);
  }
  if (t.alpha !== undefined) {
    m.alpha = t.alpha;
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    m.backFaceCulling = false;
  }
  p.set(key, m);
  return m;
}

/** Additive plume material in the theme's plume colour (presentation only). */
export function plumeMaterial(
  scene: Scene,
  theme: ShipThemeId,
): StandardMaterial {
  const key = `plume:${theme}`;
  const p = pool(scene);
  const found = p.get(key);
  if (found) return found as StandardMaterial;
  const m = new StandardMaterial(`prefab-plume-${theme}`, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  // Vertex colours (and alpha) fade the plume along its length; they multiply the emissive term.
  m.emissiveColor = new Color3(...SHIP_THEMES[theme].plume);
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  p.set(key, m);
  return m;
}

/** Translucent placeholder material for art-library object sockets (deck view). */
export function placeholderMaterial(
  scene: Scene,
  theme: ShipThemeId,
  frame: boolean,
): StandardMaterial {
  const key = `placeholder:${theme}:${frame}`;
  const p = pool(scene);
  const found = p.get(key);
  if (found) return found as StandardMaterial;
  const t = SHIP_THEMES[theme];
  const m = new StandardMaterial(
    `prefab-object-${frame ? "frame" : "fill"}-${theme}`,
    scene,
  );
  const c = new Color3(...t.slots.emit_a.colour);
  m.specularColor = Color3.Black();
  if (frame) {
    m.disableLighting = true;
    m.emissiveColor = c;
  } else {
    m.diffuseColor = c.scale(0.6);
    m.emissiveColor = c.scale(0.25);
    m.alpha = 0.22;
    m.disableDepthWrite = true;
  }
  p.set(key, m);
  return m;
}
