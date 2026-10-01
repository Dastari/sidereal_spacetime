import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { deckObjectVisualUrl } from "@sidereal/content/ship-furniture";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createPrefabShipView, candidateBaseRole } from "./ship-view";
import { validateReferenceDoorLeaf } from "./doors";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { referenceSurfaceMaterial } from "./reference-finish";
import { roleSlotMaterial } from "./materials";
import { referenceInstrumentMaterial } from "./reference-instruments";
import * as variantModule from "./visual-variant";
import * as detailModule from "./normal-detail";
import type { ShipVisualManifest } from "@sidereal/content/ship-visual";
import type { GlbGeometry, GlbPrimitive } from "./glb-library";

/** Read the real indexed POSITION/NORMAL/UV accessors, not a synthetic leaf box. */
function indexedEquipmentWitness(): GlbGeometry {
  const bytes = readFileSync(
    "assets/runtime/ship-visual/r002/door-leaf-r019.glb",
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "77369dfdac6e29fa3b6dc666e607287c5ab19897c13a474f24bdf879f62d0047",
  );
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  expect(document.nodes).toHaveLength(1);
  const node = document.nodes[0];
  expect(node.name).toBe("GEO-reference-door-leaf-r019");
  expect(
    node.matrix ?? node.translation ?? node.rotation ?? node.scale,
  ).toBeUndefined();
  const binaryOffset = 20 + jsonLength + 8;
  const accessor = (index: number) => {
    const a = document.accessors[index],
      v = document.bufferViews[a.bufferView];
    expect(a.sparse).toBeUndefined();
    expect(v.buffer).toBe(0);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[
      a.type as "SCALAR" | "VEC2" | "VEC3"
    ];
    const size = { 5126: 4, 5125: 4, 5123: 2 }[
      a.componentType as 5126 | 5125 | 5123
    ];
    expect(width).toBeGreaterThan(0);
    expect(size).toBeGreaterThan(0);
    const offset = binaryOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return Array.from({ length: a.count * width }, (_, i) => {
      const at =
        offset +
        Math.floor(i / width) * (v.byteStride ?? size * width) +
        (i % width) * size;
      return a.componentType === 5126
        ? bytes.readFloatLE(at)
        : a.componentType === 5125
          ? bytes.readUInt32LE(at)
          : bytes.readUInt16LE(at);
    });
  };
  const measuredBounds = (
    positions: ArrayLike<number>,
  ): GlbGeometry["bounds"] => {
    const bounds: GlbGeometry["bounds"] = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ];
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      bounds[axis] = Math.min(bounds[axis], positions[i]);
      bounds[axis + 3] = Math.max(bounds[axis + 3], positions[i]);
    }
    return bounds;
  };
  const primitives: GlbPrimitive[] = document.meshes[node.mesh].primitives.map(
    (p: {
      mode?: number;
      material: number;
      attributes: Record<string, number>;
      indices: number;
    }) => {
      expect(p.mode ?? 4).toBe(4);
      const positions = Float32Array.from(accessor(p.attributes.POSITION));
      const indices = Uint32Array.from(accessor(p.indices));
      return {
        material: document.materials[p.material].name,
        positions,
        indices,
        normals: Float32Array.from(accessor(p.attributes.NORMAL)),
        uvs: Float32Array.from(accessor(p.attributes.TEXCOORD_0)),
        triangles: indices.length / 3,
        bounds: measuredBounds(positions),
      };
    },
  );
  expect(primitives.map((p) => p.triangles)).toEqual([400, 248, 160, 44, 24]);
  const geometry: GlbGeometry = {
    url: "fixture:sha-pinned-door-r019",
    primitives,
    triangles: 876,
    bounds: measuredBounds(primitives.flatMap((p) => [...p.positions])),
  };
  validateReferenceDoorLeaf(geometry);
  return geometry;
}

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  expect(view.metrics()).not.toHaveProperty("visualManifestSha256");
  expect(view.metrics()).not.toHaveProperty("visualCompilerSha256");
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
  const hardwareMesh = batches.find(
    (m) =>
      m !== finishMesh &&
      m !== displayMesh &&
      m.material?.name.endsWith("-secondary"),
  )!;
  expect(hardwareMesh).toBeDefined();
  hardwareMesh.metadata = { ...hardwareMesh.metadata, role: "wall" };
  hardwareMesh.material = referenceSurfaceMaterial(
    roleSlotMaterial(scene, doc.theme, "secondary", "hull"),
    {
      revision: "r002",
      profile: "federation",
      slot: "secondary",
      role: "wall",
    },
  );
  const initialHardware = hardwareMesh.material;
  const initialFinish = finishMesh.material,
    initialDisplay = displayMesh.material;
  const atlas = (initialDisplay as PBRMaterial).emissiveTexture;
  view.setTheme(doc.theme);
  expect(finishMesh.material).toBe(initialFinish);
  expect(displayMesh.material).toBe(initialDisplay);
  view.setTheme("riftjack");
  expect(hardwareMesh.material).toBe(
    referenceSurfaceMaterial(
      roleSlotMaterial(scene, "riftjack", "secondary", "hull"),
      {
        revision: "r002",
        profile: "riftjack",
        slot: "secondary",
        role: "wall",
      },
    ),
  );
  expect(hardwareMesh.metadata.role).toBe("wall");
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
  expect(hardwareMesh.material).toBe(initialHardware);
  expect(hardwareMesh.metadata.role).toBe("wall");
  view.dispose();
});

