import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export const MAX_PLANET_REFERENCE_LOCAL_LIGHTS = 4;
/** Exact authored Crystal5 placement identities; never inferred from mesh names. */
export const CRYSTAL_REFERENCE_HERO_IDS = [
  "colossal-0-0",
  "colossal-2-0",
  "colossal-4-0",
  "colossal-6-0",
] as const;
export interface PlacementLightBatch {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  ranges: readonly {
    firstTriangle: number;
    triangleCount: number;
    partId: string;
  }[];
}
export interface AuthoredPlanetEmitter {
  partId: string;
  /** Optional material batch roles to resolve an authored luminous surface only. */
  materialRoles?: readonly number[];
  color: readonly [number, number, number];
  /** Range and intensity at a body-root scale of one; intensity is candela. */
  range: number;
  intensity: number;
  /** Locate spill near the foot, not at the brightest tip. Default .12. */
  heightFraction?: number;
  radialOffset?: number;
}
export function resolvePlanetEmitterAnchor(
  batches: readonly PlacementLightBatch[],
  emitter: AuthoredPlanetEmitter,
): Vector3 {
  let minimum = Infinity,
    maximum = -Infinity,
    weight = 0,
    x = 0,
    y = 0,
    z = 0;
  for (let role = 0; role < batches.length; role++) {
    if (emitter.materialRoles && !emitter.materialRoles.includes(role))
      continue;
    const batch = batches[role];
    for (const range of batch.ranges) {
      if (range.partId !== emitter.partId) continue;
      if (
        !Number.isInteger(range.firstTriangle) ||
        !Number.isInteger(range.triangleCount) ||
        range.firstTriangle < 0 ||
        range.triangleCount < 0 ||
        (range.firstTriangle + range.triangleCount) * 3 > batch.indices.length
      )
        throw new Error("Invalid placement triangle range");
      for (
        let t = range.firstTriangle;
        t < range.firstTriangle + range.triangleCount;
        t++
      ) {
        const points = [0, 1, 2].map((k) => {
          const index = batch.indices[t * 3 + k];
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index * 3 + 2 >= batch.positions.length
          )
            throw new Error("Invalid placement vertex index");
          const point = new Vector3(
            batch.positions[index * 3],
            batch.positions[index * 3 + 1],
            batch.positions[index * 3 + 2],
          );
          if (![point.x, point.y, point.z].every(Number.isFinite))
            throw new Error("Non-finite placement vertex");
          minimum = Math.min(minimum, point.length());
          maximum = Math.max(maximum, point.length());
          return point;
        });
        const area =
          Vector3.Cross(
            points[1].subtract(points[0]),
            points[2].subtract(points[0]),
          ).length() / 2;
        const center = points[0]
          .add(points[1])
          .add(points[2])
          .scale(1 / 3);
        x += center.x * area;
        y += center.y * area;
        z += center.z * area;
        weight += area;
      }
    }
  }
  if (weight <= 1e-12)
    throw new Error(
      `Missing non-degenerate emitter placement ${emitter.partId}`,
    );
  const direction = new Vector3(x / weight, y / weight, z / weight);
  if (direction.length() < 1e-8)
    throw new Error("Emitter must have a stable outward direction");
  const fraction = emitter.heightFraction ?? 0.12,
    offset = emitter.radialOffset ?? 0.025;
  if (
    !Number.isFinite(fraction) ||
    fraction < 0 ||
    fraction > 1 ||
    !Number.isFinite(offset)
  )
    throw new Error("Invalid authored emitter height");
  return direction
    .normalize()
    .scale(minimum + (maximum - minimum) * fraction + offset);
}

/** Isolated PBR diagnostic. Invoke before compiling body materials, then reuse
 * these four lights across retained LODs. It never creates a shadow generator.
 * Batches and light positions use bodyRoot-local coordinates centred on zero. */
