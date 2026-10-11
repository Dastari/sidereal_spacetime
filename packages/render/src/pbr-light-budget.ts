import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Light } from "@babylonjs/core/Lights/light";
import { ShadowLight } from "@babylonjs/core/Lights/shadowLight";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginEvent } from "@babylonjs/core/Materials/materialPluginEvent";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { selectLocalLights, type LightBudgetPoint } from "./local-light-budget";

/** A shader contribution budget, separate from Graphics' enabled local lamps. */
export const GAME_PBR_LIGHT_LIMIT = 8;
/** Updates a reordered prefix may wait for its shader. A program that never
 * resolves then falls back to Babylon's own hot swap instead of starving. */
export const PBR_LIGHT_LAYOUT_WAIT = 600;
/** Updates a compiled probe is retained for the receiver's own draw to adopt. */
const LAYOUT_PROBE_HOLD = 120;
type LayoutProbe = { material: Material; source: SubMesh; probe: SubMesh };
type PendingLayout = {
  key: string;
  probes: LayoutProbe[];
  waited: number;
  committed: boolean;
};
type BudgetPbrMaterial = PBRBaseMaterial & { maxSimultaneousLights: number };
function isBudgetMaterial(
  material: Material | null,
): material is BudgetPbrMaterial {
  return (
    material instanceof PBRBaseMaterial &&
    "maxSimultaneousLights" in material &&
    typeof material.maxSimultaneousLights === "number"
  );
}
export type PbrLightCapabilities = Readonly<{
  backend: "webgpu" | "webgl2" | "unknown";
  stageBlocks?: number;
  vertexBlocks?: number;
  fragmentBlocks?: number;
  bindingPoints?: number;
}>;
const validLimit = (n: number | undefined): n is number =>
  n !== undefined && Number.isFinite(n) && Number.isInteger(n) && n > 0;

export function pbrLightLimit(caps: PbrLightCapabilities) {
  const limits =
    caps.backend === "webgpu"
      ? [caps.stageBlocks]
      : caps.backend === "webgl2"
        ? [caps.vertexBlocks, caps.fragmentBlocks, caps.bindingPoints]
        : [];
  if (!limits.length || !limits.every(validLimit)) return 4;
  const reserve = caps.backend === "webgpu" ? 4 : 2;
  return Math.max(
    0,
    Math.min(GAME_PBR_LIGHT_LIMIT, ...limits.map((n) => n! - reserve)),
  );
}

const capabilities = new WeakMap<AbstractEngine, PbrLightCapabilities>();
export function pbrLightCapabilities(
  engine: AbstractEngine,
): PbrLightCapabilities {
  const cached = capabilities.get(engine);
  if (cached) return cached;
  let caps: PbrLightCapabilities = { backend: "unknown" };
  if (engine.isWebGPU) {
    caps = {
      backend: "webgpu",
      stageBlocks: engine.getCaps().maxUniformBuffersPerShaderStage,
    };
  } else {
    // The canvas already belongs to this engine; this retrieves that context,
    // never requests a second canvas or rewrites Babylon's global caps.
    try {
      const gl = engine
        .getRenderingCanvas()
        ?.getContext("webgl2") as WebGL2RenderingContext | null;
      if (gl && typeof gl.getParameter === "function")
        caps = {
          backend: "webgl2",
          vertexBlocks: gl.getParameter(gl.MAX_VERTEX_UNIFORM_BLOCKS),
          fragmentBlocks: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_BLOCKS),
          bindingPoints: gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS),
        };
    } catch {
      /* Unavailable context: retain the conservative fallback. */
    }
  }
  capabilities.set(engine, caps);
  return caps;
}

/** Factories explicitly request their owned lighting; a frame clamp preserves
 * lower intentional requests while preventing later leases from exceeding caps. */
export function setPbrLightBudget(
  material: BudgetPbrMaterial,
  requested = material.maxSimultaneousLights,
) {
  const safeRequest = Number.isFinite(requested)
    ? Math.max(0, Math.floor(requested))
    : 4;
  const limit = Math.min(
    safeRequest,
    pbrLightLimit(pbrLightCapabilities(material.getScene().getEngine())),
  );
  if (material.maxSimultaneousLights !== limit)
    material.maxSimultaneousLights = limit;
  return limit;
}

type Registry = {
  protected: Map<Light, number>;
  locals: Map<Light, string>;
  materials: Set<Material>;
};
const registries = new WeakMap<Scene, Registry>();
const activeControllers = new WeakSet<Scene>();
function registry(scene: Scene) {
  let r = registries.get(scene);
  if (!r) {
    r = { protected: new Map(), locals: new Map(), materials: new Set() };
    registries.set(scene, r);
  }
  return r;
}

