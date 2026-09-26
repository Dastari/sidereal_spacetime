/**
 * Prefab ship decal quads (name, number, emblem) from `DressedShip.decals`. Each decal is a quad
 * in the prefab frame with a DynamicTexture alpha mask; the ink colour comes from the theme and
 * is chosen for contrast against the slot the decal sits on. Presentation only.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { DecalPlacement, DressedShip } from "@sidereal/sim/ship-dresser";
import { SHIP_THEMES } from "@sidereal/content/ship-themes";
import type { ShipThemeId } from "@sidereal/content/ship-prefab";
import { drawEmblemMask, drawTextMask } from "./decal-art";
import { setMeshRole } from "../mesh-roles";

/** Extra lift along the normal on top of the dresser's 4 mm, against z-fighting. */
const LIFT = 0.0015;

const luminance = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function quadSize(d: Pick<DecalPlacement, "corners">): [number, number] {
  const [a, b, , e] = d.corners;
  return [Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2])];
}

/**
 * Whether a decal sits on a (primary) wing/armour plate rather than a secondary logo module.
 * Local heuristic until the dresser reports the backing slot: numbers are always plate decals,
 * plate emblems are square while the roof logo emblem is 2:1.
 */
export function decalOnPlate(d: Pick<DecalPlacement, "kind" | "corners">): boolean {
  if (d.kind === "number") return true;
  if (d.kind !== "emblem") return false;
  const [w, h] = quadSize(d);
  return Math.abs(w - h) < 0.05 * Math.max(w, h);
}

/** Ink colour for a decal: contrast against its backing slot (logo modules `secondary`, plates `primary`). */
export function decalInk(theme: ShipThemeId, decal: Pick<DecalPlacement, "kind" | "corners">): [number, number, number] {
  const t = SHIP_THEMES[theme];
  const backing = decalOnPlate(decal) ? t.slots.primary.colour : t.slots.secondary.colour;
  return luminance(backing) > 0.18 ? t.inkOnLight : t.inkOnDark;
}

export interface DecalHandle {
  mesh: Mesh;
  decal: DecalPlacement;
  material: PBRMaterial;
  texture: DynamicTexture;
}

/** Build one quad per decal (parented to the prefab-frame node). */
export function buildDecals(scene: Scene, parent: TransformNode, dressed: DressedShip, theme: ShipThemeId): DecalHandle[] {
  const out: DecalHandle[] = [];
  dressed.decals.forEach((d, i) => {
    const text = d.kind === "name" ? dressed.markings.name : d.kind === "number" ? dressed.markings.number : null;
    if (d.kind === "emblem" && dressed.markings.emblem === "none") return;
    if (text !== null && !text.trim()) return;
    const [w, h] = quadSize(d);
    const tw = 512;
    const th = Math.max(32, Math.min(1024, Math.round((tw * h) / Math.max(w, 1e-3) / 8) * 8));
    const texture = new DynamicTexture(`prefab-decal-${dressed.id}-${i}`, { width: tw, height: th }, scene, true);
    texture.hasAlpha = true;
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    if (text !== null) drawTextMask(ctx, tw, th, text);
    else drawEmblemMask(ctx, tw, th, dressed.markings.emblem);
    texture.update(true);
    const material = new PBRMaterial(`prefab-decal-${dressed.id}-${i}`, scene);
    material.albedoTexture = texture;
    material.useAlphaFromAlbedoTexture = true;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.metallic = 0;
    material.roughness = 0.55;
    material.zOffset = -2;
    const mesh = new Mesh(`prefab-decal-${dressed.id}-${d.kind}-${i}`, scene);
    const n = d.normal;
    const lift = (p: readonly number[]) => [p[0] + n[0] * LIFT, p[1] + n[1] * LIFT, p[2] + n[2] * LIFT];
    const vd = new VertexData();
    vd.positions = d.corners.flatMap(lift);
    vd.normals = [0, 1, 2, 3].flatMap(() => [n[0], n[1], n[2]]);
    // Corners are [bottom-left, bottom-right, top-right, top-left] seen from outside. The canvas
    // has y down, and DynamicTexture uploads with invertY, so v = 1 is the canvas top.
    vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = parent;
    mesh.isPickable = false;
    setMeshRole(mesh, "hull");
    const handle = { mesh, decal: d, material, texture };
    applyDecalTheme(handle, theme);
    out.push(handle);
  });
  return out;
}

export function applyDecalTheme(handle: DecalHandle, theme: ShipThemeId) {
  handle.material.albedoColor = new Color3(...decalInk(theme, handle.decal));
}

export function disposeDecals(handles: readonly DecalHandle[]) {
  for (const h of handles) {
    h.mesh.dispose();
    h.material.dispose();
    h.texture.dispose();
  }
}
