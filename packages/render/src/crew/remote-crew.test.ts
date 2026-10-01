import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { createVoxelCrewVisual } from "./voxel-crew";
import { sharedCrewContainer } from "./crew-asset-cache";
import { createRemoteCrew, type RemoteCrewState } from "./remote-crew";
import {
  createOperatorReadiness,
  type OperatorInteriorRow,
  type OperatorActivatedCapability,
} from "./operator-readiness";
import type {
  OperatorEnsembleRequest,
  PreparedOperatorEnsemble,
} from "./operator-ensemble";

// The shared cache is keyed by URL; a data URL stands in for the served GLB.
const bodyUrl =
  "data:model/gltf-binary;base64," +
  readFileSync(
    new URL(
      "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
      import.meta.url,
    ),
  ).toString("base64");

const scenes: { engine: NullEngine; scene: Scene }[] = [];
const scene = () => {
  const engine = new NullEngine();
  const s = new Scene(engine);
  s.useRightHandedSystem = true;
  scenes.push({ engine, scene: s });
  return s;
};
afterEach(() => {
  for (const { engine, scene } of scenes.splice(0)) {
    scene.dispose();
    engine.dispose();
  }
  vi.restoreAllMocks();
});

const geometryOf = (meshes: readonly { name: string }[], name: string) =>
  (meshes.find((m) => m.name === name) as Mesh | undefined)?.geometry;

describe("shared crew body", () => {
  it("clones every body from one parsed GLB: shared geometry, own materials and skeleton", async () => {
    const s = scene();
    const parent = new TransformNode("ship", s);
    const [a, b] = await Promise.all([
      createVoxelCrewVisual(s, parent, bodyUrl, {
        shared: true,
        faceAtlas: false,
      }),
      createVoxelCrewVisual(s, parent, bodyUrl, {
        shared: true,
        faceAtlas: false,
      }),
    ]);
    const source = await sharedCrewContainer(s, bodyUrl);
    const aMeshes = a.root.getChildMeshes(),
      bMeshes = b.root.getChildMeshes();
    const skinned = aMeshes.find(
      (m) => m.name.startsWith("GEO-crew-base") && m.getTotalVertices() > 0,
    )!;
    expect(skinned).toBeDefined();
    const shared = geometryOf(bMeshes, skinned.name);
    expect(shared).toBeDefined();
    expect(geometryOf(aMeshes, skinned.name)).toBe(shared);
    // The source itself is never drawn.
    expect(s.meshes).not.toContain(source.meshes[0]);
    // Appearance tints one body only.
    expect(skinned.material).not.toBe(
      bMeshes.find((m) => m.name === skinned.name)!.material,
    );
    a.customize({ bodyType: "female", skin: "#ff0000" } as never);
    const suitA = (skinned.material as PBRMaterial).albedoColor.clone();
    const suitB = (
      bMeshes.find((m) => m.name === skinned.name)!.material as PBRMaterial
    ).albedoColor;
    expect(suitA.equals(suitB)).toBe(false);
    expect(a.skeleton).not.toBe(b.skeleton);
    // Removing one body leaves the other and the shared source intact.
    a.dispose();
    expect(shared!.isDisposed?.() ?? false).toBe(false);
    expect(geometryOf(b.root.getChildMeshes(), skinned.name)).toBe(shared);
    expect(source.meshes.every((m) => !m.isDisposed())).toBe(true);
    b.update({ moving: true, seated: false });
    expect(b.layers).toMatchObject({ full: "walk" });
  });
});

