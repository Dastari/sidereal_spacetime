/**
 * Local review harness for the proposal voxel crew (CHAR-BODY r001) inside the ACTUAL game renderer
 * (createWorld, stock ship, deck view). Presentation only: static SceneState, no database, no
 * authority writes. Serve through the client Vite dev server:
 *   /@fs/<repo>/scripts/crew-voxel-review/index.html
 */
import { createWorld, type SceneState } from "../../packages/render/src/index";
import type { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { prefabById } from "../../packages/content/src/prefabs/index";
import { defaultPrefabComponentCatalog } from "../../packages/content/src/ship-prefab-catalog";
import { equipVoxelCrewItem } from "../../packages/render/src/crew/voxel-crew-kit";
import {
  VOXEL_CREW_ACTIONS,
  VOXEL_CREW_EXTRA_ACTIONS,
  type VoxelCrewAction,
} from "../../packages/content/src/crew-voxel-bundle";
import type { VoxelCrewMotion } from "../../packages/render/src/crew/voxel-crew-clips";

type Mode =
  | "idle"
  | "walk"
  | "run"
  | "crouch"
  | "crouch_walk"
  | "rifle_idle"
  | "rifle_aim"
  | "rifle_walk_aim"
  | "pistol_aim"
  | "carry"
  | "carry_walk"
  | "seated"
  | "climb"
  | "hover"
  | "downed"
  | "dead";
const MODES: Record<
  Mode,
  {
    moving?: boolean;
    sprint?: boolean;
    weapon?: "rifle" | "pistol";
    combat?: boolean;
    override?: Partial<VoxelCrewMotion>;
    seated?: boolean;
  }
> = {
  idle: {},
  walk: { moving: true },
  run: { moving: true, sprint: true },
  crouch: { override: { crouching: true } },
  crouch_walk: { moving: true, override: { crouching: true } },
  rifle_idle: { weapon: "rifle" },
  rifle_aim: { weapon: "rifle", combat: true },
  rifle_walk_aim: { weapon: "rifle", combat: true, moving: true },
  pistol_aim: { weapon: "pistol", combat: true },
  carry: { override: { carrying: true } },
  carry_walk: { moving: true, override: { carrying: true } },
  seated: { seated: true },
  climb: { override: { climbing: true } },
  hover: { override: { hovering: true } },
  downed: { override: { downed: true } },
  dead: { override: { dead: true } },
};

const canvas = document.querySelector("canvas")!;
const status = document.querySelector("#status")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#mode")!;
const actionSelect = document.querySelector<HTMLSelectElement>("#action")!;
const bodySelect = document.querySelector<HTMLSelectElement>("#body")!;
for (const m of Object.keys(MODES)) modeSelect.append(new Option(m, m));
for (const a of [...VOXEL_CREW_ACTIONS, ...VOXEL_CREW_EXTRA_ACTIONS])
  actionSelect.append(new Option(a, a));

const params = new URLSearchParams(location.search);
let mode = (params.get("mode") as Mode) ?? "idle";
let body = params.get("body") ?? "male";
let t = 0;
let shots = 0n;
const origin = {
  x: Number(params.get("x") ?? 0),
  y: Number(params.get("y") ?? 0),
};
const shipId = params.get("ship") === "wren" ? "fed.s.wren" : null;
let sceneRef: Scene | undefined;
let deckFloor = 0;
let walkAxis: "x" | "y" = "y";
let walkSpan = 3;
let state: SceneState = {
  heading: 0,
  x: 0,
  y: 0,
  localX: origin.x,
  localY: origin.y,
  interior: true,
  inspect: false,
  grid: false,
  crewAppearance: { outfit: "engineer", bodyType: body as "male" },
};
let world: Awaited<ReturnType<typeof createWorld>> | undefined;
const controller = new AbortController();
const crew = () =>
  world?.getCrewVisual() as
    | (NonNullable<ReturnType<NonNullable<typeof world>["getCrewVisual"]>> & {
        setMotionOverride?: (m?: Partial<VoxelCrewMotion>) => void;
        play?: (a: VoxelCrewAction) => void;
        setOutfit?: (o: { suit?: boolean; gear?: boolean }) => void;
        face?: {
          setExpression(id: string | null): void;
          setViseme(id: string | null): void;
          blink(): void;
        };
        layers?: unknown;
        activeClips?: string[];
      })
    | undefined;

// ------------------------------------------------------------------ rig review (CREW-RIG)
// Review-only camera, skeleton overlay and clip freeze for the joint-limit visual pass. The
// review camera replaces the game camera only while set; the game camera views stay authentic.
const RIG_BONES: [string, string][] = [
  ["pelvis", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"],
  ["chest", "shoulder.L"], ["shoulder.L", "upper_arm.L"], ["upper_arm.L", "forearm.L"], ["forearm.L", "hand.L"],
  ["chest", "shoulder.R"], ["shoulder.R", "upper_arm.R"], ["upper_arm.R", "forearm.R"], ["forearm.R", "hand.R"],
  ["pelvis", "thigh.L"], ["thigh.L", "shin.L"], ["shin.L", "foot.L"], ["foot.L", "toe.L"],
  ["pelvis", "thigh.R"], ["thigh.R", "shin.R"], ["shin.R", "foot.R"], ["foot.R", "toe.R"],
];
const overlay = document.createElement("canvas");
overlay.width = 1280;
overlay.height = 800;
Object.assign(overlay.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none", width: "1280px", height: "800px" });
document.body.append(overlay);
let skeletonOn = params.get("skeleton") === "1";
let posing = false;
let posedGroup: unknown = null;
let mutedUpdate: unknown = null;
let reviewCam: ArcRotateCamera | undefined;
let gameCam: Camera | null = null;
const drawSkeleton = () => {
  const g = overlay.getContext("2d")!;
  g.clearRect(0, 0, overlay.width, overlay.height);
  const c = crew() as { joints?: Map<string, TransformNode> } | undefined;
  if (!skeletonOn || !sceneRef?.activeCamera || !c?.joints) return;
  const vp = sceneRef.activeCamera.viewport.toGlobal(overlay.width, overlay.height);
  const tm = sceneRef.getTransformMatrix();
  const at = (n: string) => {
    const node = c.joints!.get(n);
    return node ? Vector3.Project(node.getAbsolutePosition(), Matrix.IdentityReadOnly, tm, vp) : undefined;
  };
  g.lineWidth = 3;
  for (const [a, b] of RIG_BONES) {
    const p = at(a), q = at(b);
    if (!p || !q) continue;
    g.strokeStyle = /\.L$/.test(b) ? "#ffcf3f" : /\.R$/.test(b) ? "#3fffd2" : "#ff5fd2";
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
  }
  // floor reference: a square on the deck plane under the rig root (feet should sit on it)
  const root = c.joints.get("root")?.getAbsolutePosition();
  if (root) {
    const r = 0.45;
    const corners = [
      [-r, -r], [r, -r], [r, r], [-r, r], [-r, -r],
    ].map(([x, z]) => Vector3.Project(new Vector3(root.x + x, root.y, root.z + z), Matrix.IdentityReadOnly, tm, vp));
    g.strokeStyle = "#ffffff88";
    g.lineWidth = 1.5;
    g.beginPath();
    corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  }
  g.fillStyle = "#ffffff";
  for (const n of c.joints.keys()) {
    const p = at(n);
    if (p) g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
  }
};
const hidden = new Map<AbstractMesh, boolean>();
const isolate = (keep: Set<AbstractMesh> | null) => {
  for (const [mesh, enabled] of hidden) mesh.setEnabled(enabled);
  hidden.clear();
  if (!keep || !sceneRef) return;
  for (const mesh of sceneRef.meshes)
    if (!keep.has(mesh)) {
      hidden.set(mesh, mesh.isEnabled(false));
      mesh.setEnabled(false);
    }
};
const reviewTarget = () => {
  const c = crew() as { joints?: Map<string, TransformNode> } | undefined;
  return c?.joints?.get("pelvis")?.getAbsolutePosition() ?? Vector3.Zero();
};

const applyMode = () => {
  const m = MODES[mode];
  state = {
    ...state,
    seated: !!m.seated,
    sprinting: !!m.sprint,
    equippedAsset:
      m.weapon === "rifle"
        ? "carbine"
        : m.weapon === "pistol"
          ? "compact-pistol"
          : null,
    combat: m.combat
      ? { active: true, angle: 0, range: 40, shotSequence: shots }
      : undefined,
    crewAppearance: {
      outfit: "engineer",
      bodyType: body as "male",
      weapon: m.weapon ?? "none",
    },
  };
  crew()?.setMotionOverride?.(m.override);
  world?.update(state);
};

const tick = () => {
  if (!world || posing) return;
  const m = MODES[mode];
  if (m.moving) {
    const speed = m.sprint
      ? 4.5
      : m.override?.crouching || m.override?.carrying
        ? 1.2
        : 2.5;
    t += (1 / 60) * speed;
    // walk a 3 m back-and-forth line along ship-forward so the camera keeps the actor in view
    const phase = (t / walkSpan) % 2;
    const d = (phase < 1 ? phase : 2 - phase) * walkSpan - walkSpan / 2;
    state =
      walkAxis === "y"
        ? {
            ...state,
            localX: origin.x,
            localY: origin.y + d,
            heading: phase < 1 ? 0 : Math.PI,
          }
        : {
            ...state,
            localX: origin.x + d,
            localY: origin.y,
            heading: phase < 1 ? Math.PI / 2 : -Math.PI / 2,
          };
  }
  world.update(state);
  const c = crew();
  (canvas.dataset as DOMStringMap).review = JSON.stringify({
    mode,
    body,
    layers: c?.layers,
    clips: c?.activeClips,
  });
};

/** Wren prefab (SHIPS-PREFABS dressed deck view) under the game's ship frame, as the client does. */
async function loadShip(scene: Scene) {
  if (!shipId) return;
  const doc = prefabById(shipId)!;
  const { createPrefabShipView } =
    await import("../../packages/render/src/prefab-ship/ship-view");
  const shipRoot = scene.getTransformNodeByName("ship-frame") as TransformNode;
  const view = await createPrefabShipView(scene, doc, {
    catalog: defaultPrefabComponentCatalog(),
    view: "deck",
    parent: shipRoot,
    standinComponents: true,
    roomLights: 2,
  });
  view.root.computeWorldMatrix(true);
  const { min, max } = view.root.getHierarchyBoundingVectors(true);
  // walk along the longer horizontal axis through the ship centre (ship local: x -> X, y -> -Z)
  const cx = (min.x + max.x) / 2,
    cz = (min.z + max.z) / 2;
  walkAxis = max.x - min.x > max.z - min.z ? "x" : "y";
  walkSpan = Math.max(
    1.5,
    Math.min(4, ((walkAxis === "x" ? max.x - min.x : max.z - min.z) - 4) / 2),
  );
  origin.x = cx;
  origin.y = -cz;
  const meshes = view.root.getChildMeshes();
  const hit = scene.multiPickWithRay(
    new Ray(new Vector3(cx, max.y + 1, cz), new Vector3(0, -1, 0), 50),
    (m) => meshes.includes(m as never),
  );
  const floors = (hit ?? [])
    .map((h) => h.pickedPoint!.y)
    .filter((y) => y < min.y + 1.2)
    .sort((a, b) => b - a);
  deckFloor = floors[0] ?? min.y;
  // the harness has no construction authority: lift the dressed ship so its deck meets the default walking datum
  view.root.position.y += 0.1875 - deckFloor;
  (window as { crewReviewShip?: unknown }).crewReviewShip = {
    min: min.asArray(),
    max: max.asArray(),
    deckFloor,
    walkAxis,
    walkSpan,
  };
}

createWorld(canvas, (text) => (status.textContent = text), {
  crewBundle: "voxel",
  signal: controller.signal,
  ...(shipId ? { vessel: "none" as const } : {}),
  onScene: (scene) => {
    sceneRef = scene;
    scene.onBeforeRenderObservable.add(tick);
    scene.onAfterRenderObservable.add(drawSkeleton);
    // while posing, the world's per-frame crew update may restart its state clips: keep only the
    // posed clip running
    scene.onBeforeAnimationsObservable.add(() => {
      if (!posing) return;
      for (const g of scene.animationGroups)
        if (g !== posedGroup && g.isStarted) g.stop();
    });
  },
})
  .then(async (result) => {
    world = result;
    if (sceneRef)
      await loadShip(sceneRef).catch((e) => console.error("ship", e));
    applyMode();
    status.textContent =
      "voxel crew (proposal, preview only) — actual game renderer, no database";
  })
  .catch((error) => {
    status.textContent = String(error);
    console.error(error);
  });

modeSelect.value = mode;
bodySelect.value = body;
modeSelect.addEventListener("change", () => {
  mode = modeSelect.value as Mode;
  applyMode();
});
bodySelect.addEventListener("change", () => {
  body = bodySelect.value;
  applyMode();
});
document
  .querySelector("#play")!
  .addEventListener("click", () =>
    crew()?.play?.(actionSelect.value as VoxelCrewAction),
  );
document.querySelector("#shoot")!.addEventListener("click", () => {
  shots += 1n;
  applyMode();
});
document
  .querySelector<HTMLSelectElement>("#outfit")!
  .addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    crew()?.setOutfit?.({ suit: v !== "base", gear: v === "gear" });
  });
document
  .querySelector<HTMLSelectElement>("#expression")!
  .addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    crew()?.face?.setExpression(v === "auto" ? null : v);
  });
