import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { GlbGeometry, GlbPrimitive } from "./glb-library";
import { clipDoorLeaf } from "./door-cutaway";

type P = [number, number, number];
const CUT = 0.5 / 1.5625 - 0.5;
const SOURCE = "assets/runtime/ship-visual/r002/door-leaf-r019.glb";

/** Read the real indexed POSITION/NORMAL/UV accessors, not a synthetic leaf box. */
function actualLeaf(): GlbGeometry {
  const bytes = readFileSync(SOURCE);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "77369dfdac6e29fa3b6dc666e607287c5ab19897c13a474f24bdf879f62d0047",
  );
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  expect(document.nodes).toHaveLength(1);
  const node = document.nodes[0];
  expect(node.name).toBe("GEO-reference-door-leaf-r019");
  expect(
    node.matrix ?? node.translation ?? node.rotation ?? node.scale,
  ).toBeUndefined();
  const binaryOffset = 20 + jsonLength + 8;
  const accessor = (index: number) => {
    const a = document.accessors[index],
      v = document.bufferViews[a.bufferView];
    expect(a.sparse).toBeUndefined();
    expect(v.buffer).toBe(0);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[
      a.type as "SCALAR" | "VEC2" | "VEC3"
    ];
    const size = { 5126: 4, 5125: 4, 5123: 2 }[
      a.componentType as 5126 | 5125 | 5123
    ];
    expect(width).toBeGreaterThan(0);
    expect(size).toBeGreaterThan(0);
    const offset = binaryOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return Array.from({ length: a.count * width }, (_, i) => {
      const at =
        offset +
        Math.floor(i / width) * (v.byteStride ?? size * width) +
        (i % width) * size;
      return a.componentType === 5126
        ? bytes.readFloatLE(at)
        : a.componentType === 5125
          ? bytes.readUInt32LE(at)
          : bytes.readUInt16LE(at);
    });
  };
  const primitives: GlbPrimitive[] = document.meshes[node.mesh].primitives.map(
    (p: {
      mode?: number;
      material: number;
      attributes: Record<string, number>;
      indices: number;
    }) => {
      expect(p.mode ?? 4).toBe(4);
      const positions = Float32Array.from(accessor(p.attributes.POSITION));
      const indices = Uint32Array.from(accessor(p.indices));
      return {
        material: document.materials[p.material].name,
        positions,
        indices,
        normals: Float32Array.from(accessor(p.attributes.NORMAL)),
        uvs: Float32Array.from(accessor(p.attributes.TEXCOORD_0)),
        triangles: indices.length / 3,
        bounds: [-0.5, -0.5, -0.0455, 0.5, 0.5, 0.0455],
      };
    },
  );
  expect(primitives.map((p) => p.triangles)).toEqual([400, 248, 160, 44, 24]);
  return {
    url: SOURCE,
    primitives,
    triangles: 876,
    bounds: [-0.5, -0.5, -0.0455, 0.5, 0.5, 0.0455],
  };
}

function triangles(p: GlbPrimitive): P[][] {
  return Array.from({ length: p.indices.length / 3 }, (_, i) =>
    Array.from(
      p.indices.subarray(i * 3, i * 3 + 3),
      (index) =>
        Array.from(p.positions.subarray(index * 3, index * 3 + 3)) as P,
    ),
  );
}

/** Independent positional edge pairing and signed-volume witness for actual output arrays. */
function closed(p: GlbPrimitive) {
  const edges = new Map<string, number[]>();
  let volume = 0;
  for (const ps of triangles(p)) {
    const [a, b, c] = ps;
    volume +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    for (let i = 0; i < 3; i++) {
      const u = ps[i].map((v) => Math.round(v * 1e7)).join(","),
        v = ps[(i + 1) % 3].map((x) => Math.round(x * 1e7)).join(",");
      const key = [u, v].sort().join("/");
      const e = edges.get(key) ?? [];
      e.push(u < v ? 1 : -1);
      edges.set(key, e);
    }
  }
  expect(volume / 6).toBeGreaterThan(0);
  for (const e of edges.values()) expect(e.sort()).toEqual([-1, 1]);
}

function attributes(p: GlbPrimitive, indices: readonly number[]) {
  return JSON.stringify(
    indices.map((i) => [
      ...p.positions.subarray(i * 3, i * 3 + 3),
      ...p.normals.subarray(i * 3, i * 3 + 3),
      ...Array.from({ length: 2 }, (_, k) => p.uvs![i * 2 + k]),
    ]),
  );
}

