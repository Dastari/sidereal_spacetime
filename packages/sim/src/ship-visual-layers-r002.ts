/** r002 source recipes: pressure backing, subframe, inset plates and selected equipment bays. */
import {
  G,
  insidePolygon,
  placedTilePolygon,
  type Pt,
} from "@sidereal/content/construction-grammar";
import { bowGlass, bowHeights } from "@sidereal/content/bow-profiles";
import {
  deriveInterior,
  deckApproachZones,
  volumeGeometry,
  placeMount,
  placeMountTile,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  type ShipVisualLayer,
  type ShipVisualProfileId,
  type ShipVisualView,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import {
  polygonBoundarySample,
  sampleShipVisualLayers,
  visualCellKey,
} from "./ship-visual-sampler";
import { dressShip } from "./ship-dresser";

import {
  SHIP_VISUAL_PROFILES_R002,
  SHIP_VISUAL_MACRO_PROFILES_R002,
  referencePlateDecals,
  REFERENCE_OPTICAL_INTERFACES_R002,
} from "@sidereal/content/ship-visual-r002";

/** Actual source-frame + retained-glass guard union, transformed from the same
 * dresser placement used by rendering. Quantize OUTWARD before Chebyshev padding. */
export function referenceOpticalGuardBoxesR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  interfaces = REFERENCE_OPTICAL_INTERFACES_R002,
) {
  const bounds: {
    piece: string;
    kind: "source" | "retained";
    bounds: ShipVisualLayer["bounds"];
  }[] = [];
  let unknownVariant = false;
  for (const k of dressShip(doc, { catalog }).kit) {
    if (k.view !== "both" && k.view !== view) continue;
    if (
      ![k.x, k.y, k.z, k.rotDeg].every(Number.isFinite) ||
      (k.mirror !== undefined && typeof k.mirror !== "boolean")
    ) {
      // Uncertain placement cannot borrow an unrelated neighbouring certificate.
      unknownVariant = true;
      continue;
    }
    const spec = interfaces[k.piece];
    if (!spec) {
      if (k.piece.startsWith("canopy.") || k.piece.startsWith("bow."))
        unknownVariant = true;
      continue;
    }
    if (spec.kind === "non-optical") continue;
    const angle = (k.rotDeg * Math.PI) / 180,
      C = Math.cos(angle),
      S = Math.sin(angle);
    for (const [kind, boxes] of [
      ["source", spec.sourceFrameBounds],
      ["retained", spec.retainedGlassBounds],
    ] as const)
      for (const b of boxes) {
        const corners: number[][] = [];
        for (const X of [b[0], b[3]])
          for (const Y of [b[1], b[4]])
            for (const Z of [b[2], b[5]]) {
              const x = k.mirror ? -X : X;
              corners.push([k.x + C * x - S * Y, k.y + S * x + C * Y, k.z + Z]);
            }
        const lo = [0, 1, 2].map(
          (i) => Math.floor(Math.min(...corners.map((p) => p[i])) * 16) - 2,
        );
        const hi = [0, 1, 2].map(
          (i) => Math.ceil(Math.max(...corners.map((p) => p[i])) * 16) + 2,
        );
        bounds.push({
          piece: k.piece,
          kind,
          bounds: [...lo, ...hi] as ShipVisualLayer["bounds"],
        });
      }
  }
  return { bounds, unknownVariant };
}

type MatingPigmentSolid = {
  piece: string;
  sourcePart: number;
  bounds: number[];
  axes: { normal: number[]; min: number; max: number }[];
  /** Conservative pigment-only fallback; never a geometry/RAW descriptor. */
  veto?: true;
};

