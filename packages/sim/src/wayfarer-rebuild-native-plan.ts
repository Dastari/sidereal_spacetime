import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import {
  CONSTRUCTION_INSET_VISUALS,
  CONSTRUCTION_INSET_VISUAL_PIN,
} from "@sidereal/content/construction-inset-visuals";
import { compileLayout, type LayoutWall } from "./layout-compiler";
import { inside } from "./layout-geometry";
import {
  planInsetNativeBoundary,
  type AdditionalInsetNativeShape,
} from "./layout-inset-native-plan";

export interface WayfarerNativePlacement {
  key: string;
  family: string;
  profileId: string;
  nativeKey: string;
  sha256: string;
  quarterHeight: 4;
  originUnits: [number, number, number];
  quarterTurns: 0 | 1 | 2 | 3;
  polygonUnits: Point[];
  minZM: number;
  maxZM: number;
}
const cellKey = (x: number, y: number) => `${x},${y}`;
const compare = (a: Point, b: Point) => a[1] - b[1] || a[0] - b[0];
const profiles = CONSTRUCTION_INSET_VISUALS.parts
  .filter(
    (p) =>
      p.kind === "wall" &&
      p.quarterHeight === 4 &&
      p.heightM === 3 &&
      /^(internal-r000|union-r001)\/internal-span-/.test(p.key),
  )
  .map((p) => ({
    ...p,
    length: Math.max(...p.footprintM.map((v) => v[0])) * 32,
  }))
  .filter(
    (p) =>
      p.length > 0 &&
      p.length % 8 === 0 &&
      JSON.stringify(p.footprintM) ===
        JSON.stringify([
          [0, -0.125],
          [p.length / 32, -0.125],
          [p.length / 32, 0.125],
          [0, 0.125],
        ]),
  )
  .sort((a, b) => b.length - a.length || a.key.localeCompare(b.key));

/** Bounded exact strip-union adapter. Authored straight meshes are only translated
 * and quarter-turned; the nominal reservation is a separate collision proxy.
 * It deliberately supplies no cockpit, pressure, strength, or flight qualification. */
