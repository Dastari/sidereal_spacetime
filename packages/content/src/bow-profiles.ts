/** Shared structural cross-sections. Coordinates are metres; heights returned in texels. */
import {
  G,
  placedTilePolygon,
  shapeTileLocalPolygon,
  type ShapeTilePlacement,
  type HeightClassId,
  type Pt,
  type QuarterTurn,
} from "./construction-grammar";
export type BowTile = ShapeTilePlacement & {
  bow: NonNullable<ShapeTilePlacement["bow"]>;
};
export function tileLocal(t: ShapeTilePlacement, point: Pt): Pt {
  let [w, h] = G.shapeTiles[t.shape].size;
  const sizes: Pt[] = [];
  for (let i = 0; i < t.rot; i++) {
    sizes.push([w, h]);
    [w, h] = [h, w];
  }
  let [x, y] = [point[0] - t.x, point[1] - t.y];
  for (let i = t.rot - 1; i >= 0; i--) [x, y] = [y, sizes[i][1] - x];
  if (t.reflected) x = G.shapeTiles[t.shape].size[0] - x;
  return [x, y];
}
export function bowHeights(
  t: ShapeTilePlacement,
  hc: HeightClassId,
  point: Pt,
): [number, number] {
  const [z0, z1] = G.heightClasses[hc].z;
  const base = G.heightClasses[hc].kinds.includes("hull")
    ? Math.max(0, z0 - G.tierRule.skirtTexels)
    : z0;
  if (!t.bow) return [base, z1];
  const [x, y] = tileLocal(t, point),
    [w, h] = G.shapeTiles[t.shape].size,
    a = t.bow.axis;
  const u = [x / w, y / h, 1 - x / w, 1 - y / h][a];
  const lerp = (v: number[]) => v[0] + (v[1] - v[0]) * u;
  return [
    base + (z1 - base) * lerp(G.bowProfiles.keelFractions[t.bow.step]),
    base + (z1 - base) * lerp(G.bowProfiles.roofFractions[t.bow.step]),
  ];
}
export function bowWalkable(t: ShapeTilePlacement, hc: HeightClassId): boolean {
  return (
    !t.bow ||
    placedTilePolygon(t).every((p) => {
      const [lo, hi] = bowHeights(t, hc, p);
      return (
        hi -
          lo -
          G.bowProfiles.shellThicknessTexels[hc][0] -
          G.bowProfiles.shellThicknessTexels[hc][1] >=
        G.bowProfiles.minimumClearanceTexels
      );
    })
  );
}
export function bowGlass(t: ShapeTilePlacement): boolean {
  return t.shape === "square" && t.bow?.step === 2;
}
/** Ordered four shell socket vertices at each shared-edge end. No cosmetic bevel touches them. */
export function bowSection(
  t: ShapeTilePlacement,
  hc: HeightClassId,
  a: Pt,
  b: Pt,
): number[][] {
  return [a, b].flatMap((p) => {
    const [lo, hi] = bowHeights(t, hc, p);
    return [
      lo,
      lo + G.bowProfiles.shellThicknessTexels[hc][0],
      hi - G.bowProfiles.shellThicknessTexels[hc][1],
      hi,
    ].map((z) => [p[0], p[1], z / 16]);
  });
}
export function sharedTileEdges(
  a: ShapeTilePlacement,
  b: ShapeTilePlacement,
): [Pt, Pt][] {
  const pa = placedTilePolygon(a),
    pb = placedTilePolygon(b),
    out: [Pt, Pt][] = [];
  for (let i = 0; i < pa.length; i++)
    for (let j = 0; j < pb.length; j++) {
      const p = pa[i],
        q = pa[(i + 1) % pa.length],
        r = pb[j],
        s = pb[(j + 1) % pb.length];
      const dx = q[0] - p[0],
        dy = q[1] - p[1],
        l2 = dx * dx + dy * dy;
      if (dx * (s[0] - r[0]) + dy * (s[1] - r[1]) >= -1e-9) continue;
      if (
        [r, s].some(
          (v) => Math.abs(dx * (v[1] - p[1]) - dy * (v[0] - p[0])) > 1e-7,
        )
      )
        continue;
      const u = (v: Pt) => ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / l2;
      const lo = Math.max(0, Math.min(u(r), u(s))),
        hi = Math.min(1, Math.max(u(r), u(s)));
      if (hi - lo > 1e-7)
        out.push([
          [p[0] + dx * lo, p[1] + dy * lo],
          [p[0] + dx * hi, p[1] + dy * hi],
        ]);
    }
  return out;
}
export function bowJoinErrors(
  tiles: readonly ShapeTilePlacement[],
  hc: HeightClassId,
): string[] {
  const errors: string[] = [];
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) {
      if (!tiles[i].bow && !tiles[j].bow) continue;
      for (const [a, b] of sharedTileEdges(tiles[i], tiles[j])) {
        const p = bowSection(tiles[i], hc, a, b),
          q = bowSection(tiles[j], hc, a, b);
        if (p.some((v, k) => v.some((n, c) => Math.abs(n - q[k][c]) > 1e-7)))
          errors.push(`${i}:${j}`);
      }
    }
  return errors;
}
/** Assign a profile pointing in a world cardinal direction without changing the plan tile. */
export function withBow(
  t: ShapeTilePlacement,
  step: 0 | 1 | 2 | 3,
  worldAxis: QuarterTurn = 0,
): ShapeTilePlacement {
  let axis = ((worldAxis - t.rot + 4) % 4) as QuarterTurn;
  if (t.reflected && axis % 2 === 0) axis = ((axis + 2) % 4) as QuarterTurn;
  return { ...t, bow: { step, axis } };
}
/** Edge ids follow the authored local polygon, not CCW order after reflection. */
export function bowLocalEdges(t: ShapeTilePlacement): [Pt, Pt][] {
  const p = shapeTileLocalPolygon(t.shape);
  return p.map((a, i) => [a, p[(i + 1) % p.length]]);
}
export function tileWorld(t: ShapeTilePlacement, p: Pt): Pt {
  let [w, h] = G.shapeTiles[t.shape].size,
    [x, y] = p;
  if (t.reflected) x = w - x;
  for (let k = 0; k < t.rot; k++) {
    [x, y] = [h - y, x];
    [w, h] = [h, w];
  }
  return [x + t.x, y + t.y];
}
/** Inward side-wall strip. Endpoint sockets keep a two-texel return on adjacent
 * edges; arc facets miter inside the tile, clipped by its bounding cells. */
