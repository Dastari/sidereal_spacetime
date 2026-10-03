/** Pure presentation compiler; never changes the prefab or its authority-derived data. */
import {
  G,
  TEXEL,
  hash01,
  insideOutline,
  insidePolygon,
  placedTilePolygon,
  placedTileSize,
  shapeTileLocalPolygon,
  type Pt,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import {
  bowGlass,
  bowHeights,
  tileWorld,
} from "@sidereal/content/bow-profiles";
import {
  canopySegments,
  deckVolume,
  deriveInterior,
  placeMount,
  placeMountTile,
  volumeGeometry,
  type DerivedInterior,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
  type VolumeGeometry,
} from "@sidereal/content/ship-prefab";
import { dressShip, tileFrame } from "./ship-dresser";

export type AuthoredTemplateMatrix = [number[], number[], number[], number[]];
/** World-author plane; keep n.x*x+n.y*y+n.z*z+d >= 0. */
export type AuthoredTemplateClipPlane = [number, number, number, number];
export interface AuthoredTemplateInstance {
  object: string;
  piece: string;
  role: "floor" | "roof" | "hull" | "wall" | "post" | "beam" | "glass";
  matrix: AuthoredTemplateMatrix;
  view: "both" | "deck" | "flight";
  region: string;
  clipPlanes?: AuthoredTemplateClipPlane[];
  /** Normalized source wall Z maps to these world-author affine height functions. */
  verticalProfile?: {
    bottom: [number, number, number];
    top: [number, number, number];
  };
}
export interface AuthoredTemplatePlan {
  instances: AuthoredTemplateInstance[];
  interiors: DerivedInterior[];
  /** Specialized moving door/inset glazing families with no native replacement yet. */
  retainedLegacyPieces: string[];
}
const EPS = 1e-6;
// The native facade's outermost authored detail, measured from the structural edge.
// Corner spans must reach the outside miter before their planes trim them.
const FACADE_OUTSIDE = 0.431;
const FACADE_INSIDE = 0.25;
const SEAM_WIDTH = 0.04;
const unit = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const onSegment = (p: Pt, a: Pt, b: Pt): boolean => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy;
  if (l2 < EPS * EPS) return false;
  const u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  return (
    u >= -EPS &&
    u <= 1 + EPS &&
    Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) <= EPS * Math.sqrt(l2)
  );
};
const plane = (n: Pt, p: Pt): AuthoredTemplateClipPlane => [
  n[0],
  n[1],
  0,
  -n[0] * p[0] - n[1] * p[1],
];
const rectPlanes = (x: number, y: number): AuthoredTemplateClipPlane[] => [
  [1, 0, 0, -x],
  [-1, 0, 0, x + 1],
  [0, 1, 0, -y],
  [0, -1, 0, y + 1],
];
function clipPolygon(poly: readonly Pt[], n: Pt, d: number): Pt[] {
  const next: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = n[0] * a[0] + n[1] * a[1] + d,
      db = n[0] * b[0] + n[1] * b[1] + d;
    if (da >= -1e-9) next.push(a);
    if (da >= -1e-9 !== db >= -1e-9) {
      const t = da / (da - db);
      next.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return next;
}
const area = (poly: readonly Pt[]) =>
  poly.reduce((sum, a, i) => {
    const b = poly[(i + 1) % poly.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
function cellPolygon(poly: readonly Pt[], x: number, y: number): Pt[] {
  let result = [...poly];
  for (const [nx, ny, , d] of rectPlanes(x, y))
    result = clipPolygon(result, [nx, ny], d);
  return result;
}
/** A positive-area tile/cell intersection; corner-only tests miss long thin slopes. */
const overlapsCell = (poly: readonly Pt[], x: number, y: number) =>
  Math.abs(area(cellPolygon(poly, x, y))) > EPS;
const polygonPlanes = (poly: readonly Pt[]): AuthoredTemplateClipPlane[] =>
  poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length],
      u = unit(a, b);
    return plane([-u[1], u[0]], a);
  });
function triangles(poly: readonly Pt[]): Pt[][] {
  const rest = area(poly) < 0 ? [...poly].reverse() : [...poly],
    out: Pt[][] = [];
  while (rest.length > 3) {
    let found = false;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[(i - 1 + rest.length) % rest.length],
        b = rest[i],
        c = rest[(i + 1) % rest.length];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < 1e-9)
        continue;
      const tri = [a, b, c];
      if (
        rest.some(
          (p, j) =>
            j !== i &&
            j !== (i - 1 + rest.length) % rest.length &&
            j !== (i + 1) % rest.length &&
            insidePolygon(tri, ...p),
        )
      )
        continue;
      out.push(tri);
      rest.splice(i, 1);
      found = true;
      break;
    }
    if (!found) {
      // Remove a collinear join introduced by clipping before retrying.
      const index = rest.findIndex((b, i) => {
        const a = rest[(i - 1 + rest.length) % rest.length],
          c = rest[(i + 1) % rest.length];
        return (
          Math.abs(
            (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
          ) < 1e-9
        );
      });
      if (index < 0)
        throw Error("Unable to partition authored surface footprint");
      rest.splice(index, 1);
    }
  }
  if (rest.length === 3 && Math.abs(area(rest)) > EPS) out.push(rest);
  return out;
}
function convexOverlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  let result = [...a];
  for (const [nx, ny, , d] of polygonPlanes(b))
    result = clipPolygon(result, [nx, ny], d);
  return Math.abs(area(result)) > EPS;
}
/** A convex subtraction emits disjoint convex fragments, each directly expressible as mesh clips. */
function subtractConvex(poly: readonly Pt[], cut: readonly Pt[]): Pt[][] {
  let inside = [...poly];
  const out: Pt[][] = [];
  for (const [nx, ny, , d] of polygonPlanes(cut)) {
    const outside = clipPolygon(inside, [-nx, -ny], -d);
    if (Math.abs(area(outside)) > EPS) out.push(outside);
    inside = clipPolygon(inside, [nx, ny], d);
    if (Math.abs(area(inside)) < EPS) break;
  }
  return out;
}
const variant = (doc: ShipPrefabDocumentV1, ...keys: (number | string)[]) =>
  ["a", "b", "c"][Math.floor(hash01(doc.id, ...keys) * 3)];
