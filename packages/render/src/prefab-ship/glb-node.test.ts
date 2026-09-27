import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectGlbNode } from "./glb-node";

const root = resolve(import.meta.dirname, "../../../..");
const manifest = JSON.parse(
  readFileSync(
    resolve(root, "assets/runtime/ship-kit/r002/manifest.json"),
    "utf8",
  ),
);
function document(bytes: Uint8Array) {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + n)));
}

describe("named Blender bow bundles", () => {
  it("selects only a named variant, retaining exact float positions, material slots and indices", () => {
    for (const hc of ["deck", "pod", "cabin", "wing", "plate"]) {
      const entry = manifest.pieces[`bow.square.${hc}.s2.a0.roof`];
      const bytes = new Uint8Array(
        readFileSync(resolve(root, "assets/runtime/ship-kit/r002", entry.file)),
      );
      const original = document(bytes);
      const selected = selectGlbNode(bytes, entry.node);
      const doc = document(selected);
      expect(doc.nodes).toEqual([{ name: entry.node, mesh: 0 }]);
      expect(doc.meshes).toHaveLength(1);
      expect(doc.materials.map((m: { name: string }) => m.name).sort()).toEqual(
        [...entry.slots].sort(),
      );
      expect(
        doc.meshes[0].primitives.reduce(
          (n: number, p: { indices: number }) =>
            n + doc.accessors[p.indices].count / 3,
          0,
        ),
      ).toBe(entry.triangles);
      expect(selected.length).toBeLessThan(15000);
      const source =
        original.meshes[
          original.nodes.find((n: { name: string }) => n.name === entry.node)
            .mesh
        ];
      const points = (
        data: Uint8Array,
        d: typeof doc,
        p: { indices: number; attributes: { POSITION: number } },
      ) => {
        const offset =
          28 + new DataView(data.buffer, data.byteOffset).getUint32(12, true);
        const view = new DataView(data.buffer, data.byteOffset);
        const ia = d.accessors[p.indices],
          iv = d.bufferViews[ia.bufferView];
        const a = d.accessors[p.attributes.POSITION],
          v = d.bufferViews[a.bufferView];
        return Array.from({ length: ia.count }, (_, i) => {
          const index = view.getUint32(offset + iv.byteOffset + i * 4, true);
          return [0, 1, 2].map((k) =>
            view.getFloat32(offset + v.byteOffset + index * 12 + k * 4, true),
          );
        });
      };
      doc.meshes[0].primitives.forEach(
        (p: { indices: number; attributes: { POSITION: number } }, i: number) =>
          expect(points(selected, doc, p)).toEqual(
            points(bytes, original, source.primitives[i]),
          ),
      );
      expect(() => selectGlbNode(bytes, "missing-variant")).toThrow(
        "Missing or non-local",
      );
    }
  });
  it("keeps the full catalog in five files and preserves both older canopy families", () => {
    const entries = Object.entries(manifest.pieces).filter(([id]) =>
      id.startsWith("bow."),
    );
    expect(entries).toHaveLength(10400);
    expect(
      new Set(entries.map(([, e]) => (e as { file: string }).file)).size,
    ).toBe(5);
    expect(
      Object.keys(manifest.pieces).some((id) =>
        id.startsWith("canopy.upright."),
      ),
    ).toBe(true);
    expect(
      Object.keys(manifest.pieces).some(
        (id) => id.startsWith("canopy.") && !id.startsWith("canopy.upright."),
      ),
    ).toBe(true);
  });
});
