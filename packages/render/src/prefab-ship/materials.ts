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
export function slotOfMaterialName(name: string | undefined): ShipKitSlot | null {
  if (!name) return null;
  // Kit GLBs name materials by slot ("primary"); SHIPS-COMPONENTS GLBs use "slot0_primary".
  const base = name.split(".")[0].toLowerCase().replace(/^slot\d+_/, "");
  return isShipKitSlot(base) ? base : null;
}

/**
 * Emissive intensity for a theme strength (Blender emission strength 6-9 -> 1.0-1.3). Kept low so
 * ACES tone mapping leaves the slot colour saturated instead of clipping to white; the glow
 * layer supplies the bloom.
 */
export const emissiveIntensity = (strength: number) => Math.min(1.3, strength / 6.5);

/** The pooled material for a theme slot. */
export function slotMaterial(scene: Scene, theme: ShipThemeId, slot: ShipKitSlot): PBRMaterial {
  const key = `slot:${theme}:${slot}`;
  const p = pool(scene);
  const found = p.get(key);
  if (found) return found as PBRMaterial;
  const t = SHIP_THEMES[theme].slots[slot];
  const m = new PBRMaterial(`prefab-${theme}-${slot}`, scene);
  m.albedoColor = new Color3(...t.colour);
  m.metallic = t.metallic;
  m.roughness = t.roughness;
  if (t.emissive) {
    m.emissiveColor = new Color3(...t.colour);
    m.emissiveIntensity = slot === "glass" ? 0.18 : emissiveIntensity(t.emissive);
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
export function plumeMaterial(scene: Scene, theme: ShipThemeId): StandardMaterial {
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
export function placeholderMaterial(scene: Scene, theme: ShipThemeId, frame: boolean): StandardMaterial {
  const key = `placeholder:${theme}:${frame}`;
  const p = pool(scene);
  const found = p.get(key);
  if (found) return found as StandardMaterial;
  const t = SHIP_THEMES[theme];
  const m = new StandardMaterial(`prefab-object-${frame ? "frame" : "fill"}-${theme}`, scene);
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
