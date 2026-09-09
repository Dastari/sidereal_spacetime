import { CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES as pinnedKit } from "@sidereal/content/construction-boundary-family";
import type { DeckObstacle } from "./construction-collision";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import { transformPoint } from "@sidereal/content/ship-layout";
import { compileLayout } from "./layout-compiler";
import { readLayout } from "./layout-validation";
import {
  comparePoint,
  compareText,
  onSegment,
  properCross,
  segmentKey,
  pointKey,
} from "./layout-geometry";

/** Exact declared kit grammar. A parent must pin and validate the native interfaces;
 * matching these signatures alone does not certify pressure or arbitrary mesh fit. */
export interface NativeBoundaryGrammar {
  nodeSignatures: readonly {
    partId: string;
    rays: readonly Point[];
    cutbackM: number;
  }[];
  spanSignatures: readonly {
    partId: string;
    deltaUnits: Point;
    startCutbackM: number;
    endCutbackM: number;
  }[];
}
export interface FamilySegment {
  a: Point;
  b: Point;
}
export interface FamilyPlacement {
  key: string;
  partId: string;
  originUnits: Point;
  quarterTurns: number;
  kind: "node" | "span";
  aUnits?: Point;
  bUnits?: Point;
}
const equal = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error("Native boundary family: " + message);
}
function primitive(p: Point): Point {
  let a = Math.abs(p[0]),
    b = Math.abs(p[1]);
  while (b) [a, b] = [b, a % b];
  return [p[0] / a, p[1] / a];
}
const raysKey = (rays: readonly Point[]) =>
  JSON.stringify([...rays].sort(comparePoint));
const validPoint = (p: Point) =>
  p.length === 2 &&
  p.every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 8192);
/** Match a bounded, already semantic structural graph. T endpoints split existing
 * segments; proper crossings reject. No inferred mirror, scale or fallback part.
 * Module seams supplied by the layout remain explicit, preserving placement identity. */
export function matchNativeBoundaryFamily(
  input: readonly FamilySegment[],
  grammar: NativeBoundaryGrammar,
): FamilyPlacement[] {
  demand(input.length > 0 && input.length <= 512, "segment work budget");
  demand(
    grammar.nodeSignatures.length <= 128 &&
      grammar.spanSignatures.length <= 512,
    "grammar work budget",
  );
  const partIds = new Set<string>();
  for (const row of [...grammar.nodeSignatures, ...grammar.spanSignatures]) {
    demand(
      typeof row.partId === "string" &&
        row.partId.length > 0 &&
        row.partId.length <= 128 &&
        !partIds.has(row.partId),
      "invalid or duplicate grammar part",
    );
    partIds.add(row.partId);
  }
  const signatureKeys = new Set<string>();
  for (const node of grammar.nodeSignatures) {
    demand(
      node.rays.length >= 2 &&
        node.rays.length <= 3 &&
        node.rays.every(
          (p) => validPoint(p) && !equal(p, [0, 0]) && equal(primitive(p), p),
        ),
      "invalid primitive rays",
    );
    demand(
      Number.isFinite(node.cutbackM) && node.cutbackM > 0 && node.cutbackM <= 2,
      "invalid node cutback",
    );
    demand(
      new Set(node.rays.map(pointKey)).size === node.rays.length,
      "duplicate node ray",
    );
    const signature = raysKey(node.rays);
    demand(!signatureKeys.has(signature), "duplicate node signature");
    signatureKeys.add(signature);
  }
  for (const span of grammar.spanSignatures) {
    demand(
      validPoint(span.deltaUnits) && !equal(span.deltaUnits, [0, 0]),
      "invalid span delta",
    );
    demand(
      [span.startCutbackM, span.endCutbackM].every(
        (n) => Number.isFinite(n) && n > 0 && n <= 2,
      ) &&
        Math.hypot(...span.deltaUnits) / 32 >
          span.startCutbackM + span.endCutbackM,
      "invalid span cutback",
    );
  }
  const raw = new Map<string, FamilySegment>();
  for (const s of input) {
    demand(
      validPoint(s.a) && validPoint(s.b) && !equal(s.a, s.b),
      "invalid lattice segment",
    );
    const [a, b] = comparePoint(s.a, s.b) < 0 ? [s.a, s.b] : [s.b, s.a];
    raw.set(segmentKey(a, b), { a: [...a], b: [...b] });
  }
  const sources = [...raw.values()].sort(
    (a, b) => comparePoint(a.a, b.a) || comparePoint(a.b, b.b),
  );
  const endpoints = [
    ...new Map(
      sources.flatMap((s) => [s.a, s.b]).map((p) => [pointKey(p), p]),
    ).values(),
  ];
  for (let i = 0; i < sources.length; i++)
    for (let j = i + 1; j < sources.length; j++)
      demand(
        !properCross(sources[i].a, sources[i].b, sources[j].a, sources[j].b),
        "crossing requires an explicitly supported junction",
      );
  const split = new Map<string, FamilySegment>();
  for (const s of sources) {
    const points = endpoints
      .filter((p) => onSegment(p, s.a, s.b))
      .sort(comparePoint);
    for (let i = 1; i < points.length; i++)
      split.set(segmentKey(points[i - 1], points[i]), {
        a: points[i - 1],
        b: points[i],
      });
  }
  demand(split.size <= 1024, "split segment work budget");
  const segments = [...split.values()].sort(
    (a, b) => comparePoint(a.a, b.a) || comparePoint(a.b, b.b),
  );
  const nodes = new Map<string, { point: Point; rays: Map<string, Point> }>();
  for (const s of segments)
    for (const [p, other] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      const ray = primitive([other[0] - p[0], other[1] - p[1]]),
        key = pointKey(p),
        node = nodes.get(key) ?? { point: p, rays: new Map<string, Point>() };
      node.rays.set(pointKey(ray), ray);
      nodes.set(key, node);
    }
  const placements: FamilyPlacement[] = [],
    cutbacks = new Map<string, number>();
  for (const [key, node] of [...nodes.entries()].sort((a, b) =>
    compareText(a[0], b[0]),
  )) {
    const wanted = raysKey([...node.rays.values()]);
    let selected:
      { partId: string; quarterTurns: number; cutbackM: number } | undefined;
    for (const signature of grammar.nodeSignatures)
      for (let q = 0; q < 4; q++)
        if (raysKey(signature.rays.map((p) => transformPoint(p, q))) === wanted)
          selected ??= {
            partId: signature.partId,
            quarterTurns: q,
            cutbackM: signature.cutbackM,
          };
    demand(selected, "unsupported node rays at " + key);
    cutbacks.set(key, selected.cutbackM);
    placements.push({
      key: "node:" + key,
      partId: selected.partId,
      originUnits: [...node.point],
      quarterTurns: selected.quarterTurns,
      kind: "node",
    });
  }
  for (const s of segments) {
    let selected: FamilyPlacement | undefined;
    for (const [a, b] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      const delta: Point = [b[0] - a[0], b[1] - a[1]],
        start = cutbacks.get(pointKey(a))!,
        end = cutbacks.get(pointKey(b))!;
      for (const signature of grammar.spanSignatures)
        if (signature.startCutbackM === start && signature.endCutbackM === end)
          for (let q = 0; q < 4; q++)
            if (equal(transformPoint(signature.deltaUnits, q), delta))
              selected ??= {
                key: "span:" + segmentKey(s.a, s.b),
                partId: signature.partId,
                originUnits: [...a],
                quarterTurns: q,
                kind: "span",
                aUnits: [...a],
                bUnits: [...b],
              };
    }
    demand(
      selected,
      "unsupported exact span/end profiles " + segmentKey(s.a, s.b),
    );
    placements.push(selected);
  }
  return placements.sort((a, b) => compareText(a.key, b.key));
}

