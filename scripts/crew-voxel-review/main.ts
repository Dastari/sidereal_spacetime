/**
 * Local review harness for the proposal equipped voxel crew (pinned crew study v2, uniform scale 0.90) inside the ACTUAL game renderer
 * (createWorld, stock ship, deck view). Presentation only: static SceneState, no database, no
 * authority writes. Serve through the client Vite dev server:
 *   /@fs/<repo>/scripts/crew-voxel-review/index.html
 */
import { createWorld, type SceneState } from "../../packages/render/src/index";
import type { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  CHARACTER_COMPONENT_SETS,
  type EquippedCharacterComponents,
} from "../../packages/content/src/character-components";
import { prefabById } from "../../packages/content/src/prefabs/index";
import { defaultPrefabComponentCatalog } from "../../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../../packages/sim/src/prefab-flight";
import { prefabSeatPresentation } from "../../packages/render/src/crew/seat-presentation";
import { equipVoxelCrewItem } from "../../packages/render/src/crew/voxel-crew-kit";
import {
  VOXEL_CREW_ACTIONS,
  VOXEL_CREW_EXTRA_ACTIONS,
  type VoxelCrewAction,
} from "../../packages/content/src/crew-voxel-bundle";
import {
  CREW_STUDY,
  CREW_STUDY_SCALE,
} from "../../packages/content/src/crew-study";
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
  | "dead"
  | "eva";
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
  eva: {
    override: {
      eva: {
        phase: "free",
        forward: 1,
        strafe: 0,
        turn: 0,
        walking: false,
        cycling: false,
      },
    },
  },
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
let role = params.get("role") ?? "engineer";
const STUDY_CASES: Record<
  string,
  {
    body: string;
    role: string;
    mode: Mode;
    hair: "swept" | "scientist" | "ponytail" | "none";
    uniform?: string;
  }
