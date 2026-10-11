import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import {
  CREW_ITEM_CATALOG,
  crewItemFx,
  crewItemMaterials,
  sampleCrewItemFx,
  type CrewItemDefinition,
  type CrewItemFxDefinition,
} from "@sidereal/content/crew-items";
import { setMeshRole } from "../mesh-roles";

/** One ray end of an accepted shot, in the FX parent's frame. */
export interface FxRay {
  end: Vector3;
  /** The ray stopped at something (spawns the impact effect there). */
  struck: boolean;
}

/** Colour of an item's emissive slot, for FX authored with `tint: emit_a | emit_b`. */
export function crewItemFxTint(
  item: CrewItemDefinition,
  fx: CrewItemFxDefinition,
): Color3 | undefined {
  if (fx.tint === "fixed") return undefined;
  const slot = crewItemMaterials(item)[fx.tint];
  const c = slot?.emissive ?? slot?.color;
  return c ? new Color3(c[0], c[1], c[2]) : undefined;
}

/** Rotation turning glTF forward (-Z) onto `direction`. */
export function forwardRotation(direction: Vector3): Quaternion {
  const d = direction.normalizeToNew();
  const from = new Vector3(0, 0, -1);
  const axis = Vector3.Cross(from, d);
  const dot = Vector3.Dot(from, d);
  if (axis.lengthSquared() < 1e-12)
    return dot > 0
      ? Quaternion.Identity()
      : Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  return Quaternion.RotationAxis(
    axis.normalize(),
    Math.acos(Math.max(-1, Math.min(1, dot))),
  );
}

interface Bundle {
  file: string;
  root: TransformNode;
  meshes: AbstractMesh[];
  materials: PBRMaterial[];
  ownedMaterials: Material[];
  baseAlpha: number[];
  baseIntensity: number[];
  baseEmissive: Color3[];
}
interface Live extends Bundle {
  fx: CrewItemFxDefinition;
  t: number;
  lengthScale: number;
  size: number;
  shown?: boolean;
  /** Projectiles travel from `from` to `to` at the authored speed, then end. */
  travel?: { from: Vector3; to: Vector3; length: number; speed: number };
  /** Looping effects (beam lance) end after this many seconds. */
  holdS?: number;
  onEnd?: () => void;
}

export interface FxSpawnOptions {
  /** Position in the player's parent frame. */
  at: Vector3;
  /** Forward direction (the effect's authored forward, glTF -Z) in the parent frame. */
  direction?: Vector3;
  /** Beams stretch to this length (m). */
  lengthM?: number;
  tint?: Color3;
  scale?: number;
  /** Projectiles travel here at their authored speed. */
  travelTo?: Vector3;
  holdS?: number;
  onEnd?: () => void;
}

/**
 * Presentation-only player for the r001 effects library (muzzle flash, tracer, beam lance, stun arc,
 * impact spark, smoke puff ...). Every effect is spawned from an ACCEPTED server event (a shot
 * sequence, a detonation) or a local preview; nothing here decides hits or damage. Each FX GLB is
 * parsed once per scene and instanced with its own materials, so rapid fire stays cheap.
 */
