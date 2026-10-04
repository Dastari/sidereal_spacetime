import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Light } from "@babylonjs/core/Lights/light";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ManagedLocalLight } from "./local-light-budget";
import { registerLocalPbrLight } from "./pbr-light-budget";

export type AssetEmission = { factor: readonly number[]; strength: number };
export type AssetLightSocket = {
  id: string;
  /** Same glTF Y-up coordinates as the source mesh. */
  position: readonly number[];
  color: readonly number[];
  intensity: number;
  range: number;
  direction?: readonly number[];
  angle?: number;
};
export type AuthoredAssetLighting = {
  id: string;
  sha256: string;
  emissions: Readonly<Record<string, AssetEmission>>;
  sockets: readonly AssetLightSocket[];
};

const vector3 = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

/** Source pins are identity; asset and placement names have no renderer policy. */
export function readAuthoredAssetLighting(input: unknown) {
  const value = input as { schema?: string; assets?: AuthoredAssetLighting[] };
  if (
    value?.schema !== "authored-asset-lighting/v1" ||
    !Array.isArray(value.assets)
  )
    throw Error("Invalid authored asset lighting descriptor");
  const result = new Map<string, AuthoredAssetLighting>();
  for (const asset of value.assets) {
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || result.has(asset.sha256))
      throw Error("Invalid or duplicate lighting asset pin");
    for (const emission of Object.values(asset.emissions))
      if (
        !vector3(emission.factor) ||
        emission.factor.some((n) => n < 0 || n > 1) ||
        !Number.isFinite(emission.strength) ||
        emission.strength < 0
      )
        throw Error("Invalid authored asset emission");
    const ids = new Set<string>();
    if (!Array.isArray(asset.sockets) || asset.sockets.length > 2)
      throw Error("Invalid authored asset socket count");
    for (const socket of asset.sockets) {
      if (
        !socket.id ||
        ids.has(socket.id) ||
        !vector3(socket.position) ||
        !vector3(socket.color) ||
        socket.color.some((n: number) => n < 0 || n > 1) ||
        !Number.isFinite(socket.intensity) ||
        socket.intensity < 0 ||
        socket.intensity > 2 ||
        !Number.isFinite(socket.range) ||
        socket.range <= 0 ||
        socket.range > 3
      )
        throw Error("Invalid authored asset light socket");
      ids.add(socket.id);
      if (
        socket.direction &&
        (!vector3(socket.direction) ||
          Math.hypot(...socket.direction) < 1e-6 ||
          !Number.isFinite(socket.angle) ||
          socket.angle! <= 0 ||
          socket.angle! > Math.PI)
      )
        throw Error("Invalid authored socket cone");
    }
    result.set(asset.sha256, asset);
  }
  return result;
}

/** Continuous, hue-preserving common compositor rolloff; physical materials retain source radiance. */
export function authoredHaloColor(
  color: { r: number; g: number; b: number },
  strength: number,
) {
  const channels = [color.r, color.g, color.b].map((n) =>
    Math.max(0, n * strength * 0.85),
  );
  const peak = Math.max(...channels);
  const response = peak <= 1 ? peak : 1 + (3 * (peak - 1)) / (3 + peak - 1);
  const scale = peak > 0 ? response / peak : 0;
  return channels.map((n) => n * scale);
}

type RegisteredSource = {
  light: PointLight | SpotLight;
  parent: TransformNode;
  intensity: number;
  apply: ManagedLocalLight["apply"];
  desired: boolean;
  eligible: boolean;
  enabled: () => boolean;
};
const registries = new WeakMap<Scene, Map<string, RegisteredSource>>();
function registry(scene: Scene) {
  let entries = registries.get(scene);
  if (!entries) {
    entries = new Map();
    registries.set(scene, entries);
  }
  return entries;
}

