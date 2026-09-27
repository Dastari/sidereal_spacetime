import {referenceShadowRadius} from './reference_shadow_radius';
import {composeCrystalMoonReference as composePartitionedCrystalMoonReference} from './crystal_moon_reference_composition_r008';
import {composeCrystalMoonReference as composeNativeCrystalMoonReference} from './crystal_moon_reference_composition_r003';
import {composeToxicMoonReference} from './toxic_moon_reference_composition_r001';
import {composeCrystalMoonReference} from './crystal_moon_reference_composition_r002';
import {composeIceMoonReference} from './ice_moon_reference_composition_r004';
import {composeVolcanicMoonReference} from './volcanic_moon_reference_composition_r004';
import {composeHybridMoonReference} from './hybrid_moon_reference_composition_r001';
import {composeSolidMoonReference} from './solid_moon_reference_composition_r001';
import {buildReferenceVolcanicSmoke} from './reference_volcanic_smoke_build';
import {composeRockyMoonReference} from './rocky_moon_reference_composition_r001';
import {composeClearedToxicReferenceWeather} from './toxic_fog_reference_clearance';
import {composeTemperateReference} from './temperate_reference_composition_r003';
import {composeVolcanicReference} from './volcanic_reference_composition_r023';
import {composeGasReference} from './gas_reference_composition';
import {composeNativeClouds} from './native_cloud_composition_r002';
import {composeCrystalReference} from './crystal_reference_composition_r013';
import {composeToxicReference} from './toxic_reference_composition_r007';
import {composeOceanReference} from "./ocean_reference_composition_r007";
import {composeRockyReference} from "./rocky_reference_composition_r010";
import {composeDesertReference} from './planet_reference_composition';
import {composeIceReference} from './ice_reference_composition_r025';
let initialized:Promise<{kit:any;cloudKit:any}>|undefined;
self.onmessage=async event=>{
 const {type,id}=event.data;
 if(type==='initialize'){
  if(initialized){self.postMessage({id,error:'Reference worker already initialized'});return;}
  initialized=(async()=>{
   async function load(url:string){const response=await fetch(url);if(!response.ok)throw new Error(`Reference kit fetch ${response.status}`);return response.json();}
   const [kit,cloudKit]=await Promise.all([load(event.data.kitURL),event.data.cloudKitURL?load(event.data.cloudKitURL):undefined]);
   if(kit.schema!=='sidereal.native-planet-kit.v1'||(cloudKit&&cloudKit.schema!=='sidereal.native-planet-kit.v1'))throw new Error('Expected native reference kit');
   return{kit,cloudKit};
  })();
  void initialized.catch(error=>self.postMessage({id,error:String(error)}));return;
 }
 if(type!=='build'){self.postMessage({id,error:'Unknown reference worker request'});return;}

 try{
  if(!initialized)throw new Error('Reference worker not initialized');
  const {kit,cloudKit}=await initialized,{seed,lod,unit,recipe}=event.data,start=performance.now();
  const batches=kit.layout==='crystal-moon-native-body'?(kit.nativePartRanges?composePartitionedCrystalMoonReference(kit,seed,lod):composeNativeCrystalMoonReference(kit,seed,lod)):kit.layout==='toxic-moon-craters'?composeToxicMoonReference(kit,seed,lod):kit.layout==='crystal-moon-geology'?composeCrystalMoonReference(kit,seed,lod):kit.layout==='ice-moon-glacial'?composeIceMoonReference(kit,seed,lod):kit.layout==='volcanic-moon-craters'?composeVolcanicMoonReference(kit,seed,lod):kit.layout==='hybrid-moon-craters'?composeHybridMoonReference(kit,seed,lod):kit.layout==='solid-moon-craters'?composeSolidMoonReference(kit,seed,lod):kit.layout==='rocky-moon-craters'?composeRockyMoonReference(kit,seed,lod):kit.layout==='temperate-native-continents'?composeTemperateReference(kit,seed,lod):kit.layout==='volcanic-regional-geology'?composeVolcanicReference(kit,seed,lod,unit):kit.layout==='single-glacial-cut-diagnostic'?composeIceReference(kit,seed,lod,unit):kit.layout==='gas-bands-and-rings'?composeGasReference(kit):kit.layout==='crystal-geology'?composeCrystalReference(kit,seed,lod):kit.layout==='connected-toxic-crust'?composeToxicReference(kit,seed,lod):kit.layout==='ocean-island-geology'?composeOceanReference(kit,seed,lod):kit.layout==='rocky-crater-geology'?composeRockyReference(kit,seed,lod,unit):composeDesertReference(kit,seed,lod,unit);
  const nativeToxicFog=recipe?.style==='toxic'&&String(cloudKit?.layout)==='toxic-fog-banks';
  const clouds=!nativeToxicFog&&cloudKit&&recipe?.cloudCoverage>0?composeNativeClouds(cloudKit,seed,recipe.cloudCoverage)[0]:undefined;
  const weather=nativeToxicFog?composeClearedToxicReferenceWeather(cloudKit,seed,recipe.cloudCoverage,batches,[8]):clouds?{positions:Array.from(clouds.positions),normals:Array.from(clouds.normals),indices:Array.from(clouds.indices),colors:Array(clouds.positions.length/3).fill([1,1,1,1]).flat(),faces:clouds.indices.length/3,ranges:clouds.ranges}:undefined;
  const smoke=recipe?buildReferenceVolcanicSmoke(recipe,lod):undefined;
  self.postMessage({id,batches,shadowRadii:batches.map(b=>referenceShadowRadius(b.positions)),weatherShadowRadius:weather?referenceShadowRadius(weather.positions):undefined,weather,smoke,buildMs:performance.now()-start},{transfer:[...batches.flatMap(b=>[b.positions.buffer,b.normals.buffer,b.indices.buffer,...('uvs' in b&&b.uvs instanceof Float32Array?[b.uvs.buffer]:[])]),...(smoke?[smoke.positions.buffer,smoke.normals.buffer,smoke.colors.buffer,smoke.indices.buffer]:[])]});
 }catch(error){self.postMessage({id,error:String(error)});}
};
