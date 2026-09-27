import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { composeCrystalReference } from "./crystal_reference_composition_r005";
import { composeCrystalReference as priorComposition } from "./crystal_reference_composition_r004";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/crystal-r005/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
const old = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/crystal-r003/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("preserves previous major crystal transforms while adding two medium groups per region", () => {
  const a = priorComposition(old, 38, 0),
    b = composeCrystalReference(kit, 38, 0);
  const extract = (level: typeof a) =>
    level.flatMap((batch, m) =>
      batch.ranges
        .filter((r) => r.partId.startsWith("colossal"))
        .map((r) => ({
          m,
          id: r.partId,
          positions: Buffer.from(
            batch.positions.slice(
              r.firstTriangle * 9,
              (r.firstTriangle + r.triangleCount) * 9,
            ).buffer,
          ).toString("base64"),
        })),
    );
  expect(extract(b)).toEqual(extract(a));
  const ids = new Set(b.flatMap((batch) => batch.ranges.map((r) => r.partId)));
  expect([...ids].filter((id) => id.startsWith("medium"))).toHaveLength(36);
  expect(b.reduce((n, batch) => n + batch.indices.length / 3, 0)).toBeLessThan(
    90000,
  );
});
it("retains every normal UV and placement at all LODs", () => {
  const a = composeCrystalReference(kit, 38, 0),
    b = composeCrystalReference(kit, 38, 2);
  for (let m = 0; m < a.length; m++) {
    for (const field of ["positions", "normals", "uvs", "indices"] as const)
      expect(
        Buffer.from(a[m][field].buffer).equals(Buffer.from(b[m][field].buffer)),
      ).toBe(true);
    expect(a[m].ranges).toEqual(b[m].ranges);
    expect(a[m].uvs.length).toBe((a[m].positions.length / 3) * 2);
  }
});
it("NullEngine retains authored UVs and normals on composed textured native batches", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    for (const [i, b] of composeCrystalReference(kit, 38, 0, true).entries()) {
      const mesh = new Mesh(`crystal-${i}`, scene);
      mesh.metadata = { role: "planet", triangleRanges: b.ranges };
      const data = new VertexData();
      data.positions = b.positions;
      data.normals = b.normals;
      data.uvs = b.uvs;
      data.indices = b.indices;
      data.applyToMesh(mesh);
      expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);
      expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
  expect(() =>
    composeCrystalReference(
      {
        ...kit,
        variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
      },
      38,
      0,
    ),
  ).toThrow("Missing native crystal normals or UVs");
});
