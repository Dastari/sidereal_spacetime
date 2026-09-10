import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createFastSnapshot } from "./fast-snapshot";
import { createSnapshotRevision } from "./snapshot-revision";

test("snapshot admission resets on draw membership changes and excludes animated or temporal frames", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("camera",new Vector3(0,0,-5),scene);
  const mesh = CreateBox("box",{},scene);mesh.metadata={role:"equipment",partId:"part"};
  const driver = {enableSnapshotRendering:vi.fn(),disableSnapshotRendering:vi.fn(),updateMesh:vi.fn(),updateMeshesForEffectLayer:vi.fn(),dispose:vi.fn()};
  const snapshot = createFastSnapshot(scene,()=>driver);
  const frame = {ready:true,reducedMotion:true,temporal:false,displayRevision:0};
  const tick = () => {snapshot.prepare(frame);scene.onBeforeRenderObservable.notifyObservers(scene);};
  tick();tick();tick();
  expect(snapshot.snapshot().armed).toBe(true);
  tick();expect(driver.enableSnapshotRendering).toHaveBeenCalledTimes(1);
  mesh.isVisible=false;tick();
  expect(snapshot.snapshot().armed).toBe(false);
  expect(driver.disableSnapshotRendering).toHaveBeenCalledTimes(1);
  tick();tick();expect(snapshot.snapshot().armed).toBe(true);
  frame.temporal=true;tick();expect(snapshot.snapshot()).toMatchObject({armed:false,reason:"Temporal AA"});
  frame.temporal=false;frame.reducedMotion=false;tick();
  expect(snapshot.snapshot().reason).toBe("Animated environment");
  snapshot.dispose();expect(driver.dispose).toHaveBeenCalledOnce();scene.dispose();engine.dispose();
});

test("snapshot revisions observe transforms, material state, geometry edits and external draw revisions", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("camera",new Vector3(0,0,-5),scene);scene.activeCamera=camera;
  const mesh=CreateBox("box",{updatable:true},scene);mesh.metadata={role:"equipment",partId:"part"};
  const material=new StandardMaterial("material",scene);mesh.material=material;
  const revision=createSnapshotRevision();let previous=revision.capture(scene,0);
  expect(revision.capture(scene,0)).toBe(previous);
  for (const mutate of [()=>{mesh.position.x++;},()=>{material.alpha=.5;},()=>{camera.position.x++;},
    ()=>{mesh.metadata.snapshotRevision=1;},()=>{mesh.setEnabled(false);},()=>{mesh.setEnabled(true);},
    ()=>{mesh.updateVerticesData("position",mesh.getVerticesData("position")!);}]) {
    mutate();scene.incrementRenderId();const next=revision.capture(scene,0);expect(next).toBeGreaterThan(previous);previous=next;
    expect(revision.capture(scene,0)).toBe(previous);
  }
  expect(revision.capture(scene,1)).toBeGreaterThan(previous);
  const callback=mesh.geometry!.onGeometryUpdated;revision.dispose();
  expect(mesh.geometry!.onGeometryUpdated).not.toBe(callback);
  scene.dispose();engine.dispose();
});
