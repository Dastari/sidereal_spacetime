import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  crewItem,
  type CrewItemDefinition,
} from "@sidereal/content/crew-items";
import type { VoxelFxPlayer, FxRay } from "./equipment/voxel-item-fx";
import { createVoxelItemVisual } from "./equipment/voxel-items";
import type { VoxelHeldItem } from "./crew/voxel-held-item";

/**
 * One body's latest accepted combat action (the `visible_combat_actions` row), with the weapon's
 * r001 item resolved from its inventory definition by the client.
 */
export interface CombatActionState {
  characterId: string;
  crewItemId: string | null;
  /** beam | pellets | melee | thrown */
  mode: string;
  shotSequence: bigint;
  /** Ship-local ray end points `[x, y, struck]`. */
  points: readonly (readonly [number, number, number])[];
  originX: number;
  originY: number;
  landX: number;
  landY: number;
  detonated: boolean;
  blastRadiusM: number;
  reloadSequence: bigint;
  stunSequence: bigint;
}

interface Body {
  /** Ship-frame root of the body (x, elevation, -y). */
  root: TransformNode;
  held?: VoxelHeldItem;
  play?: (clip: string) => void;
}
interface Seen {
  shot: bigint;
  reload: bigint;
  stun: bigint;
  detonated: boolean;
  thrown?: { dispose(): void };
}

/** Beam height above the standing support (the server shot is planar; see remote-crew). */
const BEAM_HEIGHT_M = 1.3;
const THROW_SPEED_MPS = 11;

/**
 * Turns accepted combat actions into r001 presentation: the shooter's item part clip (slide, pump,
 * barrel spin), muzzle flash, tracer / beam / stun arc to every server ray end, impact sparks,
 * reloads, a thrown charge's arc and its blast at the server's detonation, and stun crackle. The
 * first row seen per body is a baseline; nothing here reads or writes authority.
 */
export function createCombatFx(
  scene: Scene,
  shipRoot: TransformNode,
  fx: VoxelFxPlayer,
  bodyOf: (characterId: string) => Body | undefined,
) {
  const seen = new Map<string, Seen>();
  let disposed = false;
  const toShip = (world: Vector3) =>
    Vector3.TransformCoordinates(
      world,
      Matrix.Invert(shipRoot.computeWorldMatrix(true)),
    );
  const itemOf = (id: string | null): CrewItemDefinition | undefined => {
    try {
      return id ? crewItem(id) : undefined;
    } catch {
      return undefined;
    }
  };
  const muzzleOf = (body: Body | undefined, action: CombatActionState) => {
    const world = body?.held?.muzzle();
    if (world)
      return {
        position: toShip(world.position),
        direction: Vector3.TransformNormal(
          world.direction,
          Matrix.Invert(shipRoot.computeWorldMatrix(true)),
        ).normalize(),
      };
    const y = (body?.root.position.y ?? 0) + BEAM_HEIGHT_M;
    const first = action.points[0];
    const position = new Vector3(action.originX, y, -action.originY);
    const direction = first
      ? new Vector3(first[0], y, -first[1]).subtract(position).normalize()
      : new Vector3(0, 0, -1);
    return { position, direction };
  };

  const shot = (action: CombatActionState, entry: Seen) => {
    const item = itemOf(action.crewItemId);
    const body = bodyOf(action.characterId);
    if (!item) return;
    body?.held?.playItem("fire");
    const muzzle = muzzleOf(body, action);
    const at = (p: readonly [number, number, number]) =>
      new Vector3(p[0], muzzle.position.y, -p[1]);
    if (action.mode === "thrown") {
      body?.play?.("throw");
      entry.thrown?.dispose();
      const to = new Vector3(
        action.landX,
        (body?.root.position.y ?? 0) + 0.1,
        -action.landY,
      );
      const from = muzzle.position.clone();
      const flightS = Math.max(
        0.25,
        Math.min(1.1, Vector3.Distance(from, to) / THROW_SPEED_MPS),
      );
      let node: TransformNode | undefined;
      let cancelled = false;
      const start = performance.now();
      const arc = Math.min(1.2, 0.3 + Vector3.Distance(from, to) * 0.1);
      const step = scene.onBeforeRenderObservable.add(() => {
        if (!node) return;
        const u = Math.min(1, (performance.now() - start) / 1000 / flightS);
        Vector3.LerpToRef(from, to, u, node.position);
        node.position.y += 4 * arc * u * (1 - u);
        if (u < 1) node.rotation.x += 0.3;
      });
      const holder = new TransformNode("combat-fx-thrown", scene);
      holder.parent = shipRoot;
      entry.thrown = {
        dispose() {
          cancelled = true;
          scene.onBeforeRenderObservable.remove(step);
          holder.dispose();
        },
      };
      void createVoxelItemVisual(scene, holder, item.id)
        .then((visual) => {
          if (cancelled) return visual.dispose();
          node = visual.root;
          node.position.copyFrom(from);
        })
        .catch(() => undefined);
      return;
    }
    const rays: FxRay[] = action.points.map((p) => ({
      end: at(p),
      struck: p[2] === 1,
    }));
    if (action.mode === "melee") {
      if (rays[0]?.struck) fx.melee(item, muzzle.position, rays[0].end);
      return;
    }
    fx.shot(item, muzzle, rays);
  };

  return {
    sync(actions: readonly CombatActionState[]) {
      if (disposed) return;
      for (const action of actions) {
        const entry = seen.get(action.characterId);
        if (!entry) {
          seen.set(action.characterId, {
            shot: action.shotSequence,
            reload: action.reloadSequence,
            stun: action.stunSequence,
            detonated: action.detonated,
          });
          continue;
        }
        if (action.shotSequence !== entry.shot) {
          entry.shot = action.shotSequence;
          entry.detonated = action.detonated;
          if (action.shotSequence > 0n) shot(action, entry);
        }
        if (action.reloadSequence !== entry.reload) {
          entry.reload = action.reloadSequence;
          bodyOf(action.characterId)?.held?.reload();
        }
        if (action.stunSequence !== entry.stun) {
          entry.stun = action.stunSequence;
          const root = bodyOf(action.characterId)?.root;
          if (root) fx.stun(root.position);
        }
        if (action.mode === "thrown" && action.detonated && !entry.detonated) {
          entry.detonated = true;
          entry.thrown?.dispose();
          entry.thrown = undefined;
          const item = itemOf(action.crewItemId);
          const y = bodyOf(action.characterId)?.root.position.y ?? 0;
          if (item)
            fx.blast(
              item,
              new Vector3(action.landX, y + 0.2, -action.landY),
              action.blastRadiusM,
            );
        }
      }
    },
    dispose() {
      disposed = true;
      for (const entry of seen.values()) entry.thrown?.dispose();
      seen.clear();
    },
  };
}