/** Coherent maintenance spine and sparse service fields, independent of tile iteration. */
const roofFinish = (
  doc: ShipPrefabDocumentV1,
  shape: string,
  x: number,
  y: number,
  centreY: number,
) => {
  const distance = Math.abs(y + 0.5 - centreY),
    fieldX = Math.floor(x / 4),
    fieldY = Math.floor(distance / 4),
    localX = ((x % 4) + 4) % 4,
    localY = Math.floor(distance) % 4,
    service = hash01(doc.id, "roof-service", fieldX, fieldY);
  if (shape === "square" && localX === 1 && localY === 1) {
    if (service < 0.28)
      return ["vent", "hatch", "fan", "box"][
        Math.floor(hash01(doc.id, "roof-module", fieldX, fieldY) * 4)
      ];
    if (service < 0.37) return "accent";
  }
  return distance <= 0.65 ? "plate" : "light";
};

/** Exact grammar tile transform, including reflection before quarter turns. */
export function authoredTemplateTileMatrix(
  t: ShapeTilePlacement,
  z = 0,
): AuthoredTemplateMatrix {
  const f = tileFrame(t),
    a = (t.rot * Math.PI) / 2,
    c = Math.round(Math.cos(a)),
    s = Math.round(Math.sin(a)),
    m = t.reflected ? -1 : 1;
  return [
    [c * m, -s, 0, f.x],
    [s * m, c, 0, f.y],
    [0, 0, 1, z],
    [0, 0, 0, 1],
  ];
}
const spanMatrix = (
  a: Pt,
  b: Pt,
  z: number,
  height: number,
  thickness = 1,
): AuthoredTemplateMatrix => {
  const u = unit(a, b);
  return [
    [b[0] - a[0], u[1] * thickness, 0, a[0]],
    [b[1] - a[1], -u[0] * thickness, 0, a[1]],
    [0, 0, height, z],
    [0, 0, 0, 1],
  ];
};
const affineHeights = (
  tile: ShapeTilePlacement,
  height: VolumeGeometry["volume"]["height"],
): { bottom: [number, number, number]; top: [number, number, number] } => {
  const a = bowHeights(tile, height, [0, 0]),
    b = bowHeights(tile, height, [1, 0]),
    c = bowHeights(tile, height, [0, 1]);
  return {
    bottom: [(b[0] - a[0]) * TEXEL, (c[0] - a[0]) * TEXEL, a[0] * TEXEL],
    top: [(b[1] - a[1]) * TEXEL, (c[1] - a[1]) * TEXEL, a[1] * TEXEL],
  };
};
const atHeight = (h: [number, number, number], p: Pt) =>
  h[0] * p[0] + h[1] * p[1] + h[2];
