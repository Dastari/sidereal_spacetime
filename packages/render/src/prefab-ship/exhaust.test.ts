import { describe, expect, it } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compilePrefabFlight } from "@sidereal/sim/prefab-handling";
import {
  exhaustShape,
  jetsFromLayout,
  prefabExhaustJets,
  prefabNozzleLayout,
} from "./exhaust";

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;

describe("prefab exhaust", () => {
  it("places every jet at the server-compiled nozzle with its exhaust direction", async () => {
    const compiled = compilePrefabFlight(wren, catalog);
    const rows = compiled.actuators.map((a) => ({ ...a, throttle: 0.5 }));
    const jets = prefabExhaustJets(wren, catalog, rows);
    expect(jets).toHaveLength(compiled.actuators.length);
    expect(jets.filter((j) => j.kind === "rcs")).toHaveLength(12);
    expect(jets.filter((j) => j.kind === "main")).toHaveLength(3);
    expect(jets.filter((j) => j.kind === "reverser")).toHaveLength(3);
    // The client-side layout (for exteriors without owner telemetry) matches the compile.
    const layout = new Map(
      prefabNozzleLayout(wren, catalog).map((n) => [n.id, n]),
    );
    for (const j of jets) {
      const n = layout.get(j.id)!;
      expect(n.nozzleX).toBeCloseTo(j.nozzleX, 9);
      expect(n.nozzleY).toBeCloseTo(j.nozzleY, 9);
      expect(n.exhaustX).toBeCloseTo(j.exhaustX, 9);
      expect(n.exhaustY).toBeCloseTo(j.exhaustY, 9);
    }
    // Main drives exhaust aft.
    for (const j of jets.filter((x) => x.kind === "main"))
      expect(j.exhaustY).toBeCloseTo(-1, 9);
  });

  it("follows the achieved throttle only", async () => {
    const layout = prefabNozzleLayout(wren, catalog);
    const jets = jetsFromLayout(layout, new Map([["mount-main-c", 1]]));
    expect(jets.filter((j) => j.throttle > 0).map((j) => j.id)).toEqual([
      "mount-main-c",
    ]);
    for (const kind of ["main", "reverser", "rcs"] as const)
      expect(exhaustShape(kind, 1).length).toBeGreaterThan(
        exhaustShape(kind, 0.2).length,
      );
  });
});

it("authored fixed mains reject stale positive reverser telemetry in own and remote layouts", async () => {
  const doc = prefabById("fed.m.wayfarer")!;
  const compiled = compilePrefabFlight(doc, catalog);
  const jets = prefabExhaustJets(
    doc,
    catalog,
    compiled.actuators.map((a) => ({ ...a, throttle: 1 })),
  );
  expect(jets).toHaveLength(15);
  expect(jets.filter((j) => j.kind === "main")).toHaveLength(3);
  expect(jets.filter((j) => j.kind === "rcs")).toHaveLength(12);
  expect(jets.some((j) => j.kind === "reverser")).toBe(false);
  const layout = prefabNozzleLayout(doc, catalog);
  expect(layout.map((j) => j.id)).toEqual(jets.map((j) => j.id));
  expect(
    jetsFromLayout(layout, new Map([["mount-main-c#reverser", 1]])).every(
      (j) => j.throttle === 0,
    ),
  ).toBe(true);
  expect(
    jets
      .filter((j) => j.kind === "main")
      .every((j) => j.exhaustX === 0 && j.exhaustY === -1),
  ).toBe(true);
});

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { createShipExhaust, type ExhaustJet } from "./exhaust";
import { createDebugFeatures } from "../debug-features";

