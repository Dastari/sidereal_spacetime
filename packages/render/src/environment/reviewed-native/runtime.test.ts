import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { createReviewedPlanetRuntime } from "./runtime";
import type { ReviewedNativePlanetDescriptor } from "../reviewed-native-planet-catalog";
import type {
  ReviewedBuildInput,
  ReviewedBuildResult,
} from "./build-reviewed-planet";
import { planetRecipe } from "../../../../content/src/environment";
const descriptor = {
  id: "gas-r005",
  revision: "gas-r005",
  style: "gas",
  layout: "gas-bands-and-rings",
  textureBaseURL: "/assets/planets/gas-r005/",
  fixedDetail: false,
  localLight: false,
} as ReviewedNativePlanetDescriptor;
const header = {
  schema: "sidereal.native-planet-kit.v1" as const,
  layout: "gas-bands-and-rings" as const,
  materials: [
    {
      name: "native",
      linearColor: [0.1, 0.2, 0.3],
      roughness: 0.84,
      clearcoatFactor: 0.4,
    },
  ] as const,
};
const result: ReviewedBuildResult = {
  buildMs: 1,
  shadowRadii: [1],
  batches: [
    {
      positions: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      normals: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      ranges: [{ partId: "body-patch", firstTriangle: 0, triangleCount: 1 }],
    },
  ],
  weather: undefined,
  smoke: undefined,
  weatherShadowRadius: undefined,
};
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    worker = {
      registerReviewed: vi.fn(async () => ({
        assetKey: "shared-asset",
        header,
      })),
      buildReviewed: vi.fn(
        async (_key: string, _input: ReviewedBuildInput) => result,
      ),
      releaseReviewed: vi.fn(async () => {}),
      nextFrame: vi.fn(async () => {}),
    };
  return { engine, scene, worker };
}
test("shares authored material across retained levels and swaps only after preparation at update boundary", async () => {
  const f = fixture();
  let ready!: () => void;
  const prepared: string[] = [];
  const runtime = await createReviewedPlanetRuntime(f.scene, {
    bodyId: "editor-7",
    descriptor,
    recipe: planetRecipe("gas", 38),
    worker: f.worker,
    prepareMaterial: async (mesh) => {
      prepared.push(mesh.metadata.trianglePlacementRanges[0].partId);
      if (mesh.parent!.metadata.lod === 0)
        await new Promise<void>((r) => {
          ready = r;
        });
    },
  });
  try {
    runtime.update(20);
    await flush();
    runtime.update(20);
    expect(runtime.stats().active).toBe(2);
    const far = runtime.root.getChildMeshes()[0],
      material = far.material;
    runtime.update(200);
    await flush();
    expect(runtime.stats().active).toBe(2);
    expect(far.isEnabled()).toBe(true);
    const near = runtime.root
      .getChildMeshes()
      .find((m) => m.parent!.metadata.lod === 0)!;
    expect(near.isEnabled()).toBe(false);
    expect(near.material).toBe(material);
    expect(prepared).toEqual([
      "editor-7:38:body-patch",
      "editor-7:38:body-patch",
    ]);
    ready();
    await flush();
    expect(runtime.stats().active).toBe(2);
    runtime.update(200);
    expect(runtime.stats().active).toBe(0);
    expect(far.isEnabled()).toBe(false);
    runtime.update(20);
    expect(runtime.stats().active).toBe(2);
    expect(f.worker.buildReviewed).toHaveBeenCalledTimes(2);
    runtime.dispose();
    expect(f.worker.releaseReviewed).toHaveBeenCalledExactlyOnceWith(
      "shared-asset",
    );
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
  } finally {
    runtime.dispose();
    f.scene.dispose();
    f.engine.dispose();
  }
});
test("abort rejects pending level publication and releases lease before stale build completion", async () => {
  const f = fixture(),
    controller = new AbortController();
  let complete!: (value: ReviewedBuildResult) => void;
  f.worker.buildReviewed.mockImplementationOnce(
    () =>
      new Promise((r) => {
        complete = r;
      }),
  );
  const runtime = await createReviewedPlanetRuntime(f.scene, {
    bodyId: "old-selection",
    descriptor,
    recipe: planetRecipe("gas", 38),
    worker: f.worker,
    signal: controller.signal,
    prepareMaterial: async () => {},
  });
  runtime.update(20);
  controller.abort();
  complete(result);
  await flush();
  expect(runtime.root.isDisposed()).toBe(true);
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.worker.releaseReviewed).toHaveBeenCalledTimes(1);
  f.scene.dispose();
  f.engine.dispose();
});
test("scene disposal releases body registration and all fixed-detail resources exactly once", async () => {
  const f = fixture(),
    runtime = await createReviewedPlanetRuntime(f.scene, {
      bodyId: "scene-owned",
      descriptor: { ...descriptor, fixedDetail: true },
      recipe: planetRecipe("gas", 38),
      worker: f.worker,
      prepareMaterial: async () => {},
    });
  runtime.update(20);
  await flush();
  runtime.update(20);
  runtime.update(300);
  await flush();
  expect(f.worker.buildReviewed).toHaveBeenCalledTimes(1);
  f.scene.dispose();
  runtime.dispose();
  expect(f.worker.releaseReviewed).toHaveBeenCalledTimes(1);
  expect(runtime.root.isDisposed()).toBe(true);
  f.engine.dispose();
});