const horizontalMatrix = (
  tile: ShapeTilePlacement,
  h: [number, number, number],
): AuthoredTemplateMatrix => {
  const m = authoredTemplateTileMatrix(tile);
  m[2] = [
    h[0] * m[0][0] + h[1] * m[1][0],
    h[0] * m[0][1] + h[1] * m[1][1],
    1,
    atHeight(h, [m[0][3], m[1][3]]),
  ];
  return m;
};
const constant = (h: number): [number, number, number] => [0, 0, h];

/** Visible Z bands at a point just outside a volume. Other volumes occlude only their own Z. */
function exposedBands(
  g: VolumeGeometry,
  geoms: VolumeGeometry[],
  p: Pt,
  lo: number,
  hi: number,
  face?: { boundary: Pt; outward: Pt },
): [number, number][] {
  const hidden = geoms
    .flatMap((w, index) => {
      if (w === g || !w.outline) return [];
      const inside = insideOutline(w.outline, ...p);
      const coincident =
        face &&
        index < geoms.indexOf(g) &&
        [w.outline.outer, ...w.outline.holes].some((loop) =>
          loop.some((a, i) =>
            onSegment(face.boundary, a, loop[(i + 1) % loop.length]),
          ),
        ) &&
        insideOutline(
          w.outline,
          face.boundary[0] - face.outward[0] * 0.001,
          face.boundary[1] - face.outward[1] * 0.001,
        ) &&
        !insideOutline(
          w.outline,
          face.boundary[0] + face.outward[0] * 0.001,
          face.boundary[1] + face.outward[1] * 0.001,
        );
      if (!inside && !coincident) return [];
      // Exterior samples cannot distinguish coincident surfaces. The earlier
      // volume owns only its actual visible height, including its backing skirt.
      const offset = w.volume.deck * G.deck.pitchTexels * TEXEL;
      const low = coincident
        ? Math.max(
            0,
            w.z[0] - (w.volume.kind === "hull" ? G.tierRule.skirtTexels : 0),
          )
        : w.z[0];
      return [
        [low * TEXEL + offset, w.z[1] * TEXEL + offset] as [number, number],
      ];
    })
    .sort((a, b) => a[0] - b[0]);
  let bands: [number, number][] = [[lo, hi]];
  for (const [a, b] of hidden)
    bands = bands.flatMap(([x, y]) =>
      a >= y - EPS || b <= x + EPS
        ? [[x, y] as [number, number]]
        : [
            ...(a > x + EPS ? [[x, a] as [number, number]] : []),
            ...(b < y - EPS ? [[b, y] as [number, number]] : []),
          ],
    );
  return bands;
}

