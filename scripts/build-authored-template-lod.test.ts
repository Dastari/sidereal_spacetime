import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

interface Primitive {
  attributes: Record<string, number>;
  indices: number;
  material: number;
}
interface Glb {
  json: {
    nodes: unknown;
    materials: { alphaMode?: string; emissiveFactor?: number[] }[];
    textures?: unknown;
    samplers?: unknown;
    meshes: { primitives: Primitive[] }[];
  };
  binary: Buffer;
}
const producer = (await import(
  new URL("./build-authored-template-lod.mjs", import.meta.url).href
)) as {
  readGlb(bytes: Buffer): Glb;
  accessorData(
    doc: Glb["json"],
    binary: Buffer,
    index: number,
  ): { values: number[]; width: number; accessor: { componentType: number } };
  deriveGlb(bytes: Buffer): Promise<{ bytes: Buffer }>;
};
const root = new URL("../assets/runtime/ship-study/", import.meta.url);
it("preserves source vertex tuples, protected primitives and complete material/node identities", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("template-lod-r001/manifest.json", root), "utf8"),
  ) as { pieces: { file: string }[] };
  let reduced = 0,
    protectedCount = 0;
  for (const piece of manifest.pieces) {
    const source = producer.readGlb(
      readFileSync(new URL(`template-authored-r001/${piece.file}`, root)),
    );
    const derived = producer.readGlb(
      readFileSync(new URL(`template-lod-r001/${piece.file}`, root)),
    );
    for (const key of ["nodes", "materials", "textures", "samplers"] as const)
      expect(derived.json[key]).toEqual(source.json[key]);
    for (const [mi, mesh] of source.json.meshes.entries())
      for (const [pi, original] of mesh.primitives.entries()) {
        const output = derived.json.meshes[mi].primitives[pi];
        expect(Object.keys(output.attributes)).toEqual(
          Object.keys(original.attributes),
        );
        const streams = Object.keys(original.attributes).map(
          (name) =>
            [
              producer.accessorData(
                source.json,
                source.binary,
                original.attributes[name],
              ),
              producer.accessorData(
                derived.json,
                derived.binary,
                output.attributes[name],
              ),
            ] as const,
        );
        const tuple = (side: 0 | 1, vertex: number) =>
          streams
            .flatMap((s) =>
              s[side].values.slice(
                vertex * s[side].width,
                (vertex + 1) * s[side].width,
              ),
            )
            .join(",");
        const originalTuples = new Set(
          Array.from(
            { length: streams[0][0].values.length / streams[0][0].width },
            (_, i) => tuple(0, i),
          ),
        );
        let mismatch: number | undefined;
        for (
          let i = 0;
          i < streams[0][1].values.length / streams[0][1].width;
          i++
        ) {
          if (!originalTuples.has(tuple(1, i))) {
            mismatch = i;
            break;
          }
        }
        expect(
          mismatch,
          `${piece.file} primitive ${mi}/${pi}: changed retained vertex`,
        ).toBeUndefined();
        const a = producer.accessorData(
            source.json,
            source.binary,
            original.indices,
          ),
          b = producer.accessorData(
            derived.json,
            derived.binary,
            output.indices,
          );
        const mat = source.json.materials[original.material];
        if (
          mat.alphaMode === "BLEND" ||
          mat.alphaMode === "MASK" ||
          mat.emissiveFactor?.some((v) => v > 0)
        ) {
          protectedCount++;
          expect(b).toMatchObject({
            values: a.values,
            accessor: { componentType: a.accessor.componentType },
          });
          for (const [before, after] of streams)
            expect(after.values).toEqual(before.values);
        } else if (b.values.length < a.values.length) reduced++;
      }
  }
  expect(reduced).toBeGreaterThan(100);
  expect(protectedCount).toBeGreaterThan(100);
}, 30000);
it("refuses animated sources rather than silently producing static pose geometry", async () => {
  const source = readFileSync(
    new URL("template-authored-r001/post.normal.glb", root),
  );
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  json.animations = [{}];
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([
    encoded,
    Buffer.alloc((4 - (encoded.length % 4)) % 4, 32),
  ]);
  const binChunk = source.subarray(20 + jsonLength);
  const changed = Buffer.concat([
    source.subarray(0, 12),
    Buffer.alloc(8),
    padded,
    binChunk,
  ]);
  changed.writeUInt32LE(changed.length, 8);
  changed.writeUInt32LE(padded.length, 12);
  changed.writeUInt32LE(0x4e4f534a, 16);
  await expect(producer.deriveGlb(changed)).rejects.toThrow(/animated/);
});
