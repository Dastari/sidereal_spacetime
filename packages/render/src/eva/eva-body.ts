/**
 * EVA body presentation (wiki `Systems/EVA`): prone fallback pose, ZeroG enter/exit transitions and
 * the jetpack exhaust. Presentation only; the pose comes from accepted server rows.
 *
 * - While a prone zero-g clip is missing from the bundle, the model itself is pitched belly-down
 *   (the authored clips bake the prone pose in, so the model stays upright once they land).
 * - Phase changes play `ZeroG_Enter` (upright → prone) or `ZeroG_Exit` (prone → upright) when
 *   the bundle has them; otherwise the pitch blends over `PITCH_BLEND_S`.
 * - The exhaust is two blue additive stepped plumes at `socket.jetpack.exhaust.L/.R` (−Y is the
 *   thrust direction) or, until those sockets exist, behind the model's back; length follows thrust.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import {
  VOXEL_CREW_PRONE_ACTIONS,
  type VoxelCrewAction,
} from "@sidereal/content/crew-voxel-bundle";
import { voxelCrewEvaClip, type VoxelCrewEva } from "../crew/voxel-crew-clips";

/** Model pitch for the prone fallback (radians about the model's X axis): head toward the facing
 * direction, belly down (eva-prone.test.ts checks it on the real crew body). */
export const EVA_PRONE_PITCH = -Math.PI / 2;
/** Upright ↔ prone blend when no transition clip exists (s). */
export const PITCH_BLEND_S = 0.4;
/** Hip height used to keep the prone body centred over the accepted point (m). */
const BODY_CENTRE_M = 0.9;

export interface EvaCrewHandle {
  /** Parent of the body's glTF root (the visual node that may be pitched). */
  model: TransformNode;
  socketNodes: Partial<Record<string, TransformNode>>;
  hasClip(clip: string): boolean;
  play(action: VoxelCrewAction): void;
}

/** Pure: whether the model must be pitched prone for this state (clip missing and prone). */
export function evaNeedsPronePitch(
  eva: VoxelCrewEva | undefined,
  hasClip: (clip: string) => boolean,
) {
  if (!eva || eva.phase !== "free" || eva.cycling) return false;
  const clip = voxelCrewEvaClip(eva);
  return VOXEL_CREW_PRONE_ACTIONS.has(clip) && !hasClip(clip);
}

/** Pure: jetpack plume strength 0..1 from the applied input (free flight only). */
export function evaThrustLevel(eva: VoxelCrewEva | undefined) {
  if (!eva || eva.phase !== "free" || eva.cycling) return 0;
  return Math.min(
    1,
    Math.max(
      Math.abs(eva.forward),
      Math.abs(eva.strafe),
      Math.abs(eva.turn) * 0.4,
    ),
  );
}

/** Pure: the transition one-shot for a phase change, if any. */
export function evaTransition(
  previous: VoxelCrewEva["phase"] | undefined,
  next: VoxelCrewEva["phase"] | undefined,
): VoxelCrewAction | undefined {
  if (previous === next) return;
  if (next === "free") return "ZeroG_Enter";
  if (previous === "free") return "ZeroG_Exit";
  return;
}

const plumeMaterials = new WeakMap<Scene, StandardMaterial>();
function exhaustMaterial(scene: Scene) {
  const cached = plumeMaterials.get(scene);
  if (cached) return cached;
  const m = new StandardMaterial("eva-jetpack-exhaust", scene);
  m.onDisposeObservable.addOnce(() => plumeMaterials.delete(scene));
  m.disableLighting = true;
  m.emissiveColor = new Color3(0.32, 0.72, 1);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.alpha = 0.85;
  m.alphaMode = Constants.ALPHA_ADD;
  m.disableDepthWrite = true;
  plumeMaterials.set(scene, m);
  return m;
}

export function createEvaBodyPresentation(
  scene: Scene,
  crew: EvaCrewHandle,
  options: { onMeshes?: (meshes: Mesh[]) => void } = {},
) {
  const exhaust: { root: TransformNode; steps: Mesh[] }[] = [];
  const socket = (side: "L" | "R") =>
    crew.socketNodes[`socket.jetpack.exhaust.${side}`];
  for (const side of ["L", "R"] as const) {
    const root = new TransformNode(`eva-exhaust-${side}`, scene);
    const authored = socket(side);
    if (authored) root.parent = authored;
    else {
      // Fallback: behind the back at shoulder-blade height, thrust toward the feet (−Y).
      root.parent = crew.model;
      root.position.set(side === "L" ? -0.1 : 0.1, 1.12, 0.2);
    }
    // Stepped voxel plume: three boxes narrowing along −Y.
    const steps = [0.1, 0.075, 0.05].map((w, i) => {
      const box = CreateBox(`eva-exhaust-${side}-${i}`, { size: 1 }, scene);
      box.material = exhaustMaterial(scene);
      box.parent = root;
      box.isPickable = false;
      box.scaling.set(w, 0.12, w);
      box.metadata = { evaExhaust: true, step: i };
      return box;
    });
    exhaust.push({ root, steps });
  }
  options.onMeshes?.(exhaust.flatMap((e) => e.steps));
  let pitch = 0;
  let phase: VoxelCrewEva["phase"] | undefined;
  let time = 0;
  return {
    /** Per frame. `eva` undefined = aboard (upright, no plume). */
    update(
      eva: VoxelCrewEva | undefined,
      dt: number,
      options: { reducedMotion?: boolean; dead?: boolean } = {},
    ) {
      time += dt;
      const next = eva?.phase;
      const transition = evaTransition(phase, next);
      if (
        transition &&
        phase !== undefined &&
        crew.hasClip(transition) &&
        !options.dead
      )
        crew.play(transition);
      phase = next;
      const target =
        !options.dead && evaNeedsPronePitch(eva, (c) => crew.hasClip(c))
          ? 1
          : 0;
      const step = options.reducedMotion ? 1 : dt / PITCH_BLEND_S;
      pitch += Math.max(-step, Math.min(step, target - pitch));
      crew.model.rotation.x = EVA_PRONE_PITCH * pitch;
      // Keep the body centred over the accepted point while pitched (the pivot is the feet).
      const bob =
        eva?.phase === "free" && !options.reducedMotion
          ? Math.sin(time * 1.7) * 0.04
          : 0;
      crew.model.position.y = BODY_CENTRE_M * pitch * 0.35 + bob;
      crew.model.position.z =
        -Math.sign(EVA_PRONE_PITCH) * BODY_CENTRE_M * pitch;
      const thrust = options.dead ? 0 : evaThrustLevel(eva);
      for (const { root, steps } of exhaust) {
        root.setEnabled(thrust > 0.02);
        if (thrust <= 0.02) continue;
        const flicker = options.reducedMotion
          ? 1
          : 0.85 + 0.15 * Math.sin(time * 41 + steps.length);
        let y = 0;
        steps.forEach((box, i) => {
          const length = (0.08 + 0.32 * thrust) * (1 + i * 0.35) * flicker;
          box.scaling.y = length;
          box.position.y = -(y + length / 2);
          y += length;
        });
      }
    },
    get pitch() {
      return pitch;
    },
    meshes(): Mesh[] {
      return exhaust.flatMap((e) => e.steps);
    },
    dispose() {
      for (const e of exhaust) e.root.dispose();
      crew.model.rotation.x = 0;
      crew.model.position.y = 0;
      crew.model.position.z = 0;
    },
  };
}
