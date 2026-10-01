import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { readFileSync } from "node:fs";
import sourceTable from "./operator-visual-sources.json";
import { voxelArmorLoadout } from "./voxel-crew-outfit";
import {
  VOXEL_CREW_SOCKETS,
  VOXEL_CREW_UPPER_BONES,
} from "@sidereal/content/crew-voxel-bundle";
import {
  operatorMaterialKey,
  prepareOperatorEnsemble,
  verifyOperatorEnsemblePlan,
  currentOperatorEnsemblePlan,
  type OperatorEnsembleLoaders,
  type OperatorEnsembleRequest,
  type OperatorEnsemblePlan,
} from "./operator-ensemble";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene),
    bodyRoot = new TransformNode("body", scene);
  const mesh = MeshBuilder.CreateBox("body-visible", {}, scene);
  mesh.parent = bodyRoot;
  const material = new StandardMaterial("body-material", scene);
  mesh.material = material;
  const requiredBodyNodes = [
    "pelvis",
    ...VOXEL_CREW_UPPER_BONES,
    ...["L", "R"].flatMap((side) =>
      ["thigh", "shin", "foot", "toe"].map((name) => `${name}.${side}`),
    ),
  ];
  const requiredBodyClips = ["idle", "walk", "sit", "sit_idle"];
  const source = { sha256: "a".repeat(64), variant: "fixture", byteLength: 1 };
  const request: OperatorEnsembleRequest = {
    requestedKey: "exact-public-key",
    associationKey: "current-visit",
    bodySource: source,
    appearance: { bodyType: "female", equippedComponents: {} },
    outfitSources: {
      head: new Map(),
      headAtlases: new Map(),
      armor: () => undefined,
    },
    heldItem: null,
    faceAtlas: false,
    requiredBodyNodes,
    requiredBodyClips,
  };
  const crew = {
    root: bodyRoot,
    skeleton: { bones: [{}] },
    joints: new Map(requiredBodyNodes.map((name) => [name, {}])),
    socketNodes: Object.fromEntries(
      VOXEL_CREW_SOCKETS.map((name) => [name, {}]),
    ),
    hasClip: (name: string) => requiredBodyClips.includes(name),
    customize: vi.fn(),
    dispose: vi.fn(() => bodyRoot.dispose()),
  };
  const outfit = {
    apply: vi.fn(),
    whenComplete: vi.fn(async () => undefined),
    armour: {},
    dispose: vi.fn(),
  };
  const held = {
    set: vi.fn(),
    whenComplete: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
  const body = vi.fn(async (_scene: Scene, root: TransformNode) => {
    bodyRoot.parent = root;
    return crew;
  });
  const ports = {
    body,
    outfit: vi.fn(() => outfit),
    held: vi.fn(() => held),
    materials: vi.fn(async () => operatorMaterialKey(scene, [mesh])),
  } as unknown as OperatorEnsembleLoaders;
  // Preparation branches use controlled loaders; actual draw readiness has its own native gate.
  vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(true);
  return {
    scene,
    parent,
    request,
    crew,
    outfit,
    held,
    mesh,
    material,
    ports,
    body,
  };
}

test("verified plan selects armor by the actual body fit, never by its colourway", async () => {
  const f = fixture(),
    bytes = new Uint8Array([1, 2, 3]);
  const source = {
    url: "/assets/test/operator-fit.glb",
    sha256: bytesToHex(sha256(bytes)),
    byteLength: bytes.length,
    variant: "measured-fixture",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => bytes.slice().buffer,
    })),
  );
  const armor = vi.fn((_part: string, body: string) =>
    body === "female" ? { source, requiredJoints: ["chest"] } : undefined,
  );
  const plan: OperatorEnsemblePlan = {
    ...f.request,
    heldSources: undefined,
    bodySource: source,
    appearance: {
      bodyType: "female",
      equippedComponents: { chest: "marine-chest" },
    },
    outfitSources: { head: new Map(), headAtlases: new Map(), armor },
  };
  const verified = await verifyOperatorEnsemblePlan(f.scene, plan);
  expect(armor).toHaveBeenCalledTimes(1);
  expect(armor.mock.calls[0][1]).toBe("female");
  expect(
    verified.outfitSources.armor(armor.mock.calls[0][0], "female"),
  ).toMatchObject({
    source: { sha256: source.sha256 },
    requiredJoints: ["chest"],
  });
  expect(
    verified.outfitSources.armor(armor.mock.calls[0][0], "arctic"),
  ).toBeUndefined();
});