export function planWayfarerOpaqueNative(input: {
  walls: readonly LayoutWall[];
  floorPolygons: readonly Point[][];
  elevationUnits: number;
}) {
  const issues: string[] = [];
  const placements: WayfarerNativePlacement[] = [];
  const target = new Map<string, Point>();
  const fail = (message: string) => {
    issues.push(message);
    return {
      ok: false as const,
      placements: [],
      issues,
      occupiedCellCount: 0,
      physicalQualification: "unqualified" as const,
      nativePin: CONSTRUCTION_INSET_VISUAL_PIN,
    };
  };
  if (
    input.walls.length > 1024 ||
    input.floorPolygons.length > 1024 ||
    !Number.isSafeInteger(input.elevationUnits)
  )
    return fail("Unsupported work budget or deck elevation");
  if (
    input.floorPolygons.some(
      (p) =>
        p.length < 3 ||
        p.length > 256 ||
        p.some((v) =>
          v.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 8192),
        ),
    )
  )
    return fail("Invalid structural floor polygon");
  for (const wall of [...input.walls].sort((a, b) =>
    a.key.localeCompare(b.key),
  )) {
    const t = wall.treatment;
    if (
      !t ||
      t.heightUnits !== 96 ||
      t.floorThicknessUnits !== 6 ||
      t.native ||
      !["auto", "vertical-hull", "bulkhead"].includes(t.intent) ||
      (wall.a[0] !== wall.b[0] && wall.a[1] !== wall.b[1]) ||
      [...wall.a, ...wall.b].some(
        (n) => !Number.isSafeInteger(n) || Math.abs(n) > 8192 || n % 8 !== 0,
      )
    )
      return fail(`Unsupported opaque wall ${wall.key}`);
    const dx = Math.sign(wall.b[0] - wall.a[0]),
      dy = Math.sign(wall.b[1] - wall.a[1]);
    if (!dx && !dy) return fail(`Empty wall ${wall.key}`);
    const side = wall.source === "perimeter" ? "left" : t.reservationSide;
    if (side !== "left" && side !== "right")
      return fail(
        `Only explicit one-sided partition reservations supported: ${wall.key}`,
      );
    const sign = side === "left" ? 1 : -1;
    const nx = -dy * sign * 8,
      ny = dx * sign * 8;
    const x0 = Math.min(wall.a[0], wall.b[0], wall.a[0] + nx, wall.b[0] + nx);
    const y0 = Math.min(wall.a[1], wall.b[1], wall.a[1] + ny, wall.b[1] + ny);
    const x1 = Math.max(wall.a[0], wall.b[0], wall.a[0] + nx, wall.b[0] + nx);
    const y1 = Math.max(wall.a[1], wall.b[1], wall.a[1] + ny, wall.b[1] + ny);
    for (let x = x0; x < x1; x += 8)
      for (let y = y0; y < y1; y += 8) {
        target.set(cellKey(x, y), [x, y]);
        if (target.size > 8192) return fail("Wall cell budget exceeded");
      }
  }
  // Every structural floor used here is orthogonal within the occupied wall
  // region. Four interior corner samples plus edge-crossing rejection prove
  // each occupied cell lies within a single tile, or an exact shared tile seam.
  const floorXs = new Set(
    input.floorPolygons.flatMap((p) => p.map((v) => v[0])),
  );
  const floorYs = new Set(
    input.floorPolygons.flatMap((p) => p.map((v) => v[1])),
  );
  for (const [x, y] of target.values()) {
    const xs = [
      x,
      ...[...floorXs].filter((v) => v > x && v < x + 8),
      x + 8,
    ].sort((a, b) => a - b);
    const ys = [
      y,
      ...[...floorYs].filter((v) => v > y && v < y + 8),
      y + 8,
    ].sort((a, b) => a - b);
    for (const floor of input.floorPolygons)
      for (let i = 0; i < floor.length; i++) {
        const a = floor[i],
          b = floor[(i + 1) % floor.length];
        if (
          a[0] !== b[0] &&
          a[1] !== b[1] &&
          Math.max(a[0], b[0]) > x &&
          Math.min(a[0], b[0]) < x + 8 &&
          Math.max(a[1], b[1]) > y &&
          Math.min(a[1], b[1]) < y + 8
        )
          return fail("Diagonal floor support intersects an opaque wall cell");
      }
    for (let i = 1; i < xs.length; i++)
      for (let j = 1; j < ys.length; j++)
        if (
          !input.floorPolygons.some((p) =>
            inside(
              [(xs[i - 1] + xs[i]) / 2, (ys[j - 1] + ys[j]) / 2],
              p,
              false,
            ),
          )
        )
          return fail(
            `Native reservation leaves structural support at ${x},${y}`,
          );
  }
  const pending = new Map(target);
  while (pending.size) {
    const [x, y] = [...pending.values()].sort(compare)[0];
    let horizontal = 1,
      vertical = 1;
    while (pending.has(cellKey(x + 8 * horizontal, y))) horizontal++;
    while (pending.has(cellKey(x, y + 8 * vertical))) vertical++;
    const q = vertical > horizontal ? 1 : 0;
    const count = q ? vertical : horizontal;
    let offset = 0;
    while (offset < count * 8) {
      const p = profiles.find((p) => p.length <= count * 8 - offset);
      if (!p)
        return fail("No exact native straight profile for residual wall run");
      const origin: [number, number, number] = q
        ? [x + 4, y + offset, input.elevationUnits + 6]
        : [x + offset, y + 4, input.elevationUnits + 6];
      const polygon: Point[] = p.footprintM.map(([a, b]) =>
        q
          ? [origin[0] - b * 32, origin[1] + a * 32]
          : [origin[0] + a * 32, origin[1] + b * 32],
      );
      for (let u = offset; u < offset + p.length; u += 8)
        if (!pending.delete(cellKey(x + (q ? 0 : u), y + (q ? u : 0))))
          return fail("Overlapping native reservation decomposition");
      placements.push({
        key: `wayfarer:wall:${x},${y}:${q}:${offset}`,
        family: p.family,
        profileId: p.profileId,
        nativeKey: p.key,
        sha256: p.sha256,
        quarterHeight: 4,
        originUnits: origin,
        quarterTurns: q,
        polygonUnits: polygon,
        minZM: origin[2] / 32,
        maxZM: origin[2] / 32 + p.heightM,
      });
      offset += p.length;
    }
    if (placements.length > 2048)
      return fail("Native wall placement budget exceeded");
  }
  return {
    ok: true as const,
    placements,
    issues,
    occupiedCellCount: target.size,
    physicalQualification: "unqualified" as const,
    nativePin: CONSTRUCTION_INSET_VISUAL_PIN,
  };
}

