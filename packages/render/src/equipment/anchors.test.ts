import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { equipmentAimSource, validAnchors } from "./anchors";
it("rejects malformed or degenerate anchor bases", () => {
  expect(
    validAnchors({
      attachmentOrigin: [0, 0, 0],
      forward: [0, 0, -1],
      up: [0, 1, 0],
    }),
  ).toBe(true);
  expect(
    validAnchors({
      attachmentOrigin: [0, 0, 0],
      forward: [0, 0, 0],
      up: [0, 1, 0],
    }),
  ).toBe(false);
  expect(
    validAnchors({
      attachmentOrigin: [0, 0, 0],
      forward: [0, 0, -1],
      up: [0, 0, -1],
    }),
  ).toBe(false);
  expect(
    validAnchors({
      attachmentOrigin: [0, 0, 0],
      forward: [0, 0, -1],
      up: [0, 1, 0],
      anchors: { muzzle: [0, NaN, 1] },
    }),
  ).toBe(false);
});
it("includes reflected glTF conversion, hand rotation and parent translation in muzzle anchors", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    hand = new TransformNode("hand", scene),
    converted = new TransformNode("gltf", scene);
  hand.position.set(4, 2, 9);
  hand.rotation.y = 0.7;
  converted.parent = hand;
  converted.scaling.z = -1;
  const source = equipmentAimSource(converted, hand, {
    attachmentOrigin: [0, 0, 0],
    forward: [0, 0, -1],
    up: [0, 1, 0],
    anchors: { muzzle: [0, 0.13, -0.78] },
  });
  const muzzle = source.getMuzzleWorld()!;
  expect(
    Vector3.Distance(
      muzzle.position,
      Vector3.TransformCoordinates(
        new Vector3(0, 0.13, -0.78),
        converted.getWorldMatrix(),
      ),
    ),
  ).toBeLessThan(1e-6);
  expect(source.getGripBasis()!.forward.z).toBeCloseTo(1);
  converted.dispose();
  expect(source.getMuzzleWorld()).toBeUndefined();
  scene.dispose();
  engine.dispose();
});

it('refreshes intermediate attachment transforms after a same-frame hand solve',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  const hand=new TransformNode('hand',scene),socket=new TransformNode('socket',scene),placement=new TransformNode('item',scene),converted=new TransformNode('gltf',scene);
  socket.parent=hand;placement.parent=socket;converted.parent=placement;converted.scaling.z=-1;
  const source=equipmentAimSource(converted,hand,{attachmentOrigin:[0,0,0],forward:[0,0,-1],up:[0,1,0],anchors:{muzzle:[0,0,-1]}});
  source.getMuzzleWorld();
  hand.position.set(4,2,9);socket.position.y=.25;placement.position.x=.1;
  const muzzle=source.getMuzzleWorld()!;
  expect(Vector3.Distance(muzzle.position,new Vector3(4.1,2.25,10))).toBeLessThan(1e-6);
  expect(muzzle.direction.asArray()).toEqual([0,0,1]);
  scene.dispose();engine.dispose();
});
