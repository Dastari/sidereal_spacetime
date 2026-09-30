/**
 * Door leaves for prefab ships (owner live feedback 2026-09-29: "There is no door/airlock that I can
 * see, just looks like the ship is open to space."). Presentation only: walking, pressure and the
 * airlock cycle stay authoritative on the server; leaves never block or grant anything.
 *
 * - Exterior airlocks: a closed recessed double door in BOTH views (the component GLB's baked leaves
 *   are stripped at load by `withoutAirlockLeaves`, so the same leaves can animate). The outer door
 *   opens only during the own EVA airlock cycle (`own_eva_airlock_cycle`: "out" opens it near the end
 *   of the cycle, "in" at the start) or while another spacewalker cycles in at it
 *   (`visible_eva_bodies.cycling`, matched to the nearest hatch).
 * - Other exterior doors (cargo doors): closed leaves in the deck view (the flight view keeps the
 *   component's own closed door), so the pressure hull reads sealed.
 * - Interior doors: sliding leaves in the deck view that open as any character approaches.
 *
 * All leaves of a ship are thin instances of one box per material slot (a handful of draws).
 * Frame: the view `root` (ship-local game frame: Babylon X = game x, Y up, Z = -game y).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Constants } from "@babylonjs/core/Engines/constants";
import type {
  ShipPrefabDocumentV1,
  ShipThemeId,
} from "@sidereal/content/ship-prefab";
import { deriveInterior, prefabOrigin } from "@sidereal/content/ship-prefab";
import {
  NORMAL_VECTOR,
  type FaceNormal,
} from "@sidereal/content/construction-grammar";
import type { PrefabComponentCatalog } from "@sidereal/content/ship-prefab";
import { prefabEvaModel } from "@sidereal/sim/eva";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import { slotMaterial, slotOfMaterialName } from "./materials";
import { setMeshRole } from "../mesh-roles";
import type { GlbGeometry } from "./glb-library";
import { referenceSurfaceMaterial } from "./reference-finish";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

type P2 = [number, number];

export interface PrefabDoorSpec {
  id: string;
  /** Door kind from the edge type (`door.<kind>`). */
  kind: string;
  exterior: boolean;
  /** Exterior airlock whose outer door follows the EVA cycle. */
  airlock: boolean;
  /** Centre of the opening at deck level (ship-local game frame, m). */
  center: P2;
  /** Unit vector along the door span. */
  along: P2;
  /** Unit outward normal (exterior doors); a span perpendicular for interior doors. */
  normal: P2;
  /** Span length (m). */
  span: number;
}

/** Deck floor top above the ship datum (m): 3 texels, the walking elevation. */
export const DOOR_FLOOR_M = 0.1875;
/** Deck-view (cut-away) leaf top above the floor: below the cut jambs' dark header (26 texels). */
export const DOOR_DECK_HEIGHT_M = 1.5625;
/** Flight-view airlock leaf height: the component's opening less a texel top and bottom. */
export const AIRLOCK_FLIGHT_HEIGHT_M = 2.125;
/** Exterior airlock leaves: two 0.6 m leaves in the component's 1.25 m opening. */
export const AIRLOCK_LEAF_M = 0.6;
/** Outward offset of the airlock leaves from the hull edge line (the GLB's recessed leaf plane). */
export const AIRLOCK_LEAF_OFFSET_M = 0.09;
/** Interior door module: 2 m edge with 0.375 m jambs, so a 1.25 m opening (ship_kit idoor). */
const INTERIOR_JAMB_M = 0.375;
const LEAF_T = 0.07;
/** Interior doors open when a character is this close to the door centre (plan distance). */
export const DOOR_APPROACH_M = 1.7;
/** A spacewalker cycling in within this distance of a hatch opens that hatch. */
const REMOTE_CYCLE_RADIUS_M = 3;
/** Seconds for a leaf to travel fully open or closed. */
export const DOOR_TRAVEL_S = 0.7;

const round = (v: number) => Math.round(v * 1e6) / 1e6 || 0;

