import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import {
  createYellowStarRuntime,
  orientStellarLight,
} from "./yellow-star-runtime";
it("derives warm illumination without changing positions or overriding Lighting Off", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    light = new DirectionalLight("sun", Vector3.Down(), scene);
  const star = new Vector3(30, -200, -80),
    target = Vector3.Zero(),
    before = star.clone();
  scene.lightsEnabled = false;
  orientStellarLight(light, star, target);
  expect(
    light.direction.equalsWithEpsilon(target.subtract(star).normalize()),
  ).toBe(true);
  expect(star.equals(before)).toBe(true);
  expect(scene.lightsEnabled).toBe(false);
  expect(light.diffuse.r).toBeGreaterThan(light.diffuse.b);
  scene.dispose();
  engine.dispose();
});
it("keeps loaded star disabled until caller publishes and releases cancelled late loads", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    container = new AssetContainer(scene);
  const source = new TransformNode("source", scene);
  source.metadata = {
    gltf: {
      extras: {
        flarePhase: 0,
        flarePeriod: 5,
        flareBaseScale: [2, 3, 4],
        partId: "flare-a",
      },
    },
  };
  container.transformNodes.push(source);
  container.rootNodes.push(source);
  scene.removeTransformNode(source);
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        readFileSync(
          new URL(
            "../../../../assets/reviewed-celestials/reviewed-stars/yellow-main-sequence/star.glb",
            import.meta.url,
          ),
        ),
      ),
  );
  const spy = vi
    .spyOn(SceneLoader, "LoadAssetContainerAsync")
    .mockResolvedValueOnce(container);
  const signal = new AbortController();
  try {
    const star = await createYellowStarRuntime(scene, {
      bodyId: "body-a",
      radius: 72,
      signal: signal.signal,
    });
    expect(star.root.isEnabled()).toBe(false);
    expect(star.flareCount).toBe(1);
    expect(source.metadata.partId).toBe("body-a:flare-a");
    star.update(0);
    expect(source.isEnabled()).toBe(false);
    expect(source.metadata.role).toBe("effect");
    expect(star.activeFlares).toBe(0);
    star.update(7);
    expect(star.activeFlares).toBe(1);
    expect(source.isEnabled()).toBe(false);
    star.update(12);
    expect(star.activeFlares).toBe(0);
    signal.abort();
    expect(star.root.isDisposed()).toBe(true);
    const late = new AssetContainer(scene),
      dispose = vi.spyOn(late, "dispose");
    let resolve!: (value: AssetContainer) => void;
    spy.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const cancelled = new AbortController();
    const promise = createYellowStarRuntime(scene, {
      bodyId: "late",
      radius: 72,
      signal: cancelled.signal,
    });
    await vi.waitFor(() => expect(resolve).toBeDefined());
    cancelled.abort();
    resolve(late);
    await expect(promise).rejects.toThrow(/cancelled|disposed/);
    expect(dispose).toHaveBeenCalled();
  } finally {
    spy.mockRestore();
    vi.unstubAllGlobals();
    scene.dispose();
    engine.dispose();
  }
});

it("keeps the authored dynamic tile asset inside its upload budget with explicit surface semantics", () => {
  const bytes = readFileSync(
    new URL(
      "../../../../assets/reviewed-celestials/reviewed-stars/yellow-main-sequence/star.glb",
      import.meta.url,
    ),
  );
  expect(bytes.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
  expect(gltf.meshes).toHaveLength(1);
  expect(
    gltf.materials.every((m: any) => m.extras.stellarSurface === true),
  ).toBe(true);
  expect(
    gltf.meshes[0].primitives.every((p: any) =>
      Number.isInteger(p.attributes.TEXCOORD_0),
    ),
  ).toBe(true);
  expect(
    gltf.nodes.some(
      (n: any) => n.extras?.stellarSurface === "hexagonal-convection-v1",
    ),
  ).toBe(true);
});
