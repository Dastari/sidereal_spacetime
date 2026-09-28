import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createVoxelCrewVisual } from "../crew/voxel-crew";
import { EVA_PRONE_PITCH } from "./eva-body";

const asset = () =>
  new Uint8Array(
    readFileSync(
      new URL(
        "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
        import.meta.url,
      ),
    ),
  );

describe("EVA prone fallback on the real crew body", () => {
  it("lies the body belly-down with the head toward the facing direction (game scene handedness)", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true; // as the game scene
    const crew = await createVoxelCrewVisual(
      scene,
      new TransformNode("ship-frame", scene),
      asset(),
      { faceAtlas: false },
    );
    const at = (name: string): Vector3 => {
      const node = crew.socketNodes[name as keyof typeof crew.socketNodes]!;
      let n: TransformNode | null = node;
      const chain: TransformNode[] = [];
      while (n) {
        chain.unshift(n);
        n = n.parent as TransformNode | null;
      }
      for (const c of chain) c.computeWorldMatrix(true);
      return node.getAbsolutePosition().clone();
    };
    const upright = { head: at("socket.head"), face: at("socket.face") };
    const facing = upright.face.subtract(upright.head);
    facing.y = 0;
    facing.normalize();
    crew.model.rotation.x = EVA_PRONE_PITCH;
    const head = at("socket.head"),
      face = at("socket.face"),
      back = at("socket.back"),
      chest = at("socket.chest");
    // Head toward the facing direction, face and chest below the back of the body.
    expect(head.x * facing.x + head.z * facing.z).toBeGreaterThan(1);
    expect(face.y).toBeLessThan(head.y);
    expect(chest.y).toBeLessThan(back.y);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });
});