/** First layout adapter admits closed boundary families only. Openings need the
 * separately validated frame reservation/sweep adapter; fittings need native
 * obstruction contracts. Neither is silently overdrawn by a wall. */
export function planBoundaryFamilyLayout(
  input: LayoutDocument,
  deckId: string,
  grammar: NativeBoundaryGrammar,
) {
  const document = readLayout(input),
    deck = document.decks.find((d) => d.id === deckId);
  demand(
    deck && deck.ceiling === 96,
    "known deck and exact ceiling96 required",
  );
  demand(
    !document.openings.some((o) => o.deckId === deckId),
    "door/frame adapter required for openings",
  );
  demand(
    !document.fittings.some((f) => f.deckId === deckId) &&
      !document.assembly?.parts.length,
    "native fitting obstruction adapter required",
  );
  const partitions = document.partitions.filter((p) => p.deckId === deckId);
  demand(
    partitions.every((p) => p.seal === "design-sealed"),
    "open divider has no matching native family",
  );
  const compiled = compileLayout(document);
  demand(compiled.valid, "invalid semantic layout");
  const segments = [
    ...compiled.walls.filter(
      (w) => w.deckId === deckId && w.source === "perimeter",
    ),
    ...partitions,
  ].map(({ a, b }) => ({ a, b }));
  return {
    deckId,
    elevationUnits: deck.elevation,
    layoutFingerprint: compiled.fingerprint,
    placements: matchNativeBoundaryFamily(segments, grammar),
    pressureApproved: false as const,
    damageApproved: false as const,
  };
}

const pinnedGrammar: NativeBoundaryGrammar = {
  nodeSignatures: pinnedKit.grammar.nodeSignatures.map((n) => ({
    ...n,
    rays: n.rays.map((p) => [p[0], p[1]] as Point),
  })),
  spanSignatures: pinnedKit.grammar.spanSignatures.map((s) => ({
    ...s,
    deltaUnits: [s.deltaUnits[0], s.deltaUnits[1]],
  })),
};
export function planPinnedBoundaryFamily(
  input: LayoutDocument,
  deckId: string,
) {
  const plan = planBoundaryFamilyLayout(input, deckId, pinnedGrammar);
  return {
    ...plan,
    placements: plan.placements.map((p) => ({
      ...p,
      key: deckId + ":" + p.key,
    })),
  };
}
/** Exact pinned structural cores, including acute miter extents. Decoration outside
 * the .09375m structural core is intentionally excluded by the authored proxy.
 * Actor radius is applied by the collision solver, never baked into this geometry. */
export function pinnedFamilyCollision(
  input: LayoutDocument,
  deckId: string,
): DeckObstacle[] {
  const plan = planPinnedBoundaryFamily(input, deckId);
  return plan.placements.flatMap((p) => {
    const definition = pinnedKit.parts.find((d) => d.id === p.partId)!;
    demand(
      definition.collision.bottomM === 0.1875 &&
        definition.collision.topM === 3,
      "unsupported native collision height",
    );
    return definition.collision.convexPolygonsM.map((polygon, i) => ({
      id: "family:" + p.key + ":" + i,
      definitionId: "native-boundary-r004-core",
      vertices: polygon.map((v) => {
        const q = transformPoint([v[0], v[1]], p.quarterTurns);
        return [
          q[0] + p.originUnits[0] / 32,
          q[1] + p.originUnits[1] / 32,
        ] as Point;
      }),
    }));
  });
}