/** Every door of a prefab deck as leaf specs (deterministic; grammar data only). */
export function prefabDoorSpecs(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabDoorSpec[] {
  const [ox, oy] = prefabOrigin(doc);
  const toShip = (p: readonly number[]): P2 => [
    round(-(p[1] - oy)),
    round(p[0] - ox),
  ];
  const toShipDir = (v: readonly number[]): P2 => [round(-v[1]), round(v[0])];
  const airlocks = new Map(
    prefabEvaModel(doc, catalog).airlocks.map((a) => [a.id, a]),
  );
  const out: PrefabDoorSpec[] = [];
  for (const door of deriveInterior(doc, 0, catalog).doors) {
    const kind = door.type.replace(/^door\./, "");
    if (kind === "forcefield") continue;
    const a = toShip(door.a);
    const b = toShip(door.b);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span < 0.5) continue;
    const along: P2 = [
      round((b[0] - a[0]) / span),
      round((b[1] - a[1]) / span),
    ];
    const airlock = door.exterior ? airlocks.get(door.id) : undefined;
    let normal: P2 = [round(-along[1]), round(along[0])];
    if (airlock) normal = [...airlock.normal];
    else if (door.exterior) {
      const mount = doc.mounts.find((m) => m.id === door.id);
      if (mount?.normal)
        normal = toShipDir(NORMAL_VECTOR[mount.normal as FaceNormal]);
    }
    out.push({
      id: door.id,
      kind,
      exterior: door.exterior,
      airlock: !!airlock,
      center: [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)],
      along,
      normal,
      span,
    });
  }
  return out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export interface AirlockCycleState {
  airlockId: string;
  direction: string;
  startedMicros: bigint | number;
  endsMicros: bigint | number;
}

/**
 * Outer-door target (0 closed .. 1 open) of the own airlock cycle at `nowMicros`: cycling OUT the
 * chamber depressurises first and the outer door opens for the last 40 % of the cycle and a moment
 * after; cycling IN it is open for the first 40 % (the spacewalker steps in), then seals.
 */
export function airlockOuterTarget(
  cycle: AirlockCycleState | null | undefined,
  nowMicros: number,
): number {
  if (!cycle) return 0;
  const start = Number(cycle.startedMicros);
  const end = Number(cycle.endsMicros);
  const length = Math.max(1, end - start);
  const t = (nowMicros - start) / length;
  if (cycle.direction === "in") return t >= -0.05 && t < 0.4 ? 1 : 0;
  return t >= 0.6 && nowMicros < end + 1.2e6 ? 1 : 0;
}

/** Ease `open` toward `target` at DOOR_TRAVEL_S per full stroke. */
export function stepDoor(open: number, target: number, dt: number) {
  const step = Math.max(0, dt) / DOOR_TRAVEL_S;
  return target > open
    ? Math.min(target, open + step)
    : Math.max(target, open - step);
}

/** Leaf-plane box of the exterior airlock component GLB (glTF frame, r004 `airlock_ext`). */
const AIRLOCK_LEAF_BOX = {
  x: 0.64,
  yMin: -1.11,
  yMax: 1.05,
  zMin: 0.05,
  zMax: 0.2,
};

/**
 * The exterior airlock GLB with its baked closed leaves (and their windows and kick rails) removed,
 * so the animated leaves of this module replace them. Other primitives (frame, recess, lights) and
 * other components are returned unchanged.
 */
export function withoutAirlockLeaves(geom: GlbGeometry): GlbGeometry {
  if (!/airlock\.exterior/.test(geom.url)) return geom;
  const box = AIRLOCK_LEAF_BOX;
  const primitives = geom.primitives.map((p) => {
    if (!/secondary|glass|metal/.test(p.material)) return p;
    const keep: number[] = [];
    for (let t = 0; t < p.indices.length; t += 3) {
      let x = 0,
        y = 0,
        z = 0;
      for (let k = 0; k < 3; k++) {
        const i = p.indices[t + k] * 3;
        x += p.positions[i] / 3;
        y += p.positions[i + 1] / 3;
        z += p.positions[i + 2] / 3;
      }
      const leaf =
        Math.abs(x) < box.x &&
        y > box.yMin &&
        y < box.yMax &&
        z > box.zMin &&
        z < box.zMax;
      if (!leaf) keep.push(p.indices[t], p.indices[t + 1], p.indices[t + 2]);
    }
    if (keep.length === p.indices.length) return p;
    return {
      ...p,
      indices: Uint32Array.from(keep),
      triangles: keep.length / 3,
    };
  });
  return {
    ...geom,
    primitives,
    triangles: primitives.reduce((n, p) => n + p.triangles, 0),
  };
}

