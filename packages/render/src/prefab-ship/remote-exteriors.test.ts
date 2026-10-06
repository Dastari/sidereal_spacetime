import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { prefabById } from "@sidereal/content/prefabs";
import { createLegacyPrefabShipView as createPrefabShipView } from "./ship-view";
import { prefabNozzleLayout } from "./exhaust";
import {
  createRemoteShipExteriors,
  loadRemoteExteriorPrototype,
  resolvePublishedExterior,
  type RemoteShipSnapshot,
} from "./remote-exteriors";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";

// This suite qualifies the retained historical batching/proxy path; native template
// admission and lifecycle are covered separately by authored-template-view.test.ts.
vi.mock("./ship-view", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ship-view")>();
  return { ...actual, createPrefabShipView: actual.createLegacyPrefabShipView };
});

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function headless() {
  // No GLBs in unit tests: kit pieces warn, components draw procedural stand-ins.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
  return scene;
}

/** Minimal accepted store: rows plus a fixed pose per ship. */
function fakeStore(
  ships: { id: string; x: number; y: number; exterior?: string }[],
) {
  const listeners = new Set<() => void>();
  let snapshot: RemoteShipSnapshot;
  const set = (rows: typeof ships) => {
    snapshot = {
      epoch: 1,
      shipMotion: rows.map((s) => ({ shipId: s.id })),
      shipDescription: rows.map((s) => ({
        shipId: s.id,
        publishedExteriorAssetId: s.exterior ?? "prefab:fed.s.wren",
        appearanceRevision: BigInt(prefabById("fed.s.wren")!.revision),
      })),
    };
    for (const l of [...listeners]) l();
  };
  let poses = new Map(ships.map((s) => [s.id, s]));
  set(ships);
  return {
    getSnapshot: () => snapshot,
    subscribeTable: (_t: string, l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    sampleShip: (id: string) => {
      const p = poses.get(id);
      return p ? { x: p.x, y: p.y, heading: 0.5 } : undefined;
    },
    replace(rows: typeof ships) {
      poses = new Map(rows.map((s) => [s.id, s]));
      set(rows);
    },
  };
}

describe("remote prefab exteriors (other ships never render interiors)", () => {
  it("shows a safe proxy after native access failure and retries after backoff", async () => {
    const scene = headless();
    const doc = prefabById("fed.s.wren-fleet")!;
    const store = {
      getSnapshot: () => ({
        epoch: 1,
        shipMotion: [{ shipId: "fleet" }],
        shipDescription: [
          {
            shipId: "fleet",
            publishedExteriorAssetId: `prefab:${doc.id}`,
            appearanceRevision: 1n,
          },
        ],
      }),
      subscribeTable: () => () => {},
      sampleShip: () => ({ x: 0, y: 0, heading: 0 }),
    };
    let now = 10_000,
      available = false;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const resolver = vi.fn(async (piece: { file: string }) => {
      if (!available) throw Error("temporary byte fetch failure");
      return new Uint8Array(
        readFileSync(
          new URL(
            `../../../../assets/runtime/wayfarer-access/r002/${piece.file}`,
            import.meta.url,
          ),
        ),
      );
    });
    const error = vi.fn();
    const remote = createRemoteShipExteriors(scene, store, {
      localShipId: () => undefined,
      accessResolver: resolver,
      onError: error,
      load: (s, r) =>
        loadRemoteExteriorPrototype(s, r, {
          standinComponents: true,
          accessResolver: resolver,
        }),
    });
    await remote.settled();
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    const camera = new FreeCamera("camera", new Vector3(0, 20, 0), scene);
    remote.update({ x: 0, y: 0 }, 0, camera, 1000);
    expect(remote.diagnostics().ships[0]).toMatchObject({
      accessPending: false,
      accessUnavailable: true,
    });
    expect(
      scene.getTransformNodeByName("remote-ship-fleet:full")!.isEnabled(),
    ).toBe(false);
    expect(
      scene.getTransformNodeByName("remote-ship-fleet:proxy")!.isEnabled(),
    ).toBe(true);
    const attempts = resolver.mock.calls.length;
    now += 999;
    remote.update({ x: 0, y: 0 }, 16, camera, 1000);
    expect(resolver).toHaveBeenCalledTimes(attempts);
    available = true;
    now++;
    remote.update({ x: 0, y: 0 }, 32, camera, 1000);
    await vi.waitFor(() =>
      expect(remote.diagnostics().ships[0]).toMatchObject({
        accessPending: false,
        accessUnavailable: false,
      }),
    );
    expect(resolver.mock.calls.length).toBeGreaterThan(attempts);
    remote.update({ x: 0, y: 0 }, 48, camera, 1000);
    expect(
      scene.getTransformNodeByName("remote-ship-fleet:full")!.isEnabled(),
    ).toBe(true);
    remote.dispose();
  });
  it("resolves a published prefab exterior to the bundled developer prefab only", () => {
    const wren = prefabById("fed.s.wren")!;
    expect(
      resolvePublishedExterior("prefab:fed.s.wren", BigInt(wren.revision)),
    ).toMatchObject({
      key: `prefab:fed.s.wren@r${wren.revision}`,
      exact: true,
    });
    // A legacy live pin draws the current bundled revision, flagged inexact.
    expect(resolvePublishedExterior("prefab:fed.s.wren", 1n)?.exact).toBe(
      false,
    );
    expect(resolvePublishedExterior("unpublished", 0n)).toBeUndefined();
    expect(resolvePublishedExterior("prefab:no.such.ship", 1n)).toBeUndefined();
    expect(
      resolvePublishedExterior("prefab:fed.s.wren-fleet", 2n),
    ).toBeUndefined();
    expect(resolvePublishedExterior("prefab:fed.s.wren-fleet", 1n)?.exact).toBe(
      true,
    );
  });

  it("builds the exterior prototype with no deck geometry, furniture, lights or labels", async () => {
    const scene = headless();
    const wren = prefabById("fed.s.wren")!;
    const deck = await createPrefabShipView(scene, wren, {
      catalog: defaultPrefabComponentCatalog(),
      view: "deck",
      standinComponents: true,
    });
    const deckTriangles = deck.metrics().triangles;
    const lightsBefore = scene.lights.length;
    deck.dispose();
    const lightsAfterDeck = scene.lights.length;
    const prototype = await loadRemoteExteriorPrototype(
      scene,
      resolvePublishedExterior("prefab:fed.s.wren", BigInt(wren.revision))!,
      { standinComponents: true },
    );
    expect(lightsBefore).toBeGreaterThan(0); // the deck view has room lights
    expect(scene.lights.filter((l) => l instanceof PointLight)).toHaveLength(
      lightsAfterDeck,
    );
    const names = prototype.sources.map((m) => m.name);
    expect(names.length).toBeGreaterThan(0);
    for (const forbidden of [
      ":batch:deck",
      "object-fill",
      "object-frame",
      "light-pools",
      "contact-shadows",
      ":label:",
      ":plumes:",
    ])
      expect(
        names.some((n) => n.includes(forbidden)),
        forbidden,
      ).toBe(false);
    // Exterior hull and proxy both exist; the proxy is far cheaper than the exterior.
    expect(prototype.metrics.exteriorTriangles).toBeGreaterThan(0);
    expect(prototype.metrics.exteriorTriangles).toBeLessThan(deckTriangles);
    expect(prototype.metrics.proxyTriangles).toBeGreaterThan(0);
    expect(prototype.metrics.proxyTriangles).toBeLessThan(
      prototype.metrics.exteriorTriangles / 4,
    );
    expect(prototype.radius).toBeGreaterThan(3);
    expect(prototype.radius).toBeLessThan(20);
    prototype.dispose();
  });

  it("represents every perceived ship, shares one prototype per hull and picks LOD by size", async () => {
    const scene = headless();
    const camera = new FreeCamera("camera", new Vector3(0, 60, 0), scene);
    camera.fov = 0.8;
    const store = fakeStore([
      { id: "local", x: 0, y: 0 },
      { id: "near", x: 20, y: 0 },
      { id: "far", x: 380, y: 0 },
      { id: "odd", x: 40, y: 0, exterior: "unpublished" },
    ]);
    const remote = createRemoteShipExteriors(scene, store, {
      localShipId: () => "local",
      load: (s, r) =>
        loadRemoteExteriorPrototype(s, r, { standinComponents: true }),
    });
    await remote.settled();
    remote.update({ x: 0, y: 0 }, 0, camera, 1000);
    const d = remote.diagnostics();
    // The own ship is never drawn as a remote exterior; every other perceived ship is.
    expect(d.ships.map((s) => s.shipId)).toEqual(["far", "near", "odd"]);
    expect(d.prototypes).toHaveLength(1);
    const tier = (id: string) => d.ships.find((s) => s.shipId === id)!.tier;
    expect(tier("near")).toBe("exterior");
    expect(tier("far")).not.toBe("exterior");
    expect(tier("odd")).toBe("marker");
    // Instances of the same hull share the prototype's GPU geometry.
    const instances = scene.meshes.filter(
      (m): m is InstancedMesh =>
        m instanceof InstancedMesh && m.name.startsWith("remote-ship-near--"),
    );
    expect(instances.length).toBeGreaterThan(0);
    const sources = new Set(remote.sourceMeshes());
    expect(instances.every((m) => sources.has(m.sourceMesh))).toBe(true);
    // Poses follow the store relative to the camera origin; nothing is written back.
    const near = scene.getTransformNodeByName("remote-ship-near")!;
    expect(near.position.x).toBeCloseTo(20);
    expect(near.rotation.y).toBeCloseTo(0.5);
    // Legacy Wren gets its own outer leaves without any interior leaf geometry.
    const outerDoors = near
      .getChildMeshes()
      .filter(
        (m): m is Mesh =>
          m instanceof Mesh && m.name.startsWith("prefab-doors:"),
      );
    expect(outerDoors.length).toBeGreaterThan(0);
    const matrices = () =>
      outerDoors.map((m) =>
        m.thinInstanceGetWorldMatrices().flatMap((matrix) => [...matrix.m]),
      );
    const closed = matrices();
    remote.update(
      { x: 0, y: 0 },
      1016,
      camera,
      1000,
      undefined,
      100,
      new Map([
        ["near", { doors: new Map([["airlock", true]]), panels: new Map() }],
      ]),
    );
    expect(matrices()).not.toEqual(closed);
    remote.update({ x: 0, y: 0 }, 2016, camera, 1000);
    expect(matrices()).toEqual(closed);
    // Remote plumes: the server's coarse throttle per blueprint mount lights that jet only.
    const wren = prefabById("fed.s.wren")!;
    const jet = prefabNozzleLayout(wren, defaultPrefabComponentCatalog())[0];
    expect(jet).toBeDefined();
    remote.update(
      { x: 0, y: 0 },
      16,
      camera,
      1000,
      new Map([
        ["near", new Map([[jet.id, 1]])],
        ["odd", new Map([[jet.id, 1]])],
      ]),
    );
    const lit = (id: string) =>
      remote.diagnostics().ships.find((s) => s.shipId === id)!.litJets;
    expect(lit("near")).toBe(1);
    expect(lit("far")).toBe(0);
    expect(lit("odd")).toBe(0); // unpublished hull: marker only, no guessed nozzles
    remote.update({ x: 0, y: 0 }, 32, camera, 1000, new Map());
    expect(lit("near")).toBe(0);
    // A row leaving the view removes the ship at once.
    store.replace([
      { id: "local", x: 0, y: 0 },
      { id: "near", x: 20, y: 0 },
    ]);
    expect(remote.diagnostics().ships.map((s) => s.shipId)).toEqual(["near"]);
    expect(scene.getTransformNodeByName("remote-ship-far")).toBeNull();
    remote.dispose();
  });

  it("draws 100 ships: none dropped, full detail within the budget", async () => {
    const scene = headless();
    const camera = new FreeCamera("camera", new Vector3(0, 40, 0), scene);
    const rows = [{ id: "local", x: 0, y: 0 }];
    for (let i = 0; i < 100; i++)
      rows.push({
        id: `s${i}`,
        x: (i % 10) * 25 - 120,
        y: Math.floor(i / 10) * 25 - 120,
      });
    const remote = createRemoteShipExteriors(scene, fakeStore(rows), {
      localShipId: () => "local",
      fullDetailBudget: 8,
      load: (s, r) =>
        loadRemoteExteriorPrototype(s, r, { standinComponents: true }),
    });
    await remote.settled();
    remote.update({ x: 0, y: 0 }, 0, camera, 1000);
    const ships = remote.diagnostics().ships;
    expect(ships).toHaveLength(100);
    expect(ships.every((s) => s.enabled)).toBe(true);
    expect(
      ships.filter((s) => s.tier === "exterior").length,
    ).toBeLessThanOrEqual(8);
    remote.dispose();
  });
});
