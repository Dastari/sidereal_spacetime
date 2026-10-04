import {
  effectiveWayfarerObjects,
  type FurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
/**
 * Planar beam hit test against a prefab ship's compiled structure (authority for handheld lasers).
 *
 * The beam travels horizontally at chest height (`BEAM_HEIGHT_M` above the deck floor top) in the
 * ship-local game frame (x starboard, y fore, metres; aim angle 0 = +y, `atan2(dx, dy)`), and
 * stops at the first of:
 * - interior walls (full and glazed partitions; half walls and open doorways let it pass);
 * - the pressure hull: the deck's exterior walls (inner shell face), sealed exterior hatches and
 *   every volume outline as a backstop;
 * - bow tiles whose sloped roof or keel profile has come down (or up) to the beam height;
 * - interior modules and furniture taller than the beam.
 * Other ships are tested against their volume outlines after transforming the ray into their
 * frame. Pure and deterministic; the client uses the same model to clip its predicted beam.
 */
import {
  G,
  insideOutline,
  insidePolygon,
  placedTilePolygon,
  type Pt,
} from "@sidereal/content/construction-grammar";
import { bowHeights } from "@sidereal/content/bow-profiles";
import {
  deriveInterior,
  prefabOrigin,
  volumeGeometry,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabShipObjects } from "./prefab-deck-objects";

/** Beam height above the deck floor top (the handheld muzzle at a raised aim). */
export const BEAM_HEIGHT_M = 1.3;
/** Visible inner face of the deck-view exterior shell, inward from the hull outline. */
export const SHELL_INSET_M = 0.25;
const PARTITION_HALF_M = 0.0625;
const TEXEL = 1 / 16;
const FLOOR_TOP_M = G.deck.floorTopTexels * TEXEL;

export type BeamHitKind =
  "wall" | "glass" | "hull" | "hatch" | "object" | "ship" | "none";

type P2 = [number, number];
export interface BeamSegment {
  id: string;
  kind: BeamHitKind;
  a: P2;
  b: P2;
  /** Surface half-thickness: the hit point is pulled back to the visible face. */
  halfM: number;
}
export interface PrefabBeamModel {
  prefabId: string;
  segments: BeamSegment[];
  /** Hull outlines only (what another ship's beam can hit from outside). */
  hull: BeamSegment[];
  /** Bow tiles in ship-local metres, with plan-space profile sampling. */
  bow: { id: string; polygon: P2[]; heights(p: P2): [number, number] }[];
  /** Ship-local footprint and height band (plan metres) of objects that can stop a beam. */
  objects: { id: string; polygon: P2[]; z: [number, number] }[];
  bounds: [number, number, number, number];
}
export interface BeamHit {
  kind: BeamHitKind;
  /** Object id, segment id, bow tile id or other ship id; "" for none. */
  targetId: string;
  distanceM: number;
  /** Ship-local end point (metres) in the shooter's frame. */
  point: P2;
}

const cache = new WeakMap<ShipPrefabDocumentV1, PrefabBeamModel>();

export function prefabBeamModel(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  furnishings?: FurnishingOverrides,
): PrefabBeamModel {
  const hit = furnishings ? undefined : cache.get(doc);
  if (hit) return hit;
  const [ox, oy] = prefabOrigin(doc);
  const toShip = (p: Pt | readonly number[]): P2 => [
    -(p[1] - oy) + 0,
    p[0] - ox + 0,
  ];
  const interior = deriveInterior(doc, 0, catalog);
  const geoms = doc.volumes.map(volumeGeometry);
  const deck = geoms.find((g) => g.volume.id === interior.volume) ?? null;
  const segments: BeamSegment[] = [];
  const hull: BeamSegment[] = [];
  const inward = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return deck?.outline &&
      insideOutline(deck.outline, mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05)
      ? n
      : [-n[0], -n[1]];
  };
  const inset = (a: Pt, b: Pt): [Pt, Pt] => {
    const n = inward(a, b);
    return [
      [a[0] + n[0] * SHELL_INSET_M, a[1] + n[1] * SHELL_INSET_M],
      [b[0] + n[0] * SHELL_INSET_M, b[1] + n[1] * SHELL_INSET_M],
    ];
  };
  interior.exteriorWalls.forEach((w, i) => {
    const [a, b] = inset(w.a, w.b);
    segments.push({
      id: `hull-wall-${i}`,
      kind: w.type === "canopy" ? "glass" : "hull",
      a: toShip(a),
      b: toShip(b),
      halfM: 0,
    });
  });
  interior.exteriorSlopes.forEach((w, i) => {
    const [a, b] = inset(w.a, w.b);
    segments.push({
      id: `hull-slope-${i}`,
      kind: w.glass ? "glass" : "hull",
      a: toShip(a),
      b: toShip(b),
      halfM: 0,
    });
  });
  interior.partitions.forEach((w, i) => {
    if (w.type === "wall.half" || w.type === "open") return;
    segments.push({
      id: `wall-${i}`,
      kind: w.type === "wall.glazed" || w.type === "window" ? "glass" : "wall",
      a: toShip(w.a),
      b: toShip(w.b),
      halfM: PARTITION_HALF_M,
    });
  });
  // Exterior hatches (airlocks, cargo doors) are sealed; interior doors are open passages.
  interior.doors.forEach((d) => {
    if (!d.exterior) return;
    const [a, b] = inset(d.a, d.b);
    segments.push({
      id: `hatch-${d.id}`,
      kind: "hatch",
      a: toShip(a),
      b: toShip(b),
      halfM: 0,
    });
  });
  for (const g of geoms) {
    if (!g.outline) continue;
    for (const loop of [g.outline.outer, ...g.outline.holes])
      loop.forEach((p, i) => {
        const q = loop[(i + 1) % loop.length];
        const s: BeamSegment = {
          id: `outline-${g.volume.id}-${i}`,
          kind: "hull",
          a: toShip(p),
          b: toShip(q),
          halfM: 0,
        };
        segments.push(s);
        hull.push({ ...s, kind: "ship" });
      });
  }
  const bow = doc.volumes.flatMap((v) =>
    v.tiles
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.bow)
      .map(({ t, i }) => ({
        id: `bow-${v.id}-${i}`,
        polygon: placedTilePolygon(t).map(toShip),
        heights: (p: P2): [number, number] => {
          const plan: Pt = [p[1] + ox, -p[0] + oy];
          const [lo, hi] = bowHeights(t, v.height, plan);
          return [lo * TEXEL, hi * TEXEL];
        },
      })),
  );
  const effective = new Map(
    effectiveWayfarerObjects(furnishings).map((o) => [o.object, o]),
  );
  const objects = prefabShipObjects(doc, catalog, furnishings)
    .filter((o) => o.kind !== "door" && o.view !== "flight")
    .filter((o) => o.attach === "interior" || o.attach === "socket")
    .map((o) => ({
      id: o.id,
      polygon: effective.has(o.sourceId)
        ? effective.get(o.sourceId)!.footprint.map(toShip)
        : [
            toShip([o.min[0], o.max[1]]),
            toShip([o.min[0], o.min[1]]),
            toShip([o.max[0], o.min[1]]),
            toShip([o.max[0], o.max[1]]),
          ],
      z: [o.min[2], o.max[2]] as [number, number],
    }));
  const pts = segments.flatMap((s) => [s.a, s.b]);
  const model: PrefabBeamModel = {
    prefabId: doc.id,
    segments,
    hull,
    bow,
    objects,
    bounds: [
      Math.min(...pts.map((p) => p[0])),
      Math.min(...pts.map((p) => p[1])),
      Math.max(...pts.map((p) => p[0])),
      Math.max(...pts.map((p) => p[1])),
    ],
  };
  if (!furnishings) cache.set(doc, model);
  return model;
}

