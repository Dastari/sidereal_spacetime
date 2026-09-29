import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { crewItem } from "@sidereal/content/crew-items";
import { createCombatFx, type CombatActionState } from "./combat-fx";
import { createVoxelFxPlayer, crewItemFxTint } from "./equipment/voxel-item-fx";

const action = (over: Partial<CombatActionState> = {}): CombatActionState => ({
  characterId: "mate",
  crewItemId: "shotgun",
  mode: "pellets",
  shotSequence: 0n,
  points: [],
  originX: 0,
  originY: 0,
  landX: 0,
  landY: 0,
  detonated: false,
  blastRadiusM: 0,
  reloadSequence: 0n,
  stunSequence: 0n,
  ...over,
});

function fakeFx() {
  return {
    shot: vi.fn(),
    melee: vi.fn(),
    blast: vi.fn(),
    stun: vi.fn(),
  };
}

describe("combat FX from accepted combat actions", () => {
  it("plays a shot once per new sequence with every server ray, reloads and stuns", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const ship = new TransformNode("ship", scene);
    const fx = fakeFx();
    const body = {
      root: new TransformNode("body", scene),
      held: {
        muzzle: () => undefined,
        playItem: vi.fn(),
        reload: vi.fn(),
      },
    };
    const combat = createCombatFx(scene, ship, fx as never, (id) =>
      id === "mate" ? (body as never) : undefined,
    );
    // The first row is a baseline: nothing replays on arrival.
    combat.sync([action({ shotSequence: 4n, reloadSequence: 2n })]);
    expect(fx.shot).not.toHaveBeenCalled();
    const points: [number, number, number][] = [
      [1, 5, 1],
      [2, 5, 0],
    ];
    combat.sync([action({ shotSequence: 5n, reloadSequence: 2n, points })]);
    expect(fx.shot).toHaveBeenCalledTimes(1);
    const [item, muzzle, rays] = fx.shot.mock.calls[0];
    expect(item.id).toBe("shotgun");
    expect(body.held.playItem).toHaveBeenCalledWith("fire");
    // Ship-local (x, y) -> render (x, height, -y), at the muzzle height (the server shot is planar).
    expect(rays).toHaveLength(2);
    expect(rays[0].end.x).toBe(1);
    expect(rays[0].end.z).toBe(-5);
    expect(rays[0].end.y).toBeCloseTo(muzzle.position.y);
    expect(rays.map((r: { struck: boolean }) => r.struck)).toEqual([
      true,
      false,
    ]);
    // same sequence again: nothing
    combat.sync([action({ shotSequence: 5n, reloadSequence: 2n, points })]);
    expect(fx.shot).toHaveBeenCalledTimes(1);
    combat.sync([
      action({ shotSequence: 5n, reloadSequence: 3n, stunSequence: 1n }),
    ]);
    expect(body.held.reload).toHaveBeenCalledTimes(1);
    expect(fx.stun).toHaveBeenCalledTimes(1);
    combat.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("melee sparks only on a strike; a thrown charge blasts at the server's detonation", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const ship = new TransformNode("ship", scene);
    const fx = fakeFx();
    const body = { root: new TransformNode("body", scene), play: vi.fn() };
    const combat = createCombatFx(
      scene,
      ship,
      fx as never,
      () => body as never,
    );
    combat.sync([action({ crewItemId: "baton", mode: "melee" })]);
    combat.sync([
      action({
        crewItemId: "baton",
        mode: "melee",
        shotSequence: 1n,
        points: [[0, 1.8, 0]],
      }),
    ]);
    expect(fx.melee).not.toHaveBeenCalled();
    combat.sync([
      action({
        crewItemId: "baton",
        mode: "melee",
        shotSequence: 2n,
        points: [[0, 1, 1]],
      }),
    ]);
    expect(fx.melee).toHaveBeenCalledTimes(1);
    const grenade = (over: Partial<CombatActionState>) =>
      action({
        crewItemId: "grenade",
        mode: "thrown",
        shotSequence: 3n,
        landX: 0,
        landY: 4,
        blastRadiusM: 3.5,
        points: [[0, 4, 0]],
        ...over,
      });
    combat.sync([grenade({})]);
    expect(body.play).toHaveBeenCalledWith("throw");
    expect(fx.blast).not.toHaveBeenCalled();
    combat.sync([grenade({ detonated: true })]);
    expect(fx.blast).toHaveBeenCalledTimes(1);
    const [, at, radius] = fx.blast.mock.calls[0];
    expect([at.x, at.z, radius]).toEqual([0, -4, 3.5]);
    combat.sync([grenade({ detonated: true })]);
    expect(fx.blast).toHaveBeenCalledTimes(1);
    combat.dispose();
    scene.dispose();
    engine.dispose();
  });
});

describe("r001 FX player", () => {
  it("instances the authored FX GLBs for a shot and tints emit-slot effects", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const original = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
    const spy = vi
      .spyOn(SceneLoader, "LoadAssetContainerAsync")
      .mockImplementation((_base, file, s) =>
        original(
          "",
          "data:model/gltf-binary;base64," +
            readFileSync(
              new URL(
                "../../../assets/runtime/crew/items/r001/" + String(file),
                import.meta.url,
              ),
            ).toString("base64"),
          s,
          undefined,
          ".glb",
        ),
      );
    const meshes: unknown[] = [];
    const player = createVoxelFxPlayer(
      scene,
      new TransformNode("ship", scene),
      {
        onMesh: (m) => meshes.push(m),
      },
    );
    const beam = crewItem("beam-rifle");
    player.shot(
      beam,
      { position: new Vector3(0, 1.3, 0), direction: new Vector3(0, 0, -1) },
      [{ end: new Vector3(0, 1.3, -6), struck: true }],
    );
    await vi.waitFor(() => expect(player.count).toBeGreaterThanOrEqual(3));
    // muzzle flash, beam lance (stretched to 6 m) and the impact spark: one GLB parse each
    expect(new Set(spy.mock.calls.map((c) => c[1]))).toEqual(
      new Set([
        "fx/muzzle-flash.glb",
        "fx/beam-lance.glb",
        "fx/impact-spark.glb",
      ]),
    );
    expect(meshes.length).toBeGreaterThan(0);
    // beam-lance is tinted from the item's emit_a slot
    expect(crewItemFxTint(beam, { tint: "emit_a" } as never)).toBeDefined();
    player.dispose();
    expect(player.count).toBe(0);
    spy.mockRestore();
    scene.dispose();
    engine.dispose();
  });
});