const cockpitIds: Record<string, string[]> = {
  "cockpit:starboard-side": [
    "pilot-r004-hull-straight-07",
    "pilot-r004-canopy-side-08",
  ],
  "cockpit:port-side": [
    "pilot-r004-hull-straight-09",
    "pilot-r004-canopy-side-left-10",
  ],
  "cockpit:starboard-diagonal": [
    "pilot-r004-hull-diagonal45-11",
    "pilot-r004-canopy-diagonal45-12",
  ],
  "cockpit:port-diagonal": [
    "pilot-r004-hull-diagonal45-13",
    "pilot-r004-canopy-diagonal45-14",
  ],
  "cockpit:nose": ["pilot-r004-bow-transom-15", "pilot-r004-canopy-nose-16"],
};
/** Review adapter: retained cockpit surfaces are explicit substitutions, never
 * silently replaced by opaque slabs. Exact cockpit mating must be checked by
 * the candidate qualification adapter before game activation. */
export function reviewWayfarerRebuildNative(layout: LayoutDocument) {
  const compiled = compileLayout(layout);
  const cockpit = compiled.walls.filter(
    (w) => w.treatment?.intent === "cockpit-glass",
  );
  const deck = layout.decks.find((d) => d.id === layout.playableDeckId);
  const blockers: string[] = [];
  if (!compiled.valid || !deck || layout.decks.length !== 1)
    blockers.push("One valid playable deck required");
  if (cockpit.length !== 5)
    blockers.push("Five explicit cockpit substitutions required");
  const substitutions = cockpit.map((w) => {
    const ids = cockpitIds[w.treatment!.overrideId ?? ""] ?? [];
    const parts = ids.map((id) =>
      layout.assembly?.parts.find((p) => p.id === id),
    );
    if (ids.length !== 2 || parts.some((p) => !p))
      blockers.push(`Missing retained cockpit binding ${w.key}`);
    return { wallKey: w.key, a: w.a, b: w.b, partIds: ids };
  });
  const plan = planWayfarerOpaqueNative({
    walls: compiled.walls.filter(
      (w) => w.treatment?.intent !== "cockpit-glass",
    ),
    floorPolygons: compiled.tiles.map((t) => t.vertices),
    elevationUnits: deck?.elevation ?? 0,
  });
  if (!plan.ok) blockers.push(...plan.issues);
  return {
    ...plan,
    ok: plan.ok && blockers.length === 0,
    issues: blockers,
    cockpitSubstitutions: substitutions,
    integrationBlockers: [
      "Exact retained cockpit mating and collision proof required",
      "Internal straight profiles require new exterior and butt-junction interface qualification",
      "Exact native export bounds and game acceptance required",
    ],
    integrationReady: false as const,
  };
}

/** Use existing authored junction profiles via a rigid centerline representation
 * of the one-sided reservations. This is an exact-candidate adapter: the closed
 * main-body front is a proof fixture only and is never returned as ship art.
 * Missing filler spans or cockpit shoulder interfaces fail closed. */
