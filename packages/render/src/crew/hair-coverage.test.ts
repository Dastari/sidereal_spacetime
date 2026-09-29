import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CREW_HEAD_CATALOG } from "@sidereal/content/crew-heads";

/**
 * Owner live feedback 2026-09-29: "Why does our character not have any hair on the back of their
 * head". 16 of 28 v1 hair styles exported no shell behind the skull (quantisation in
 * scripts/art_library/crew_heads/parts_hair.py shell()). This casts rays at the real runtime GLBs
 * (glTF space: +Y up, face looks -Z, so the back of the skull faces +Z) and requires hair in front of
 * the head over the back of the skull, the crown and both sides for every style's full variant, and
 * over the nape below the cap line for the cap variant.
 */
const ROOT = "assets/runtime/crew/heads/v1/";
type Tri = Float64Array; // 9 numbers per triangle

function meshTriangles(path: string, name: (node: string) => boolean): Tri {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength + 8;
  const read = (index: number) => {
    const a = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const offset = binStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const n = { SCALAR: 1, VEC3: 3 }[a.type as "SCALAR" | "VEC3"];
    const bytes = buf.buffer.slice(
      buf.byteOffset + offset,
      buf.byteOffset +
        offset +
        a.count *
          n *
          (a.componentType === 5126 || a.componentType === 5125 ? 4 : 2),
    );
    if (a.componentType === 5126) return new Float32Array(bytes);
    if (a.componentType === 5125) return new Uint32Array(bytes);
    return new Uint16Array(bytes);
  };
  const out: number[] = [];
  for (const node of json.nodes as { name: string; mesh?: number }[]) {
    if (node.mesh === undefined || !name(node.name)) continue;
    for (const prim of json.meshes[node.mesh].primitives) {
      const pos = read(prim.attributes.POSITION);
      const ind = read(prim.indices);
      for (const i of ind) out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
  }
  return Float64Array.from(out);
}

/** Nearest hit distance of a ray against a triangle soup (Moller-Trumbore), Infinity if none. */
function cast(tris: Tri, o: number[], d: number[]) {
  let best = Infinity;
  for (let t = 0; t < tris.length; t += 9) {
    const e1 = [
      tris[t + 3] - tris[t],
      tris[t + 4] - tris[t + 1],
      tris[t + 5] - tris[t + 2],
    ];
    const e2 = [
      tris[t + 6] - tris[t],
      tris[t + 7] - tris[t + 1],
      tris[t + 8] - tris[t + 2],
    ];
    const p = [
      d[1] * e2[2] - d[2] * e2[1],
      d[2] * e2[0] - d[0] * e2[2],
      d[0] * e2[1] - d[1] * e2[0],
    ];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const s = [o[0] - tris[t], o[1] - tris[t + 1], o[2] - tris[t + 2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
    if (u < 0 || u > 1) continue;
    const q = [
      s[1] * e1[2] - s[2] * e1[1],
      s[2] * e1[0] - s[0] * e1[2],
      s[0] * e1[1] - s[1] * e1[0],
    ];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
    if (dist > 1e-6 && dist < best) best = dist;
  }
  return best;
}

function coverage(hair: Tri, head: Tri, rays: { o: number[]; d: number[] }[]) {
  let covered = 0;
  for (const { o, d } of rays)
    if (cast(hair, o, d) < cast(head, o, d) - 1e-4) covered++;
  return covered / rays.length;
}

const grid = (
  a: number[],
  b: number[],
  ray: (x: number, y: number) => { o: number[]; d: number[] },
) => a.flatMap((x) => b.map((y) => ray(x, y)));
const span = (lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

// Back of the skull (above the nape), the crown, and the upper sides behind the ear line.
const BACK = grid(span(-0.2, 0.2, 7), span(0.28, 0.46, 5), (x, y) => ({
  o: [x, y, 1],
  d: [0, 0, -1],
}));
const NAPE = grid(span(-0.2, 0.2, 7), span(0.28, 0.34, 3), (x, y) => ({
  o: [x, y, 1],
  d: [0, 0, -1],
}));
const CROWN = grid(span(-0.2, 0.2, 5), span(-0.1, 0.18, 5), (x, z) => ({
  o: [x, 2, z],
  d: [0, -1, 0],
}));
const SIDES = [1, -1].flatMap((side) =>
  grid(span(0.02, 0.18, 4), span(0.38, 0.46, 3), (z, y) => ({
    o: [side, y, z],
    d: [-side, 0, 0],
  })),
);
/** Shaved styles keep bare sides by design (their shell is a 0.25-voxel stubble layer). */
const SHAVED_SIDES = new Set(["mohawk", "side_undercut"]);

describe("hair covers the head", () => {
  const head = meshTriangles(ROOT + "heads.glb", (n) => n === "head.male");
  for (const style of CREW_HEAD_CATALOG.hairStyles.map((h) => h.id)) {
    it(`${style}: full covers back, crown and sides; cap covers the nape`, () => {
      const file = `${ROOT}hair/${style}.glb`;
      const full = meshTriangles(file, (n) => n === `hair.${style}.full`);
      const cap = meshTriangles(file, (n) => n === `hair.${style}.cap`);
      expect(full.length).toBeGreaterThan(0);
      expect(coverage(full, head, BACK)).toBeGreaterThanOrEqual(0.95);
      expect(coverage(full, head, CROWN)).toBeGreaterThanOrEqual(0.95);
      if (!SHAVED_SIDES.has(style))
        expect(coverage(full, head, SIDES)).toBeGreaterThanOrEqual(0.9);
      expect(coverage(cap, head, NAPE)).toBeGreaterThanOrEqual(0.9);
    });
  }
});
