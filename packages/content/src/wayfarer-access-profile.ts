/** Proposed private native derivative. No catalogue/default/live activation. */
import contract from "./wayfarer-access-contract.v2.json";
import physical from "./wayfarer-access-profile.v2.json";
import doors from "../../../assets/runtime/wayfarer-access/r001/doors.json";
import type { DerivedInterior, ShipPrefabDocumentV1 } from "./ship-prefab";
import {
  snapshotShipAccessDoorPack,
  type ShipAccessDoorPack,
} from "./ship-access-doors";
import type { WayfarerGameplayObject } from "./wayfarer-authored-gameplay";

// The isolated smoke-module builder may flip only this exact admission constant.
export const WAYFARER_ACCESS_REVIEW_ENABLED = false;
export const WAYFARER_ACCESS_PROFILE_REVISION = 2 as const;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const WAYFARER_ACCESS_PHYSICAL = freeze(physical);
export const WAYFARER_ACCESS_DOORS = snapshotShipAccessDoorPack(
  doors as ShipAccessDoorPack,
);
export const WAYFARER_ACCESS_FURNISHING_SHIFTS: Readonly<
  Record<string, readonly [number, number]>
> = {
  Galley_galley_floor_unit: [-0.5, 0],
  Cargo_canister_red: [1.2, -0.55],
  Cargo_crate_small_white: [0.5, 1.2],
  Cargo_crate_yellow: [1.6, 0],
  Cargo_machine_small: [-2.5, -0.9],
  Cargo_toolbox_tray: [-1.25, -0.5],
  Hydroponics_hydro_locker: [1.2, -0.8],
  Hydroponics_planter_row: [0.625, 1],
  Hydroponics_cabinet_dark: [0, -0.5],
  Utility_wall_strip_amber: [0, -0.5],
  Utility_utility_console: [0, -1.125],
};

export function wayfarerAccessObjects(
  objects: readonly WayfarerGameplayObject[],
): WayfarerGameplayObject[] {
  return objects.map((o) => {
    const shift = WAYFARER_ACCESS_FURNISHING_SHIFTS[o.object];
    if (!shift) return o;
    return {
      ...o,
      min: [o.min[0] + shift[0], o.min[1] + shift[1], o.min[2]],
      max: [o.max[0] + shift[0], o.max[1] + shift[1], o.max[2]],
      footprint: o.footprint.map(([x, y]) => [x + shift[0], y + shift[1]]),
    };
  });
}

export function wayfarerAccessFurnitureMatrix(
  object: string,
  input: readonly (readonly number[])[],
): number[][] {
  const matrix = input.map((row) => [...row]);
  const shift = WAYFARER_ACCESS_FURNISHING_SHIFTS[object];
  if (shift) {
    matrix[0][3] += shift[0];
    matrix[1][3] += shift[1];
  }
  return matrix;
}
export const WAYFARER_ACCESS_SOURCE = freeze(
  contract,
) as unknown as ShipPrefabDocumentV1;
export const WAYFARER_ACCESS_MODULES = [
  { id: "personnel", x0: 2, x1: 4, center: 3, clearWidthM: 1.2 },
  { id: "cargo", x0: -9, x1: -5, center: -7, clearWidthM: 3.75 },
] as const;

export function isWayfarerAccessProfile(
  doc: Pick<ShipPrefabDocumentV1, "id" | "authoredGameplay">,
): boolean {
  return (
    doc.id === "fed.m.wayfarer" &&
    doc.authoredGameplay?.id === "wayfarer-authored-r001" &&
    doc.authoredGameplay.revision === WAYFARER_ACCESS_PROFILE_REVISION
  );
}

export function assertWayfarerAccessAdmission(): void {
  if (!WAYFARER_ACCESS_REVIEW_ENABLED)
    throw Error("Proposed Wayfarer access profile2 admission is disabled");
}

/** Pure geometry qualification only; normal admission still rejects profile2. */
export function wayfarerAccessInterior(base: DerivedInterior): DerivedInterior {
  if (base.deck !== 0) return base;
  const columns = new Set(
    WAYFARER_ACCESS_MODULES.flatMap((m) =>
      Array.from({ length: m.x1 - m.x0 }, (_, i) => m.x0 + i),
    ),
  );
  const floors = base.floors.filter((f) => !columns.has(f.cell[0]));
  for (const x of columns)
    for (let y = -5; y < 7; y++) {
      const module = WAYFARER_ACCESS_MODULES.find(
        (m) => x >= m.x0 && x < m.x1,
      )!;
      const original = base.floors.find(
        (f) =>
          f.cell[0] === x && y + 0.5 >= f.cell[1] && y + 0.5 < f.cell[1] + 1,
      );
      if (!original && y < 5)
        throw Error("Access floor leaves admitted native support");
      floors.push({
        cell: [x, y],
        room:
          y >= 3
            ? module.id + "_chamber"
            : y >= 2
              ? module.id === "cargo"
                ? "cargo"
                : "utility"
              : original!.room,
        kind: "panel",
        partial: false,
      });
    }
  const partitions = [...base.partitions];
  const doors = [...base.doors];
  for (const m of WAYFARER_ACCESS_MODULES) {
    const chamber = m.id + "_chamber";
    for (const x of [m.x0, m.x1])
      for (let y = 3; y < 7; y++)
        partitions.push({
          a: [x, y],
          b: [x, y + 1],
          type: "wall.full",
          variant: "wall",
          rooms: [chamber, null],
          exterior: false,
        });
    doors.push({
      id: m.id + "-inner",
      a: [m.x0, 3],
      b: [m.x1, 3],
      type: m.id === "cargo" ? "door.blast" : "door.airlock",
      rooms: [chamber, m.id === "cargo" ? "cargo" : "utility"],
      exterior: false,
      clearWidthM: m.clearWidthM,
    });
    doors.push({
      id: m.id + "-outer",
      a: [m.x0, 7],
      b: [m.x1, 7],
      type: m.id === "cargo" ? "door.blast" : "door.airlock",
      rooms: [chamber, null],
      exterior: true,
      clearWidthM: m.clearWidthM,
    });
  }
  return { ...base, floors, partitions, doors };
}
