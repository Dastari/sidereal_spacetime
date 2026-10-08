/** Pure formation envelope of the pinned composed prefab presentation. No GPU or world writes. */
import templateSource from "../../../assets/runtime/ship-study/template-authored-r001/manifest.json";
import flightSource from "../../../assets/runtime/ship-study/wayfarer-dorsal-r001/descriptor.json";
import {
  readAuthoredTemplateKit,
  AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
} from "@sidereal/content/authored-template-kit";
import {
  readWayfarerAuthoredFlight,
  WAYFARER_AUTHORED_FLIGHT_PINS,
} from "@sidereal/content/wayfarer-authored-flight";
import {
  isWayfarerGameplay,
  WAYFARER_GAMEPLAY_OBJECTS,
} from "@sidereal/content/wayfarer-authored-gameplay";
import {
  fleetAccessPhysicalGeometry,
  fleetAccessAuthorPoint,
} from "@sidereal/content/prefabs";
import { WAYFARER_ACCESS_DOORS } from "@sidereal/content/wayfarer-access-profile";
import {
  prefabOrigin,
  type ShipPrefabDocumentV1,
  type PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { compileAuthoredTemplatePlan } from "./authored-template-plan";
import { prefabShipObjects } from "./prefab-deck-objects";

type P2 = [number, number];
type P3 = [number, number, number];
export interface FormationBounds {
  /** Exact-coordinate envelope; source boxes and fitted reserves conservatively contain surfaces. */
  author: { min: P3; max: P3 };
  ship: { min: P3; max: P3 };
  lengthM: number;
  beamM: number;
  heightM: number;
  radiusM: number;
  structuralSourceSha256: string;
}
const kit = readAuthoredTemplateKit(templateSource);
const pieces = new Map(kit.pieces.map((p) => [p.id, p]));
const flight = readWayfarerAuthoredFlight(flightSource);
const flightPieces = new Map(flight.pieces.map((p) => [p.id, p]));
const corners = (lo: readonly number[], hi: readonly number[]) =>
  [lo[0], hi[0]].flatMap((x) =>
    [lo[1], hi[1]].flatMap((y) => [lo[2], hi[2]].map((z): P3 => [x, y, z])),
  );
const transform = (
  matrix: readonly (readonly number[])[],
  p: readonly number[],
): P3 =>
  [0, 1, 2].map(
    (i) =>
      matrix[i][0] * p[0] +
      matrix[i][1] * p[1] +
      matrix[i][2] * p[2] +
      matrix[i][3],
  ) as P3;
const cross = (a: P2, b: P2, c: P2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function convexHull(input: P2[]): P2[] {
  const p = [
    ...new Map(input.map((p) => [`${p[0]},${p[1]}`, p])).values(),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length <= 2) return p;
  const half = (rows: P2[]) => {
    const result: P2[] = [];
    for (const q of rows) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, q) <= 0)
        result.pop();
      result.push(q);
    }
    return result;
  };
  return [...half(p).slice(0, -1), ...half(p.reverse()).slice(0, -1)];
}
function clip(poly: P2[], nx: number, ny: number, d: number): P2[] {
  const result: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = nx * a[0] + ny * a[1] + d,
      db = nx * b[0] + ny * b[1] + d;
    if (da >= -1e-9) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}

/** Bounds of closed hull, fitted hardware and full outer hatch travel at this exact document.
 * Source surfaces may occupy less than their fitted/source box; spacing must not underestimate
 * them. Clipping keeps mitered source boxes from spilling outside their native half-planes.
 */