test("qualified common banks publish atomically, retain identities across LODs and survive failed level preparation", async () => {
  const f = fixture();
  const h = {
    ...header,
    layout: "temperate-native-continents" as const,
    materials: [
      header.materials[0],
      { ...header.materials[0], name: "common" },
    ],
  };
  const empty = {
    positions: new Float32Array(),
    normals: new Float32Array(),
    uvs: new Float32Array(),
    indices: new Uint32Array(),
    ranges: [],
  };
  const triangle = result.batches[0];
  const worker = {
    ...f.worker,
    registerReviewed: vi.fn(async () => ({
      assetKey: "shared-asset",
      header: h,
      invariantBanks: "temperate-r003-v1" as const,
    })),
    buildReviewed: vi.fn(
      async (
        _key: string,
        input: import("./build-reviewed-planet").ReviewedBuildInput,
      ) => ({
        ...result,
        partition: input.partition,
        batches:
          input.partition === "temperate-common-banks"
            ? [empty, triangle]
            : [triangle, empty],
      }),
    ),
  };
  let failNear = true;
  const runtime = await createReviewedPlanetRuntime(f.scene, {
    bodyId: "pelagic",
    descriptor: {
      ...descriptor,
      id: "temperate-r003",
      revision: "temperate-r003",
      style: "temperate",
      layout: "temperate-native-continents",
    },
    recipe: planetRecipe("temperate", 117),
    worker,
    prepareMaterial: async (mesh) => {
      if (mesh.parent!.metadata.lod === 0 && failNear)
        throw Error("failed compilation");
    },
  });
  runtime.update(40);
  await flush();
  const common = runtime.root
    .getChildMeshes()
    .find((mesh) => mesh.parent!.metadata.commonBanks)!;
  expect(common).toBeDefined();
  expect(common.isEnabled()).toBe(false);
  expect(runtime.stats().active).toBeUndefined();
  runtime.update(40);
  expect(runtime.stats().active).toBe(2);
  expect(common.isEnabled()).toBe(true);
  const geometry = common.geometry,
    material = common.material;
  runtime.update(200);
  await flush();
  runtime.update(200);
  expect(runtime.stats().active).toBe(2);
  expect(common.isEnabled()).toBe(true);
  expect(runtime.stats().error).toContain("failed compilation");
  failNear = false;
  runtime.update(70);
  await flush();
  runtime.update(70);
  expect(runtime.stats().active).toBe(1);
  runtime.update(20);
  expect(runtime.stats().active).toBe(2);
  expect(common.geometry).toBe(geometry);
  expect(common.material).toBe(material);
  expect(runtime.stats().commonBuilds).toBe(1);
  expect(
    worker.buildReviewed.mock.calls.filter(
      ([, input]) => input.partition === "temperate-common-banks",
    ),
  ).toHaveLength(1);
  expect(common.metadata.trianglePlacementRanges[0].partId).toBe(
    "pelagic:117:body-patch",
  );
  expect(common.isPickable).toBe(true);
  expect(common.receiveShadows).toBe(true);
  runtime.dispose();
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.scene.materials).toHaveLength(0);
  expect(worker.releaseReviewed).toHaveBeenCalledTimes(1);
  f.scene.dispose();
  f.engine.dispose();
});
test.each(["worker", "upload", "prepare"])(
  "cancel shared %s preparation releases pending common banks without publication",
  async (stage) => {
    const f = fixture(),
      abort = new AbortController();
    let complete!: () => void;
    const gate = new Promise<void>((r) => (complete = r));
    const worker = {
      ...f.worker,
      registerReviewed: vi.fn(async () => ({
        assetKey: "shared-asset",
        header,
        invariantBanks: "temperate-r003-v1" as const,
      })),
      buildReviewed: vi.fn(
        async (
          _key: string,
          input: import("./build-reviewed-planet").ReviewedBuildInput,
        ) => {
          if (stage === "worker") await gate;
          return { ...result, partition: input.partition };
        },
      ),
      nextFrame: vi.fn(async () => {
        if (stage === "upload") await gate;
      }),
    };
    const runtime = await createReviewedPlanetRuntime(f.scene, {
      bodyId: "pending",
      descriptor,
      recipe: planetRecipe("gas", 117),
      worker,
      signal: abort.signal,
      prepareMaterial: async () => {
        if (stage === "prepare") await gate;
      },
    });
    runtime.update(40);
    await flush();
    abort.abort();
    complete();
    await flush();
    expect(runtime.root.isDisposed()).toBe(true);
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
    expect(worker.releaseReviewed).toHaveBeenCalledTimes(1);
    f.scene.dispose();
    f.engine.dispose();
  },
);
test("response partition mismatch rejects publication and unsupported control remains complete", async () => {
  const f = fixture();
  const worker = {
    ...f.worker,
    registerReviewed: vi.fn(async () => ({
      assetKey: "shared-asset",
      header,
      invariantBanks: "temperate-r003-v1" as const,
    })),
  };
  const runtime = await createReviewedPlanetRuntime(f.scene, {
    bodyId: "bad-response",
    descriptor,
    recipe: planetRecipe("gas", 117),
    worker,
    prepareMaterial: async () => {},
  });
  runtime.update(20);
  await flush();
  expect(runtime.stats().active).toBeUndefined();
  expect(runtime.stats().error).toContain("partition response mismatch");
  runtime.dispose();
  const control = await createReviewedPlanetRuntime(f.scene, {
    bodyId: "control",
    descriptor,
    recipe: planetRecipe("gas", 117),
    worker,
    shareTemperateInvariantBanks: false,
    prepareMaterial: async () => {},
  });
  control.update(20);
  await flush();
  control.update(20);
  expect(control.stats().active).toBe(2);
  expect(worker.buildReviewed.mock.calls.at(-1)![1]).not.toHaveProperty(
    "partition",
  );
  control.dispose();
  f.scene.dispose();
  f.engine.dispose();
});

