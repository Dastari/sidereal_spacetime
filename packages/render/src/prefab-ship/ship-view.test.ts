import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Constants } from "@babylonjs/core/Engines/constants";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createPrefabShipView } from "./ship-view";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { referenceSurfaceMaterial } from "./reference-finish";
import { roleSlotMaterial } from "./materials";
import { referenceInstrumentMaterial } from "./reference-instruments";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
});

it("batched meshes follow a moving ship root", async () => {
  // No GLBs: generated hull/floor geometry alone is enough to produce batched meshes.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  // Headless 2D canvas: every context method is a no-op that returns a chainable stub.
  const stub: object = new Proxy(() => stub, {
    get: (_t, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const shipRoot = new TransformNode("ship-root", scene);
  const view = await createPrefabShipView(scene, prefabById("fed.s.wren")!, {
    catalog: defaultPrefabComponentCatalog(),
    view: "flight",
    parent: shipRoot,
    standinComponents: true,
  });
  const batched = view.root
    .getChildMeshes()
    .filter((m) => m.name.includes(":batch:"));
  expect(batched.length).toBeGreaterThan(0);
  const before = batched.map((m) =>
    m.computeWorldMatrix(true).getTranslation(),
  );

  shipRoot.position.set(120, 0, -45);
  shipRoot.rotation.y = Math.PI / 2;

  const pivot = shipRoot.computeWorldMatrix(true);
  batched.forEach((m, i) => {
    const expected = Vector3.TransformCoordinates(before[i], pivot);
    const actual = m.computeWorldMatrix(true).getTranslation();
    expect(Vector3.Distance(actual, expected)).toBeLessThan(1e-6);
  });

  view.setView("deck");
  expect(
    view.root
      .getChildMeshes()
      .some((m) => m.name.includes(":batch:deck") && m.isEnabled()),
  ).toBe(true);
  expect(
    view.root
      .getChildMeshes()
      .some((m) => m.name.includes(":batch:flight") && m.isEnabled()),
  ).toBe(false);
});

it("prefab meshes cull back faces, not the outward faces", async () => {
  // Regression: prefab geometry is counter-clockwise seen from outside, while a new Mesh in a
  // right-handed scene treats clockwise as front. Every hull and component rendered inside-out.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_t, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const view = await createPrefabShipView(scene, prefabById("fed.s.wren")!, {
    catalog: defaultPrefabComponentCatalog(),
    view: "flight",
    standinComponents: true,
  });
  const outwardWinding = (m: Mesh) => {
    const p = m.getVerticesData(VertexBuffer.PositionKind)!;
    const n = m.getVerticesData(VertexBuffer.NormalKind)!;
    const ix = m.getIndices()!;
    let ccw = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
      const e1 = [
        p[b * 3] - p[a * 3],
        p[b * 3 + 1] - p[a * 3 + 1],
        p[b * 3 + 2] - p[a * 3 + 2],
      ];
      const e2 = [
        p[c * 3] - p[a * 3],
        p[c * 3 + 1] - p[a * 3 + 1],
        p[c * 3 + 2] - p[a * 3 + 2],
      ];
      const g = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      if (g[0] * n[a * 3] + g[1] * n[a * 3 + 1] + g[2] * n[a * 3 + 2] > 0)
        ccw++;
    }
    return ccw / (ix.length / 3);
  };
  // Babylon's own box is clockwise-outward and renders correctly with its default orientation.
  const reference = CreateBox("reference", { size: 1 }, scene);
  expect(outwardWinding(reference)).toBe(0);
  expect(reference.sideOrientation).toBe(
    Constants.MATERIAL_ClockWiseSideOrientation,
  );
  const meshes = view.root
    .getChildMeshes()
    .filter((m): m is Mesh => m instanceof Mesh && m.getTotalIndices() > 0);
  expect(meshes.length).toBeGreaterThan(0);
  for (const m of meshes) {
    if (m.material?.backFaceCulling === false) continue;
    expect(outwardWinding(m), m.name).toBeGreaterThan(0.99);
    expect(m.sideOrientation, m.name).toBe(
      Constants.MATERIAL_CounterClockWiseSideOrientation,
    );
  }
});

