/** Versioned design intent only. No layout object is an installed world instance. */
export const LAYOUT_SCHEMA = "sidereal.layout-draft.v1" as const;
export const LAYOUT_COMPILER = "floorplan-1" as const;
export const SHAPE_REVISION = "lattice-shapes-1" as const;
export const EXTENDED_SHAPE_REVISION = "lattice-shapes-2" as const;
export const LAYOUT_LIMITS = {
  decks: 8,
  tiles: 2048,
  fittings: 2000,
  edges: 8192,
  routeSegments: 8192,
  span: 8192,
  coordinate: 8192,
  bytes: 1048576,
  commands: 100,
} as const;
/** Integer 1/32 metre coordinates. East / north, independent of renderer axes. */
export type Point = [number, number];
export type Shape = "rectangle" | "triangle" | "trapezoid" | "polygon";
export const FLOOR_SHAPES: Record<Shape, { label: string; vertices: Point[] }> =
  {
    rectangle: {
      label: "Rectangle",
      vertices: [
        [0, 0],
        [64, 0],
        [64, 64],
        [0, 64],
      ],
    },
    triangle: {
      label: "Right triangle",
      vertices: [
        [0, 0],
        [64, 0],
        [64, 64],
      ],
    },
    polygon: {
      label: "Clipped corner",
      vertices: [
        [0, 0],
        [64, 0],
        [64, 32],
        [32, 64],
        [0, 64],
      ],
    },
    trapezoid: {
      label: "Trapezoid",
      vertices: [
        [0, 0],
        [64, 0],
        [64, 64],
        [32, 64],
      ],
    },
  };
export interface FloorTile {
  id: string;
  deckId: string;
  shape: Shape;
  revision: string;
  vertices: Point[];
  material: string;
}
export interface LayoutDeck {
  id: string;
  name: string;
  order: number;
  elevation: number;
  ceiling: number;
  roof: boolean;
  holes: { id: string; seed: Point }[];
}
export interface Partition {
  id: string;
  deckId: string;
  a: Point;
  b: Point;
  seal: "design-sealed" | "open-divider";
}
export interface Opening {
  /** Opt-in structural jamb/corner reserve in integer units. */
  setback?: number;
  id: string;
  deckId: string;
  partitionId: string;
  a: Point;
  b: Point;
  kind: "door" | "passage" | "airlock";
  clearance: number;
  sill: number;
}
export interface LayoutRoom {
  id: string;
  deckId: string;
  name: string;
  type: string;
  seed: Point;
  boundaryIds: string[];
  access: "crew" | "visitors" | "restricted";
  floorTheme: string;
  wallTheme: string;
}
export type ServiceChannel =
  "power" | "data" | "fuel" | "coolant" | "ventilation";
export const SERVICE_CHANNELS: Record<
  ServiceChannel,
  { color: string; unit: string; dash: string }