export interface DoorUpdate {
  nowMs: number;
  dt: number;
  /** Own EVA airlock cycle, if any. */
  cycle?: AirlockCycleState | null;
  /** Characters on this deck (own and others), ship-local game frame. */
  actors: readonly { x: number; y: number }[];
  /** Other spacewalkers currently cycling (own-ship frame). */
  cyclingBodies?: readonly { x: number; y: number }[];
  /**
   * Doors actuated by ship logic (door id -> open), from `visible_ship_logic`: authoritative, so
   * they override every presentation rule above (wiki `Systems/Ship Logic`).
   */
  logic?: ReadonlyMap<string, boolean>;
}

type View = "deck" | "flight";
interface Part {
  slot: ShipKitSlot;
  /** Leaf-local box: centre (u along the leaf from its hinge-side centre, v up) and size. */
  u: number;
  v: number;
  w: number;
  h: number;
  t: number;
}

function leafParts(
  spec: PrefabDoorSpec,
  height: number,
  referenceStyle = false,
): Part[] {
  if (referenceStyle) {
    const w = spec.airlock
      ? AIRLOCK_LEAF_M
      : Math.max(0.3, (spec.span - 2 * INTERIOR_JAMB_M) / 2);
    return [
      { slot: "dark", u: 0, v: height / 2, w, h: height, t: LEAF_T },
      {
        slot: "primary",
        u: 0,
        v: height * 0.54,
        w: w * 0.82,
        h: height * 0.72,
        t: LEAF_T + 0.012,
      },
      {
        slot: "trim",
        u: 0,
        v: height * 0.08,
        w: w * 0.94,
        h: height * 0.09,
        t: LEAF_T + 0.018,
      },
      {
        slot: "metal",
        u: w * 0.3,
        v: height * 0.48,
        w: 0.04,
        h: 0.22,
        t: LEAF_T + 0.02,
      },
      {
        slot: "emit_b",
        u: -w * 0.22,
        v: height * 0.77,
        w: 0.055,
        h: 0.035,
        t: LEAF_T + 0.021,
      },
    ];
  }
  if (spec.airlock)
    return [
      {
        slot: "secondary",
        u: 0,
        v: height / 2,
        w: AIRLOCK_LEAF_M,
        h: height,
        t: LEAF_T,
      },
      {
        slot: "glass",
        u: 0,
        v: height * 0.72,
        w: AIRLOCK_LEAF_M * 0.55,
        h: height * 0.16,
        t: LEAF_T + 0.02,
      },
      {
        slot: "metal",
        u: 0,
        v: Math.min(0.78, height * 0.4),
        w: AIRLOCK_LEAF_M * 0.8,
        h: 0.06,
        t: LEAF_T + 0.03,
      },
    ];
  const w = Math.max(0.3, (spec.span - 2 * INTERIOR_JAMB_M) / 2);
  const body: ShipKitSlot =
    spec.kind === "blast"
      ? "metal"
      : spec.kind === "airlock"
        ? "secondary"
        : "primary";
  const parts: Part[] = [
    { slot: body, u: 0, v: height / 2, w, h: height, t: LEAF_T },
  ];
  if (spec.kind === "sliding" || spec.kind === "standard")
    parts.push({
      slot: "secondary",
      u: 0,
      v: height * 0.62,
      w: w * 0.55,
      h: height * 0.3,
      t: LEAF_T + 0.02,
    });
  if (spec.kind === "blast" || spec.kind === "airlock")
    parts.push({
      slot: "trim",
      u: 0,
      v: height * 0.5,
      w: w * 0.9,
      h: 0.08,
      t: LEAF_T + 0.02,
    });
  return parts;
}

/** Leaf pair and animation state of one door. */
interface DoorState {
  spec: PrefabDoorSpec;
  open: number;
  target: number;
}

