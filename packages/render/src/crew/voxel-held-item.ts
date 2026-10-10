import { studyCrewPalette } from "./crew-study-materials";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import { CREW_STUDY } from "@sidereal/content/crew-study";

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
/** Register CHAR-WEAPONS armed-actions.glb clips (`<class>.<clip>`) on a voxel crew once. */
export function loadArmedClips(scene: Scene, crew: VoxelCrew) {
  if (crew.study) return Promise.resolve();
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

export function studyItemLod(
  distanceM: number,
  current: "lod0" | "lod1" = "lod0",
) {
  return distanceM > 24 ? "lod1" : distanceM < 18 ? "lod0" : current;
}

/** Source rest-frame holster carried by its socket's bone; offsets are in rig metres. */
export function studyHolsterTransform(crew: VoxelCrew, name: string) {
  const h = CREW_STUDY.holsters[name];
  const socket =
    h && crew.socketNodes[h.socket as keyof typeof crew.socketNodes];
  const joint = socket?.parent;
  const bone = crew.skeleton?.bones.find((b) => b.name === joint?.name);
  if (!h || !(joint instanceof TransformNode) || !socket || !bone) return;
  const rest = bone.getAbsoluteInverseBindMatrix().clone().invert();
  const inverse = rest.clone().invert();
  const z = Vector3.FromArray(h.itemForward).normalize().scale(-1);
  const up = Vector3.FromArray(h.itemUp);
  const y = up.subtract(z.scale(Vector3.Dot(up, z))).normalize();
  const x = Vector3.Cross(y, z).normalize();
  const frame = Matrix.FromValues(
    x.x,
    x.y,
    x.z,
    0,
    y.x,
    y.y,
    y.z,
    0,
    z.x,
    z.y,
    z.z,
    0,
    0,
    0,
    0,
    1,
  );
  const restRotation = new Quaternion();
  rest.decompose(undefined, restRotation);
  return {
    parent: joint,
    position: socket.position.add(
      Vector3.TransformNormal(Vector3.FromArray(h.offsetM), inverse),
    ),
    rotation: Quaternion.Inverse(restRotation).multiply(
      Quaternion.FromRotationMatrix(frame),
    ),
  };
}

type Phase = "drawing" | "held" | "holstering" | "stowed";
interface Held {
  item: CrewItemDefinition;
  visual: HeldItemVisual;
  cls: string | null;
  phase: Phase;
  /** Clock (ms) the current draw/holster clip started. */
  startedMs: number;
  grabS: number;
  endS: number;
  lod: "lod0" | "lod1";
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
    distance?: () => number;
    loadVisual?: typeof createVoxelItemVisual;
    /** Unarmed/seated presentation: weapons ride their authored holster, tools remain carried. */
    resting?: () => boolean;
  } = {},
) {
  let wanted: string | null = null;
  let held: Held | undefined;
  let loading = 0;
  let disposed = false;
  let paletteKey = "";
  let stowed = false;
  let lodGeneration = 0;
  let lodPending = false;
  const createVisual = options.loadVisual ?? createVoxelItemVisual;
  const distance =
    options.distance ??
    (() =>
      scene.activeCamera
        ? Vector3.Distance(
            scene.activeCamera.globalPosition,
            crew.root.getAbsolutePosition(),
          )
        : 0);
  const holsters = crew.study
    ? new Map(
        Object.keys(CREW_STUDY.holsters).map((name) => [
          name,
          studyHolsterTransform(crew, name),
        ]),
      )
    : undefined;
  const sourceItem = (item: CrewItemDefinition) =>
    CREW_STUDY.items[
      `item.${item.id === "medkit" ? "med_kit" : item.id.replace(/-/g, "_")}`
    ];
  const syncPalette = () => {
    if (!held || !crew.study) return;
    const palette = studyCrewPalette(crew.appearance);
    const key = JSON.stringify(palette);
    if (key === paletteKey) return;
    paletteKey = key;
    held.visual.setPalette(palette);
  };
  const reduced = () => !!options.reducedMotion?.();
  const now = options.now ?? (() => performance.now());
  const hand = () =>
    crew.study ? crew.joints.get("prop.R")! : crew.socketNodes["socket.hand.R"];
  const toHand = (visual: HeldItemVisual) => {
    visual.root.parent = hand();
    visual.root.rotationQuaternion = crew.study
      ? Quaternion.Identity()
      : crewItemHandSocketRotation();
    visual.root.position.setAll(0);
  };
  const toHolster = (h: Held) => {
    // Rig-v2 draw/holster clips animate prop.R to the exact holster frame themselves.
    if (crew.study) {
      toHand(h.visual);
      return;
    }
    const holster = h.item.holster;
    const socket = holster && crew.socketNodes[holster.socket as never];
    if (!holster || !socket) return;
    const { rotation, position } = holsterTransform(holster);
    h.visual.root.parent = socket as TransformNode;
    h.visual.root.rotationQuaternion = rotation;
    h.visual.root.position.copyFrom(position);
  };
  const toStowed = (h: Held) => {
    const name = sourceItem(h.item)?.holster;
    const transform = name && holsters?.get(name);
    if (!transform) return toHolster(h);
    h.visual.root.parent = transform.parent;
    h.visual.root.position.copyFrom(transform.position);
    h.visual.root.rotationQuaternion = transform.rotation.clone();
  };
  const clip = (h: Held, name: "draw" | "holster") => {
    if (crew.study && h.cls) {
      const animation = `${h.cls}.${name}`;
      const info = CREW_STUDY.clips[animation];
      return info ? { ...info, animation } : null;
    }
    return h.cls ? crewArmedClipInfo(h.item, name) : null;
  };

  const finishHolster = () => {
    if (!held) return;
    crew.setSupportTarget(null);
    if (crew.study && wanted === held.item.id) {
      if (stowed) {
        held.phase = "stowed";
        toStowed(held);
        crew.setArmedClass(null);
      } else startDraw(held);
      options.onChange?.();
      return;
    }
    lodGeneration++;
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
    const fps = crew.study ? CREW_STUDY.clips[info.animation].fps : ARMED_FPS;
    held.grabS = (info.grabFrame ?? 0) / fps;
    held.endS = info.frames / fps;
    crew.play(info.animation as VoxelCrewAction);
  };
  const startDraw = (h: Held) => {
    crew.setArmedClass(h.cls);
    toHand(h.visual);
    h.phase = "held";
    const info = clip(h, "draw");
    if (info && !reduced() && !options.instant?.()) {
      h.phase = "drawing";
      h.startedMs = now();
      h.grabS =
        (info.grabFrame ?? 0) /
        (crew.study ? CREW_STUDY.clips[info.animation].fps : ARMED_FPS);
      h.endS =
        info.frames /
        (crew.study ? CREW_STUDY.clips[info.animation].fps : ARMED_FPS);
      toHolster(h);
      crew.play(info.animation as VoxelCrewAction);
    }
  };
  const load = async () => {
    if (disposed || held) return;
    const id = wanted;
    const generation = ++loading;
    if (!id) return;
    const item = crewItem(id);
    const cls = crewArmedClass(item);
    const lod = crew.study ? studyItemLod(distance()) : "lod0";
    const [visual] = await Promise.all([
      createVisual(scene, hand(), id, {
        localRotation: crew.study
          ? Quaternion.Identity()
          : crewItemHandSocketRotation(),
        study: crew.study,
        lod,
      }),
      cls ? loadArmedClips(scene, crew) : undefined,
    ]);
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
      lod,
    };
    paletteKey = "";
    syncPalette();
    if (crew.study && options.resting)
      stowed =
        !!options.resting() && ["ballistic", "energy"].includes(item.category);
    if (crew.study && stowed) finishHolster();
    else startDraw(held);
    updateSupport();
    options.onChange?.();
  };
  const observer = scene.onBeforeRenderObservable.add(() => {
    step();
    updateSupport();
    updateLod();
  });
  function updateLod() {
    if (!crew.study || !held || lodPending || disposed) return;
    const lod = studyItemLod(distance(), held.lod);
    if (lod === held.lod) return;
    const current = held;
    const generation = ++lodGeneration;
    lodPending = true;
    void createVisual(scene, hand(), current.item.id, {
      study: true,
      lod,
      localRotation: Quaternion.Identity(),
    })
      .then((visual) => {
        if (disposed || held !== current || generation !== lodGeneration)
          return visual.dispose();
        visual.root.parent = current.visual.root.parent;
        visual.root.position.copyFrom(current.visual.root.position);
        visual.root.rotationQuaternion =
          current.visual.root.rotationQuaternion?.clone() ??
          Quaternion.Identity();
        visual.setPalette(studyCrewPalette(crew.appearance));
        current.visual.dispose();
        current.visual = visual;
        current.lod = lod;
        updateSupport();
        options.onChange?.();
      })
      .catch((error) =>
        console.warn(`Crew item LOD unavailable: ${current.item.id}`, error),
      )
      .finally(() => {
        lodPending = false;
      });
  }
  // The solver runs onAfterAnimations: select/release its target before that frame animates.
  const supportObserver = scene.onBeforeAnimationsObservable.add(updateSupport);
  function updateSupport() {
    // V2 clips bake the authored rolled/slid prop.L grip, rather than the legacy raw socket.
    if (crew.study) {
      held?.visual.setSightDeployed(
        crew.activeClips.some(
          (clip) => CREW_STUDY.clips[clip.split(":")[0]]?.sight === "deployed",
        ),
      );
      crew.setSupportTarget(null);
      return;
    }
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
    if (crew.study && wanted && options.resting) {
      const on =
        !!options.resting() &&
        ["ballistic", "energy"].includes(crewItem(wanted).category);
      if (stowed !== on) setStowed(on);
    }
    syncPalette();
    if (!held || held.phase === "held" || held.phase === "stowed") return;
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
  function setStowed(on: boolean) {
    if (disposed || !crew.study || stowed === on) return;
    stowed = on;
    if (!held) return;
    if (on) startHolster();
    else if (held.phase === "stowed") startDraw(held);
  }
  return {
    /** Advance transitions now (tests and headless review; rendering does this every frame). */
    step,
    /** Presentation of the owned hand item at rest; never grants another carried item. */
    setStowed,
    get lod() {
      return held?.lod;
    },
    /** The r001 item that should be in hand (null = empty hand). */
    set(itemId: string | null) {
      if (disposed || itemId === wanted) return;
      wanted = itemId;
      if (held) startHolster();
      else void load();
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
      lodGeneration++;
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