/** Independent generalized winding: positive closed source solids may overlap. */
function sourceContains(p: P, source: GlbPrimitive) {
  let angle = 0;
  for (const triangle of triangles(source)) {
    const [a, b, c] = triangle.map((q) => q.map((v, i) => v - p[i]));
    const dot = (u: number[], v: number[]) =>
      u.reduce((s, x, i) => s + x * v[i], 0);
    const determinant =
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    const la = Math.hypot(...a),
      lb = Math.hypot(...b),
      lc = Math.hypot(...c);
    angle +=
      2 *
      Math.atan2(
        determinant,
        la * lb * lc + dot(a, b) * lc + dot(b, c) * la + dot(c, a) * lb,
      );
  }
  return angle;
}

function primitive(ts: P[][]): GlbPrimitive {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  for (const [a, b, c] of ts) {
    const ab = b.map((v, i) => v - a[i]),
      ac = c.map((v, i) => v - a[i]);
    const n = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ],
      length = Math.hypot(...n);
    for (const p of [a, b, c]) {
      positions.push(...p);
      normals.push(...n.map((v) => v / length));
      uvs.push(p[0] * 0.2 + p[1] * 0.1, p[2] * 0.3 + p[1] * 0.4);
    }
  }
  return {
    material: "slot0_primary",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(
      positions.map((_, i) => i).filter((i) => i < positions.length / 3),
    ),
    triangles: ts.length,
    bounds: [-2, -0.5, -2, 2, 0.5, 2],
  };
}

function geometry(p: GlbPrimitive): GlbGeometry {
  return {
    url: "synthetic",
    primitives: [p],
    triangles: p.triangles,
    bounds: p.bounds,
  };
}

function prism(): GlbPrimitive {
  const polygon: P[] = [
    [0, -0.5, 0],
    [2, -0.5, 0],
    [2, -0.5, 1],
    [1, -0.5, 1],
    [1, -0.5, 2],
    [0, -0.5, 2],
  ];
  const top = polygon.map((p) => [p[0], 0.5, p[2]] as P),
    ts: P[][] = [];
  for (const [a, b, c] of [
    [0, 2, 1],
    [0, 3, 2],
    [0, 5, 3],
    [3, 5, 4],
  ]) {
    ts.push([top[a], top[b], top[c]], [polygon[c], polygon[b], polygon[a]]);
  }
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    ts.push([polygon[i], top[i], top[j]], [polygon[i], top[j], polygon[j]]);
  }
  return primitive(ts);
}

function hollow(): GlbPrimitive {
  const o: P[] = [
    [-1, -0.5, -1],
    [1, -0.5, -1],
    [1, -0.5, 1],
    [-1, -0.5, 1],
  ];
  const h: P[] = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, -0.5, 0.5],
    [-0.5, -0.5, 0.5],
  ];
  const top = (p: P): P => [p[0], 0.5, p[2]],
    ts: P[][] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    ts.push(
      [o[i], top(o[i]), top(o[j])],
      [o[i], top(o[j]), o[j]],
      [h[i], h[j], top(h[j])],
      [h[i], top(h[j]), top(h[i])],
    );
    const a = [top(o[i]), top(h[i]), top(h[j])],
      b = [top(o[i]), top(h[j]), top(o[j])];
    ts.push(
      a,
      b,
      a.map((p) => [p[0], -0.5, p[2]] as P).reverse(),
      b.map((p) => [p[0], -0.5, p[2]] as P).reverse(),
    );
  }
  return primitive(ts);
}

