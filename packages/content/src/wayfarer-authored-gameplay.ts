/** Pinned authored Wayfarer geometry. Source originals remain immutable. */
import source from "./wayfarer-authored-gameplay.v1.json";
import prefabContract from "./wayfarer-prefab.v1.json";
import type { AuthoredStudyInstance } from "./wayfarer-authored-study";
import type { DerivedInterior, ShipPrefabDocumentV1 } from "./ship-prefab";

export const WAYFARER_GAMEPLAY_PROFILE = {
  id: "wayfarer-authored-r001",
  revision: 1,
} as const;
export const WAYFARER_PREFAB_ID = "fed.m.wayfarer";
export const WAYFARER_FLOOR_HEIGHT = 0.1875;
export const WAYFARER_PILOT: [number, number] = [7.75, 0];
export const WAYFARER_OMITTED_OBJECTS = new Set([
  "Hall_crew_chibi",
  "Hall_selection_ring",
]);

/** Approved-source derivative: a .74m bedroom doorway and clear furnished access lanes. */
export function applyWayfarerAuthoredPlacementEdits(
  object: string,
  input: readonly (readonly number[])[],
): number[][] {
  const matrix = input.map((row) => [...row]);
  const delta =
    object === "POST_far_-9.75" ? -0.1 : object === "POST_far_-8.95" ? 0.1 : 0;
  matrix[0][3] += delta;
  // Display props originally blocked the real crew's entry lanes. Move the few affected
  // reusable pieces, applying precisely the same derivative in presentation and authority.
  const shifts: Record<string, [number, number]> = {
    Cargo_blue_case_trolley: [-0.25, 2.05],
    Cargo_crate_white_blue: [0.55, 1.4],
    Cargo_crate_small_white: [0.8, 1.1],
    Workshop_machine_yellow: [0.75, 0.9],
    Workshop_jerry_can: [0.55, 0.2],
    Quarters_A_locker_lit: [0, 0.1],
    Hall_fridge_cabinet: [0.3, 0],
  };
  const shift = shifts[object];
  if (shift) {
    matrix[0][3] += shift[0];
    matrix[1][3] += shift[1];
  }

  if (object === "PART_far_0")
    for (let axis = 0; axis < 3; axis++) matrix[axis][0] *= 0.9;
  if (object === "PART_far_1") {
    matrix[0][3] += 0.1;
    for (let axis = 0; axis < 3; axis++) matrix[axis][0] *= 3.45 / 3.55;
  }
  return matrix;
}

export function wayfarerGameplayPresentationInstances(
  instances: readonly AuthoredStudyInstance[],
): AuthoredStudyInstance[] {
  return instances
    .filter((row) => !WAYFARER_OMITTED_OBJECTS.has(row.object))
    .map((row) => ({
      ...row,
      matrix: applyWayfarerAuthoredPlacementEdits(row.object, row.matrix),
    }));
}

export interface WayfarerGameplayObject {
  object: string;
  piece: string;
  room: string | null;
  role: string;
  min: [number, number, number];
  max: [number, number, number];
  footprint: [number, number][];
}
const round = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
export const WAYFARER_GAMEPLAY_OBJECTS: readonly WayfarerGameplayObject[] =
  source.rows
    .filter(
      (row) =>
        row.role !== "floor" && !WAYFARER_OMITTED_OBJECTS.has(row.object),
    )
    .map((row) => {
      const matrix = applyWayfarerAuthoredPlacementEdits(
        row.object,
        row.matrix,
      );
      if (row.role === "room-content")
        for (let axis = 0; axis < 3; axis++) {
          const scale = Math.hypot(
            ...matrix.slice(0, 3).map((line) => line[axis]),
          );
          for (let i = 0; i < 3; i++) matrix[i][axis] /= scale;
        }
      const transform = (
        x: number,
        y: number,
        z: number,
      ): [number, number, number] =>
        matrix
          .slice(0, 3)
          .map((line, axis) =>
            round(
              line[0] * x +
                line[1] * y +
                line[2] * z +
                line[3] +
                (axis === 2 ? WAYFARER_FLOOR_HEIGHT : 0),
            ),
          ) as [number, number, number];
      const corners = [row.min[0], row.max[0]].flatMap((x) =>
        [row.min[1], row.max[1]].flatMap((y) =>
          [row.min[2], row.max[2]].map((z) => transform(x, y, z)),
        ),
      );
      const footprint = [
        [row.min[0], row.min[1]],
        [row.max[0], row.min[1]],
        [row.max[0], row.max[1]],
        [row.min[0], row.max[1]],
      ].map(([x, y]) => transform(x, y, 0).slice(0, 2) as [number, number]);
      return {
        object: row.object,
        piece: row.piece,
        room: row.room?.toLowerCase() ?? null,
        role: row.role,
        footprint,
        min: [0, 1, 2].map((axis) =>
          Math.min(...corners.map((p) => p[axis])),
        ) as [number, number, number],
        max: [0, 1, 2].map((axis) =>
          Math.max(...corners.map((p) => p[axis])),
        ) as [number, number, number],
      };
    });

export const WAYFARER_STORAGE_OBJECTS = [
  "Cargo_crate_small_white",
  "Cargo_crate_pale_vent",
  "Cargo_crate_yellow",
  "Cargo_crate_white_blue",
  "Quarters_A_locker_lit",
  "Hall_wall_locker_door",
  "Hydroponics_hydro_locker",
  "Workshop_parts_chest",
] as const;
export const wayfarerStorageDesign = (object: string) =>
  object.includes("locker")
    ? "shipyard.equipment.wall-locker"
    : "cargo.standard.medium";