> = {
  power: { color: "#f4d75f", unit: "W", dash: "" },
  data: { color: "#5adea1", unit: "bit/s", dash: "6 4" },
  fuel: { color: "#ffa75e", unit: "L/s", dash: "12 4" },
  coolant: { color: "#45d8f5", unit: "L/s", dash: "" },
  ventilation: { color: "#c29afb", unit: "m³/s", dash: "3 4" },
};
export interface RouteNode {
  id: string;
  deckId: string;
  point: Point;
  channel: ServiceChannel;
  kind: "endpoint" | "junction";
  direction: "in" | "out" | "both";
  medium: string;
}
export interface LayoutRoute {
  id: string;
  deckId: string;
  channel: ServiceChannel;
  from: string;
  to: string;
  path: Point[];
  capacity: number | null;
}
export interface LayoutFitting {
  id: string;
  deckId: string;
  definitionId: string;
  revision: string;
  position: Point;
  quarterTurns: number;
  reflected: boolean;
  footprint: Point;
  clearance: number;
  kind: "equipment" | "container";
  container: { columns: number; rows: number; contents: never[] } | null;
}
export interface LayoutDocument {
  /** Opt-in structural authoring rules; absent in preserved v1 sources. */
  structure?: import("./layout-structure").LayoutStructure;
  /** Optional backwards-compatible visual assembly, separate from floor topology and authority. */
  assembly?: import("./layout-assembly").LayoutAssembly;
  schema: typeof LAYOUT_SCHEMA;
  compiler: string;
  id: string;
  name: string;
  kind: "ship" | "station-module";
  dependencies: { id: string; revision: string }[];
  source: {
    blueprintId?: string;
    blueprintRevision?: string;
    liveId?: string;
    expectedRevision?: string;
  } | null;
  playableDeckId: string;
  decks: LayoutDeck[];
  tiles: FloorTile[];
  partitions: Partition[];
  openings: Opening[];
  rooms: LayoutRoom[];
  fittings: LayoutFitting[];
  routes: LayoutRoute[];
  nodes: RouteNode[];
  appearance: { primary: string; accent: string; kit: string };
  legacy: {
    sourceRaw: string;
    placements: unknown[];
    unresolved: string[];
  } | null;
}
export function emptyLayout(
  id: string,
  deckId: string,
  kind: LayoutDocument["kind"] = "ship",
): LayoutDocument {
  return {
    schema: LAYOUT_SCHEMA,
    compiler: LAYOUT_COMPILER,
    id,
    name: kind === "ship" ? "Untitled ship" : "Station module",
    kind,
    dependencies: [{ id: "floor-shapes", revision: SHAPE_REVISION }],
    source: null,
    playableDeckId: deckId,
    decks: [
      {
        id: deckId,
        name: "Deck A",
        order: 0,
        elevation: 0,
        ceiling: 96,
        roof: true,
        holes: [],
      },
    ],
    tiles: [],
    partitions: [],
    openings: [],
    rooms: [],
    fittings: [],
    nodes: [],
    routes: [],
    appearance: {
      primary: "#6d8795",
      accent: "#45d8f5",
      kit: "Unassigned / draft proxy",
    },
    legacy: null,
  };
}
/** Exact signed permutation, also suitable for port/nozzle direction vectors. */
export function transformPoint(
  p: Point,
  turns: number,
  reflected = false,
): Point {
  let [x, y] = p;
  if (reflected) x = -x;
  for (let n = 0; n < ((turns % 4) + 4) % 4; n++) [x, y] = [-y, x];
  return [x === 0 ? 0 : x, y === 0 ? 0 : y];
}
export function stampTile(
  id: string,
  deckId: string,
  shape: Shape,
  at: Point,
  turns = 0,
  reflected = false,
): FloorTile {
  return {
    id,
    deckId,
    shape,
    revision: shape === "polygon" ? EXTENDED_SHAPE_REVISION : SHAPE_REVISION,
    material: "unassigned-structure",
    vertices: FLOOR_SHAPES[shape].vertices.map((p) => {
      const q = transformPoint(p, turns, reflected);
      return [q[0] + at[0], q[1] + at[1]];
    }),
  };
}
/** Deliberate visual-reference migration. Original history and unknown parts survive verbatim. */
export function migrateAssembly(
  raw: string,
  id: string,
  deckId: string,
): LayoutDocument {
  const source = JSON.parse(raw),
    doc = source.present ?? source;
  if (
    doc?.schema !== "sidereal.assembly-draft.v1" ||
    !Array.isArray(doc.parts) ||
    typeof doc.id !== "string"
  )
    throw new Error(
      "Not an assembly-v1 document/history. Original data is preserved.",
    );
  const result = emptyLayout(id, deckId);
  result.name = `${typeof doc.name === "string" ? doc.name : "Assembly"} · conversion`;
  result.legacy = {
    sourceRaw: raw,
    placements: structuredClone(doc.parts),
    unresolved: doc.parts.map(
      (p: { id?: string }, i: number) => p?.id ?? `unresolved-${i}`,
    ),
  };
  return result;
}
/** Repeatable review fixture, not the live Wayfarer or an approved blueprint. */
export function layoutFixture(): LayoutDocument {
  const d = emptyLayout("layout-review-pathfinder-v1", "deck-a");
  d.name = "Pathfinder";
  for (let x = 0; x < 10; x++)
    for (let y = -3; y < 3; y++)
      d.tiles.push(
        stampTile(`tile-${x}-${y}`, "deck-a", "rectangle", [x * 64, y * 64]),
      );
  // Continuous tapered bow: a central rectangle strip, two trapezoids and two triangles.
  for (let y = -1; y < 1; y++)
    d.tiles.push(
      stampTile(`bow-core-${y}`, "deck-a", "rectangle", [-64, y * 64]),
    );
  d.tiles.push({
    ...stampTile("bow-upper", "deck-a", "trapezoid", [0, 0]),
    vertices: [
      [-64, 64],
      [0, 64],
      [0, 128],
      [-32, 128],
    ],
  });
  d.tiles.push({
    ...stampTile("bow-lower", "deck-a", "trapezoid", [0, 0]),
    vertices: [
      [-32, -128],
      [0, -128],
      [0, -64],
      [-64, -64],
    ],
  });
  d.tiles.push({
    ...stampTile("bow-tip-upper", "deck-a", "triangle", [0, 0]),
    vertices: [
      [-32, 128],
      [0, 128],
      [0, 192],
    ],
  });
  d.tiles.push({
    ...stampTile("bow-tip-lower", "deck-a", "triangle", [0, 0]),
    vertices: [
      [-32, -128],
      [0, -192],
      [0, -128],
    ],
  });
  d.partitions = [
    {
      id: "wall-north",
      deckId: "deck-a",
      a: [0, 64],
      b: [640, 64],
      seal: "design-sealed",
    },
    {
      id: "wall-south",
      deckId: "deck-a",
      a: [0, -64],
      b: [640, -64],
      seal: "design-sealed",
    },
    ...[192, 384, 512].flatMap((x, i) =>
      [-1, 1].map((s) => ({
        id: `wall-${i}-${s}`,
        deckId: "deck-a",
        a: [x, s * 64] as Point,
        b: [x, s * 192] as Point,
        seal: "design-sealed" as const,
      })),
    ),
  ];
  d.openings = [80, 272, 432, 560].flatMap((x, i) =>
    [-1, 1].map((s) => ({
      id: `door-${i}-${s}`,
      deckId: "deck-a",
      partitionId: s > 0 ? "wall-north" : "wall-south",
      a: [x, s * 64] as Point,
      b: [x + 32, s * 64] as Point,
      kind: "door" as const,
      clearance: 32,
      sill: 0,
    })),
  );
  const names = [
    "Crew quarters",
    "Galley",
    "Lounge",
    "Utility",
    "Medbay",
    "Workshop",
    "Storage",
    "Cargo",
  ];
  d.rooms = names.map((name, i) => ({
    id: `room-${i}`,
    deckId: "deck-a",
    name,
    type: name,
    seed: [[96, 288, 464, 592][i % 4], i < 4 ? 144 : -144] as Point,
    boundaryIds: [],
    access: "crew",
    floorTheme: "Unassigned",
    wallTheme: "Unassigned",
  }));
  d.rooms.push({
    id: "room-circulation",
    deckId: "deck-a",
    name: "Bridge & circulation",
    type: "Corridor",
    seed: [32, 32],
    boundaryIds: [],
    access: "crew",
    floorTheme: "Unassigned",
    wallTheme: "Unassigned",
  });
  for (const [i, channel] of (
    ["power", "data", "coolant", "fuel", "ventilation"] as ServiceChannel[]
  ).entries()) {
    const y = -40 + i * 20;
    d.nodes.push(
      {
        id: `source-${channel}`,
        deckId: "deck-a",
        point: [32, y],
        channel,
        kind: "endpoint",
        direction: "out",
        medium: channel,
      },
      {
        id: `end-${channel}`,
        deckId: "deck-a",
        point: [608, y],
        channel,
        kind: "endpoint",
        direction: "in",
        medium: channel,
      },
    );
    d.routes.push({
      id: `route-${channel}`,
      deckId: "deck-a",
      channel,
      from: `source-${channel}`,
      to: `end-${channel}`,
      path: [
        [32, y],
        [608, y],
      ],
      capacity: null,
    });
  }
  d.nodes.push(
    {
      id: "cross-a",
      deckId: "deck-a",
      point: [352, -56],
      channel: "data",
      kind: "endpoint",
      direction: "out",
      medium: "data",
    },
    {
      id: "cross-b",
      deckId: "deck-a",
      point: [352, 56],
      channel: "data",
      kind: "endpoint",
      direction: "in",
      medium: "data",
    },
  );
  d.routes.push({
    id: "crossing-data",
    deckId: "deck-a",
    channel: "data",
    from: "cross-a",
    to: "cross-b",
    path: [
      [352, -56],
      [352, 56],
    ],
    capacity: null,
  });
  return d;
}

/** A deliberate local edit introducing the extended polygon catalog advances its
 * dependency. Existing v1 documents remain byte-identical until that edit. */
export function withRequiredShapeDependency(
  doc: LayoutDocument,
): LayoutDocument {
  if (!doc.tiles.some((t) => t.revision === EXTENDED_SHAPE_REVISION))
    return doc;
  return {
    ...doc,
    dependencies: doc.dependencies.map((d) =>
      d.id === "floor-shapes" && d.revision === SHAPE_REVISION
        ? { ...d, revision: EXTENDED_SHAPE_REVISION }
        : d,
    ),
  };
}