/** Exact finite convex-source attribution ONLY. No geometry/guard eligibility. */
export function referenceOpticalMatingSolidsR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): MatingPigmentSolid[] {
  const macro = SHIP_VISUAL_MACRO_PROFILES_R002[profileId];
  const solids: MatingPigmentSolid[] = [];
  const cross = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
  const dot = (a: number[], b: number[]) =>
    a.reduce((n, x, i) => n + x * b[i], 0);
  for (const k of dressShip(doc, { catalog }).kit) {
    if (k.view !== "both" && k.view !== view) continue;
    const original = macro.opticalInterfaces[k.piece];
    if (!original && /^(?:bow\.|canopy\.)/.test(k.piece)) return [];
    if (
      ![k.x, k.y, k.z, k.rotDeg].every(Number.isFinite) ||
      (k.mirror !== undefined && typeof k.mirror !== "boolean")
    )
      return [];
    if (original?.kind !== "optical") continue;
    const C = Math.cos((k.rotDeg * Math.PI) / 180),
      S = Math.sin((k.rotDeg * Math.PI) / 180);
    const transform = ([X, Y, Z]: readonly number[]) => {
      const x = k.mirror ? -X : X;
      return [k.x + C * x - S * Y, k.y + S * x + C * Y, k.z + Z];
    };
    const vetoPiece = () => {
      // Bounds are deliberately conservative only for PIGMENT veto. The same
      // certified neighbor must not repaint a cube touching an uncertain piece.
      if (original.sourceFrameBounds.length === 0) return false;
      for (const b of original.sourceFrameBounds) {
        if (
          b.length !== 6 ||
          !b.every(Number.isFinite) ||
          b.some((v, i) => i < 3 && v > b[i + 3])
        )
          return false;
        const points: number[][] = [];
        for (const X of [b[0], b[3]])
          for (const Y of [b[1], b[4]])
            for (const Z of [b[2], b[5]]) points.push(transform([X, Y, Z]));
        if (points.some((p) => !p.every(Number.isFinite))) return false;
        solids.push({
          piece: k.piece,
          sourcePart: -1,
          veto: true,
          axes: [],
          bounds: [
            ...[0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
            ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
          ],
        });
      }
      return true;
    };
    const spec = macro.opticalMatingPigments[k.piece];
    if (
      ["canopy.corner45.deck", "canopy.corner45.deck.cut"].includes(k.piece) ||
      !spec ||
      spec.assetSha256 !== original.assetSha256 ||
      !Array.isArray(spec.parts) ||
      spec.parts.length === 0
    ) {
      if (!vetoPiece()) return [];
      continue;
    }
    const qualified: MatingPigmentSolid[] = [];
    let uncertain = false;
    for (const part of spec.parts) {
      if (
        !part ||
        !Array.isArray(part.vertices) ||
        !Array.isArray(part.triangles) ||
        !Number.isSafeInteger(part.sourcePart) ||
        part.sourcePart < 0 ||
        part.vertices.length < 4 ||
        part.triangles.length < 4 ||
        part.vertices.some(
          (p) =>
            !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite),
        ) ||
        part.triangles.some(
          (t) =>
            !Array.isArray(t) ||
            t.length !== 3 ||
            t.some(
              (i) =>
                !Number.isSafeInteger(i) || i < 0 || i >= part.vertices.length,
            ),
        )
      ) {
        uncertain = true;
        break;
      }
      const points = part.vertices.map(transform);
      if (points.some((p) => !p.every(Number.isFinite))) {
        uncertain = true;
        break;
      }
      const origin = points[0];
      const normals: number[][] = [],
        edgeAxes: number[][] = [];
      const edges = new Map<string, number>();
      let volume = 0;
      for (const t of part.triangles) {
        const [a, b, c] = t.map((i) => points[i]);
        const ab = sub(b, a),
          ac = sub(c, a),
          n = cross(ab, ac);
        const length = Math.hypot(...n);
        if (!Number.isFinite(length) || length < 1e-12) {
          uncertain = true;
          break;
        }
        normals.push(n.map((v) => v / length));
        volume +=
          dot(sub(a, origin), cross(sub(b, origin), sub(c, origin))) / 6;
        for (let i = 0; i < 3; i++) {
          const u = t[i],
            v = t[(i + 1) % 3],
            key = `${u}:${v}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
          const edge = sub(points[v], points[u]);
          for (const axis of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ])
            edgeAxes.push(cross(edge, axis));
        }
      }
      if (
        uncertain ||
        !Number.isFinite(volume) ||
        Math.abs(volume) < 1e-12 ||
        [...edges].some(([e, n]) => {
          const [a, b] = e.split(":");
          return n !== 1 || edges.get(`${b}:${a}`) !== 1;
        })
      ) {
        uncertain = true;
        break;
      }
      const sign = Math.sign(volume);
      if (
        part.triangles.some((t, i) =>
          points.some(
            (p) => sign * dot(normals[i], sub(p, points[t[0]])) > 1e-8,
          ),
        )
      ) {
        uncertain = true;
        break;
      }
      // All convex SAT axes: both solids' face normals and every edge cross.
      // Extra tessellation diagonals are safe redundant axes, not missing axes.
      const axes = new Map<string, MatingPigmentSolid["axes"][number]>();
      for (const a of [
        ...normals,
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        ...edgeAxes,
      ]) {
        const length = Math.hypot(...a);
        if (length < 1e-12) continue;
        const n = a.map((v) => v / length),
          projections = points.map((p) => dot(n, p));
        axes.set(n.join(","), {
          normal: n,
          min: Math.min(...projections),
          max: Math.max(...projections),
        });
      }
      qualified.push({
        piece: k.piece,
        sourcePart: part.sourcePart,
        bounds: [
          ...[0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
          ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
        ],
        axes: [...axes.values()],
      });
    }
    // Never partially borrow another part after a malformed piece certificate.
    if (!uncertain) solids.push(...qualified);
    else if (!vetoPiece()) return [];
  }
  return solids;
}

/** Whole voxel cube, not its centre or corners. Mirroring does not affect SAT. */
export function referenceOpticalMatingCubeR002(
  x: number,
  y: number,
  z: number,
  solids: readonly MatingPigmentSolid[],
): boolean {
  const low = [x / 16, y / 16, z / 16],
    high = [(x + 1) / 16, (y + 1) / 16, (z + 1) / 16];
  if (![...low, ...high].every(Number.isFinite)) return false;
  const touchesBounds = (s: MatingPigmentSolid) =>
    ![0, 1, 2].some(
      (i) => high[i] < s.bounds[i] - 1e-9 || low[i] > s.bounds[i + 3] + 1e-9,
    );
  if (solids.some((s) => s.veto && touchesBounds(s))) return false;
  return solids.some((s) => {
    if (s.veto) return false;
    if (
      [0, 1, 2].some(
        (i) => high[i] < s.bounds[i] - 1e-9 || low[i] > s.bounds[i + 3] + 1e-9,
      )
    )
      return false;
    return s.axes.every(({ normal: n, min, max }) => {
      const a = n.reduce((v, q, i) => v + q * (q >= 0 ? low[i] : high[i]), 0);
      const b = n.reduce((v, q, i) => v + q * (q >= 0 ? high[i] : low[i]), 0);
      return b >= min - 1e-9 && a <= max + 1e-9;
    });
  });
}

const mod = (n: number, d: number) => ((n % d) + d) % d;
export function shipVisualLayersR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): ShipVisualLayer[] {
  const profile = SHIP_VISUAL_PROFILES_R002[profileId],
    macro = SHIP_VISUAL_MACRO_PROFILES_R002[profileId],
    layers: ShipVisualLayer[] = [];
  let surfaceRole: NonNullable<ShipVisualLayer["surfaceRole"]> = "hull";
  const box = (
    id: string,
    role: ShipVisualLayer["role"],
    slot: ShipKitSlot,
    b: number[],
    support?: string,
  ) => {
    const q = b.map(Math.round) as ShipVisualLayer["bounds"];
    if (q.some((n, i) => i < 3 && n >= q[i + 3])) return;
    layers.push({ id, role, slot, bounds: q, support, surfaceRole });
  };
  let shellNormal: [number, number, number] | undefined;
  let sidePlane: ShipVisualLayer["normalSide"] | undefined;
  let facetPlane: ShipVisualLayer["facet"] | undefined;
  let roofChart: { id: string; normal: [number, number, number] } | undefined;
  const column = (
    id: string,
    role: ShipVisualLayer["role"],
    slot: ShipKitSlot,
    x: number,
    y: number,
    z0: number,
    z1: number,
    support: string,
  ) => {
    const before = layers.length;
    box(id, role, slot, [x, y, z0, x + 1, y + 1, z1], support);
    if (facetPlane && layers.length > before && role !== "void")
      layers[layers.length - 1].facet = facetPlane;
    if (sidePlane && layers.length > before && role !== "void")
      layers[layers.length - 1].normalSide = sidePlane;
    if (roofChart && layers.length > before) {
      layers[layers.length - 1].normalChart = roofChart.id;
      layers[layers.length - 1].normalHint = roofChart.normal;
    } else if (
      shellNormal &&
      layers.length > before &&
      !["floor", "roof", "void", "service"].includes(role)
    )
      layers[layers.length - 1].normalHint = shellNormal;
  };
  const interior = deriveInterior(doc, 0, catalog);
  // One selected manufactured cover per utility/living room, not a deck-wide
  // metre grid. Existing sockets and approaches own their exact plan clearances.
  const approaches = deckApproachZones(
    interior.doors,
    interior.station?.at ?? null,
    (x, y) =>
      interior.floors.some(
        (f) => Math.floor(x) === f.cell[0] && Math.floor(y) === f.cell[1],
      ),
  );
  const occupiedFloorRects = [
    ...interior.sockets.map((o) => [
      o.at[0],
      o.at[1],
      o.at[0] + o.size[0],
      o.at[1] + o.size[1],
    ]),
    ...approaches.map((a) => a.rect),
  ];
  const supportedFloorPlan = new Set<string>();
  for (const v of doc.volumes) {
    if (!G.heightClasses[v.height].walkable) continue;
    const holes = volumeGeometry(v).outline?.holes ?? [];
    for (const t of v.tiles) {
      const poly = placedTilePolygon(t);
      for (
        let y = Math.floor(Math.min(...poly.map((p) => p[1])) * 16);
        y < Math.ceil(Math.max(...poly.map((p) => p[1])) * 16);
        y++
      )
        for (
          let x = Math.floor(Math.min(...poly.map((p) => p[0])) * 16);
          x < Math.ceil(Math.max(...poly.map((p) => p[0])) * 16);
          x++
        ) {
          const p: Pt = [(x + 0.5) / 16, (y + 0.5) / 16];
          if (
            insidePolygon(poly, ...p) &&
            !holes.some((h) => insidePolygon(h, ...p))
          )
            supportedFloorPlan.add(`${x},${y}`);
        }
    }
  }
  const floorCovers: {
    bounds: number[];
    kind: "vent" | "access";
    room: string;
  }[] = [];
  for (const room of doc.rooms) {
    if (
      ![
        "engineering",
        "workshop",
        "cargo",
        "galley",
        "lounge",
        "medbay",
        "bridge",
      ].includes(room.type)
    )
      continue;
    const width =
      room.type === "engineering" || room.type === "workshop" ? 24 : 20;
    const depth = room.type === "cargo" ? 28 : 16;
    const candidates: { bounds: number[]; score: number }[] = [];
    const cx = (room.rect[0] + room.rect[2]) * 8,
      cy = (room.rect[1] + room.rect[3]) * 8;
    for (
      let y = Math.ceil(room.rect[1] * 16 + 4);
      y + depth < room.rect[3] * 16 - 4;
      y += 4
    )
      for (
        let x = Math.ceil(room.rect[0] * 16 + 4);
        x + width < room.rect[2] * 16 - 4;
        x += 4
      ) {
        const b = [x, y, x + width, y + depth];
        let fullSupport = true;
        for (let Y = b[1]; Y < b[3] && fullSupport; Y++)
          for (let X = b[0]; X < b[2]; X++)
            if (!supportedFloorPlan.has(`${X},${Y}`)) {
              fullSupport = false;
              break;
            }
        if (!fullSupport) continue;
        if (
          occupiedFloorRects.some(
            (r) =>
              b[0] / 16 < r[2] + 1 / 16 &&
              b[2] / 16 > r[0] - 1 / 16 &&
              b[1] / 16 < r[3] + 1 / 16 &&
              b[3] / 16 > r[1] - 1 / 16,
          )
        )
          continue;
        candidates.push({
          bounds: b,
          score: Math.hypot(x + width / 2 - cx, y + depth / 2 - cy),
        });
      }
    candidates.sort(
      (a, b) =>
        a.score - b.score ||
        a.bounds[1] - b.bounds[1] ||
        a.bounds[0] - b.bounds[0],
    );
    const selected = candidates.slice(0, 1);
    const second = candidates.find(
      (c) =>
        selected.length &&
        !(
          c.bounds[0] < selected[0].bounds[2] + 3 &&
          c.bounds[2] > selected[0].bounds[0] - 3 &&
          c.bounds[1] < selected[0].bounds[3] + 3 &&
          c.bounds[3] > selected[0].bounds[1] - 3
        ),
    );
    if (
      second &&
      ["bridge", "engineering", "workshop", "galley", "lounge"].includes(
        room.type,
      )
    )
      selected.push(second);
    for (const c of selected)
      floorCovers.push({
        bounds: c.bounds,
        kind:
          room.type === "engineering" || room.type === "workshop"
            ? "vent"
            : "access",
        room: room.id,
      });
  }
  const analyticCharts = new Map<string, [number, number, number]>();
  const assemblies = doc.volumes.map((volume) => ({
    volume,
    geometry: volumeGeometry(volume),
    tiles: volume.tiles.map((tile) => ({
      tile,
      poly: placedTilePolygon(tile),
    })),
  }));
  // Reuse the same transformed, catalog-qualified footprints as the actual dresser.
  // Raw mount.at is neither an anchor nor a tile-carried item's occupied rectangle.
  const geoms = assemblies.map((a) => a.geometry);
  // Guard the complete frame and moving-leaf sweep, not a radius at its centre.
  // The renderer slides each leaf .95 widths from its closed half-width centre;
  // its outside edge therefore reaches 1.95w+.005. Two cells also cover the
  // Chebyshev neighbour ring and the full cube footprint of any candidate facet.
  const rawPaddingM = 2 / 16;
  const doorGuards = interior.doors.map((d) => {
    const dx = d.b[0] - d.a[0],
      dy = d.b[1] - d.a[1];
    const span = Math.hypot(dx, dy);
    const leafWidth = Math.max(0.6, (span - 0.75) / 2);
    return {
      centre: [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2] as Pt,
      along: [dx / span, dy / span] as Pt,
      halfSpan: Math.max(span / 2, 1.95 * leafWidth + 0.005) + rawPaddingM,
      halfDepth: 5 / 16 + rawPaddingM,
    };
  });
  const frameGuards = doc.mounts
    .filter((m) => m.attach === "edge")
    .map((m) => placeMount(m, catalog.get(m.component), geoms, doc).rect);
  const opticalGuards = assemblies.flatMap((a) =>
    a.tiles.filter(({ tile }) => bowGlass(tile)).map(({ poly }) => poly),
  );
  const opticalEdges = [
    ...interior.exteriorSlopes.filter((e) => e.glass),
    ...[...interior.exteriorWalls, ...interior.partitions].filter(
      (e) =>
        e.type === "window" ||
        e.type === "wall.glazed" ||
        e.variant === "glazed",
    ),
  ];
  const protectedInterface = (p: Pt) =>
    doorGuards.some((g) => {
      const dx = p[0] - g.centre[0],
        dy = p[1] - g.centre[1];
      return (
        Math.abs(dx * g.along[0] + dy * g.along[1]) <= g.halfSpan &&
        Math.abs(-dx * g.along[1] + dy * g.along[0]) <= g.halfDepth
      );
    }) ||
    frameGuards.some(
      (r) =>
        p[0] >= r[0] - rawPaddingM &&
        p[0] <= r[2] + rawPaddingM &&
        p[1] >= r[1] - rawPaddingM &&
        p[1] <= r[3] + rawPaddingM,
    ) ||
    opticalEdges.some((e) => {
      const dx = e.b[0] - e.a[0],
        dy = e.b[1] - e.a[1],
        span = Math.hypot(dx, dy);
      const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / span;
      const v = Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / span;
      return (
        u >= -rawPaddingM && u <= span + rawPaddingM && v <= 0.25 + rawPaddingM
      );
    }) ||
    opticalGuards.some(
      (poly) =>
        insidePolygon(poly, ...p) ||
        polygonBoundarySample(p, poly).distance <= rawPaddingM,
    );

  const opticalBoxes = referenceOpticalGuardBoxesR002(
    doc,
    view,
    catalog,
    macro.opticalInterfaces,
  );
  const opticalCellProtected = (x: number, y: number, z: number) => {
    const p: Pt = [(x + 0.5) / 16, (y + 0.5) / 16];
    if (
      opticalBoxes.bounds.some(
        (g) =>
          x >= g.bounds[0] &&
          x < g.bounds[3] &&
          y >= g.bounds[1] &&
          y < g.bounds[4] &&
          z >= g.bounds[2] &&
          z < g.bounds[5],
      )
    )
      return true;
    if (!protectedInterface(p)) return false;
    // Doors/equipment and uncertified optical variants retain the complete old guard.
    const hard =
      doorGuards.some((g) => {
        const X = p[0] - g.centre[0],
          Y = p[1] - g.centre[1];
        return (
          Math.abs(X * g.along[0] + Y * g.along[1]) <= g.halfSpan &&
          Math.abs(-X * g.along[1] + Y * g.along[0]) <= g.halfDepth
        );
      }) ||
      frameGuards.some(
        (r) =>
          p[0] >= r[0] - rawPaddingM &&
          p[0] <= r[2] + rawPaddingM &&
          p[1] >= r[1] - rawPaddingM &&
          p[1] <= r[3] + rawPaddingM,
      );
    if (hard || opticalBoxes.unknownVariant) return true;
    const candidates = opticalBoxes.bounds.filter(
      (g) =>
        x >= g.bounds[0] &&
        x < g.bounds[3] &&
        y >= g.bounds[1] &&
        y < g.bounds[4],
    );
    if (!candidates.length) return true;
    // Uncertified windows/interior glazed walls do not borrow a neighbouring canopy's certification.
    if (
      opticalEdges.some(
        (e) =>
          !("glass" in e) &&
          (() => {
            const dx = e.b[0] - e.a[0],
              dy = e.b[1] - e.a[1],
              L = Math.hypot(dx, dy);
            const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / L,
              v = Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / L;
            return (
              u >= -rawPaddingM &&
              u <= L + rawPaddingM &&
              v <= 0.25 + rawPaddingM
            );
          })(),
      )
    )
      return true;
    return candidates.some((g) => z >= g.bounds[2] && z < g.bounds[5]);
  };

  // Select a purpose on a whole usable wall run, after real assembly exclusions.
  // Room centroids can fall in a doorway; they are a preference, never eligibility.
  const wallTaskKey = (
    room: ShipPrefabDocumentV1["rooms"][number],
  ): keyof typeof macro.wallTasks => {
    switch (room.type) {
      case "engineering":
        return "engineering";
      case "workshop":
        return "workshop";
      case "bridge":
        return "bridge";
      case "cargo":
        return "cargo";
      case "medbay":
        return "medical";
      case "quarters":
        return "quarters";
      case "galley":
        return "galley";
      case "lounge":
        return "lounge";
      default:
        return "living";
    }
  };
  const wallTaskRuns = (a: Pt, b: Pt, side: Pt) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      span = Math.hypot(dx, dy);
    const ux = dx / span,
      uy = dy / span;
    const roomAt = (q: number) => {
      const face: Pt = [(a[0] + ux * q) / 16, (a[1] + uy * q) / 16];
      const probe: Pt = [face[0] + side[0] * 0.35, face[1] + side[1] * 0.35];
      if (
        protectedInterface(face) ||
        interior.sockets.some(
          (o) =>
            probe[0] >= o.at[0] - 1 / 16 &&
            probe[0] <= o.at[0] + o.size[0] + 1 / 16 &&
            probe[1] >= o.at[1] - 1 / 16 &&
            probe[1] <= o.at[1] + o.size[1] + 1 / 16,
        )
      )
        return undefined;
      return doc.rooms.find(
        (r) =>
          r.type !== "corridor" &&
          probe[0] >= r.rect[0] &&
          probe[0] < r.rect[2] &&
          probe[1] >= r.rect[1] &&
          probe[1] < r.rect[3],
      );
    };
    const runs: {
      room: ShipPrefabDocumentV1["rooms"][number];
      u: number;
      U: number;
    }[] = [];
    for (let q = 4; q < span - 4; q++) {
      const room = roomAt(q + 0.5);
      if (!room) continue;
      const last = runs[runs.length - 1];
      if (last?.room.id === room.id && last.U === q) last.U++;
      else runs.push({ room, u: q, U: q + 1 });
    }
    const selected: {
      room: ShipPrefabDocumentV1["rooms"][number];
      key: keyof typeof macro.wallTasks;
      u: number;
      U: number;
    }[] = [];
    for (const room of doc.rooms) {
      const options = runs.filter(
        (r) => r.room.id === room.id && r.U - r.u >= 13,
      );
      const centre =
        ((room.rect[0] + room.rect[2]) * 8 - a[0]) * ux +
        ((room.rect[1] + room.rect[3]) * 8 - a[1]) * uy;
      options.sort(
        (A, B) =>
          Math.abs((A.u + A.U) / 2 - centre) -
            Math.abs((B.u + B.U) / 2 - centre) || A.u - B.u,
      );
      if (!options.length) continue;
      const run = options[0],
        key = wallTaskKey(room);
      const width = Math.min(macro.wallTasks[key].width, run.U - run.u);
      const u = Math.max(
        run.u,
        Math.min(run.U - width, Math.round(centre - width / 2)),
      );
      selected.push({ room, key, u, U: u + width });
    }
    return selected;
  };
  const wallTaskCache = new Map<string, ReturnType<typeof wallTaskRuns>>();
  const wallTasksFor = (id: string, a: Pt, b: Pt, side: Pt) => {
    const key = `${id}:${side.join(",")}`;
    if (!wallTaskCache.has(key))
      wallTaskCache.set(key, wallTaskRuns(a, b, side));
    return wallTaskCache.get(key)!;
  };

  // R17 collects complete assemblies independently of envelope emission order.
  // A room receives one main group across ALL perimeter and partition faces.
  // Selection happens after generic walls/posts have their final ownership.
  type PendingWallTask = {
    room: ShipPrefabDocumentV1["rooms"][number];
    key: keyof typeof macro.wallTasks;
    u: number;
    U: number;
    face: string;
    support: string;
    layers: ShipVisualLayer[];
  };
  const pendingWallTasks = new Map<string, PendingWallTask>();
  const deferWallTask = (
    chosen: ReturnType<typeof wallTaskRuns>[number],
    face: string,
    support: string,
    start: number,
  ) => {
    const taskLayers = layers.splice(start);
    if (!taskLayers.length) return;
    const id = `${chosen.room.id}:${face}`;
    let pending = pendingWallTasks.get(id);
    if (!pending) {
      pending = { ...chosen, face, support, layers: [] };
      pendingWallTasks.set(id, pending);
    }
    pending.layers.push(
      ...taskLayers.map((l) => ({
        ...l,
        id: `${l.id.slice(0, l.id.lastIndexOf(":"))}:room-task:${chosen.room.id}:${l.id.slice(l.id.lastIndexOf(":") + 1)}`,
      })),
    );
  };

  const roofObstacles = [
    ...doc.mounts
      .filter((m) => m.attach === "top")
      .map((m) => placeMount(m, catalog.get(m.component), geoms, doc).rect),
    ...(doc.mountTiles ?? []).map((t) => placeMountTile(t, geoms).rect),
  ].map((r) => r.map((n) => n * 16));
  const roofMarkings = referencePlateDecals(
    doc,
    dressShip(doc, { catalog }).decals,
    "r002",
  )
    .filter((d) => d.normal[2] > 0.99)
    .map((d) => [
      Math.min(...d.corners.map((p) => p[0])) * 16,
      Math.min(...d.corners.map((p) => p[1])) * 16,
      Math.max(...d.corners.map((p) => p[0])) * 16,
      Math.max(...d.corners.map((p) => p[1])) * 16,
    ]);
  const inRect = (x: number, y: number, r: number[], padding = 0) =>
    x >= r[0] - padding &&
    x < r[2] + padding &&
    y >= r[1] - padding &&
    y < r[3] + padding;
  // Rich bays belong to exposed assembled boundaries. Attached wings hide their parent
  // shell, so assigning functions by global modulo alone puts equipment behind solid art.
  const blockedByAttachment = (
    volumeId: string,
    point: Pt,
    z0: number,
    z1: number,
  ) =>
    assemblies.some(({ volume, geometry, tiles }) => {
      if (
        volume.id === volumeId ||
        !geometry.outline ||
        !insidePolygon(geometry.outline.outer, point[0], point[1]) ||
        geometry.outline.holes.some((h) => insidePolygon(h, point[0], point[1]))
      )
        return false;
      const t = tiles.find(({ poly }) =>
        insidePolygon(poly, point[0], point[1]),
      )?.tile;
      if (!t) return false;
      const [lo, hi] = bowHeights(t, volume.height, point);
      return hi > z0 && lo < z1;
    });
  for (const volume of doc.volumes) {
    const geom = volumeGeometry(volume);
    if (!geom.outline) continue;
    const poly = geom.outline.outer.map(([x, y]): Pt => [x * 16, y * 16]);
    const holes = geom.outline.holes.map((h) =>
      h.map(([x, y]): Pt => [x * 16, y * 16]),
    );
    const [bx, by, bX, bY] = geom.bounds.map((v) => Math.round(v * 16));
    const tileCells = new Map<
      string,
      { tile: (typeof volume.tiles)[number]; poly: Pt[] }[]
    >();
    const tileRoofCharts = new Map<
      (typeof volume.tiles)[number],
      { id: string; normal: [number, number, number]; dx: number; dy: number }
    >();
    const innerBackings: {
      x: number;
      y: number;
      z0: number;
      z1: number;
      normal?: [number, number, number];
    }[] = [];
    for (const tile of volume.tiles) {
      const poly = placedTilePolygon(tile),
        xs = poly.map((p) => p[0]),
        ys = poly.map((p) => p[1]);
      if (tile.bow) {
        const world: Pt = [
          xs.reduce((a, b) => a + b, 0) / xs.length,
          ys.reduce((a, b) => a + b, 0) / ys.length,
        ];
        const z = bowHeights(tile, volume.height, world)[1];
        const dx =
          bowHeights(tile, volume.height, [world[0] + 1 / 16, world[1]])[1] - z;
        const dy =
          bowHeights(tile, volume.height, [world[0], world[1] + 1 / 16])[1] - z;
        const intercept = z - dx * world[0] * 16 - dy * world[1] * 16;
        const id = `volume:${volume.id}:roof-plane:${dx.toFixed(6)}:${dy.toFixed(6)}:${intercept.toFixed(6)}`;
        let normal = analyticCharts.get(id);
        if (!normal) {
          const length = Math.hypot(dx, dy, 1);
          normal = [-dx / length, -dy / length, 1 / length];
          analyticCharts.set(id, normal);
        }
        tileRoofCharts.set(tile, { id, normal, dx, dy });
      }
      for (
        let y = Math.floor(Math.min(...ys));
        y < Math.ceil(Math.max(...ys));
        y++
      )
        for (
          let x = Math.floor(Math.min(...xs));
          x < Math.ceil(Math.max(...xs));
          x++
        ) {
          const key = `${x},${y}`;
          tileCells.set(key, [...(tileCells.get(key) ?? []), { tile, poly }]);
        }
    }
    const deck = G.heightClasses[volume.height].walkable;
    const family = `volume:${volume.id}`;
    // Joined housings take their purpose and occupied aperture from actual equipment,
    // not room rectangles. The visible shoulders join the same tray beside those apertures.
    const pendingRoofClusterLayers: ShipVisualLayer[] = [];
    const roofFixtureBounds: {
      id: string;
      kind: "utility" | "control";
      bounds: number[];
    }[] = [];
    const roofCases: {
      id: string;
      bounds: number[];
      kind: "utility" | "habitation" | "control";
    }[] = [];
    if (deck) {
      const mounted = [
        ...doc.mounts
          .filter((m) => m.attach === "top")
          .map((m) => ({
            id: m.id,
            kind: m.component.startsWith("radiator.")
              ? ("utility" as const)
              : ("control" as const),
            bounds: placeMount(
              m,
              catalog.get(m.component),
              geoms,
              doc,
            ).rect.map((n) => n * 16),
          })),
        ...(doc.mountTiles ?? []).map((m) => ({
          id: m.id,
          kind: "control" as const,
          bounds: placeMountTile(m, geoms).rect.map((n) => n * 16),
        })),
      ].filter((m) =>
        insidePolygon(
          poly,
          (m.bounds[0] + m.bounds[2]) / 2,
          (m.bounds[1] + m.bounds[3]) / 2,
        ),
      );
      roofFixtureBounds.push(...mounted);
      const utility = mounted.filter((m) => m.kind === "utility");
      const control = mounted
        .filter((m) => m.kind === "control")
        .sort((a, b) => a.bounds[0] - b.bounds[0] || a.id.localeCompare(b.id));
      const groups = [
        utility,
        control.slice(0, Math.max(1, Math.ceil(control.length / 2))),
        control.slice(Math.max(1, Math.ceil(control.length / 2))),
      ].filter((a) => a.length);
      for (const [index, items] of groups.entries()) {
        const kind = items[0].kind;
        const padX = kind === "utility" ? 5 : 8;
        const padLeft = index === 1 ? 18 : 7,
          padRight = index === 2 ? 18 : 7;
        roofCases.push({
          id: `${kind}:${items
            .map((m) => m.id)
            .sort()
            .join("+")}`,
          kind,
          bounds: [
            Math.max(
              bx + 3,
              Math.floor(Math.min(...items.map((m) => m.bounds[0]))) - padX,
            ),
            Math.max(
              by + 3,
              Math.floor(Math.min(...items.map((m) => m.bounds[1]))) - padLeft,
            ),
            Math.min(
              bX - 3,
              Math.ceil(Math.max(...items.map((m) => m.bounds[2]))) + padX,
            ),
            Math.min(
              bY - 3,
              Math.ceil(Math.max(...items.map((m) => m.bounds[3]))) + padRight,
            ),
          ],
        });
      }
      // One deliberately unequal calm cover fills an exposed gap, retaining source markings.
      const candidates: { bounds: number[]; score: number }[] = [];
      for (let y = by + 5; y + 22 < bY - 5; y += 8)
        for (let x = bx + 6; x + 34 < bX - 6; x += 8) {
          const bounds = [x, y, x + 34, y + 22];
          if (
            [
              ...roofObstacles,
              ...roofMarkings,
              ...roofCases.map((c) => c.bounds),
            ].some(
              (r) =>
                bounds[0] < r[2] + 2 &&
                bounds[2] > r[0] - 2 &&
                bounds[1] < r[3] + 2 &&
                bounds[3] > r[1] - 2,
            )
          )
            continue;
          if (
            ![
              [x, y],
              [x + 34, y],
              [x, y + 22],
              [x + 34, y + 22],
            ].every(
              ([X, Y]) =>
                insidePolygon(poly, X, Y) &&
                !holes.some((h) => insidePolygon(h, X, Y)),
            )
          )
            continue;
          candidates.push({
            bounds,
            score: Math.abs(x - bx - (bX - bx) * 0.65),
          });
        }
      candidates.sort((a, b) => a.score - b.score || a.bounds[1] - b.bounds[1]);
      if (candidates[0])
        roofCases.push({
          id: "exposed-cover",
          kind: "habitation",
          bounds: candidates[0].bounds,
        });
    }
    const routeCandidates = [
      Math.round(by + (bY - by) * 0.25),
      Math.round(by + (bY - by) * 0.75),
    ];
    const exposedScore = (y: number) => {
      let n = 0;
      for (let x = bx + 8; x < bX - 8; x++)
        if (
          insidePolygon(poly, x + 0.5, y + 0.5) &&
          !holes.some((h) => insidePolygon(h, x + 0.5, y + 0.5)) &&
          ![...roofObstacles, ...roofMarkings].some((r) => inRect(x, y, r, 5))
        )
          n++;
      return n;
    };
    const routeYs =
      deck && bY - by >= 48
        ? routeCandidates
        : [
            routeCandidates.sort(
              (a, b) => exposedScore(b) - exposedScore(a),
            )[0],
          ];
    const trayCassetteX = new Map<number, number | undefined>();
    const roofPatches: { bounds: number[]; kind: "vent" | "access" }[] = [];
    for (const routeY of routeYs) {
      const candidates: {
        bounds: number[];
        kind: "vent" | "access";
        score: number;
      }[] = [];
      for (let at = Math.ceil((bx + 8) / 32) * 32; at + 24 < bX - 8; at += 32) {
        const bounds = [at, routeY - 7, at + 24, routeY + 7];
        if (
          [...roofObstacles, ...roofMarkings].some(
            (r) =>
              bounds[0] < r[2] + 3 &&
              bounds[2] > r[0] - 3 &&
              bounds[1] < r[3] + 3 &&
              bounds[3] > r[1] - 3,
          )
        )
          continue;
        if (
          ![
            [bounds[0], bounds[1]],
            [bounds[2], bounds[1]],
            [bounds[0], bounds[3]],
            [bounds[2], bounds[3]],
          ].every(
            ([x, y]) =>
              insidePolygon(poly, x, y) &&
              !holes.some((h) => insidePolygon(h, x, y)),
          )
        )
          continue;
        const centre: Pt = [(at + 12) / 16, routeY / 16];
        const room = doc.rooms.find(
          (r) =>
            centre[0] >= r.rect[0] &&
            centre[0] < r.rect[2] &&
            centre[1] >= r.rect[1] &&
            centre[1] < r.rect[3],
        );
        const vent = room?.type === "engineering" || room?.type === "workshop";
        candidates.push({
          bounds,
          kind:
            vent || roofPatches.some((p) => p.kind === "access")
              ? "vent"
              : "access",
          score: vent ? 3 : room ? 2 : 1,
        });
      }
      const selected = candidates
        .sort((a, b) => b.score - a.score || a.bounds[0] - b.bounds[0])
        .filter((_, i) => i < 2);
      roofPatches.push(
        ...(deck
          ? selected.map((p, i) => ({
              ...p,
              kind:
                p.kind === "access" &&
                (i > 0 || roofPatches.some((q) => q.kind === "access"))
                  ? ("vent" as const)
                  : p.kind,
            }))
          : selected.slice(0, 1)),
      );
      trayCassetteX.set(routeY, selected[0]?.bounds[0]);
    }
    // Two unequal service fields belong beside actual equipment cases, on exposed
    // shoulders. They do not tile the whole roof or replace the working routes.
    const shoulderFields: {
      id: string;
      kind: "vent" | "access";
      bounds: number[];
    }[] = [];
    if (deck)
      for (const c of roofFixtureBounds) {
        if (
          shoulderFields.some(
            (f) => f.kind === (c.kind === "utility" ? "vent" : "access"),
          )
        )
          continue;
        const vent = c.kind === "utility",
          width = vent ? 20 : 14,
          depth = vent ? 12 : 10;
        const [a, b, A, B] = c.bounds;
        const candidates = [
          [a + 3, b - depth - 3, a + 3 + width, b - 3],
          [A - width - 3, B + 3, A - 3, B + depth + 3],
          [a - width - 3, b + 4, a - 3, b + 4 + depth],
          [A + 3, B - depth - 4, A + width + 3, B - 4],
        ];
        for (const bounds of candidates) {
          let clear = true;
          for (let y = bounds[1]; y < bounds[3] && clear; y++)
            for (let x = bounds[0]; x < bounds[2]; x++) {
              const p: Pt = [x + 0.5, y + 0.5];
              if (
                !insidePolygon(poly, ...p) ||
                polygonBoundarySample(p, poly).distance < 4 ||
                holes.some((h) => insidePolygon(h, ...p)) ||
                [
                  ...roofObstacles,
                  ...roofMarkings,
                  ...shoulderFields.map((f) => f.bounds),
                ].some((r) => inRect(...p, r, 2)) ||
                routeYs.some((route) => Math.abs(y - route) < 8)
              ) {
                clear = false;
                break;
              }
              const world: Pt = [p[0] / 16, p[1] / 16];
              const tile = tileCells
                .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
                ?.find((t) => insidePolygon(t.poly, ...world))?.tile;
              if (!tile || tile.bow) {
                clear = false;
                break;
              }
            }
          if (!clear) continue;
          shoulderFields.push({
            id: c.id,
            kind: vent ? "vent" : "access",
            bounds,
          });
          break;
        }
      }
    for (let y = by; y < bY; y++)
      for (let x = bx; x < bX; x++) {
        const p: Pt = [x + 0.5, y + 0.5];
        if (
          !insidePolygon(poly, p[0], p[1]) ||
          holes.some((h) => insidePolygon(h, p[0], p[1]))
        )
          continue;
        const world: Pt = [p[0] / 16, p[1] / 16];
        const tile = tileCells
          .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
          ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
        if (!tile) continue;
        const [rawLo, rawHi] = bowHeights(tile, volume.height, world);
        const lo = Math.floor(rawLo),
          hi = tile.bow ? Math.floor(rawHi) : Math.ceil(rawHi);
        const floor = tile.bow
          ? lo + G.bowProfiles.shellThicknessTexels[volume.height][0]
          : deck
            ? G.deck.floorTopTexels
            : lo + 2;
        const top =
          view === "deck" && deck ? Math.min(hi, G.deck.shellCutTexels) : hi;
        const boundary = polygonBoundarySample(p, poly),
          distance = boundary.distance;
        shellNormal =
          distance < 4 &&
          Math.abs(boundary.normalHint[0]) > 0.001 &&
          Math.abs(boundary.normalHint[1]) > 0.001
            ? boundary.normalHint
            : undefined;
        // Continuous keel/floor and roof backings are sampled before courses, never carved by seams.
        surfaceRole = deck ? "floor" : "hull";
        column(
          `${family}:keel`,
          deck ? "floor" : "core",
          deck ? "dark" : "secondary",
          x,
          y,
          lo,
          Math.max(lo + 1, floor),
          family,
        );
        if (deck && view === "deck") {
          column(
            `${family}:floor-field`,
            "floor",
            "secondary",
            x,
            y,
            floor - 1,
            floor,
            family,
          );
          {
            const room = doc.rooms.find(
              (r) =>
                world[0] >= r.rect[0] &&
                world[0] < r.rect[2] &&
                world[1] >= r.rect[1] &&
                world[1] < r.rect[3],
            );
            const cover = floorCovers.find(
              (c) =>
                x >= c.bounds[0] &&
                x < c.bounds[2] &&
                y >= c.bounds[1] &&
                y < c.bounds[3],
            );
            if (cover) {
              const [a, b, A, B] = cover.bounds;
              const edge = Math.min(x - a, A - 1 - x, y - b, B - 1 - y);
              // Flush service-cover ownership changes the visible field, never the actual
              // walking/contact top. The old decorative seam void was a false physical pit.
              const corner =
                Math.min(x - a, A - 1 - x) + Math.min(y - b, B - 1 - y) < 2;
              if (edge === 0 || corner) {
                surfaceRole = "hull";
                column(
                  `${family}:floor-cover-binding:${cover.room}`,
                  "floor",
                  "trim",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
                surfaceRole = "floor";
              } else {
                const tooling =
                  cover.kind === "access" && x - a > 3 && x - a < 9;
                // The generic protected binding borrows the existing hull trim
                // finish; the walkable polymer field keeps its floor response.
                if (tooling) surfaceRole = "hull";
                column(
                  `${family}:floor-cover:${cover.room}`,
                  "floor",
                  tooling ? "trim" : "secondary",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
                surfaceRole = "floor";
                if (
                  cover.kind === "vent" &&
                  x > a + 3 &&
                  x < A - 4 &&
                  y > b + 3 &&
                  y < B - 4 &&
                  mod(x - a, 5) < 2
                )
                  column(
                    `${family}:floor-cover-fin:${cover.room}`,
                    "service",
                    "metal",
                    x,
                    y,
                    floor - 1,
                    floor,
                    family,
                  );
                if (
                  cover.kind === "access" &&
                  x >= A - 5 &&
                  x < A - 3 &&
                  y >= b + 5 &&
                  y < b + 9
                )
                  column(
                    `${family}:floor-cover-latch:${cover.room}`,
                    "service",
                    "metal",
                    x,
                    y,
                    floor - 1,
                    floor,
                    family,
                  );
              }
            } else if (
              interior.doors.some((d) => {
                const dx = d.b[0] - d.a[0],
                  dy = d.b[1] - d.a[1];
                const length = Math.hypot(dx, dy);
                if (!length) return false;
                const along =
                  ((world[0] - d.a[0]) * dx + (world[1] - d.a[1]) * dy) /
                  length;
                const across =
                  Math.abs(
                    (world[0] - d.a[0]) * dy - (world[1] - d.a[1]) * dx,
                  ) / length;
                return (
                  along >= 0.375 && along < length - 0.375 && across < 1 / 16
                );
              })
            ) {
              // A flush protected threshold belongs to the existing opening,
              // not a decorative grid. Contact height and floor occupancy stay exact.
              surfaceRole = "hull";
              column(
                `${family}:floor-door-threshold`,
                "floor",
                "trim",
                x,
                y,
                floor - 1,
                floor,
                family,
              );
              surfaceRole = "floor";
            } else if (room?.type === "corridor") {
              // Two deliberate circulation seams follow this room's long axis,
              // rather than bordering every metre of an otherwise calm deck.
              const horizontal =
                room.rect[2] - room.rect[0] >= room.rect[3] - room.rect[1];
              const q = horizontal ? y : x,
                centre = Math.round(
                  ((horizontal
                    ? room.rect[1] + room.rect[3]
                    : room.rect[0] + room.rect[2]) /
                    2) *
                    16,
                );
              if (
                Math.abs(q - centre) === 5 &&
                !approaches.some(
                  (a) =>
                    world[0] >= a.rect[0] &&
                    world[0] <= a.rect[2] &&
                    world[1] >= a.rect[1] &&
                    world[1] <= a.rect[3],
                )
              ) {
                surfaceRole = "hull";
                column(
                  `${family}:floor-circulation-binding`,
                  "floor",
                  "trim",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
                surfaceRole = "floor";
              }
            }
          }
        }
        // Three visible depth planes, backed by the same continuous sampled core.
        surfaceRole = "hull";
        // Protective frame is proud; armor is one cell recessed; charcoal service backing
        // remains exposed between plates. Broad bays replace per-voxel vertical striping.
        const along = boundary.alongAxis === 0 ? x : y;
        const phase = mod(along, profile.course);
        const bay = Math.floor(along / profile.course);
        let outward: Pt = [boundary.normalHint[0], boundary.normalHint[1]];
        if (
          insidePolygon(
            poly,
            p[0] + outward[0] * (distance + 1),
            p[1] + outward[1] * (distance + 1),
          )
        )
          outward = [-outward[0], -outward[1]];
        const outside: Pt = [
          (p[0] + outward[0] * (distance + 3)) / 16,
          (p[1] + outward[1] * (distance + 3)) / 16,
        ];
        const exposed =
          distance < 4 &&
          !blockedByAttachment(volume.id, outside, floor + 3, top - 2);
        const centreAlong = (bay * profile.course + profile.course / 2) / 16;
        const context: [number, number] = [
          (p[0] - outward[0] * (distance + 8)) / 16,
          (p[1] - outward[1] * (distance + 8)) / 16,
        ];
        context[boundary.alongAxis] = centreAlong;
        const room = doc.rooms.find(
          (r) =>
            context[0] >= r.rect[0] &&
            context[0] < r.rect[2] &&
            context[1] >= r.rect[1] &&
            context[1] < r.rect[3],
        );
        const nearInterface = interior.doors.some(
          (d) =>
            d.exterior &&
            Math.hypot(
              context[0] - (d.a[0] + d.b[0]) / 2,
              context[1] - (d.a[1] + d.b[1]) / 2,
            ) < 1.15,
        );
        const detailKind = !exposed
          ? 3
          : nearInterface
            ? 2
            : room?.type === "engineering" || room?.type === "workshop"
              ? 0
              : room
                ? 1
                : 0;
        const cassetteStart = Math.floor(profile.course / 2) - 8;
        const cassetteEnd = cassetteStart + 16;
        if (distance < 4) {
          if (distance >= 2)
            column(
              `${family}:pressure-backing`,
              "core",
              "secondary",
              x,
              y,
              floor,
              top,
              family,
            );
          const rib = mod(along, profile.rib) < 3;
          const low = floor + 4,
            high = Math.max(low + 1, top - 4);
          if (!shellNormal && distance < 1 && (rib || distance < 0.65)) {
            for (const [z0, z1] of [
              [floor, low],
              [high, top],
            ])
              column(
                `${family}:protective-frame`,
                "frame",
                "trim",
                x,
                y,
                z0,
                z1,
                family,
              );
            if (rib)
              column(
                `${family}:bay-frame`,
                "frame",
                "trim",
                x,
                y,
                low,
                high,
                family,
              );
          }
          if (
            distance >= 1 &&
            distance < (shellNormal ? 3 : 2) &&
            (shellNormal || (phase >= 4 && phase < profile.course - 4))
          ) {
            // A diagonal is one coherent neutral enclosure, not alternating narrow pale slats.
            const plateSlot = shellNormal
              ? "trim"
              : detailKind === 2 && phase > profile.course * 0.62
                ? "accent"
                : "primary";
            column(
              `${family}:inset-armor`,
              "plate",
              plateSlot,
              x,
              y,
              low,
              high,
              family,
            );
          }
          if (
            detailKind === 0 &&
            phase >= cassetteStart &&
            phase < cassetteEnd &&
            top - floor >= 12
          ) {
            const z0 = floor + 3,
              z1 = Math.min(top - 3, floor + 16);
            if (distance < 3)
              column(
                `${family}:vent-recess`,
                "void",
                "dark",
                x,
                y,
                z0,
                z1,
                family,
              );
            const cheek = phase < cassetteStart + 2 || phase >= cassetteEnd - 2;
            if (distance < 1 && cheek)
              column(
                `${family}:vent-cheek`,
                "frame",
                "primary",
                x,
                y,
                z0,
                z1,
                family,
              );
            if (distance < 1 && !shellNormal)
              for (const [a, b] of [
                [z0, z0 + 2],
                [z1 - 2, z1],
              ])
                column(
                  `${family}:vent-rim`,
                  "frame",
                  "primary",
                  x,
                  y,
                  a,
                  b,
                  family,
                );
            if (distance >= 1 && distance < 2 && !cheek)
              for (const z of [z0 + 3, z1 - 4])
                column(
                  `${family}:vent-louvre`,
                  "service",
                  "metal",
                  x,
                  y,
                  z,
                  z + 1,
                  family,
                );
          }
          // Purpose-built outer access cassette: proud guards, an open recessed face,
          // inset access lid and a handle. The backing is retained one full cell behind it.
          if (
            detailKind === 1 &&
            phase >= cassetteStart &&
            phase < cassetteEnd &&
            top >= floor + 12
          ) {
            const z0 = floor + 3,
              z1 = Math.min(top - 3, floor + 23);
            if (distance < 3)
              column(
                `${family}:cassette-well`,
                "void",
                "dark",
                x,
                y,
                z0,
                z1,
                family,
              );
            const guard = phase < cassetteStart + 2 || phase >= cassetteEnd - 2;
            if (distance < 1 && guard)
              column(
                `${family}:cassette-guard`,
                "frame",
                "metal",
                x,
                y,
                z0,
                z1,
                family,
              );
            if (distance < 1 && !shellNormal)
              for (const [a, b] of [
                [z0, z0 + 2],
                [z1 - 2, z1],
              ])
                column(
                  `${family}:cassette-rim`,
                  "frame",
                  "trim",
                  x,
                  y,
                  a,
                  b,
                  family,
                );
            if (
              distance >= 2 &&
              distance < 3 &&
              phase >= cassetteStart + 3 &&
              phase < cassetteEnd - 3
            )
              column(
                `${family}:cassette-lid`,
                "plate",
                "accent",
                x,
                y,
                z0 + 3,
                z1 - 3,
                family,
              );
            if (
              distance >= 1 &&
              distance < 2 &&
              phase >= cassetteEnd - 7 &&
              phase < cassetteEnd - 5
            )
              column(
                `${family}:cassette-handle`,
                "service",
                "metal",
                x,
                y,
                z0 + 5,
                z1 - 5,
                family,
              );
            if (
              distance >= 1 &&
              distance < 2 &&
              (phase === cassetteStart + 4 || phase === cassetteEnd - 5)
            )
              for (const z of [z0 + 3, z1 - 4])
                column(
                  `${family}:cassette-fastener`,
                  "service",
                  "metal",
                  x,
                  y,
                  z,
                  z + 1,
                  family,
                );
          }
          // One continuous quiet pressure return; stacked contrast courses made fine teeth dominant.
          if (distance < 3)
            column(
              `${family}:skirt-base`,
              "frame",
              "secondary",
              x,
              y,
              lo,
              floor,
              family,
            );
          if (distance >= 2 && deck && top > floor + 8) {
            surfaceRole = "wall";
            // Outward attachment occlusion cannot suppress the occupied room's inward equipment.
            // The middle pressure course stays solid between the two facade recesses.
            if (distance < 3)
              innerBackings.push({
                x,
                y,
                z0: floor + 3,
                z1: top - 3,
                normal: shellNormal,
              });
            if (distance >= 3) {
              column(
                `${family}:inner-gasket`,
                "core",
                "secondary",
                x,
                y,
                floor + 3,
                top - 3,
                family,
              );
              if (
                boundary.edgeT * boundary.edgeLength > 2 &&
                (1 - boundary.edgeT) * boundary.edgeLength > 2
              )
                column(
                  `${family}:inner-lower-panel`,
                  "plate",
                  "primary",
                  x,
                  y,
                  floor + 4,
                  top - 3,
                  family,
                );
              if (
                !shellNormal &&
                top >= floor + 27 &&
                (nearInterface ||
                  room?.type === "bridge" ||
                  room?.type === "engineering" ||
                  room?.type === "workshop" ||
                  (room && mod(bay, 2) === 0))
              ) {
                const inwardKind =
                  nearInterface || room?.type === "bridge"
                    ? 1
                    : room?.type === "engineering" || room?.type === "workshop"
                      ? 0
                      : room?.type === "quarters" ||
                          room?.type === "lounge" ||
                          room?.type === "cargo"
                        ? 2
                        : mod(bay, 3);
                const left = inwardKind === 1 ? 4 : 9,
                  right = Math.min(
                    profile.course - 3,
                    left + (inwardKind === 0 ? 18 : 15),
                  );
                const z0 = floor + (inwardKind === 1 ? 7 : 5),
                  z1 = floor + 20;
                if (phase >= left - 3 && phase < right + 3)
                  column(
                    `${family}:inner-casing-seat`,
                    "void",
                    "dark",
                    x,
                    y,
                    z0 - 2,
                    z1 + 2,
                    family,
                  );
                if (phase >= left - 2 && phase < right + 2) {
                  const cut = Math.max(
                    0,
                    2 - Math.min(phase - (left - 2), right + 1 - phase),
                  );
                  column(
                    `${family}:inner-manufactured-casing`,
                    "plate",
                    "primary",
                    x,
                    y,
                    z0 - 1 + cut,
                    z1 + 1 - cut,
                    family,
                  );
                  if (phase >= left && phase < right)
                    column(
                      `${family}:inner-casing-kicker`,
                      "frame",
                      "trim",
                      x,
                      y,
                      z0 - 1,
                      z0 + 1,
                      family,
                    );
                }
                if (phase >= left && phase < right) {
                  const border = phase < left + 2 || phase >= right - 2;
                  if (!border) {
                    column(
                      `${family}:inner-service-well`,
                      "void",
                      "dark",
                      x,
                      y,
                      z0 + 2,
                      z1 - 2,
                      family,
                    );
                    // Short protected inserts occupy selected positions in the well; most of it stays open.
                    if (inwardKind === 0) {
                      for (const z of [z0 + 4, z1 - 5])
                        column(
                          `${family}:inner-vent-fin`,
                          "service",
                          "metal",
                          x,
                          y,
                          z,
                          z + 1,
                          family,
                        );
                    } else if (inwardKind === 1) {
                      if (phase < left + 7)
                        column(
                          `${family}:inner-control-housing`,
                          "service",
                          "metal",
                          x,
                          y,
                          z0 + 3,
                          z1 - 3,
                          family,
                        );
                      if (phase >= left + 4 && phase < left + 6)
                        column(
                          `${family}:inner-control-lens`,
                          "service",
                          "emit_a",
                          x,
                          y,
                          z0 + 7,
                          z0 + 9,
                          family,
                        );
                      if (phase >= right - 5 && phase < right - 3)
                        column(
                          `${family}:inner-control-keybank`,
                          "service",
                          "primary",
                          x,
                          y,
                          z0 + 4,
                          z0 + 6,
                          family,
                        );
                    } else {
                      if (phase < right - 5)
                        column(
                          `${family}:inner-access-lid`,
                          "plate",
                          "accent",
                          x,
                          y,
                          z0 + 3,
                          z1 - 3,
                          family,
                        );
                      if (phase >= right - 5 && phase < right - 3)
                        column(
                          `${family}:inner-access-latch`,
                          "service",
                          "metal",
                          x,
                          y,
                          z0 + 6,
                          z1 - 5,
                          family,
                        );
                    }
                  }
                  if (phase === left + 1 || phase === right - 2)
                    for (const z of [z0 + 1, z1 - 2])
                      column(
                        `${family}:inner-service-fastener`,
                        "service",
                        "metal",
                        x,
                        y,
                        z,
                        z + 1,
                        family,
                      );
                }
                // A room task header has an opaque protective housing, not an exposed glow strip.
                if (phase >= 4 && phase < profile.course - 5) {
                  column(
                    `${family}:inner-task-header`,
                    "frame",
                    "trim",
                    x,
                    y,
                    floor + 22,
                    floor + 26,
                    family,
                  );
                  if (phase >= 6 && phase < profile.course - 7)
                    column(
                      `${family}:inner-task-lens`,
                      "service",
                      inwardKind === 0 ? "emit_b" : "emit_a",
                      x,
                      y,
                      floor + 23,
                      floor + 24,
                      family,
                    );
                }
                if (phase === left - 2)
                  column(
                    `${family}:inner-vertical-task-lens`,
                    "service",
                    "emit_b",
                    x,
                    y,
                    z0 + 3,
                    z1 - 3,
                    family,
                  );
              }
            }
          }
          surfaceRole = "hull";
          if (distance >= 2 && distance < 3)
            column(
              `${family}:cap`,
              "frame",
              "secondary",
              x,
              y,
              Math.max(floor, top - 1),
              top,
              family,
            );
        }
        if ((view === "flight" || !deck) && !bowGlass(tile)) {
          surfaceRole = "roof";
          column(
            `${family}:roof`,
            "roof",
            "secondary",
            x,
            y,
            hi - 2,
            hi - 1,
            family,
          );
          const chart = tileRoofCharts.get(tile);
          const slopedPatch = chart && Math.hypot(chart.dx, chart.dy) > 1e-6;
          if (slopedPatch) {
            roofChart = chart;
            // A clipped analytic plate exists before rasterization. Its fine treads share one
            // continuous pigment/skin; flat-roof cards, wells and hatches never stamp the slope.
            column(
              `${family}:sloped-pressure-skin`,
              "core",
              "secondary",
              x,
              y,
              hi - 1,
              hi,
              family,
            );
            if (distance >= 2)
              column(
                `${family}:sloped-roof-plate`,
                "plate",
                "primary",
                x,
                y,
                hi,
                hi + 1,
                family,
              );
            roofChart = undefined;
          } else {
            // A housed pressure tray, not independent cards on a thin sheet. Two broad
            // shoulders overlap along a real assembly joint and protect one recessed service
            // channel. Every pocket terminates before the source footprint ends/holes.
            const centreY = routeYs.reduce(
              (best, y) =>
                Math.abs(y - p[1]) < Math.abs(best - p[1]) ? y : best,
              routeYs[0],
            );
            const channelHalf = 4;
            const fromEnd = Math.min(x - bx, bX - 1 - x);
            const marked = roofMarkings.some((r) => inRect(p[0], p[1], r, 1));
            const mountClear = !roofObstacles.some((r) =>
              inRect(p[0], p[1], r, 2),
            );
            const channel =
              Math.abs(y - centreY) < channelHalf &&
              fromEnd >= 8 &&
              mountClear &&
              !marked;
            const serviceBelt =
              Math.abs(y - centreY) < channelHalf + 4 &&
              fromEnd >= 6 &&
              mountClear &&
              !marked;
            const joint = Math.round(bx + (bX - bx) * 0.58);
            const foreShoulder = x >= joint;
            const enclosure = roofCases.find((c) =>
              inRect(p[0], p[1], c.bounds),
            );
            const localX = enclosure
              ? Math.min(x - enclosure.bounds[0], enclosure.bounds[2] - 1 - x)
              : Infinity;
            const localY = enclosure
              ? Math.min(y - enclosure.bounds[1], enclosure.bounds[3] - 1 - y)
              : Infinity;
            const caseEdge = Math.min(localX, localY);
            const shapedCase =
              enclosure && localX + localY >= 4 && mountClear && !marked;
            const endInset = fromEnd < 4 ? 2 : 0;
            const shoulder = distance >= 2 + endInset && !serviceBelt;
            column(
              `${family}:roof-subframe`,
              "frame",
              "secondary",
              x,
              y,
              hi - 3,
              hi - 1,
              family,
            );
            if (shoulder) {
              // Offset front/rear case ends have broad 2–3 cell shoulders. Only the
              // genuine overlap joint gets a stepped lip, never each lattice-height tread.
              column(
                `${family}:roof-housed-shoulder`,
                "plate",
                deck ? "trim" : "primary",
                x,
                y,
                hi - 3,
                !deck && foreShoulder ? hi + 1 : hi - 1,
                family,
              );
              if (
                !deck &&
                !marked &&
                x >= joint - 2 &&
                x < joint + 2 &&
                distance >= 4 &&
                !serviceBelt
              )
                column(
                  `${family}:roof-shoulder-overlap`,
                  "plate",
                  "primary",
                  x,
                  y,
                  hi - 2,
                  hi + 1,
                  family,
                );
            }
            if (deck && shoulder && shapedCase) {
              // Broad clipped returns only at this real assembly boundary. The
              // raised skin joins its lower pressure tray through two shoulder
              // courses; the service route remains an actual contained recess.
              column(
                `${family}:roof-task-case:${enclosure.id}`,
                "plate",
                enclosure.kind === "utility" && caseEdge < 2
                  ? "trim"
                  : "primary",
                x,
                y,
                hi - 2,
                caseEdge < 1
                  ? hi - 1
                  : caseEdge < macro.roofShoulder
                    ? hi
                    : hi + 1,
                family,
              );
              if (
                caseEdge >= 3 &&
                enclosure.kind === "habitation" &&
                x < enclosure.bounds[0] + 7 &&
                y < enclosure.bounds[1] + 18
              )
                column(
                  `${family}:roof-control-access:${enclosure.id}`,
                  "plate",
                  "accent",
                  x,
                  y,
                  hi,
                  hi + 1,
                  family,
                );
            }
            if (
              deck &&
              shoulder &&
              shapedCase &&
              caseEdge >= 3 &&
              !serviceBelt
            ) {
              const [a, b, A, B] = enclosure.bounds;
              // One offset inset beside each real cluster. The long clear side is
              // selected by the same footprint, so the opening joins its case and
              // cannot cover the already-working equipment/service apertures.
              const across = y - b;
              const pocketWidth = Math.min(22, Math.floor((A - a) * 0.4));
              const pocketLeft = a + (enclosure.kind === "utility" ? 4 : 7);
              const pocket =
                pocketWidth >= 12 &&
                !shoulderFields.some((f) => inRect(p[0], p[1], f.bounds)) &&
                x >= pocketLeft &&
                x < pocketLeft + pocketWidth &&
                across >= 4 &&
                across < Math.min(15, B - b - 4);
              if (pocket) {
                const pocketStart = layers.length;
                column(
                  `${family}:roof-cluster-well:${enclosure.id}`,
                  "void",
                  "dark",
                  x,
                  y,
                  hi - 1,
                  hi + 1,
                  family,
                );
                column(
                  `${family}:roof-cluster-backing:${enclosure.id}`,
                  "frame",
                  "trim",
                  x,
                  y,
                  hi - 2,
                  hi - 1,
                  family,
                );
                if (enclosure.kind === "utility" && mod(across - 4, 5) < 2)
                  column(
                    `${family}:roof-cluster-vent:${enclosure.id}`,
                    "service",
                    "metal",
                    x,
                    y,
                    hi - 1,
                    hi,
                    family,
                  );
                else if (
                  enclosure.kind !== "utility" &&
                  x >= pocketLeft + 3 &&
                  x < pocketLeft + pocketWidth - 3 &&
                  across >= 6 &&
                  across < Math.min(13, B - b - 6)
                )
                  column(
                    `${family}:roof-cluster-access:${enclosure.id}`,
                    "plate",
                    "accent",
                    x,
                    y,
                    hi - 1,
                    hi,
                    family,
                  );
                pendingRoofClusterLayers.push(...layers.splice(pocketStart));
              }
            }
            const field = shoulderFields.find((f) =>
              inRect(p[0], p[1], f.bounds),
            );
            if (deck && field && shoulder && !serviceBelt) {
              const [a, b, A, B] = field.bounds;
              const edge = Math.min(x - a, A - 1 - x, y - b, B - 1 - y);
              const corner =
                Math.min(x - a, A - 1 - x) + Math.min(y - b, B - 1 - y);
              if (corner >= 2) {
                column(
                  `${family}:roof-shoulder-enclosure:${field.id}`,
                  "plate",
                  "primary",
                  x,
                  y,
                  hi - 2,
                  hi + 1,
                  family,
                );
                if (edge >= 2) {
                  column(
                    `${family}:roof-shoulder-well:${field.id}`,
                    "void",
                    "dark",
                    x,
                    y,
                    hi - 1,
                    hi + 1,
                    family,
                  );
                  column(
                    `${family}:roof-shoulder-backing:${field.id}`,
                    "frame",
                    "trim",
                    x,
                    y,
                    hi - 2,
                    hi - 1,
                    family,
                  );
                  if (
                    field.kind === "vent" &&
                    x >= a + 4 &&
                    x < A - 4 &&
                    mod(y - b, 5) < 2
                  )
                    column(
                      `${family}:roof-shoulder-louver:${field.id}`,
                      "service",
                      "metal",
                      x,
                      y,
                      hi - 1,
                      hi,
                      family,
                    );
                  else if (field.kind === "access") {
                    column(
                      `${family}:roof-shoulder-access:${field.id}`,
                      "plate",
                      "trim",
                      x,
                      y,
                      hi - 1,
                      hi,
                      family,
                    );
                    if (x >= A - 6 && x < A - 4 && y >= b + 4 && y < b + 6)
                      column(
                        `${family}:roof-shoulder-latch:${field.id}`,
                        "service",
                        "metal",
                        x,
                        y,
                        hi,
                        hi + 1,
                        family,
                      );
                  }
                }
              }
            }
            if (channel) {
              column(
                `${family}:roof-protected-channel`,
                "void",
                "dark",
                x,
                y,
                hi - 3,
                hi + 2,
                family,
              );
              // Continuous pressure floor remains below the 3-cell well. Two service
              // sections have distinct functions, not an A/B/C/D wallpaper cadence.
              const cassetteX =
                trayCassetteX.get(centreY) ?? Number.NEGATIVE_INFINITY;
              const cassette = x >= cassetteX && x < cassetteX + 12;
              if (cassette) {
                column(
                  `${family}:roof-access-cassette`,
                  "service",
                  "trim",
                  x,
                  y,
                  hi - 3,
                  hi - 1,
                  family,
                );
                if (
                  x >= cassetteX + 8 &&
                  x < cassetteX + 10 &&
                  Math.abs(y - centreY) < 2
                )
                  column(
                    `${family}:roof-access-latch`,
                    "service",
                    "metal",
                    x,
                    y,
                    hi - 1,
                    hi,
                    family,
                  );
              } else if (
                x > joint + 8 &&
                x < bX - 10 &&
                mod(x - joint, 6) < 2
              ) {
                column(
                  `${family}:roof-cooling-louver`,
                  "service",
                  "trim",
                  x,
                  y,
                  hi - 3,
                  hi - 1,
                  family,
                );
              }
            } else if (serviceBelt) {
              column(
                `${family}:roof-channel-guard`,
                "frame",
                "trim",
                x,
                y,
                hi - 3,
                hi,
                family,
              );
            }
          }
        }
        // Bow sill and structural brow: real sampled bands around the optical roof aperture.
        if (
          tile.bow &&
          bowGlass(tile) &&
          distance >= 1 &&
          distance < 3 &&
          !shellNormal
        ) {
          column(
            `${family}:brow`,
            "frame",
            "trim",
            x,
            y,
            hi - 3,
            hi + 1,
            family,
          );
          column(
            `${family}:sill`,
            "frame",
            "trim",
            x,
            y,
            lo,
            Math.min(hi, lo + 4),
            family,
          );
        }
      }
    // Final whole-cluster pocket overlay follows ALL generic casing heights.
    // Otherwise compacting first appearances of unequal case courses can move a
    // later occupied course over an earlier column's intended aperture.
    layers.push(...pendingRoofClusterLayers);
    // Seal the continuous tray after facade voids too: an outboard route can share
    // columns with a side cassette, whose later compacted void must never pierce it.
    surfaceRole = "roof";
    shellNormal = undefined;
    roofChart = undefined;
    if (view === "flight" || !deck)
      for (let y = by; y < bY; y++)
        for (let x = bx; x < bX; x++) {
          const p: Pt = [x + 0.5, y + 0.5],
            world: Pt = [p[0] / 16, p[1] / 16];
          if (
            !insidePolygon(poly, p[0], p[1]) ||
            holes.some((h) => insidePolygon(h, p[0], p[1]))
          )
            continue;
          const tile = tileCells
            .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
            ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
          if (!tile || tile.bow) continue;
          const hi = Math.ceil(bowHeights(tile, volume.height, world)[1]);
          column(
            `${family}:roof-pressure-tray`,
            "core",
            "secondary",
            x,
            y,
            hi - 5,
            hi - 3,
            family,
          );
        }
    // Functional pockets are an explicit final overlay after all continuous route
    // courses. Per-column compaction must not reorder a later route void over a lid.
    surfaceRole = "roof";
    shellNormal = undefined;
    roofChart = undefined;
    if (view === "flight" || !deck)
      for (const patch of roofPatches) {
        const [a, b, A, B] = patch.bounds;
        for (let y = b; y < B; y++)
          for (let x = a; x < A; x++) {
            const p: Pt = [x + 0.5, y + 0.5];
            const world: Pt = [p[0] / 16, p[1] / 16];
            if (
              !insidePolygon(poly, p[0], p[1]) ||
              holes.some((h) => insidePolygon(h, p[0], p[1]))
            )
              continue;
            const tile = tileCells
              .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
              ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
            if (
              !tile ||
              tile.bow ||
              roofMarkings.some((r) => inRect(p[0], p[1], r, 1)) ||
              roofObstacles.some((r) => inRect(p[0], p[1], r, 2))
            )
              continue;
            const hi = Math.ceil(bowHeights(tile, volume.height, world)[1]);
            const edgeX = Math.min(x - a, A - 1 - x),
              edgeY = Math.min(y - b, B - 1 - y);
            if (edgeX + edgeY < 3) continue;
            const rim = edgeX < 2 || edgeY < 2;
            column(
              `${family}:roof-functional-pocket`,
              "void",
              "dark",
              x,
              y,
              hi - 2,
              hi + 2,
              family,
            );
            if (rim)
              column(
                `${family}:roof-pocket-housing`,
                "frame",
                "trim",
                x,
                y,
                hi - 3,
                hi + 1,
                family,
              );
            else if (patch.kind === "access") {
              column(
                `${family}:roof-offset-access`,
                "service",
                "accent",
                x,
                y,
                hi - 2,
                hi - 1,
                family,
              );
              if (x >= A - 6 && x < A - 4 && y >= b + 5 && y < B - 5)
                column(
                  `${family}:roof-pocket-latch`,
                  "service",
                  "metal",
                  x,
                  y,
                  hi - 1,
                  hi,
                  family,
                );
            } else if (mod(x - a, 6) < 2)
              column(
                `${family}:roof-pocket-fin`,
                "service",
                "metal",
                x,
                y,
                hi - 2,
                hi,
                family,
              );
          }
      }
    // Seal the middle course after all facade voids. This is a distinct final source layer,
    // so column compaction cannot reorder an outer cassette void over pressure backing.
    surfaceRole = "wall";
    for (const backing of innerBackings) {
      shellNormal = backing.normal;
      column(
        `${family}:inner-service-backing`,
        "core",
        "secondary",
        backing.x,
        backing.y,
        backing.z0,
        backing.z1,
        family,
      );
    }
    surfaceRole = "hull";
    // Continuous pressure-skirt and sill segments. Sample the coherent molded source
    // on the global lattice; never decorate a diagonal with one large cube per step.
    for (let y = by - 2; y < bY + 2; y++)
      for (let x = bx - 2; x < bX + 2; x++) {
        const p: Pt = [x + 0.5, y + 0.5],
          boundary = polygonBoundarySample(p, poly);
        const inside = insidePolygon(poly, p[0], p[1]);
        if (
          !inside ||
          boundary.distance > 1 ||
          holes.some((h) => insidePolygon(h, p[0], p[1]))
        )
          continue;
        const inward = inside ? 1 : boundary.distance + 1;
        const world: Pt = [
          (p[0] - boundary.normalHint[0] * inward) / 16,
          (p[1] - boundary.normalHint[1] * inward) / 16,
        ];
        const tile = tileCells
          .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
          ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
        if (!tile) continue;
        const [rawLo, rawHi] = bowHeights(tile, volume.height, world);
        const lo = Math.floor(rawLo),
          hi = tile.bow ? Math.floor(rawHi) : Math.ceil(rawHi);
        const floor = tile.bow
          ? lo + G.bowProfiles.shellThicknessTexels[volume.height][0]
          : deck
            ? G.deck.floorTopTexels
            : lo + 2;
        const top =
          view === "deck" && deck ? Math.min(hi, G.deck.shellCutTexels) : hi;
        shellNormal =
          Math.abs(boundary.normalHint[0]) > 0.01 &&
          Math.abs(boundary.normalHint[1]) > 0.01
            ? boundary.normalHint
            : undefined;
        column(
          `${family}:continuous-sill`,
          "frame",
          "secondary",
          x,
          y,
          lo,
          Math.max(lo + 1, floor),
          family,
        );
        // Occasional guard posts belong to real bay ends, not every exposed slope cell.
        const along = boundary.alongAxis === 0 ? x : y;
        if (
          !inside &&
          !shellNormal &&
          mod(along, profile.course) < 2 &&
          mod(Math.floor(along / profile.course), 3) !== 2
        )
          column(
            `${family}:outer-bay-guard`,
            "frame",
            "trim",
            x,
            y,
            floor + 3,
            top - 2,
            family,
          );
      }
    const roofServiceFootprint = new Set<string>();
    for (const l of layers.filter(
      (l) =>
        l.support === family &&
        (l.id.endsWith(":roof-protected-channel") ||
          l.id.endsWith(":roof-functional-pocket")),
    ))
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++)
          roofServiceFootprint.add(`${x},${y}`);
    // Emitted void names can be buried by later occupied subframes. Only actual
    // surviving backed wells/function protect an edge from source reconstruction.
    const beforeBoundary = sampleShipVisualLayers(
      compactColumns(layers.filter((l) => l.support === family)),
    );
    const survivingService = new Set<string>();
    const serviceColumns = new Map<string, ShipVisualLayer[]>();
    for (const l of layers.filter(
      (l) =>
        l.support === family &&
        [":roof-protected-channel", ":roof-functional-pocket"].some((s) =>
          l.id.endsWith(s),
        ),
    ))
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          const key = `${x},${y}`;
          serviceColumns.set(key, [...(serviceColumns.get(key) ?? []), l]);
        }
    for (const key of roofServiceFootprint) {
      const [x, y] = key.split(",").map(Number);
      if (
        serviceColumns.get(key)?.some((l) => {
          const bottom = l.bounds[2];
          const open =
            !beforeBoundary.has(visualCellKey(x, y, bottom)) &&
            !beforeBoundary.has(visualCellKey(x, y, bottom + 1));
          const functionPresent = [bottom, bottom + 1, bottom + 2].some(
            (z) =>
              beforeBoundary.get(visualCellKey(x, y, z))?.role === "service",
          );
          // A local pocket may overlap the existing one-cell-deeper service
          // route. Check its actual floor, not the nominal overlay's bottom.
          const sealedSupport = [bottom - 1, bottom - 2].some((z) => {
            const c = beforeBoundary.get(visualCellKey(x, y, z));
            if (!c || !["core", "frame", "roof", "plate"].includes(c.role))
              return false;
            const topCore = c.role === "core" ? z : z - 1;
            return [topCore, topCore - 1].every(
              (q) =>
                beforeBoundary.get(visualCellKey(x, y, q))?.role === "core",
            );
          });
          return (open && sealedSupport) || functionPresent;
        })
      )
        survivingService.add(key);
    }
    // R13 reconstructs the actual old exposed owners, instead of dressing another
    // sloping row over cassette-rim/subframe/pressure-tray. Tall and shallow sections
    // are distinct; the nonwalkable five-cell tray never inherits the seven-cell gate.
    for (let y = by; y < bY; y++)
      for (let x = bx; x < bX; x++) {
        const p: Pt = [x + 0.5, y + 0.5];
        if (
          !insidePolygon(poly, ...p) ||
          holes.some((h) => insidePolygon(h, ...p))
        )
          continue;
        const boundary = polygonBoundarySample(p, poly);
        if (boundary.distance >= 4) continue;
        const world: Pt = [p[0] / 16, p[1] / 16];
        const tile = tileCells
          .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
          ?.find((t) => insidePolygon(t.poly, ...world))?.tile;
        if (!tile || bowGlass(tile)) continue;
        const [rawLo, rawHi] = bowHeights(tile, volume.height, world),
          lo = Math.floor(rawLo),
          hi = tile.bow ? Math.floor(rawHi) : Math.ceil(rawHi);
        const floor = tile.bow
          ? lo + G.bowProfiles.shellThicknessTexels[volume.height][0]
          : deck
            ? G.deck.floorTopTexels
            : lo + 2;
        const top =
          view === "deck" && deck ? Math.min(hi, G.deck.shellCutTexels) : hi;
        const endDistance =
          Math.min(boundary.edgeT, 1 - boundary.edgeT) * boundary.edgeLength;
        const a = poly[boundary.edgeIndex],
          b = poly[(boundary.edgeIndex + 1) % poly.length];
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        let out: Pt = [boundary.normalHint[0], boundary.normalHint[1]];
        if (
          insidePolygon(
            poly,
            p[0] + out[0] * (boundary.distance + 2),
            p[1] + out[1] * (boundary.distance + 2),
          )
        )
          out = [-out[0], -out[1]];
        const signed: [number, number, number] = [
          Math.sign(out[0]),
          Math.sign(out[1]),
          0,
        ];
        const diagonal =
          Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6 && Math.abs(dx) > 1e-6;
        const intercept = Math.round(signed[0] * a[0] + signed[1] * a[1]) - 1;
        const q = signed[0] * p[0] + signed[1] * p[1];
        // One original OUTER occupied row owns the entire manufactured casing.
        // Palette/height returns never select a parallel inboard clipping plane.
        // Chebyshev raw rings protect source holes, true segment ends and attached
        // volume interfaces. Current damage subsequently recomputes exact shared faces.
        const rawGuard =
          endDistance < 3 ||
          holes.some((h) => polygonBoundarySample(p, h).distance <= 2) ||
          assemblies.some(
            (other) =>
              other.volume.id !== volume.id &&
              [-1, 0, 1].some((X) =>
                [-1, 0, 1].some((Y) =>
                  insidePolygon(
                    other.geometry.outline?.outer ?? [],
                    world[0] + X / 16,
                    world[1] + Y / 16,
                  ),
                ),
              ),
          );
        const plane = (d: number): ShipVisualLayer["facet"] =>
          diagonal && !rawGuard && q === d
            ? { id: `${family}:case:${boundary.edgeIndex}:${d}`, a: signed, d }
            : undefined;
        shellNormal = undefined;
        sidePlane = undefined;
        roofChart = undefined;
        surfaceRole = deck && view === "deck" ? "wall" : "hull";
        facetPlane = undefined;
        if (survivingService.has(`${x},${y}`)) {
          // Keep actual well/bank geometry; only its original external pressure
          // side uses the same manufactured plane. Aperture caps stay axis-hard.
          const facet = plane(intercept);
          if (facet)
            for (let z = lo; z < top; z++) {
              const c = beforeBoundary.get(visualCellKey(x, y, z));
              if (
                !c ||
                !["core", "frame"].includes(c.role) ||
                c.slot !== "secondary"
              )
                continue;
              layers.push({
                id: `${family}:retained-route-pressure-side`,
                role: c.role,
                slot: c.slot,
                bounds: [x, y, z, x + 1, y + 1, z + 1],
                support: family,
                surfaceRole: c.surfaceRole,
                facet,
              });
            }
          continue;
        }
        const outerFinish = (z0: number, z1: number) => {
          if (
            boundary.distance >= 2 ||
            protectedInterface(world) ||
            z1 - z0 < 5
          )
            return;
          const along = boundary.edgeT * boundary.edgeLength;
          const start =
            Math.floor(along / macro.armorSection) * macro.armorSection;
          const end = Math.min(boundary.edgeLength, start + macro.armorSection);
          const centre = (start + end) / 2;
          const probe: Pt = [
            (a[0] + (dx * centre) / boundary.edgeLength - out[0] * 8) / 16,
            (a[1] + (dy * centre) / boundary.edgeLength - out[1] * 8) / 16,
          ];
          const room = doc.rooms.find(
            (r) =>
              probe[0] >= r.rect[0] &&
              probe[0] < r.rect[2] &&
              probe[1] >= r.rect[1] &&
              probe[1] < r.rect[3],
          );
          const outside: Pt = [
            world[0] + (out[0] * 3) / 16,
            world[1] + (out[1] * 3) / 16,
          ];
          const exposed = !blockedByAttachment(volume.id, outside, z0, z1);
          const projectedRoom = room
            ? (((room.rect[0] + room.rect[2]) * 8 - a[0]) * dx +
                ((room.rect[1] + room.rect[3]) * 8 - a[1]) * dy) /
              boundary.edgeLength
            : Infinity;
          const selected =
            exposed && projectedRoom >= start && projectedRoom < end;
          const kind =
            selected && ["engineering", "workshop"].includes(room!.type)
              ? "vent"
              : selected &&
                  ["bridge", "cargo", "quarters", "lounge", "galley"].includes(
                    room!.type,
                  )
                ? "access"
                : "armor";
          const u = along - start;
          const corner = Math.max(0, macro.corner - Math.min(u, end - along));
          const low = z0 + macro.bindingHeight + Math.ceil(corner),
            high = z1 - macro.bindingHeight - Math.ceil(corner);
          const owned = `${family}:exposed-bay:${boundary.edgeIndex}:${start}:${kind}`;
          const savedSurface = surfaceRole;
          surfaceRole = "hull";
          // Retain the support identity below the shallow top package. Visible
          // armor pigment need not turn continuous pressure cells into decor.
          const finish = (
            name: string,
            slot: ShipKitSlot,
            low: number,
            high: number,
          ) => {
            for (let z = low; z < high; z++)
              column(
                name,
                !deck && z >= hi - 3 ? "frame" : "core",
                slot,
                x,
                y,
                z,
                z + 1,
                family,
              );
          };
          finish(`${owned}:case`, "trim", z0, z1);
          if (high > low) {
            // Axis-aligned bays retain their actual one-course armor seat and
            // finite lower/upper returns. Only the signed45 boundary shares its
            // FIRST outer row: eroding that row would double total recession.
            if (!diagonal && boundary.distance < 1)
              column(
                `${owned}:armor-seat`,
                "void",
                "dark",
                x,
                y,
                low,
                deck ? high : Math.min(high, hi - 5),
                family,
              );
            // Broad armor and its upper/lower bindings share the actual FIRST
            // OUTER plane. Recess depth belongs to selected backed service wells,
            // not to an outboard parallel rail left around every quiet armor bay.
            const oldFacet = facetPlane;
            facetPlane = plane(intercept);
            if (diagonal || boundary.distance >= 1)
              finish(`${owned}:armor`, "primary", low, high);
            facetPlane = oldFacet;
          }
          if (kind === "armor" || high - low < 5) {
            surfaceRole = savedSurface;
            return;
          }
          const width = kind === "vent" ? macro.ventWidth : macro.accessWidth;
          const left = Math.max(3, (end - start - width) * 0.32),
            right = left + width;
          const bottom = Math.max(low + 1, z0 + 5),
            ceiling = Math.min(
              high - 1,
              bottom + macro.ventHeight,
              deck ? high : hi - 5,
            );
          if (u < left || u >= right || ceiling <= bottom) {
            surfaceRole = savedSurface;
            return;
          }
          if (!deck || boundary.distance < 1)
            column(
              `${owned}:well`,
              "void",
              "dark",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
          // Every insert remains inside the original finish courses. Two deeper
          // continuous role-core courses back the actual open well.
          const savedFacet = facetPlane;
          facetPlane = undefined;
          if (
            (deck ? boundary.distance < 1 : boundary.distance >= 1) &&
            kind === "vent" &&
            Math.floor(u - left) % 6 < 2
          )
            column(
              `${owned}:louver`,
              "service",
              "metal",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
          else if (boundary.distance >= 1 && kind === "access") {
            column(
              `${owned}:hatch`,
              deck ? "core" : "plate",
              "accent",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
            if (!deck && u >= right - 4 && u < right - 2)
              column(
                `${owned}:latch`,
                "service",
                "metal",
                x,
                y,
                bottom + 2,
                Math.min(ceiling, bottom + 4),
                family,
              );
          }
          facetPlane = savedFacet;
          surfaceRole = savedSurface;
        };
        const inwardFinish = () => {
          if (
            !deck ||
            view !== "deck" ||
            boundary.distance < 3 ||
            protectedInterface(world) ||
            endDistance < 3 ||
            top - floor < 13
          )
            return;
          const oldSurface = surfaceRole;
          surfaceRole = "wall";
          facetPlane = undefined;
          const along = boundary.edgeT * boundary.edgeLength;
          const probe: Pt = [
            (p[0] - out[0] * 8) / 16,
            (p[1] - out[1] * 8) / 16,
          ];
          const room = doc.rooms.find(
            (r) =>
              probe[0] >= r.rect[0] &&
              probe[0] < r.rect[2] &&
              probe[1] >= r.rect[1] &&
              probe[1] < r.rect[3],
          );
          // The inward face owns one existing course, independent of the outer
          // case reconstruction. Two pressure courses separate opposing seats.
          column(
            `${family}:inward-enclosure`,
            "plate",
            "primary",
            x,
            y,
            floor + 3,
            top - 2,
            family,
          );
          column(
            `${family}:inward-kicker`,
            "frame",
            "trim",
            x,
            y,
            floor + 1,
            floor + 3,
            family,
          );
          if (
            !room ||
            occupiedFloorRects.some(
              (r) =>
                world[0] >= r[0] &&
                world[0] <= r[2] &&
                world[1] >= r[1] &&
                world[1] <= r[3],
            )
          ) {
            surfaceRole = oldSurface;
            return;
          }
          const chosen = wallTasksFor(`${family}:${boundary.edgeIndex}`, a, b, [
            -out[0],
            -out[1],
          ]).find((t) => t.room.id === room.id && along >= t.u && along < t.U);
          if (!chosen) {
            surfaceRole = oldSurface;
            return;
          }
          const { key, u: left, U: right } = chosen;
          const task = macro.wallTasks[key];
          const bottom = floor + task.bottom,
            ceiling = Math.min(top - 3, bottom + task.height);
          if (
            right - left < 12 ||
            ceiling - bottom < (task.insert === "control" ? 13 : 11) ||
            along < left ||
            along >= right
          ) {
            surfaceRole = oldSurface;
            return;
          }
          const taskStart = layers.length;
          const cut = Math.max(
            0,
            macro.corner - Math.min(along - left, right - along),
          );
          const lower = bottom + Math.ceil(cut),
            upper = ceiling - Math.ceil(cut);
          const owned = `${family}:inward-task:${room.id}:${key}`;
          column(
            `${owned}:seat`,
            "void",
            "dark",
            x,
            y,
            bottom,
            ceiling,
            family,
          );
          column(
            `${owned}:clipped-casing`,
            "plate",
            "primary",
            x,
            y,
            lower,
            upper,
            family,
          );
          if (
            along >= left + 2 &&
            along < right - 2 &&
            upper - lower >= (task.insert === "control" ? 12 : 10)
          ) {
            column(
              `${owned}:well`,
              "void",
              "dark",
              x,
              y,
              lower + 3,
              upper - 3,
              family,
            );
            if (task.insert === "vent") {
              for (const z of [lower + 4, upper - 5])
                column(
                  `${owned}:louver`,
                  "service",
                  "metal",
                  x,
                  y,
                  z,
                  z + 1,
                  family,
                );
            } else if (task.insert === "control") {
              if (along < right - 5)
                column(
                  `${owned}:keybank`,
                  "service",
                  "metal",
                  x,
                  y,
                  lower + 3,
                  lower + 5,
                  family,
                );
            } else if (along < right - 5) {
              column(
                `${owned}:access`,
                "plate",
                key === "quarters" ? "accent" : "trim",
                x,
                y,
                lower + 4,
                upper - 4,
                family,
              );
            }
            if (along >= right - 4 && along < right - 3)
              column(
                `${owned}:task-lens`,
                "service",
                "emit_b",
                x,
                y,
                lower + 5,
                upper - 4,
                family,
              );
            // Selected room assemblies share pressure support, but their visible
            // hardware is not the same rectangular access lid in every room.
            const split = left + Math.floor((right - left) * 0.65);
            if (task.form === "relay" || task.form === "workbench") {
              if (along >= split && along < split + 1)
                column(
                  `${owned}:split-binding`,
                  "frame",
                  "trim",
                  x,
                  y,
                  lower + 3,
                  upper - 3,
                  family,
                );
              if (along >= split + 2 && along < right - 3)
                for (let z = lower + 4; z < upper - 3; z += 3)
                  column(
                    `${owned}:protected-relay`,
                    "service",
                    task.form === "relay" ? "accent" : "metal",
                    x,
                    y,
                    z,
                    z + 1,
                    family,
                  );
            } else if (task.form === "instrument") {
              if (along >= left + 4 && along < left + (right - left) * 0.55)
                column(
                  `${owned}:medical-monitor`,
                  "service",
                  "emit_a",
                  x,
                  y,
                  lower + 7,
                  Math.min(upper - 3, lower + 9),
                  family,
                );
              if (along >= split && along < split + 1)
                column(
                  `${owned}:storage-binding`,
                  "frame",
                  "primary",
                  x,
                  y,
                  lower + 3,
                  upper - 3,
                  family,
                );
            } else if (task.form === "backsplash" || task.form === "living") {
              if (along >= left + 3 && along < right - 3) {
                column(
                  `${owned}:utility-shelf`,
                  "service",
                  "metal",
                  x,
                  y,
                  lower + 4,
                  lower + 5,
                  family,
                );
                column(
                  `${owned}:warm-task-lens`,
                  "service",
                  "emit_b",
                  x,
                  y,
                  upper - 4,
                  upper - 3,
                  family,
                );
              }
            } else if (
              task.form === "cargo" &&
              ((along >= left + 4 && along < left + 6) ||
                (along >= right - 6 && along < right - 4))
            )
              column(
                `${owned}:cargo-latch`,
                "service",
                "metal",
                x,
                y,
                lower + 4,
                upper - 4,
                family,
              );
          }
          if (
            task.insert === "control" &&
            along >= left + 3 &&
            along < right - 3
          )
            column(
              `${owned}:header`,
              "service",
              "emit_a",
              x,
              y,
              upper - 2,
              upper - 1,
              family,
            );
          column(
            `${owned}:lower-binding`,
            "frame",
            "trim",
            x,
            y,
            lower,
            lower + 2,
            family,
          );
          deferWallTask(
            chosen,
            `${family}:${boundary.edgeIndex}:inward`,
            family,
            taskStart,
          );
          surfaceRole = oldSurface;
        };
        if (deck && boundary.distance >= 1 && boundary.distance < 3) {
          // Reassert the two central pressure planes after the legacy decorative
          // recipe. Each face then owns at most its one outer finish course.
          column(
            `${family}:two-sided-pressure-core`,
            "core",
            "secondary",
            x,
            y,
            floor,
            top - 1,
            family,
          );
        }
        if (!deck) {
          if (hi - lo < 5) continue;
          column(
            `${family}:shallow-case-clear`,
            "void",
            "dark",
            x,
            y,
            hi - 3,
            hi + 2,
            family,
          );
          facetPlane = plane(intercept);
          column(
            `${family}:shallow-keel-support`,
            "core",
            "secondary",
            x,
            y,
            lo,
            hi - 3,
            family,
          );
          column(
            `${family}:shallow-pressure-tray`,
            "core",
            "secondary",
            x,
            y,
            hi - 5,
            hi - 3,
            family,
          );
          column(
            `${family}:shallow-neutral-subframe`,
            "frame",
            boundary.distance >= 2 ? "primary" : "trim",
            x,
            y,
            hi - 3,
            hi - 1,
            family,
          );
          outerFinish(lo + 2, hi - 1);
          facetPlane = undefined;
          if (boundary.distance < 4) {
            facetPlane = plane(intercept);
            column(
              `${family}:shallow-offset-armor`,
              "plate",
              "primary",
              x,
              y,
              hi - 1,
              hi,
              family,
            );
            facetPlane = undefined;
          }
          // Local overlap ends are finite manufacturing joints, not a repeated guard.
          if (endDistance >= 3 && endDistance < 7 && boundary.distance >= 3)
            column(
              `${family}:shallow-case-end`,
              "plate",
              "primary",
              x,
              y,
              hi - 1,
              hi + 1,
              family,
            );
        } else if (diagonal && top > floor + 3) {
          // Old lower sill and exposed pressure backing share the same actual XY
          // finish plane. The walkable floor/contact course itself remains raw.
          facetPlane = plane(intercept);
          column(
            `${family}:diagonal-lower-support`,
            "core",
            "secondary",
            x,
            y,
            lo,
            Math.max(lo, floor - 1),
            family,
          );
          facetPlane = undefined;
          column(
            `${family}:diagonal-contact-course`,
            "core",
            "secondary",
            x,
            y,
            floor - 1,
            floor,
            family,
          );
          column(
            `${family}:diagonal-case-clear`,
            "void",
            "dark",
            x,
            y,
            floor,
            top + 1,
            family,
          );
          facetPlane = plane(intercept);
          column(
            `${family}:diagonal-pressure-case`,
            "core",
            "secondary",
            x,
            y,
            floor,
            top - 1,
            family,
          );
          outerFinish(floor, top - 1);
          facetPlane = undefined;
          if (boundary.distance < 4) {
            facetPlane = plane(intercept);
            column(
              `${family}:diagonal-inset-lip`,
              "core",
              "primary",
              x,
              y,
              top - macro.bindingHeight,
              top,
              family,
            );
            facetPlane = undefined;
          }
        } else if (top > floor + 3) {
          outerFinish(floor, top - 1);
        }
        inwardFinish();
      }
    facetPlane = undefined;
  }
  shellNormal = undefined;
  surfaceRole = "wall";
  if (view === "deck") {
    const ft = G.deck.floorTopTexels,
      cap = G.deck.interiorCutTexels + ft;
    const edge = (
      id: string,
      a: Pt,
      b: Pt,
      jamb = false,
      glazed = false,
      half = false,
    ) => {
      const wallCap = half
        ? ft + 14
        : jamb || glazed
          ? cap
          : ft + macro.partitionCut;
      const ax = a[0] * 16,
        ay = a[1] * 16,
        bx = b[0] * 16,
        by = b[1] * 16;
      const vertical = Math.abs(ax - bx) < 1e-6,
        span = Math.hypot(bx - ax, by - ay);
      if (!vertical && Math.abs(ay - by) > 1e-6) return; // sampled exterior polygon band already owns slope edges
      const x0 = Math.min(ax, bx),
        y0 = Math.min(ay, by),
        x1 = Math.max(ax, bx),
        y1 = Math.max(ay, by);
      const bounds = vertical
        ? [x0 - 2, y0, ft, x1 + 2, y1, wallCap]
        : [x0, y0 - 2, ft, x1, y1 + 2, wallCap];
      const family = `edge:${id}`;
      const core = [...bounds];
      if (vertical) {
        core[0] += 1;
        core[3] -= 1;
      } else {
        core[1] += 1;
        core[4] -= 1;
      }
      box(`${id}:core`, "core", "secondary", core, family);
      for (let start = 0; start < span; start += profile.course) {
        const end = Math.min(span, start + profile.course);
        const Z = glazed ? ft + 11 : wallCap - 1;
        const surface = (
          side: number,
          u: number,
          U: number,
          z: number,
          Z: number,
          depth = 0,
        ): number[] =>
          vertical
            ? [
                x0 + (side < 0 ? -2 + depth : 1 - depth),
                y0 + u,
                z,
                x0 + (side < 0 ? -1 + depth : 2 - depth),
                y0 + U,
                Z,
              ]
            : [
                x0 + u,
                y0 + (side < 0 ? -2 + depth : 1 - depth),
                z,
                x0 + U,
                y0 + (side < 0 ? -1 + depth : 2 - depth),
                Z,
              ];
        const casing = (
          name: string,
          slot: ShipKitSlot,
          side: number,
          u: number,
          U: number,
          z: number,
          Z: number,
          depth = 0,
        ) => {
          u = Math.max(1, u);
          U = Math.min(span - 1, U);
          // A recessed seat outside the clipped housing makes its shaped silhouette
          // visible. It removes only decor: the central role-core course remains.
          box(
            `${id}:${name}-seat`,
            "void",
            "dark",
            surface(side, u - 1, U + 1, z - 1, Math.min(Z + 1, wallCap - 1)),
            family,
          );
          // This is a local assembly footprint, not a repeating perimeter guard.
          for (let q = Math.floor(u); q < Math.ceil(U); q++) {
            const cut = Math.max(0, 2 - Math.min(q - u, U - 1 - q));
            box(
              `${id}:${name}`,
              "plate",
              slot,
              surface(side, q, q + 1, z + cut, Z - cut, depth),
              family,
            );
          }
        };
        for (const side of [-1, 1]) {
          // Quiet continuous enclosure; a selected functional cavity has three local depth levels.
          box(
            `${id}:lower-enclosure`,
            jamb ? "doorframe" : "plate",
            "primary",
            surface(
              side,
              start === 0 ? 1 : start,
              end === span ? end - 1 : end,
              ft + 3,
              Z,
              0,
            ),
            family,
          );
          if (glazed || span < 13 || wallCap < ft + 20 || jamb) continue;
          const choices = wallTasksFor(
            family,
            [ax, ay],
            [bx, by],
            vertical ? [side, 0] : [0, side],
          );
          const chosen = choices.find(
            (t) => (t.u + t.U) / 2 >= start && (t.u + t.U) / 2 < end,
          );
          if (!chosen) continue;
          const { key, u, U } = chosen;
          const task = macro.wallTasks[key];
          const bottom = ft + task.bottom,
            ceiling = Math.min(Z, bottom + task.height);
          const minimumHeight = task.insert === "control" ? 13 : 11;
          if (U - u < 13 || ceiling - bottom < minimumHeight) continue;
          const taskStart = layers.length;
          casing(`task-${key}-casing`, "primary", side, u, U, bottom, ceiling);
          // One outer course of a four-course partition is a seat; BOTH central
          // pressure courses remain core. No claimed two-course cavity through it.
          const well = surface(side, u + 2, U - 2, bottom + 3, ceiling - 3);
          box(`${id}:functional-well`, "void", "dark", well, family);
          box(
            `${id}:functional-backing`,
            "core",
            "secondary",
            surface(side, u + 2, U - 2, bottom + 3, ceiling - 3, 1),
            family,
          );
          box(
            `${id}:task-lower-binding`,
            "frame",
            "trim",
            surface(side, u + 1, U - 1, bottom, bottom + 2),
            family,
          );
          if (task.insert === "vent") {
            for (const z of [bottom + 4, ceiling - 5])
              box(
                `${id}:task-protected-louver`,
                "service",
                "metal",
                surface(side, u + 3, U - 3, z, z + 1),
                family,
              );
            box(
              `${id}:task-amber-strip`,
              "service",
              "emit_b",
              surface(side, U - 4, U - 3, bottom + 5, ceiling - 4),
              family,
            );
          } else if (task.insert === "control") {
            box(
              `${id}:task-screen-backing`,
              "core",
              "dark",
              surface(side, u + 3, U - 6, bottom + 7, ceiling - 3, 1),
              family,
            );
            box(
              `${id}:task-screen-housing`,
              "service",
              "trim",
              surface(side, u + 2, U - 5, bottom + 6, bottom + 7),
              family,
            );
            for (let q = u + 3; q < U - 6; q += 4)
              box(
                `${id}:task-keybank`,
                "service",
                "metal",
                surface(
                  side,
                  q,
                  Math.min(q + 2, U - 6),
                  bottom + 3,
                  bottom + 5,
                ),
                family,
              );
            box(
              `${id}:task-cyan-header`,
              "service",
              "emit_a",
              surface(side, u + 3, U - 4, ceiling - 2, ceiling - 1),
              family,
            );
            box(
              `${id}:task-status-lens`,
              "service",
              "emit_b",
              surface(side, U - 4, U - 3, bottom + 8, bottom + 10),
              family,
            );
          } else {
            const red = key === "quarters";
            box(
              `${id}:task-access-face`,
              "plate",
              red ? "accent" : "trim",
              surface(side, u + 3, U - 5, bottom + 4, ceiling - 4),
              family,
            );
            box(
              `${id}:task-access-handle`,
              "service",
              "metal",
              surface(
                side,
                U - 7,
                U - 5,
                bottom + 6,
                Math.min(ceiling - 4, bottom + 10),
              ),
              family,
            );
            box(
              `${id}:task-reading-lens`,
              "service",
              "emit_b",
              surface(side, U - 4, U - 3, bottom + 5, ceiling - 3),
              family,
            );
          }
          if (task.form === "workbench" || task.form === "relay") {
            const spine = u + Math.floor((U - u) * 0.65);
            box(
              `${id}:task-${task.form}-divider`,
              "frame",
              "trim",
              surface(side, spine, spine + 1, bottom + 3, ceiling - 3),
              family,
            );
            for (let z = bottom + 4; z < ceiling - 3; z += 3)
              box(
                `${id}:task-${task.form}-control-bank`,
                "service",
                task.form === "relay" ? "accent" : "metal",
                surface(side, spine + 2, U - 3, z, z + 1),
                family,
              );
          } else if (task.form === "instrument") {
            box(
              `${id}:task-medical-monitor`,
              "service",
              "emit_a",
              surface(
                side,
                u + 4,
                u + Math.floor((U - u) * 0.55),
                bottom + 9,
                Math.min(ceiling - 3, bottom + 11),
              ),
              family,
            );
            box(
              `${id}:task-medical-storage-seam`,
              "frame",
              "primary",
              surface(
                side,
                u + Math.floor((U - u) * 0.6),
                u + Math.floor((U - u) * 0.6) + 1,
                bottom + 3,
                ceiling - 3,
              ),
              family,
            );
          } else if (task.form === "backsplash" || task.form === "living") {
            box(
              `${id}:task-${task.form}-shelf`,
              "service",
              "metal",
              surface(side, u + 3, U - 3, bottom + 4, bottom + 5),
              family,
            );
            box(
              `${id}:task-${task.form}-warm-header`,
              "service",
              "emit_b",
              surface(side, u + 3, U - 3, ceiling - 3, ceiling - 2),
              family,
            );
          } else if (task.form === "cargo") {
            for (const q of [u + 4, U - 6])
              box(
                `${id}:task-cargo-latch`,
                "service",
                "metal",
                surface(side, q, q + 2, bottom + 4, ceiling - 4),
                family,
              );
          }
          deferWallTask(chosen, `${family}:${side}`, family, taskStart);
          if (jamb)
            box(
              `${id}:interface-lens`,
              "service",
              "emit_a",
              surface(side, start + 3, start + 5, wallCap - 7, wallCap - 6),
              family,
            );
        }
      }
      const kick = [...bounds];
      kick[5] = ft + 2;
      box(`${id}:kick`, "frame", "trim", kick, family);
      const capbox = [...bounds];
      capbox[2] = wallCap - 1;
      if (vertical) {
        capbox[0] += 1;
        capbox[3] -= 1;
      } else {
        capbox[1] += 1;
        capbox[4] -= 1;
      }
      box(`${id}:cap`, "frame", "trim", capbox, family);
      for (const [u, U] of jamb || span < 16
        ? []
        : [
            [0, Math.min(3, span)],
            [Math.max(0, span - 3), span],
          ])
        box(
          `${id}:shaped-end`,
          "frame",
          "trim",
          vertical
            ? [x0 - 2, y0 + u, ft + 2, x0 + 2, y0 + U, wallCap]
            : [x0 + u, y0 - 2, ft + 2, x0 + U, y0 + 2, wallCap],
          family,
        );
      if (glazed) {
        const carve = [...bounds];
        carve[2] = ft + 13;
        carve[5] = cap - 3;
        box(`${id}:glass-aperture`, "void", "dark", carve, family);
      }
      if (!jamb && !glazed && !half && wallCap < ft + 22) {
        for (let q = 0; q < span; q++) {
          const face: Pt = vertical
            ? [x0 / 16, (y0 + q + 0.5) / 16]
            : [(x0 + q + 0.5) / 16, y0 / 16];
          const socket = interior.sockets.some((o) => {
            const r = [
              o.at[0],
              o.at[1],
              o.at[0] + o.size[0],
              o.at[1] + o.size[1],
            ];
            return (
              face[0] >= r[0] - 0.1875 &&
              face[0] <= r[2] + 0.1875 &&
              face[1] >= r[1] - 0.1875 &&
              face[1] <= r[3] + 0.1875
            );
          });
          if (!socket && !protectedInterface(face)) continue;
          const full = vertical
            ? [x0 - 2, y0 + q, ft, x0 + 2, y0 + q + 1, ft + 22]
            : [x0 + q, y0 - 2, ft, x0 + q + 1, y0 + 2, ft + 22];
          const backed = [...full];
          if (vertical) {
            backed[0]++;
            backed[3]--;
          } else {
            backed[1]++;
            backed[4]--;
          }
          // Full vertical support meets the low cutaway; no floating top/header island.
          box(
            `${id}:attachment-island-return`,
            "frame",
            "trim",
            [...full.slice(0, 2), ft + 20, ...full.slice(3, 5), ft + 22],
            family,
          );
          box(
            `${id}:attachment-island-core`,
            "core",
            "secondary",
            backed,
            family,
          );
        }
      }
    };
    // The dressing contract emits metre pieces. Join only contiguous collinear
    // pieces of identical structural type before placing two-metre visual bays; gaps/doors stay gaps.
    const wallRuns = new Map<string, typeof interior.partitions>();
    for (const w of interior.partitions) {
      const vertical = Math.abs(w.a[0] - w.b[0]) < 1e-6;
      const fixed = vertical ? w.a[0] : w.a[1];
      const key = `${vertical}:${fixed}:${w.type}:${w.variant === "glazed" || w.variant === "half" ? w.variant : "solid"}`;
      const a: Pt = vertical
        ? [fixed, Math.min(w.a[1], w.b[1])]
        : [Math.min(w.a[0], w.b[0]), fixed];
      const b: Pt = vertical
        ? [fixed, Math.max(w.a[1], w.b[1])]
        : [Math.max(w.a[0], w.b[0]), fixed];
      wallRuns.set(key, [...(wallRuns.get(key) ?? []), { ...w, a, b }]);
    }
    let runIndex = 0;
    for (const walls of wallRuns.values()) {
      const axis = Math.abs(walls[0].a[0] - walls[0].b[0]) < 1e-6 ? 1 : 0;
      walls.sort((a, b) => a.a[axis] - b.a[axis]);
      let run = { ...walls[0] };
      const emit = () =>
        edge(
          `partition:run:${runIndex++}`,
          run.a,
          run.b,
          false,
          run.type === "wall.glazed" ||
            run.type === "window" ||
            run.variant === "glazed",
          run.type === "wall.half" || run.variant === "half",
        );
      for (const w of walls.slice(1)) {
        if (Math.abs(run.b[axis] - w.a[axis]) < 1e-6) run = { ...run, b: w.b };
        else {
          emit();
          run = { ...w };
        }
      }
      emit();
    }
    // Existing door widths and travel remain intact: only side jambs occupy the module.
    for (const d of interior.doors) {
      if (d.exterior) continue;
      const dx = d.b[0] - d.a[0],
        dy = d.b[1] - d.a[1],
        len = Math.hypot(dx, dy),
        u: Pt = [dx / len, dy / len];
      const p = (t: number): Pt => [d.a[0] + u[0] * t, d.a[1] + u[1] * t];
      edge(`${d.id}:left`, d.a, p(0.375), true);
      edge(`${d.id}:right`, p(len - 0.375), d.b, true);
    }
    for (const [i, p] of interior.posts.entries())
      box(
        `post:${i}`,
        "frame",
        "trim",
        [
          p[0] * 16 - 2,
          p[1] * 16 - 2,
          ft,
          p[0] * 16 + 2,
          p[1] * 16 + 2,
          ft + 22,
        ],
        `post:${i}`,
      );
  }
  if (pendingWallTasks.size) {
    const envelope = sampleShipVisualLayers(compactColumns(layers));
    const eligible = new Map<string, PendingWallTask[]>();
    for (const task of pendingWallTasks.values()) {
      // A complete source group cannot repaint a jamb, cap, other wall, aperture
      // or unsupported air. Keep the existing conservative fitting/head guards.
      let safe = true;
      for (const l of task.layers) {
        for (let z = l.bounds[2]; safe && z < l.bounds[5]; z++)
          for (let y = l.bounds[1]; safe && y < l.bounds[4]; y++)
            for (let x = l.bounds[0]; safe && x < l.bounds[3]; x++) {
              const old = envelope.get(visualCellKey(x, y, z));
              if (
                (!old && l.role !== "void") ||
                (old &&
                  (old.family !== task.support ||
                    ["frame", "doorframe", "glass"].includes(old.role)))
              )
                safe = false;
              // Removing or repainting pressure support as decorative hardware is
              // forbidden. The explicit retained backing remains role-core.
              if (old?.role === "core" && l.role !== "core") safe = false;
            }
        if (!safe) break;
      }
      if (!safe) continue;
      const roomTasks = eligible.get(task.room.id) ?? [];
      roomTasks.push(task);
      eligible.set(task.room.id, roomTasks);
    }
    for (const tasks of eligible.values()) {
      // Prefer a useful broad complete run, then its actual hardware area. Stable
      // face identity breaks ties without depending on a presentation camera.
      tasks.sort(
        (a, b) =>
          b.U - b.u - (a.U - a.u) ||
          b.layers
            .filter((l) => l.role === "service")
            .reduce(
              (n, l) =>
                n +
                (l.bounds[3] - l.bounds[0]) *
                  (l.bounds[4] - l.bounds[1]) *
                  (l.bounds[5] - l.bounds[2]),
              0,
            ) -
            a.layers
              .filter((l) => l.role === "service")
              .reduce(
                (n, l) =>
                  n +
                  (l.bounds[3] - l.bounds[0]) *
                    (l.bounds[4] - l.bounds[1]) *
                    (l.bounds[5] - l.bounds[2]),
                0,
              ) ||
          a.face.localeCompare(b.face),
      );
      layers.push(...tasks[0].layers);
    }
  }
  // Preserve all published exterior apertures through the sampled shell; the authored frame owns them.
  for (const d of interior.doors.filter((d) => d.exterior)) {
    const dx = d.b[0] - d.a[0],
      dy = d.b[1] - d.a[1],
      len = Math.hypot(dx, dy),
      margin = 0.375;
    const a: Pt = [d.a[0] + (dx / len) * margin, d.a[1] + (dy / len) * margin],
      b: Pt = [d.b[0] - (dx / len) * margin, d.b[1] - (dy / len) * margin];
    if (Math.abs(dx) < 1e-6)
      box(`${d.id}:opening`, "void", "dark", [
        a[0] * 16 - 5,
        Math.min(a[1], b[1]) * 16,
        G.deck.floorTopTexels,
        a[0] * 16 + 5,
        Math.max(a[1], b[1]) * 16,
        view === "flight"
          ? 37
          : G.deck.interiorCutTexels + G.deck.floorTopTexels,
      ]);
    else if (Math.abs(dy) < 1e-6)
      box(`${d.id}:opening`, "void", "dark", [
        Math.min(a[0], b[0]) * 16,
        a[1] * 16 - 5,
        G.deck.floorTopTexels,
        Math.max(a[0], b[0]) * 16,
        a[1] * 16 + 5,
        view === "flight"
          ? 37
          : G.deck.interiorCutTexels + G.deck.floorTopTexels,
      ]);
  }
  // Final authored openings can be emitted after the outer case recipe. Their
  // full XYZ bounds plus the frame ring stay raw; complete door travel guards
  // above remain conservative in XY at every height.
  const apertureGuards = layers.filter(
    (l) =>
      l.role === "void" &&
      (l.id.endsWith(":opening") || l.id.endsWith(":glass-aperture")),
  );
  const matingSolids = referenceOpticalMatingSolidsR002(
    doc,
    view,
    catalog,
    profileId,
  );
  const opticalFinishIds = [
    ":diagonal-pressure-case",
    ":diagonal-inset-lip",
    ":continuous-sill",
    ":cassette-rim",
    ":pressure-backing",
    ":inset-armor",
  ];
  // Restrict pigment to the FINAL intact opaque owner; an earlier backing or
  // cover cannot repaint a later facade simply because its volume overlaps it.
  const matingOwnerColumns = new Map<string, ShipVisualLayer[]>();
  for (const l of layers)
    if (
      opticalFinishIds.some((id) => l.id.endsWith(id)) &&
      l.support?.startsWith("volume:") &&
      l.bounds[3] - l.bounds[0] === 1 &&
      l.bounds[4] - l.bounds[1] === 1
    )
      matingOwnerColumns.set(`${l.bounds[0]},${l.bounds[1]}`, []);
  for (const l of layers)
    for (let y = l.bounds[1]; y < l.bounds[4]; y++)
      for (let x = l.bounds[0]; x < l.bounds[3]; x++)
        matingOwnerColumns.get(`${x},${y}`)?.push(l);
  const finalMatingOwner = (l: ShipVisualLayer, z: number) => {
    const list = matingOwnerColumns.get(`${l.bounds[0]},${l.bounds[1]}`) ?? [];
    for (let i = list.length - 1; i >= 0; i--)
      if (z >= list[i].bounds[2] && z < list[i].bounds[5]) return list[i] === l;
    return false;
  };
  // Pigment is independent of the exact 3D optical geometry exclusion. Keep the
  // existing source-qualified lower/upper frame gasket courses dark, never the
  // complete opaque bow wall beneath/behind the retained optical art.
  const opticalPigments = layers.flatMap((l) => {
    const opaqueCase =
      l.id.endsWith(":diagonal-pressure-case") && l.slot === "secondary";
    const matingOwner =
      opticalFinishIds.some((id) => l.id.endsWith(id)) &&
      ["core", "frame", "plate"].includes(l.role);
    if (
      (!opaqueCase && !matingOwner && !["primary", "trim"].includes(l.slot)) ||
      !l.support?.startsWith("volume:") ||
      l.bounds[3] - l.bounds[0] !== 1 ||
      l.bounds[4] - l.bounds[1] !== 1
    )
      return [l];
    const assembly = assemblies.find(
      (a) => l.support === `volume:${a.volume.id}`,
    );
    if (!assembly) return [l];
    const p: Pt = [(l.bounds[0] + 0.5) / 16, (l.bounds[1] + 0.5) / 16];
    const glazedTile = assembly.tiles.find(
      ({ tile, poly }) =>
        bowGlass(tile) &&
        insidePolygon(poly, ...p) &&
        polygonBoundarySample(p, poly).distance <= rawPaddingM,
    );
    const edge = opticalEdges.find((e) => {
      const dx = e.b[0] - e.a[0],
        dy = e.b[1] - e.a[1],
        length = Math.hypot(dx, dy);
      const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / length;
      const v = Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / length;
      return (
        u >= -rawPaddingM &&
        u <= length + rawPaddingM &&
        v <= 0.25 + rawPaddingM
      );
    });
    if (!glazedTile && !edge) return [l];
    let bands: number[][];
    if (glazedTile) {
      const [lo, hi] = bowHeights(glazedTile.tile, assembly.volume.height, p);
      const [lower, upper] =
        G.bowProfiles.shellThicknessTexels[assembly.volume.height];
      bands = [
        [Math.floor(lo + lower) - 1, Math.floor(lo + lower) + 1],
        [Math.floor(hi - upper) - 1, Math.floor(hi - upper) + 1],
      ];
    } else if (
      edge &&
      ("glass" in edge || ("type" in edge && edge.type === "canopy"))
    ) {
      const [z0, roof] = G.heightClasses[assembly.volume.height].z;
      const base = G.heightClasses[assembly.volume.height].kinds.includes(
        "hull",
      )
        ? Math.max(0, z0 - G.tierRule.skirtTexels)
        : z0;
      // Authored regular canopy source places the lower pressure-glass edge at
      // nose+3 and the upper frame roof-4..roof. The cut variant's return is top-2..top.
      const nose = Math.round(base + (roof - base) * 0.4);
      const top =
        view === "deck" && G.heightClasses[assembly.volume.height].walkable
          ? Math.min(roof, G.deck.shellCutTexels)
          : roof;
      bands = [
        [nose + 3, nose + 5],
        [
          top -
            (view === "deck" && G.heightClasses[assembly.volume.height].walkable
              ? 2
              : 4),
          top,
        ],
      ];
    } else {
      bands = [
        [G.deck.floorTopTexels + 12, G.deck.floorTopTexels + 14],
        [
          G.deck.floorTopTexels + G.deck.interiorCutTexels - 4,
          G.deck.floorTopTexels + G.deck.interiorCutTexels - 2,
        ],
      ];
    }
    const rows: ShipVisualLayer[] = [];
    for (let z = l.bounds[2]; z < l.bounds[5]; z++)
      rows.push({
        ...l,
        bounds: [l.bounds[0], l.bounds[1], z, l.bounds[3], l.bounds[4], z + 1],
        slot:
          matingOwner &&
          finalMatingOwner(l, z) &&
          opticalCellProtected(l.bounds[0], l.bounds[1], z) &&
          referenceOpticalMatingCubeR002(
            l.bounds[0],
            l.bounds[1],
            z,
            matingSolids,
          )
            ? "trim"
            : bands.some(([lo, hi]) => z >= lo && z < hi)
              ? "secondary"
              : opaqueCase
                ? z >= l.bounds[2] + 3 && z < l.bounds[5] - 3
                  ? "primary"
                  : "trim"
                : l.slot,
      });
    return rows;
  });
  // Moving the descriptor to its actual visible row also moves its patch
  // transition. Apply the EXISTING one-cell Chebyshev raw guard to current final
  // ownership, including vertical armor/lip ends; never relax the union contract.
  const finalOwnership = sampleShipVisualLayers(
    compactColumns(opticalPigments),
  );
  const facetGuardCells = new Set<string>();
  for (const c of finalOwnership.values())
    if (c.facet && opticalCellProtected(c.x, c.y, c.z))
      facetGuardCells.add(visualCellKey(c.x, c.y, c.z));
  for (const c of finalOwnership.values()) {
    if (!c.facet) continue;
    for (let z = -1; z <= 1; z++)
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const n = finalOwnership.get(
            visualCellKey(c.x + x, c.y + y, c.z + z),
          );
          if (
            n?.facet &&
            (n.facet.id !== c.facet.id ||
              n.facet.d !== c.facet.d ||
              n.facet.a.join(",") !== c.facet.a.join(","))
          ) {
            facetGuardCells.add(visualCellKey(c.x, c.y, c.z));
            facetGuardCells.add(visualCellKey(n.x, n.y, n.z));
          }
        }
  }
  const guardedFinishes = opticalPigments.flatMap((l) => {
    if (!l.facet) return [l];
    const rows: ShipVisualLayer[] = [];
    for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
      const row = {
        ...l,
        bounds: [
          l.bounds[0],
          l.bounds[1],
          z,
          l.bounds[3],
          l.bounds[4],
          z + 1,
        ] as ShipVisualLayer["bounds"],
      };
      if (facetGuardCells.has(visualCellKey(l.bounds[0], l.bounds[1], z))) {
        const { facet: _facet, ...raw } = row;
        rows.push(raw);
      } else rows.push(row);
    }
    return rows;
  });
  return compactColumns(
    guardedFinishes.map((l) => {
      if (
        !l.facet ||
        !apertureGuards.some(
          (g) =>
            l.bounds[0] < g.bounds[3] + 2 &&
            l.bounds[3] > g.bounds[0] - 2 &&
            l.bounds[1] < g.bounds[4] + 2 &&
            l.bounds[4] > g.bounds[1] - 2 &&
            l.bounds[2] < g.bounds[5] + 2 &&
            l.bounds[5] > g.bounds[2] - 2,
        )
      )
        return l;
      const { facet: _facet, ...raw } = l;
      return raw;
    }),
  );
}

/** Merge adjacent source columns before sampling, preserving volume/layer priority order. */
export function compactColumns(
  layers: readonly ShipVisualLayer[],
): ShipVisualLayer[] {
  const groups = new Map<string, ShipVisualLayer[]>();
  for (const l of layers) {
    const [x, y, z, X, Y, Z] = l.bounds;
    const key =
      X - x === 1 && Y - y === 1
        ? `${l.id}:${l.role}:${l.slot}:${l.surfaceRole}:${l.support}:${l.normalHint?.join(",")}:${l.normalChart ?? ""}:${l.normalSide ? `${l.normalSide.id}:${l.normalSide.normal.join(",")}:${l.normalSide.faces}` : ""}${l.facet ? `:facet:${l.facet.id}:${l.facet.a.join(",")}:${l.facet.d}` : ""}:${y}:${z}:${Z}`
        : `unique:${groups.size}`;
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  const out: ShipVisualLayer[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.bounds[0] - b.bounds[0]);
    let run = {
      ...g[0],
      bounds: [...g[0].bounds] as ShipVisualLayer["bounds"],
    };
    for (let i = 1; i < g.length; i++) {
      if (run.bounds[3] === g[i].bounds[0]) run.bounds[3] = g[i].bounds[3];
      else {
        out.push(run);
        run = {
          ...g[i],
          bounds: [...g[i].bounds] as ShipVisualLayer["bounds"],
        };
      }
    }
    out.push(run);
  }
  return out;
}