export interface WayfarerAdditionalNativePart {
  key: "wayfarer-rebuild-r001/internal-span-0.125-q4";
  family: "wayfarer-rebuild-r001";
  profileId: "internal-span-0.125";
  footprintM: number[][];
  heightM: 3;
  sha256: string;
}
export function planWayfarerRebuildNative(
  layout: LayoutDocument,
  additionalPart?: WayfarerAdditionalNativePart,
) {
  const review = reviewWayfarerRebuildNative(layout);
  const compiled = compileLayout(layout);
  const original = compiled.walls.filter(
    (w) => w.treatment?.intent !== "cockpit-glass",
  );
  const walls: LayoutWall[] = original.map((w) => {
    const treatment = { ...w.treatment!, intent: "auto" as const };
    if (w.source === "perimeter") return { ...w, treatment };
    const side = treatment.reservationSide === "right" ? -1 : 1;
    const dx = Math.sign(w.b[0] - w.a[0]),
      dy = Math.sign(w.b[1] - w.a[1]);
    return {
      ...w,
      a: [w.a[0] - dy * side * 4, w.a[1] + dx * side * 4],
      b: [w.b[0] - dy * side * 4, w.b[1] + dx * side * 4],
      treatment: { ...treatment, reservationSide: "center" as const },
    };
  });
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.source !== "partition") continue;
    for (const endpoint of ["a", "b"] as const) {
      const p = original[i][endpoint];
      for (let j = 0; j < original.length; j++) {
        const v = original[j];
        if ((v.a[0] === v.b[0]) === (w.a[0] === w.b[0])) continue;
        if (
          p[0] >= Math.min(v.a[0], v.b[0]) &&
          p[0] <= Math.max(v.a[0], v.b[0]) &&
          p[1] >= Math.min(v.a[1], v.b[1]) &&
          p[1] <= Math.max(v.a[1], v.b[1])
        ) {
          if (w.a[0] === w.b[0]) w[endpoint][1] = walls[j].a[1];
          else w[endpoint][0] = walls[j].a[0];
        }
      }
    }
  }
  const deck = layout.decks.find((d) => d.id === layout.playableDeckId);
  const shoulderFixture: LayoutWall = {
    key: "wayfarer-proof-only-front",
    deckId: layout.playableDeckId,
    a: [96, 288],
    b: [-96, 288],
    source: "perimeter",
    anchorId: "proof-only",
    treatment: {
      schema: "sidereal.boundary-treatment-resolution.v1",
      intent: "auto",
      overrideId: null,
      heightUnits: 96,
      floorThicknessUnits: 6,
      qualification: "pending",
    },
  };
  const additionalShapes: AdditionalInsetNativeShape[] = additionalPart
    ? [
        {
          family: additionalPart.family,
          id: additionalPart.profileId,
          polygon: additionalPart.footprintM as Point[],
          length: 0.125,
        },
      ]
    : [];
  const fit = planInsetNativeBoundary({
    additionalShapes,
    walls: [...walls, shoulderFixture],
    deckId: layout.playableDeckId,
    elevationUnits: deck?.elevation ?? 0,
    floorThicknessUnits: 6,
    floorPolygons: [
      [
        [-160, -288],
        [160, -288],
        [160, 288],
        [-160, 288],
      ],
    ],
  });

  const issues = fit.issues.map((i) => `${i.key}: ${i.message}`);
  if (
    additionalPart &&
    (additionalPart.key !== "wayfarer-rebuild-r001/internal-span-0.125-q4" ||
      additionalPart.heightM !== 3 ||
      !/^[a-f0-9]{64}$/.test(additionalPart.sha256))
  )
    issues.push("Invalid additional native delivery metadata");
  if (!compiled.valid || !deck || layout.decks.length !== 1)
    issues.push("One valid playable deck required");
  const profile =
    layout.structure?.schema === "sidereal.layout-structure.v2"
      ? layout.structure.deckProfiles.find(
          (p) => p.deckId === layout.playableDeckId,
        )
      : undefined;
  if (
    !profile ||
    profile.floorThickness !== 6 ||
    profile.clearHeight !== 96 ||
    profile.roofThickness !== 4 ||
    profile.serviceVoid !== 6 ||
    profile.pitch !== 112
  )
    issues.push("Exact standard deck profile required");
  if (
    review.cockpitSubstitutions.length !== 5 ||
    review.cockpitSubstitutions.some(
      (s) =>
        s.partIds.length !== 2 ||
        s.partIds.some(
          (id) => !layout.assembly?.parts.some((p) => p.id === id),
        ),
    )
  )
    issues.push("Five retained cockpit substitutions required");
  if (
    original.some(
      (w) =>
        !w.treatment ||
        w.treatment.heightUnits !== 96 ||
        w.treatment.floorThicknessUnits !== 6 ||
        w.treatment.native ||
        !["auto", "bulkhead", "vertical-hull"].includes(w.treatment.intent) ||
        (w.source === "partition" &&
          !["left", "right"].includes(w.treatment.reservationSide ?? "")),
    )
  )
    issues.push("Unsupported opaque boundary treatment");
  const selected = fit.placements.filter(
    (p) =>
      !(
        p.key.startsWith("span:") &&
        p.originUnits[1] === 288 &&
        p.quarterTurns === 2
      ),
  );
  // Existing corner profiles finish at x=+-152. Two exact exterior spans fill
  // each remaining 56-unit shoulder; the center cockpit opening stays empty.
  for (const [name, start] of [
    ["starboard", 152],
    ["port", -96],
  ] as const) {
    let cursor = start;
    for (const [id, length] of [
      ["span-e2718d14114d", 36],
      ["span-42c2fafec189", 20],
    ] as const) {
      selected.push({
        key: `wayfarer:shoulder:${name}:${cursor}`,
        family: "convex-r004",
        profileId: id,
        quarterHeight: 4,
        originUnits: [cursor, 288, (deck?.elevation ?? 0) + 6],
        quarterTurns: 2,
      });
      cursor -= length;
    }
  }
  const placements: WayfarerNativePlacement[] = [];
  const obstacles: { id: string; definitionId: string; vertices: Point[] }[] =
    [];
  for (const placement of selected) {
    const nativeKey = placement.family + "/" + placement.profileId + "-q4";
    const part = [
      ...CONSTRUCTION_INSET_VISUALS.parts,
      ...(additionalPart ? [additionalPart] : []),
    ].find((p) => p.key === nativeKey);
    if (!part || part.heightM !== 3) {
      issues.push(`Missing full-height native profile ${nativeKey}`);
      continue;
    }
    const q = placement.quarterTurns as 0 | 1 | 2 | 3;
    const polygon: Point[] = part.footprintM.map(([x, y]) => {
      const r: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ] = [
        [x, y],
        [-y, x],
        [-x, -y],
        [y, -x],
      ];
      return [
        placement.originUnits[0] + r[q][0] * 32,
        placement.originUnits[1] + r[q][1] * 32,
      ];
    });
    placements.push({
      ...placement,
      quarterHeight: 4,
      quarterTurns: q,
      nativeKey,
      sha256: part.sha256,
      polygonUnits: polygon,
      minZM: placement.originUnits[2] / 32,
      maxZM: placement.originUnits[2] / 32 + 3,
    });
    const xs = [...new Set(polygon.map((p) => p[0]))].sort((a, b) => a - b),
      ys = [...new Set(polygon.map((p) => p[1]))].sort((a, b) => a - b);
    for (let x = 1; x < xs.length; x++)
      for (let y = 1; y < ys.length; y++)
        if (
          inside(
            [(xs[x - 1] + xs[x]) / 2, (ys[y - 1] + ys[y]) / 2],
            polygon,
            false,
          )
        )
          obstacles.push({
            id: `${placement.key}:cell:${x}:${y}`,
            definitionId: "wayfarer-rebuild-native-reservation",
            vertices: [
              [xs[x - 1] / 32, ys[y - 1] / 32],
              [xs[x] / 32, ys[y - 1] / 32],
              [xs[x] / 32, ys[y] / 32],
              [xs[x - 1] / 32, ys[y] / 32],
            ],
          });
  }
  const intended = original.map((w) => {
    const sign =
      w.source === "partition" && w.treatment!.reservationSide === "right"
        ? -1
        : 1;
    const nx = -Math.sign(w.b[1] - w.a[1]) * sign * 8,
      ny = Math.sign(w.b[0] - w.a[0]) * sign * 8;
    return [
      w.a,
      w.b,
      [w.b[0] + nx, w.b[1] + ny],
      [w.a[0] + nx, w.a[1] + ny],
    ] as Point[];
  });
  const all = [...intended, ...placements.map((p) => p.polygonUnits)];
  const xs = [...new Set(all.flatMap((p) => p.map((v) => v[0])))].sort(
      (a, b) => a - b,
    ),
    ys = [...new Set(all.flatMap((p) => p.map((v) => v[1])))].sort(
      (a, b) => a - b,
    );
  if (xs.length * ys.length * all.length > 8_000_000)
    issues.push("Union proof work budget exceeded");
  else
    outer: for (let x = 1; x < xs.length; x++)
      for (let y = 1; y < ys.length; y++) {
        const point: Point = [(xs[x - 1] + xs[x]) / 2, (ys[y - 1] + ys[y]) / 2];
        const count = placements.filter((p) =>
          inside(point, p.polygonUnits, false),
        ).length;
        if (count !== Number(intended.some((p) => inside(point, p, false)))) {
          issues.push(`Native union mismatch at ${point.join(",")}`);
          break outer;
        }
      }
  return {
    ok: issues.length === 0,
    placements: issues.length ? [] : placements,
    obstacles: issues.length ? [] : obstacles,
    nativeProfileKeys: [...new Set(placements.map((p) => p.nativeKey))].sort(),
    physicalQualification: "unqualified" as const,
    nativePin: CONSTRUCTION_INSET_VISUAL_PIN,
    issues,
    centerlineWalls: walls,
    junctionFixture: {
      placementCount: fit.placements.length,
      issues: fit.issues,
    },
    cockpitSubstitutions: review.cockpitSubstitutions,
    integrationBlockers: [
      "Exact retained cockpit transition mating and collision proof required",
      "Exact native export bounds and game acceptance required",
    ],
    integrationReady: false as const,
  };
}
