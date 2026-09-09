import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

/** Included-only glow masks need foreground geometry too. Registering an occluder
 * suppresses its emission in this layer only; the main material remains untouched. */
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
  return {
    set(meshes: readonly AbstractMesh[]) {
      if (disposed) return;
      const next = new Set(
        meshes.filter(
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
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of [...tracked.keys()]) remove(mesh);
      if (layer.customEmissiveColorSelector === select)
        layer.customEmissiveColorSelector = previous;
    },
  };
}