/** Ray parameter where o + t d crosses segment ab (t > eps), or undefined. */
function raySegment(o: P2, d: P2, a: P2, b: P2): number | undefined {
  const e: P2 = [b[0] - a[0], b[1] - a[1]];
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-12) return undefined;
  const w: P2 = [a[0] - o[0], a[1] - o[1]];
  const t = (w[0] * e[1] - w[1] * e[0]) / den;
  const u = (w[0] * d[1] - w[1] * d[0]) / den;
  return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : undefined;
}

/** Aim angle (0 = +y, atan2(dx, dy)) -> unit direction. */
export const beamDirection = (angle: number): P2 => [
  Math.sin(angle),
  Math.cos(angle),
];

/**
 * First hit of a horizontal beam from ship-local `origin` along `angle`, within `rangeM`.
 * `heightM` is above the deck floor top (default chest height).
 */
export function castPrefabBeam(
  model: PrefabBeamModel,
  origin: readonly [number, number],
  angle: number,
  rangeM: number,
  heightM = BEAM_HEIGHT_M,
): BeamHit {
  if (
    ![origin[0], origin[1], angle, rangeM, heightM].every(Number.isFinite) ||
    rangeM <= 0
  )
    throw Error("Invalid beam");
  const o: P2 = [origin[0], origin[1]];
  const d = beamDirection(angle);
  const z = FLOOR_TOP_M + heightM;
  let best: { t: number; kind: BeamHitKind; id: string; halfM: number } = {
    t: rangeM,
    kind: "none",
    id: "",
    halfM: 0,
  };
  for (const s of model.segments) {
    const t = raySegment(o, d, s.a, s.b);
    if (t !== undefined && t < best.t)
      best = { t, kind: s.kind, id: s.id, halfM: s.halfM };
  }
  for (const obj of model.objects) {
    if (!(obj.z[0] < z && obj.z[1] > z)) continue;
    for (let i = 0; i < obj.polygon.length; i++) {
      const t = raySegment(
        o,
        d,
        obj.polygon[i],
        obj.polygon[(i + 1) % obj.polygon.length],
      );
      if (t !== undefined && t < best.t)
        best = { t, kind: "object", id: obj.id, halfM: 0 };
    }
  }
  // Bow profiles: march the ray inside each bow tile until the roof or keel reaches the beam.
  const step = 1 / 64;
  for (const tile of model.bow)
    for (let t = step; t < best.t; t += step) {
      const p: P2 = [o[0] + d[0] * t, o[1] + d[1] * t];
      if (!insidePolygon(tile.polygon, p[0], p[1])) continue;
      const [lo, hi] = tile.heights(p);
      if (z >= hi || z <= lo) {
        best = { t, kind: "hull", id: tile.id, halfM: 0 };
        break;
      }
    }
  // Pull the end back to the visible face of a thick partition (not past the origin).
  let t = best.t;
  if (best.halfM > 0) {
    const s = model.segments.find((x) => x.id === best.id)!;
    const e: P2 = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    const len = Math.hypot(e[0], e[1]);
    const cos = Math.abs((d[0] * -e[1] + d[1] * e[0]) / len);
    t = Math.max(0, t - Math.min(0.3, best.halfM / Math.max(cos, 0.2)));
  }
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return {
    kind: best.kind,
    targetId: best.id,
    distanceM: r(t),
    point: [r(o[0] + d[0] * t), r(o[1] + d[1] * t)],
  };
}