describe("held one-shot clips", () => {
  it.each([4, 60])(
    "lies down and holds the death pose when clips run %ix faster than frames",
    async (scale) => {
      const s = scene();
      new FreeCamera("camera", new Vector3(0, 2, -5), s);
      const engine = s.getEngine() as unknown as { getDeltaTime: () => number };
      engine.getDeltaTime = () => 17;
      const crew = await createVoxelCrewVisual(
        s,
        new TransformNode("ship", s),
        bodyUrl,
        { shared: true, faceAtlas: false },
      );
      const head = () => crew.joints.get("head")!.getAbsolutePosition().y;
      const frame = async (dead: boolean) => {
        await new Promise((r) => setTimeout(r, 17));
        crew.update({ moving: false, seated: false, dead });
        s.render();
      };
      for (let i = 0; i < 3; i++) await frame(false);
      expect(head()).toBeGreaterThan(1);
      // Wall-clock clips on a slow client: at scale 60 one frame is about a second of animation and
      // the 1.7 s death clip ends within two frames; the fade-in must not lag behind it.
      s.animationTimeScale = scale;
      for (let i = 0; i < 40; i++) await frame(true);
      expect(head()).toBeLessThan(0.4);
    },
  );
});

const mate = (over: Partial<RemoteCrewState> = {}): RemoteCrewState => ({
  id: "mate",
  name: "Mate",
  localX: 2,
  localY: 0,
  elevation: 0.1875,
  connected: true,
  sprinting: false,
  seated: false,
  dead: false,
  aimActive: false,
  aimAngle: 0,
  shotSequence: 0n,
  appearance: {},
  heldItem: null,
  ...over,
});

function operatorRow() {
  const capability: OperatorActivatedCapability = {
    profileId: "test-profile",
    certificateSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
    manifestSha256: "c".repeat(64),
    compilerSha256: "d".repeat(64),
    geometrySha256: "e".repeat(64),
    navigationSha256: "f".repeat(64),
    mountSourceId: "helm",
  };
  const row: OperatorInteriorRow = {
    characterId: mate().id,
    shipId: "ship",
    deckId: "deck",
    visitId: "visit",
    locationRevision: "10",
    localX: 0,
    localY: 3.5,
    standingElevationM: 0.1875,
    connected: true,
    dead: false,
    operatorPoseState: "occupied",
  };
  const packet = {
    ...capability,
    version: 1,
    status: "supported",
    characterId: row.characterId,
    instanceId: row.shipId,
    deckId: row.deckId,
    visitId: row.visitId,
    locationRevision: row.locationRevision,
    instanceRevision: "1",
    bindingRevision: "1",
    mappingRevision: "1",
    seatRevision: "1",
    pose: "occupied",
    dead: false,
    connected: true,
    acceptedX: row.localX,
    acceptedY: row.localY,
    standingElevationM: row.standingElevationM,
    stationId: "station",
    seatPlacedObjectId: "seat",
    consolePlacedObjectId: "console",
    appearance: {},
    visuals: [],
  };
  row.operatorSnapshot = JSON.stringify(packet);
  return { row, capability };
}

it("absent activated capability performs exactly the legacy marker path without plan or preparation calls", () => {
  const s = scene(),
    parent = new TransformNode("ship", s),
    changed = vi.fn(),
    resolve = vi.fn(),
    prepare = vi.fn();
  const legacy = createRemoteCrew(s, parent, { fullBodies: 0 }),
    guarded = createRemoteCrew(s, parent, {
      fullBodies: 0,
      operator: {
        readiness: createOperatorReadiness(changed),
        capability: () => null,
        resolve,
        prepare,
      },
    });
  const { row } = operatorRow();
  legacy.sync([mate()]);
  guarded.sync([mate()], undefined, [row]);
  legacy.frame(true);
  guarded.frame(true);
  expect(guarded.diagnostics()).toEqual(legacy.diagnostics());
  expect(resolve).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  legacy.dispose();
  guarded.dispose();
});

