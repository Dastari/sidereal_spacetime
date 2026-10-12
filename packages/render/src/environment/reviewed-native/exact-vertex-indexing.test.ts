import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { indexExactVertices } from "./exact-vertex-indexing";
function bank() {
  return {
    positions: Float32Array.from([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]),
    normals: Float32Array.from([
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]),
    uvs: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
    ranges: [
      { firstTriangle: 0, triangleCount: 1, partId: "a" },
      { firstTriangle: 1, triangleCount: 1, partId: "b" },
    ],
  };
}
function expanded(data: ReturnType<typeof bank>) {
  return Array.from(data.indices).flatMap((index) => [
    ...new Uint32Array(
      data.positions.buffer,
      data.positions.byteOffset,
      data.positions.length,
    ).subarray(index * 3, index * 3 + 3),
    ...new Uint32Array(
      data.normals.buffer,
      data.normals.byteOffset,
      data.normals.length,
    ).subarray(index * 3, index * 3 + 3),
    ...new Uint32Array(
      data.uvs.buffer,
      data.uvs.byteOffset,
      data.uvs.length,
    ).subarray(index * 2, index * 2 + 2),
  ]);
}
test("preserves complete ordered corner bits, signed zero, ranges and input ownership", () => {
  const input = bank(),
    before = expanded(input),
    result = indexExactVertices(input);
  expect(result.positions.length).toBe(9);
  expect(expanded(result)).toEqual(before);
  expect(result.ranges).toBe(input.ranges);
  expect(input.positions.length).toBe(18);
  const signed = bank();
  signed.positions[9] = -0;
  expect(indexExactVertices(signed).positions.length).toBe(12);
});
test("differences in every attribute remain separate and typed subviews keep offsets", () => {
  for (const field of ["positions", "normals", "uvs"] as const) {
    const input = bank();
    const stride = field === "uvs" ? 2 : 3;
    for (let k = 0; k < stride; k++) {
      const changed = { ...input, [field]: input[field].slice() };
      changed[field][3 * stride + k] = 0.375;
      const result = indexExactVertices(changed);
      expect(result.positions.length).toBe(12);
      expect(expanded(result)).toEqual(expanded(changed));
    }
  }
  const input = bank();
  const backing = new Float32Array(24);
  backing.set(input.positions, 3);
  input.positions = backing.subarray(3, 21);
  expect(expanded(indexExactVertices(input))).toEqual(expanded(input));
});
test("unsupported/nonfinite/invalid banks fall back and all-unique output is reused", () => {
  const input = bank();
  input.positions[9] = NaN;
  expect(indexExactVertices(input)).toBe(input);
  const invalid = bank();
  invalid.indices[0] = 999;
  expect(indexExactVertices(invalid)).toBe(invalid);
  const unique = bank();
  unique.positions[9] = 3;
  unique.positions[12] = 4;
  unique.positions[15] = 5;
  expect(indexExactVertices(unique)).toBe(unique);
});
test("remapped geometry retains CPU bounds, face identity and interpolated normal/UV", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const input = bank(),
    indexed = indexExactVertices(input);
  const create = (name: string, data: ReturnType<typeof bank>) => {
    const mesh = new Mesh(name, scene);
    const vertex = new VertexData();
    vertex.positions = data.positions;
    vertex.normals = data.normals;
    vertex.uvs = data.uvs;
    vertex.indices = data.indices;
    vertex.applyToMesh(mesh);
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  try {
    const a = create("original", input),
      b = create("indexed", indexed);
    const ray = new Ray(new Vector3(0.2, 0.3, -1), new Vector3(0, 0, 1));
    const pa = a.intersects(ray),
      pb = b.intersects(ray);
    expect(pb.hit).toBe(true);
    expect(pb.faceId).toBe(pa.faceId);
    expect(pb.pickedPoint?.asArray()).toEqual(pa.pickedPoint?.asArray());
    expect(pb.getTextureCoordinates()?.asArray()).toEqual(
      pa.getTextureCoordinates()?.asArray(),
    );
    expect(pb.getNormal()?.asArray()).toEqual(pa.getNormal()?.asArray());
    expect(b.getBoundingInfo().minimum.asArray()).toEqual(
      a.getBoundingInfo().minimum.asArray(),
    );
    expect(b.getBoundingInfo().maximum.asArray()).toEqual(
      a.getBoundingInfo().maximum.asArray(),
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("rejects extra attributes and malformed layouts without mutating any input channel", () => {
  const extra = { ...bank(), colors: new Float32Array(24) };
  expect(indexExactVertices(extra)).toBe(extra);
  for (const field of ["positions", "normals", "uvs"] as const) {
    const bad = { ...bank(), [field]: new Float32Array(1) };
    expect(indexExactVertices(bad)).toBe(bad);
    const wrong = { ...bank(), [field]: new Float64Array(bank()[field]) };
    expect(
      indexExactVertices(wrong as unknown as ReturnType<typeof bank>),
    ).toBe(wrong);
  }
  const input = bank(),
    copies = [
      input.positions.slice(),
      input.normals.slice(),
      input.uvs.slice(),
      input.indices.slice(),
    ];
  indexExactVertices(input);
  expect([input.positions, input.normals, input.uvs, input.indices]).toEqual(
    copies,
  );
  for (const field of ["positions", "normals", "uvs"] as const) {
    const backing = new Float32Array(input[field].length + 8);
    backing.set(input[field], 4);
    input[field] = backing.subarray(4, backing.length - 4);
  }
  const indices = new Uint32Array(14);
  indices.set(input.indices, 4);
  input.indices = indices.subarray(4, 10);
  expect(expanded(indexExactVertices(input))).toEqual(expanded(input));
});
test("hash slot collisions preserve distinct records and still share exact duplicates", () => {
  const input = bank();
  input.positions.set([3, 0, 0, 8, 0, 0, 3, 0, 0, 8, 0, 0, 3, 0, 0, 8, 0, 0]);
  input.uvs.fill(0);
  const result = indexExactVertices(input);
  expect(result.positions.length).toBe(6);
  expect(expanded(result)).toEqual(expanded(input));
  expect(Array.from(result.indices)).toEqual([0, 1, 0, 1, 0, 1]);
});
