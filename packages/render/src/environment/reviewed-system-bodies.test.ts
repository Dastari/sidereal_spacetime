import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { createReviewedPlanetRuntime } from "./reviewed-native/runtime";
import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createReviewedSystemBodies } from "./reviewed-system-bodies";
import { createYellowStarRuntime } from "./yellow-star-runtime";
import type { SpaceBodyState } from "./index";
vi.mock("./yellow-star-runtime", () => ({ createYellowStarRuntime: vi.fn() }));
vi.mock("./reviewed-native/runtime", () => ({
  createReviewedPlanetRuntime: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("environment", scene);
  const manager = createReviewedSystemBodies(
    scene,
    root,
    {} as never,
    {} as never,
    { removeIncludedOnlyMesh: vi.fn() } as never,
  );
  const body = (id: string, x = 0, seed = 1): SpaceBodyState => ({
    id,
    kind: "star",
    appearance: "yellow-main-sequence-r010",
    x,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    height: -160,
    radius: 72,
    seed,
  });
  const update = (bodies: SpaceBodyState[]) =>
    manager.update(bodies, { x: 0, y: 0 }, Vector3.Zero(), undefined, 1, true);
  const ready = (id: string) => {
    const node = new TransformNode(id, scene);
    node.setEnabled(false);
    return {
      root: node,
      update: vi.fn(),
      dispose: vi.fn(() => node.dispose()),
      flareCount: 180,
      meshes: [],
      ejectaCount: 18,
      convectionMaterials: 4,
    };
  };
  return {
    scene,
    manager,
    body,
    update,
    ready,
    dispose() {
      manager.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
it("keeps the old star visible until its replacement is ready and publishes only during update", async () => {
  const f = fixture();
  try {
    const a = f.ready("a");
    vi.mocked(createYellowStarRuntime).mockResolvedValueOnce(a);
    f.update([f.body("star")]);
    await Promise.resolve();
    expect(a.root.isEnabled()).toBe(false);
    f.update([f.body("star")]);
    expect(a.root.isEnabled()).toBe(true);
    let resolve!: (value: ReturnType<typeof f.ready>) => void;
    vi.mocked(createYellowStarRuntime).mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    f.update([f.body("star", 0, 2)]);
    expect(a.root.isEnabled()).toBe(true);
    const b = f.ready("b");
    resolve(b);
    await Promise.resolve();
    expect(a.root.isEnabled()).toBe(true);
    expect(b.root.isEnabled()).toBe(false);
    f.update([f.body("star", 0, 2)]);
    expect(b.root.isEnabled()).toBe(true);
    expect(a.dispose).toHaveBeenCalledOnce();
  } finally {
    f.dispose();
  }
});
it("disposes a late cancelled result without publishing it", async () => {
  const f = fixture();
  try {
    let resolve!: (value: ReturnType<typeof f.ready>) => void;
    vi.mocked(createYellowStarRuntime).mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    f.update([f.body("gone")]);
    f.update([]);
    const late = f.ready("late");
    resolve(late);
    await Promise.resolve();
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(f.manager.stats().retainedBodies).toBe(0);
  } finally {
    f.dispose();
  }
});
it("bounds native retention to three and reuses a retained body when it returns into range", async () => {
  const f = fixture();
  try {
    vi.mocked(createYellowStarRuntime).mockImplementation(
      async (_scene, options) => f.ready(options.bodyId),
    );
    const bodies = ["a", "b", "c", "d"].map((id, i) => f.body(id, i * 10));
    f.update(bodies);
    await Promise.resolve();
    f.update(bodies);
    expect(f.manager.stats().retainedBodies).toBe(3);
    expect(createYellowStarRuntime).toHaveBeenCalledTimes(3);
    f.update(bodies.map((b) => ({ ...b, x: 1e9 })));
    expect(f.manager.shadowCandidates().every((c) => !c.node.isEnabled())).toBe(
      true,
    );
    f.update(bodies);
    expect(createYellowStarRuntime).toHaveBeenCalledTimes(3);
  } finally {
    f.dispose();
  }
});

it("releases a cancelled native planet while its atmosphere compilation is pending", async () => {
  const f = fixture();
  try {
    const planet = f.ready("pending-planet");
    vi.mocked(createReviewedPlanetRuntime).mockResolvedValue(planet as never);
    const compilation = vi
      .spyOn(ShaderMaterial.prototype, "forceCompilationAsync")
      .mockImplementation(() => new Promise(() => {}));
    f.update([
      { ...f.body("planet"), kind: "planet", appearance: "temperate-r003" },
    ]);
    await vi.waitFor(() => expect(compilation).toHaveBeenCalled());
    f.update([]);
    await vi.waitFor(() => expect(planet.dispose).toHaveBeenCalled());
    expect(planet.root.isDisposed()).toBe(true);
    expect(f.manager.stats().pendingBodies).toBe(0);
  } finally {
    f.dispose();
  }
});

it("does not queue native builds for unresolved distant bodies", () => {
  const f = fixture();
  try {
    f.update([
      {
        ...f.body("tiny", 300000),
        kind: "planet",
        appearance: "temperate-r003",
        radius: 5,
      },
    ]);
    expect(createReviewedPlanetRuntime).not.toHaveBeenCalled();
    expect(f.manager.stats().retainedBodies).toBe(0);
  } finally {
    f.dispose();
  }
});
