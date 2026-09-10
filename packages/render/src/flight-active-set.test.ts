import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createFlightActiveSet } from "./flight-active-set";
import { createActiveSetRevision } from "./active-set-revision";

test("Flight caches the real active list without freezing mesh transforms and drops it on changes", () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  const camera=new FreeCamera("camera",new Vector3(0,0,-10),scene);camera.setTarget(Vector3.Zero());
  const mesh=CreateBox("part",{},scene);mesh.metadata={role:"hull",partId:"part"};
  const material=new StandardMaterial("material",scene);mesh.material=material;
  // NullEngine supplies the scene/culling/render queue; shader readiness and GPU draw are controlled here.
  vi.spyOn(material,"isReady").mockReturnValue(true);vi.spyOn(material,"isReadyForSubMesh").mockReturnValue(true);
  vi.spyOn(mesh,"render").mockReturnValue(mesh);
  const freeze=vi.spyOn(scene,"freezeActiveMeshes"),owner=createFlightActiveSet(scene);
  const geometryCallback=mesh.geometry!.onGeometryUpdated;
  const frame=(flight=true)=>{owner.prepare(flight);scene.render();};
  for(let i=0;i<6;i++)frame();
  expect(owner.snapshot().frozen).toBe(true);expect(freeze).toHaveBeenCalledTimes(1);
  expect(freeze.mock.calls[0][0]).toBe(true);expect(freeze.mock.calls[0][3]).toBe(false);
  expect(mesh.isWorldMatrixFrozen).toBe(false);expect(scene.getActiveMeshes().data[0]).toBe(mesh);
  mesh.position.x=2;frame();expect(owner.snapshot().frozen).toBe(false);
  for(let i=0;i<4;i++)frame();expect(owner.snapshot().frozen).toBe(true);
  mesh.setEnabled(false);frame();expect(scene.getActiveMeshes().length).toBe(0);
  mesh.setEnabled(true);for(let i=0;i<5;i++)frame();expect(owner.snapshot().frozen).toBe(true);
  frame(false);expect(owner.snapshot().frozen).toBe(false);
  expect(mesh.geometry!.onGeometryUpdated).toBe(geometryCallback);
  expect(mesh.metadata.partId).toBe("part");owner.dispose();scene.dispose();engine.dispose();
});

test("late ready callbacks cannot re-freeze after a view change or disposal", () => {
  const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera("camera",new Vector3(0,0,-10),scene);
  vi.spyOn(scene,"isReady").mockReturnValue(true);
  let complete:(()=>void)|undefined;
  vi.spyOn(scene,"freezeActiveMeshes").mockImplementation((_skip,success)=>{complete=success;return scene;});
  const release=vi.spyOn(scene,"unfreezeActiveMeshes"),owner=createFlightActiveSet(scene);
  const frame=()=>{owner.prepare(true);scene.onBeforeRenderObservable.notifyObservers(scene);};
  for(let i=0;i<5;i++)frame();expect(owner.snapshot().pending).toBe(true);
  owner.prepare(false);complete!();expect(owner.snapshot().frozen).toBe(false);expect(release).toHaveBeenCalled();
  for(let i=0;i<5;i++)frame();owner.dispose();complete!();expect(owner.snapshot().frozen).toBe(false);
  scene.dispose();engine.dispose();
});

test("active-list revision covers geometry, material queue classification, camera and placement replacement", () => {
  const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera("camera",new Vector3(0,0,-10),scene);
  const mesh=CreateBox("part",{updatable:true},scene);mesh.metadata={role:"hull",partId:"part"};
  const material=new StandardMaterial("material",scene);mesh.material=material;
  const revision=createActiveSetRevision();let value=revision.capture(scene);expect(revision.capture(scene)).toBe(value);
  for(const change of [()=>{material.alpha=.4;},()=>{camera.position.x++;},()=>{mesh.metadata.partId="replacement";},
    ()=>{mesh.updateVerticesData("position",mesh.getVerticesData("position")!);},
    ()=>{mesh.getBoundingInfo().reConstruct(new Vector3(-4,-4,-4),new Vector3(4,4,4));}]){
    change();scene.incrementRenderId();const next=revision.capture(scene);expect(next).toBeGreaterThan(value);value=next;
  }
  revision.dispose();scene.dispose();engine.dispose();
});