export function createPlanetReferenceLocalLights(options: {
  scene: Scene;
  bodyId: string;
  bodyRoot: TransformNode;
  meshes: readonly AbstractMesh[];
  batches: readonly PlacementLightBatch[];
  emitters: readonly AuthoredPlanetEmitter[];
  /** Budget for existing sun/environment lights. Default2; bounded0..4. */
  reservedGlobalLightSlots?: number;
}) {
  const { scene, bodyId, bodyRoot, batches, emitters } = options;
  if (!bodyId || bodyRoot.getScene() !== scene)
    throw new Error("A scene-owned body identity is required");
  if (emitters.length > MAX_PLANET_REFERENCE_LOCAL_LIGHTS)
    throw new Error(
      "At most four explicitly authored emitters; never truncate placements",
    );
  if (new Set(emitters.map((e) => e.partId)).size !== emitters.length)
    throw new Error("Emitter placement IDs must be unique");
  const reserved = options.reservedGlobalLightSlots ?? 2;
  if (!Number.isInteger(reserved) || reserved < 0 || reserved > 4)
    throw new Error("Global light slot budget must be0..4");
  for (const emitter of emitters)
    if (
      !emitter.partId ||
      !Number.isFinite(emitter.range) ||
      emitter.range <= 0 ||
      !Number.isFinite(emitter.intensity) ||
      emitter.intensity < 0 ||
      !emitter.color.every((v) => Number.isFinite(v) && v >= 0)
    )
      throw new Error("Invalid authored light");
  const anchors = emitters.map((emitter) =>
    resolvePlanetEmitterAnchor(batches, emitter),
  );
  const leases = new Map<PBRMaterial, { before: number; assigned: number }>();
  let disposed = false,
    enabled = true,
    meshes: AbstractMesh[] = [];
  const validateMeshes = (next: readonly AbstractMesh[]) => {
    for (const mesh of next) {
      if (
        mesh.getScene() !== scene ||
        !mesh.isDescendantOf(bodyRoot) ||
        mesh.metadata?.role !== "planet"
      )
        throw new Error(
          "Local lights may include only body-owned planet meshes",
        );
      if (!(mesh.material instanceof PBRMaterial))
        throw new Error("Diagnostic requires body-owned PBR materials");
      if (
        scene.meshes.some(
          (other) =>
            other.material === mesh.material && !other.isDescendantOf(bodyRoot),
        )
      )
        throw new Error("Do not change a material shared with another body");
    }
  };
  validateMeshes(options.meshes);
  const scaleVector = new Vector3();
  const uniformScale = () => {
    bodyRoot.computeWorldMatrix(true).decompose(scaleVector);
    const values = [
        Math.abs(scaleVector.x),
        Math.abs(scaleVector.y),
        Math.abs(scaleVector.z),
      ],
      scale = values[0];
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      values.some((v) => Math.abs(v - scale) > Math.max(1, scale) * 1e-5)
    )
      throw new Error("Planet root must have a finite uniform world scale");
    return scale;
  };
  uniformScale();
  const lights = emitters.map((emitter, index) => {
    const light = new PointLight(
      `planet-spill:${bodyId}:${emitter.partId}`,
      anchors[index],
      scene,
    );
    light.parent = bodyRoot;
    light.metadata = {
      role: "planet-local-light",
      bodyId,
      partId: emitter.partId,
    };
    light.diffuse = Color3.FromArray(emitter.color);
    light.falloffType = Light.FALLOFF_GLTF;
    light.intensityMode = Light.INTENSITYMODE_LUMINOUSINTENSITY;
    light.shadowEnabled = false;
    light.setEnabled(false);
    return light;
  });
  const syncWorldScale = () => {
    if (disposed) return;
    const scale = uniformScale();
    lights.forEach((light, index) => {
      light.range = emitters[index].range * scale;
      light.intensity = emitters[index].intensity * scale * scale;
    });
  };
  const replaceMeshes = (next: readonly AbstractMesh[]) => {
    if (disposed) throw new Error("Local light owner is disposed");
    validateMeshes(next);
    meshes = [...new Set(next)];
    for (const mesh of meshes) {
      const material = mesh.material as PBRMaterial;
      if (!leases.has(material)) {
        const before = material.maxSimultaneousLights,
          assigned = Math.max(before, reserved + lights.length);
        leases.set(material, { before, assigned });
        material.maxSimultaneousLights = assigned;
      }
    }
    for (const light of lights) {
      light.includedOnlyMeshes = [...meshes];
      light.setEnabled(enabled && meshes.length > 0);
    }
  };
  const setEnabled = (value: boolean) => {
    if (disposed) return;
    enabled = value;
    for (const light of lights) light.setEnabled(enabled && meshes.length > 0);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const light of lights) light.dispose();
    for (const [material, { before, assigned }] of leases)
      if (material.maxSimultaneousLights === assigned)
        material.maxSimultaneousLights = before;
    leases.clear();
    meshes = [];
    bodyRoot.onDisposeObservable.remove(observer);
  };
  const observer = bodyRoot.onDisposeObservable.add(dispose);
  syncWorldScale();
  replaceMeshes(options.meshes);
  return {
    lights: lights as readonly PointLight[],
    anchors: anchors as readonly Vector3[],
    replaceMeshes,
    setEnabled,
    syncWorldScale,
    dispose,
    get disposed() {
      return disposed;
    },
  };
}