/** Actual owner handles; lower order wins, independent of shadowEnabled. */
export function protectPbrLight(light: Light, order: number) {
  const r = registry(light.getScene());
  r.protected.set(light, order);
  light.onDisposeObservable.addOnce(() => r.protected.delete(light));
}

export function registerLocalPbrLight(light: Light, id: string) {
  const r = registry(light.getScene());
  if (!id.trim()) throw new Error("PBR local light needs a stable owner ID");
  for (const [other, otherId] of r.locals)
    if (other !== light && !other.isDisposed() && otherId === id)
      throw new Error(`Duplicate PBR local light owner ${id}`);
  if (r.locals.get(light) === id) return;
  r.locals.set(light, id);
  light.onDisposeObservable.addOnce(() => r.locals.delete(light));
}

/** Orders the real mesh light arrays after all power/visibility/receiver owners.
 * No light enable, shadow, intensity or receiver-list ownership is taken here. */
export function createPbrLightBudget(
  scene: Scene,
  receivers: () => readonly AbstractMesh[] = () => scene.meshes,
) {
  if (activeControllers.has(scene))
    throw new Error("Scene already owns a PBR light budget");
  activeControllers.add(scene);
  const r = registry(scene);
  const previous = new WeakMap<
    AbstractMesh,
    Map<number, ReadonlySet<string>>
  >();
  let disposed = false;
  const limit = pbrLightLimit(pbrLightCapabilities(scene.getEngine()));
  // Babylon keeps drawing a receiver with its previous effect while a changed
  // light layout compiles (WebGL2 links asynchronously), yet binds the new
  // lights to that effect by slot. A point lamp in a spot slot is then read
  // through the wrong block layout, or its smaller buffer drops the draw. A
  // reordered prefix therefore compiles through detached submeshes first.
  const layouts = new Map<AbstractMesh, PendingLayout>();
  const releaseLayout = (mesh: AbstractMesh) => {
    for (const { probe } of layouts.get(mesh)?.probes ?? [])
      probe.resetDrawCache(undefined, true);
    layouts.delete(mesh);
  };
  const layoutReady = (
    mesh: AbstractMesh,
    next: readonly Light[],
    visible: number,
  ) => {
    const key = next
      .slice(0, visible)
      .map((light) => light.uniqueId)
      .join();
    let layout = layouts.get(mesh);
    if (layout?.key !== key || layout.committed) {
      releaseLayout(mesh);
      layout = { key, probes: [], waited: 0, committed: false };
      layouts.set(mesh, layout);
      const seen = new Set<Material>();
      for (const source of mesh.subMeshes ?? []) {
        const material = source.getMaterial() as
          (Material & { disableLighting?: boolean }) | null;
        if (!material || seen.has(material) || material.disableLighting)
          continue;
        seen.add(material);
        layout.probes.push({
          material,
          source,
          // Detached: never listed by the mesh, never drawn.
          probe: new SubMesh(
            source.materialIndex,
            0,
            0,
            0,
            0,
            mesh,
            undefined,
            false,
            false,
          ),
        });
      }
    }
    if (++layout.waited > PBR_LIGHT_LAYOUT_WAIT) return true;
    const lights = mesh.lightSources,
      current = [...lights];
    lights.splice(0, lights.length, ...next);
    let ready = true;
    try {
      for (const { material, source, probe } of layout.probes) {
        const effect = probe.effect;
        if (effect) {
          ready &&=
            effect.isReady() ||
            (!!effect.getCompilationError() && effect.allFallbacksProcessed());
          continue;
        }
        const instances = source._drawWrappers.some(
          (wrapper) => wrapper?._wasPreviouslyUsingInstances,
        );
        if (!material.isReadyForSubMesh(mesh, probe, instances)) ready = false;
      }
    } catch {
      // An unprobeable material keeps Babylon's stock behaviour.
      ready = true;
    } finally {
      lights.splice(0, lights.length, ...current);
    }
    return ready;
  };
  const guards = new Map<Material, () => void>();
  const pendingCaps = new Set<BudgetPbrMaterial>();
  const guard = (material: Material) => {
    if (
      material.getScene() !== scene ||
      !(material instanceof PBRBaseMaterial) ||
      guards.has(material)
    )
      return;
    const own = Object.getOwnPropertyDescriptor(
      material,
      "maxSimultaneousLights",
    );
    let descriptor = own;
    for (
      let prototype = Object.getPrototypeOf(material);
      !descriptor && prototype;
      prototype = Object.getPrototypeOf(prototype)
    )
      descriptor = Object.getOwnPropertyDescriptor(
        prototype,
        "maxSimultaneousLights",
      );
    if (!descriptor?.get || !descriptor.set || own?.configurable === false)
      return;
    if (!r.materials.has(material)) {
      r.materials.add(material);
      material.onDisposeObservable.addOnce(() => r.materials.delete(material));
    }
    const stockGet = descriptor.get,
      stockSet = descriptor.set;
    // Material's Created event runs in the base constructor. Do not read the subclass
    // accessor's uninitialized storage until a completed material is assigned.
    const get = () => stockGet.call(material);
    const set = (requested: number) => {
      const bounded = Math.min(
        limit,
        Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 4,
      );
      if (get() !== bounded) {
        stockSet.call(material, bounded);
        pendingCaps.add(material as BudgetPbrMaterial);
      }
    };
    Object.defineProperty(material, "maxSimultaneousLights", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get,
      set,
    });
    const restore = () => {
      const current = Object.getOwnPropertyDescriptor(
        material,
        "maxSimultaneousLights",
      );
      if (current?.get === get && current.set === set) {
        if (own) Object.defineProperty(material, "maxSimultaneousLights", own);
        else Reflect.deleteProperty(material, "maxSimultaneousLights");
      }
      material.onDisposeObservable.remove(materialDisposal);
      guards.delete(material);
      pendingCaps.delete(material as BudgetPbrMaterial);
    };
    const materialDisposal = material.onDisposeObservable.addOnce(restore);
    guards.set(material, restore);
  };
  // glTF's completion loop raises all scene materials before returning assets.
  // Guard public assignments synchronously, before readiness can compile them.
  // Scene's own added notification is deferred, and AssetContainer blocks it.
  const createdMaterial = Material.OnEventObservable.add(
    guard,
    MaterialPluginEvent.Created,
  );
  const newMaterial = scene.onNewMaterialAddedObservable.add(guard);
  const existing = new Set([...scene.materials, ...r.materials]);
  for (const mesh of scene.meshes) {
    if (mesh.material) existing.add(mesh.material);
    if (mesh.material instanceof MultiMaterial)
      for (const material of mesh.material.subMaterials)
        if (material) existing.add(material);
  }
  for (const material of existing) {
    guard(material);
    if (isBudgetMaterial(material)) setPbrLightBudget(material);
  }
  const owner = {
    limit,
    update(focus: LightBudgetPoint) {
      if (disposed || scene.isDisposed) return false;
      const clamped = new Set(pendingCaps);
      pendingCaps.clear();
      let changed = clamped.size > 0;
      const uses = receivers();
      // AssetContainer prototypes can live outside scene.materials while their
      // placed instances still render. Include the real material references.
      const materials = new Set(scene.materials);
      for (const mesh of uses) {
        if (!mesh.material) continue;
        materials.add(mesh.material);
        if (mesh.material instanceof MultiMaterial)
          for (const sub of mesh.material.subMaterials)
            if (sub) materials.add(sub);
      }
      for (const material of materials)
        if (isBudgetMaterial(material)) {
          guard(material);
          const before = material.maxSimultaneousLights;
          setPbrLightBudget(material);
          if (before !== material.maxSimultaneousLights) clamped.add(material);
          changed ||= before !== material.maxSimultaneousLights;
        }
      // Writes made by this fallback scan are already represented this frame.
      pendingCaps.clear();
      for (const light of r.locals.keys())
        if (light.isDisposed()) r.locals.delete(light);
      for (const light of r.protected.keys())
        if (light.isDisposed()) r.protected.delete(light);
      const enabled = scene.lights.filter(
        (light) => light.isEnabled() && !light.isDisposed(),
      );
      const globals = enabled
        .filter((light) => r.protected.has(light))
        .sort((a, b) => r.protected.get(a)! - r.protected.get(b)!);
      const candidates = [...r.locals]
        .filter(([light]) => enabled.includes(light))
        .map(([light, id]) => {
          if (light.parent && "computeWorldMatrix" in light.parent)
            light.parent.computeWorldMatrix(true);
          if (light instanceof ShadowLight)
            light.computeTransformedInformation();
          return {
            id,
            position: light.getAbsolutePosition(),
            range: light.range,
            eligible: true,
            requiresShadow: false,
            shadowEligible: false,
          };
        });
      const locals = enabled
        .filter((light) => r.locals.has(light))
        .sort((a, b) => (r.locals.get(a)! < r.locals.get(b)! ? -1 : 1));
      const other = enabled.filter(
        (light) => !r.protected.has(light) && !r.locals.has(light),
      );
      // InstancedMesh.lightSources delegates to its prototype, as does shader
      // preparation. Visit that owner once even when the prototype is detached.
      const owners = new Set(
        uses
          .filter(
            (mesh) => !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible,
          )
          .map((mesh) =>
            mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh,
          ),
      );
      for (const mesh of layouts.keys())
        if (!owners.has(mesh)) releaseLayout(mesh);
      for (const mesh of owners) {
        const boundMaterials =
          mesh.material instanceof MultiMaterial
            ? mesh.material.subMaterials
            : [mesh.material];
        const contributionCaps = [
          ...new Set(
            boundMaterials.map((material) => {
              const configured = material as
                | (Material & {
                    maxSimultaneousLights?: number;
                    disableLighting?: boolean;
                  })
                | null;
              if (configured?.disableLighting) return 0;
              const cap = configured?.maxSimultaneousLights;
              return typeof cap === "number" && Number.isFinite(cap)
                ? Math.max(0, Math.floor(cap))
                : limit;
            }),
          ),
        ].sort((a, b) => a - b);
        const visibleLimit = Math.max(0, ...contributionCaps);
        const meshGlobals = globals.filter((light) =>
            light.canAffectMesh(mesh),
          ),
          meshLocals = locals.filter((light) => light.canAffectMesh(mesh));
        // A copy: a deferred reorder must keep its accepted incumbents.
        const incumbents = new Map(previous.get(mesh));
        const admitted = new Set<string>(),
          admittedLights: Light[] = [];
        // A multi-material's smaller cap needs its own relevant prefix. Build
        // nested admitted sets, each stable until that prefix's membership changes.
        for (const cap of contributionCaps) {
          const slots = Math.max(0, cap - meshGlobals.length - admitted.size);
          const remaining = meshLocals.filter(
            (light) => !admitted.has(r.locals.get(light)!),
          );
          const ids = new Set(remaining.map((light) => r.locals.get(light)!));
          const selected =
            remaining.length <= slots
              ? ids
              : new Set(
                  [
                    ...selectLocalLights(
                      candidates.filter((candidate) => ids.has(candidate.id)),
                      { focus },
                      "all",
                      incumbents.get(cap),
                    ).selectedIds,
                  ].slice(0, slots),
                );
          // Camera relevance controls admission, never ordinal churn within an
          // unchanged set. Every fitting fixture therefore keeps the same slot.
          for (const light of remaining)
            if (selected.has(r.locals.get(light)!)) {
              admitted.add(r.locals.get(light)!);
              admittedLights.push(light);
            }
          incumbents.set(cap, new Set(admitted));
        }
        for (const cap of incumbents.keys())
          if (!contributionCaps.includes(cap)) incumbents.delete(cap);
        const next = [
          ...meshGlobals,
          ...admittedLights,
          ...meshLocals.filter((light) => !admitted.has(r.locals.get(light)!)),
          ...other.filter((light) => light.canAffectMesh(mesh)),
        ];
        const old = mesh.lightSources;
        const capChanged =
          mesh.material instanceof MultiMaterial
            ? mesh.material.subMaterials.some(
                (m) => isBudgetMaterial(m) && clamped.has(m),
              )
            : isBudgetMaterial(mesh.material) && clamped.has(mesh.material);
        if (
          !capChanged &&
          old.length === next.length &&
          old.every((light, i) => light === next[i])
        ) {
          previous.set(mesh, incumbents);
          const layout = layouts.get(mesh);
          if (
            layout &&
            (++layout.waited > LAYOUT_PROBE_HOLD ||
              layout.probes.every(({ source, probe }) =>
                source._drawWrappers.some(
                  (wrapper) => wrapper?.effect === probe.effect,
                ),
              ))
          )
            releaseLayout(mesh);
          continue;
        }
        const effectiveChanged =
          capChanged ||
          old.slice(0, visibleLimit).length !==
            next.slice(0, visibleLimit).length ||
          old.slice(0, visibleLimit).some((light, i) => light !== next[i]);
        // Only a reorder of the receiver's own lights can wait, and only while
        // a linked shader is drawing them. A changed cap needs its new shader
        // whatever order those lights are bound in.
        if (
          effectiveChanged &&
          !capChanged &&
          old.length === next.length &&
          next.every((light) => old.includes(light)) &&
          mesh.subMeshes?.some((sub) =>
            sub._drawWrappers.some((wrapper) => wrapper?.effect?.isReady()),
          )
        ) {
          if (!layoutReady(mesh, next, visibleLimit)) continue;
          const layout = layouts.get(mesh)!;
          layout.committed = true;
          layout.waited = 0;
        }
        previous.set(mesh, incumbents);
        old.splice(0, old.length, ...next);
        if (effectiveChanged) {
          mesh._markSubMeshesAsLightDirty();
          changed = true;
        }
      }
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeControllers.delete(scene);
      for (const mesh of [...layouts.keys()]) releaseLayout(mesh);
      scene.onNewMaterialAddedObservable.remove(newMaterial);
      Material.OnEventObservable.remove(createdMaterial);
      for (const restore of [...guards.values()]) restore();
      // Lights own their registration lifetime. Replacing a policy must not
      // erase still-live globals or another view's independently owned lamps.
      scene.onDisposeObservable.remove(disposal);
    },
  };
  const disposal = scene.onDisposeObservable.addOnce(() => owner.dispose());
  return owner;
}
