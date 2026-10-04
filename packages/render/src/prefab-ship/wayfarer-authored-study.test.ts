import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { appendTransformed, type MergeGroup } from "./batch";
import { transformPoint } from "./frames";
import {
  authoredInstanceMatrix,
  authoredMaterialIdentity,
  readAuthoredGlb,
  loadAuthoredStudy,
  type AuthoredGlbDocument,
} from "./wayfarer-authored-study";

const identity = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
describe("authored study frame admission", () => {
  it("places reusable indexed corner witnesses once in the game frame", () => {
    // Independent column-vector source formula: A*(x,-z,y), then F at origin(-2,0).
    const source = [
      [0, -1, 0, 4.75],
      [1, 0, 0, 2],
      [0, 0, 1, 0.2],
      [0, 0, 0, 1],
    ];
    const matrix = authoredInstanceMatrix("piece-local", source, [-2, 0]);
    for (const x of [-1, 2])
      for (const y of [-0.2, 0.8])
        for (const z of [-0.6, 1.3]) {
          const author = [x, -z, y];
          const placed = [4.75 - author[1], 2 + author[0], 0.2 + author[2]];
          expect(transformPoint(matrix, [x, y, z])).toEqual([
            -placed[1],
            placed[2],
            -(placed[0] + 2),
          ]);
        }
  });
  it("does not repeat baked unique node placements", () => {
    const repeated = [
      [0, -1, 0, 4.75],
      [1, 0, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const matrix = authoredInstanceMatrix("ship-node-baked", repeated, [-2, 0]);
    // Point is already transformed by the imported bulkhead node in glTF Y-up.
    expect(transformPoint(matrix, [4.75, 1.4, -0.5])).toEqual([
      -0.5, 1.4, -6.75,
    ]);
    expect(matrix).toEqual(
      authoredInstanceMatrix("ship-node-baked", identity, [-2, 0]),
    );
  });
  it("preserves true prop scale and signed mirrors without a second mirror flag", () => {
    const source = [
      [-1, 0, 0, 3],
      [0, 1, 0, 2],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const matrix = authoredInstanceMatrix("piece-local", source, [0, 0]);
    expect(transformPoint(matrix, [0.25, 1.2, 0.5])).toEqual([
      -1.5, 1.2, -2.75,
    ]);
    expect(Matrix.FromArray(matrix).determinant()).toBe(-1);
  });
  it("keeps reflected winding, inverse-transpose normals and tangent sign coherent", () => {
    const group: MergeGroup = {
      key: "test",
      positions: [],
      normals: [],
      indices: [],
    };
    const matrix = Matrix.Scaling(-2, 3, 1).asArray();
    appendTransformed(
      group,
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      [0, 1, 2],
      matrix,
      {
        uvs: [0, 0, 1, 0, 0, 1],
        tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
      },
      { correctNormals: true },
    );
    expect(group.indices).toEqual([0, 2, 1]);
    expect(group.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(group.tangents).toEqual([-1, 0, 0, -1, -1, 0, 0, -1, -1, 0, 0, -1]);
    expect(group.uvs).toEqual([0, 0, 1, 0, 0, 1]);
  });
  it("rejects non-finite placement data", () => {
    expect(() =>
      authoredInstanceMatrix("piece-local", [[NaN]], [0, 0]),
    ).toThrow();
  });
});

function textured(index: number, pixels: number[]): AuthoredGlbDocument {
  return {
    binary: Uint8Array.from(pixels),
    json: {
      textures: Array.from({ length: index + 1 }, () => ({
        source: 0,
        sampler: 0,
      })),
      images: [{ mimeType: "image/png", bufferView: 0 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pixels.length }],
      samplers: [
        { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
      ],
    },
  };
}
describe("authored material pooling", () => {
  it("uses complete embedded image bytes and sampler, independent of local texture index", () => {
    const a = {
      name: "screen",
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      extras: { sr_family: "emissive" },
    };
    const b = {
      ...a,
      pbrMetallicRoughness: { baseColorTexture: { index: 1 } },
    };
    const first = authoredMaterialIdentity(
      textured(0, [1, 2, 3]),
      a,
      "emissive",
    );
    expect(
      authoredMaterialIdentity(textured(1, [1, 2, 3]), b, "emissive"),
    ).toBe(first);
    expect(
      authoredMaterialIdentity(textured(0, [1, 2, 4]), a, "emissive"),
    ).not.toBe(first);
    const changed = textured(0, [1, 2, 3]);
    changed.json.samplers = [{ magFilter: 9728 }];
    expect(authoredMaterialIdentity(changed, a, "emissive")).not.toBe(first);
  });
  it("does not pool same-name glass, decal or opaque definitions", () => {
    const source = textured(0, [1, 2, 3]);
    const material = {
      name: "primary",
      alphaMode: "OPAQUE",
      doubleSided: true,
    };
    const key = authoredMaterialIdentity(source, material, "plastic-light");
    expect(
      authoredMaterialIdentity(
        source,
        { ...material, alphaMode: "BLEND" },
        "plastic-light",
      ),
    ).not.toBe(key);
    expect(
      authoredMaterialIdentity(
        source,
        {
          ...material,
          extensions: { KHR_materials_transmission: { transmissionFactor: 1 } },
        },
        "glass",
      ),
    ).not.toBe(key);
  });
  it("rejects borrowed changed bytes before import", () => {
    expect(() =>
      readAuthoredGlb(Uint8Array.of(1, 2, 3), "0".repeat(64)),
    ).toThrow("hash mismatch");
  });
  it("rejects external images rather than substituting a flat screen", () => {
    const source = textured(0, [1]);
    source.json.images = [{ uri: "mutable.png" }];
    expect(() =>
      authoredMaterialIdentity(
        source,
        { name: "screen", emissiveTexture: { index: 0 } },
        "emissive",
      ),
    ).toThrow("External authored image");
  });
});

it("partitions receiver placements without changing indexed attributes or material pooling", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const bytes = new Uint8Array(
    readFileSync(
      new URL(
        "../../../../assets/runtime/ship-study/wayfarer-authored-r001/glb/floor/floor.grate.glb",
        import.meta.url,
      ),
    ),
  );
  const pieces = [
    {
      id: "floor.grate",
      file: "floor.grate.glb",
      sha256:
        "55d663ea86cef90fb3f155e3e8c436aa4ac7c4e467842066f6852c7834ee9317",
      triangles: 1404,
      frame: "piece-local" as const,
    },
  ];
  const instances = [
    {
      object: "lounge-grate",
      piece: "floor.grate",
      role: "floor",
      matrix: identity,
    },
    {
      object: "rest-grate",
      piece: "floor.grate",
      role: "floor",
      matrix: identity.map((row, i) =>
        row.map((v, j) => (i === 0 && j === 3 ? 2 : v)),
      ),
    },
  ];
  const palette = {
    deck_dark: { family: "plastic-deck" },
    secondary: { family: "plastic-dark" },
    trim: { family: "plastic-dark" },
  };
  const snapshot = (candidate: Awaited<ReturnType<typeof loadAuthoredStudy>>) =>
    candidate.meshes
      .flatMap((mesh) => {
        const indices = mesh.getIndices()!;
        return mesh.metadata.authoredStudy.placementRanges.map(
          (range: {
            object: string;
            material: string;
            indexStart: number;
            indexCount: number;
          }) => ({
            object: range.object,
            material: range.material,
            materialKey: mesh.metadata.authoredStudy.materialKey,
            attributes: mesh
              .getVerticesDataKinds()
              .sort()
              .map((kind) => {
                const values = mesh.getVerticesData(kind)!;
                const size = values.length / mesh.getTotalVertices();
                return [
                  kind,
                  Array.from(
                    indices.slice(
                      range.indexStart,
                      range.indexStart + range.indexCount,
                    ),
                  ).flatMap((i) =>
                    Array.from(values.slice(i * size, (i + 1) * size)),
                  ),
                ];
              }),
          }),
        );
      })
      .sort((a, b) =>
        `${a.object}:${a.material}`.localeCompare(`${b.object}:${b.material}`),
      );
  try {
    const original = await loadAuthoredStudy(
      scene,
      pieces,
      instances,
      palette,
      [0, 0],
      async () => bytes,
    );
    const expected = snapshot(original);
    expect(original.meshes).toHaveLength(3);
    original.dispose();
    const regions = new Map([["lounge-grate", "lounge"]]);
    const split = await loadAuthoredStudy(
      scene,
      pieces,
      instances,
      palette,
      [0, 0],
      async () => {
        regions.clear(); // Async caller changes must not alter the admitted cohort.
        return bytes;
      },
      { batchRegions: regions },
    );
    expect(split.meshes).toHaveLength(6);
    expect(split.report.placedTriangles).toBe(2808);
    expect(snapshot(split)).toEqual(expected);
    expect(new Set(split.meshes.map((mesh) => mesh.material)).size).toBe(3);
    for (const mesh of split.meshes) {
      const metadata = mesh.metadata.authoredStudy;
      expect(metadata.placementRanges).toHaveLength(1);
      expect(metadata.receiverRegion).toBe(
        metadata.placementRanges[0].object === "lounge-grate"
          ? "lounge"
          : "rest",
      );
    }
    split.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    let imports = 0;
    await expect(
      loadAuthoredStudy(
        scene,
        pieces,
        instances,
        palette,
        [0, 0],
        async () => {
          imports++;
          return bytes;
        },
        { batchRegions: new Map([["unknown-grate", "lounge"]]) },
      ),
    ).rejects.toThrow("Unknown authored receiver placement");
    expect(imports).toBe(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it("registers retained materials for shader invalidation and removes them on disposal", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    new PBRMaterial("unrelated", scene);
    const bytes = new Uint8Array(
      readFileSync(
        new URL(
          "../../../../assets/runtime/ship-study/wayfarer-authored-r001/glb/floor/floor.grate.glb",
          import.meta.url,
        ),
      ),
    );
    const before = [...scene.materials];
    const candidate = await loadAuthoredStudy(
      scene,
      [
        {
          id: "floor.grate",
          file: "floor.grate.glb",
          sha256:
            "55d663ea86cef90fb3f155e3e8c436aa4ac7c4e467842066f6852c7834ee9317",
          triangles: 1404,
          frame: "piece-local",
        },
      ],
      [
        {
          object: "test-grate",
          piece: "floor.grate",
          role: "floor",
          matrix: identity,
        },
      ],
      {
        deck_dark: { family: "plastic-deck" },
        secondary: { family: "plastic-dark" },
        trim: { family: "plastic-dark" },
      },
      [0, 0],
      async () => bytes,
    );
    const used = [...new Set(candidate.meshes.map((mesh) => mesh.material))];
    expect(used).toHaveLength(3);
    expect(used.every((material) => scene.materials.includes(material!))).toBe(
      true,
    );
    expect(scene.meshes).toEqual(candidate.meshes);
    candidate.dispose();
    candidate.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toEqual(before);
    // A second invalid asset must release the first imported container while
    // preserving unrelated registered resources.
    await expect(
      loadAuthoredStudy(
        scene,
        [
          {
            id: "floor.grate",
            file: "floor.grate.glb",
            sha256:
              "55d663ea86cef90fb3f155e3e8c436aa4ac7c4e467842066f6852c7834ee9317",
            triangles: 1404,
            frame: "piece-local",
          },
          {
            id: "broken",
            file: "broken.glb",
            sha256: "0".repeat(64),
            triangles: 1,
            frame: "piece-local",
          },
        ],
        [
          {
            object: "test-grate",
            piece: "floor.grate",
            role: "floor",
            matrix: identity,
          },
        ],
        {
          deck_dark: { family: "plastic-deck" },
          secondary: { family: "plastic-dark" },
          trim: { family: "plastic-dark" },
        },
        [0, 0],
        async (piece) => (piece.id === "broken" ? Uint8Array.of(1) : bytes),
      ),
    ).rejects.toThrow("hash mismatch");
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toEqual(before);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it("cancels a pending asset fetch when its scene is disposed", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  let finish!: (bytes: Uint8Array) => void;
  const pending = new Promise<Uint8Array>((resolve) => (finish = resolve));
  const load = loadAuthoredStudy(
    scene,
    [
      {
        id: "test",
        file: "test.glb",
        sha256: "0".repeat(64),
        triangles: 1,
        frame: "piece-local",
      },
    ],
    [],
    {},
    [0, 0],
    () => pending,
  );
  scene.dispose();
  finish(Uint8Array.of(1, 2, 3));
  await expect(load).rejects.toThrow("load cancelled");
  expect(scene.meshes).toHaveLength(0);
  expect(scene.materials).toHaveLength(0);
  expect(scene.textures).toHaveLength(0);
  engine.dispose();
});
