import { test, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createObjectPresentation } from "./object-presentation";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

test("a real click ray selects equipment but cannot select through an opaque wall", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("pick",new Vector3(0,0,-5),scene);camera.setTarget(Vector3.Zero());
  const object = CreateBox("equipment",{},scene);object.metadata={partId:"sofa"};
  const wall = CreateBox("wall",{width:3,height:3,depth:.2},scene);wall.position.z=-2;
  const canvas = Object.assign(new EventTarget(),{getBoundingClientRect:()=>({left:0,top:0})}) as unknown as HTMLCanvasElement;
  const picked: (string|undefined)[]=[];
  const visual=createObjectPresentation(canvas,scene,[object,wall],[],()=>false,id=>picked.push(id));
  const click=()=>{
    const event=Object.assign(new Event("pointerdown",{cancelable:true}),{button:0,clientX:engine.getRenderWidth()/2,clientY:engine.getRenderHeight()/2});
    event.preventDefault(); // Babylon consumes browser defaults before our listener.
    return canvas.dispatchEvent(event);
  };
  scene.render();click();expect(picked.at(-1)).toBeUndefined();expect(object.renderOutline).toBeFalsy();
  wall.setEnabled(false);scene.render();click();expect(picked.at(-1)).toBe("sofa");expect(scene.customRenderTargets.some(t=>t.name==="object-selection-mask")).toBe(true);
  visual.select(undefined);
  expect(scene.customRenderTargets).toHaveLength(0);
  visual.dispose();scene.dispose();engine.dispose();
});

test("one placed grow light can switch without mutating shared authored materials", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const source = new PBRMaterial("authored", scene);
  source.emissiveColor.set(.2,.6,.9); source.roughness=.23; source.indexOfRefraction=1.46;
  const meshes = ["one","two"].map(id => {
    const mesh=CreateBox(id,{},scene);mesh.material=source;mesh.metadata={partId:id};return mesh;
  });
  const installed = meshes.map(mesh => ({node:mesh,meshes:[mesh],lighting:{lights:[]}})) as unknown as Parameters<typeof createObjectPresentation>[3];
  const canvas = new EventTarget() as HTMLCanvasElement;
  const visual = createObjectPresentation(canvas,scene,meshes,installed,()=>false);
  source.freeze();
  visual.lights([{placementId:"one",enabled:false},{placementId:"two",enabled:true}]);
  expect(source.isFrozen).toBe(false);
  expect(source.metadata.mutableMaterial).toBe(true);
  expect(meshes.every(mesh=>mesh.metadata.mutableMaterial && !mesh.material!.isFrozen)).toBe(true);
  const first=meshes[0].material as PBRMaterial, second=meshes[1].material as PBRMaterial;
  expect(first).not.toBe(second);expect(first).not.toBe(source);
  expect(first.emissiveColor.asArray()).toEqual([0,0,0]);
  expect(second.emissiveColor.asArray()).toEqual([.2,.6,.9]);
  expect(source.emissiveColor.asArray()).toEqual([.2,.6,.9]);
  expect(first.roughness).toBe(.23);expect(first.indexOfRefraction).toBe(1.46);
  visual.select("one");
  expect(scene.customRenderTargets).toHaveLength(1);
  visual.select("two");expect(scene.customRenderTargets).toHaveLength(1);
  visual.lights([{placementId:"one",enabled:true}]);expect((meshes[0].material as PBRMaterial).emissiveColor.asArray()).toEqual([.2,.6,.9]);
  visual.lights([]);expect((meshes[0].material as PBRMaterial).emissiveColor.asArray()).toEqual([0,0,0]);
  visual.lights([{placementId:"one",enabled:true}]);expect((meshes[0].material as PBRMaterial).emissiveColor.asArray()).toEqual([.2,.6,.9]);
  visual.lights([{placementId:"one",enabled:false},{placementId:"two",enabled:false}]);
  expect(meshes[0].material).toBe(meshes[1].material);
  expect(scene.materials.filter(m=>m.name.endsWith("-switch-off"))).toHaveLength(1);
  expect(first.emissiveColor.asArray()).toEqual([0,0,0]);
  visual.dispose();expect(meshes.every(mesh=>mesh.material===source)).toBe(true);
  expect(scene.customRenderTargets).toHaveLength(0);
  scene.dispose();engine.dispose();
});