export const WAYFARER_BED_OBJECTS = [
  "Quarters_A_bed_single",
  "Quarters_B_bunk_bed",
] as const;

/** Full nominal source cells have existing native floor interfaces. The .75m stern strip is
 * a conservative unwalkable margin; no mesh or decorative trim infers floor support. */
export function wayfarerInterior(deck: number): DerivedInterior {
  const floors =
    deck === 0
      ? source.rows
          .filter(
            (row) =>
              row.role === "floor" &&
              row.matrix[0][0] === 1 &&
              row.matrix[1][1] === 1,
          )
          .map((row) => ({
            cell: [row.matrix[0][3], row.matrix[1][3]] as [number, number],
            room:
              row.room === "corridor"
                ? "hall"
                : (row.room?.toLowerCase() ?? "hall"),
            kind: "panel" as const,
            partial: false,
          }))
      : [];
  return {
    deck,
    volume: deck === 0 ? "hull" : null,
    floors,
    exteriorWalls: [],
    exteriorSlopes: [],
    partitions: [],
    doors: [],
    posts: [],
    sockets: [],
    lights: [],
    labels: [],
    compartments: [],
    station: deck === 0 ? { at: [...WAYFARER_PILOT], room: "cockpit" } : null,
  };
}

export function isWayfarerGameplay(
  doc: Pick<ShipPrefabDocumentV1, "id" | "authoredGameplay">,
): boolean {
  return (
    doc.id === WAYFARER_PREFAB_ID &&
    doc.authoredGameplay?.id === WAYFARER_GAMEPLAY_PROFILE.id &&
    doc.authoredGameplay.revision === 1
  );
}

export function assertWayfarerPrefabContract(doc: ShipPrefabDocumentV1): void {
  // Recursive key ordering compares the entire admitted source; clients cannot change physical
  // components or keep this profile attached to a different hull revision.
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, v]) => [key, sort(v)]),
          )
        : value;
  if (JSON.stringify(sort(doc)) !== JSON.stringify(sort(prefabContract)))
    throw Error(
      "Authored Wayfarer profile requires its exact registered prefab document",
    );
}

/** Code-owned physical mount positions, in the same source plan as the visual kit. */
export const WAYFARER_MOUNT_POSES: Readonly<
  Record<
    string,
    { at: [number, number]; z: number; quarterTurns: 0 | 1 | 2 | 3 }
  >
> = {
  "main-s": { at: [-11, -4.4], z: 0.1875, quarterTurns: 0 },
  "main-c": { at: [-11, 0], z: 0.1875, quarterTurns: 0 },
  "main-p": { at: [-11, 4.4], z: 0.1875, quarterTurns: 0 },
  "rcs-bow-s": { at: [6.5, -6.5], z: 0.6375, quarterTurns: 1 },
  "rcs-bow-p": { at: [6.5, 6.5], z: 0.6375, quarterTurns: 3 },
  "rcs-stern-s": { at: [-9.5, -6.5], z: 0.6375, quarterTurns: 1 },
  "rcs-stern-p": { at: [-9.5, 6.5], z: 0.6375, quarterTurns: 3 },
  helm: { at: [7.75, 0], z: 0.1875, quarterTurns: 0 },
  core: { at: [3, 2.5], z: -1.25, quarterTurns: 0 },
  reactor: { at: [-8, 0], z: -1.25, quarterTurns: 0 },
  fuel: { at: [-5, 0], z: -1.25, quarterTurns: 0 },
  coolant: { at: [-3, 0], z: -1.25, quarterTurns: 0 },
  battery: { at: [0, 0], z: -1.25, quarterTurns: 0 },
  life: { at: [2.5, 2], z: 0.1875, quarterTurns: 0 },
  "rad-a": { at: [-7, -6], z: -1, quarterTurns: 1 },
  "rad-b": { at: [-7, 6], z: -1, quarterTurns: 3 },
};

/** Frozen source engine aperture: pod length5, last ring .65, aperture recess .06. */
export const WAYFARER_MAIN_NOZZLE = { offset: 5.59, height: 0.237 } as const;
/** Five console segments preserve the authored U and its central chair pocket. */
export function wayfarerConsoleFootprints(): [number, number][][] {
  type Segment = { x: number; y: number; rotation: number; width: number };
  const centre: Segment = { x: 0, y: 1.2, rotation: Math.PI, width: 0.9 };
  const transform = (s: Segment, x: number, y: number): [number, number] => [
    s.x + Math.cos(s.rotation) * x - Math.sin(s.rotation) * y,
    s.y + Math.sin(s.rotation) * x + Math.cos(s.rotation) * y,
  ];
  const segments = [centre];
  for (const side of [-1, 1]) {
    let prev = centre;
    for (const [turn, width] of [
      [30, 0.72],
      [55, 0.8],
    ]) {
      const corner = transform(prev, (side * prev.width) / 2, 0.3),
        rotation = prev.rotation + (side * turn * Math.PI) / 180;
      const x =
        corner[0] +
        (Math.cos(rotation) * side * width) / 2 +
        Math.sin(rotation) * 0.3;
      const y =
        corner[1] +
        (Math.sin(rotation) * side * width) / 2 -
        Math.cos(rotation) * 0.3;
      prev = { x, y, rotation, width };
      segments.push(prev);
    }
  }
  return segments.map((segment) =>
    [
      [-segment.width / 2, -0.32],
      [segment.width / 2, -0.32],
      [segment.width / 2, 0.31],
      [-segment.width / 2, 0.31],
    ].map(([x, y]) => {
      const point = transform(segment, x, y);
      return [round(7.75 + point[1]), round(-point[0])] as [number, number];
    }),
  );
}