export function createVoxelFxPlayer(
  scene: Scene,
  parent: TransformNode,
  options: {
    baseUrl?: string;
    /** A new emissive mesh was created (glow-layer inclusion). */
    onMesh?: (mesh: AbstractMesh) => void;
    /** At most this many live effects; the oldest end first. */
    maxLive?: number;
    /** Global retained clone limit across every effect file; zero disables reuse. */
    maxIdle?: number;
    /** Presentation time scale (review slow motion); 1 = real time. */
    timeScale?: number;
  } = {},
) {
  const base = options.baseUrl ?? CREW_ITEM_CATALOG.assetBase;
  const onMesh = options.onMesh;
  const maxLive = options.maxLive ?? 96;
  const containers = new Map<string, Promise<AssetContainer>>();
  const live: Live[] = [];
  const idle: Bundle[] = [];
  const maxIdle = Math.max(0, Math.floor(options.maxIdle ?? maxLive));
  let disposed = false;
  const load = (file: string) => {
    let promise = containers.get(file);
    if (!promise) {
      promise = SceneLoader.LoadAssetContainerAsync(
        base,
        file,
        scene,
        undefined,
        ".glb",
      );
      containers.set(file, promise);
    }
    return promise;
  };
  const destroyBundle = (bundle: Bundle) => {
    // Parent disposal may already have removed the hierarchy; handles still own clones.
    bundle.root.dispose(false, false);
    for (const material of bundle.ownedMaterials)
      material.dispose(false, false);
  };
  const end = (index: number) => {
    const [fx] = live.splice(index, 1);
    const callback = fx.onEnd;
    fx.onEnd = undefined;
    fx.root.setEnabled(false);
    fx.travel = undefined;
    fx.holdS = undefined;
    if (
      !disposed &&
      !parent.isDisposed() &&
      !scene.isDisposed &&
      idle.length < maxIdle
    )
      idle.push(fx);
    else destroyBundle(fx);
    // Retire before callbacks: impacts/reentrant disposal cannot end this event twice.
    callback?.();
  };
  const timeScale = options.timeScale ?? 1;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt =
      Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1) * timeScale;
    for (let i = live.length - 1; i >= 0; i--) {
      const fx = live[i];
      if (!fx) continue;
      // The first rendered frame shows the effect as spawned: on a slow client a flash shorter
      // than one frame (muzzle flash 70 ms) or a fast tracer would otherwise never be seen.
      if (fx.shown) fx.t += dt;
      fx.shown = true;
      let finished = false;
      if (fx.travel) {
        const d = Math.min(fx.travel.length, fx.t * fx.travel.speed);
        Vector3.LerpToRef(
          fx.travel.from,
          fx.travel.to,
          fx.travel.length > 0 ? d / fx.travel.length : 1,
          fx.root.position,
        );
        finished = d >= fx.travel.length;
      }
      // Travelling effects hold their mid-life look; others play their authored keys.
      const s = sampleCrewItemFx(
        fx.fx,
        fx.travel ? Math.min(fx.t, fx.fx.durationS * 0.5) : fx.t,
      );
      // Authored +Y (Blender forward) is glTF -Z: beams stretch along it to the measured length.
      fx.root.scaling.set(
        s.scale[0] * fx.size,
        s.scale[2] * fx.size,
        s.scale[1] * fx.lengthScale * fx.size,
      );
      fx.materials.forEach((m, j) => {
        m.alpha = fx.baseAlpha[j] * s.opacity;
        m.emissiveIntensity = fx.baseIntensity[j] * s.emissive;
      });
      if (!fx.travel)
        finished = fx.fx.loop
          ? fx.t >= (fx.holdS ?? fx.fx.durationS)
          : s.finished;
      if (finished) end(i);
    }
  });

  const instance = async (fxId: string, spawn: FxSpawnOptions) => {
    if (disposed || parent.isDisposed() || scene.isDisposed) return undefined;
    const fx = crewItemFx(fxId);
    const container = await load(fx.file);
    if (disposed) return undefined;
    if (parent.isDisposed() || scene.isDisposed) return undefined;
    const reusable = idle.findIndex((bundle) => bundle.file === fx.file);
    let bundle: Bundle;
    if (reusable >= 0) bundle = idle.splice(reusable, 1)[0];
    else {
      // Keep total retained clones bounded even when changing effect libraries.
      if (idle.length >= maxIdle && idle.length) destroyBundle(idle.shift()!);
      const entries = container.instantiateModelsToScene(
        (name) => `crew-fx:${fx.id}:${name}`,
        true,
        { doNotInstantiate: true },
      );
      const root = new TransformNode(`crew-fx:${fx.id}`, scene);
      root.parent = parent;
      root.setEnabled(false);
      for (const node of entries.rootNodes) node.parent = root;
      const meshes = root.getChildMeshes(false),
        materials: PBRMaterial[] = [];
      const ownedMaterials = new Set<Material>();
      for (const mesh of meshes) {
        setMeshRole(mesh, "effect");
        mesh.isPickable = false;
        const material = mesh.material;
        if (material) ownedMaterials.add(material);
        if (material instanceof MultiMaterial)
          for (const sub of material.subMaterials)
            if (sub) ownedMaterials.add(sub);
        if (material instanceof PBRMaterial && !materials.includes(material))
          materials.push(material);
      }
      bundle = {
        file: fx.file,
        root,
        meshes,
        materials,
        ownedMaterials: [...ownedMaterials],
        baseAlpha: materials.map((m) => m.alpha),
        baseIntensity: materials.map((m) => m.emissiveIntensity),
        baseEmissive: materials.map((m) => m.emissiveColor.clone()),
      };
    }
    try {
      if (reusable < 0)
        for (const mesh of bundle.meshes) {
          onMesh?.(mesh);
          if (
            disposed ||
            parent.isDisposed() ||
            scene.isDisposed ||
            bundle.root.isDisposed()
          ) {
            destroyBundle(bundle);
            return undefined;
          }
        }
    } catch (error) {
      destroyBundle(bundle);
      throw error;
    }
    const { root, materials } = bundle;
    root.position.copyFrom(spawn.at);
    root.scaling.setAll(1);
    root.rotation.setAll(0);
    root.rotationQuaternion = Quaternion.Identity();
    const direction = spawn.direction ?? spawn.travelTo?.subtract(spawn.at);
    if (direction && direction.lengthSquared() > 1e-9)
      root.rotationQuaternion = forwardRotation(direction);
    materials.forEach((material, i) => {
      material.alpha = bundle.baseAlpha[i];
      material.emissiveIntensity = bundle.baseIntensity[i];
      material.emissiveColor.copyFrom(bundle.baseEmissive[i]);
    });
    if (spawn.tint && fx.tint !== "fixed")
      for (const m of materials)
        if (m.emissiveColor.toLuminance() > 0)
          m.emissiveColor = spawn.tint.clone();
    const entry: Live = {
      ...bundle,
      fx,
      shown: false,
      t: 0,
      lengthScale: fx.lengthM && spawn.lengthM ? spawn.lengthM / fx.lengthM : 1,
      size: spawn.scale ?? 1,
      travel: spawn.travelTo
        ? {
            from: spawn.at.clone(),
            to: spawn.travelTo.clone(),
            length: Vector3.Distance(spawn.at, spawn.travelTo),
            speed: fx.speedMps ?? 60,
          }
        : undefined,
      holdS: spawn.holdS,
      onEnd: spawn.onEnd,
    };
    root.setEnabled(true);
    live.push(entry);
    while (live.length > maxLive) end(0);
    return entry;
  };
  const fire = (fxId: string | undefined, spawn: FxSpawnOptions) => {
    if (fxId && !disposed) void instance(fxId, spawn).catch(() => undefined);
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.onBeforeRenderObservable.remove(observer);
    scene.onDisposeObservable.remove(sceneDisposal);
    parent.onDisposeObservable.remove(parentDisposal);
    let failure: unknown;
    const drain = (work: () => void) => {
      try {
        work();
      } catch (error) {
        failure ??= error;
      }
    };
    while (live.length) drain(() => end(0));
    for (const bundle of idle) drain(() => destroyBundle(bundle));
    idle.length = 0;
    for (const promise of containers.values())
      void promise
        .then((container) => container.dispose())
        .catch(() => undefined);
    containers.clear();
    if (failure !== undefined) throw failure;
  }
  // Owner teardown must not be interrupted by a user callback's exception.
  const ownerDisposal = () => {
    try {
      dispose();
    } catch {}
  };
  const sceneDisposal = scene.onDisposeObservable.add(ownerDisposal);
  const parentDisposal = parent.onDisposeObservable.add(ownerDisposal);
  return {
    /** Spawn one effect (fire-and-forget; resolves when it is on screen). */
    async spawn(fxId: string, spawn: FxSpawnOptions) {
      await instance(fxId, spawn);
    },
    /**
     * An accepted shot of `item`: muzzle flash, the projectile or beam to every ray end, impact
     * sparks where a ray struck, and the item's `after` effect (smoke) at the muzzle.
     */
    shot(
      item: CrewItemDefinition,
      muzzle: { position: Vector3; direction: Vector3 },
      rays: readonly FxRay[],
    ) {
      if (disposed) return;
      const tintOf = (id: string | undefined) =>
        id ? crewItemFxTint(item, crewItemFx(id)) : undefined;
      fire(item.fx.fire, {
        at: muzzle.position,
        direction: muzzle.direction,
        tint: tintOf(item.fx.fire),
      });
      const projectile = item.fx.projectile;
      for (const ray of rays) {
        const impact = () => {
          if (ray.struck)
            fire(item.fx.impact, {
              at: ray.end,
              direction: muzzle.direction.scale(-1),
              tint: tintOf(item.fx.impact),
            });
        };
        const length = Vector3.Distance(muzzle.position, ray.end);
        if (!projectile || length < 0.05) {
          impact();
          continue;
        }
        const fx = crewItemFx(projectile);
        if (fx.kind === "projectile")
          fire(projectile, {
            at: muzzle.position,
            travelTo: ray.end,
            tint: tintOf(projectile),
            onEnd: impact,
          });
        else {
          fire(projectile, {
            at: muzzle.position,
            direction: ray.end.subtract(muzzle.position),
            lengthM: length,
            tint: tintOf(projectile),
            holdS: fx.loop ? fx.durationS * 0.8 : undefined,
          });
          impact();
        }
      }
      fire(item.fx.after, {
        at: muzzle.position,
        direction: muzzle.direction,
        scale: 0.6,
      });
    },
    /** A melee swing that struck: the item's `hit` effect (stun arc) and an impact spark. */
    melee(item: CrewItemDefinition, from: Vector3, point: Vector3) {
      if (disposed) return;
      fire(item.fx.hit, {
        at: from,
        direction: point.subtract(from),
        lengthM: Math.max(0.2, Vector3.Distance(from, point)),
      });
      fire(item.fx.impact, { at: point });
    },
    /** A detonation of `radiusM` at `at`: a large spark burst and smoke. */
    blast(item: CrewItemDefinition, at: Vector3, radiusM: number) {
      if (disposed) return;
      const size = Math.max(1, radiusM / 0.45);
      fire(item.fx.impact ?? "impact-spark", { at, scale: size * 0.9 });
      fire("impact-spark", {
        at: at.add(new Vector3(0, 0.3, 0)),
        scale: size * 0.6,
      });
      fire(item.fx.after ?? "smoke-puff", { at, scale: size * 0.8 });
    },
    /** A stun landed on a body: the stun arc crackles around it for a moment. */
    stun(at: Vector3) {
      fire("stun-arc", {
        at: at.add(new Vector3(0, 0.6, 0)),
        direction: new Vector3(0, 1, 0),
        lengthM: 0.9,
      });
    },
    get count() {
      return live.length;
    },
    meshes() {
      return live.flatMap((l) => l.meshes);
    },
    dispose,
  };
}
export type VoxelFxPlayer = ReturnType<typeof createVoxelFxPlayer>;