test("ready common banks stay body-owned when one peer retires, and scene disposal releases both leases", async () => {
  const f = fixture();
  const empty = {
    positions: new Float32Array(),
    normals: new Float32Array(),
    uvs: new Float32Array(),
    indices: new Uint32Array(),
    ranges: [],
  };
  const worker = {
    ...f.worker,
    registerReviewed: vi.fn(async () => ({
      assetKey: "shared-asset",
      header: {
        ...header,
        materials: [
          header.materials[0],
          { ...header.materials[0], name: "common" },
        ],
      },
      invariantBanks: "temperate-r003-v1" as const,
    })),
    buildReviewed: vi.fn(async (_key: string, input: ReviewedBuildInput) => ({
      ...result,
      partition: input.partition,
      batches:
        input.partition === "temperate-common-banks"
          ? [empty, result.batches[0]]
          : [result.batches[0], empty],
    })),
  };
  const make = (bodyId: string) =>
    createReviewedPlanetRuntime(f.scene, {
      bodyId,
      descriptor,
      recipe: planetRecipe("temperate", 117),
      worker,
      prepareMaterial: async () => {},
    });
  const a = await make("first"),
    b = await make("peer");
  a.update(20);
  b.update(20);
  await flush();
  a.update(20);
  b.update(20);
  expect(a.root.getChildMeshes().filter((m) => m.isEnabled())).toHaveLength(2);
  expect(b.root.getChildMeshes().filter((m) => m.isEnabled())).toHaveLength(2);
  expect(
    new Set(
      [...a.root.getChildMeshes(), ...b.root.getChildMeshes()].map(
        (m) => m.material,
      ),
    ).size,
  ).toBe(4);
  a.dispose();
  expect(worker.releaseReviewed).toHaveBeenCalledTimes(1);
  expect(b.root.getChildMeshes().every((m) => !m.isDisposed())).toBe(true);
  b.update(300);
  await flush();
  b.update(300);
  expect(b.root.getChildMeshes().filter((m) => m.isEnabled())).toHaveLength(2);
  f.scene.dispose();
  b.dispose();
  expect(worker.releaseReviewed).toHaveBeenCalledTimes(2);
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.scene.materials).toHaveLength(0);
  f.engine.dispose();
});
