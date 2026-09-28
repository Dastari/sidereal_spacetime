import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";

interface ActorRegistry {
  meshes: readonly AbstractMesh[];
  listeners: Set<() => void>;
}
const actorRegistries = new WeakMap<Scene, ActorRegistry>();
function actorRegistry(scene: Scene) {
  let registry = actorRegistries.get(scene);
  if (!registry) {
    registry = { meshes: [], listeners: new Set() };
    actorRegistries.set(scene, registry);
  }
  return registry;
}

/**
 * Characters in front of glowing ship parts must hide that glow, whichever layer owns it. The
 * given meshes (crew body, head kit, armour, held items) are added as black occluders to every
 * `createGlowOccluders` layer of the scene, present and future. Replaces the previous set.
 */
export function setGlowOccludingActors(
  scene: Scene,
  meshes: readonly AbstractMesh[],
) {
  const registry = actorRegistry(scene);
  registry.meshes = [...meshes];
  for (const listener of [...registry.listeners]) listener();
}

/** Included-only glow masks need foreground geometry too. Registering an occluder
 * suppresses its emission in this layer only; the main material remains untouched.
 * Scene actors registered with setGlowOccludingActors are always occluders as well. */
export function createGlowOccluders(layer: GlowLayer) {
  const tracked = new Map<
    Mesh,
    Observer<import("@babylonjs/core/node").Node>
  >();
  const previous = layer.customEmissiveColorSelector;
  const select: GlowLayer["customEmissiveColorSelector"] = (
    mesh,
    subMesh,
    material,
    result,
  ) => {
    if (tracked.has(mesh)) {
      result.set(0, 0, 0, material.alpha * mesh.visibility);
      return;
    }
    if (previous) {
      previous(mesh, subMesh, material, result);
      return;
    }
    // Preserve Babylon's default PBR/Standard emission convention for actual emitters.
    const source = material as typeof material & {
      emissiveColor?: Color3;
      emissiveTexture?: BaseTexture;
      emissiveIntensity?: number;
    };
    if (source.emissiveColor) {
      const gain =
          (source.emissiveTexture?.level ?? 1) *
          (source.emissiveIntensity ?? 1),
        c = source.emissiveColor;
      result.set(c.r * gain, c.g * gain, c.b * gain, material.alpha);
    } else result.copyFrom(layer.neutralColor);
  };
  layer.customEmissiveColorSelector = select;
  function remove(mesh: Mesh) {
    const observer = tracked.get(mesh);
    if (!observer) return;
    mesh.onDisposeObservable.remove(observer);
    tracked.delete(mesh);
    layer.removeIncludedOnlyMesh(mesh);
  }
  let disposed = false;
  let own: readonly AbstractMesh[] = [];
  const actors = actorRegistry(layer.mainTexture.getScene()!);
  const sync = () => {
    if (disposed) return;
    const next = new Set(
      [...own, ...actors.meshes].filter(
          (mesh): mesh is Mesh =>
            mesh instanceof Mesh &&
            !mesh.isDisposed() &&
            mesh.getTotalVertices() > 0 &&
            !!mesh.material &&
            !mesh.material.needAlphaBlending(),
      ),
    );
    for (const mesh of tracked.keys()) if (!next.has(mesh)) remove(mesh);
    for (const mesh of next)
      if (!tracked.has(mesh)) {
        layer.addIncludedOnlyMesh(mesh);
        tracked.set(
          mesh,
          mesh.onDisposeObservable.add(() => remove(mesh)),
        );
      }
  };
  actors.listeners.add(sync);
  sync();
  return {
    set(meshes: readonly AbstractMesh[]) {
      own = meshes;
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      actors.listeners.delete(sync);
      for (const mesh of [...tracked.keys()]) remove(mesh);
      if (layer.customEmissiveColorSelector === select)
        layer.customEmissiveColorSelector = previous;
    },
  };
}
