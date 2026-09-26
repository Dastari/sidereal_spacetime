/**
 * Port/starboard symmetry: mirror editor elements across the horizontal centreline
 * y = c (ship plan frame, +Y port). The centreline sits on the 0.5 m grid so mirrored
 * cells, lattice edges and 0.5 m mount anchors stay on their grids.
 */
import {
  placedTilePolygon,
  placedTileSize,
  type FaceNormal,
  type Pt,
  type QuarterTurn,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import {
  placeMount,
  prefabBounds,
  volumeGeometry,
  type PrefabComponentSpec,
  type PrefabEdge,
  type PrefabMount,
  type PrefabRoom,
  type PrefabSkylight,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";

export const snapHalf = (v: number) => Math.round(v * 2) / 2;

/** Default centreline: middle of the hull structure's Y extent, on the 0.5 m grid. */
export function defaultCentreline(doc: ShipPrefabDocumentV1): number {
  const hulls = doc.volumes.filter((v) => v.kind === "hull" && v.tiles.length);
  const [, y0, , y1] = prefabBounds((hulls.length ? hulls : doc.volumes).map(volumeGeometry));
  return snapHalf((y0 + y1) / 2);
}

const ptKey = (p: Pt) => `${Math.round(p[0] * 1e6) / 1e6},${Math.round(p[1] * 1e6) / 1e6}`;

/** The placement of the same shape whose polygon equals `poly`, or null if none does. */
export function tileForPolygon(shape: ShapeTilePlacement["shape"], poly: readonly Pt[]): ShapeTilePlacement | null {
  const want = new Set(poly.map(ptKey));
  const x = Math.floor(Math.min(...poly.map((p) => p[0])) + 1e-9);
  const y = Math.floor(Math.min(...poly.map((p) => p[1])) + 1e-9);
  for (const reflected of [false, true])
    for (const rot of [0, 1, 2, 3] as QuarterTurn[]) {
      const t: ShapeTilePlacement = { x, y, shape, rot, reflected };
      const got = placedTilePolygon(t);
      if (got.length === want.size && got.every((p) => want.has(ptKey(p)))) return t;
    }
  return null;
}

export function mirrorTile(t: ShapeTilePlacement, c: number): ShapeTilePlacement {
  const poly = placedTilePolygon(t).map(([x, y]) => [x, 2 * c - y] as Pt);
  const found = tileForPolygon(t.shape, poly);
  if (found) return found;
  // Every grammar tile family is closed under reflection; keep a safe fallback anyway.
  const [, h] = placedTileSize(t);
  return { ...t, y: 2 * c - t.y - h, reflected: !t.reflected, rot: ((4 - t.rot) % 4) as QuarterTurn };
}

export const sameTile = (a: ShapeTilePlacement, b: ShapeTilePlacement) =>
  a.x === b.x && a.y === b.y && a.shape === b.shape && placedTilePolygon(a).map(ptKey).sort().join() === placedTilePolygon(b).map(ptKey).sort().join();

export function mirrorRoom<R extends Pick<PrefabRoom, "rect">>(r: R, c: number): R {
  const [x0, y0, x1, y1] = r.rect;
  return { ...r, rect: [x0, 2 * c - y1, x1, 2 * c - y0] };
}

export function mirrorEdge<E extends Pick<PrefabEdge, "a" | "b">>(e: E, c: number): E {
  return { ...e, a: [e.a[0], 2 * c - e.a[1]], b: [e.b[0], 2 * c - e.b[1]] };
}

const SWAP: Record<FaceNormal, FaceNormal> = { fore: "fore", aft: "aft", port: "starboard", starboard: "port" };

export function mirrorMount(m: PrefabMount, spec: PrefabComponentSpec | undefined, c: number): PrefabMount {
  const normal = m.normal ? SWAP[m.normal] : undefined;
  if (m.attach === "top" || m.attach === "interior") {
    const mirrored: PrefabMount = normal ? { ...m, normal } : { ...m };
    // Footprint min corner: reflect the far edge of the (possibly turned) footprint.
    const rect = placeMount(mirrored, spec, []).rect;
    const height = rect[3] - rect[1];
    return { ...mirrored, at: [m.at[0], 2 * c - m.at[1] - height] };
  }
  return { ...m, normal, at: [m.at[0], 2 * c - m.at[1]] };
}

export function mirrorSkylight(s: PrefabSkylight, c: number): PrefabSkylight {
  return { ...s, at: [s.at[0], 2 * c - s.at[1] - s.size[1]] };
}

/** True when a mirrored element lands on the original (it straddles the centreline). */
export const sameMount = (a: PrefabMount, b: PrefabMount) =>
  a.component === b.component && a.attach === b.attach && a.at[0] === b.at[0] && a.at[1] === b.at[1] && a.normal === b.normal;
export const sameRect = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i]);
export const sameEdge = (a: Pick<PrefabEdge, "a" | "b">, b: Pick<PrefabEdge, "a" | "b">) => {
  const k = (e: Pick<PrefabEdge, "a" | "b">) => [e.a.join(","), e.b.join(",")].sort().join("|");
  return k(a) === k(b);
};
