import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VOXEL_CREW_ANKLE_HEIGHT_M } from "@sidereal/content/crew-voxel-bundle";
import { SPRINT_SPEED_MPS, WALK_SPEED_MPS } from "@sidereal/sim";
import { createVoxelCrewVisual } from "./voxel-crew";

const asset = () =>
  new Uint8Array(
    readFileSync(
      new URL(
        "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
        import.meta.url,
      ),
    ),
  );

/**
 * Walk the body across the ship frame at gameplay speed with Babylon's fixed 16 ms frames and measure the
 * planted (lower) foot: its ground-plane speed over the deck and its lowest ankle height.
 */
async function stride(
  footIk: boolean,
  sprint: boolean,
  movingShip = false,
  armedIdle?: string,
) {
  const engine = new NullEngine();
  engine.getDeltaTime = () => 16;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  new FreeCamera("review", new Vector3(0, 1, -4), scene);
  const ship = new TransformNode("ship-frame", scene);
  const crew = await createVoxelCrewVisual(scene, ship, asset(), {
    faceAtlas: false,
  });
  if (armedIdle) {
    const armed = await SceneLoader.LoadAssetContainerAsync(
      "",
      new Uint8Array(
        readFileSync(
          new URL(
            "../../../../assets/runtime/crew/items/r001/armed-actions.glb",
            import.meta.url,
          ),
        ),
      ),
      scene,
      undefined,
      ".glb",
    );
    crew.addClips(armed);
    crew.setArmedClass(armedIdle);
  }
  crew.setFootIk(footIk);
  crew.update({ moving: !armedIdle, seated: false, sprinting: sprint });
  const speed = armedIdle ? 0 : sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
  const feet = ["foot.L", "foot.R"].map((n) => crew.joints.get(n)!);
  const slips: number[] = [];
  let lowest = Infinity;
  let maxError = 0;
  let last: Vector3[] | undefined;
  for (let i = 0; i < 150; i++) {
    crew.root.position.z -= speed * 0.016; // gameplay forward is -Z
    if (movingShip) {
      ship.position.set(i * 0.1, 0, i * 0.08);
      ship.rotation.y = i * 0.01;
    }
    scene.render();
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    const inv = ship.computeWorldMatrix(true).clone().invert();
    const now = feet.map((f) =>
      Vector3.TransformCoordinates(f.getAbsolutePosition(), inv),
    );
    maxError = Math.max(maxError, crew.footError);
    if (last && i > 30) {
      const k = now[0].y <= now[1].y ? 0 : 1;
      lowest = Math.min(lowest, now[k].y);
      if (Math.max(now[k].y, last[k].y) < VOXEL_CREW_ANKLE_HEIGHT_M + 0.012)
        slips.push(
          Math.hypot(now[k].x - last[k].x, now[k].z - last[k].z) / 0.016,
        );
    }
    last = now;
  }
  crew.dispose();
  scene.dispose();
  engine.dispose();
  slips.sort((a, b) => a - b);
  expect(
    slips.length,
    "review must contain real consecutive stance samples",
  ).toBeGreaterThan(20);
  return { slip: slips[Math.floor(slips.length / 2)], lowest, maxError };
}

describe("foot planting (presentation-only two-bone foot IK)", () => {
  for (const cls of ["rifle", "heavy"])
    it(`${cls} ready pose keeps real deck contact with the body rig's idle legs`, async () => {
      const on = await stride(true, false, false, cls);
      expect(on.slip).toBeLessThan(0.05);
      expect(on.lowest).toBeLessThan(VOXEL_CREW_ANKLE_HEIGHT_M + 0.012);
      expect(on.maxError).toBeLessThan(0.01);
    });
  for (const sprint of [false, true])
    it(`${sprint ? "run" : "walk"}: planted feet stay put on the deck and never sink into it`, async () => {
      const on = await stride(true, sprint);
      expect(on.slip).toBeLessThan(0.05);
      expect(on.lowest).toBeGreaterThan(VOXEL_CREW_ANKLE_HEIGHT_M - 0.002);
    });

  it("plants in the ship frame while the ship translates and turns", async () => {
    const fixed = await stride(true, false);
    const moving = await stride(true, false, true);
    expect(moving.slip).toBeLessThan(0.05);
    expect(moving.lowest).toBeGreaterThan(VOXEL_CREW_ANKLE_HEIGHT_M - 0.002);
    expect(moving.slip).toBeCloseTo(fixed.slip, 3);
    // The authored near-straight leg can leave ~6 mm reach residual. Moving the ship must not
    // add error or stretch the chain to erase that residual.
    expect(moving.maxError).toBeCloseTo(fixed.maxError, 4);
    expect(moving.maxError).toBeLessThan(0.01);
  });

  it("the stride measurement detects the original sliding without foot IK", async () => {
    const on = await stride(true, true);
    const off = await stride(false, true);
    expect(off.slip).toBeGreaterThan(0.1);
    expect(on.slip).toBeLessThan(off.slip * 0.1);
  });
});
