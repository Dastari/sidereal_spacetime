import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { Light } from "@babylonjs/core/Lights/light";
import { ShadowLight } from "@babylonjs/core/Lights/shadowLight";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginEvent } from "@babylonjs/core/Materials/materialPluginEvent";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { selectLocalLights, type LightBudgetPoint } from "./local-light-budget";

/** A shader contribution budget, separate from Graphics' enabled local lamps. */
export const GAME_PBR_LIGHT_LIMIT = 8;
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
export function createPbrLightBudget(scene: Scene) {
  if (activeControllers.has(scene))
    throw new Error("Scene already owns a PBR light budget");
  activeControllers.add(scene);
  const r = registry(scene);
  let previous: ReadonlySet<string> = new Set();
  let disposed = false;
  const limit = pbrLightLimit(pbrLightCapabilities(scene.getEngine()));
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
      // AssetContainer prototypes can live outside scene.materials while their
      // placed instances still render. Include the real material references.
      const materials = new Set(scene.materials);
      for (const mesh of scene.meshes) {
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
      // Selection ranks only; the existing Graphics/power/shadow owners retain
      // enabled state. selectedIds is rank ordered; decisions is input ordered.
      const ranked = [
        ...selectLocalLights(candidates, { focus }, "all", previous)
          .selectedIds,
      ];
      previous = new Set(ranked.slice(0, Math.max(0, limit - globals.length)));
      const rank = new Map(ranked.map((id, index) => [id, index]));
      const locals = enabled
        .filter((light) => r.locals.has(light))
        .sort(
          (a, b) =>
            (rank.get(r.locals.get(a)!) ?? Infinity) -
            (rank.get(r.locals.get(b)!) ?? Infinity),
        );
      const other = enabled.filter(
        (light) => !r.protected.has(light) && !r.locals.has(light),
      );
      const ordered = [...globals, ...locals, ...other];
      // InstancedMesh.lightSources delegates to its prototype, as does shader
      // preparation. Visit that owner once even when the prototype is detached.
      const owners = new Set(
        scene.meshes
          .filter(
            (mesh) => !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible,
          )
          .map((mesh) =>
            mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh,
          ),
      );
      for (const mesh of owners) {
        const next = ordered.filter((light) => light.canAffectMesh(mesh));
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
        )
          continue;
        const visibleLimit = isBudgetMaterial(mesh.material)
          ? mesh.material.maxSimultaneousLights
          : limit;
        const effectiveChanged =
          capChanged ||
          old.slice(0, visibleLimit).length !==
            next.slice(0, visibleLimit).length ||
          old.slice(0, visibleLimit).some((light, i) => light !== next[i]);
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
      previous = new Set();
      activeControllers.delete(scene);
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