it("clips the immutable actual indexed r019 leaf, preserving retained authored attributes and source bytes", () => {
  const source = actualLeaf(),
    before = source.primitives.map((p) => attributes(p, Array.from(p.indices)));
  const result = clipDoorLeaf(source, CUT);
  expect(result.ok, result.ok ? "" : result.reason).toBe(true);
  if (!result.ok) return;
  expect(result.capTriangles).toBeGreaterThan(0);
  expect(result.geometry.bounds[4]).toBe(Math.fround(CUT));
  expect(result.geometry.bounds[1]).toBe(-0.5);
  expect(result.geometry.triangles).toBeLessThan(876);
  for (const p of result.geometry.primitives) {
    closed(p);
    expect(Array.from(p.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(p.uvs!).every(Number.isFinite)).toBe(true);
    for (let i = 1; i < p.positions.length; i += 3)
      expect(p.positions[i]).toBeLessThanOrEqual(Math.fround(CUT));
    const original = source.primitives.find((q) => q.material === p.material)!;
    for (const triangle of triangles(p))
      if (triangle.every((v) => v[1] === Math.fround(CUT))) {
        const midpoint = triangle.reduce(
          (sum, v) => sum.map((x, i) => x + v[i] / 3) as P,
          [0, 0, 0] as P,
        );
        midpoint[1] -= 1e-5;
        expect(
          sourceContains(midpoint, original),
          `${original.material} ${JSON.stringify(midpoint)} ${JSON.stringify(triangle)}`,
        ).toBeGreaterThan(2 * Math.PI);
      }
    const output = new Set(
      Array.from({ length: p.indices.length / 3 }, (_, i) =>
        attributes(p, Array.from(p.indices.subarray(i * 3, i * 3 + 3))),
      ),
    );
    for (let i = 0; i < original.indices.length; i += 3) {
      const ids = Array.from(original.indices.subarray(i, i + 3));
      if (
        ids.every(
          (index) => original.positions[index * 3 + 1] <= Math.fround(CUT),
        )
      )
        expect(output.has(attributes(original, ids))).toBe(true);
    }
  }
  expect(
    source.primitives.map((p) => attributes(p, Array.from(p.indices))),
  ).toEqual(before);
});

it("caps a concave solid without filling its bounding rectangle; interpolates side UVs and hard cap normals", () => {
  const source = prism();
  closed(source);
  const result = clipDoorLeaf(geometry(source), CUT);
  expect(result.ok, result.ok ? "" : result.reason).toBe(true);
  if (!result.ok) return;
  const p = result.geometry.primitives[0];
  closed(p);
  let capArea = 0;
  for (let i = 0; i < p.indices.length; i += 3) {
    const ids = Array.from(p.indices.subarray(i, i + 3)),
      ps = ids.map(
        (index) =>
          Array.from(p.positions.subarray(index * 3, index * 3 + 3)) as P,
      );
    if (ps.every((v) => v[1] === Math.fround(CUT))) {
      const [a, b, c] = ps;
      capArea +=
        Math.abs(
          (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]),
        ) / 2;
      for (const index of ids)
        expect(
          Array.from(p.normals.subarray(index * 3, index * 3 + 3)),
        ).toEqual([0, 1, 0]);
      const centroid = ps.reduce(
        (sum, v) => [sum[0] + v[0] / 3, 0, sum[2] + v[2] / 3] as P,
        [0, 0, 0] as P,
      );
      expect(centroid[0] <= 1 || centroid[2] <= 1).toBe(true);
    } else
      for (const index of ids) {
        const [x, y, z] = Array.from(
          p.positions.subarray(index * 3, index * 3 + 3),
        );
        expect(p.uvs![index * 2]).toBeCloseTo(x * 0.2 + y * 0.1, 6);
        expect(p.uvs![index * 2 + 1]).toBeCloseTo(z * 0.3 + y * 0.4, 6);
      }
  }
  expect(capArea).toBeCloseTo(3, 6);
});

it("rejects a genuine closed hollow cross-section instead of capping over the hole", () => {
  const p = hollow();
  closed(p);
  expect(clipDoorLeaf(geometry(p), CUT)).toEqual({
    ok: false,
    reason: "Nested-hole cut section unsupported",
  });
});

it.each(["open", "nonmanifold", "winding", "nonfinite", "index", "uv"])(
  "fails the complete leaf transaction on invalid source %s",
  (defect) => {
    const source = actualLeaf(),
      bad = { ...source.primitives[0] };
    if (defect === "open") bad.indices = bad.indices.slice(3);
    if (defect === "nonmanifold")
      bad.indices = Uint32Array.from([
        ...bad.indices,
        ...bad.indices.subarray(0, 3),
      ]);
    if (defect === "winding") {
      bad.indices = bad.indices.slice();
      [bad.indices[0], bad.indices[1]] = [bad.indices[1], bad.indices[0]];
    }
    if (defect === "nonfinite") {
      bad.positions = bad.positions.slice();
      bad.positions[0] = NaN;
    }
    if (defect === "index") {
      bad.indices = bad.indices.slice();
      bad.indices[0] = bad.positions.length;
    }
    if (defect === "uv") bad.uvs = [0, 0];
    expect(
      clipDoorLeaf({ ...source, primitives: [source.primitives[1], bad] }, CUT)
        .ok,
    ).toBe(false);
  },
);

it("does not manufacture geometry for a wholly removed material slot or compress an unchanged leaf", () => {
  const source = actualLeaf();
  const uncut = clipDoorLeaf(source, 0.6);
  expect(uncut.ok).toBe(true);
  if (uncut.ok) {
    expect(uncut.capTriangles).toBe(0);
    expect(uncut.geometry.triangles).toBe(source.triangles);
  }
  expect(clipDoorLeaf(source, -0.6)).toEqual({
    ok: false,
    reason: "Cut leaves no geometry",
  });
  expect(clipDoorLeaf(source, NaN)).toEqual({
    ok: false,
    reason: "Nonfinite cut height",
  });
  const elevated = primitive(
    triangles(prism()).map((t) => t.map(([x, y, z]) => [x, y + 2, z] as P)),
  );
  const mixed = clipDoorLeaf(
    {
      ...source,
      primitives: [
        ...source.primitives,
        { ...elevated, material: "entirely-above" },
      ],
    },
    CUT,
  );
  expect(mixed.ok).toBe(true);
  if (mixed.ok)
    expect(
      mixed.geometry.primitives.some((p) => p.material === "entirely-above"),
    ).toBe(false);
});
