/** Display-only, precomputed cuts of verified sampled structure. No simulation writes. */
import {
  deriveInterior,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type { DressedShip } from "@sidereal/sim/ship-dresser";
import {
  visualCellKey,
  type VisualVolume,
} from "@sidereal/sim/ship-visual-compiler";
const VISUAL_NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/** Three floor courses and eight existing wall courses. The new top is a real closed surface. */
export const DECK_CUT_TOP_TEXELS = 11;
export const DECK_CUT_HEIGHT_M = 0.5;
type P2 = readonly [number, number];
export type DeckCutSector = 0 | 1 | 2 | 3;
export interface DeckCutState {
  sector: DeckCutSector;
  geometrySector: DeckCutSector;
  cells: VisualVolume;
  doors: ReadonlySet<string>;
  removedCells: number;
}
export interface DeckCutCache {
  bounds: readonly [number, number, number, number];
  states: readonly DeckCutState[];
}
export interface DeckCutRuntime {
  bounds: DeckCutCache["bounds"];
  states: readonly Omit<DeckCutState, "cells">[];
}
interface Run {
  a: P2;
  b: P2;
  door?: string;
  protected?: boolean;
}
const axisAligned = ({ a, b }: Run) =>
  (a[0] === b[0] || a[1] === b[1]) && Math.hypot(b[0] - a[0], b[1] - a[1]) > 0;
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];

/** Strictly between camera and subject; parallel rays and the subject's own wall do not count. */
export function deckRunOccludes(camera: P2, subject: P2, run: Run): boolean {
  const ray: P2 = [subject[0] - camera[0], subject[1] - camera[1]];
  const edge: P2 = [run.b[0] - run.a[0], run.b[1] - run.a[1]];
  const delta: P2 = [run.a[0] - camera[0], run.a[1] - camera[1]];
  const determinant = cross(ray, edge);
  if (Math.abs(determinant) < 1e-9) return false;
  const t = cross(delta, edge) / determinant;
  const u = cross(delta, ray) / determinant;
  return t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6;
}
function distanceToRun(x: number, y: number, run: Run): number {
  const dx = run.b[0] - run.a[0],
    dy = run.b[1] - run.a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - run.a[0]) * dx + (y - run.a[1]) * dy) / (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(x - run.a[0] - t * dx, y - run.a[1] - t * dy);
}