export function compileAuthoredTemplatePlan(
  doc: ShipPrefabDocumentV1,
  options: { catalog: PrefabComponentCatalog },
): AuthoredTemplatePlan {
  if (doc.authoredGameplay)
    throw Error("Exact authored gameplay profiles use their own presentation");
  const geoms = doc.volumes.map(volumeGeometry).filter((g) => g.outline);
  const interiors = doc.decks.map(({ index }) =>
    deriveInterior(doc, index, options.catalog),
  );
  const instances: AuthoredTemplateInstance[] = [];
  const reserved = new Set<string>();
  const skylightCells = new Set<string>();
  for (const m of doc.mounts)
    if (m.attach === "top") {
      const p = placeMount(m, options.catalog.get(m.component), geoms, doc);
      for (let x = Math.floor(p.rect[0]); x < Math.ceil(p.rect[2]); x++)
        for (let y = Math.floor(p.rect[1]); y < Math.ceil(p.rect[3]); y++)
          reserved.add(`${x},${y}`);
    }
  for (const m of doc.mountTiles ?? []) {
    const p = placeMountTile(m, geoms);
    for (let x = Math.floor(p.rect[0]); x < Math.ceil(p.rect[2]); x++)
      for (let y = Math.floor(p.rect[1]); y < Math.ceil(p.rect[3]); y++)
        reserved.add(`${x},${y}`);
  }
  for (const s of doc.skylights)
    for (let x = s.at[0]; x < s.at[0] + s.size[0]; x++)
      for (let y = s.at[1]; y < s.at[1] + s.size[1]; y++) {
        reserved.add(`${x},${y}`);
        skylightCells.add(`${x},${y}`);
      }
  const surfaceOwners = new Map<string, Pt[][]>();
  const add = (row: AuthoredTemplateInstance) => {
    const shape = row.piece.match(/^(?:floor|roof)\.([^.]+)\./)?.[1];
    if (!shape) {
      instances.push(row);
      return;
    }
    const m = row.matrix,
      det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    const ax = (m[2][0] * m[1][1] - m[2][1] * m[1][0]) / det,
      ay = (m[0][0] * m[2][1] - m[0][1] * m[2][0]) / det,
      c = m[2][3] - ax * m[0][3] - ay * m[1][3];
    const datum = [ax, ay, c].map((n) => Math.round(n * 1e8) / 1e8).join(",");
    let poly = shapeTileLocalPolygon(shape as ShapeTilePlacement["shape"]).map(
      ([x, y]) =>
        [
          m[0][0] * x + m[0][1] * y + m[0][3],
          m[1][0] * x + m[1][1] * y + m[1][3],
        ] as Pt,
    );
    if (area(poly) < 0) poly.reverse();
    for (const [nx, ny, nz, d] of row.clipPlanes ?? [])
      if (!nz) poly = clipPolygon(poly, [nx, ny], d);
    if (Math.abs(area(poly)) < EPS) return;
    const cell =
      row.clipPlanes?.find(
        (p) => p[0] === 1 && p[1] === 0 && p[2] === 0,
      )?.[3] ?? m[0][3];
    const cellY =
      row.clipPlanes?.find(
        (p) => p[0] === 0 && p[1] === 1 && p[2] === 0,
      )?.[3] ?? m[1][3];
    const key = `${row.role}:${row.view}:${datum}:${cell},${cellY}`,
      prior = surfaceOwners.get(key) ?? [];
    const cuts = prior.flatMap((p) => triangles(p));
    const originalTriangles = triangles(poly);
    if (
      !cuts.some((cut) => originalTriangles.some((t) => convexOverlap(t, cut)))
    )
      instances.push(row);
    else {
      let fragments = originalTriangles;
      for (const cut of cuts)
        fragments = fragments.flatMap((f) =>
          convexOverlap(f, cut) ? subtractConvex(f, cut) : [f],
        );
      fragments.forEach((fragment, index) =>
        instances.push({
          ...row,
          object: `${row.object}:fragment${index}`,
          clipPlanes: [...(row.clipPlanes ?? []), ...polygonPlanes(fragment)],
        }),
      );
    }
    surfaceOwners.set(key, [...prior, poly]);
  };
  for (const g of geoms) {
    const v = g.volume,
      interior = interiors.find((i) => i.deck === v.deck),
      inhabited =
        deckVolume(doc, v.deck)?.volume.id === v.id &&
        !!interior?.floors.length;
    const deckOffset = v.deck * G.deck.pitchTexels * TEXEL;
    const zbase =
      Math.max(0, g.z[0] - (v.kind === "hull" ? G.tierRule.skirtTexels : 0)) *
        TEXEL +
      deckOffset;
    const ztop = g.z[1] * TEXEL + deckOffset;
    const roofView = inhabited ? "flight" : "both";
    const loops = [g.outline!.outer, ...g.outline!.holes];
    const centreY =
      (Math.min(...g.outline!.outer.map((p) => p[1])) +
        Math.max(...g.outline!.outer.map((p) => p[1]))) /
      2;
    const glassRuns = loops.flatMap((loop) => canopySegments(doc, loop));
    const doors = interior?.doors.filter((d) => d.exterior) ?? [];
    const arcFacets: {
      tile: ShapeTilePlacement;
      a: Pt;
      b: Pt;
      index: number;
      count: number;
    }[] = [];
    for (const t of v.tiles) {
      const spec = G.shapeTiles[t.shape];
      if (spec.kind !== "arc") continue;
      const n = G.arcSegmentsPerRadius * spec.radius!;
      for (let i = 0; i < n; i++) {
        const theta0 = (Math.PI * i) / (2 * n),
          theta1 = (Math.PI * (i + 1)) / (2 * n),
          r = spec.radius!;
        arcFacets.push({
          tile: t,
          a: tileWorld(t, [r * Math.cos(theta0), r * Math.sin(theta0)]),
          b: tileWorld(t, [r * Math.cos(theta1), r * Math.sin(theta1)]),
          index: i,
          count: n,
        });
      }
    }
    const isArc = (a: Pt, b: Pt) =>
      arcFacets.some((f) => onSegment(mid(a, b), f.a, f.b));
    const addFacade = (
      row: AuthoredTemplateInstance,
      lo: number,
      hi: number,
    ) => {
      if (!inhabited) return add(row);
      add({ ...row, object: row.object + ":flight", view: "flight" });
      const top = Math.min(hi, G.deck.shellCutTexels * TEXEL + deckOffset);
      if (top <= lo + EPS) return;
      if (row.verticalProfile) {
        const profile = row.verticalProfile,
          [ax, ay, c] = profile.top;
        const clips = (row.clipPlanes ?? []).filter((p) => p[2] >= 0);
        if (Math.abs(ax) + Math.abs(ay) < EPS) {
          add({
            ...row,
            object: row.object + ":deck",
            view: "deck",
            clipPlanes: clips,
            verticalProfile: { ...profile, top: [0, 0, Math.min(c, top)] },
          });
        } else {
          // Partition in XY at the bow/cut intersection. Each half keeps its
          // complete native cap; both profiles meet at exactly the same height.
          add({
            ...row,
            object: row.object + ":deck:below",
            view: "deck",
            clipPlanes: [...clips, [-ax, -ay, 0, top - c]],
          });
          add({
            ...row,
            object: row.object + ":deck:above",
            view: "deck",
            clipPlanes: [...clips, [ax, ay, 0, c - top]],
            verticalProfile: { ...profile, top: [0, 0, top] },
          });
        }
      } else {
        const matrix = row.matrix.map((r) => [...r]) as AuthoredTemplateMatrix;
        matrix[2][2] = top - lo;
        // Scale the complete closed native module: cutting at Z destroys its top cap.
        add({ ...row, object: row.object + ":deck", view: "deck", matrix });
      }
    };
    // Native tile surfaces are clipped per lattice cell to retain room floor finishes and roof reservations.
    for (let ti = 0; ti < v.tiles.length; ti++) {
      const t = v.tiles[ti],
        poly = placedTilePolygon(t),
        [w, h] = placedTileSize(t);
      const profile = t.bow
        ? affineHeights(t, v.height)
        : {
            bottom: constant(zbase - deckOffset),
            top: constant(ztop - deckOffset),
          };
      profile.bottom[2] += deckOffset;
      profile.top[2] += deckOffset;
      for (let x = t.x; x < t.x + w; x++)
        for (let y = t.y; y < t.y + h; y++) {
          if (!overlapsCell(poly, x, y)) continue;
          const cell = `${x},${y}`,
            floor = interior?.floors.find(
              (f) => f.cell[0] === x && f.cell[1] === y,
            );
          const cellClip = rectPlanes(x, y);
          const region = `${v.id}:${Math.floor(x / 4)},${Math.floor(y / 4)}`;
          const prefix = `${v.id}:tile${ti}:${cell}`;
          {
            if (!skylightCells.has(cell) && !bowGlass(t))
              add({
                object: `${prefix}:roof`,
                piece: reserved.has(cell)
                  ? `floor.${t.shape}.plate`
                  : `roof.${t.shape}.${roofFinish(doc, t.shape, x, y, centreY)}`,
                role: "roof",
                matrix: horizontalMatrix(t, profile.top),
                view: roofView,
                region,
                clipPlanes: cellClip,
              });
            add({
              object: `${prefix}:base`,
              piece: `floor.${t.shape}.plate`,
              role: "hull",
              matrix: horizontalMatrix(t, profile.bottom),
              view: "both",
              region,
              clipPlanes: cellClip,
            });
          }
          if (inhabited && floor && !t.bow)
            add({
              object: `${prefix}:floor`,
              piece: `floor.${t.shape}.${floor.kind === "grate" ? "grate" : "plate"}`,
              role: "floor",
              matrix: authoredTemplateTileMatrix(
                t,
                G.deck.floorTopTexels * TEXEL + deckOffset,
              ),
              view: "deck",
              region,
              clipPlanes: cellClip,
            });
          if (inhabited && floor && t.bow) {
            const floorHeight: [number, number, number] = [...profile.bottom];
            floorHeight[2] +=
              G.bowProfiles.shellThicknessTexels[v.height][0] * TEXEL;
            add({
              object: `${prefix}:floor`,
              piece: `floor.${t.shape}.plate`,
              role: "floor",
              matrix: horizontalMatrix(t, floorHeight),
              view: "deck",
              region,
              clipPlanes: cellClip,
            });
          }
        }
    }
    // Arc facades remain curved authored assets; contiguous exposed facets only choose their angular clip.
    for (let ti = 0; ti < v.tiles.length; ti++) {
      const t = v.tiles[ti],
        spec = G.shapeTiles[t.shape];
      if (spec.kind !== "arc") continue;
      const fs = arcFacets.filter((f) => f.tile === t),
        centre = tileWorld(t, [0, 0]);
      const bands = fs.map((f) => {
        const p = mid(f.a, f.b);
        if (
          !loops.some((loop) =>
            loop.some((a, i) => onSegment(p, a, loop[(i + 1) % loop.length])),
          ) ||
          glassRuns.some(([a, b]) => onSegment(p, a, b))
        )
          return [];
        const radial = unit(centre, p),
          r = spec.radius! + (spec.concave ? -0.02 : 0.02);
        return exposedBands(
          g,
          geoms,
          [centre[0] + radial[0] * r, centre[1] + radial[1] * r],
          zbase,
          ztop,
          {
            boundary: p,
            outward: [
              radial[0] * (spec.concave ? -1 : 1),
              radial[1] * (spec.concave ? -1 : 1),
            ],
          },
        );
      });
      for (let i = 0; i < fs.length; i++) {
        if (!bands[i].length) continue;
        const start = i;
        while (
          i + 1 < fs.length &&
          JSON.stringify(bands[i + 1]) === JSON.stringify(bands[start])
        )
          i++;
        const first = fs[start],
          last = fs[i],
          centre = tileWorld(t, [0, 0]);
        const aa = unit(centre, first.a),
          bb = unit(centre, last.b),
          det = t.reflected ? -1 : 1;
        const wedge = [
          plane([-aa[1] * det, aa[0] * det], centre),
          plane([bb[1] * det, -bb[0] * det], centre),
        ];
        for (const [lo, hi] of bands[start]) {
          const m = authoredTemplateTileMatrix(t, lo);
          m[2][2] = hi - lo;
          const row: AuthoredTemplateInstance = {
            object: `${v.id}:arc${ti}:${start}-${i}:${lo}`,
            piece: `hull.${t.shape}.${variant(doc, v.id, ti)}`,
            role: "hull",
            matrix: m,
            view: "both",
            region: v.id,
            clipPlanes: wedge,
          };
          addFacade(row, lo, hi);
        }
      }
    }
    // Facades extend to their outside miter, then trim to the common seam.
    for (const loop of loops)
      for (let ei = 0; ei < loop.length; ei++) {
        const a = loop[ei],
          b = loop[(ei + 1) % loop.length];
        if (isArc(a, b)) continue;
        const u = unit(a, b),
          length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          prev = unit(loop[(ei - 1 + loop.length) % loop.length], a),
          next = unit(b, loop[(ei + 2) % loop.length]);
        const cuts = new Set([0, length]);
        for (let s = 1; s < length; s++) cuts.add(s);
        for (const w of geoms)
          if (w !== g && w.outline)
            for (const line of [w.outline.outer, ...w.outline.holes])
              for (const p of line)
                if (onSegment(p, a, b))
                  cuts.add((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]);
        for (const d of doors)
          for (const p of [d.a, d.b])
            if (onSegment(p, a, b))
              cuts.add((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]);
        const sorted = [...cuts].sort((x, y) => x - y);
        for (let si = 0; si < sorted.length - 1; si++) {
          const s = sorted[si],
            e = sorted[si + 1];
          if (e - s < EPS) continue;
          const pa: Pt = [a[0] + u[0] * s, a[1] + u[1] * s],
            pb: Pt = [a[0] + u[0] * e, a[1] + u[1] * e],
            p = mid(pa, pb);
          if (doors.some((d) => onSegment(p, d.a, d.b))) continue;
          const glass = glassRuns.some(([ga, gb]) => onSegment(p, ga, gb));
          if (glass) continue; // qualified historical canopy families retained below
          const tile = v.tiles.find((t) =>
            insidePolygon(
              placedTilePolygon(t),
              p[0] - u[1] * 0.02,
              p[1] + u[0] * 0.02,
            ),
          );
          const profile = tile?.bow ? affineHeights(tile, v.height) : undefined;
          if (profile) {
            profile.bottom[2] += deckOffset;
            profile.top[2] += deckOffset;
          }
          const clips = [
            plane(s < EPS ? [prev[0] + u[0], prev[1] + u[1]] : u, pa),
            plane(
              e > length - EPS
                ? [-u[0] - next[0], -u[1] - next[1]]
                : [-u[0], -u[1]],
              pb,
            ),
          ];
          const sample: Pt = [p[0] + u[1] * 0.02, p[1] - u[0] * 0.02];
          const extension = (other: Pt) => {
            const dot = Math.max(
              -1,
              Math.min(1, other[0] * u[0] + other[1] * u[1]),
            );
            return (
              FACADE_OUTSIDE * Math.sqrt((1 - dot) / Math.max(EPS, 1 + dot))
            );
          };
          const startExtension = s < EPS ? extension(prev) : 0,
            endExtension = e > length - EPS ? extension(next) : 0;
          const spanStart: Pt = [
              pa[0] - u[0] * startExtension,
              pa[1] - u[1] * startExtension,
            ],
            spanEnd: Pt = [
              pb[0] + u[0] * endExtension,
              pb[1] + u[1] * endExtension,
            ];
          const low = profile
              ? Math.min(
                  atHeight(profile.bottom, pa),
                  atHeight(profile.bottom, pb),
                )
              : zbase,
            high = profile
              ? Math.max(atHeight(profile.top, pa), atHeight(profile.top, pb))
              : ztop;
          for (const [lo, hi] of exposedBands(g, geoms, sample, low, high, {
            boundary: p,
            outward: [u[1], -u[0]],
          })) {
            const base: AuthoredTemplateInstance = {
              object: `${v.id}:edge${ei}:${si}:${lo}${loops.indexOf(loop) ? `:loop${loops.indexOf(loop)}` : ""}`,
              piece: `hull.straight.${variant(doc, v.id, ei, si)}`,
              role: "hull",
              matrix: spanMatrix(
                spanStart,
                spanEnd,
                profile ? 0 : lo,
                profile ? 1 : hi - lo,
              ),
              view: "both",
              region: v.id,
              clipPlanes: profile
                ? [...clips, [0, 0, 1, -lo], [0, 0, -1, hi]]
                : clips,
              ...(profile ? { verticalProfile: profile } : {}),
            };
            addFacade(base, lo, hi);
          }
        }
      }
    // A closed native column covers the vertical cut seam. It spans the exact
    // inward/outward miter band, rather than leaving open ends at sharp tips.
    for (const loop of loops)
      for (let i = 0; i < loop.length; i++) {
        const a = loop[(i - 1 + loop.length) % loop.length],
          p = loop[i],
          b = loop[(i + 1) % loop.length],
          u = unit(a, p),
          w = unit(p, b);
        if (
          arcFacets.some(
            (f) =>
              onSegment(mid(a, p), f.a, f.b) &&
              arcFacets.some(
                (h) => h.tile === f.tile && onSegment(mid(p, b), h.a, h.b),
              ),
          )
        )
          continue;
        const dot = Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]));
        if (dot > 1 - EPS) continue;
        if (
          glassRuns.some(
            ([ga, gb]) =>
              onSegment(mid(a, p), ga, gb) || onSegment(mid(p, b), ga, gb),
          ) ||
          doors.some((d) => onSegment(p, d.a, d.b))
        )
          continue;
        const cosine = Math.sqrt((1 + dot) / 2);
        if (cosine < EPS) continue;
        const n: Pt = [
            (u[0] + w[0]) / (2 * cosine),
            (u[1] + w[1]) / (2 * cosine),
          ],
          tangent: Pt = [n[1], -n[0]],
          inner = -FACADE_INSIDE / cosine,
          outer = FACADE_OUTSIDE / cosine,
          centre = (inner + outer) / 2;
        const bandsA = exposedBands(
            g,
            geoms,
            [
              p[0] + u[1] * 0.02 - u[0] * 0.02,
              p[1] - u[0] * 0.02 - u[1] * 0.02,
            ],
            zbase,
            ztop,
            {
              boundary: [p[0] - u[0] * 0.02, p[1] - u[1] * 0.02],
              outward: [u[1], -u[0]],
            },
          ),
          bandsB = exposedBands(
            g,
            geoms,
            [
              p[0] + w[1] * 0.02 + w[0] * 0.02,
              p[1] - w[0] * 0.02 + w[1] * 0.02,
            ],
            zbase,
            ztop,
            {
              boundary: [p[0] + w[0] * 0.02, p[1] + w[1] * 0.02],
              outward: [w[1], -w[0]],
            },
          );
        const tile = v.tiles.find(
          (t) =>
            t.bow &&
            insidePolygon(
              placedTilePolygon(t),
              p[0] - w[1] * 0.02,
              p[1] + w[0] * 0.02,
            ),
        );
        const profile = tile ? affineHeights(tile, v.height) : undefined;
        if (profile) {
          profile.bottom[2] += deckOffset;
          profile.top[2] += deckOffset;
        }
        for (const [a0, a1] of bandsA)
          for (const [b0, b1] of bandsB) {
            const lo = Math.max(a0, b0),
              hi = Math.min(a1, b1);
            if (hi <= lo + EPS) continue;
            addFacade(
              {
                object: `${v.id}:corner${i}:${lo}${loops.indexOf(loop) ? `:loop${loops.indexOf(loop)}` : ""}`,
                piece: "post.normal",
                role: "hull",
                view: "both",
                region: v.id,
                matrix: [
                  [
                    (n[0] * SEAM_WIDTH) / 0.25,
                    (tangent[0] * (outer - inner)) / 0.25,
                    0,
                    p[0] + tangent[0] * centre,
                  ],
                  [
                    (n[1] * SEAM_WIDTH) / 0.25,
                    (tangent[1] * (outer - inner)) / 0.25,
                    0,
                    p[1] + tangent[1] * centre,
                  ],
                  [0, 0, profile ? 1 : hi - lo, profile ? 0 : lo],
                  [0, 0, 0, 1],
                ],
                ...(profile
                  ? {
                      verticalProfile: profile,
                      clipPlanes: [
                        [0, 0, 1, -lo],
                        [0, 0, -1, hi],
                      ] as AuthoredTemplateClipPlane[],
                    }
                  : {}),
              },
              lo,
              hi,
            );
          }
      }
  }
  for (const interior of interiors) {
    const offset = interior.deck * G.deck.pitchTexels * TEXEL,
      ft = G.deck.floorTopTexels * TEXEL + offset,
      cut = G.deck.interiorCutTexels * TEXEL + offset;
    for (let i = 0; i < interior.partitions.length; i++) {
      const w = interior.partitions[i],
        half = w.type === "wall.half",
        glazed = w.type === "wall.glazed" || w.type === "window";
      add({
        object: `deck${interior.deck}:wall${i}`,
        piece: glazed
          ? "canopy.straight"
          : `wall.straight.${variant(doc, "wall", ...w.a)}`,
        role: glazed ? "glass" : "wall",
        matrix: spanMatrix(
          w.a,
          w.b,
          ft,
          half ? Math.min(cut - ft, 1.1) : cut - ft,
          w.variant === "reinforced" ? 1.5 : 1,
        ),
        view: "deck",
        region: `interior:${interior.deck}`,
      });
    }
    for (let i = 0; i < interior.posts.length; i++) {
      const p = interior.posts[i];
      add({
        object: `deck${interior.deck}:post${i}`,
        piece: "post.normal",
        role: "post",
        matrix: [
          [1, 0, 0, p[0]],
          [0, 1, 0, p[1]],
          [0, 0, cut - ft, ft],
          [0, 0, 0, 1],
        ],
        view: "deck",
        region: `interior:${interior.deck}`,
      });
    }
  }
  const legacy = dressShip(doc, options).kit;
  const retainedLegacyPieces = [
    ...new Set(
      legacy
        .filter(
          (k) =>
            k.piece.startsWith("int.door.") ||
            k.piece.startsWith("canopy.") ||
            k.piece === "exterior.airlock" ||
            k.piece.startsWith("mount.") ||
            k.piece.startsWith("roof.skylight.") ||
            (k.piece.startsWith("bow.") &&
              k.piece.endsWith(".roof") &&
              doc.volumes.some((v) =>
                v.tiles.some(
                  (t) =>
                    bowGlass(t) &&
                    k.piece.includes(
                      `.${t.shape}.${v.height}.s${t.bow!.step}.a${t.bow!.axis}.`,
                    ),
                ),
              )),
        )
        .map((k) => k.piece),
    ),
  ];
  return { instances, interiors, retainedLegacyPieces };
}
