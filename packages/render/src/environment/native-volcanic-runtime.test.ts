import {describe,it,expect} from "vitest";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {Scene} from "@babylonjs/core/scene";
import {planetRecipe,planetEffects} from "../../../content/src/environment";
import type {NativePlanetKit} from "./native-planet-composition";
import {createNativeVolcanicCache,createNativeVolcanicWorldPlanet,canUseNativeVolcanic,NATIVE_VOLCANIC_CACHE_LIMIT} from "./native-volcanic-runtime";
const names=["a","b","c","pillar","crater","molten-core","sealing-core","fall","macro-a","macro-b","basin"];
const kit:NativePlanetKit={schema:"sidereal.native-planet-kit.v1",layout:"volcanic-geology",materials:Array.from({length:6},(_,i)=>({name:`role${i}`,linearColor:[.1,.04,.02],roughness:.4})),variants:names.map((name,i)=>({name,positions:[0,0,.5,.4,0,-.5,0,.4,-.5],indices:[0,1,2],triangleMaterials:[i===5?3:i===10?5:0]}))};
describe("dormant native volcanic integration",()=>{
 it("retains deterministic geometry per recipe, bounds LRU residency and reduces distant work",()=>{
  const cache=createNativeVolcanicCache(kit),hero=cache.get(89,0);
  expect(cache.get(89,0)).toBe(hero);
  expect(hero.diagnostics!.buriedBaseMaxClearance).toBeLessThanOrEqual(-.01);
  expect(hero.diagnostics!.regionalGroupCount).toBeGreaterThanOrEqual(12);
  expect(hero.diagnostics!.regionalGroupCount).toBeLessThanOrEqual(20);
  expect(cache.get(89,1).triangles).toBeLessThan(hero.triangles);
  expect(cache.get(89,2).triangles).toBeLessThan(cache.get(89,1).triangles);
  expect(cache.get(90,0).batches[0].positions).not.toEqual(hero.batches[0].positions);
  for(let seed=0;seed<12;seed++)cache.get(seed,2);
  expect(cache.size).toBe(NATIVE_VOLCANIC_CACHE_LIMIT);cache.clear();expect(cache.size).toBe(0);
  expect(()=>cache.get(NaN,0)).toThrow();expect(()=>cache.get(1,0,2)).toThrow();
 });
 it("preserves hidden objects and freezes both emitter roles under reduced motion, then disposes resources",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),cache=createNativeVolcanicCache(kit),planet=createNativeVolcanicWorldPlanet(scene,"cinder",planetRecipe("volcanic",89),2,kit,cache,"volcanic-r006");
  const meshes=planet.root.getChildMeshes(),materials=[...scene.materials],textures=planet.emitters.map(mesh=>(mesh.material as PBRMaterial).emissiveTexture).filter(Boolean);
  planet.root.setEnabled(false);planet.root.setEnabled(true);expect(planet.root.getChildMeshes()).toEqual(meshes);expect(scene.materials).toEqual(materials);
  planet.updateWeather(10,false);const colors=planet.emitters.map(mesh=>(mesh.material as PBRMaterial).emissiveColor.asArray());
  planet.updateWeather(200,true);expect(planet.emitters.map(mesh=>(mesh.material as PBRMaterial).emissiveColor.asArray())).toEqual(colors);
  planet.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);for(const texture of textures)expect(scene.textures).not.toContain(texture);
  cache.clear();scene.dispose();engine.dispose();
 });
 it("preserves default smoke at near LOD and omits it only at distant LOD",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),cache=createNativeVolcanicCache(kit),recipe=planetRecipe("volcanic",89);
  const near=createNativeVolcanicWorldPlanet(scene,"near",recipe,0,kit,cache,"volcanic-r013");
  expect(near.smoke?.parent).toBe(near.root);expect(near.smoke!.getTotalIndices()).toBeGreaterThan(0);
  expect((near.smoke!.material as PBRMaterial).alpha).toBe(.48);
  expect((near.smoke!.material as PBRMaterial).disableDepthWrite).toBe(true);
  const far=createNativeVolcanicWorldPlanet(scene,"far",recipe,2,kit,cache,"volcanic-r013");expect(far.smoke).toBeUndefined();
  near.dispose();far.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);scene.dispose();engine.dispose();
 });
 it("keeps mixed vegetation/crystals/custom palettes on the complete existing renderer",()=>{
  const recipe=planetRecipe("volcanic",89);expect(canUseNativeVolcanic(recipe)).toBe(true);
  expect(canUseNativeVolcanic({...recipe,effects:{...planetEffects(recipe),vegetation:.2}})).toBe(false);
  expect(canUseNativeVolcanic({...recipe,palette:recipe.palette.map(()=>"000000")})).toBe(false);
  expect(canUseNativeVolcanic({...recipe,effects:{...planetEffects(recipe),smoke:.99}})).toBe(false);
  expect(canUseNativeVolcanic(planetRecipe("temperate",89))).toBe(false);
 });
});