function exhaustScene(
  instances = true,
  onGlowMesh?: (
    mesh: import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh,
  ) => void,
) {
  const engine = new NullEngine();
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine),
    ship = new TransformNode("ship", scene);
  const camera = new FreeCamera("camera", new Vector3(0, 0, -30), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const exhaust = createShipExhaust(scene, ship, "federation", {
    instances,
    onGlowMesh,
  });
  const jets: ExhaustJet[] = [
    {
      id: "main",
      kind: "main",
      radius: 0.5,
      nozzleX: 2,
      nozzleY: -10,
      height: 0,
      exhaustX: 0,
      exhaustY: -1,
      throttle: 0.7,
    },
    {
      id: "rcs",
      kind: "rcs",
      radius: 0.1,
      nozzleX: -2,
      nozzleY: -8,
      height: 0,
      exhaustX: 1,
      exhaustY: 0,
      throttle: 0.4,
    },
  ];
  const frame = (now = 400) => {
    scene.incrementRenderId();
    exhaust.update(jets, now);
    scene.updateTransformMatrix();
    (
      scene as unknown as { _evaluateActiveMeshes(): void }
    )._evaluateActiveMeshes();
  };
  return {
    scene,
    engine,
    ship,
    camera,
    exhaust,
    jets,
    frame,
    async ready() {
      frame();
      for (const mesh of exhaust.glowMeshes())
        await mesh.material!.forceCompilationAsync(mesh as Mesh, {
          useInstances: instances && !mesh.isVisible,
        });
    },
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
const plumeSignature = (exhaust: ReturnType<typeof createShipExhaust>) =>
  exhaust.meshes().map((mesh) => ({
    positions: Array.from(mesh.getVerticesData("position")!),
    normals: Array.from(mesh.getVerticesData("normal")!),
    colors: Array.from(mesh.getVerticesData("color")!),
    indices: Array.from(mesh.getIndices()!),
    matrix: Array.from(mesh.worldMatrixFromCache.m),
    bounds: mesh
      .getBoundingInfo()
      .boundingBox.vectorsWorld.map((v) => v.asArray()),
    phase: mesh.metadata.exhaustPhase,
    pickable: mesh.isPickable,
    alpha: mesh.hasVertexAlpha,
  }));
it("applies the F3 experiment to current and later owners and restores clones immediately", async () => {
  const h = exhaustScene(false);
  const debug = createDebugFeatures(h.scene, []);
  const observers =
    h.scene.onBeforeActiveMeshesEvaluationObservable.observers.filter(
      (observer) => !observer._willBeUnregistered,
    ).length;
  try {
    await h.ready();
    h.frame();
    const original = plumeSignature(h.exhaust);
    expect(debug.snapshot().exhaustInstances).toBe(false);
    debug.toggle("exhaustInstances");
    for (const mesh of h.exhaust.glowMeshes())
      await mesh.material!.forceCompilationAsync(mesh as Mesh, {
        useInstances: !mesh.isVisible,
      });
    for (let i = 0; i < 5; i++) h.frame();
    expect(
      h.exhaust.meshes().every((mesh) => mesh instanceof InstancedMesh),
    ).toBe(true);
    expect(plumeSignature(h.exhaust)).toEqual(original);
    const late = createShipExhaust(h.scene, h.ship, "federation");
    late.update(h.jets, 400);
    for (const mesh of late.glowMeshes())
      await mesh.material!.forceCompilationAsync(mesh as Mesh, {
        useInstances: !mesh.isVisible,
      });
    for (let i = 0; i < 5; i++) h.frame();
    expect(late.meshes().every((mesh) => mesh instanceof InstancedMesh)).toBe(
      true,
    );
    debug.reset();
    // No frame callback or helper-registration delay is required to restore originals.
    expect(h.exhaust.meshes().every((mesh) => mesh instanceof Mesh)).toBe(true);
    expect(late.meshes().every((mesh) => mesh instanceof Mesh)).toBe(true);
    expect(plumeSignature(h.exhaust)).toEqual(original);
    expect(
      h.scene.onBeforeActiveMeshesEvaluationObservable.observers.filter(
        (observer) => !observer._willBeUnregistered,
      ).length,
    ).toBe(observers);
    debug.toggle("exhaustInstances");
    for (let i = 0; i < 5; i++) h.frame();
    expect(
      h.exhaust.meshes().every((mesh) => mesh instanceof InstancedMesh),
    ).toBe(true);
    debug.toggle("exhaustInstances");
    expect(plumeSignature(h.exhaust)).toEqual(original);
    late.dispose();
    debug.dispose();
    const following = createShipExhaust(h.scene, h.ship, "federation");
    following.update(h.jets, 400);
    expect(following.meshes().every((mesh) => mesh instanceof Mesh)).toBe(true);
    following.dispose();
  } finally {
    debug.dispose();
    h.dispose();
  }
});

it("keeps original plumes when F3 requests instances on an unsupported engine", async () => {
  const h = exhaustScene(false),
    debug = createDebugFeatures(h.scene, []);
  try {
    await h.ready();
    h.engine.getCaps().instancedArrays = false;
    const observers =
      h.scene.onBeforeActiveMeshesEvaluationObservable.observers.filter(
        (observer) => !observer._willBeUnregistered,
      ).length;
    debug.toggle("exhaustInstances");
    for (let i = 0; i < 5; i++) h.frame();
    expect(h.exhaust.meshes().every((mesh) => mesh instanceof Mesh)).toBe(true);
    expect(
      h.scene.onBeforeActiveMeshesEvaluationObservable.observers.filter(
        (observer) => !observer._willBeUnregistered,
      ).length,
    ).toBe(observers);
  } finally {
    debug.dispose();
    h.dispose();
  }
});
it("keeps plume geometry, achieved throttle, phase, world bounds and transforms identical to clones", async () => {
  const original = exhaustScene(false),
    candidate = exhaustScene();
  try {
    await original.ready();
    await candidate.ready();
    for (let i = 0; i < 5; i++) {
      original.frame(300 + i * 16);
      candidate.frame(300 + i * 16);
    }
    expect(
      candidate.exhaust.meshes().every((m) => m instanceof InstancedMesh),
    ).toBe(true);
    expect(plumeSignature(candidate.exhaust)).toEqual(
      plumeSignature(original.exhaust),
    );
    expect(candidate.exhaust.lit()).toEqual(original.exhaust.lit());
    candidate.jets.forEach((j) => (j.throttle = 0));
    original.jets.forEach((j) => (j.throttle = 0));
    original.frame();
    candidate.frame();
    expect(candidate.exhaust.meshes().every((m) => !m.isEnabled())).toBe(true);
    expect(candidate.exhaust.lit()).toEqual([]);
    candidate.jets.forEach((j) => (j.throttle = 1));
    original.jets.forEach((j) => (j.throttle = 1));
    for (let i = 0; i < 3; i++) {
      original.frame();
      candidate.frame();
    }
    expect(plumeSignature(candidate.exhaust)).toEqual(
      plumeSignature(original.exhaust),
    );
    expect(
      candidate.scene.meshes.filter((m) => m.isVisible && m.isEnabled()),
    ).toHaveLength(2);
  } finally {
    original.dispose();
    candidate.dispose();
  }
});
it("falls back on the same frame when glass interleaves and preserves phase through repeated switches", async () => {
  const f = exhaustScene(),
    original = exhaustScene(false);
  try {
    await f.ready();
    await original.ready();
    for (let i = 0; i < 4; i++) {
      f.frame();
      original.frame();
    }
    const glass = CreateBox("glass", {}, f.scene),
      material = new StandardMaterial("glass", f.scene);
    material.alpha = 0.5;
    glass.material = material;
    glass.position.z = 5;
    f.frame();
    original.frame();
    expect(
      f.exhaust.meshes().filter((m) => m instanceof InstancedMesh),
    ).toHaveLength(0);
    expect(plumeSignature(f.exhaust)).toEqual(plumeSignature(original.exhaust));
    glass.position.z = 80;
    for (let i = 0; i < 3; i++) {
      f.frame();
      original.frame();
    }
    expect(f.exhaust.meshes().every((m) => m instanceof InstancedMesh)).toBe(
      true,
    );
    expect(plumeSignature(f.exhaust)).toEqual(plumeSignature(original.exhaust));
    f.scene.setRenderingOrder(0, null, null, () => 0);
    f.frame();
    original.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
    expect(plumeSignature(f.exhaust)).toEqual(plumeSignature(original.exhaust));
  } finally {
    f.dispose();
    original.dispose();
  }
});
it("keeps effect-layer identity and retires glow admission on nozzle removal", async () => {
  let glow: GlowLayer | undefined;
  const register = (
    mesh: import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh,
  ) => {
    glow!.addIncludedOnlyMesh(mesh as Mesh);
    glow!.setEffectIntensity(mesh, 0.4);
    mesh.onDisposeObservable.addOnce(() =>
      glow!.removeIncludedOnlyMesh(mesh as Mesh),
    );
  };
  const f = exhaustScene(true, register);
  glow = new GlowLayer("glow", f.scene);
  try {
    await f.ready();
    for (let i = 0; i < 4; i++) f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
    for (const mesh of f.exhaust.glowMeshes())
      expect(glow.hasMesh(mesh)).toBe(true);
    const sources = f.exhaust.glowMeshes().filter((m) => !m.isVisible);
    expect(sources.every((m) => !m.isEnabled() && m.visibility === 1)).toBe(
      true,
    );
    for (let cycle = 0; cycle < 4; cycle++) {
      const old = f.exhaust.meshes();
      f.exhaust.update([], 0);
      for (const mesh of old) expect(glow.hasMesh(mesh)).toBe(false);
      f.frame();
      for (const mesh of f.exhaust.meshes()) {
        expect(glow.hasMesh(mesh)).toBe(true);
        expect(glow.getEffectIntensity(mesh)).toBe(0.4);
      }
    }
    f.ship.dispose();
    f.exhaust.dispose();
    expect(
      f.scene.meshes.filter((m) => m.name.startsWith("ship-exhaust")),
    ).toHaveLength(0);
    expect(
      f.scene.onBeforeActiveMeshesEvaluationObservable.observers.filter(
        (o) => !o._willBeUnregistered,
      ),
    ).toHaveLength(0);
  } finally {
    f.dispose();
  }
});
it("keeps glow queue order when nonadditive emission is outside the main distance interval", async () => {
  let layer: GlowLayer | undefined;
  const f = exhaustScene(true, (mesh) =>
    layer!.addIncludedOnlyMesh(mesh as Mesh),
  );
  layer = new GlowLayer("layer", f.scene);
  const glass = CreateBox("emissive-glass", {}, f.scene),
    mat = new StandardMaterial("glass", f.scene);
  glass.material = mat;
  glass.position.z = 80;
  mat.alpha = 0.5;
  layer.addIncludedOnlyMesh(glass);
  try {
    await f.ready();
    for (let i = 0; i < 5; i++) f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
    layer.removeIncludedOnlyMesh(glass);
    for (let i = 0; i < 3; i++) f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
    layer.customEmissiveColorSelector = (_mesh, _sub, _mat, color) =>
      color.set(1, 0, 0, 1);
    f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
  } finally {
    f.dispose();
  }
});
it("rejects nonadditive hidden render owners and order-independent transparency", async () => {
  const f = exhaustScene();
  try {
    const source = CreateBox("glass-owner", {}, f.scene),
      mat = new StandardMaterial("glass", f.scene);
    mat.alpha = 0.5;
    source.material = mat;
    source.isVisible = false;
    source.position.z = 5;
    const placed = new InstancedMesh("glass-placement", source);
    placed.position.z = 80;
    for (let i = 0; i < 4; i++) f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
    placed.dispose();
    source.dispose();
    for (let i = 0; i < 3; i++) f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof InstancedMesh)).toBe(
      true,
    );
    f.scene.useOrderIndependentTransparency = true;
    f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
  } finally {
    f.dispose();
  }
});