export function prefabFormationBounds(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): FormationBounds {
  const min: P3 = [Infinity, Infinity, Infinity],
    max: P3 = [-Infinity, -Infinity, -Infinity];
  const add = (p: readonly number[]) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  };
  let structuralSourceSha256: string = AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256;
  if (doc.authoredGameplay) {
    if (!isWayfarerGameplay(doc))
      throw Error("Unsupported authored formation geometry");
    structuralSourceSha256 = WAYFARER_AUTHORED_FLIGHT_PINS.descriptorSha256;
    for (const object of WAYFARER_GAMEPLAY_OBJECTS)
      for (const p of corners(object.min, object.max))
        add([p[0], p[1], p[2] + 0.1875]);
    for (const row of flight.instances) {
      const piece = flightPieces.get(row.piece)!;
      for (const point of corners(piece.boundsMin, piece.boundsMax)) {
        const p = transform(row.matrix, point);
        add([p[0], p[1], p[2] + 0.1875]);
      }
    }
  } else {
    for (const row of compileAuthoredTemplatePlan(doc, {
      catalog,
    }).instances.filter((r) => r.view !== "deck")) {
      const piece = pieces.get(row.piece);
      if (!piece) throw Error(`Unpinned formation piece ${row.piece}`);
      const points = corners(piece.boundsMin, piece.boundsMax).map((p) =>
        transform(row.matrix, p),
      );
      let poly = convexHull(points.map((p): P2 => [p[0], p[1]]));
      for (const plane of row.clipPlanes ?? [])
        if (Math.abs(plane[2]) < 1e-12)
          poly = clip(poly, plane[0], plane[1], plane[3]);
      if (!poly.length) continue;
      const z0 = Math.min(...points.map((p) => p[2])),
        z1 = Math.max(...points.map((p) => p[2]));
      for (const p of poly) {
        if (row.verticalProfile) {
          const bottom = row.verticalProfile.bottom,
            top = row.verticalProfile.top;
          add([p[0], p[1], bottom[0] * p[0] + bottom[1] * p[1] + bottom[2]]);
          add([p[0], p[1], top[0] * p[0] + top[1] * p[1] + top[2]]);
        } else {
          add([p[0], p[1], z0]);
          add([p[0], p[1], z1]);
        }
      }
    }
    // Propulsion fits its entire source bounds into these original mount envelopes.
    // Authored equipment/room objects shrink into these reserved sockets; never enlarged.
    for (const object of prefabShipObjects(doc, catalog))
      for (const p of corners(object.min, object.max)) add(p);
  }
  for (const access of fleetAccessPhysicalGeometry(doc)) {
    for (const piece of access.pieces)
      for (const p of corners(piece.boundsMin, piece.boundsMax)) {
        const xy = fleetAccessAuthorPoint(access.port, p[0], p[1]);
        add([xy[0], xy[1], p[2] + 0.1875]);
      }
    const variant = WAYFARER_ACCESS_DOORS.variants.find(
      (v) => v.id === (access.port.id === "cargo" ? "cargo.4m" : "personnel"),
    )!;
    const sweep = (
      variant as typeof variant & {
        sweepBounds: { min: number[]; max: number[]; clearanceM: number };
      }
    ).sweepBounds;
    for (const p of corners(sweep.min, sweep.max)) {
      const xy = fleetAccessAuthorPoint(access.port, p[0], p[1]);
      add([xy[0], xy[1], p[2] + 0.1875]);
    }
  }
  if ([...min, ...max].some((n) => !Number.isFinite(n)))
    throw Error("Empty/nonfinite formation geometry");
  // Babylon instance matrices/bounds use Float32. An exact decimal boundary can round
  // outwards there (Wren 7.511 -> 7.5110001564), so reserve tolerance before rounding.
  const nativeFloat32ToleranceM = 1e-5;
  const lo = min.map(
      (n) => Math.floor((n - nativeFloat32ToleranceM) * 1e6) / 1e6 + 0,
    ) as P3,
    hi = max.map(
      (n) => Math.ceil((n + nativeFloat32ToleranceM) * 1e6) / 1e6 + 0,
    ) as P3;
  const [ox, oy] = prefabOrigin(doc);
  const ship = {
    min: [-(hi[1] - oy), lo[0] - ox, lo[2]] as P3,
    max: [-(lo[1] - oy), hi[0] - ox, hi[2]] as P3,
  };
  return {
    author: { min: lo, max: hi },
    ship,
    lengthM: hi[0] - lo[0],
    beamM: hi[1] - lo[1],
    heightM: hi[2] - lo[2],
    radiusM: Math.hypot(
      Math.max(Math.abs(ship.min[0]), Math.abs(ship.max[0])),
      Math.max(Math.abs(ship.min[1]), Math.abs(ship.max[1])),
    ),
    structuralSourceSha256,
  };
}

/** Rotate a qualified ship-local envelope by an authoritative planar heading. */
export function formationBoundsAtHeading(
  bounds: FormationBounds,
  heading: number,
) {
  if (!Number.isFinite(heading)) throw Error("Invalid formation heading");
  const c = Math.cos(heading),
    s = Math.sin(heading),
    points = corners(bounds.ship.min, bounds.ship.max).map(([x, y]): P2 => [
      c * x - s * y,
      s * x + c * y,
    ]);
  return {
    min: [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
    ] as P2,
    max: [
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ] as P2,
  };
}