/** Admission follows the caller's exact verified document/profile pins. Damage review is excluded. */
export function buildDeckCutCache(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  dressed: DressedShip,
  original: VisualVolume,
  revision: string,
  profile: string,
): DeckCutCache | null {
  if (
    revision !== "r002" ||
    profile !== "federation" ||
    !["fed.s.wren", "fed.m.crest"].includes(doc.id)
  )
    return null;
  const interior = deriveInterior(doc, 0, catalog);
  if (!interior.floors.length) return null;
  const bounds: [number, number, number, number] = [
    Math.min(...interior.floors.map((f) => f.cell[0])),
    Math.min(...interior.floors.map((f) => f.cell[1])),
    Math.max(...interior.floors.map((f) => f.cell[0] + 1)),
    Math.max(...interior.floors.map((f) => f.cell[1] + 1)),
  ];
  const center: P2 = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const span = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  const runs: Run[] = [...interior.exteriorWalls, ...interior.partitions].map(
    (w) => ({
      a: w.a,
      b: w.b,
      protected:
        w.variant === "glazed" ||
        w.type === "window" ||
        w.type === "canopy" ||
        w.type === "wall.glazed",
    }),
  );
  runs.push(
    ...interior.doors.map((d) => ({
      a: d.a,
      b: d.b,
      door: d.id,
      protected: d.exterior,
    })),
  );
  const protectedRuns = runs.filter((r) => r.protected);
  const opaqueRuns = runs.filter((r) => !r.protected && axisAligned(r));
  const roomFloors = new Map<string, P2[]>();
  for (const f of interior.floors) {
    const list = roomFloors.get(f.room) ?? [];
    list.push([f.cell[0] + 0.5, f.cell[1] + 0.5]);
    roomFloors.set(f.room, list);
  }
  const subjects: P2[] = [...roomFloors.values()].map((points) => [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ]);
  subjects.push(
    ...interior.sockets.map(
      (s) => [s.at[0] + s.size[0] / 2, s.at[1] + s.size[1] / 2] as P2,
    ),
  );
  subjects.push(
    ...dressed.components
      .filter(
        (c) => c.placement.mount.attach === "interior" && c.view !== "flight",
      )
      .map(
        (c) =>
          [
            (c.placement.rect[0] + c.placement.rect[2]) / 2,
            (c.placement.rect[1] + c.placement.rect[3]) / 2,
          ] as P2,
      ),
  );
  // Preserve glass and its finite original mating courses, independent of ray selection.
  const opticalColumns = new Set<string>();
  for (const c of original.values())
    if (c.slot === "glass")
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++)
          opticalColumns.add(`${c.x + x},${c.y + y}`);
  const states: DeckCutState[] = [];
  const signatures = new Map<string, DeckCutState>();
  for (const sector of [0, 1, 2, 3] as const) {
    const camera: P2 = [
      center[0] + (sector & 1 ? 1 : -1) * span * 3,
      center[1] + (sector & 2 ? 1 : -1) * span * 3,
    ];
    const selected = opaqueRuns.filter((r) =>
      subjects.some((p) => deckRunOccludes(camera, p, r)),
    );
    const columns = new Set<string>();
    // Actual source wall is four texels thick; one further course covers its bounded casing returns.
    for (const r of selected) {
      const x0 = Math.floor(Math.min(r.a[0], r.b[0]) * 16) - 5;
      const y0 = Math.floor(Math.min(r.a[1], r.b[1]) * 16) - 5;
      const x1 = Math.ceil(Math.max(r.a[0], r.b[0]) * 16) + 5;
      const y1 = Math.ceil(Math.max(r.a[1], r.b[1]) * 16) + 5;
      for (let x = x0; x < x1; x++)
        for (let y = y0; y < y1; y++) {
          if (opticalColumns.has(`${x},${y}`)) continue;
          const px = (x + 0.5) / 16,
            py = (y + 0.5) / 16;
          if (
            distanceToRun(px, py, r) > 0.3125 ||
            protectedRuns.some((p) => distanceToRun(px, py, p) <= 0.3125)
          )
            continue;
          columns.add(`${x},${y}`);
        }
    }
    const cells: VisualVolume = new Map();
    const removed = new Set<string>();
    for (const [key, c] of original) {
      const structure =
        c.family === "volume:hull" ||
        c.family.startsWith("edge:") ||
        c.family.startsWith("post:");
      if (
        structure &&
        c.role !== "floor" &&
        c.z >= DECK_CUT_TOP_TEXELS &&
        c.slot !== "glass" &&
        columns.has(`${c.x},${c.y}`)
      )
        removed.add(key);
      else cells.set(key, c);
    }
    // Fresh cap/end faces must have geometric normals, never intact manufactured normal charts.
    for (const [key, c] of cells)
      if (
        VISUAL_NEIGHBOURS.some(([x, y, z]) =>
          removed.has(visualCellKey(c.x + x, c.y + y, c.z + z)),
        )
      ) {
        const copy = { ...c };
        delete copy.normalHint;
        delete copy.normalChart;
        delete copy.normalFaces;
        delete copy.normalSide;
        delete copy.normalSideFaces;
        cells.set(key, copy);
      }
    const doors = new Set(selected.flatMap((r) => (r.door ? [r.door] : [])));
    const signature =
      [...removed].join(";") + "|" + [...doors].sort().join(";");
    const existing = signatures.get(signature);
    const state = {
      sector,
      geometrySector: existing?.geometrySector ?? sector,
      cells: existing?.cells ?? cells,
      doors,
      removedCells: removed.size,
    };
    states.push(state);
    if (!existing) signatures.set(signature, state);
  }
  return { bounds, states };
}

/** Raw prefab metres, after inverse of the current render frame (including camera-origin rebase). */
export function selectDeckCutSector(
  cache: Pick<DeckCutCache, "bounds">,
  camera: readonly [number, number, number],
  previous: DeckCutSector | null = null,
): DeckCutSector | null {
  if (!camera.every(Number.isFinite)) return null;
  const [x0, y0, x1, y1] = cache.bounds;
  const x = camera[0] - (x0 + x1) / 2,
    y = camera[1] - (y0 + y1) / 2;
  const range = Math.hypot(x, y),
    span = Math.max(x1 - x0, y1 - y0);
  const elevation = Math.atan2(camera[2] - 0.1875, range);
  if (
    (camera[0] >= x0 - 0.5 &&
      camera[0] <= x1 + 0.5 &&
      camera[1] >= y0 - 0.5 &&
      camera[1] <= y1 + 0.5) ||
    range < span * 0.8 ||
    range > span * 8 ||
    camera[2] < 2.1875 ||
    elevation < 0.35 ||
    elevation > 1.05
  )
    return null;
  // A finite dead band avoids rapid quadrant changes. Starting on an axis uses the complete ship.
  if (Math.min(Math.abs(x), Math.abs(y)) / range < 0.08) return previous;
  return ((x > 0 ? 1 : 0) | (y > 0 ? 2 : 0)) as DeckCutSector;
}