import { TransmissionHelper } from "@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper";
it("reuses registered clones when a transmission helper appears after batching", async () => {
  const f = exhaustScene();
  try {
    await f.ready();
    const clones = f.exhaust.meshes();
    for (let i = 0; i < 5; i++) f.frame();
    const instances = f.exhaust.meshes();
    expect(instances.every((m) => m instanceof InstancedMesh)).toBe(true);
    const helper = new TransmissionHelper({ renderSize: 64 }, f.scene);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const target =
      helper.getOpaqueTarget()! as import("@babylonjs/core/Materials/Textures/renderTargetTexture").RenderTargetTexture;
    expect(clones.every((m) => target.renderList!.includes(m))).toBe(true);
    f.frame();
    expect(f.exhaust.meshes()).toEqual(clones);
    expect(
      clones.every((m) => target.renderList!.includes(m) && m.isEnabled()),
    ).toBe(true);
    expect(instances.every((m) => !m.isDisposed() && !m.isEnabled())).toBe(
      true,
    );
    helper.dispose();
  } finally {
    f.dispose();
  }
});

it("honours late effect admission of a retained original plume handle", async () => {
  const f = exhaustScene();
  try {
    await f.ready();
    const originals = f.exhaust.meshes();
    for (let i = 0; i < 5; i++) f.frame();
    expect(f.exhaust.meshes()[0]).toBeInstanceOf(InstancedMesh);
    const layer = new GlowLayer("late-glow", f.scene);
    layer.addIncludedOnlyMesh(originals[0] as Mesh);
    f.frame();
    expect(f.exhaust.meshes()[0]).toBe(originals[0]);
    expect(originals[0].isEnabled()).toBe(true);
    expect(layer.hasMesh(originals[0])).toBe(true);
  } finally {
    f.dispose();
  }
});

it("rejects an opaque controlling mesh that selects a transparent LOD", async () => {
  const f = exhaustScene();
  try {
    await f.ready();
    const controlling = CreateBox("opaque-control", {}, f.scene);
    const lod = CreateBox("transparent-lod", {}, f.scene);
    const glass = new StandardMaterial("lod-glass", f.scene);
    glass.alpha = 0.5;
    lod.material = glass;
    controlling.addLODLevel(1, lod);
    for (let i = 0; i < 5; i++) f.frame();
    expect(f.exhaust.meshes().every((m) => m instanceof Mesh)).toBe(true);
  } finally {
    f.dispose();
  }
});
