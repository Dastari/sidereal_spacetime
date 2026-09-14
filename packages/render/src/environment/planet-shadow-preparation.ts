import { createOpaquePlanetPreparationMaterial } from "./planet-shadow-preparation-material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Light } from "@babylonjs/core/Lights/light";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";

/** Preparation-only light order. Babylon normally derives this from live exclusions. */
class PreparationMesh extends Mesh {
  snapshot: Light[] = [];
  override get lightSources(): Light[] {
    return this.snapshot;
  }
}
export interface PlanetShadowPreparationRequest {
  mesh: Mesh;
  /** Exact runtime orders, e.g. initial-far, return-far, hero. No inferred sorting. */
  variants: readonly { lights: readonly Light[]; receiveShadows: boolean }[];
  cast: boolean;
  /** Caller confirms this mesh participates in the opaque transmission target. */
  opaqueRefraction?: boolean;
  signal?: AbortSignal;
}
export interface PlanetShadowPreparationOptions {
  hero: DirectionalLight;
  shadows: ShadowGenerator;
  /** Caller-owned shared scheduler: no private frame queue is created here. */
  yield: () => Promise<void>;
}
/** One manager-owned adapter. Caller serializes requests and invalidates them on light changes.
 * Shares authored material/geometry; never changes actual lighting or visible meshes.
 * NullEngine readiness is not evidence of GPU compilation or hardware performance.
 */
export function createPlanetShadowPreparation(
  scene: Scene,
  options: PlanetShadowPreparationOptions,
) {
  let disposed = false;
  let busy = false;
  const active = new Set<PreparationMesh>();
  return {
    async prepare(request: PlanetShadowPreparationRequest): Promise<void> {
      if (busy)
        throw new Error(
          "Shadow preparation must use the shared serialized scheduler",
        );
      const source = request.mesh;
      const material = source.material;
      const check = () => {
        if (disposed || request.signal?.aborted || source.isDisposed())
          throw new Error("Shadow preparation cancelled");
      };
      check();
      if (!(material instanceof PBRMaterial) || !source.geometry)
        throw new Error("Native PBR geometry required");
      if (!request.variants.length)
        throw new Error("Explicit lighting variants required");
      busy = true;
      let key: DirectionalLight | undefined;
      let shadows: ShadowGenerator | undefined;
      let proxy: PreparationMesh | undefined;
      let opaque:
        ReturnType<typeof createOpaquePlanetPreparationMaterial> | undefined;
      try {
        key = new DirectionalLight(
          "planet-preparation-key",
          options.hero.direction.clone(),
          scene,
          true,
        );
        // dontAddToScene avoids even transient changes to visible meshes' light lists.
        key.setEnabled(false);
        key.specular.copyFrom(options.hero.specular);
        key.diffuse.copyFrom(options.hero.diffuse);
        key.falloffType = options.hero.falloffType;
        key.lightmapMode = options.hero.lightmapMode;
        key.shadowEnabled = options.hero.shadowEnabled;
        shadows = new ShadowGenerator(
          options.shadows.getShadowMap()!.getSize().width,
          key,
        );
        shadows.filter = options.shadows.filter;
        shadows.filteringQuality = options.shadows.filteringQuality;
        shadows.transparencyShadow = options.shadows.transparencyShadow;
        shadows.enableSoftTransparentShadow =
          options.shadows.enableSoftTransparentShadow;
        shadows.bias = options.shadows.bias;
        shadows.normalBias = options.shadows.normalBias;
        proxy = new PreparationMesh("planet-preparation-surface", scene);
        proxy.metadata = {
          ...source.metadata,
          role: "planet",
          planetShadowPreparation: true,
          preparationSourceMeshId: source.uniqueId,
        };
        active.add(proxy);
        proxy.setEnabled(false);
        proxy.isVisible = false;
        proxy.isPickable = false;
        source.geometry.applyToMesh(proxy);
        proxy.material = material;
        proxy.sideOrientation = source.sideOrientation;
        proxy.useVertexColors = source.useVertexColors;
        proxy.hasVertexAlpha = source.hasVertexAlpha;
        proxy.applyFog = source.applyFog;
        source.computeWorldMatrix(true);
        proxy.scaling.copyFrom(source.absoluteScaling);
        proxy.computeWorldMatrix(true);
        // Nonempty isolated list is required for receiver shadow defines even for a noncaster.
        shadows.getShadowMap()!.renderList = [proxy];
        key.includedOnlyMeshes = [proxy];
        if (request.opaqueRefraction)
          opaque = createOpaquePlanetPreparationMaterial(material);
        for (const variant of request.variants) {
          await options.yield();
          check();
          proxy.snapshot = variant.lights.map((light) =>
            light === options.hero ? key! : light,
          );
          proxy.receiveShadows = variant.receiveShadows;
          if (opaque) {
            proxy.material = opaque.material;
            await opaque.material.forceCompilationAsync(proxy);
            check();
            await options.yield();
            check();
          }
          proxy.material = material;
          await material.forceCompilationAsync(proxy);
          check();
        }
        if (request.cast) {
          await options.yield();
          check();
          await shadows.forceCompilationAsync();
          check();
        }
      } finally {
        try {
          if (proxy) {
            active.delete(proxy);
            proxy.material = null;
            proxy.dispose(false, false);
          }
        } finally {
          try {
            try {
              opaque?.dispose();
            } finally {
              shadows?.dispose();
            }
          } finally {
            try {
              key?.dispose();
            } finally {
              busy = false;
            }
          }
        }
      }
    },
    /** Pending compile retains its invisible resources until settling, then finally releases them. */
    dispose() {
      disposed = true;
    },
    stats: () => ({ disposed, pending: busy ? 1 : 0, proxies: active.size }),
  };
}