> = {
  "male-uniform": {
    body: "male",
    role: "engineer",
    mode: "idle",
    hair: "swept",
    uniform: "engineering",
  },
  "female-uniform": {
    body: "female",
    role: "medic",
    mode: "idle",
    hair: "ponytail",
    uniform: "medical",
  },
  "male-t3": { body: "male", role: "marine", mode: "rifle_aim", hair: "none" },
  "female-t3": {
    body: "female",
    role: "marine",
    mode: "rifle_aim",
    hair: "none",
  },
  "female-scalp": {
    body: "female",
    role: "scientist",
    mode: "idle",
    hair: "scientist",
  },
  "female-seated": {
    body: "female",
    role: "pilot",
    mode: "seated",
    hair: "ponytail",
    uniform: "command",
  },
  "male-walk": {
    body: "male",
    role: "engineer",
    mode: "walk",
    hair: "swept",
    uniform: "engineering",
  },
  "female-walk": {
    body: "female",
    role: "engineer",
    mode: "walk",
    hair: "ponytail",
    uniform: "engineering",
  },
  "male-eva": { body: "male", role: "pilot", mode: "eva", hair: "none" },
  "female-eva": { body: "female", role: "pilot", mode: "eva", hair: "none" },
  "male-pistol": {
    body: "male",
    role: "security",
    mode: "pistol_aim",
    hair: "swept",
  },
  "female-rifle": {
    body: "female",
    role: "security",
    mode: "rifle_aim",
    hair: "ponytail",
  },
};
let caseName = params.get("case") ?? "";
const selectCase = (name: string) => {
  const selected = STUDY_CASES[name];
  if (!selected) return;
  caseName = name;
  body = selected.body;
  role = selected.role;
  mode = selected.mode;
};
selectCase(caseName);
let outfitDisplay: "equipped" | "uniform" | "base" = "equipped";
const roleEquipment = (): EquippedCharacterComponents => {
  if (outfitDisplay === "base") return {};
  if (outfitDisplay === "uniform") {
    const department: Record<string, string> = {
      captain: "command",
      medic: "medical",
      security: "security",
    };
    return { uniform: `wardrobe-uniform-${department[role] ?? "engineering"}` };
  }
  if (caseName.endsWith("-eva"))
    return {
      uniform: "wardrobe-suit-body",
      helmet: "wardrobe-suit-helmet",
      back: "wardrobe-suit-pack",
      boots: "wardrobe-suit-boots",
    };
  const uniform = STUDY_CASES[caseName]?.uniform ?? params.get("uniform");
  if (uniform) return { uniform: `wardrobe-uniform-${uniform}` };
  return {
    ...(CHARACTER_COMPONENT_SETS[
      role as keyof typeof CHARACTER_COMPONENT_SETS
    ] ?? {}),
  };
};
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
  crewAppearance: {
    outfit: role as "engineer",
    bodyType: body as "male",
    equippedComponents: roleEquipment(),
  },
};
let world: Awaited<ReturnType<typeof createWorld>> | undefined;
const controller = new AbortController();
const crew = () =>
  world?.getCrewVisual() as
    | (NonNullable<ReturnType<NonNullable<typeof world>["getCrewVisual"]>> & {
        setMotionOverride?: (m?: Partial<VoxelCrewMotion>) => void;
        play?: (a: VoxelCrewAction) => void;
        prepareClip?: (name: string) => unknown;
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
// review view overrides the game camera only while set; the game camera views stay authentic.
const RIG_BONES: [string, string][] = [
  ["pelvis", "spine"],
  ["spine", "chest"],
  ["chest", "neck"],
  ["neck", "head"],
  ["chest", "shoulder.L"],
  ["shoulder.L", "upper_arm.L"],
  ["upper_arm.L", "forearm.L"],
  ["forearm.L", "hand.L"],
  ["chest", "shoulder.R"],
  ["shoulder.R", "upper_arm.R"],
  ["upper_arm.R", "forearm.R"],
  ["forearm.R", "hand.R"],
  ["pelvis", "thigh.L"],
  ["thigh.L", "shin.L"],
  ["shin.L", "foot.L"],
  ["foot.L", "toe.L"],
  ["pelvis", "thigh.R"],
  ["thigh.R", "shin.R"],
  ["shin.R", "foot.R"],
  ["foot.R", "toe.R"],
];
const overlay = document.createElement("canvas");
overlay.width = 1280;
overlay.height = 800;
Object.assign(overlay.style, {
  position: "absolute",
  left: "0",
  top: "0",
  pointerEvents: "none",
  width: "1280px",
  height: "800px",
});
document.body.append(overlay);
let skeletonOn = params.get("skeleton") === "1";
let posing = false;
let posedGroup: unknown = null;
let mutedUpdate: unknown = null;
let reviewCam: ArcRotateCamera | undefined;
let reviewView:
  { alpha: number; beta: number; radius: number; lift: number } | undefined;
const drawSkeleton = () => {
  const g = overlay.getContext("2d")!;
  g.clearRect(0, 0, overlay.width, overlay.height);
  const c = crew() as { joints?: Map<string, TransformNode> } | undefined;
  if (!skeletonOn || !sceneRef?.activeCamera || !c?.joints) return;
  const vp = sceneRef.activeCamera.viewport.toGlobal(
    overlay.width,
    overlay.height,
  );
  const tm = sceneRef.getTransformMatrix();
  const at = (n: string) => {
    const node = c.joints!.get(n);
    return node
      ? Vector3.Project(
          node.getAbsolutePosition(),
          Matrix.IdentityReadOnly,
          tm,
          vp,
        )
      : undefined;
  };
  g.lineWidth = 3;
  for (const [a, b] of RIG_BONES) {
    const p = at(a),
      q = at(b);
    if (!p || !q) continue;
    g.strokeStyle = /\.L$/.test(b)
      ? "#ffcf3f"
      : /\.R$/.test(b)
        ? "#3fffd2"
        : "#ff5fd2";
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
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
      [-r, -r],
    ].map(([x, z]) =>
      Vector3.Project(
        new Vector3(root.x + x, root.y, root.z + z),
        Matrix.IdentityReadOnly,
        tm,
        vp,
      ),
    );
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
  const c = crew() as { root?: TransformNode } | undefined;
  const target = c?.root?.getAbsolutePosition().clone() ?? Vector3.Zero();
  // Fixed full-body centre: pelvis sway must not move the review framing.
  target.y += 0.85;
  return target;
};
const restorePose = () => {
  const c = crew() as { update: (m: unknown) => void } | undefined;
  if (c && mutedUpdate) c.update = mutedUpdate as (m: unknown) => void;
  mutedUpdate = null;
  posing = false;
};

const applyMode = () => {
  const m = MODES[mode] ?? MODES.idle;
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
    // Explicit accepted item presentation selects the matching source armed class.
    heldItem:
      m.weapon === "rifle" ? "rifle" : m.weapon === "pistol" ? "pistol" : null,
    combat: m.combat
      ? { active: true, angle: 0, range: 40, shotSequence: shots }
      : undefined,
    crewAppearance: {
      outfit: role as "engineer",
      equippedComponents: roleEquipment(),
      bodyType: body as "male",
      hairStyle: STUDY_CASES[caseName]?.hair ?? "swept",
      weapon: m.weapon ?? "none",
    },
  };
  crew()?.setMotionOverride?.(m.override);
  world?.update(state);
};

const tick = () => {
  if (!world || posing) return;
  const m = MODES[mode] ?? MODES.idle;
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
    case: caseName,
    sourceRevision: CREW_STUDY.revision,
    scale: CREW_STUDY_SCALE,
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
  signal: controller.signal,
  ...(shipId || params.get("ship") === "none" || caseName
    ? { vessel: "none" as const }
    : {}),
  onScene: (scene) => {
    sceneRef = scene;
    scene.onBeforeRenderObservable.add(tick);
    scene.onAfterRenderObservable.add(drawSkeleton);
    // while posing, the world's per-frame crew update may restart its state clips: keep only the
    // posed clip running
    scene.onBeforeAnimationsObservable.add(() => {
      if (!posing) return;
      for (const g of scene.animationGroups)
        if (g !== posedGroup && g.isStarted && g.name !== "deploy_sight")
          g.stop();
    });
  },
})
  .then(async (result) => {
    world = result;
    if (sceneRef)
      await loadShip(sceneRef).catch((e) => console.error("ship", e));
    applyMode();
    status.textContent = `${CREW_STUDY.revision} at ${CREW_STUDY_SCALE} — provisional, actual game renderer`;
    if (caseName)
      (
        window as unknown as {
          crewReview: { cameraPreset(name: string): void };
        }
      ).crewReview.cameraPreset(params.get("view") ?? "front");
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
    outfitDisplay =
      v === "base" ? "base" : v === "suit" ? "uniform" : "equipped";
    applyMode();
  });