/** Finite authored compatibility contract; checked before creating any runtime resource. */
export function validateReferenceDoorLeaf(geometry: GlbGeometry): void {
  const required: ShipKitSlot[] = [
    "primary",
    "secondary",
    "trim",
    "metal",
    "emit_b",
  ];
  const slots = geometry.primitives.map((p) => slotOfMaterialName(p.material));
  if (
    slots.length !== required.length ||
    new Set(slots).size !== required.length ||
    required.some((s) => !slots.includes(s))
  )
    throw Error("Invalid authored leaf semantic primitives");
  const low = [Infinity, Infinity, Infinity],
    high = [-Infinity, -Infinity, -Infinity];
  for (const p of geometry.primitives) {
    if (
      !p.positions.length ||
      p.positions.length % 3 ||
      p.normals.length !== p.positions.length ||
      !p.uvs ||
      p.uvs.length !== (p.positions.length / 3) * 2 ||
      [...p.positions, ...p.normals, ...Array.from(p.uvs)].some(
        (n) => !Number.isFinite(n),
      ) ||
      !p.indices.length ||
      p.indices.length % 3 ||
      [...p.indices].some((i) => i >= p.positions.length / 3)
    )
      throw Error("Invalid authored leaf geometry");
    for (let i = 0; i < p.positions.length; i++) {
      const axis = i % 3;
      low[axis] = Math.min(low[axis], p.positions[i]);
      high[axis] = Math.max(high[axis], p.positions[i]);
    }
  }
  const bounds = [...low, ...high];
  if (
    geometry.bounds.length !== 6 ||
    Array.from(geometry.bounds).some((v) => !Number.isFinite(v)) ||
    bounds.some((v, i) => Math.abs(v - geometry.bounds[i]) > 0.00002) ||
    [0, 1, 3, 4].some(
      (i) => Math.abs(bounds[i] - (i < 3 ? -0.5 : 0.5)) > 0.00002,
    ) ||
    low[2] < -0.04551 ||
    high[2] > 0.04551 ||
    low[2] > -0.034 ||
    high[2] < 0.034
  )
    throw Error("Authored leaf outside normalized envelope");
}