/** Called by the existing scene budget; no private selection or camera priority. */
export function getAuthoredAssetLightSources(
  scene: Scene,
  allowed = true,
): ManagedLocalLight[] {
  return [...registry(scene)].map(([id, source]) => {
    const { light, parent } = source;
    const eligible =
      allowed &&
      source.enabled() &&
      parent.isEnabled() &&
      !light.isDisposed() &&
      light.includedOnlyMeshes.some(
        (m) => !m.isDisposed() && m.isEnabled() && m.isVisible,
      );
    source.eligible = eligible;
    return {
      id,
      position: Vector3.TransformCoordinates(
        light.position,
        parent.computeWorldMatrix(true),
      ),
      range: light.range,
      eligible,
      requiresShadow: false,
      shadowEligible: false,
      apply: source.apply,
    };
  });
}

export type AssetLightingPlacement = {
  id: string;
  /** Source glTF point to renderer local matrix: exactly the accepted geometry matrix. */
  matrix: readonly number[];
  asset: AuthoredAssetLighting;
  receivers: AbstractMesh[];
};

/** One object-owned node, bounded source sockets, common budget and parent lifecycle. */
export function createAuthoredAssetLighting(
  scene: Scene,
  parent: TransformNode,
  placements: readonly AssetLightingPlacement[],
) {
  const nodes: TransformNode[] = [],
    lights: (PointLight | SpotLight)[] = [],
    ids: string[] = [];
  let enabled = true;
  const entries = registry(scene);
  for (const placement of placements) {
    if (!placement.asset.sockets.length) continue;
    const node = new TransformNode(
      `asset-lighting:${parent.uniqueId}:${placement.id}`,
      scene,
    );
    node.parent = parent;
    node.rotationQuaternion = new Quaternion();
    Matrix.FromArray(Array.from(placement.matrix)).decompose(
      node.scaling,
      node.rotationQuaternion,
      node.position,
    );
    nodes.push(node);
    for (const socket of placement.asset.sockets) {
      const id = `${parent.metadata?.partId ?? `instance:${parent.uniqueId}`}:${placement.id}:${socket.id}`;
      if (entries.has(id)) throw Error("Duplicate authored asset light owner");
      const position = Vector3.FromArray(Array.from(socket.position));
      const light = socket.direction
        ? new SpotLight(
            id,
            position,
            Vector3.FromArray(Array.from(socket.direction)).normalize(),
            socket.angle!,
            1,
            scene,
          )
        : new PointLight(id, position, scene);
      light.parent = node;
      light.diffuse = Color3.FromArray(Array.from(socket.color));
      light.specular = Color3.Black();
      light.range = socket.range;
      light.falloffType = Light.FALLOFF_STANDARD;
      light.radius = 0.06;
      light.intensity = socket.intensity;
      light.shadowEnabled = false;
      light.includedOnlyMeshes = placement.receivers;
      light.setEnabled(false);
      const source: RegisteredSource = {
        light,
        parent: node,
        intensity: socket.intensity,
        desired: false,
        eligible: false,
        enabled: () => enabled,
        apply: ({ enabled: selected }) => {
          if (light.isDisposed()) return;
          selected = selected && source.eligible;
          source.desired = selected;
          if (!selected) {
            light.setEnabled(false);
            light.intensity = 0;
          } else if (!light.isEnabled(false)) {
            light.intensity = 0;
            light.setEnabled(true);
          }
        },
      };
      entries.set(id, source);
      registerLocalPbrLight(light, id);
      light.onDisposeObservable.addOnce(() => entries.delete(id));
      lights.push(light);
      ids.push(id);
    }
  }
  // Soft-start selected contribution only; never retain unselected lights beyond the budget.
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(
      0.05,
      Math.max(0, scene.getEngine().getDeltaTime() / 1000),
    );
    for (const id of ids) {
      const source = entries.get(id);
      if (source?.desired && enabled && !source.light.isDisposed())
        source.light.intensity +=
          (source.intensity - source.light.intensity) *
          (1 - Math.exp(-dt / 0.15));
    }
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onBeforeRenderObservable.remove(observer);
    for (const light of lights) light.dispose();
    for (const node of nodes) node.dispose();
  };
  parent.onDisposeObservable.addOnce(dispose);
  return {
    lights,
    setEnabled(value: boolean) {
      enabled = value;
      if (!value)
        for (const id of ids)
          entries.get(id)?.apply({ enabled: false, shadowEnabled: false });
    },
    dispose,
  };
}
