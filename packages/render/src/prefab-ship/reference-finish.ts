/** Candidate pigments only. The shared molded-plastic response and released art stay intact. */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import type { ShipVisualProfileId } from "@sidereal/content/ship-visual";
import { applySurfaceFinish } from "../molded-plastic";

export interface ReferenceFinishSelection {
  revision: string;
  profile: ShipVisualProfileId;
  slot: ShipKitSlot;
  role: string;
  /** Finite source alias marks upholstery/textiles without changing the nine base material slots. */
  materialName?: string;
}

// Linear pigments, reviewed under the existing game light rig rather than a brighter preview rig.
const PIGMENTS: Partial<
  Record<ShipKitSlot, readonly [number, number, number]>
> = {
  primary: [0.44, 0.445, 0.46],
  secondary: [0.028, 0.03, 0.042],
  trim: [0.055, 0.058, 0.078],
  accent: [0.2, 0.025, 0.04],
};
const FLOOR: Partial<Record<ShipKitSlot, readonly [number, number, number]>> = {
  primary: [0.21, 0.22, 0.24],
  secondary: [0.15, 0.16, 0.185],
  trim: [0.24, 0.25, 0.27],
};
const pools = new WeakMap<Scene, Map<string, PBRMaterial>>();

/** Scene-pooled materials are borrowed by ship views. No response, light or emitter changes. */
export function referenceSurfaceMaterial(
  base: PBRMaterial,
  selection: ReferenceFinishSelection,
): PBRMaterial {
  if (selection.revision !== "r002") return base;
  const fabric =
    ["primary", "secondary", "accent"].includes(selection.slot) &&
    /(?:^|\.)fabric(?:\.|$)/.test(selection.materialName ?? "");
  const colour =
    selection.profile !== "federation"
      ? undefined
      : selection.role === "floor"
        ? FLOOR[selection.slot]
        : selection.role === "wall" && selection.slot === "primary"
          ? ([0.36, 0.37, 0.39] as const)
          : PIGMENTS[selection.slot];
  // Other candidate factions retain their pigments but carry the selection through theme replay.
  // Only these finite pigment/textile slots need an owned wrapper; optics/lights/metals stay shared.
  if (!["primary", "secondary", "trim", "accent"].includes(selection.slot))
    return base;
  const scene = base.getScene();
  if (scene.isDisposed) throw Error("Scene disposed during reference finish");
  let pool = pools.get(scene);
  if (!pool) {
    pool = new Map();
    pools.set(scene, pool);
    scene.onDisposeObservable.addOnce(() => {
      for (const material of pool!.values()) material.dispose(false, false);
      pools.delete(scene);
    });
  }
  const key = `${base.uniqueId}:${selection.profile}:${selection.role}:${selection.slot}:${fabric}`;
  const cached = pool.get(key);
  if (cached) return cached;
  const material = base.clone(
    `reference-r002:${base.name}:${selection.role}:${selection.profile}:${fabric ? "fabric" : "plastic"}`,
  )!;
  // HDRCubeTexture.clone loses prefilter-on-load state. Retain the original studio resource;
  // dispose the transient clone so repeated ships do not retain an unused environment texture.
  const reflectionClone = material.reflectionTexture;
  material.reflectionTexture = base.reflectionTexture;
  if (reflectionClone && reflectionClone !== base.reflectionTexture)
    reflectionClone.dispose();
  material.imageProcessingConfiguration = base.imageProcessingConfiguration;
  if (colour) material.albedoColor = new Color3(...colour);
  if (fabric) applySurfaceFinish(material, "fabric", { recaptureBase: true });
  material.metadata = {
    ...base.metadata,
    ...material.metadata,
    shipReferenceFinish: Object.freeze({ ...selection }),
  };
  pool.set(key, material);
  return material;
}