document
  .querySelector<HTMLSelectElement>("#expression")!
  .addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    crew()?.face?.setExpression(v === "auto" ? null : v);
  });
let directHeld: Awaited<ReturnType<typeof equipVoxelCrewItem>> | undefined;
let contactShip: { dispose(): void } | undefined;
const caseSelect = document.querySelector<HTMLSelectElement>("#case")!;
for (const name of Object.keys(STUDY_CASES))
  caseSelect.append(new Option(name, name));
caseSelect.value = caseName;
caseSelect.addEventListener("change", () => {
  restorePose();
  state = { ...state, seatContact: undefined, seatFacing: undefined };
  selectCase(caseSelect.value);
  modeSelect.value = mode;
  bodySelect.value = body;
  applyMode();
});
Object.assign(window, {
  crewReview: {
    setOutfit(v: "base" | "suit" | "gear") {
      outfitDisplay =
        v === "base" ? "base" : v === "suit" ? "uniform" : "equipped";
      applyMode();
    },
    setExpression(v: string | null) {
      crew()?.face?.setExpression(v);
    },
    setMode(next: Mode) {
      mode = next;
      modeSelect.value = next;
      applyMode();
    },
    setRole(next: string) {
      role = next;
      applyMode();
    },
    setBody(next: string) {
      body = next;
      bodySelect.value = next;
      applyMode();
    },
    play(action: VoxelCrewAction) {
      crew()?.play?.(action);
    },
    async equip(item: string) {
      const c = crew();
      directHeld?.dispose();
      if (c && sceneRef) {
        directHeld = await equipVoxelCrewItem(sceneRef, c as never, item);
        return directHeld;
      }
    },
    setCase(name: string) {
      restorePose();
      state = { ...state, seatContact: undefined, seatFacing: undefined };
      selectCase(name);
      caseSelect.value = caseName;
      modeSelect.value = mode;
      bodySelect.value = body;
      applyMode();
    },
    /** Actual authored deck and accepted pilot anchor; no presentation-only chair offsets. */
    async seatInShip(id: string) {
      if (!sceneRef || !world) throw Error("Review scene unavailable");
      const doc = prefabById(id);
      if (!doc) throw Error("Unknown review prefab");
      const catalog = defaultPrefabComponentCatalog();
      const station = prefabFlightModel(doc, catalog).station;
      if (!station) throw Error("Review prefab has no pilot station");
      restorePose();
      isolate(null);
      contactShip?.dispose();
      const { createPrefabShipView } =
        await import("../../packages/render/src/prefab-ship/ship-view");
      contactShip = await createPrefabShipView(sceneRef, doc, {
        catalog,
        view: "deck",
        parent: sceneRef.getTransformNodeByName("ship-frame")!,
        standinComponents: false,
        roomLights: 2,
      });
      origin.x = station[0];
      origin.y = station[1];
      mode = "seated";
      applyMode();
      state = {
        ...state,
        localX: station[0],
        localY: station[1],
        seated: true,
        seatFacing:
          prefabSeatPresentation({ doc, catalog }, ...station)?.facing ?? 0,
        seatContact: prefabSeatPresentation({ doc, catalog }, ...station),
      };
      world.update(state);
      return {
        prefab: doc.id,
        revision: doc.revision,
        station,
        seatFacing: state.seatFacing,
        seatContact: state.seatContact ?? null,
        scale: CREW_STUDY_SCALE,
      };
    },
    cameraPreset(name: string) {
      const azimuths: Record<string, number> = {
        front: -Math.PI / 2,
        back: Math.PI / 2,
        left: Math.PI,
        right: 0,
        oblique: -Math.PI / 4,
      };
      const api = (
        window as unknown as {
          crewReview: { reviewCamera(view: unknown): void };
        }
      ).crewReview;
      api.reviewCamera({
        azimuth: azimuths[name] ?? azimuths.front,
        beta: name === "oblique" ? 1.3 : Math.PI / 2,
        radius: 4.5,
        lift: 0,
        isolate: true,
      });
    },
    record() {
      const c = crew() as
        | {
            root?: TransformNode;
            modelScale?: number;
            skeleton?: { bones: unknown[] };
            activeClips?: string[];
          }
        | undefined;
      return {
        revision: CREW_STUDY.revision,
        sourceCommit: CREW_STUDY.sourceCommit,
        case: caseName,
        body,
        mode,
        scale: c?.modelScale,
        bones: c?.skeleton?.bones.length,
        waiting: sceneRef?.getWaitingItemsCount(),
        ready: sceneRef?.isReady(),
        clips: c?.activeClips,
        meshes: c?.root
          ?.getChildMeshes()
          .filter((mesh) => mesh.getTotalVertices() && mesh.isEnabled())
          .map((mesh) => ({
            name: mesh.name,
            indices: mesh.getTotalIndices(),
            material: mesh.material?.name,
            determinant: mesh.computeWorldMatrix(true).determinant(),
          })),
      };
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
     * Review view around the fixed full-body centre; null restores the game camera.
     * Source glTF front is -Z: relative azimuth -PI/2 is front, 0 is right.
     */
    reviewCamera(
      view: {
        azimuth: number;
        beta: number;
        radius: number;
        lift?: number;
        isolate?: boolean;
      } | null,
    ) {
      if (!sceneRef) return;
      if (!view) {
        isolate(null);
        reviewView = undefined;
        return;
      }
      if (!reviewCam) {
        // Reuse the game camera: its prepass/antialiasing pipeline owns the PBR
        // render targets. A second unattached camera can silently omit crew meshes.
        reviewCam = sceneRef.activeCamera as ArcRotateCamera;
        sceneRef.onBeforeRenderObservable.add(() => {
          if (!reviewView) return;
          for (const mesh of hidden.keys()) mesh.setEnabled(false);
          const t = reviewTarget();
          reviewCam!.alpha = reviewView.alpha;
          reviewCam!.beta = reviewView.beta;
          reviewCam!.radius = reviewView.radius;
          reviewCam!.minZ = 0.05;
          reviewCam!.target.set(t.x, t.y + reviewView.lift, t.z);
        });
      }
      const c = crew() as { root?: TransformNode } | undefined;
      // isolate: hide the deck (walls occlude close rig views); the game-camera views keep it
      isolate(
        view.isolate ? new Set(c?.root?.getChildMeshes(false) ?? []) : null,
      );
      const facing = c?.root?.rotation.y ?? 0;
      reviewView = {
        alpha: -facing + view.azimuth,
        beta: view.beta,
        radius: view.radius,
        lift: view.lift ?? 0,
      };
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
        g.goToFrame(
          Math.min(
            g.to,
            g.from +
              (frame *
                (g.targetedAnimations[0]?.animation.framePerSecond ?? 60)) /
                24,
          ),
        );
      }
    },
    /**
     * Hold one clip at a 24 fps frame (body or loaded armed clip, e.g. "death", "rifle.aim"):
     * every other animation group stops and the gameplay state stops driving the crew until
     * unpose(). Returns false when the clip is not loaded.
     */
    pose(clip: string, frame: number) {
      if (!sceneRef) return false;
      crew()?.prepareClip?.(clip);
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
      for (const other of sceneRef.animationGroups)
        if (other.name !== "deploy_sight") other.stop();
      const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
      const at = Math.min(g.to, g.from + (frame * fps) / 24);
      g.start(false, 1e-6, at, g.to);
      g.setWeightForAllAnimatables(1);
      g.goToFrame(at);
      g.pause();
      return true;
    },
    unpose() {
      restorePose();
      applyMode();
    },
    /** Names and lengths (frames) of the crew clips currently started. */
    startedClips() {
      return (sceneRef?.animationGroups ?? [])
        .filter((g) => g.isStarted)
        .map((g) => ({
          name: g.name,
          from: g.from,
          to: g.to,
          weight: g.animatables[0]?.weight,
        }));
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
    directHeld?.dispose();
    contactShip?.dispose();
    world?.dispose();
  });
