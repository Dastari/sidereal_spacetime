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
  referencePlateDecals,
} from "@sidereal/content/ship-visual-r002";

const mod = (n: number, d: number) => ((n % d) + d) % d;
export function shipVisualLayersR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): ShipVisualLayer[] {
  const profile = SHIP_VISUAL_PROFILES_R002[profileId],
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
    if (candidates[0])
      floorCovers.push({
        bounds: candidates[0].bounds,
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
    // Three distinct task assemblies, sized by real room footprints. Each is a
    // joined tray/shoulder/skin cross-section; room walls and sockets do not move.
    const roofCases: {
      id: string;
      bounds: number[];
      kind: "utility" | "habitation" | "control";
    }[] = [];
    if (deck)
      for (const kind of ["utility", "habitation", "control"] as const) {
        const eligible = doc.rooms.filter((r) =>
          kind === "utility"
            ? r.type === "engineering" || r.type === "workshop"
            : kind === "control"
              ? r.type === "bridge"
              : ["quarters", "lounge", "galley", "cargo", "medbay"].includes(
                  r.type,
                ),
        );
        eligible.sort(
          (a, b) =>
            (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]) -
              (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]) ||
            a.id.localeCompare(b.id),
        );
        const room = eligible.find(
          (r) =>
            (r.rect[2] - r.rect[0]) * 16 >= 24 &&
            (r.rect[3] - r.rect[1]) * 16 >= 24 &&
            insidePolygon(
              poly,
              (r.rect[0] + r.rect[2]) * 8,
              (r.rect[1] + r.rect[3]) * 8,
            ),
        );
        if (room)
          roofCases.push({
            id: room.id,
            kind,
            bounds: [
              Math.max(bx + 5, Math.round(room.rect[0] * 16) + 4),
              Math.max(by + 5, Math.round(room.rect[1] * 16) + 4),
              Math.min(bX - 5, Math.round(room.rect[2] * 16) - 4),
              Math.min(bY - 5, Math.round(room.rect[3] * 16) - 4),
            ],
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
          kind: vent ? "vent" : "access",
          score: vent ? 3 : room ? 2 : 1,
        });
      }
      const selected = candidates
        .sort((a, b) => b.score - a.score || a.bounds[0] - b.bounds[0])
        .filter((_, i) => i < 2);
      roofPatches.push(...(deck ? selected : selected.slice(0, 1)));
      trayCassetteX.set(routeY, selected[0]?.bounds[0]);
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
          if (!tile.bow) {
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
              // A clipped cover seat has one-cell recess; two retained keel cells
              // below it remain continuous support. No visual facet touches contact faces.
              const corner =
                Math.min(x - a, A - 1 - x) + Math.min(y - b, B - 1 - y) < 2;
              if (edge === 0 || corner)
                column(
                  `${family}:floor-cover-seat:${cover.room}`,
                  "void",
                  "dark",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
              else {
                column(
                  `${family}:floor-cover:${cover.room}`,
                  "floor",
                  "secondary",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
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
              )
                column(
                  `${family}:floor-circulation-seam`,
                  "void",
                  "dark",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
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
                "primary",
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
                enclosure.kind === "utility" && caseEdge < 3
                  ? "trim"
                  : "primary",
                x,
                y,
                hi - 2,
                caseEdge < 1 ? hi - 1 : caseEdge < 3 ? hi : hi + 1,
                family,
              );
              if (
                caseEdge >= 3 &&
                enclosure.kind === "control" &&
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
                  "accent",
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
          ) ||
          protectedInterface(world);
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
            "secondary",
            x,
            y,
            hi - 3,
            hi - 1,
            family,
          );
          facetPlane = undefined;
          if (boundary.distance >= 2) {
            facetPlane = plane(intercept - 3);
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
          facetPlane = undefined;
          if (boundary.distance >= 2) {
            facetPlane = plane(intercept - 3);
            column(
              `${family}:diagonal-inset-lip`,
              "core",
              "primary",
              x,
              y,
              top - 1,
              top,
              family,
            );
            facetPlane = undefined;
          }
        }
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
      const wallCap = half ? ft + 14 : jamb || glazed ? cap : ft + 22;
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
      const idPhase = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
      for (let start = 0; start < span; start += profile.course) {
        const end = Math.min(span, start + profile.course),
          width = end - start;
        const fallbackKind = mod(
          Math.floor(start / profile.course) + idPhase,
          3,
        );
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
          u = Math.max(start + 1, u);
          U = Math.min(end - 1, U);
          // A recessed seat outside the clipped housing makes its shaped silhouette
          // visible. It removes only decor: the central role-core course remains.
          box(
            `${id}:${name}-seat`,
            "void",
            "dark",
            surface(side, u - 1, U + 1, z - 1, Z + 1),
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
          const insetPressureFace = !glazed && !jamb && width >= 24;
          box(
            `${id}:lower-enclosure`,
            jamb ? "doorframe" : insetPressureFace ? "core" : "plate",
            "primary",
            surface(
              side,
              start === 0 ? 1 : start,
              end === span ? end - 1 : end,
              ft + 3,
              Z,
              insetPressureFace ? 1 : 0,
            ),
            family,
          );
          if (glazed || width < 24 || wallCap < ft + 20) continue;
          const centre = start + width * (side < 0 ? 0.28 : 0.72);
          const roomProbe: Pt = vertical
            ? [x0 / 16 + side * 0.5, (y0 + start + width / 2) / 16]
            : [(x0 + start + width / 2) / 16, y0 / 16 + side * 0.5];
          const room = doc.rooms.find(
            (r) =>
              roomProbe[0] >= r.rect[0] &&
              roomProbe[0] < r.rect[2] &&
              roomProbe[1] >= r.rect[1] &&
              roomProbe[1] < r.rect[3],
          );
          const nearDoor = interior.doors.some(
            (d) =>
              Math.hypot(
                roomProbe[0] - (d.a[0] + d.b[0]) / 2,
                roomProbe[1] - (d.a[1] + d.b[1]) / 2,
              ) < 1.3,
          );
          const kind =
            nearDoor || room?.type === "bridge"
              ? 1
              : room?.type === "engineering" || room?.type === "workshop"
                ? 0
                : room?.type === "quarters" ||
                    room?.type === "lounge" ||
                    room?.type === "cargo"
                  ? 2
                  : mod(fallbackKind + (side > 0 ? 1 : 0), 3);
          // Selected functional assemblies, not equal-width frame wallpaper.
          // Opposite faces use different half-bays; existing 4-cell wall envelope is retained.
          if (
            !nearDoor &&
            kind !== 0 &&
            mod(Math.floor(start / profile.course) + idPhase, 2) !== 0
          )
            continue;
          const halfWidth = Math.min(kind === 0 ? 9 : 7, width * 0.25);
          const cavity = (u: number, U: number, z: number, Z: number) => {
            const well = surface(side, u, U, z, Z);
            if (vertical) {
              if (side < 0) well[3] += 1;
              else well[0] -= 1;
            } else {
              if (side < 0) well[4] += 1;
              else well[1] -= 1;
            }
            box(`${id}:functional-well`, "void", "dark", well, family);
            box(
              `${id}:functional-backing`,
              "core",
              "secondary",
              surface(side, u, U, z, Z, 2),
              family,
            );
          };
          if (kind === 0) {
            // Compact horizontal ventilation cassette, with two actual recessed louvers.
            const u = centre - halfWidth,
              U = centre + halfWidth;
            casing(
              "vent-casing",
              "primary",
              side,
              u - 2,
              U + 2,
              ft + 4,
              ft + 16,
            );
            box(
              `${id}:vent-kicker`,
              "frame",
              "trim",
              surface(side, u - 1, U + 1, ft + 4, ft + 6),
              family,
            );
            cavity(u + 1, U - 1, ft + 7, ft + 13);
            for (const z of [ft + 8, ft + 11])
              box(
                `${id}:vent-fin`,
                "service",
                "secondary",
                surface(side, u + 1, U - 1, z, z + 1, 1),
                family,
              );
          } else if (kind === 1) {
            // Recessed control station with a compact status lens and guarded key cluster.
            casing(
              "control-casing",
              "primary",
              side,
              centre - 8,
              centre + 8,
              ft + 8,
              Math.min(Z, ft + 22),
            );
            box(
              `${id}:control-kicker`,
              "frame",
              "trim",
              surface(side, centre - 7, centre + 7, ft + 8, ft + 10),
              family,
            );
            cavity(centre - 6, centre + 6, ft + 11, ft + 21);
            box(
              `${id}:control-face`,
              "service",
              "metal",
              surface(side, centre - 5, centre + 5, ft + 12, ft + 20, 1),
              family,
            );
            box(
              `${id}:control-display`,
              "service",
              "dark",
              surface(side, centre - 4, centre + 3, ft + 15, ft + 19, 1),
              family,
            );
            box(
              `${id}:control-lens`,
              "service",
              "emit_b",
              surface(side, centre + 3, centre + 5, ft + 17, ft + 18, 1),
              family,
            );
            for (let u = centre - 4; u < centre + 3; u += 3)
              box(
                `${id}:control-key`,
                "service",
                "secondary",
                surface(side, u, u + 2, ft + 12, ft + 13),
                family,
              );
          } else {
            // Quiet storage/access bay with a bounded burgundy latch panel and a hinge side.
            casing(
              "access-casing",
              "primary",
              side,
              centre - 9,
              centre + 9,
              ft + 4,
              ft + 18,
            );
            box(
              `${id}:access-kicker`,
              "frame",
              "trim",
              surface(side, centre - 8, centre + 8, ft + 4, ft + 6),
              family,
            );
            cavity(centre - 7, centre + 7, ft + 7, ft + 15);
            box(
              `${id}:access-face`,
              "plate",
              "accent",
              surface(side, centre - 7, centre + 7, ft + 7, ft + 15, 1),
              family,
            );
            box(
              `${id}:access-handle`,
              "service",
              "metal",
              surface(side, centre + 3, centre + 5, ft + 9, ft + 13),
              family,
            );
            for (const z of [ft + 8, ft + 13])
              box(
                `${id}:access-hinge`,
                "service",
                "trim",
                surface(side, centre - 7, centre - 5, z, z + 1),
                family,
              );
          }
          const headerU = centre - halfWidth,
            headerX = centre + halfWidth;
          box(
            `${id}:task-header-housing`,
            "service",
            "secondary",
            surface(side, headerU, headerX, ft + 15, ft + 18),
            family,
          );
          if (kind === 1) {
            box(
              `${id}:task-cyan-header`,
              "service",
              "emit_a",
              surface(side, headerU + 2, headerX - 2, ft + 16, ft + 17),
              family,
            );
          } else {
            box(
              `${id}:task-amber-strip`,
              "service",
              "emit_b",
              surface(side, headerX - 2, headerX - 1, ft + 8, ft + 13),
              family,
            );
          }
          for (const u of [headerU + 1, headerX - 2])
            box(
              `${id}:housing-fastener`,
              "service",
              "metal",
              surface(side, u, u + 1, ft + 15, ft + 16),
              family,
            );
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
  // Final authored openings can be emitted after the outer case recipe. Keep
  // their complete XY aperture/frame interface raw at every height; a descriptor
  // frozen before those voids would otherwise qualify an aperture side as intact.
  const apertureGuards = layers.filter(
    (l) =>
      l.role === "void" &&
      (l.id.endsWith(":opening") || l.id.endsWith(":glass-aperture")),
  );
  return compactColumns(
    layers.map((l) => {
      if (
        !l.facet ||
        !apertureGuards.some(
          (g) =>
            l.bounds[0] < g.bounds[3] + 2 &&
            l.bounds[3] > g.bounds[0] - 2 &&
            l.bounds[1] < g.bounds[4] + 2 &&
            l.bounds[4] > g.bounds[1] - 2,
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
