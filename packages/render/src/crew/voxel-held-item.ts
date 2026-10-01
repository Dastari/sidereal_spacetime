import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import {
  CREW_ITEM_CATALOG,
  crewArmedClass,
  crewArmedClipInfo,
  crewItem,
  type CrewItemDefinition,
  type CrewItemHolster,
} from "@sidereal/content/crew-items";
import {
  createVoxelItemVisual,
  crewItemHandSocketRotation,
} from "../equipment/voxel-items";
import type { createVoxelCrewVisual } from "./voxel-crew";
import type { VoxelCrewAction } from "@sidereal/content/crew-voxel-bundle";
import {
  verifiedCrewSourceBytes,
  type VerifiedCrewSource,
} from "./crew-asset-cache";

type VoxelCrew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;
export type HeldItemVisual = Awaited<ReturnType<typeof createVoxelItemVisual>>;

/** Clip frame rate of the baked armed actions (crew-items-r001-armed.json). */
const ARMED_FPS = CREW_ITEM_CATALOG.animationFps;

/** Ready/aim/fire grips follow the item; authored reload/draw/holster and seated poses release it. */
export function crewUsesSupportGrip(clips: readonly string[]) {
  return (
    clips.some((name) =>
      /\.(idle_armed|walk_armed|run_armed|aim|shoot)(:|$)/.test(name),
    ) && !clips.some((name) => /\.(reload|draw|holster)(:|$)/.test(name))
  );
}

const armedClipsLoaded = new WeakMap<object, Promise<void>>();
const verifiedArmedClipsLoaded = new WeakMap<
  object,
  Map<string, Promise<void>>
>();
/** Register CHAR-WEAPONS armed-actions.glb clips (`<class>.<clip>`) on a voxel crew once. */
export function loadArmedClips(
  scene: Scene,
  crew: VoxelCrew,
  source?: VerifiedCrewSource,
  requiredClips: readonly string[] = [],
) {
  if (source) {
    let cache = verifiedArmedClipsLoaded.get(crew);
    if (!cache) {
      cache = new Map();
      verifiedArmedClipsLoaded.set(crew, cache);
    }
    const key = JSON.stringify([
      source.sha256,
      source.variant,
      [...requiredClips].sort(),
    ]);
    let verified = cache.get(key);
    if (!verified) {
      verified = SceneLoader.LoadAssetContainerAsync(
        "",
        verifiedCrewSourceBytes(source),
        scene,
        undefined,
        ".glb",
      ).then((armed) => {
        try {
          if (
            !armed.animationGroups.length ||
            requiredClips.some(
              (name) =>
                !armed.animationGroups.some((group) => group.name === name),
            )
          )
            throw new Error("Operator armed clips unavailable");
          crew.addClips(armed);
        } finally {
          armed.dispose();
        }
      });
      cache.set(key, verified);
    }
    return verified;
  }
  let promise = armedClipsLoaded.get(crew);
  if (!promise) {
    promise = SceneLoader.LoadAssetContainerAsync(
      CREW_ITEM_CATALOG.assetBase,
      "armed-actions.glb",
      scene,
      undefined,
      ".glb",
    ).then((armed) => {
      crew.addClips(armed);
      armed.dispose();
    });
    armedClipsLoaded.set(crew, promise);
  }
  return promise;
}

/**
 * Local transform of an item riding its holster, in the same socket convention as the hand
 * (crewItemHandSocketRotation): the catalogue's socket-local rotation and offset.
 */
export function holsterTransform(holster: CrewItemHolster) {
  const [w, x, y, z] = holster.rotationWXYZ;
  const [ox, oy, oz] = holster.offset;
  return {
    rotation: new Quaternion(x, z, -y, w).normalize(),
    position: new Vector3(ox, oz, -oy),
  };
}

type Phase = "drawing" | "held" | "holstering";
interface Held {
  item: CrewItemDefinition;
  visual: HeldItemVisual;
  cls: string | null;
  phase: Phase;
  /** Clock (ms) the current draw/holster clip started. */
  startedMs: number;
  grabS: number;
  endS: number;
}