test.each(["male", "female"] as const)(
  "verified %s armor remains available through real ensemble preparation",
  async (bodyType) => {
    const f = fixture(),
      bytes = new Uint8Array([1, 2, 3]);
    const source = {
      url: "/assets/test/operator-stage-fit.glb",
      sha256: bytesToHex(sha256(bytes)),
      byteLength: bytes.length,
      variant: "measured-fixture",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytes.slice().buffer,
      })),
    );
    const appearance = {
      bodyType,
      equippedComponents: { chest: "marine-chest" },
    };
    const part = voxelArmorLoadout(appearance.equippedComponents).chest!.part;
    const plan: OperatorEnsemblePlan = {
      ...f.request,
      appearance,
      heldSources: undefined,
      bodySource: source,
      outfitSources: {
        head: new Map(),
        headAtlases: new Map(),
        armor: (id, variant) =>
          id === part && variant === bodyType
            ? { source, requiredJoints: ["chest"] }
            : undefined,
      },
    };
    const verified = await verifyOperatorEnsemblePlan(f.scene, plan);
    const outfit: OperatorEnsembleLoaders["outfit"] = (
      scene,
      crew,
      options,
    ) => {
      expect(options?.operatorSources?.armor(part, bodyType)).toMatchObject({
        source: { sha256: source.sha256 },
        requiredJoints: ["chest"],
      });
      expect(options?.operatorSources?.armor(part, "arctic")).toBeUndefined();
      return { ...f.outfit, armour: { chest: part } } as unknown as ReturnType<
        OperatorEnsembleLoaders["outfit"]
      >;
    };
    const handle = await prepareOperatorEnsemble(f.scene, f.parent, verified, {
      ...f.ports,
      outfit,
    });
    expect(handle.state).toBe("verified-complete");
    handle.activate();
    handle.dispose();
  },
);

test("all semantic descriptor pins match the exact current runtime resources, with no context activation data", () => {
  expect(Object.keys(sourceTable.sources)).toHaveLength(131);
  for (const [url, pin] of Object.entries(sourceTable.sources)) {
    expect(url.startsWith("/assets/crew/")).toBe(true);
    const bytes = readFileSync(
      new URL(
        "../../../../assets/runtime/" + url.slice("/assets/".length),
        import.meta.url,
      ),
    );
    expect(bytes.length, url).toBe(pin.byteLength);
    expect(bytesToHex(sha256(bytes)), url).toBe(pin.sha256);
    expect(pin.variant).toContain("sidereal.operator-current-v1:");
  }
  expect(JSON.stringify(sourceTable)).not.toMatch(
    /certificateSha256|compilerSha256|manifestSha256|proofSha256|refinement-r005/,
  );
});

test.each(["male", "female"] as const)(
  "current %s plan resolves pinned worn and hand models, exact body fits and legacy face resources",
  (bodyType) => {
    const plan = currentOperatorEnsemblePlan(
      {
        appearance: {
          bodyType,
          equippedComponents: {
            chest: "marine-chest",
            helmet: "marine-helmet",
            visor: "marine-visor",
          },
        },
        heldItem: "rail-rifle",
      },
      "accepted",
      "pinned-key",
    );
    expect(plan.appearance.headArtRevision).toBe("legacy");
    expect(plan.outfitSources.head.size).toBeGreaterThan(0);
    expect(
      [...plan.outfitSources.head.values()].every((source) =>
        source.url.startsWith("/assets/crew/heads/v1/"),
      ),
    ).toBe(true);
    expect(plan.outfitSources.headAtlases.size).toBe(1);
    expect(plan.heldSources?.item("rail-rifle")?.requiredSockets).toContain(
      "support",
    );
    expect(plan.heldSources?.item("pistol")).toBeUndefined();
    const armor = voxelArmorLoadout(plan.appearance.equippedComponents!);
    const part = armor.chest!.part;
    expect(
      plan.outfitSources.armor(part, bodyType)?.requiredJoints.length,
    ).toBeGreaterThan(0);
    expect(
      plan.outfitSources.armor(part, bodyType === "male" ? "female" : "male"),
    ).toBeUndefined();
  },
);

test.each(["head", "visor", "armor", "uniform", "held"])(
  "unknown requested %s never disappears into a bare/default plan",
  (kind) => {
    const slots =
      kind === "head"
        ? { helmet: "unknown-helmet" }
        : kind === "visor"
          ? { visor: "unknown-visor" }
          : kind === "armor"
            ? { chest: "unknown-chest" }
            : kind === "uniform"
              ? { uniform: "unknown-uniform" }
              : {};
    expect(() =>
      currentOperatorEnsemblePlan(
        {
          appearance: { bodyType: "female", equippedComponents: slots },
          heldItem: kind === "held" ? "shield-pack" : null,
        },
        "accepted",
        "pinned-key",
      ),
    ).toThrow();
  },
);

test("a complete independent stage stays disabled until the actual activation transaction", async () => {
  const f = fixture();
  const handle = await prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    f.ports,
  );
  expect(handle.state).toBe("verified-complete");
  expect(handle.root.isEnabled()).toBe(false);
  expect(f.held.set).toHaveBeenCalledWith(null);
  handle.activate();
  expect(handle.root.isEnabled()).toBe(true);
  handle.dispose();
  handle.dispose();
  expect(f.held.dispose).toHaveBeenCalledTimes(1);
  expect(f.outfit.dispose).toHaveBeenCalledTimes(1);
  expect(f.crew.dispose).toHaveBeenCalledTimes(1);
});

