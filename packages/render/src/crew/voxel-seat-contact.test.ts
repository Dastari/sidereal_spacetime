import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createVoxelCrewVisual } from "./voxel-crew";

for (const bodyType of ["male", "female"] as const)
  for (const height of [0.375, 0.5])
    test(`${bodyType} perches on ${height} m bed support with planted soles and upper-bunk clearance`, async () => {
      const engine = new NullEngine();
      engine.getDeltaTime = () => 16;
      const scene = new Scene(engine);
      scene.useConstantAnimationDeltaTime = true;
      new FreeCamera("review", new Vector3(0, 1, -4), scene);
      const crew = await createVoxelCrewVisual(
        scene,
        new TransformNode("frame", scene),
        new Uint8Array(
          readFileSync(
            new URL(
              "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
              import.meta.url,
            ),
          ),
        ),
        { faceAtlas: false },
      );
      crew.customize({ bodyType });
      const lift = height - 0.3;
      crew.root.position.y = lift;
      crew.setSeatContact({
        lift,
        lean: height === 0.375 ? (-35 * Math.PI) / 180 : 0,
        footSupport: 0,
      });
      crew.update({ moving: false, seated: true, reducedMotion: true });
      let footError = 0,
        rearUpper = -Infinity,
        hipBottom = Infinity,
        hipRear = -Infinity;
      for (let frame = 0; frame < 180; frame++) {
        scene.render();
        if (frame < 30) continue;
        for (const node of scene.transformNodes) node.computeWorldMatrix(true);
        for (const side of ["L", "R"])
          footError = Math.max(
            footError,
            Math.abs(
              crew.joints.get(`foot.${side}`)!.getAbsolutePosition().y -
                0.09375,
            ),
          );
        for (const mesh of scene.meshes) {
          if (!mesh.isEnabled() || !mesh.skeleton) continue;
          mesh.skeleton.prepare();
          const positions = mesh.getPositionData(true, true),
            indices = mesh.getVerticesData("matricesIndices"),
            weights = mesh.getVerticesData("matricesWeights");
          if (!positions || !indices || !weights) continue;
          const world = mesh.computeWorldMatrix(true);
          for (let i = 0; i < positions.length / 3; i++) {
            let k = 0;
            for (let j = 1; j < 4; j++)
              if (weights[i * 4 + j] > weights[i * 4 + k]) k = j;
            const name = mesh.skeleton.bones.find(
              (b) => b.getIndex() === indices[i * 4 + k],
            )?.name;
            const v = Vector3.TransformCoordinates(
              Vector3.FromArray(positions, i * 3),
              world,
            );
            if (name === "pelvis") {
              hipBottom = Math.min(hipBottom, v.y);
              hipRear = Math.max(hipRear, v.z);
            }
            if (
              v.y >= 0.6875 &&
              ["spine", "chest", "neck", "head"].includes(name ?? "")
            )
              rearUpper = Math.max(rearUpper, v.z);
          }
        }
      }
      expect(footError).toBeLessThan(0.006);
      expect(hipBottom).toBeCloseTo(height, 2);
      expect(hipRear).toBeGreaterThan(0.1875); // hips reach the structural front bed edge from the admitted edge anchor
      if (height === 0.375) expect(rearUpper).toBeLessThan(0.1875); // upper torso clears the bunk's upper berth
      const seatedSpine = crew.joints.get("spine")!.rotationQuaternion!.clone();
      crew.setSeatContact(undefined);
      crew.root.position.y = 0;
      crew.update({ moving: false, seated: false, reducedMotion: true });
      for (let frame = 0; frame < 60; frame++) scene.render();
      const standingSpine = crew.joints
        .get("spine")!
        .rotationQuaternion!.clone();
      if (height === 0.375)
        expect(Math.abs(standingSpine.x - seatedSpine.x)).toBeGreaterThan(0.1);
      crew.root.position.y = lift;
      crew.setSeatContact({
        lift,
        lean: height === 0.375 ? (-35 * Math.PI) / 180 : 0,
        footSupport: 0,
      });
      crew.update({ moving: false, seated: true, reducedMotion: true });
      for (let frame = 0; frame < 60; frame++) scene.render();
      const repeatedSpine = crew.joints.get("spine")!.rotationQuaternion!;
      for (const component of ["x", "y", "z", "w"] as const)
        expect(repeatedSpine[component]).toBeCloseTo(seatedSpine[component], 5);
      crew.dispose();
      scene.dispose();
      engine.dispose();
    });