export interface BeamShipTarget {
  id: string;
  /** World pose of the ship frame: world = pos + R(heading) * local. */
  x: number;
  y: number;
  heading: number;
  model: PrefabBeamModel;
}

/**
 * The shooter's own-ship hit, then any other ship hull the beam reaches first (world frame).
 * Returns the hit in the shooter's ship-local frame.
 */
export function castBeamWithShips(
  own: { model: PrefabBeamModel; x: number; y: number; heading: number },
  origin: readonly [number, number],
  angle: number,
  rangeM: number,
  others: readonly BeamShipTarget[],
  heightM = BEAM_HEIGHT_M,
): BeamHit {
  const first = castPrefabBeam(own.model, origin, angle, rangeM, heightM);
  if (first.kind !== "none" || !others.length) return first;
  const c = Math.cos(own.heading);
  const s = Math.sin(own.heading);
  const d = beamDirection(angle);
  const wo: P2 = [
    own.x + c * origin[0] - s * origin[1],
    own.y + s * origin[0] + c * origin[1],
  ];
  const wd: P2 = [c * d[0] - s * d[1], s * d[0] + c * d[1]];
  let best: { t: number; id: string } | undefined;
  for (const ship of others) {
    const [bx0, by0, bx1, by1] = ship.model.bounds;
    const reach = Math.max(
      Math.hypot(bx0, by0),
      Math.hypot(bx0, by1),
      Math.hypot(bx1, by0),
      Math.hypot(bx1, by1),
    );
    if (Math.hypot(ship.x - wo[0], ship.y - wo[1]) > rangeM + reach) continue;
    const kc = Math.cos(-ship.heading);
    const ks = Math.sin(-ship.heading);
    const rel: P2 = [wo[0] - ship.x, wo[1] - ship.y];
    const lo: P2 = [kc * rel[0] - ks * rel[1], ks * rel[0] + kc * rel[1]];
    const ld: P2 = [kc * wd[0] - ks * wd[1], ks * wd[0] + kc * wd[1]];
    for (const seg of ship.model.hull) {
      const t = raySegment(lo, ld, seg.a, seg.b);
      if (t !== undefined && t <= rangeM && (!best || t < best.t))
        best = { t, id: ship.id };
    }
  }
  if (!best) return first;
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return {
    kind: "ship",
    targetId: best.id,
    distanceM: r(best.t),
    point: [r(origin[0] + d[0] * best.t), r(origin[1] + d[1] * best.t)],
  };
}

/**
 * Planar beam against generic walking-collision segments (native construction ships): walls,
 * closed openings and obstacle edges in ship-local metres. Hits report kind "wall".
 */
export function castSegmentBeam(
  segments: readonly {
    id: string;
    a: readonly number[];
    b: readonly number[];
  }[],
  origin: readonly [number, number],
  angle: number,
  rangeM: number,
): BeamHit {
  const o: P2 = [origin[0], origin[1]];
  const d = beamDirection(angle);
  let best = { t: rangeM, id: "" };
  for (const s of segments) {
    const t = raySegment(o, d, [s.a[0], s.a[1]], [s.b[0], s.b[1]]);
    if (t !== undefined && t < best.t) best = { t, id: s.id };
  }
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return {
    kind: best.id ? "wall" : "none",
    targetId: best.id,
    distanceM: r(best.t),
    point: [r(o[0] + d[0] * best.t), r(o[1] + d[1] * best.t)],
  };
}
