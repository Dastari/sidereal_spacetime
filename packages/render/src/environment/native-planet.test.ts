import {describe,it,expect} from "vitest";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {planetRecipe,planetEffects} from "../../../content/src/environment";
import {createNativePlanetCache,createNativeIcePlanet,canUseNativeIce,NATIVE_PLANET_CACHE_LIMIT} from "./native-planet";
import type {NativePlanetKit} from "./native-planet-composition";
const form={positions:[-.5,-.5,-.4,.5,-.5,-.4,.5,.5,.4,-.5,.5,.4],indices:[0,1,2,0,2,3],triangleMaterials:[0,0]};
const kit:NativePlanetKit={schema:"sidereal.native-planet-kit.v1",layout:"glacial-interior",materials:[{name:"snow",linearColor:[1,1,1],roughness:.83}],variants:["snow-a","snow-b","snow-c","ice-a","ice-b","floor","sealing-core"].map(name=>({...form,name}))};
describe("native planet live resource contract",()=>{
 it("bounds cached geometry and reuses identical seed/LOD while reducing distant work",()=>{
  const cache=createNativePlanetCache(kit),hero=cache.get(47,0);
  expect(cache.get(47,0)).toBe(hero);expect(cache.get(47,1).triangles).toBeLessThan(hero.triangles);expect(cache.get(47,2).triangles).toBeLessThan(cache.get(47,1).triangles);
  expect(cache.get(47,0,.7).batches[0].positions).not.toEqual(hero.batches[0].positions);
  for(let seed=0;seed<10;seed++)cache.get(seed,2);
  expect(cache.size).toBe(NATIVE_PLANET_CACHE_LIMIT);cache.clear();expect(cache.size).toBe(0);
 });
 it("preserves unsupported mixed effects/custom colors with the existing renderer",()=>{
  const recipe=planetRecipe("ice",47);expect(canUseNativeIce(recipe)).toBe(true);
  expect(canUseNativeIce({...recipe,effects:{...planetEffects(recipe),volcanicCoverage:.1}})).toBe(false);
  expect(canUseNativeIce({...recipe,cloudCoverage:.2})).toBe(false);
  expect(canUseNativeIce({...recipe,palette:recipe.palette.map(()=>"000000")})).toBe(false);
 });
 it("hides/restores the same GPU objects and fully disposes native resources",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),cache=createNativePlanetCache(kit),planet=createNativeIcePlanet(scene,"frost",planetRecipe("ice",47),0,kit,cache);
  const meshes=planet.root.getChildMeshes(),materials=[...scene.materials];planet.root.setEnabled(false);planet.root.setEnabled(true);
  expect(planet.root.getChildMeshes()).toEqual(meshes);expect(scene.materials).toEqual(materials);
  planet.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);
  cache.clear();scene.dispose();engine.dispose();
 });
});