/**
 * The item in a voxel crew's right hand, with draw and holster transitions (presentation only; the
 * held item is whatever the server's equipped inventory says). Changing the item holsters the old
 * one (armed `holster` clip: the hand returns it to its holster socket at the grab frame), then
 * draws the new one (armed `draw` clip: it rides the holster until the hand takes it). Items with no
 * armed class (thrown, carried) and reduced motion swap at once.
 */
export function createVoxelHeldItem(
  scene: Scene,
  crew: VoxelCrew,
  options: {
    /** Item meshes were added or removed (lighting, glow occlusion). */
    onChange?: () => void;
    reducedMotion?: () => boolean;
    /** Skip draw/holster clips (e.g. the first load of a scene). */
    instant?: () => boolean;
    /** Wall clock in ms (tests); the clips play in wall-clock time. */
    now?: () => number;
    operatorSources?: {
      item(id: string):
        | {
            source: VerifiedCrewSource;
            requiredSockets: readonly import("@sidereal/content/crew-items").CrewItemSocketName[];
          }
        | undefined;
      armedClips: VerifiedCrewSource;
    };
  } = {},
) {
  let wanted: string | null = null;
  let held: Held | undefined;
  let loading = 0;
  let disposed = false;
  let requestError: string | null = null;
  const inFlight = new Set<Promise<void>>();
  const reduced = () => !!options.reducedMotion?.();
  const now = options.now ?? (() => performance.now());
  const hand = () => crew.socketNodes["socket.hand.R"];
  const toHand = (visual: HeldItemVisual) => {
    visual.root.parent = hand();
    visual.root.rotationQuaternion = crewItemHandSocketRotation();
    visual.root.position.setAll(0);
  };
  const toHolster = (h: Held) => {
    const holster = h.item.holster;
    const socket = holster && crew.socketNodes[holster.socket as never];
    if (!holster || !socket) return;
    const { rotation, position } = holsterTransform(holster);
    h.visual.root.parent = socket as TransformNode;
    h.visual.root.rotationQuaternion = rotation;
    h.visual.root.position.copyFrom(position);
  };
  const clip = (h: Held, name: "draw" | "holster") =>
    h.cls ? crewArmedClipInfo(h.item, name) : null;

  const finishHolster = () => {
    if (!held) return;
    crew.setSupportTarget(null);
    held.visual.dispose();
    held = undefined;
    crew.setArmedClass(null);
    options.onChange?.();
    void load();
  };
  const startHolster = () => {
    if (!held || held.phase === "holstering") return;
    const info = clip(held, "holster");
    if (!info || reduced() || options.instant?.()) return finishHolster();
    held.phase = "holstering";
    crew.setSupportTarget(null);
    held.startedMs = now();
    held.grabS = (info.grabFrame ?? 0) / ARMED_FPS;
    held.endS = info.frames / ARMED_FPS;
    crew.play(info.animation as VoxelCrewAction);
  };
  const loadActual = async () => {
    if (disposed || held) return;
    const id = wanted;
    const generation = ++loading;
    if (!id) return;
    const item = crewItem(id);
    const cls = crewArmedClass(item);
    const descriptor = options.operatorSources?.item(id);
    const results = await Promise.allSettled([
      options.operatorSources && !descriptor
        ? Promise.reject(new Error("Operator held source unavailable"))
        : createVoxelItemVisual(scene, hand(), id, {
            localRotation: crewItemHandSocketRotation(),
            verifiedSource: descriptor?.source,
            requiredSockets: descriptor?.requiredSockets,
          }),
      cls
        ? loadArmedClips(
            scene,
            crew,
            options.operatorSources?.armedClips,
            options.operatorSources
              ? ["draw", "holster", "reload"]
                  .map(
                    (action) =>
                      crewArmedClipInfo(
                        item,
                        action as "draw" | "holster" | "reload",
                      )?.animation,
                  )
                  .filter((name): name is string => !!name)
              : [],
          )
        : undefined,
    ]);
    const loaded = results[0];
    if (loaded.status !== "fulfilled" || results[1].status === "rejected") {
      if (loaded.status === "fulfilled") loaded.value.dispose();
      if (!disposed && generation === loading && wanted === id)
        requestError = "Operator held item unavailable";
      return;
    }
    const visual = loaded.value;
    if (disposed || generation !== loading || wanted !== id || held) {
      visual.dispose();
      if (!disposed && !held) void load();
      return;
    }
    held = {
      item,
      visual,
      cls,
      phase: "held",
      startedMs: now(),
      grabS: 0,
      endS: 0,
    };
    crew.setArmedClass(cls);
    const info = clip(held, "draw");
    if (info && !reduced() && !options.instant?.()) {
      held.phase = "drawing";
      held.grabS = (info.grabFrame ?? 0) / ARMED_FPS;
      held.endS = info.frames / ARMED_FPS;
      toHolster(held);
      crew.play(info.animation as VoxelCrewAction);
    }
    updateSupport();
    options.onChange?.();
  };
  const load = () => {
    const generation = loading;
    const key = wanted;
    const promise = loadActual().catch(() => {
      if (!disposed && loading === generation + 1 && wanted === key)
        requestError = "Operator held item unavailable";
    });
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
    return promise;
  };
  const observer = scene.onBeforeRenderObservable.add(() => {
    step();
    updateSupport();
  });
  // The solver runs onAfterAnimations: select/release its target before that frame animates.
  const supportObserver = scene.onBeforeAnimationsObservable.add(updateSupport);
  function updateSupport() {
    // Reload/draw/holster author the free hand reaching a magazine or holster. Keep those
    // choreographed tracks free; solve the foregrip in ready/aim/fire and locomotion poses.
    crew.setSupportTarget(
      held?.phase === "held" &&
        held.item.twoHanded &&
        crewUsesSupportGrip(crew.activeClips)
        ? held.visual.supportTarget
        : null,
    );
  }
  /** Advance the draw/holster transition to the current clock (also run once per render). */
  function step() {
    if (!held || held.phase === "held") return;
    const t = (now() - held.startedMs) / 1000;
    if (held.phase === "drawing") {
      if (t >= held.grabS && held.visual.root.parent !== hand())
        toHand(held.visual);
      if (t >= held.endS) held.phase = "held";
    } else {
      if (t >= held.grabS) toHolster(held);
      if (t >= held.endS) finishHolster();
    }
  }
  return {
    /** Advance transitions now (tests and headless review; rendering does this every frame). */
    step,
    /** The r001 item that should be in hand (null = empty hand). */
    set(itemId: string | null) {
      if (disposed || itemId === wanted) return;
      wanted = itemId;
      requestError = null;
      if (held) startHolster();
      else void load();
    },
    get status() {
      return {
        requestedKey: wanted,
        pending: inFlight.size,
        error: requestError,
      };
    },
    async whenComplete() {
      const key = wanted;
      while (inFlight.size) await Promise.all([...inFlight]);
      if (disposed || key !== wanted)
        throw new Error("Operator held request withdrawn");
      if (requestError) throw new Error(requestError);
      if (wanted && held?.item.id !== wanted)
        throw new Error("Operator held item incomplete");
    },
    get itemId() {
      return held?.phase === "holstering" ? null : (held?.item.id ?? null);
    },
    get phase(): Phase | null {
      return held?.phase ?? null;
    },
    get visual() {
      return held?.visual;
    },
    /** Muzzle (or emitter) of the held item in world space, while it is in the hand. */
    muzzle() {
      if (!held || held.phase !== "held") return undefined;
      return held.visual.getMuzzleWorld();
    },
    /** Play the held item's part clip for an accepted action (slide, pump, barrel spin, cell). */
    playItem(action: "fire" | "reload" | "use") {
      return held?.visual.play(action);
    },
    /** Armed reload clip with the item's reload part clip (magazine drop / cell swap). */
    reload() {
      if (!held || held.phase !== "held") return false;
      const info = held.cls ? crewArmedClipInfo(held.item, "reload") : null;
      if (info) crew.play(info.animation as VoxelCrewAction);
      held.visual.play("reload");
      return !!info;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(observer);
      scene.onBeforeAnimationsObservable.remove(supportObserver);
      crew.setSupportTarget(null);
      held?.visual.dispose();
      held = undefined;
      crew.setArmedClass(null);
    },
  };
}
export type VoxelHeldItem = ReturnType<typeof createVoxelHeldItem>;
