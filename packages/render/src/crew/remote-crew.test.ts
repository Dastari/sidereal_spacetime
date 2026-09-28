import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createVoxelCrewVisual } from "./voxel-crew";
import { sharedCrewContainer } from "./crew-asset-cache";
import { createRemoteCrew, type RemoteCrewState } from "./remote-crew";

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
  heldAsset: null,
  ...over,
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

  it("draws at most the nearest bodies", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = scene();
    const remote = createRemoteCrew(s, new TransformNode("ship", s), {
      assetUrl: bodyUrl,
      maxBodies: 2,
    });
    remote.sync(
      [
        mate({ id: "far", localX: 9 }),
        mate({ id: "near", localX: 1 }),
        mate({ id: "mid", localX: 4 }),
      ],
      { x: 0, y: 0 },
    );
    expect(
      remote
        .diagnostics()
        .map((d) => d.id)
        .sort(),
    ).toEqual(["mid", "near"]);
    remote.dispose();
    expect(remote.count).toBe(0);
  });
});
