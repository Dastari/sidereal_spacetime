import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { constructionHash } from "@sidereal/sim/construction-transactions";
vi.mock("./hull-decals", () => ({ updateHullDecals: () => [] }));
import {
  createRemoteShips,
  deriveStockWayfarerExterior,
  validateStockExteriorManifest,
  loadRemoteShipPrototype,
  STOCK_EXTERIOR_BASE_MESHES,
  REMOTE_EXTERIOR_BASE_MESHES,
  type RemoteShipStore,
  type RemoteShipPrototype,
} from "./remote-ships";
const read = (file: string) => readFileSync(file, "utf8");
const manifest = () =>
  deriveStockWayfarerExterior(
    read("assets/runtime/assembly/wayfarer.json"),
    read("assets/runtime/assembly/hull-manifest.json"),
  );
function glb(bytes: Uint8Array): {
  nodes?: { name?: string; mesh?: number }[];
  meshes?: { name?: string }[];
  materials?: Record<string, unknown>[];
} {
  const length = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}
const pathFor = (url: string) =>
  "assets/runtime/" + url.slice("/assets/".length);
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  let snapshot = {
    epoch: 0,
    shipMotion: [{ shipId: "own" }, { shipId: "remote" }],
    shipDescription: [
      { shipId: "own", publishedExteriorAssetId: "approved" },
      { shipId: "remote", publishedExteriorAssetId: "approved" },
    ],
  };
  const listeners = new Set<() => void>();
  let local = "own";
  const store: RemoteShipStore = {
    getSnapshot: () => snapshot,
    subscribeTable(_table, fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    sampleShip: () => ({ x: 1e9 - 1, y: 1e9 - 2, heading: 0.4 }),
  };
  const prototype: RemoteShipPrototype = {
    instantiate: (id) => new TransformNode("remote-ship-" + id, scene),
    dispose: vi.fn(),
  };
  return {
    engine,
    scene,
    store,
    prototype,
    listeners,
    get snapshot() {
      return snapshot;
    },
    set snapshot(value) {
      snapshot = value;
    },
    emit() {
      for (const fn of [...listeners]) fn();
    },
    options: {
      assetId: "approved",
      localShipId: () => local,
      loadPrototype: async () => prototype,
    },
    setLocal(value: string) {
      local = value;
    },
  };
}
describe("pinned stock exterior derivation", () => {
  it("derives the exact compact package identity and excludes private/interior placement classes", () => {
    const m = manifest();
    expect(m.assetId).toBe(
      "stock-wayfarer-exterior:6cd837094b61bb6d1e69aefe4629cd9fa7e0f51db02fee80d203a824af756589",
    );
    expect(m.payload.placements).toHaveLength(108);
    expect(new Set(m.payload.placements.map((p) => p.id)).size).toBe(108);
    expect(
      m.payload.placements.some((p) => p.id === "pilot-r004-canopy-nose-16"),
    ).toBe(true);
    expect(
      m.payload.placements.some(
        (p) => p.id === "pilot-r005-outer-bow-bumper-center",
      ),
    ).toBe(true);
    expect(m.payload.placements.some((p) => p.id === "roof-0-0")).toBe(true);
    expect(
      m.payload.placements.every(
        (p) =>
          !/(rear-partition|airlock-frame|cargo|floor|room-storage|equipment)/.test(
            p.id,
          ),
      ),
    ).toBe(true);
    expect(STOCK_EXTERIOR_BASE_MESHES).not.toContain("GEO-partitions");
    expect(STOCK_EXTERIOR_BASE_MESHES).not.toContain("GEO-deck");
    expect(JSON.stringify(m)).not.toContain("original_default");
    expect(JSON.stringify(m)).not.toContain("fittingProxy");
    expect(JSON.stringify(m)).not.toContain("lights");
    expect(m.payload.placements.flatMap((p) => p.decals ?? [])).toHaveLength(5);
  });
  it("rejects changed source snapshots and tampered compact manifests", () => {
    expect(() =>
      deriveStockWayfarerExterior(
        read("assets/runtime/assembly/wayfarer.json") + " ",
        read("assets/runtime/assembly/hull-manifest.json"),
      ),
    ).toThrow(/revision/);
    const m = manifest();
    validateStockExteriorManifest(m, m.assetId);
    expect(() => validateStockExteriorManifest(m, "unknown")).toThrow(
      /identity/,
    );
    const altered = structuredClone(m);
    altered.payload.placements[0].position[0]++;
    expect(() => validateStockExteriorManifest(altered, m.assetId)).toThrow(
      /hash/,
    );
  });
  it("verifies every actual GLB hash and existing native selector without substituting geometry", () => {
    const m = manifest(),
      pins = new Map([[m.payload.base.url, m.payload.base.sha256]]);
    for (const p of m.payload.placements) pins.set(p.url, p.sha256);
    expect(pins.size).toBe(14);
    const documents = new Map<string, ReturnType<typeof glb>>();
    for (const [url, hash] of pins) {
      const bytes = readFileSync(pathFor(url));
      expect(constructionHash(bytes)).toBe(hash);
      documents.set(url, glb(bytes));
    }
    const base = documents.get(m.payload.base.url)!;
    for (const name of STOCK_EXTERIOR_BASE_MESHES)
      expect(base.nodes!.some((n) => n.name === name)).toBe(true);
    for (const p of m.payload.placements)
      if (p.nodePrefix)
        expect(
          documents
            .get(p.url)!
            .nodes!.some(
              (n) =>
                n.name === p.nodePrefix ||
                n.name?.startsWith(p.nodePrefix + "_") ||
                n.name?.startsWith(p.nodePrefix + "."),
            ),
        ).toBe(true);
    const materials = [...documents.values()].flatMap((d) => d.materials ?? []);
    expect(materials.some((m) => "normalTexture" in m)).toBe(true);
    expect(materials.some((m) => "emissiveFactor" in m)).toBe(true);
  });
});
describe("remote ship lifecycle", () => {
  it("creates one independent root per supported remote ID and subtracts camera origin before GPU transforms", async () => {
    const f = fixture(),
      r = createRemoteShips(f.scene, f.store, f.options);
    await r.ready;
    expect(r.getRootIds()).toEqual(["remote"]);
    expect(
      f.scene.getTransformNodeByName("remote-ship-remote")!.isEnabled(),
    ).toBe(false);
    f.emit();
    f.emit();
    expect(r.getRootIds()).toEqual(["remote"]);
    r.update({ x: 1e9 - 10, y: 1e9 - 20 }, 1000);
    const root = f.scene.getTransformNodeByName("remote-ship-remote")!;
    expect(root.position.asArray()).toEqual([9, 0, -18]);
    expect(root.rotation.y).toBe(0.4);
    f.setLocal("remote");
    r.update({ x: 0, y: 0 }, 1001);
    expect(r.getRootIds()).toEqual(["own"]);
    expect(root.isDisposed()).toBe(true);
    r.dispose();
    f.scene.dispose();
    f.engine.dispose();
  });
  it("removes roots immediately on contact/descriptor deletion and creates fresh roots on reconnect epoch", async () => {
    const f = fixture(),
      r = createRemoteShips(f.scene, f.store, f.options);
    await r.ready;
    const old = f.scene.getTransformNodeByName("remote-ship-remote")!;
    f.snapshot = { ...f.snapshot, epoch: 1 };
    f.emit();
    expect(old.isDisposed()).toBe(true);
    expect(f.scene.getTransformNodeByName("remote-ship-remote")).not.toBe(old);
    f.snapshot = { ...f.snapshot, shipMotion: [{ shipId: "own" }] };
    f.emit();
    expect(r.getRootIds()).toEqual([]);
    r.dispose();
    f.scene.dispose();
    f.engine.dispose();
  });
  it("late loading cannot recreate a deleted contact or disposed scene", async () => {
    const f = fixture();
    let finish!: (p: RemoteShipPrototype) => void;
    const r = createRemoteShips(f.scene, f.store, {
      ...f.options,
      loadPrototype: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    f.snapshot = { ...f.snapshot, shipDescription: [] };
    f.emit();
    finish(f.prototype);
    await r.ready;
    expect(r.getRootIds()).toEqual([]);
    r.dispose();
    expect(f.prototype.dispose).toHaveBeenCalledTimes(1);
    expect(f.listeners.size).toBe(0);
    f.scene.dispose();
    f.engine.dispose();
    const g = fixture();
    let later!: (p: RemoteShipPrototype) => void;
    const pending = createRemoteShips(g.scene, g.store, {
      ...g.options,
      loadPrototype: () =>
        new Promise((resolve) => {
          later = resolve;
        }),
    });
    g.scene.dispose();
    later(g.prototype);
    await pending.ready;
    expect(pending.getRootIds()).toEqual([]);
    expect(g.prototype.dispose).toHaveBeenCalledTimes(1);
    expect(g.listeners.size).toBe(0);
    g.engine.dispose();
  });
  it("loads each pinned source once and shares material/geometry without remote lights or crew", async () => {
    const f = fixture(),
      m = manifest();
    const byHash = new Map<string, ReturnType<typeof glb>>();
    for (const p of [
      { url: m.payload.base.url, sha256: m.payload.base.sha256 },
      ...m.payload.placements,
    ])
      if (!byHash.has(p.sha256))
        byHash.set(p.sha256, glb(readFileSync(pathFor(p.url))));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const bytes = readFileSync(pathFor(String(input)));
        return {
          ok: true,
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
        } as Response;
      });
    const importMock = vi
      .spyOn(SceneLoader, "ImportMeshAsync")
      .mockImplementation(async (_selector, _root, data) => {
        const parsed = byHash.get(constructionHash(data as Uint8Array))!;
        const material = new PBRMaterial("Blue laminated glazing", f.scene);
        material.roughness = 0.24;
        const meshes = (parsed.nodes ?? [])
          .filter((n) => n.mesh !== undefined)
          .map((n) => {
            const mesh = CreateBox(n.name!, {}, f.scene);
            mesh.material = material;
            return mesh;
          });
        return {
          meshes,
          transformNodes: [],
          lights: [
            new PointLight(
              "unexpected imported cabin light",
              Vector3.Zero(),
              f.scene,
            ),
          ],
        } as unknown as Awaited<ReturnType<typeof SceneLoader.ImportMeshAsync>>;
      });
    try {
      const p = await loadRemoteShipPrototype(f.scene, m, m.assetId);
      expect(importMock).toHaveBeenCalledTimes(14);
      expect(importMock.mock.calls[0][0]).toEqual([
        ...REMOTE_EXTERIOR_BASE_MESHES,
        "GEO-walls",
        "GEO-cutaway-aft",
      ]);
      expect(REMOTE_EXTERIOR_BASE_MESHES).not.toContain("GEO-walls");
      expect(
        REMOTE_EXTERIOR_BASE_MESHES.some((n) => n.startsWith("GEO-cutaway-")),
      ).toBe(false);
      expect(p.metrics!.outputPrimitives).toBeLessThan(
        p.metrics!.inputPrimitives,
      );

      const a = p.instantiate("a"),
        b = p.instantiate("b");
      const am = a.getChildMeshes()[0],
        bm = b.getChildMeshes()[0];
      expect(am).not.toBe(bm);
      expect(am.material).toBe(bm.material);
      expect((am.material as PBRMaterial).roughness).toBe(0.24);
      expect(f.scene.lights).toHaveLength(0);
      expect(
        a
          .getChildMeshes()
          .every(
            (mesh) =>
              !mesh.isPickable &&
              !/GEO-partitions|GEO-deck|storage-container/.test(mesh.name),
          ),
      ).toBe(true);
      expect(
        a
          .getChildMeshes()
          .flatMap((m) => m.metadata.sourcePlacementIds ?? [])
          .some((id: string) =>
            /GEO-walls|GEO-cutaway-|GEO-partitions|GEO-deck/.test(id),
          ),
      ).toBe(false);
      a.dispose();
      expect(
        b.getChildMeshes().every((m) => !m.isDisposed() && m.material),
      ).toBe(true);
      b.dispose();
      p.dispose();
      expect(
        f.scene.materials.filter((m) =>
          m.name.includes("Blue laminated glazing"),
        ),
      ).toHaveLength(0);
    } finally {
      fetchMock.mockRestore();
      importMock.mockRestore();
      f.scene.dispose();
      f.engine.dispose();
    }
  });
});
