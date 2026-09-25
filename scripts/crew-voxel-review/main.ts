/**
 * Local review harness for the proposal voxel crew (CHAR-BODY r001) inside the ACTUAL game renderer
 * (createWorld, stock ship, deck view). Presentation only: static SceneState, no database, no
 * authority writes. Serve through the client Vite dev server:
 *   /@fs/<repo>/scripts/crew-voxel-review/index.html
 */
import { createWorld, type SceneState } from "../../packages/render/src/index";
import {
  VOXEL_CREW_ACTIONS,
  VOXEL_CREW_EXTRA_ACTIONS,
  type VoxelCrewAction,
} from "../../packages/content/src/crew-voxel-bundle";
import type { VoxelCrewMotion } from "../../packages/render/src/crew/voxel-crew-clips";

type Mode =
  | "idle" | "walk" | "run" | "crouch" | "crouch_walk" | "rifle_idle" | "rifle_aim" | "rifle_walk_aim"
  | "pistol_aim" | "carry" | "carry_walk" | "seated" | "climb" | "hover" | "downed" | "dead";
const MODES: Record<Mode, { moving?: boolean; sprint?: boolean; weapon?: "rifle" | "pistol"; combat?: boolean; override?: Partial<VoxelCrewMotion>; seated?: boolean }> = {
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
for (const a of [...VOXEL_CREW_ACTIONS, ...VOXEL_CREW_EXTRA_ACTIONS]) actionSelect.append(new Option(a, a));

const params = new URLSearchParams(location.search);
let mode = (params.get("mode") as Mode) ?? "idle";
let body = params.get("body") ?? "male";
let t = 0;
let shots = 0n;
const origin = { x: Number(params.get("x") ?? 0), y: Number(params.get("y") ?? 0) };
let state: SceneState = {
  heading: 0, x: 0, y: 0, localX: origin.x, localY: origin.y, interior: true, inspect: false, grid: false,
  crewAppearance: { outfit: "engineer", bodyType: body as "male" },
};
let world: Awaited<ReturnType<typeof createWorld>> | undefined;
const controller = new AbortController();
const crew = () => world?.getCrewVisual() as
  | (NonNullable<ReturnType<NonNullable<typeof world>["getCrewVisual"]>> & {
      setMotionOverride?: (m?: Partial<VoxelCrewMotion>) => void;
      play?: (a: VoxelCrewAction) => void;
      layers?: unknown;
      activeClips?: string[];
    })
  | undefined;

const applyMode = () => {
  const m = MODES[mode];
  state = {
    ...state,
    seated: !!m.seated,
    sprinting: !!m.sprint,
    equippedAsset: m.weapon === "rifle" ? "carbine" : m.weapon === "pistol" ? "compact-pistol" : null,
    combat: m.combat ? { active: true, angle: 0, range: 40, shotSequence: shots } : undefined,
    crewAppearance: { outfit: "engineer", bodyType: body as "male", weapon: m.weapon ?? "none" },
  };
  crew()?.setMotionOverride?.(m.override);
  world?.update(state);
};

const tick = () => {
  if (!world) return;
  const m = MODES[mode];
  if (m.moving) {
    const speed = m.sprint ? 4.5 : m.override?.crouching || m.override?.carrying ? 1.2 : 2.5;
    t += (1 / 60) * speed;
    // walk a 3 m back-and-forth line along ship-forward so the camera keeps the actor in view
    const phase = (t / 3) % 2;
    const d = phase < 1 ? phase * 3 : (2 - phase) * 3;
    state = { ...state, localX: origin.x, localY: origin.y + d - 1.5 };
  }
  world.update(state);
  const c = crew();
  (canvas.dataset as DOMStringMap).review = JSON.stringify({
    mode, body, layers: c?.layers, clips: c?.activeClips,
  });
};

createWorld(canvas, (text) => (status.textContent = text), {
  crewBundle: "voxel",
  signal: controller.signal,
  onScene: (scene) => scene.onBeforeRenderObservable.add(tick),
})
  .then((result) => {
    world = result;
    applyMode();
    status.textContent = "voxel crew r001 (proposal) — actual game renderer, no database";
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
document.querySelector("#play")!.addEventListener("click", () => crew()?.play?.(actionSelect.value as VoxelCrewAction));
document.querySelector("#shoot")!.addEventListener("click", () => {
  shots += 1n;
  applyMode();
});
Object.assign(window, {
  crewReview: {
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
    shoot() {
      shots += 1n;
      applyMode();
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
