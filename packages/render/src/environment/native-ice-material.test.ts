import {describe,it,expect} from "vitest";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {createNativeIceFinish,nativeColdResponse} from "./native-ice-material";
describe("native cold material response",()=>{
 it("is bounded and light-driven, preserving dark deep cavities and shadowed snow",()=>{
  for(const snow of [false,true])for(const depth of [0,.5,1])for(const thin of [0,1])for(const nv of [0,.5,1])for(const nl of [-1,0,1])for(const light of [0,2.1,100]){
   const value=nativeColdResponse(depth,thin,nv,nl,.7,light,snow);
   expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(snow?.48:.45);
   expect(nativeColdResponse(depth,thin,nv,nl,.7,0,snow)).toBe(0);
  }
  expect(nativeColdResponse(1,1,0,1,1,2.1,false)).toBe(0);
  expect(nativeColdResponse(0,1,0,1,0,2.1,true)).toBe(0);
  expect(nativeColdResponse(0,1,0,1,1,2.1,false)).toBeGreaterThan(nativeColdResponse(0,1,1,1,1,2.1,false));
 });
 it("separates rough snow from glossy opaque ice without adding scene lights or shells",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),snow=createNativeIceFinish(scene,"snow",true),ice=createNativeIceFinish(scene,"ice",false);
  expect(snow.roughness).toBeGreaterThan(.8);expect(ice.roughness).toBeLessThan(.2);
  expect(ice.clearCoat.isEnabled).toBe(true);expect(ice.alpha).toBe(1);expect(ice.needAlphaBlending()).toBe(false);
  expect(scene.lights).toHaveLength(0);expect(scene.meshes).toHaveLength(0);
  scene.dispose();engine.dispose();
 });
});
