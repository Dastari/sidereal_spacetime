import { composeNativeVolcanic } from "./native-volcanic-composition";
import { composeNativeGlacialInterior } from "./native-glacial-interior";
import { composeNativeGlacialGeography } from "./native-glacial-geography";
import { composeNativeGlacier } from "./native-glacier-composition";
/** Seeded assembly of authored Blender surfaces. No legacy voxel geometry input. */
export interface NativePlanetKit {
  schema: "sidereal.native-planet-kit.v1";
  layout?: "connected-ravines" | "clustered-glaciers" | "glacial-geography" | "glacial-interior" | "volcanic-geology";
  materials: { name: string; linearColor: number[]; roughness: number }[];
  variants: {
    name: string;
    ports?: number[];
    positions: number[];
    indices: number[];
    triangleMaterials: number[];
  }[];
}
export interface NativePlanetBatch {
  positions: number[];
  normals: number[];
  indices: number[];
}
export interface NativePlanetComposition {
  batches: NativePlanetBatch[];
  tiles: number[];
  triangles: number;
  seed: number;
  rotations: number[];
  links: number[][];
  diagnostics?: {buriedBaseMaxClearance:number;regionalGroupCount:number;nativeUnitCount?:number;actualCells?:number};
}
function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function direction(face: number, u: number, v: number) {
  const a = [
    [1, v, -u],
    [-1, v, u],
    [u, 1, -v],
    [u, -1, v],
    [u, v, 1],
    [-u, v, -1],
  ][face];
  const length = Math.hypot(...a);
  return a.map((x) => x / length);
}
/** Exact shared-edge topology; E,N,W,S in each native patch's local domain. */
export function nativePatchNeighbors() {
  const neighbors = Array.from({ length: 24 }, () =>
      Array.from({ length: 4 }, () => ({ tile: -1, port: -1 })),
    ),
    edges = new Map<string, { tile: number; port: number }>();
  const endpoints = [
    [
      [0.5, -0.5],
      [0.5, 0.5],
    ],
    [
      [-0.5, 0.5],
      [0.5, 0.5],
    ],
    [
      [-0.5, -0.5],
      [-0.5, 0.5],
    ],
    [
      [-0.5, -0.5],
      [0.5, -0.5],
    ],
  ];
  for (let tile = 0; tile < 24; tile++)
    for (let port = 0; port < 4; port++) {
      const face = Math.floor(tile / 4),
        x = tile % 2,
        y = Math.floor((tile % 4) / 2);
      const key = endpoints[port]
        .map(([u, v]) =>
          direction(face, x - 0.5 + u, y - 0.5 + v)
            .map((n) => n.toFixed(8))
            .join(","),
        )
        .sort()
        .join("|");
      const old = edges.get(key);
      if (old) {
        neighbors[tile][port] = old;
        neighbors[old.tile][old.port] = { tile, port };
      } else edges.set(key, { tile, port });
    }
  if (neighbors.some((row) => row.some((n) => n.tile < 0)))
    throw new Error("Unpaired authored patch edge");
  return neighbors;
}
/** Bounded seeded macro search; geometry is assembled only for the chosen layout. */
function balancedConnectedLayout(seed: number, coverage: number) {
  const neighbors = nativePatchNeighbors();
  type Plan = {
    ports: number[][];
    reserved: Set<number>;
    links: number[][];
  diagnostics?: {buriedBaseMaxClearance:number;regionalGroupCount:number;nativeUnitCount?:number;actualCells?:number};
    extras: number[];
    score: number;
  };
  let best: Plan | undefined;
  for (let attempt = 0; attempt < 32; attempt++) {
    const rng = random((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0),
      order = Array.from({ length: 24 }, (_, i) => i);
    for (let i = 23; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const ports = Array.from({ length: 24 }, () => [] as number[]),
      reserved = new Set<number>(),
      links: number[][] = [];
    let remaining = Math.round(24 * coverage);
    for (let chain = 0; chain < 3 && remaining > 1; chain++) {
      const start = order.find((t) => !reserved.has(t));
      if (start === undefined) break;
      let current: number = start;
      const count = Math.max(2, Math.ceil(remaining / (3 - chain)));
      reserved.add(current);
      let used = 1;
      while (used < count) {
        const candidates = neighbors[current]
          .map((n, port) => ({ ...n, port }))
          .filter((n) => !reserved.has(n.tile));
        if (!candidates.length) break;
        const next = candidates[Math.floor(rng() * candidates.length)],
          back = neighbors[next.tile].findIndex((n) => n.tile === current);
        ports[current].push(next.port);
        ports[next.tile].push(back);
        links.push([current, next.port, next.tile, back]);
        reserved.add(next.tile);
        current = next.tile;
        used++;
      }
      remaining -= used;
    }
    const extras = order.filter((t) => !reserved.has(t)).slice(0, 3),
      features = ports.map((p, t) => (p.length || extras.includes(t) ? 1 : 0)),
      distribution = nativeFeatureDistribution(features);
    const score =
      distribution.minimum -
      0.06 * (distribution.maximum - distribution.minimum);
    if (!best || score > best.score)
      best = { ports, reserved, links, extras, score };
  }
  return best!;
}
/** Six faces, four compatible patches per face. Native vertices retain their authored relief. */
export function composeNativePlanet(
  kit: NativePlanetKit,
  seed: number,
  coverage = 0.4,
  relief = 0.5,
): NativePlanetComposition {
  if (
    kit.schema !== "sidereal.native-planet-kit.v1" ||
    kit.variants.length < 2 ||
    kit.variants.length > (kit.layout === "volcanic-geology" ? 11 : 8) ||
    kit.materials.length > 8
  )
    throw new Error("Unsupported native kit");
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 4294967295 ||
    !Number.isFinite(coverage) ||
    coverage < 0 ||
    coverage > 1 ||
    !Number.isFinite(relief) ||
    relief < 0.2 ||
    relief > 0.7
  )
    throw new Error("Invalid native planet recipe");
  if (
    kit.layout === "connected-ravines" &&
    (kit.variants.length < 6 ||
      JSON.stringify(kit.variants.slice(1, 4).map((v) => v.ports)) !==
        "[[0],[0,2],[0,1]]")
  )
    throw new Error("Invalid shared-port kit");
  if (kit.variants[6]?.name === "basin-end" && JSON.stringify(kit.variants[6].ports) !== "[0]")
    throw new Error("Invalid basin shared-port variant");
  if (
    kit.materials.some(
      (m) =>
        m.linearColor.length !== 3 ||
        m.linearColor.some((c) => !Number.isFinite(c) || c < 0 || c > 1) ||
        !Number.isFinite(m.roughness) ||
        m.roughness < 0 ||
        m.roughness > 1,
    )
  )
    throw new Error("Invalid native material");
  for (const v of kit.variants) {
    if (
      v.positions.length > 90000 ||
      v.positions.length % 3 ||
      v.indices.length % 3 ||
      v.indices.length > 19500 ||
      v.positions.some((n) => !Number.isFinite(n)) ||
      v.indices.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= v.positions.length / 3,
      ) ||
      v.triangleMaterials.length !== v.indices.length / 3 ||
      v.triangleMaterials.some(
        (m) => !Number.isInteger(m) || m < 0 || m >= kit.materials.length,
      )
    )
      throw new Error("Invalid authored patch geometry");
  }
  if (kit.layout === "volcanic-geology") return composeNativeVolcanic(kit, seed, coverage);
  if (kit.layout === "glacial-interior") return composeNativeGlacialInterior(kit, seed, coverage);
  if (kit.layout === "glacial-geography") return composeNativeGlacialGeography(kit, seed, coverage);
  if (kit.layout === "clustered-glaciers") return composeNativeGlacier(kit, seed, coverage);
  const rng = random(seed),
    batches = kit.materials.map(
      () => ({ positions: [], normals: [], indices: [] }) as NativePlanetBatch,
    );
  const tiles: number[] = [],
    rotations: number[] = [],
    links: number[][] = [];
  let triangles = 0;
  // Stable shuffle distributes a bounded number of large features without first-face bias.
  const order = Array.from({ length: 24 }, (_, i) => i);
  for (let i = 23; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const heroes = new Set(order.slice(0, Math.round(24 * coverage)));
  const connected = kit.layout === "connected-ravines",
    plan = connected ? balancedConnectedLayout(seed, coverage) : undefined;
  const ports = plan?.ports ?? Array.from({ length: 24 }, () => [] as number[]),
    extras = plan?.extras ?? [];
  if (plan) links.push(...plan.links);
  for (let tile = 0; tile < 24; tile++) {
    const face = Math.floor(tile / 4),
      x = tile % 2,
      y = Math.floor((tile % 4) / 2);
    let variant = heroes.has(tile)
        ? 1 + Math.floor(rng() * (kit.variants.length - 1))
        : 0,
      rotation = Math.floor(rng() * 4);
    if (connected) {
      variant = extras.includes(tile) ? (extras.indexOf(tile) < 2 ? 5 : 4) : 0;
      if (ports[tile].length) {
        let found = false;
        for (let v = 1; v <= 3 && !found; v++)
          for (let r = 0; r < 4 && !found; r++) {
            const openings = (kit.variants[v].ports ?? []).map(
              (p) => (p + r) % 4,
            );
            if (
              openings.length === ports[tile].length &&
              openings.every((p) => ports[tile].includes(p))
            ) {
              variant = v;
              rotation = r;
              found = true;
            }
          }
        if (!found) throw new Error("Missing native shared-port variant");
      }
    }
    if (connected && kit.variants[6]?.name === "basin-end") {
      if (variant === 1) variant = 6;
      else if (extras.includes(tile)) variant = 4;
    }
    tiles.push(variant);
    rotations.push(rotation);
    const source = kit.variants[variant];
    const mapped: number[][] = [];
    for (let i = 0; i < source.positions.length; i += 3) {
      let u = source.positions[i],
        v = source.positions[i + 1];
      for (let r = 0; r < rotation; r++) [u, v] = [-v, u];
      const n = direction(face, x - 0.5 + u, y - 0.5 + v),
        radius =
          1 +
          (connected
            ? 0.055 * Math.sin(n[0] * 3.4 + seed * 0.01) +
              0.045 * Math.sin(n[1] * 4.1 - n[2] * 2.7 + seed * 0.006)
            : 0) +
          source.positions[i + 2] * relief;
      mapped.push(n.map((q) => q * radius));
    }
    for (let i = 0; i < source.indices.length; i += 3) {
      const p = source.indices.slice(i, i + 3).map((n) => mapped[n]);
      const a = p[1].map((n, j) => n - p[0][j]),
        b = p[2].map((n, j) => n - p[0][j]);
      const normal = [
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ],
        length = Math.hypot(...normal);
      if (length < 1e-12) continue;
      const batch = batches[source.triangleMaterials[i / 3]],
        base = batch.positions.length / 3;
      for (const point of p) {
        batch.positions.push(...point);
        batch.normals.push(...normal.map((n) => n / length));
      }
      // Babylon left-handed front faces; normals remain geometric outward vectors.
      batch.indices.push(base, base + 2, base + 1);
      triangles++;
    }
  }
  if (triangles > 150000)
    throw new Error("Native planet exceeds150k triangle budget");
  return { batches, tiles, triangles, seed, rotations, links };
}

/** Macro distribution diagnostic only; this is not a pixel/material visibility claim. */
export function nativeFeatureDistribution(tiles: readonly number[]) {
  if (tiles.length !== 24) throw new Error("Expected24 native patches");
  const centers = tiles.map((_, tile) =>
    direction(
      Math.floor(tile / 4),
      (tile % 2) - 0.5,
      Math.floor((tile % 4) / 2) - 0.5,
    ),
  );
  const samples: { direction: number[]; fraction: number }[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const length = Math.hypot(x, y, z),
          view = [x / length, y / length, z / length];
        let total = 0,
          features = 0;
        centers.forEach((normal, i) => {
          const weight = Math.max(
            0,
            normal.reduce((sum, n, j) => sum + n * view[j], 0),
          );
          total += weight;
          if (tiles[i] > 0) features += weight;
        });
        samples.push({ direction: view, fraction: features / total });
      }
  return {
    minimum: Math.min(...samples.map((s) => s.fraction)),
    maximum: Math.max(...samples.map((s) => s.fraction)),
    samples,
  };
}
