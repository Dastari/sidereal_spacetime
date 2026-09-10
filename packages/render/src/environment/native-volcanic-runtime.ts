import {createPlanetSmoke} from "./planet-smoke";
import type {Scene} from "@babylonjs/core/scene";
import type {ShaderMaterial} from "@babylonjs/core/Materials/shaderMaterial";
import type {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {planetEffects,planetRecipe,PLANET_PALETTES,type PlanetRecipe} from "../../../content/src/environment";
import type {PlanetLOD} from "./layered-planet";
import {composeNativePlanet,type NativePlanetKit,type NativePlanetComposition} from "./native-planet-composition";
import {composeNativeVolcanic} from "./native-volcanic-composition";
import {createNativeVolcanicPlanet} from "./native-volcanic-planet";

/** Root-reviewed local candidate; final owner art approval remains open. */
export const NATIVE_VOLCANIC_REVISION="volcanic-r018";
export const loadNativeVolcanicKit=createNativeVolcanicKitLoader(NATIVE_VOLCANIC_REVISION);
export const NATIVE_VOLCANIC_CACHE_LIMIT=6;
export function createNativeVolcanicKitLoader(revision:string){
 if(!/^volcanic-r\d{3}$/.test(revision))throw new Error("Invalid native volcanic revision");
 let pending:Promise<NativePlanetKit>|undefined;
 return ()=>pending??=(async()=>{
  const response=await fetch(`/assets/planets/${revision}/kit.json`);
  if(!response.ok)throw new Error(`Native volcanic kit HTTP${response.status}`);
  const kit=await response.json() as NativePlanetKit;
  if(kit.layout!=="volcanic-geology")throw new Error("Unsupported native volcanic layout");
  composeNativePlanet(kit,0,.55,.55);
  return kit;
 })().catch(error=>{pending=undefined;throw error;});
}
export function canUseNativeVolcanic(recipe:PlanetRecipe){
 const effects=planetEffects(recipe),defaults=planetEffects(planetRecipe("volcanic",recipe.seed));
 return recipe.style==="volcanic"&&recipe.cloudCoverage===0&&effects.vegetation===0&&effects.crystalCoverage===0&&effects.volcanicCoverage===defaults.volcanicCoverage&&effects.smoke===defaults.smoke&&JSON.stringify(recipe.palette)===JSON.stringify(PLANET_PALETTES.volcanic);
}
export function createNativeVolcanicCache(kit:NativePlanetKit){
 const entries=new Map<string,NativePlanetComposition>();
 return {
  get(seed:number,lod:PlanetLOD,coverage=.55,relief=.55){
   if(!Number.isInteger(seed)||seed<0||seed>4294967295||![0,1,2].includes(lod)||!Number.isFinite(coverage)||coverage<0||coverage>1||!Number.isFinite(relief)||relief<0||relief>1)throw new Error("Invalid native volcanic cache recipe");
   const key=JSON.stringify([seed,lod,coverage,relief]);let value=entries.get(key);
   if(value){entries.delete(key);entries.set(key,value);return value;}
   value=composeNativeVolcanic(kit,seed,coverage,([20,12,8] as const)[lod],relief);entries.set(key,value);
   while(entries.size>NATIVE_VOLCANIC_CACHE_LIMIT)entries.delete(entries.keys().next().value!);
   return value;
  },
  get size(){return entries.size;},clear(){entries.clear();},
 };
}
export function createNativeVolcanicWorldPlanet(scene:Scene,name:string,recipe:PlanetRecipe,lod:PlanetLOD,kit:NativePlanetKit,cache:ReturnType<typeof createNativeVolcanicCache>,revision:string){
 const nativeLod=Math.max(lod,recipe.resolution<48?2:recipe.resolution<64?1:0) as PlanetLOD;
 const coverage=Math.max(0,Math.min(1,.55+(recipe.terrain-.65)*.2));
 const geometry=cache.get(recipe.seed,nativeLod,coverage,recipe.mountains);
 const planet=createNativeVolcanicPlanet(scene,name,kit,recipe.seed,recipe.emission,{geometry,revision});
 const smoke=createPlanetSmoke(scene,name,recipe,nativeLod); if(smoke)smoke.parent=planet.root;
 planet.root.metadata={ role: "planet",...planet.root.metadata,lod:nativeLod,actualCells:geometry.diagnostics?.actualCells,artApproval:"unapproved draft",smokeImplemented:true};
 return {...planet,clouds:undefined as TransformNode|undefined,smoke,animatedMaterials:[] as ShaderMaterial[],updateWeather(age:number,reducedMotion:boolean){planet.update(age,reducedMotion);return undefined as TransformNode|undefined;}};
}