it("operator marker survives first preparation; coherent stationary ownership survives LOD, recovery and stale walking rows", async () => {
  const s = scene(),
    parent = new TransformNode("ship", s),
    { row, capability } = operatorRow();
  const body = await createVoxelCrewVisual(s, parent, bodyUrl, {
    shared: true,
    faceAtlas: false,
  });
  body.root.setEnabled(false);
  const held = { dispose: vi.fn(), set: vi.fn(), itemId: null, phase: "empty" };
  const outfit = { dispose: vi.fn(), apply: vi.fn(), armour: {} };
  let finish!: (value: PreparedOperatorEnsemble) => void;
  const prepare = vi.fn(
    () =>
      new Promise<PreparedOperatorEnsemble>((resolve) => (finish = resolve)),
  );
  const resolve = vi.fn(
    async (_packet: unknown, associationKey: string, requestedKey: string) =>
      ({ associationKey, requestedKey }) as OperatorEnsembleRequest,
  );
  const changed = vi.fn();
  let now = 100;
  const remote = createRemoteCrew(s, parent, {
    fullBodies: 0,
    now: () => now,
    operator: {
      readiness: createOperatorReadiness(changed),
      capability: () => capability,
      resolve,
      prepare,
    },
  });
  remote.sync([mate({ seated: true })], undefined, [row]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  remote.frame(true);
  expect(remote.diagnostics()[0]).toMatchObject({
    tier: "marker",
    loaded: false,
    enabled: true,
  });
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: true, error: null });
  const request = await resolve.mock.results[0].value;
  const dispose = vi.fn(() => {
    held.dispose();
    outfit.dispose();
    body.dispose();
  });
  finish({
    state: "verified-complete",
    requestedKey: request.requestedKey,
    associationKey: request.associationKey,
    crew: body,
    root: body.root,
    held,
    outfit,
    prepareActivation: async () => undefined,
    activate: () => body.root.setEnabled(true),
    dispose,
  } as unknown as PreparedOperatorEnsemble);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(remote.diagnostics()[0].tier).toBe("marker");
  s.onBeforeAnimationsObservable.notifyObservers(s);
  remote.frame(true);
  expect(remote.diagnostics()[0]).toMatchObject({
    tier: "full",
    loaded: true,
    enabled: true,
  });
  expect(body.root.position.asArray()).toEqual([0, 0.1875, -3.5]);
  remote.sync([mate({ localX: 99, seated: false })], undefined, [
    {
      ...row,
      locationRevision: "9",
      localX: 99,
      operatorSnapshot: undefined,
      operatorPoseState: "none",
    },
  ]);
  now += 100;
  remote.frame(true);
  expect(body.root.position.asArray()).toEqual([0, 0.1875, -3.5]);
  expect(dispose).not.toHaveBeenCalled();
  remote.sync([mate({ seated: true })], undefined, [
    { ...row, operatorSnapshot: undefined, operatorPoseState: "recovering" },
  ]);
  remote.frame(true);
  expect(dispose).not.toHaveBeenCalled();
  expect(held.set).not.toHaveBeenCalled();
  expect(outfit.apply).not.toHaveBeenCalled();
  remote.sync([], undefined, []);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
  remote.dispose();
});

