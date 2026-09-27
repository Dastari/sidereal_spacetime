import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeToxicReference } from "./toxic_reference_composition_r007";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/toxic-r007/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("retains native corroded crust geometry, corner attributes and placement identities across all LODs", () => {
  const levels = ([0, 1, 2] as const).map((lod) =>
    composeToxicReference(kit, 38, lod),
  );
  const same = (a: Float32Array | Uint32Array, b: Float32Array | Uint32Array) =>
    Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(
      Buffer.from(b.buffer, b.byteOffset, b.byteLength),
    );
  for (let k = 0; k < levels[0].length; k++) {
    const a = levels[0][k],
      b = levels[2][k];
    expect(same(a.positions, b.positions)).toBe(true);
    expect(same(a.normals, b.normals)).toBe(true);
    expect(same(a.uvs, b.uvs)).toBe(true);
    expect(same(a.indices, b.indices)).toBe(true);
    expect(a.ranges).toEqual(b.ranges);
  }
  expect(levels[0].reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
    135000,
  );
  for (const b of levels[0]) {
    let valid = true;
    for (const p of b.positions) if (!Number.isFinite(p)) valid = false;
    for (let i = 0; i < b.normals.length; i += 3)
      if (
        Math.abs(
          Math.hypot(b.normals[i], b.normals[i + 1], b.normals[i + 2]) - 1,
        ) > 1e-5
      )
        valid = false;
    expect(valid).toBe(true);
    expect(b.uvs.length).toBe((b.positions.length / 3) * 2);
  }
});
it("preserves exact authored UV seams by native material and refuses missing optical attributes", () => {
  const composed = composeToxicReference(kit, 38, 0, true),
    native = kit.variants.find(
      (v) => v.name === "toxic-basin-group-a",
    )! as NativePlanetKit["variants"][number] & { uvs: number[] };
  for (let m = 0; m < kit.materials.length; m++) {
    const range = composed[m].ranges.find(
      (r) => r.partId === "region-diagnostic",
    );
    if (!range) continue;
    const expected: number[] = [];
    for (let t = 0; t < native.triangleMaterials.length; t++)
      if (native.triangleMaterials[t] === m)
        for (let j = 0; j < 3; j++) {
          const i = native.indices[t * 3 + j];
          expected.push(...native.uvs.slice(i * 2, i * 2 + 2));
        }
    expect(
      composed[m].uvs.slice(
        range.firstTriangle * 6,
        (range.firstTriangle + range.triangleCount) * 6,
      ),
    ).toEqual(Float32Array.from(expected));
  }
  expect(() =>
    composeToxicReference(
      {
        ...kit,
        variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
      },
      38,
      0,
      true,
    ),
  ).toThrow("Missing authored toxic normals or UVs");
});
it("NullEngine uploads normals/UVs and ray-picks the recessed chemical basin before the cleared substrate", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const level = composeToxicReference(kit, 38, 0, true),
      meshes = level
        .map((b, i) => {
          if (!b.indices.length) return undefined;
          const mesh = new Mesh(`ice-diagnostic-${i}`, scene);
          mesh.metadata = {
            role: "planet",
            materialRole: i,
            triangleRanges: b.ranges,
          };
          mesh.material = new PBRMaterial(`ice-role-${i}`, scene);
          const data = new VertexData();
          data.positions = b.positions;
          data.normals = b.normals;
          data.uvs = b.uvs;
          data.indices = b.indices;
          data.applyToMesh(mesh);
          mesh.computeWorldMatrix(true);
          return mesh;
        })
        .filter((mesh): mesh is Mesh => Boolean(mesh));
    for (const mesh of meshes) {
      expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(true);
      expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);
    }
    const n = new Vector3(0.452, 0.388, 0.794).normalize(),
      east = Vector3.Cross(Vector3.Up(), n).normalize(),
      north = Vector3.Cross(n, east),
      direction = n
        .add(east.scale(-0.55 * 0.28))
        .add(north.scale(-0.13 * 0.28))
        .normalize(),
      ray = new Ray(direction.scale(2), direction.negate(), 3);
    const hits = meshes
      .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
      .filter((v) => v.hit.hit)
      .sort((a, b) => a.hit.distance - b.hit.distance);
    expect(hits[0].mesh.metadata.materialRole).toBe(8);
    const ground = hits.find((v) => v.mesh.metadata.materialRole === 0)!;
    expect(ground.hit.distance - hits[0].hit.distance).toBeGreaterThan(0.005);
    expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(1.01);
    const channelDirection = n.add(north.scale(0.15 * 0.28)).normalize(),
      channelRay = new Ray(
        channelDirection.scale(2),
        channelDirection.negate(),
        3,
      ),
      channelHits = meshes
        .map((mesh) => ({ mesh, hit: channelRay.intersectsMesh(mesh, false) }))
        .filter((v) => v.hit.hit)
        .sort((a, b) => a.hit.distance - b.hit.distance);
    expect(
      [6, 7, 8],
      "connected drainage stays open between authored cracked terraces",
    ).toContain(channelHits[0].mesh.metadata.materialRole);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it("keeps a recessed liquid sample visible in every seeded full-body region", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const level = composeToxicReference(kit, 38, 0),
      meshes = level
        .map((b, i) => {
          if (!b.indices.length) return undefined;
          const mesh = new Mesh(`toxic-full-${i}`, scene);
          mesh.metadata = {
            role: "planet",
            materialRole: i,
            triangleRanges: b.ranges,
          };
          mesh.material = new PBRMaterial("toxic-full-native", scene);
          const data = new VertexData();
          data.positions = b.positions;
          data.normals = b.normals;
          data.uvs = b.uvs;
          data.indices = b.indices;
          data.applyToMesh(mesh);
          mesh.computeWorldMatrix(true);
          return mesh;
        })
        .filter((mesh): mesh is Mesh => Boolean(mesh));
    let state = 38;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const phase = random() * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const y = 1 - (2 * (i + 0.5)) / 12,
        angle = phase + i * 2.39996323,
        r = Math.sqrt(1 - y * y),
        n = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
        east = Vector3.Cross(
          Math.abs(n.y) > 0.94 ? Vector3.Right() : Vector3.Up(),
          n,
        ).normalize(),
        north = Vector3.Cross(n, east),
        rotation = random() * Math.PI * 2,
        scale = [0.43, 0.37, 0.46, 0.39][i % 4];
      const x =
          (-0.55 * Math.cos(rotation) + 0.13 * Math.sin(rotation)) * scale,
        z = (-0.55 * Math.sin(rotation) - 0.13 * Math.cos(rotation)) * scale,
        d = n.add(east.scale(x)).add(north.scale(z)).normalize(),
        ray = new Ray(d.scale(2), d.negate(), 3);
      const hits = meshes
        .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
        .filter((v) => v.hit.hit)
        .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(
        [6, 7, 8],
        `region ${i} must retain visible chemical basin`,
      ).toContain(hits[0].mesh.metadata.materialRole);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it("preserves all Toxic6 pool/chimney variants and PBR bytes while adding real native ground relief", () => {
  const old = JSON.parse(
    readFileSync(
      "output/playwright/planet-reference-20260914/toxic-r006/kit.json",
      "utf8",
    ),
  ) as NativePlanetKit;
  expect(kit.materials).toEqual(old.materials);
  for (const name of [
    "toxic-basin-group-a",
    "toxic-basin-group-b",
    "toxic-basin-group-c",
  ])
    expect(kit.variants.find((v) => v.name === name)).toEqual(
      old.variants.find((v) => v.name === name),
    );
  for (let role = 0; role < 6; role++)
    for (const channel of ["albedo", "normal", "orm"])
      expect(
        readFileSync(
          `output/playwright/planet-reference-20260914/toxic-r007/corrosion-${role}-${channel}.png`,
        ),
      ).toEqual(
        readFileSync(
          `output/playwright/planet-reference-20260914/toxic-r006/corrosion-${role}-${channel}.png`,
        ),
      );
  const source = kit.variants.find((v) => v.name === "ground-sphere")!;
  let relief = 0;
  for (let i = 0; i < source.positions.length; i += 3)
    relief = Math.max(
      relief,
      Math.hypot(...source.positions.slice(i, i + 3)) - 1,
    );
  expect(relief).toBeGreaterThan(0.06);
  expect(relief).toBeLessThan(0.071);
  const before = JSON.parse(
      readFileSync(
        "output/playwright/planet-reference-20260914/toxic-r007/source-picks-before.json",
        "utf8",
      ),
    )[0],
    after = JSON.parse(
      readFileSync(
        "output/playwright/planet-reference-20260914/toxic-r007/source-picks-after.json",
        "utf8",
      ),
    )[0];
  expect(before.partId).toBe("ground");
  expect(after.partId).toBe("ground");
  expect(
    Math.hypot(...after.point) - Math.hypot(...before.point),
  ).toBeGreaterThan(0.025);
});