export function createPrefabDoors(
  scene: Scene,
  parent: TransformNode,
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  theme: ShipThemeId = doc.theme,
  referenceStyle: boolean | string = false,
  authoredLeaf?: GlbGeometry | null,
) {
  if (referenceStyle === "r002") {
    if (!authoredLeaf) throw Error("Authored r002 leaf is required");
    validateReferenceDoorLeaf(authoredLeaf);
  }
  const authored =
    referenceStyle === "r002" && authoredLeaf ? authoredLeaf : null;
  const materialFor = (slot: ShipKitSlot) => {
    const base = slotMaterial(scene, theme, slot);
    return authored
      ? referenceSurfaceMaterial(base as PBRMaterial, {
          revision: "r002",
          profile:
            theme === "riftjack" || theme === "industrial"
              ? "riftjack"
              : theme === "aurelian" || theme === "crystalline"
                ? "aurelian"
                : "federation",
          slot,
          role: "wall",
        })
      : base;
  };
  const doors: DoorState[] = prefabDoorSpecs(doc, catalog).map((spec) => ({
    spec,
    open: 0,
    target: 0,
  }));
  const meshes = new Map<ShipKitSlot, Mesh>();
  const meshFor = (slot: ShipKitSlot) => {
    let m = meshes.get(slot);
    if (!m) {
      const primitive = authored?.primitives.find(
        (p) => slotOfMaterialName(p.material) === slot,
      );
      if (primitive) {
        m = new Mesh(`prefab-doors:${doc.id}:${slot}`, scene);
        const data = new VertexData();
        data.positions = primitive.positions;
        data.normals = primitive.normals;
        data.indices = primitive.indices;
        data.uvs = primitive.uvs ? Float32Array.from(primitive.uvs) : null;
        data.applyToMesh(m);
        m.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
      } else
        m = CreateBox(`prefab-doors:${doc.id}:${slot}`, { size: 1 }, scene);
      m.parent = parent;
      m.material = materialFor(slot);
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true;
      setMeshRole(m, "equipment");
      meshes.set(slot, m);
    }
    return m;
  };
  let view: View = "deck";
  let dirty = true;
  /** Leaf parts drawn in the current view (thin instances). */
  let instances = 0;
  const rebuild = () => {
    const matrices = new Map<ShipKitSlot, number[]>();
    for (const d of doors) {
      const { spec } = d;
      // Airlocks show in both views; other exterior doors and interior doors only in the cut-away.
      if (view === "flight" && !spec.airlock) continue;
      const height =
        view === "flight" && spec.airlock
          ? AIRLOCK_FLIGHT_HEIGHT_M
          : DOOR_DECK_HEIGHT_M;
      const offset = spec.airlock || spec.exterior ? AIRLOCK_LEAF_OFFSET_M : 0;
      const [ax, ay] = spec.along;
      // Babylon basis: X along the span, Y up, Z = X × Y (right-handed, positive determinant).
      const X = [ax, 0, -ay];
      const Z = [ay, 0, ax]; // X × (0, 1, 0)
      const cx = spec.center[0] + spec.normal[0] * offset;
      const cz = -(spec.center[1] + spec.normal[1] * offset);
      for (const side of [-1, 1]) {
        const parts = authored
          ? authored.primitives.map((p): Part => ({
              slot: slotOfMaterialName(p.material)!,
              u: 0,
              v: height / 2,
              w: spec.airlock
                ? AIRLOCK_LEAF_M
                : Math.max(0.3, (spec.span - 2 * INTERIOR_JAMB_M) / 2),
              h: height,
              t: 1,
            }))
          : leafParts(spec, height, !!referenceStyle);
        for (const p of parts) {
          const leafW = spec.airlock
            ? AIRLOCK_LEAF_M
            : Math.max(0.3, (spec.span - 2 * INTERIOR_JAMB_M) / 2);
          // Closed: the leaves meet at the centre; open: each slides its own width into the jamb.
          const u = side * (leafW / 2 + 0.005 + d.open * leafW * 0.95) + p.u;
          const x = cx + X[0] * u;
          const z = cz + X[2] * u;
          const y = DOOR_FLOOR_M + p.v;
          const list = matrices.get(p.slot) ?? [];
          matrices.set(p.slot, list);
          list.push(
            X[0] * p.w,
            X[1] * p.w,
            X[2] * p.w,
            0,
            0,
            p.h,
            0,
            0,
            Z[0] * p.t,
            Z[1] * p.t,
            Z[2] * p.t,
            0,
            x,
            y,
            z,
            1,
          );
        }
      }
    }
    for (const slot of new Set<ShipKitSlot>([
      ...meshes.keys(),
      ...matrices.keys(),
    ])) {
      const list = matrices.get(slot);
      const mesh = meshFor(slot);
      if (!list?.length) {
        mesh.thinInstanceCount = 0;
        mesh.setEnabled(false);
        continue;
      }
      mesh.setEnabled(true);
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(list), 16, false);
    }
    instances = [...matrices.values()].reduce((n, l) => n + l.length / 16, 0);
    dirty = false;
  };
  rebuild();
  return {
    doors: () =>
      doors.map((d) => ({
        id: d.spec.id,
        open: d.open,
        airlock: d.spec.airlock,
      })),
    meshes: () => [...meshes.values()],
    instances: () => instances,
    setView(next: View) {
      if (next === view) return;
      view = next;
      dirty = true;
      rebuild();
    },
    update(input: DoorUpdate) {
      const nowMicros = input.nowMs * 1000;
      for (const d of doors) {
        const { spec } = d;
        let target = 0;
        const actuated = input.logic?.get(spec.id);
        if (actuated !== undefined) target = actuated ? 1 : 0;
        else if (spec.airlock) {
          if (input.cycle?.airlockId === spec.id)
            target = airlockOuterTarget(input.cycle, nowMicros);
          for (const b of input.cyclingBodies ?? [])
            if (
              Math.hypot(b.x - spec.center[0], b.y - spec.center[1]) <
              REMOTE_CYCLE_RADIUS_M
            )
              target = 1;
        } else if (!spec.exterior) {
          for (const a of input.actors)
            if (
              Math.hypot(a.x - spec.center[0], a.y - spec.center[1]) <
              DOOR_APPROACH_M
            )
              target = 1;
        }
        d.target = target;
        const next = stepDoor(d.open, target, input.dt);
        if (next !== d.open) {
          d.open = next;
          dirty = true;
        }
      }
      if (dirty) rebuild();
    },
    dispose() {
      for (const m of meshes.values()) m.dispose();
      meshes.clear();
    },
  };
}
export type PrefabDoors = ReturnType<typeof createPrefabDoors>;