describe("remote crew", () => {
  it("draws, poses, clips the beam at and removes other bodies", async () => {
    // Head kit and armour fetch from the served asset tree; not reachable in this test.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = scene();
    const ship = new TransformNode("ship", s);
    let t = 0;
    const shots: unknown[] = [];
    const remote = createRemoteCrew(s, ship, {
      assetUrl: bodyUrl,
      now: () => t,
      onShot: (shot) => shots.push(shot),
    });
    remote.sync([mate()], { x: 0, y: 0 });
    await vi.waitFor(() => expect(remote.diagnostics()[0].loaded).toBe(true));
    t = 500;
    remote.frame(true);
    let [d] = remote.diagnostics();
    expect(d).toMatchObject({ name: "Mate", enabled: true, dead: false });
    expect(d.position).toEqual([2, 0, 0.1875]);
    // A beam along +X from the origin stops at the body's 0.3 m disc (world = ship frame here).
    const clip = remote.beamClip(
      new Vector3(0, 1.3, 0),
      new Vector3(1, 0, 0),
      60,
    );
    expect(clip).toBeCloseTo(1.7, 6);
    expect(
      remote.beamClip(new Vector3(0, 1.3, 0), new Vector3(-1, 0, 0), 60),
    ).toBeUndefined();
    // Walking: glides between accepted positions and plays the walk clip.
    for (let i = 1; i <= 4; i++) {
      t = 500 + i * 50;
      remote.sync([mate({ localX: 2 + i * 0.125 })], { x: 0, y: 0 });
    }
    t += 40;
    remote.frame(true);
    [d] = remote.diagnostics();
    expect(d.position![0]).toBeGreaterThan(2);
    expect(d.position![0]).toBeLessThan(2.5);
    expect(d.clips.join(",")).toMatch(/walk/);
    // A new accepted shot plays once (the first sequence seen is a baseline).
    remote.sync(
      [
        mate({
          localX: 2.5,
          shotSequence: 1n,
          shot: { x: 0, y: 0, struck: true },
        }),
      ],
      { x: 0, y: 0 },
    );
    remote.frame(true);
    expect(shots).toEqual([{ x: 0, y: 0, struck: true }]);
    // Dead: the death clip; the body no longer stops the beam, as on the server.
    t += 1000;
    remote.sync([mate({ localX: 2.5, dead: true, shotSequence: 1n })], {
      x: 0,
      y: 0,
    });
    remote.frame(true);
    [d] = remote.diagnostics();
    expect(d.dead).toBe(true);
    expect(d.clips).toContain("death");
    expect(
      remote.beamClip(new Vector3(0, 1.3, 0), new Vector3(1, 0, 0), 60),
    ).toBeUndefined();
    // Hidden with the cabin, removed when the view drops the row.
    remote.frame(false);
    expect(remote.diagnostics()[0].enabled).toBe(false);
    expect(remote.meshes().length).toBeGreaterThan(0);
    remote.sync([], { x: 0, y: 0 });
    expect(remote.count).toBe(0);
    expect(remote.meshes()).toEqual([]);
    expect(s.meshes.filter((m) => m.name.startsWith("remote-crew"))).toEqual(
      [],
    );
    remote.dispose();
  });

  it("draws the nearest bodies in full and every other body as a marker (no cap)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = scene();
    const remote = createRemoteCrew(s, new TransformNode("ship", s), {
      assetUrl: bodyUrl,
      fullBodies: 2,
    });
    remote.sync(
      [
        mate({ id: "far", localX: 9 }),
        mate({ id: "near", localX: 1 }),
        mate({ id: "mid", localX: 4 }),
      ],
      { x: 0, y: 0 },
    );
    const tierOf = () =>
      Object.fromEntries(remote.diagnostics().map((d) => [d.id, d.tier]));
    expect(tierOf()).toEqual({ near: "full", mid: "full", far: "marker" });
    // The marker body is drawn at its accepted position once motion is ready.
    remote.sync(
      [
        mate({ id: "far", localX: 9 }),
        mate({ id: "near", localX: 1 }),
        mate({ id: "mid", localX: 4 }),
      ],
      { x: 0, y: 0 },
    );
    remote.frame(true);
    const marker = s.meshes.find((m) => m.name === "crowd-marker-far")!;
    expect(marker.isEnabled()).toBe(true);
    // Walking closer promotes it; the previous full body that is now furthest becomes a marker.
    remote.sync(
      [
        mate({ id: "far", localX: 0.5 }),
        mate({ id: "near", localX: 1 }),
        mate({ id: "mid", localX: 8 }),
      ],
      { x: 0, y: 0 },
    );
    expect(tierOf()).toEqual({ near: "full", mid: "marker", far: "full" });
    expect(s.meshes.some((m) => m.name === "crowd-marker-far")).toBe(false);
    remote.dispose();
    expect(remote.count).toBe(0);
  });

  it("represents 100 bodies on one deck: every one drawn at some tier", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = scene();
    const remote = createRemoteCrew(s, new TransformNode("ship", s), {
      assetUrl: bodyUrl,
    });
    const crowd = Array.from({ length: 100 }, (_, i) =>
      mate({ id: `crew-${i}`, localX: (i % 10) - 5, localY: i / 10 }),
    );
    remote.sync(crowd, { x: 0, y: 0 });
    remote.sync(crowd, { x: 0, y: 0 });
    remote.frame(true);
    expect(remote.count).toBe(100);
    expect(remote.tiers()).toEqual({ full: 12, marker: 88 });
    const markers = s.meshes.filter((m) =>
      m.name.startsWith("crowd-marker-crew-"),
    );
    expect(markers).toHaveLength(88);
    expect(markers.every((m) => m.isEnabled())).toBe(true);
    remote.dispose();
  });
});