Object.assign(window, {
  crewReview: {
    setOutfit(v: "base" | "suit" | "gear") {
      crew()?.setOutfit?.({ suit: v !== "base", gear: v === "gear" });
    },
    setExpression(v: string | null) {
      crew()?.face?.setExpression(v);
    },
    setMode(next: Mode) {
      mode = next;
      modeSelect.value = next;
      applyMode();
    },
    setBody(next: string) {
      body = next;
      applyMode();
    },
    play(action: VoxelCrewAction) {
      crew()?.play?.(action);
    },
    async equip(item: string) {
      const c = crew();
      if (c && sceneRef) return equipVoxelCrewItem(sceneRef, c as never, item);
    },
    shoot() {
      shots += 1n;
      applyMode();
    },
    /** Skeleton overlay (joint heads joined parent -> child; L yellow, R cyan, spine magenta). */
    skeleton(on: boolean) {
      skeletonOn = on;
    },
    /**
     * Review camera orbiting the pelvis (alpha/beta radians, radius metres); null restores the
     * game camera. azimuth is relative to the crew facing: 0 = right side, PI/2 = front.
     */
    reviewCamera(view: { azimuth: number; beta: number; radius: number; lift?: number; isolate?: boolean } | null) {
      if (!sceneRef) return;
      if (!view) {
        isolate(null);
        if (gameCam) sceneRef.activeCamera = gameCam;
        return;
      }
      if (!reviewCam) {
        gameCam = sceneRef.activeCamera;
        reviewCam = new ArcRotateCamera("crew-rig-review", 0, 1, 3, Vector3.Zero(), sceneRef);
        reviewCam.fov = 0.5;
        reviewCam.minZ = 0.05;
        sceneRef.onBeforeRenderObservable.add(() => {
          const t = reviewTarget();
          reviewCam!.target.set(t.x, t.y + ((reviewCam as unknown as { lift?: number }).lift ?? 0), t.z);
        });
      }
      const c = crew() as { root?: TransformNode } | undefined;
      // isolate: hide the deck (walls occlude close rig views); the game-camera views keep it
      isolate(view.isolate ? new Set(c?.root?.getChildMeshes(false) ?? []) : null);
      const facing = c?.root?.rotation.y ?? 0;
      reviewCam.alpha = -facing + view.azimuth;
      reviewCam.beta = view.beta;
      reviewCam.radius = view.radius;
      (reviewCam as unknown as { lift?: number }).lift = view.lift ?? 0;
      sceneRef.activeCamera = reviewCam;
    },
    /** Freeze every playing crew clip at `frame` (24 fps frames from each clip start); null resumes. */
    freeze(frame: number | null) {
      for (const g of sceneRef?.animationGroups ?? []) {
        if (frame === null) {
          if (g.isStarted && !g.isPlaying) g.play(g.loopAnimation);
          continue;
        }
        if (!g.isStarted) continue;
        g.pause();
        g.goToFrame(Math.min(g.to, g.from + frame));
      }
    },
    /**
     * Hold one clip at a 24 fps frame (body or loaded armed clip, e.g. "death", "rifle.aim"):
     * every other animation group stops and the gameplay state stops driving the crew until
     * unpose(). Returns false when the clip is not loaded.
     */
    pose(clip: string, frame: number) {
      if (!sceneRef) return false;
      const g = sceneRef.animationGroups.find((a) => a.name === clip);
      if (!g) return false;
      posing = true;
      posedGroup = g;
      // the world drives crew.update() every frame; mute it while a clip is held
      const c = crew() as { update: (m: unknown) => void } | undefined;
      if (c && !mutedUpdate) {
        mutedUpdate = c.update;
        c.update = () => {};
      }
      for (const other of sceneRef.animationGroups) other.stop();
      const at = Math.min(g.to, g.from + (frame * 60) / 24);
      g.start(false, 1e-6, at, g.to);
      g.setWeightForAllAnimatables(1);
      return true;
    },
    unpose() {
      const c = crew() as { update: (m: unknown) => void } | undefined;
      if (c && mutedUpdate) c.update = mutedUpdate as (m: unknown) => void;
      mutedUpdate = null;
      posing = false;
      applyMode();
    },
    /** Names and lengths (frames) of the crew clips currently started. */
    startedClips() {
      return (sceneRef?.animationGroups ?? []).filter((g) => g.isStarted).map((g) => ({ name: g.name, from: g.from, to: g.to, weight: g.animatables[0]?.weight }));
    },
    get world() {
      return world;
    },
    get crew() {
      return crew();
    },
  },
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    controller.abort();
    world?.dispose();
  });