it("uses one candidate metal family for floor grilles and hull equipment without merging deck finish responses", () => {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  for (const theme of ["federation", "riftjack", "aurelian"] as const) {
    const metal = roleSlotMaterial(
      scene,
      theme,
      "metal",
      candidateBaseRole("r002", "metal", "floor"),
    );
    expect(metal).toBe(roleSlotMaterial(scene, theme, "metal", "hull"));
    expect(metal).not.toBe(roleSlotMaterial(scene, theme, "metal", "floor"));
    const floor = roleSlotMaterial(
      scene,
      theme,
      "secondary",
      candidateBaseRole("r002", "secondary", "floor"),
    );
    expect(floor).toBe(roleSlotMaterial(scene, theme, "secondary", "floor"));
    expect(floor).not.toBe(roleSlotMaterial(scene, theme, "secondary", "hull"));
    expect(
      roleSlotMaterial(
        scene,
        theme,
        "metal",
        candidateBaseRole("r001", "metal", "floor"),
      ),
    ).toBe(roleSlotMaterial(scene, theme, "metal", "floor"));
  }
});

it.each(["plain", "synthetic", "camera"] as const)(
  "initial candidate batching preserves common metal and eligible albedo (cut=%s)",
  async (mode) => {
    const syntheticCut = mode === "synthetic";
    // CPU fixture: imports/texture upload readiness are isolated, while the real whole-Wren
    // compiler, initial batch add/group/merge/apply and theme path execute unchanged.
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub: object = new Proxy(() => stub, {
      get: (_t, key) =>
        key === "then"
          ? undefined
          : key === Symbol.toPrimitive
            ? () => 0
            : stub,
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
    const geom = (id: string): GlbGeometry => ({
      url: `/fixture/${id}.glb`,
      primitives: [],
      triangles: 0,
      bounds: [0, 0, 0, 1, 1, 1],
    });
    // Genuine indexed authored surfaces enter the actual placement/batching path.
    // Only fixture slot semantics differ for the independent instrument/fabric witnesses.
    const witness = indexedEquipmentWitness();
    const metalPrimitive = witness.primitives[2];
    const fabricPrimitive = {
      ...witness.primitives[0],
      material: "primary.fabric",
    };
    // A diegetic instrument owns a unit atlas, unlike the authored tiled metal UVs.
    // Retain actual indexed geometry/normals and give this fixture an explicit UV copy.
    const uvMin = Math.min(...Array.from(metalPrimitive.uvs!));
    const uvMax = Math.max(...Array.from(metalPrimitive.uvs!));
    const instrumentPrimitive = {
      ...metalPrimitive,
      material: "emit_a",
      uvs: Float32Array.from(
        metalPrimitive.uvs!,
        (uv) => (uv - uvMin) / (uvMax - uvMin),
      ),
    };
    const authored = (id: string, primitive: GlbPrimitive): GlbGeometry => ({
      url: `/fixture/${id}.glb`,
      primitives: [primitive],
      triangles: primitive.triangles,
      bounds: witness.bounds,
    });
    let instrumentId = "",
      fabricId = "";
    const fixtureDigest = () =>
      createHash("sha256")
        .update(
          JSON.stringify(
            witness.primitives.map((p) => [
              [...p.positions],
              [...p.normals],
              [...p.indices],
              Array.from(p.uvs!),
            ]),
          ),
        )
        .digest("hex");
    const originalFixtureDigest = fixtureDigest();
    vi.spyOn(variantModule, "resolveVisualVariant").mockImplementation(
      async (_scene, _doc, dressed) => {
        const objectIds = [
          ...new Set(dressed.objects.map((o) => o.designId)),
        ].filter((id) => deckObjectVisualUrl(id));
        expect(objectIds.length).toBeGreaterThanOrEqual(2);
        [instrumentId, fabricId] = objectIds;
        expect(dressed.components.some((c) => c.view === "both")).toBe(true);
        expect(
          dressed.components.every((c) => !!c.placement.spec?.visual?.url),
        ).toBe(true);
        return {
          manifest: {
            revision: "r002",
            compilerSha256: "a".repeat(64),
          } as ShipVisualManifest,
          manifestSha256: "b".repeat(64),
          profile: "federation",
          normalUrl: "fixture:normal",
          normalSha256: "c".repeat(64),
          albedoUrl: "fixture:albedo",
          albedoSha256: "d".repeat(64),
          components: new Map(
            dressed.components.map((c) => [
              c.component,
              authored(c.component, metalPrimitive),
            ]),
          ),
          objects: new Map(
            dressed.objects.map((o) => [
              o.designId,
              o.designId === instrumentId
                ? authored("console.navigation.fixture", instrumentPrimitive)
                : o.designId === fabricId
                  ? authored("upholstery.fixture", fabricPrimitive)
                  : geom(o.designId),
            ]),
          ),
          kit: new Map([
            ...dressed.kit.map((k): [string, GlbGeometry] => [
              k.piece,
              geom(k.piece),
            ]),
            ["door-leaf.reference", witness],
          ]),
          release: () => {},
        };
      },
    );
    vi.spyOn(variantModule, "prepareCandidateMaterials").mockResolvedValue();
    const detailPool = new Map<string, PBRMaterial>();
    vi.spyOn(detailModule, "normalDetailMaterial").mockImplementation(
      (base, selection) => {
        if (!selection?.enabled) return base;
        const key = `${base.uniqueId}:${selection.profile}:${selection.revision}:${selection.albedoSha256 ?? ""}`;
        let result = detailPool.get(key);
        if (!result) {
          result = base.clone(`cpu-detail:${base.name}`)!;
          result.metadata = {
            ...base.metadata,
            shipNormalDetail: { ...selection },
          };
          detailPool.set(key, result);
        }
        return result;
      },
    );
    scene.useRightHandedSystem = true;
    const candidateErrors: string[] = [];
    const view = await createPrefabShipView(scene, prefabById("fed.s.wren")!, {
      onVisualVariantError: (error) => candidateErrors.push(error),
      parent: new TransformNode("fixture-root", scene),
      catalog: defaultPrefabComponentCatalog(),
      batch: true,
      externalDoorLeaves: mode === "camera",
      visualReviewRemovedCells: syntheticCut ? new Set(["0,0,5"]) : undefined,
      view: "deck",
      visualVariant: {
        url: "fixture:manifest",
        sha256: "b".repeat(64),
        compilerSha256: "a".repeat(64),
      },
    });
    view.setView("deck");
    expect(candidateErrors).toEqual([]);
    expect(view.metrics().visualRevision).toBe("r002");
    const metals = scene.meshes.filter(
      (m) =>
        m.isEnabled() &&
        m.name.includes(":batch:") &&
        m.material?.name === "cpu-detail:prefab-federation-metal",
    );
    expect(metals).toHaveLength(1);
    expect(
      scene.meshes.some(
        (m) =>
          m.isEnabled() &&
          m.name.includes(":batch:") &&
          m.material?.name.includes("floor-metal"),
      ),
    ).toBe(false);
    const metal = metals[0],
      roles = metal.metadata.roleRanges.map((r: { role: string }) => r.role);
    expect(roles).toContain("floor");
    expect(
      roles.some((role: string) => role === "hull" || role === "wall"),
    ).toBe(true);
    expect(metal.material?.metadata.shipNormalDetail.albedoUrl).toBeUndefined();
    const panel = scene.meshes.find(
      (m) =>
        m.isEnabled() &&
        m.name.includes(":batch:") &&
        m.material?.metadata.shipNormalDetail &&
        m.material.metadata.shipReferenceFinish,
    );
    expect(panel).toBeDefined();
    expect(panel!.material!.metadata.shipNormalDetail.albedoUrl).toBe(
      syntheticCut ? undefined : "fixture:albedo",
    );
    const original = metal.material;
    view.setTheme("riftjack");
    expect(metal.material?.name).toBe("cpu-detail:prefab-riftjack-metal");
    expect(
      metal.metadata.roleRanges.map((r: { role: string }) => r.role),
    ).toEqual(roles);
    view.setTheme("federation");
    expect(metal.material).toBe(original);
    const batches = scene.meshes.filter(
      (m): m is Mesh => m instanceof Mesh && m.name.includes(":batch:"),
    );
    const equipmentIndices = (meshes: typeof batches) =>
      meshes.reduce(
        (count, mesh) =>
          count +
          mesh.metadata.roleRanges
            .filter((r: { role: string }) => r.role === "equipment")
            .reduce((n: number, r: { count: number }) => n + r.count, 0),
        0,
      );
    const expectedEquipmentIndices = (presentation: "deck" | "flight") =>
      view.dressed.components.filter(
        (c) => c.view === "both" || c.view === presentation,
      ).length *
        metalPrimitive.indices.length +
      view.dressed.objects
        .filter((o) => o.view === "both" || o.view === presentation)
        .reduce(
          (n, o) =>
            n +
            (o.designId === instrumentId
              ? instrumentPrimitive.indices.length
              : o.designId === fabricId
                ? fabricPrimitive.indices.length
                : 0),
          0,
        );
    const assertEquipment = (presentation: "deck" | "flight") => {
      const enabled = batches.filter((m) => m.isEnabled());
      expect(equipmentIndices(enabled)).toBe(
        expectedEquipmentIndices(presentation),
      );
      expect(expectedEquipmentIndices(presentation)).toBeGreaterThan(0);
      const instruments = enabled.filter(
        (m) => m.material?.metadata.shipReferenceInstrument,
      );
      const fabrics = enabled.filter(
        (m) =>
          m.material?.metadata.shipReferenceFinish?.materialName ===
          "primary.fabric",
      );
      if (presentation === "deck") {
        expect(instruments).toHaveLength(1);
        expect(fabrics).toHaveLength(1);
        expect(instruments[0].material).not.toBe(fabrics[0].material);
        expect(
          instruments[0].material?.metadata.shipNormalDetail,
        ).toBeUndefined();
        expect(fabrics[0].material?.metadata.shipNormalDetail).toBeUndefined();
        expect(equipmentIndices(instruments)).toBe(
          view.dressed.objects.filter((o) => o.designId === instrumentId)
            .length * instrumentPrimitive.indices.length,
        );
        expect(equipmentIndices(fabrics)).toBe(
          view.dressed.objects.filter((o) => o.designId === fabricId).length *
            fabricPrimitive.indices.length,
        );
      } else {
        expect(instruments).toHaveLength(0);
        expect(fabrics).toHaveLength(0);
      }
    };
    assertEquipment("deck");
    if (mode === "camera") {
      // Each finite state is complete; nonempty BOTH equipment is included once
      // in each state and once in flight, without an extra shared material draw.
      const flight = batches.filter((m) => m.name.includes(":batch:flight|"));
      const full = batches.filter((m) => m.isEnabled());
      const resources = batches.map((mesh) => ({
        mesh,
        geometry: mesh.geometry,
        indexBuffer: mesh.geometry!.getIndexBuffer(),
        indices: mesh.getIndices(),
        kinds: mesh.getVerticesDataKinds(),
        vertices: mesh.getVerticesDataKinds().map((kind) => ({
          kind,
          buffer: mesh.getVertexBuffer(kind),
          data: mesh.getVerticesData(kind),
        })),
      }));
      const cachedDigest = () => {
        const hash = createHash("sha256");
        const add = (label: string, data: ArrayLike<number>) => {
          hash.update(JSON.stringify([label, data.length]));
          const view = ArrayBuffer.isView(data)
            ? data
            : Float64Array.from(data);
          hash.update(
            new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          );
        };
        for (const r of resources) {
          add(`${r.mesh.uniqueId}:indices`, r.mesh.getIndices()!);
          for (const kind of r.kinds)
            add(`${r.mesh.uniqueId}:${kind}`, r.mesh.getVerticesData(kind)!);
        }
        return hash.digest("hex");
      };
      const initialDigest = cachedDigest();
      const sceneResources = {
        meshes: [...scene.meshes],
        geometries: [...scene.geometries],
        materials: [...scene.materials],
        textures: [...scene.textures],
      };
      const vertexAllocations = vi.spyOn(engine, "createVertexBuffer");
      const indexAllocations = vi.spyOn(engine, "createIndexBuffer");
      const unchangedCache = () => {
        expect(scene.meshes).toEqual(sceneResources.meshes);
        expect(scene.geometries).toEqual(sceneResources.geometries);
        expect(scene.materials).toEqual(sceneResources.materials);
        expect(scene.textures).toEqual(sceneResources.textures);
        expect(vertexAllocations).not.toHaveBeenCalled();
        expect(indexAllocations).not.toHaveBeenCalled();
        for (const r of resources) {
          expect(r.mesh.geometry).toBe(r.geometry);
          expect(r.mesh.geometry!.getIndexBuffer()).toBe(r.indexBuffer);
          expect(r.mesh.getIndices()).toBe(r.indices);
          expect(r.mesh.getVerticesDataKinds()).toEqual(r.kinds);
          for (const v of r.vertices) {
            expect(r.mesh.getVertexBuffer(v.kind)).toBe(v.buffer);
            expect(r.mesh.getVerticesData(v.kind)).toBe(v.data);
          }
        }
        // Includes inactive states and all UV/normal/color channels, not only flight indices.
        expect(cachedDigest()).toBe(initialDigest);
        expect(fixtureDigest()).toBe(originalFixtureDigest);
      };
      const complete = () => {
        const enabled = batches.filter((m) => m.isEnabled());
        expect(enabled.length).toBeGreaterThan(0);
        const states = new Set(enabled.map((m) => m.name.split("|")[1]));
        expect(states.size).toBe(1);
        expect(states.has("shared")).toBe(false);
        const layouts = enabled.map((m) =>
          m.name.split("|").slice(2).join("|"),
        );
        expect(new Set(layouts).size).toBe(layouts.length);
        expect(
          enabled.filter((m) => m.material?.name.includes("metal")),
        ).toHaveLength(1);
        expect(enabled.length).toBeLessThanOrEqual(full.length);
        assertEquipment("deck");
        unchangedCache();
      };
      expect(view.metrics().deckCutStates).toBe(4);
      complete();
      const visited = new Set<number>();
      for (const raw of [
        [-20, -20, 22],
        [30, -20, 22],
        [30, 30, 22],
        [-20, 30, 22],
      ]) {
        const camera = Vector3.TransformCoordinates(
          Vector3.FromArray(raw),
          view.root
            .getChildTransformNodes()
            .find((n) => n.name.endsWith(":prefab-frame"))!
            .computeWorldMatrix(true),
        );
        expect(view.updateDeckCutaway(camera)).toBe(true);
        const sector = view.metrics().deckCutSector;
        expect(sector).not.toBeNull();
        visited.add(sector!);
        complete();
        // Same selection is a no-op and cannot allocate/append another equipment copy.
        expect(view.updateDeckCutaway(camera)).toBe(false);
        complete();
      }
      expect(visited.size).toBe(4);
      view.updateDeckCutaway(null);
      expect(batches.filter((m) => m.isEnabled())).toEqual(full);
      complete();
      view.setView("flight");
      expect(batches.filter((m) => m.isEnabled())).toEqual(flight);
      assertEquipment("flight");
      unchangedCache();
      view.setView("deck");
      expect(batches.filter((m) => m.isEnabled())).toEqual(full);
      complete();
      view.dispose();
      expect(batches.every((m) => m.isDisposed())).toBe(true);
      expect(scene.meshes.some((m) => m.name.includes(":batch:"))).toBe(false);
      expect(
        scene.geometries.some((g) => resources.some((r) => r.geometry === g)),
      ).toBe(false);
    } else {
      view.setView("flight");
      assertEquipment("flight");
      expect(fixtureDigest()).toBe(originalFixtureDigest);
      view.dispose();
    }
    scene.dispose();
  },
  // Real whole-ship compile, mesh, initial batching and theme replay share this
  // fixture; retain assertions while bounding its CI-contended CPU workload.
  15000,
);
