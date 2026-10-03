import {
  WAYFARER_GAMEPLAY_OBJECTS,
  type WayfarerGameplayObject,
} from "./wayfarer-authored-gameplay";

/** Instance state only: immutable source object names identify the furniture. */
export interface FurnishingOverride {
  dx: number;
  dy: number;
  yaw: number;
  snap: boolean;
  deleted: boolean;
}
export type FurnishingOverrides = Readonly<Record<string, FurnishingOverride>>;
export const FURNISHING_DEFAULT: FurnishingOverride = {
  dx: 0,
  dy: 0,
  yaw: 0,
  snap: true,
  deleted: false,
};
/** Portable wall fixtures only. The authored front is +Y before source placement.
 * Ship architecture and floor consoles remain fixed or floor mounted. */
export const WAYFARER_WALL_FURNISHINGS: Readonly<
  Record<
    string,
    {
      normal: readonly [number, number];
      minZ: number;
      maxZ: number;
    }
  >
> = Object.fromEntries(
  [
    "Cockpit_wall_light_cyan_v",
    "Cockpit_wall_light_cyan_v.001",
    "Hall_wall_locker_door",
    "Hall_wall_screen_tall",
    "Hydroponics_wall_lamp_amber",
    "Hydroponics_wall_shelf_screen",
    "Lounge_poster_goodcrew",
    "Quarters_A_poster_planet",
    "Quarters_B_cyan_wall_strip",
    "Quarters_B_wall_screen_small",
    "Utility_wall_strip_amber",
    "Workshop_wall_strip_amber",
  ].map((id) => {
    const source = WAYFARER_GAMEPLAY_OBJECTS.find((row) => row.object === id)!;
    // These explicit instances were authored at zero or -90 degrees, never mirrored.
    const normal: [number, number] = [
      "Cockpit_wall_light_cyan_v",
      "Cockpit_wall_light_cyan_v.001",
      "Hydroponics_wall_lamp_amber",
      "Quarters_B_wall_screen_small",
      "Utility_wall_strip_amber",
      "Workshop_wall_strip_amber",
    ].includes(id)
      ? [1, 0]
      : [0, 1];
    return [id, { normal, minZ: source.min[2], maxZ: source.max[2] }];
  }),
);
export const WAYFARER_MOVABLE_FURNISHINGS: ReadonlySet<string> = new Set([
  ...Object.keys(WAYFARER_WALL_FURNISHINGS),
  "Cargo_blue_case_trolley",
  "Cargo_canister_red",
  "Cargo_cargo_rack",
  "Cargo_crate_pale_vent",
  "Cargo_crate_small_white",
  "Cargo_crate_white_blue",
  "Cargo_crate_yellow",
  "Cargo_toolbox_tray",
  "Galley_bench_case",
  "Galley_robot_box",
  "Galley_workbench",
  "Hall_fridge_cabinet",
  "Hall_wall_locker_door",
  "Hydroponics_cabinet_dark",
  "Hydroponics_hydro_locker",
  "Hydroponics_planter_row",
  "Lounge_coffee_table",
  "Lounge_plant_tall",
  "Lounge_shelf_unit",
  "Lounge_sofa_l",
  "Quarters_A_bed_single",
  "Quarters_A_desk_set",
  "Quarters_A_locker_lit",
  "Quarters_B_bunk_bed",
  "Quarters_B_side_table_plant",
  "Workshop_jerry_can",
  "Workshop_parts_chest",
]);
export function furnishingMountKind(
  object: string,
): "wall" | "floor" | undefined {
  if (Object.hasOwn(WAYFARER_WALL_FURNISHINGS, object)) return "wall";
  if (WAYFARER_MOVABLE_FURNISHINGS.has(object)) return "floor";
}
export function furnishingRestriction(object: string): string | undefined {
  if (WAYFARER_MOVABLE_FURNISHINGS.has(object)) return;
  const source = WAYFARER_GAMEPLAY_OBJECTS.find((row) => row.object === object);
  if (
    !source ||
    source.role !== "room-content" ||
    /walls_|POST_|PART_|WALL_|LINER_/.test(object)
  )
    return "Fixed ship structure";
  return "Fixed ship fixture or physical system";
}
export function readFurnishingOverrides(raw = "{}"): FurnishingOverrides {
  if (raw.length > 16384) throw Error("Furnishing state exceeds budget");
  const rows: unknown = JSON.parse(raw);
  if (
    !rows ||
    typeof rows !== "object" ||
    Array.isArray(rows) ||
    Object.keys(rows).length > WAYFARER_MOVABLE_FURNISHINGS.size
  )
    throw Error("Invalid furnishing state");
  for (const [id, v] of Object.entries(rows)) {
    if (
      !WAYFARER_MOVABLE_FURNISHINGS.has(id) ||
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).sort().join(",") !== "deleted,dx,dy,snap,yaw"
    )
      throw Error("Invalid furnishing override");
    const p = v as FurnishingOverride;
    if (
      ![p.dx, p.dy, p.yaw].every(Number.isFinite) ||
      Math.abs(p.dx) > 32 ||
      Math.abs(p.dy) > 32 ||
      Math.abs(p.yaw) > Math.PI * 2 ||
      typeof p.snap !== "boolean" ||
      typeof p.deleted !== "boolean"
    )
      throw Error("Invalid furnishing pose");
  }
  return rows as FurnishingOverrides;
}
const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
/** Rotate in source plan around the same immutable measured centre used by authority. */
export function transformFurnishingPoint(
  source: WayfarerGameplayObject,
  p: readonly number[],
  state = FURNISHING_DEFAULT,
): [number, number] {
  const cx = (source.min[0] + source.max[0]) / 2,
    cy = (source.min[1] + source.max[1]) / 2;
  const c = Math.cos(state.yaw),
    s = Math.sin(state.yaw),
    x = p[0] - cx,
    y = p[1] - cy;
  return [
    round(cx + c * x - s * y + state.dx),
    round(cy + s * x + c * y + state.dy),
  ];
}
export function effectiveWayfarerObjects(
  overrides: FurnishingOverrides = {},
): WayfarerGameplayObject[] {
  return WAYFARER_GAMEPLAY_OBJECTS.flatMap((source) => {
    const p = overrides[source.object];
    if (p?.deleted) return [];
    if (!p || (!p.dx && !p.dy && !p.yaw)) return [source];
    const footprint = source.footprint.map((point) =>
      transformFurnishingPoint(source, point, p),
    );
    return [
      {
        ...source,
        footprint,
        min: [
          Math.min(...footprint.map((p) => p[0])),
          Math.min(...footprint.map((p) => p[1])),
          source.min[2],
        ],
        max: [
          Math.max(...footprint.map((p) => p[0])),
          Math.max(...footprint.map((p) => p[1])),
          source.max[2],
        ],
      },
    ];
  });
}
/** Apply after the code-owned authored placement derivative, preserving source matrix scale. */
export function applyFurnishingMatrix(
  object: string,
  input: readonly (readonly number[])[],
  overrides: FurnishingOverrides = {},
): number[][] | undefined {
  const state = overrides[object];
  if (state?.deleted) return;
  const matrix = input.map((row) => [...row]);
  if (!state || (!state.dx && !state.dy && !state.yaw)) return matrix;
  const source = WAYFARER_GAMEPLAY_OBJECTS.find((row) => row.object === object);
  if (!source) throw Error("Unknown furniture source");
  const c = Math.cos(state.yaw),
    s = Math.sin(state.yaw);
  for (let axis = 0; axis < 3; axis++) {
    const x = matrix[0][axis],
      y = matrix[1][axis];
    matrix[0][axis] = c * x - s * y;
    matrix[1][axis] = s * x + c * y;
  }
  const point = transformFurnishingPoint(
    source,
    [matrix[0][3], matrix[1][3]],
    state,
  );
  matrix[0][3] = point[0];
  matrix[1][3] = point[1];
  return matrix;
}
