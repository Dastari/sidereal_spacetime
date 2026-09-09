import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import { compileLayout } from "./layout-compiler";
import { readLayout } from "./layout-validation";
import {
  area2,
  comparePoint,
  compareText,
  onSegment,
  inside,
  canonicalPolygon,
  cross,
  properCross,
} from "./layout-geometry";
import {
  compilePressureTopology,
  PRESSURE_LIMITS,
  type PressureBoundary,
  type PressureStructure,
} from "./construction-topology";

type BoundaryRule<T = PressureBoundary> = T extends unknown
  ? Omit<T, "id" | "a" | "b">
  : never;

export const PRESSURE_LAYOUT_LIMITS = Object.freeze({
  tiles: 256,
  partitions: 128,
  openings: 128,
  boundaries: 2048,
  apertures: 128,
  edgeChecks: 262144,
});
const digest = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
function demand(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Construction pressure: ${message}`);
}
const validId = (id: string) =>
  typeof id === "string" && id.length > 0 && id.length <= 128;
const order = (a: Point, b: Point): [Point, Point] =>
  comparePoint(a, b) < 0 ? [a, b] : [b, a];
export interface PressureLayoutOptions {
  floorTopUnitsByDeck: Readonly<Record<string, number>>;
}
export interface PressureLayoutCell {
  id: string;
  tileId: string;
  deckId: string;
  polygonUnits: Point[];
  bottomUnits: number;
  topUnits: number;
  nominalPrismVolumeM3: number;
}
export interface PressureLayoutSurface {
  id: string;
  a: string;
  b: string | null;
  deckId: string;
  kind: "floor" | "roof" | "perimeter" | "partition" | "opening" | "continuous";
  segmentUnits?: [Point, Point];
  partitionId?: string;
  openingId?: string;
  /** Fraction of the complete semantic opening, for distributing its supplied conductance once. */
  openingFraction?: number;
}
export interface PressureLayoutGeometry {
  instanceId: string;
  geometryFingerprint: string;
  cells: PressureLayoutCell[];
  surfaces: PressureLayoutSurface[];
}
/** Only trusted, already validated authority/compiler adapters may supply these proofs.
 * This pure helper validates binding and bounds; it does not authenticate client claims
 * or certify native geometry, seal performance or material properties. */
export interface PressureGeometryProof {
  id: string;
  geometryFingerprint: string;
  sourceDefinitionId: string;
  sourceRevision: string;
  sourceSha256: string;
  validated: true;
}
export interface VerifiedPressureSeal {
  proof: PressureGeometryProof;
  interfaceId: string;
  airtight: true;
}
export interface PressureFreeVolume {
  cellId: string;
  freeVolumeM3: number;
  excludedSolidVolumeM3: number;
  /** Caller has excluded native wall cores and all displaced solid volumes. */
  displacementAccounting: "validated-native-solid-exclusion";
  proof: PressureGeometryProof;
}
export type PressureSurfaceContract = {
  surfaceId: string;
  coverageProof: PressureGeometryProof;
} & (
  | { kind: "sealed"; seal: VerifiedPressureSeal }
  | {
      kind: "vacuum";
      conductanceMolesPerSecondPa: number;
      flowProof: PressureGeometryProof;
    }
);
export interface PressureOpeningContract {
  openingId: string;
  coverageProof: PressureGeometryProof;
  flowProof: PressureGeometryProof;
  open: boolean;
  openConductance: number;
  closedConductance: number;
  closure: "ungasketed" | "verified-seal";
  seal?: VerifiedPressureSeal;
}
export interface PressureApertureEndpoint {
  aperturePolygonUnits: Point[];
  aperturePlaneUnits: number;
  remainingSurfaceSeal: VerifiedPressureSeal;
  id: string;
  surfaceId: string;
  coverageProof: PressureGeometryProof;
}
export interface PressureApertureLink {
  enclosureProof: PressureGeometryProof;
  id: string;
  a: PressureApertureEndpoint;
  b: PressureApertureEndpoint;
  kind: "traversal" | "vent";
  conductanceMolesPerSecondPa: number;
  flowProof: PressureGeometryProof;
}
export interface PressureLayoutContracts {
  freeVolumes: readonly PressureFreeVolume[];
  surfaces: readonly PressureSurfaceContract[];
  openings: readonly PressureOpeningContract[];
  apertureLinks?: readonly PressureApertureLink[];
}

/** One stable gas cell per semantic floor tile. Tile-interior partitions are rejected
 * by the current layout compiler; never merge gas through an unrepresented wall. */
export function describePressureLayout(
  input: LayoutDocument,
  instanceId: string,
  options: PressureLayoutOptions,
): PressureLayoutGeometry {
  demand(validId(instanceId), "invalid instance identity");
  // Reject before reader/compiler cloning and quadratic geometric work.
  demand(
    Array.isArray(input?.tiles) &&
      input.tiles.length > 0 &&
      input.tiles.length <= PRESSURE_LAYOUT_LIMITS.tiles,
    "tile budget",
  );
  demand(
    Array.isArray(input.partitions) &&
      input.partitions.length <= PRESSURE_LAYOUT_LIMITS.partitions,
    "partition budget",
  );
  demand(
    Array.isArray(input.openings) &&
      input.openings.length <= PRESSURE_LAYOUT_LIMITS.openings,
    "opening budget",
  );
  const document = readLayout(input),
    compiled = compileLayout(document);
  demand(
    compiled.valid,
    compiled.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => d.message)
      .join("; "),
  );
  const floorTops = options.floorTopUnitsByDeck;
  demand(
    Object.keys(floorTops).length === document.decks.length &&
      document.decks.every(
        (d) =>
          Number.isFinite(floorTops[d.id]) &&
          floorTops[d.id] >= 0 &&
          floorTops[d.id] < d.ceiling,
      ),
    "explicit floor/ceiling datums required per deck",
  );
  const cells = compiled.tiles
    .map((t) => {
      const deck = document.decks.find((d) => d.id === t.deckId)!;
      return {
        id: `c:${digest([instanceId, t.id])}`,
        tileId: t.id,
        deckId: t.deckId,
        polygonUnits: t.vertices,
        bottomUnits: deck.elevation + floorTops[deck.id],
        topUnits: deck.elevation + deck.ceiling,
        nominalPrismVolumeM3:
          ((Math.abs(area2(t.vertices)) / 2048) *
            (deck.ceiling - floorTops[deck.id])) /
          32,
      };
    })
    .sort((a, b) => compareText(a.id, b.id));
  const byTile = new Map(cells.map((c) => [c.tileId, c]));
  const surfaces: PressureLayoutSurface[] = [];
  const push = (surface: Omit<PressureLayoutSurface, "id">) => {
    demand(
      surfaces.length < PRESSURE_LAYOUT_LIMITS.boundaries,
      "surface budget",
    );
    surfaces.push({ id: `s:${digest([instanceId, surface])}`, ...surface });
  };
  for (const cell of cells)
    for (const kind of ["floor", "roof"] as const)
      push({ a: cell.id, b: null, deckId: cell.deckId, kind });
  let checks = 0;
  for (const edge of compiled.edges) {
    const partitions = document.partitions.filter((p) => {
      demand(++checks <= PRESSURE_LAYOUT_LIMITS.edgeChecks, "edge work budget");
      return (
        p.deckId === edge.deckId &&
        onSegment(edge.a, p.a, p.b) &&
        onSegment(edge.b, p.a, p.b)
      );
    });
    demand(partitions.length <= 1, "ambiguous partition coverage");
    const partition = partitions[0],
      cuts: Point[] = [edge.a, edge.b];
    const openings = document.openings.filter((o) => {
      demand(++checks <= PRESSURE_LAYOUT_LIMITS.edgeChecks, "edge work budget");
      return partition && o.partitionId === partition.id;
    });
    for (const opening of openings)
      for (const point of [opening.a, opening.b])
        if (onSegment(point, edge.a, edge.b)) cuts.push(point);
    const points = [
      ...new Map(cuts.map((p) => [JSON.stringify(p), p])).values(),
    ].sort(comparePoint);
    const cellIds = edge.tileIds
      .map((id) => byTile.get(id)!.id)
      .sort(compareText);
    demand(
      cellIds.length === 1 || cellIds.length === 2,
      "unsupported shared face ownership",
    );
    for (let i = 1; i < points.length; i++) {
      const [a, b] = order(points[i - 1], points[i]);
      const matched = openings.filter(
        (o) => onSegment(a, o.a, o.b) && onSegment(b, o.a, o.b),
      );
      demand(matched.length <= 1, "overlapping openings");
      const opening = matched[0];
      const kind = opening
        ? "opening"
        : partition && partition.seal === "design-sealed"
          ? "partition"
          : cellIds.length === 2
            ? "continuous"
            : "perimeter";
      push({
        a: cellIds[0],
        b: cellIds[1] ?? null,
        deckId: edge.deckId,
        kind,
        segmentUnits: [a, b],
        ...(partition ? { partitionId: partition.id } : {}),
        ...(opening
          ? {
              openingId: opening.id,
              openingFraction:
                Math.hypot(b[0] - a[0], b[1] - a[1]) /
                Math.hypot(
                  opening.b[0] - opening.a[0],
                  opening.b[1] - opening.a[1],
                ),
            }
          : {}),
      });
    }
  }
  surfaces.sort((a, b) => compareText(a.id, b.id));
  const geometryFingerprint = digest({
    instanceId,
    requestedRoofCoverage: document.decks
      .map((d) => [d.id, d.roof])
      .sort((a, b) => compareText(String(a[0]), String(b[0]))),
    cells,
    surfaces,
  });
  return { instanceId, geometryFingerprint, cells, surfaces };
}

/** Compile only explicitly covered/sealed/leaking surfaces. Missing or unapproved
 * contracts reject the proposal; they never silently create an airtight room. */
export function buildLayoutPressure(
  input: LayoutDocument,
  instanceId: string,
  options: PressureLayoutOptions,
  contracts: PressureLayoutContracts,
) {
  demand(
    contracts.freeVolumes.length <= PRESSURE_LAYOUT_LIMITS.tiles &&
      contracts.surfaces.length <= PRESSURE_LAYOUT_LIMITS.boundaries &&
      contracts.openings.length <= PRESSURE_LAYOUT_LIMITS.openings &&
      (contracts.apertureLinks?.length ?? 0) <=
        PRESSURE_LAYOUT_LIMITS.apertures,
    "contract budget",
  );
  const geometry = describePressureLayout(input, instanceId, options);
  const proof = (p: PressureGeometryProof) =>
    demand(
      p?.validated === true &&
        validId(p.id) &&
        validId(p.sourceDefinitionId) &&
        validId(p.sourceRevision) &&
        /^[0-9a-f]{64}$/.test(p.sourceSha256) &&
        p.geometryFingerprint === geometry.geometryFingerprint,
      "missing, unvalidated or stale geometry proof",
    );
  const seal = (s: VerifiedPressureSeal) => {
    demand(
      s?.airtight === true && validId(s.interfaceId),
      "verified airtight interface required",
    );
    proof(s.proof);
  };
  const conductance = (c: number) =>
    demand(
      Number.isFinite(c) && c >= 0 && c <= PRESSURE_LIMITS.maxConductance,
      "invalid flow conductance",
    );
  const unique = <T>(rows: readonly T[], key: (row: T) => string) => {
    const map = new Map<string, T>();
    for (const row of rows) {
      const id = key(row);
      demand(
        validId(id) && !map.has(id),
        "duplicate or invalid contract identity",
      );
      map.set(id, row);
    }
    return map;
  };
  const volumes = unique(contracts.freeVolumes, (v) => v.cellId),
    coverage = unique(contracts.surfaces, (s) => s.surfaceId),
    openings = unique(contracts.openings, (o) => o.openingId);
  demand(
    volumes.size === geometry.cells.length,
    "free volumes must cover every cell",
  );
  const structure: PressureStructure = {
    cells: geometry.cells.map((cell) => {
      const v = volumes.get(cell.id);
      demand(v, "missing free volume");
      proof(v.proof);
      demand(
        v.displacementAccounting === "validated-native-solid-exclusion" &&
          Number.isFinite(v.freeVolumeM3) &&
          v.freeVolumeM3 >= PRESSURE_LIMITS.minVolumeM3 &&
          v.freeVolumeM3 <= cell.nominalPrismVolumeM3 &&
          Number.isFinite(v.excludedSolidVolumeM3) &&
          v.excludedSolidVolumeM3 >= 0 &&
          Math.abs(
            v.freeVolumeM3 +
              v.excludedSolidVolumeM3 -
              cell.nominalPrismVolumeM3,
          ) < 1e-8,
        "invalid free volume or missing native solid exclusion",
      );
      return {
        id: cell.id,
        deckId: cell.deckId,
        volumeM3: v.freeVolumeM3,
        faces: [] as string[],
      };
    }),
    boundaries: [],
  };
  const cells = new Map(structure.cells.map((c) => [c.id, c])),
    boundaries: PressureBoundary[] = [];
  const surfaceById = new Map(geometry.surfaces.map((s) => [s.id, s])),
    linked = new Set<string>(),
    endpointIds = new Set<string>(),
    linkIds = new Set<string>();
  const add = (
    s: PressureLayoutSurface,
    rule: BoundaryRule,
    b = s.b,
    id = s.id,
  ) => {
    const a = { cellId: s.a, faceId: id },
      other = b ? { cellId: b, faceId: id } : null;
    (cells.get(s.a)!.faces as string[]).push(id);
    if (b) (cells.get(b)!.faces as string[]).push(id);
    boundaries.push({ id, a, b: other, ...rule } as PressureBoundary);
  };
  for (const link of contracts.apertureLinks ?? []) {
    demand(
      validId(link.id) && !linkIds.has(link.id),
      "duplicate aperture link",
    );
    linkIds.add(link.id);
    proof(link.flowProof);
    proof(link.enclosureProof);
    conductance(link.conductanceMolesPerSecondPa);
    demand(
      link.kind === "vent" || link.kind === "traversal",
      "unsupported aperture link",
    );
    const endpoints = [link.a, link.b].map((e) => {
      demand(
        validId(e.id) && !endpointIds.has(e.id) && !linked.has(e.surfaceId),
        "duplicate aperture endpoint or consumed surface",
      );
      endpointIds.add(e.id);
      linked.add(e.surfaceId);
      proof(e.coverageProof);
      const s = surfaceById.get(e.surfaceId);
      demand(
        s && (s.kind === "floor" || s.kind === "roof") && !coverage.has(s.id),
        "aperture requires exclusive floor/roof surface coverage",
      );
      const cell = geometry.cells.find((c) => c.id === s.a)!;
      demand(
        e.aperturePlaneUnits ===
          (s.kind === "floor" ? cell.bottomUnits : cell.topUnits),
        "aperture plane does not match its covered surface",
      );
      demand(
        Array.isArray(e.aperturePolygonUnits) &&
          e.aperturePolygonUnits.length >= 3 &&
          e.aperturePolygonUnits.length <= 8 &&
          e.aperturePolygonUnits.every(
            (p) => p.length === 2 && p.every(Number.isFinite),
          ),
        "bounded aperture polygon required",
      );
      const poly = canonicalPolygon(e.aperturePolygonUnits);
      demand(
        poly.every(
          (p, i) =>
            cross(p, poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]) >
              0 && inside(p, cell.polygonUnits, true),
        ),
        "aperture must be convex and contained by its surface",
      );
      for (let i = 0; i < poly.length; i++)
        for (let j = i + 1; j < poly.length; j++)
          demand(
            !properCross(
              poly[i],
              poly[(i + 1) % poly.length],
              poly[j],
              poly[(j + 1) % poly.length],
            ),
            "aperture polygon self-intersection",
          );
      seal(e.remainingSurfaceSeal);
      return s;
    });
    demand(
      JSON.stringify(canonicalPolygon(link.a.aperturePolygonUnits)) ===
        JSON.stringify(canonicalPolygon(link.b.aperturePolygonUnits)),
      "paired apertures must share the same planar footprint",
    );
    const [a, b] = endpoints;
    demand(
      a.a !== b.a && a.deckId !== b.deckId && a.kind !== b.kind,
      "cross-deck apertures require distinct paired floor/roof endpoints",
    );
    const ca = geometry.cells.find((c) => c.id === a.a)!,
      cb = geometry.cells.find((c) => c.id === b.a)!;
    demand(
      a.kind === "roof"
        ? ca.topUnits <= cb.bottomUnits
        : cb.topUnits <= ca.bottomUnits,
      "cross-deck aperture direction is vertically incompatible",
    );
    add(
      a,
      {
        kind: "flow",
        conductanceMolesPerSecondPa: link.conductanceMolesPerSecondPa,
        sourceDefinitionId: link.flowProof.sourceDefinitionId,
      },
      b.a,
      `l:${digest([instanceId, link.id])}`,
    );
  }
  const usedOpenings = new Set<string>();
  for (const s of geometry.surfaces) {
    if (linked.has(s.id)) continue;
    if (s.kind === "continuous") {
      demand(
        !coverage.has(s.id),
        "continuous interior does not accept invented wall coverage",
      );
      add(s, { kind: "continuous" });
      continue;
    }
    if (s.kind === "opening") {
      const o = openings.get(s.openingId!);
      demand(o, "opening flow contract required");
      proof(o.coverageProof);
      proof(o.flowProof);
      usedOpenings.add(o.openingId);
      demand(!coverage.has(s.id), "opening has competing solid coverage");
      conductance(o.openConductance);
      conductance(o.closedConductance);
      demand(
        typeof o.open === "boolean" &&
          o.openConductance > 0 &&
          o.openConductance >= o.closedConductance,
        "invalid opening flow state",
      );
      if (o.closure === "ungasketed")
        demand(
          o.closedConductance > 0 && !o.seal,
          "ungasketed door must retain closed leakage, no airtight claim",
        );
      else {
        demand(o.closure === "verified-seal", "unknown closure interface");
        seal(o.seal!);
        demand(
          o.seal!.proof.sourceSha256 !==
            "4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426",
          "native boundary r001 is ungasketed; an independent verified seal artifact is required",
        );
      }
      add(s, {
        kind: "flow",
        conductanceMolesPerSecondPa:
          (o.open ? o.openConductance : o.closedConductance) *
          s.openingFraction!,
        sourceDefinitionId: o.flowProof.sourceDefinitionId,
      });
      continue;
    }
    const c = coverage.get(s.id);
    demand(c, "missing explicit surface coverage");
    proof(c.coverageProof);
    coverage.delete(s.id);
    if (c.kind === "sealed") {
      seal(c.seal);
      add(s, { kind: "sealed", pressureDefinitionId: c.seal.interfaceId });
    } else {
      demand(
        c.kind === "vacuum" && s.b === null,
        "vacuum must be an exterior surface",
      );
      proof(c.flowProof);
      conductance(c.conductanceMolesPerSecondPa);
      demand(
        c.conductanceMolesPerSecondPa > 0,
        "exterior opening must have positive flow",
      );
      add(s, {
        kind: "flow",
        conductanceMolesPerSecondPa: c.conductanceMolesPerSecondPa,
        sourceDefinitionId: c.flowProof.sourceDefinitionId,
      });
    }
  }
  demand(
    coverage.size === 0 && usedOpenings.size === openings.size,
    "unused or unknown pressure contracts",
  );
  const result: PressureStructure = { cells: structure.cells, boundaries };
  return {
    geometry,
    structure: result,
    topology: compilePressureTopology(result),
  };
}
