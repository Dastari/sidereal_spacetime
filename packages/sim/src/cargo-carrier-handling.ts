import type { DeckCollisionFrame } from "./construction-collision";
import { qualifyCargoRectangle } from "./cargo-carrier-collision";
import {
  validateCargoStack,
  type CargoGrid,
  type CargoInterface,
  type CargoPlacement,
  type CargoPoint,
} from "./construction-cargo";
import { inside } from "./layout-geometry";

export interface CargoHandlingPlan {
  waypoints: CargoPoint[];
  quarterTurns: number;
  clearanceUnits: number;
}
function requireCondition(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}
const overlap = (a: readonly number[], b: readonly number[]) =>
  a[0]! < b[3]! &&
  a[3]! > b[0]! &&
  a[1]! < b[4]! &&
  a[4]! > b[1]! &&
  a[2]! < b[5]! &&
  a[5]! > b[2]!;
/** One locked carrier per command. This is a bounded kinematic handling envelope,
 * not human lifting strength or free rigid-body physics. It checks the complete
 * source lift, translation, rotation envelope and lowering before any DB write.
 * Callers still enforce current actor access and a stationary ship. */
export function planCargoCarrierHandling(input: {
  grid: CargoGrid;
  interfaces: readonly CargoInterface[];
  placements: readonly CargoPlacement[];
  containerId: string;
  target: CargoPlacement;
  structure: DeckCollisionFrame;
}): CargoHandlingPlan {
  const { grid, interfaces, placements, containerId, target, structure } =
    input;
  requireCondition(
    placements.length <= 256 && interfaces.length <= 256,
    "Cargo handling work budget exceeded",
  );
  requireCondition(
    validateCargoStack(grid, interfaces, placements).valid,
    "Existing cargo stack requires recovery",
  );
  const source = placements.find((p) => p.containerId === containerId),
    definition = source && interfaces.find((d) => d.id === source.interfaceId);
  requireCondition(
    source &&
      definition &&
      target.containerId === containerId &&
      target.interfaceId === source.interfaceId,
    "Exact cargo handling source required",
  );
  requireCondition(
    definition.size[0] === definition.size[1],
    "Only qualified square carriers support this handling envelope",
  );
  const others = placements.filter((p) => p.containerId !== containerId);
  requireCondition(
    validateCargoStack(grid, interfaces, others).valid,
    "Unload supported cargo before moving its support",
  );
  requireCondition(
    validateCargoStack(grid, interfaces, [...others, target]).valid,
    "Cargo handling destination is unsupported or obstructed",
  );
  requireCondition(
    structure.deckId === grid.deckId,
    "Cargo handling deck mismatch",
  );
  const size = definition.size,
    boxes = others.map((p) => {
      const d = interfaces.find((v) => v.id === p.interfaceId)!;
      return [
        ...p.origin,
        p.origin[0] + (p.quarterTurns % 2 ? d.size[1] : d.size[0]),
        p.origin[1] + (p.quarterTurns % 2 ? d.size[0] : d.size[1]),
        p.origin[2] + d.size[2],
      ];
    });
  boxes.push(...grid.reservedVolumes.map((b) => [...b]));
  const clearanceUnits = 1;
  const lift = Math.max(
    source.origin[2],
    target.origin[2],
    ...boxes
      .filter(
        (b) =>
          Math.min(source.origin[0], target.origin[0]) < b[3]! &&
          Math.max(source.origin[0], target.origin[0]) + size[0] > b[0]! &&
          Math.min(source.origin[1], target.origin[1]) < b[4]! &&
          Math.max(source.origin[1], target.origin[1]) + size[1] > b[1]!,
      )
      .map((b) => b[5]! + clearanceUnits),
  );
  requireCondition(
    lift + size[2] + clearanceUnits <= grid.roofZ,
    "Insufficient ceiling clearance to handle cargo",
  );
  const paths: CargoPoint[][] = [
    [
      [source.origin[0], source.origin[1], lift],
      [target.origin[0], source.origin[1], lift],
      [target.origin[0], target.origin[1], lift],
    ],
    [
      [source.origin[0], source.origin[1], lift],
      [source.origin[0], target.origin[1], lift],
      [target.origin[0], target.origin[1], lift],
    ],
  ];
  const validSweep = (a: CargoPoint, b: CargoPoint, padding = 0) => {
    const box = [
      Math.min(a[0], b[0]) - padding,
      Math.min(a[1], b[1]) - padding,
      Math.min(a[2], b[2]),
      Math.max(a[0], b[0]) + size[0] + padding,
      Math.max(a[1], b[1]) + size[1] + padding,
      Math.max(a[2], b[2]) + size[2],
    ];
    if (boxes.some((o) => overlap(box, o))) return false;
    if (
      ![
        [box[0]!, box[1]!],
        [box[3]!, box[1]!],
        [box[3]!, box[4]!],
        [box[0]!, box[4]!],
      ].every((p) => inside(p as [number, number], grid.footprint))
    )
      return false;
    return qualifyCargoRectangle(structure, [
      box[0]! / 32,
      box[1]! / 32,
      box[3]! / 32,
      box[4]! / 32,
    ]);
  };
  for (const path of paths) {
    const full = [source.origin, ...path, target.origin];
    if (!full.slice(1).every((p, i) => validSweep(full[i]!, p))) continue;
    // Quarter-turn animation sweeps outside the final square. Never approve it
    // merely because the start and end AABBs coincide.
    const rotationPadding =
      source.quarterTurns === target.quarterTurns
        ? 0
        : Math.ceil((size[0] * (Math.SQRT2 - 1)) / 2);
    if (rotationPadding && !validSweep(path[2]!, path[2]!, rotationPadding))
      continue;
    return {
      waypoints: full,
      quarterTurns: target.quarterTurns,
      clearanceUnits,
    };
  }
  throw Error(
    "Cargo handling sweep intersects structure, other cargo or grid boundary",
  );
}