export function bowWallPolygon(
  shape: ShapeTilePlacement["shape"],
  index: number,
): Pt[] {
  const p = shapeTileLocalPolygon(shape),
    a = p[index],
    b = p[(index + 1) % p.length],
    prev = p[(index - 1 + p.length) % p.length],
    next = p[(index + 2) % p.length];
  const unit = (v: Pt): Pt => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l];
  };
  const angled = (a: Pt, b: Pt) =>
    Math.abs(a[0] - b[0]) > 1e-8 && Math.abs(a[1] - b[1]) > 1e-8;
  const d = G.bowProfiles.wallThicknessTexels / 16;
  const inward = (a: Pt, b: Pt): Pt => unit([a[1] - b[1], b[0] - a[0]]);
  const miter = (prev: Pt, a: Pt, b: Pt): Pt => {
    const n = inward(prev, a),
      m = inward(a, b),
      k = 1 + n[0] * m[0] + n[1] * m[1];
    return [a[0] + (d * (n[0] + m[0])) / k, a[1] + (d * (n[1] + m[1])) / k];
  };
  const da = unit([prev[0] - a[0], prev[1] - a[1]]),
    db = unit([next[0] - b[0], next[1] - b[1]]);
  const ia: Pt =
    angled(a, b) && angled(prev, a)
      ? miter(prev, a, b)
      : [a[0] + da[0] * d, a[1] + da[1] * d];
  const ib: Pt =
    angled(a, b) && angled(b, next)
      ? miter(a, b, next)
      : [b[0] + db[0] * d, b[1] + db[1] * d];
  const [w, h] = G.shapeTiles[shape].size;
  const clamp = (v: Pt): Pt => [
    Math.min(w, Math.max(0, v[0])),
    Math.min(h, Math.max(0, v[1])),
  ];
  return [a, b, clamp(ib), clamp(ia)];
}