it("pools red navigation lenses without recolouring the ship's amber emitter slot", async () => {
  const { roleSlotMaterial, slotMaterial } = await import("./materials");
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const navigation = roleSlotMaterial(scene, "federation", "emit_b", "effect");
  const equipment = slotMaterial(scene, "federation", "emit_b");
  expect(navigation).toBe(
    roleSlotMaterial(scene, "federation", "emit_b", "effect"),
  );
  expect(navigation).not.toBe(equipment);
  expect(navigation.emissiveColor.r).toBeGreaterThan(
    20 * navigation.emissiveColor.g,
  );
  expect(equipment.emissiveColor.g).toBeGreaterThan(0.3);
  expect(roleSlotMaterial(scene, "federation", "primary", "effect")).toBe(
    slotMaterial(scene, "federation", "primary"),
  );
});

it("theme changes retain candidate finish and the exact instrument atlas", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_t, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const doc = prefabById("fed.s.wren")!;
  const view = await createPrefabShipView(scene, doc, {
    catalog: defaultPrefabComponentCatalog(),
    view: "deck",
    standinComponents: true,
  });
  const batches = view.root
    .getChildMeshes()
    .filter((m) => m.name.includes(":batch:")) as Mesh[];
  expect(batches.length).toBeGreaterThan(1);
  // Use actual view-owned batches to exercise its material replacement path.
  const finishMesh = batches.find((m) =>
      m.material?.name.endsWith("-primary"),
    )!,
    displayMesh = batches.find((m) => m !== finishMesh)!;
  expect(finishMesh).toBeDefined();
  finishMesh.material = referenceSurfaceMaterial(
    finishMesh.material as PBRMaterial,
    {
      revision: "r002",
      profile: "federation",
      slot: "primary",
      role: "wall",
      materialName: "slot0_primary.fabric",
    },
  );
  const count = displayMesh.getTotalVertices();
  const uvs = Array.from({ length: count * 2 }, (_, i) => (i % 4 >= 2 ? 1 : 0));
  displayMesh.setVerticesData(VertexBuffer.UVKind, uvs);
  displayMesh.material = referenceInstrumentMaterial(
    displayMesh.material as PBRMaterial,
    {
      revision: "r002",
      id: "console.navigation.t1",
      slot: "emit_a",
    },
    { uvs, uvsComplete: true },
  );
  const initialFinish = finishMesh.material,
    initialDisplay = displayMesh.material;
  const atlas = (initialDisplay as PBRMaterial).emissiveTexture;
  view.setTheme(doc.theme);
  expect(finishMesh.material).toBe(initialFinish);
  expect(displayMesh.material).toBe(initialDisplay);
  view.setTheme("riftjack");
  expect(finishMesh.material?.metadata.shipReferenceFinish).toMatchObject({
    revision: "r002",
    profile: "riftjack",
    role: "wall",
  });
  expect(displayMesh.material?.metadata.shipReferenceInstrument).toMatchObject({
    revision: "r002",
    id: "console.navigation.t1",
  });
  expect((displayMesh.material as PBRMaterial).emissiveTexture).toBe(atlas);
  const role = finishMesh.metadata?.role ?? "hull";
  expect((finishMesh.material as PBRMaterial).albedoColor.asArray()).toEqual(
    roleSlotMaterial(scene, "riftjack", "primary", role).albedoColor.asArray(),
  );
  view.setTheme("aurelian");
  expect(finishMesh.material?.metadata.shipReferenceFinish.profile).toBe(
    "aurelian",
  );
  expect((finishMesh.material as PBRMaterial).albedoColor.asArray()).toEqual(
    roleSlotMaterial(scene, "aurelian", "primary", role).albedoColor.asArray(),
  );
  expect((displayMesh.material as PBRMaterial).emissiveTexture).toBe(atlas);
  for (const theme of ["industrial", "crystalline"] as const) {
    view.setTheme(theme);
    expect((finishMesh.material as PBRMaterial).albedoColor.asArray()).toEqual(
      roleSlotMaterial(scene, theme, "primary", role).albedoColor.asArray(),
    );
    expect(finishMesh.material?.metadata.shipReferenceFinish.materialName).toBe(
      "slot0_primary.fabric",
    );
    expect((finishMesh.material as PBRMaterial).roughness).toBe(
      (initialFinish as PBRMaterial).roughness,
    );
    expect((displayMesh.material as PBRMaterial).emissiveTexture).toBe(atlas);
  }
  view.setTheme(doc.theme);
  expect(finishMesh.material).toBe(initialFinish);
  expect(displayMesh.material).toBe(initialDisplay);
  view.dispose();
});
