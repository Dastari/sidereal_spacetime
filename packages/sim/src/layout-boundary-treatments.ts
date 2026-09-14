import type { BoundaryTreatmentOverride } from "@sidereal/content/layout-boundary-treatments";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import type {
  LayoutDiagnostic,
  LayoutWall,
  CompiledLayout,
} from "./layout-compiler";

import {
  segmentSupported,
  area2,
  comparePoint,
  compareText,
  cross,
  inside,
  onSegment,
  pointKey,
  properCross,
  segmentKey,
} from "./layout-geometry";

export interface ResolvedBoundaryTreatment {
  schema: "sidereal.boundary-treatment-resolution.v1";
  intent: BoundaryTreatmentOverride["treatment"];
  overrideId: string | null;
  heightUnits: number;
  floorThicknessUnits: number;
  /** Normalized relative to the resolved wall's a→b direction. */
  reservationSide?: BoundaryTreatmentOverride["reservationSide"];
  native?: BoundaryTreatmentOverride["native"];
  /** A native reference is not physical qualification. */
  qualification: "pending";
}

/** Resolve intent on existing graph spans, never by nearest-edge search. */
export function resolveBoundaryTreatments(
  doc: LayoutDocument,
  topology: CompiledLayout,
): void {
  const config = doc.structure;
  if (config?.schema !== "sidereal.layout-structure.v2") return;
  let emitted = 0;
  const issue = (code: string, ids: string[], message: string) => {
    emitted++;
    if (emitted > 256) {
      if (emitted === 257)
        topology.diagnostics.push({
          severity: "error",
          code: "treatment-diagnostic-budget",
          ids: [],
          message:
            "Additional boundary diagnostics omitted; the complete authored document is preserved.",
        });
      return;
    }
    topology.diagnostics.push({
      severity: "error",
      code,
      ids: [...ids].sort(compareText).slice(0, 64),
      message:
        message +
        (ids.length > 64
          ? ` (${ids.length - 64} additional source IDs omitted.)`
          : ""),
    } satisfies LayoutDiagnostic);
  };
  const profiles = new Map(config.deckProfiles.map((p) => [p.deckId, p]));
  const decks = new Map(doc.decks.map((d) => [d.id, d]));
  for (const p of config.deckProfiles)
    if (!decks.has(p.deckId))
      issue(
        "profile-deck",
        [p.deckId],
        "Deck profile references a missing deck.",
      );
  for (const d of doc.decks) {
    const p = profiles.get(d.id);
    if (!p) {
      issue(
        "profile-missing",
        [d.id],
        "Every structural deck requires an explicit vertical profile.",
      );
      continue;
    }
    if (d.ceiling !== p.floorThickness + p.clearHeight)
      issue(
        "profile-ceiling",
        [d.id],
        "Deck ceiling must equal floor thickness plus clear height above its bottom datum.",
      );
    if (d.elevation + p.pitch > config.hull.origin[2] + config.hull.height)
      issue(
        "profile-envelope",
        [d.id],
        "The full floor, clear height, roof and service reservation exceeds the hull height.",
      );
    for (const other of doc.decks) {
      if (compareText(d.id, other.id) >= 0) continue;
      const q = profiles.get(other.id);
      if (
        q &&
        Math.max(d.elevation, other.elevation) <
          Math.min(d.elevation + p.pitch, other.elevation + q.pitch)
      )
        issue(
          "profile-overlap",
          [d.id, other.id],
          "Full deck reservations overlap.",
        );
    }
  }
  const spans = topology.walls;
  // Bound work before matching overrides to potentially split source spans.
  if (spans.length * config.boundaryTreatments.length > 1048576) {
    issue(
      "treatment-budget",
      [],
      "Boundary-treatment matching budget exceeded.",
    );
    topology.walls = [];
    return;
  }
  let coverageWork = 0;
  for (const o of config.boundaryTreatments) {
    const p = profiles.get(o.deckId);
    if (!p || (o.heightUnits !== undefined && o.heightUnits > p.clearHeight))
      issue(
        "treatment-height",
        [o.id],
        "Treatment requires an existing deck profile and cannot exceed its clear height.",
      );
    const matches = spans.filter(
      (w) =>
        w.deckId === o.deckId &&
        w.source === o.source &&
        w.anchorId === o.sourceAnchorId &&
        cross(o.a, o.b, w.a) === 0 &&
        cross(o.a, o.b, w.b) === 0,
    );
    const points = [
      o.a,
      o.b,
      ...matches
        .flatMap((w) => [w.a, w.b])
        .filter((p) => onSegment(p, o.a, o.b)),
    ].sort(comparePoint);
    coverageWork += points.length * matches.length;
    if (coverageWork > 1048576) {
      issue(
        "treatment-budget",
        [],
        "Boundary-treatment source-coverage budget exceeded.",
      );
      topology.walls = [];
      return;
    }
    if (
      !matches.length ||
      points.slice(1).some((b, i) => {
        const a = points[i];
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return !matches.some((w) => onSegment(mid, w.a, w.b));
      })
    )
      issue(
        "treatment-orphan",
        [o.id],
        "Treatment source or exact geometric coverage changed; explicitly remap or remove the preserved override.",
      );
  }
  let intervalWork = 0;
  const resolved: LayoutWall[] = [];
  for (const w of topology.walls) {
    const overrides = config.boundaryTreatments.filter(
      (o) =>
        o.deckId === w.deckId &&
        o.source === w.source &&
        o.sourceAnchorId === w.anchorId &&
        cross(w.a, w.b, o.a) === 0 &&
        cross(w.a, w.b, o.b) === 0,
    );
    const cuts = [
      ...new Map(
        [
          w.a,
          w.b,
          ...overrides
            .flatMap((o) => [o.a, o.b])
            .filter((p) => onSegment(p, w.a, w.b)),
        ].map((p) => [pointKey(p), p]),
      ).values(),
    ].sort(comparePoint);
    intervalWork += cuts.length * Math.max(1, overrides.length);
    if (intervalWork > 1048576 || resolved.length + cuts.length > 8192) {
      issue(
        "treatment-budget",
        [],
        "Boundary-treatment interval budget exceeded.",
      );
      topology.walls = [];
      return;
    }
    if (comparePoint(w.a, w.b) > 0) cuts.reverse();
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1],
        b = cuts[i],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const selected = overrides.filter((o) => onSegment(mid, o.a, o.b));
      if (selected.length > 1)
        issue(
          "treatment-conflict",
          selected.map((o) => o.id),
          "Multiple overrides claim the same boundary interval.",
        );
      const o = selected.length === 1 ? selected[0] : undefined,
        p = profiles.get(w.deckId);
      let reservationSide = o?.reservationSide;
      if (
        w.source === "partition" &&
        !reservationSide &&
        o?.treatment !== "open" &&
        o?.treatment !== "open-bay"
      )
        issue(
          "partition-reservation-missing",
          [w.anchorId],
          "Choose an explicit left, right or centered internal reservation; logical room boundaries do not choose physical wall placement.",
        );
      if (
        o &&
        reservationSide &&
        reservationSide !== "center" &&
        (o.b[0] - o.a[0]) * (b[0] - a[0]) + (o.b[1] - o.a[1]) * (b[1] - a[1]) <
          0
      )
        reservationSide = reservationSide === "left" ? "right" : "left";
      resolved.push({
        ...w,
        key: `${w.key}:treatment:${segmentKey(a, b)}`,
        a,
        b,
        treatment: {
          schema: "sidereal.boundary-treatment-resolution.v1",
          intent: o?.treatment ?? "auto",
          overrideId: o?.id ?? null,
          heightUnits: o?.heightUnits ?? p?.clearHeight ?? 0,
          floorThicknessUnits: p?.floorThickness ?? 0,
          ...(reservationSide ? { reservationSide } : {}),
          ...(o?.native ? { native: o.native } : {}),
          qualification: "pending",
        },
      });
    }
  }
  topology.walls = resolved;
  let work = 0;
  for (const n of config.navigationReservations) {
    const tiles = topology.tiles.filter((t) => t.deckId === n.deckId),
      vertices = n.vertices;
    const holes = topology.loops.filter(
      (l) => l.deckId === n.deckId && l.kind === "hole",
    );
    work +=
      tiles.reduce((sum, t) => sum + t.vertices.length, 0) * vertices.length +
      holes.reduce((sum, l) => sum + l.points.length * vertices.length * 8, 0);
    if (work > 1048576) {
      issue("navigation-budget", [], "Navigation support budget exceeded.");
      break;
    }
    // Convex reservations are the initial supported family; split concave areas explicitly.
    const sign = Math.sign(area2(vertices));
    const convex =
      sign !== 0 &&
      vertices.every((a, i) =>
        vertices.every(
          (p, j) =>
            j === i ||
            j === (i + 1) % vertices.length ||
            sign * cross(a, vertices[(i + 1) % vertices.length], p) > 0,
        ),
      );
    if (!convex) {
      issue(
        "navigation-polygon",
        [n.id],
        "Navigation reservation must be a nondegenerate convex polygon.",
      );
      continue;
    }
    if (
      !decks.has(n.deckId) ||
      !vertices.every((a, i) =>
        segmentSupported(a, vertices[(i + 1) % vertices.length], tiles),
      ) ||
      holes.some((l) => polygonsOverlapHole(vertices, l.points))
    )
      issue(
        "navigation-support",
        [n.id],
        "Navigation reservation must stay on structural floor coverage.",
      );
  }
  topology.diagnostics.push({
    severity: "warning",
    code: "treatments-unqualified",
    ids: [],
    message:
      "Boundary treatments and navigation reservations are authored intent; native collision, clearance and enclosure adapters are not yet qualified.",
  });
}

/** Convex reservation against a simple (possibly concave) hole; edge contact is legal. */
function polygonsOverlapHole(vertices: Point[], hole: Point[]): boolean {
  const mids = (poly: Point[]): Point[] =>
    poly.map((a, i) => [
      (a[0] + poly[(i + 1) % poly.length][0]) / 2,
      (a[1] + poly[(i + 1) % poly.length][1]) / 2,
    ]);
  if (
    [...hole, ...mids(hole)].some((p) => inside(p, vertices, false)) ||
    [...vertices, ...mids(vertices)].some((p) => inside(p, hole, false))
  )
    return true;
  if (
    vertices.some((a, i) =>
      hole.some((b, j) =>
        properCross(
          a,
          vertices[(i + 1) % vertices.length],
          b,
          hole[(j + 1) % hole.length],
        ),
      ),
    )
  )
    return true;
  // Coincident boundaries have no strictly contained vertices or proper crossings.
  const center: Point = [
    vertices.reduce((sum, p) => sum + p[0], 0) / vertices.length,
    vertices.reduce((sum, p) => sum + p[1], 0) / vertices.length,
  ];
  return inside(center, hole, false);
}
