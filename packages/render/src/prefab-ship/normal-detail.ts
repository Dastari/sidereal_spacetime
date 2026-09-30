/** Opt-in normal detail over an existing pooled plastic material. No authored GLB
 * material/texture retention is implied: the geometry cache still substitutes theme slots. */
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import {
  surfaceBatchLayoutKey,
  type SurfaceChannels,
} from "./surface-attributes";

export interface NormalDetailSelection {
  enabled: boolean;
  profile: "federation" | "riftjack" | "aurelian";
  family: "panel" | "service" | "trim";
  /** Immutable visual/recipe revision. Asset bytes must be validated by candidate selection. */
  revision: string;
  normalUrl: string;
  normalSha256: string;
  strength?: number;
  coordinatesIndex?: 0 | 1;
}

interface Pool {
  materials: Map<string, PBRMaterial>;
  textures: Map<string, Texture>;
}
const pools = new WeakMap<Scene, Pool>();

export function normalDetailSelectionOf(
  material: Material | null,
): NormalDetailSelection | undefined {
  return material?.metadata?.shipNormalDetail as
    NormalDetailSelection | undefined;
}

/** Disabled selection returns the SAME base object, creating no materials/textures/defines.
 * Returned clones/maps are scene pooled and borrowed by views, never disposed by a mesh owner.
 * Missing UVs retain the base material. Enabled callers split by layout before merging. */
export function normalDetailMaterial(
  base: PBRMaterial,
  selection?: NormalDetailSelection,
  channels?: SurfaceChannels,
): PBRMaterial {
  if (!selection?.enabled) return base;
  const coordinatesIndex = selection.coordinatesIndex ?? 0;
  if (
    !["federation", "riftjack", "aurelian"].includes(selection.profile) ||
    !["panel", "service", "trim"].includes(selection.family) ||
    !selection.revision ||
    !selection.normalUrl ||
    !/^[a-f0-9]{64}$/.test(selection.normalSha256) ||
    (coordinatesIndex !== 0 && coordinatesIndex !== 1) ||
    !Number.isFinite(selection.strength ?? 1) ||
    (selection.strength ?? 1) < 0 ||
    (selection.strength ?? 1) > 1
  )
    throw Error("Invalid normal detail selection");
  if (
    !channels ||
    surfaceBatchLayoutKey(channels, coordinatesIndex) === "legacy"
  )
    return base;
  if (base.bumpTexture)
    throw Error("Normal detail cannot overwrite an existing authored bump map");
  const scene = base.getScene();
  let pool = pools.get(scene);
  if (!pool) {
    pool = { materials: new Map(), textures: new Map() };
    pools.set(scene, pool);
    scene.onDisposeObservable.addOnce(() => pools.delete(scene));
  }
  const textureKey = JSON.stringify([
    selection.normalUrl,
    selection.normalSha256,
    coordinatesIndex,
    selection.strength ?? 1,
  ]);
  const key = JSON.stringify([
    base.uniqueId,
    selection.profile,
    selection.family,
    selection.revision,
    textureKey,
  ]);
  const cached = pool.materials.get(key);
  if (cached) return cached;
  let texture = pool.textures.get(textureKey);
  if (!texture) {
    texture = new Texture(
      selection.normalUrl,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = `ship-normal:${selection.normalSha256}:${coordinatesIndex}`;
    texture.gammaSpace = false;
    texture.coordinatesIndex = coordinatesIndex;
    texture.level = selection.strength ?? 1;
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
    pool.textures.set(textureKey, texture);
  }
  const material = base.clone(
    `ship-detail:${base.name}:${selection.profile}:${selection.family}:${selection.revision}:${texture.uniqueId}`,
  );
  // Babylon HDRCubeTexture.clone does not retain prefilter-on-load state. Borrow
  // the existing studio reflection resource so detail never changes plastic IBL.
  const clonedReflection = material.reflectionTexture;
  material.reflectionTexture = base.reflectionTexture;
  if (clonedReflection && clonedReflection !== base.reflectionTexture)
    clonedReflection.dispose();
  // Clone preserves the base plastic response, grading and finish metadata. Only normal detail differs.
  material.metadata = {
    ...base.metadata,
    shipNormalDetail: Object.freeze({ ...selection }),
  };
  material.bumpTexture = texture;
  // Same +Y tangent-normal convention as Babylon's glTF adapter in each scene handedness.
  material.invertNormalMapX = !scene.useRightHandedSystem;
  material.invertNormalMapY = scene.useRightHandedSystem;
  material.useParallax = false;
  material.useParallaxOcclusion = false;
  pool.materials.set(key, material);
  return material;
}
