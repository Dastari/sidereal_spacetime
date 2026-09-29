import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
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
 * Walk the body across the ship frame at gameplay speed with fixed 1/60 s frames and measure the
 * planted (lower) foot: its ground-plane speed over the deck and its lowest ankle height.
 */
async function stride(footIk: boolean, sprint: boolean) {
  const engine = new NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  new FreeCamera("review", new Vector3(0, 1, -4), scene);
  const ship = new TransformNode("ship-frame", scene);
  const crew = await createVoxelCrewVisual(scene, ship, asset(), {
    faceAtlas: false,
  });
  crew.setFootIk(footIk);
  crew.update({ moving: true, seated: false, sprinting: sprint });
  const speed = sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
  const feet = ["foot.L", "foot.R"].map((n) => crew.joints.get(n)!);
  const slips: number[] = [];
  let lowest = Infinity;
  let last: Vector3[] | undefined;
  for (let i = 0; i < 150; i++) {
    crew.root.position.z -= speed / 60; // gameplay forward is -Z
    scene.render();
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    const now = feet.map((f) => f.getAbsolutePosition().clone());
    if (last && i > 30) {
      const k = now[0].y <= now[1].y ? 0 : 1;
      lowest = Math.min(lowest, now[k].y);
      if (now[k].y < VOXEL_CREW_ANKLE_HEIGHT_M + 0.012)
        slips.push(Math.hypot(now[k].x - last[k].x, now[k].z - last[k].z) * 60);
    }
    last = now;
  }
  crew.dispose();
  scene.dispose();
  engine.dispose();
  slips.sort((a, b) => a - b);
  return { slip: slips[Math.floor(slips.length / 2)] ?? 0, lowest };
}

describe("foot planting (presentation-only two-bone foot IK)", () => {
  for (const sprint of [false, true])
    it(`${sprint ? "run" : "walk"}: planted feet stay put on the deck and never sink into it`, async () => {
      const on = await stride(true, sprint);
      expect(on.slip).toBeLessThan(0.05);
      expect(on.lowest).toBeGreaterThan(VOXEL_CREW_ANKLE_HEIGHT_M - 0.002);
    });
});