test.each(["body-node", "body-clip", "socket", "outfit", "held", "indexed"])(
  "missing %s never certifies a complete ensemble",
  async (kind) => {
    const f = fixture();
    if (kind === "body-node") f.crew.joints.delete("chest");
    if (kind === "body-clip") f.crew.hasClip = () => false;
    if (kind === "socket")
      delete (f.crew.socketNodes as Record<string, unknown>)["socket.hand.R"];
    if (kind === "outfit")
      f.outfit.whenComplete.mockRejectedValue(
        new Error("private asset failure"),
      );
    if (kind === "held")
      f.held.whenComplete.mockRejectedValue(
        new Error("private socket failure"),
      );
    if (kind === "indexed")
      vi.spyOn(f.mesh, "getIndices").mockReturnValue(null);
    await expect(
      prepareOperatorEnsemble(f.scene, f.parent, f.request, f.ports),
    ).rejects.toThrow(/Operator/);
    expect(f.crew.dispose).toHaveBeenCalledTimes(1);
    expect(
      f.scene.transformNodes.some(
        (node) => node.name === "operator-ensemble-stage",
      ),
    ).toBe(false);
  },
);

test("empty requirement arrays cannot turn a body/socket/clip check into automatic success", async () => {
  const f = fixture();
  f.request.requiredBodyNodes = [];
  f.request.requiredBodyClips = [];
  await expect(
    prepareOperatorEnsemble(f.scene, f.parent, f.request, f.ports),
  ).rejects.toThrow("requested ensemble");
  expect(f.body).not.toHaveBeenCalled();
});

test("activation checks current actual effects and rolls back disabled if shader readiness changed", async () => {
  const f = fixture();
  const handle = await prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    f.ports,
  );
  vi.mocked(f.material.isReadyForSubMesh).mockReturnValue(false);
  expect(() => handle.activate()).toThrow("actual draw");
  expect(handle.root.isEnabled()).toBe(false);
  handle.dispose();
});

test("an empty visible draw cannot claim activation because all requested meshes happened to be hidden", async () => {
  const f = fixture();
  const handle = await prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    f.ports,
  );
  f.mesh.isVisible = false;
  expect(() => handle.activate()).toThrow("actual draw");
  expect(handle.root.isEnabled()).toBe(false);
  handle.dispose();
});

test("light inclusion, layers and receiver changes invalidate preparation without reducing lights", async () => {
  const f = fixture();
  const light = new PointLight("operator-light", Vector3.Zero(), f.scene);
  const handle = await prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    f.ports,
  );
  light.excludedMeshes.push(f.mesh);
  light.includeOnlyWithLayerMask = 2;
  f.mesh.receiveShadows = true;
  expect(() => handle.activate()).toThrow("configuration changed");
  expect(handle.root.isEnabled()).toBe(false);
  await handle.prepareActivation();
  expect(f.ports.materials).toHaveBeenCalledTimes(2);
  expect(light.isEnabled()).toBe(true);
  expect(f.mesh.receiveShadows).toBe(true);
  handle.dispose();
});

test("the scene's intended mesh flags are configured while disabled before shader preparation", async () => {
  const f = fixture();
  const configure = vi.fn((meshes: readonly AbstractMesh[]) => {
    expect(f.crew.root.isEnabled()).toBe(false);
    for (const mesh of meshes) mesh.receiveShadows = true;
  });
  const prepare = vi.fn(async () => {
    expect(f.mesh.receiveShadows).toBe(true);
    return operatorMaterialKey(f.scene, [f.mesh]);
  });
  const handle = await prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    { ...f.ports, materials: prepare },
    configure,
  );
  expect(configure).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledTimes(1);
  handle.activate();
  handle.dispose();
});

test("a later edit cannot mutate the values of an already requested staged ensemble", async () => {
  const f = fixture();
  let release!: (value: typeof f.crew) => void;
  f.body.mockImplementationOnce(async (_scene, root) => {
    f.crew.root.parent = root;
    return await new Promise<typeof f.crew>((resolve) => (release = resolve));
  });
  const pending = prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    f.ports,
  );
  f.request.appearance.bodyType = "male";
  f.request.appearance.equippedComponents = { chest: "wardrobe-heavy-chest" };
  f.request.requiredBodyNodes = [];
  f.request.requiredBodyClips = [];
  f.request.heldItem = "pistol";
  release(f.crew);
  const handle = await pending;
  expect(f.crew.customize).toHaveBeenCalledWith({
    bodyType: "female",
    equippedComponents: {},
  });
  expect(f.held.set).toHaveBeenCalledWith(null);
  handle.dispose();
});

test("one owned controller disposal failure cannot leak the other ensemble handles", async () => {
  const f = fixture();
  const handle = await prepareOperatorEnsemble(
    f.scene,
    f.parent,
    f.request,
    f.ports,
  );
  f.held.dispose.mockImplementationOnce(() => {
    throw new Error("dispose failed");
  });
  expect(() => handle.dispose()).toThrow("dispose failed");
  expect(f.outfit.dispose).toHaveBeenCalledTimes(1);
  expect(f.crew.dispose).toHaveBeenCalledTimes(1);
  expect(handle.root.isDisposed()).toBe(true);
  handle.dispose();
  expect(f.held.dispose).toHaveBeenCalledTimes(1);
});
