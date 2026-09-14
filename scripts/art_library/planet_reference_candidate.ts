import {createReferenceWorkerLifetime,createReferenceUploadLifetime,referenceFixedDetail} from './planet_reference_worker_lifetime';
import {referenceDirectPaths,referenceAssetPath} from './planet_reference_direct_paths';
import {referenceVolcanicSmokeRuntime} from './reference_volcanic_smoke_runtime';
import type {PackedPlanetGeometry} from '../../packages/render/src/environment/planet-build';
import {createToxicReferenceWeatherMaterial} from './toxic_fog_reference_material';
import {createPlanetReferenceLocalLights,CRYSTAL_REFERENCE_HERO_IDS} from './planet_reference_local_lights';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {ReferenceMaterialRole} from './planet_reference_materials';
import {referenceMaterial} from './planet_reference_materials';
import {acquireReferenceTransmission} from './planet_reference_transmission';
import {planetRecipe,type PlanetStyle} from '../../packages/content/src/environment';
import type {PlanetCloudGeometry} from '../../packages/render/src/environment/planet-clouds';
import {Material} from "@babylonjs/core/Materials/material";
import type {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {createPlanetLODCache} from '../../packages/render/src/environment/planet-lod-cache';
import {planetLOD} from '../../packages/render/src/environment/layered-planet';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
import type {composeDesertReference} from './planet_reference_composition';
export async function createReferenceCandidate(scene:Scene,seed:number){
 const paths=referenceDirectPaths(new URLSearchParams(location.search));
 const kit=await (await fetch(paths.kit)).json() as NativePlanetKit;
 const recipe=planetRecipe((new URLSearchParams(location.search).get('style')??'desert') as PlanetStyle,seed);
 const cloudKit=recipe.cloudCoverage>0?await (await fetch(paths.weatherKit)).json() as NativePlanetKit:undefined;
 const smokeRuntime=referenceVolcanicSmokeRuntime(scene,'reference-review',recipe);
 const root=new TransformNode('native-reference',scene);root.metadata={role:'planet',seed};
 const materials=kit.materials.map(role=>referenceMaterial(scene,role));
 const texturePromises=new Map<string,Promise<Texture>>();
 async function loadTexture(file:string,role:ReferenceMaterialRole,linear:boolean,alpha=false,prefix=paths.kitAssets){
  const resolvedPrefix=prefix==='/planet-reference-weather-assets/'?paths.weatherAssets:prefix;
  const path=referenceAssetPath(resolvedPrefix,file),key=path+':'+String(role.invertY??false)+':'+linear+':'+alpha;let pending=texturePromises.get(key);
  if(!pending){pending=new Promise<Texture>((resolve,reject)=>{const texture=new Texture(path,scene,false,role.invertY??false,Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(texture),message=>reject(new Error(message)));texture.gammaSpace=!linear;texture.hasAlpha=alpha;});texturePromises.set(key,pending);}return pending;
 }
 await Promise.all(materials.map(async(material,index)=>{const role=kit.materials[index] as ReferenceMaterialRole;
  if(role.baseColorTexture)material.albedoTexture=await loadTexture(role.baseColorTexture,role,role.textureColorSpace==='linear',role.useTextureAlpha??(role.alphaMode==='BLEND'||role.alphaMode==='MASK'));
  if(role.normalTexture){material.bumpTexture=await loadTexture(role.normalTexture,role,true);material.bumpTexture.level=role.normalScale??1;material.invertNormalMapX=!scene.useRightHandedSystem;material.invertNormalMapY=scene.useRightHandedSystem;}
  if(role.emissiveTexture)material.emissiveTexture=await loadTexture(role.emissiveTexture,role,false);
  if(role.clearcoatNormalTexture){material.clearCoat.bumpTexture=await loadTexture(role.clearcoatNormalTexture,role,true);material.invertNormalMapX=!scene.useRightHandedSystem;material.invertNormalMapY=scene.useRightHandedSystem;}
  if(role.metallicRoughnessTexture){material.metallicTexture=await loadTexture(role.metallicRoughnessTexture,role,true);material.useRoughnessFromMetallicTextureGreen=true;material.useRoughnessFromMetallicTextureAlpha=false;material.useMetallnessFromMetallicTextureBlue=true;}
 }));
 const nativeToxicFog=recipe.style==='toxic'&&String(cloudKit?.layout)==='toxic-fog-banks';
 const weatherMaterial=nativeToxicFog?await createToxicReferenceWeatherMaterial(scene,cloudKit!.materials[0] as ReferenceMaterialRole,loadTexture):(()=>{
 const weatherMaterial=new PBRMaterial('reference-weather',scene);weatherMaterial.roughness=cloudKit?.materials[0].roughness??.95;if(cloudKit)weatherMaterial.albedoColor=Color3.FromArray(cloudKit.materials[0].linearColor);if(recipe.style==='toxic')weatherMaterial.albedoColor.multiplyInPlace(new Color3(.62,.85,.18));weatherMaterial.metallic=0;weatherMaterial.directIntensity=2.4;weatherMaterial.subSurface.isTranslucencyEnabled=true;weatherMaterial.subSurface.translucencyIntensity=.35;weatherMaterial.subSurface.maximumThickness=.08;
 return weatherMaterial;})();
 const fixedDetail=referenceFixedDetail(String(kit.layout),new URLSearchParams(location.search).get('kit')??new URLSearchParams(location.search).get('reviewRevision'));
 const transmission=acquireReferenceTransmission(scene,materials);
 let previous:0|1|2|undefined,buildMs=0;let localLights:ReturnType<typeof createPlanetReferenceLocalLights>|undefined;
 const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
 const uploadLifetime=createReferenceUploadLifetime();
 const workerClient=createReferenceWorkerLifetime<{batches:ReturnType<typeof composeDesertReference>;buildMs:number;smoke?:PackedPlanetGeometry;weather?:PlanetCloudGeometry & {uvs?:number[];ranges?:{firstTriangle:number;triangleCount:number;partId:string}[]}}>(new Worker(new URL('./planet_reference_worker.ts',import.meta.url),{type:'module'}),{kitURL:new URL(paths.kit,location.href).href,cloudKitURL:cloudKit?new URL(paths.weatherKit,location.href).href:undefined});
 const cache=createPlanetLODCache(async lod=>{
  uploadLifetime.check();
  const result=await workerClient.request({seed,lod,recipe,unit:new URLSearchParams(location.search).has('unit')});
  uploadLifetime.check();
  buildMs=result.buildMs;
  if(!localLights&&recipe.style==='crystal'&&new URLSearchParams(location.search).has('localLight'))localLights=createPlanetReferenceLocalLights({scene,bodyId:'reference-review',bodyRoot:root,meshes:[],batches:result.batches,emitters:CRYSTAL_REFERENCE_HERO_IDS.map(partId=>({partId,color:[1,.035,.42],range:.65,intensity:.08,heightFraction:.12,radialOffset:.055}))});
  const node=new TransformNode(`native-desert-lod-${lod}`,scene);node.parent=root;node.metadata={role:'planet',lod};node.setEnabled(false);
  return uploadLifetime.build(node,async()=>{
  for(const [index,batch] of result.batches.entries()){
   if(!batch.indices.length)continue;await uploadLifetime.yieldFrame(nextFrame);
   const mesh=new Mesh('native-'+kit.materials[index].name,scene),data=new VertexData();data.positions=batch.positions;data.normals=batch.normals;data.indices=batch.indices;if('uvs' in batch)data.uvs=batch.uvs as Float32Array;data.applyToMesh(mesh);mesh.sideOrientation=Material.CounterClockWiseSideOrientation;mesh.material=materials[index];mesh.parent=node;mesh.isPickable=false;mesh.receiveShadows=true;mesh.metadata={role:'planet',style:recipe.style,trianglePlacementRanges:batch.ranges.map(r=>({...r,partId:`reference-review:${seed}:${r.partId}`}))};
   localLights?.replaceMeshes(root.getChildMeshes().filter(m=>m.material instanceof PBRMaterial&&!m.metadata?.planetWeather));
   await uploadLifetime.yieldFrame(nextFrame);await uploadLifetime.wait(mesh.material.forceCompilationAsync(mesh));
  }
  if(result.weather?.indices.length){
   await uploadLifetime.yieldFrame(nextFrame);const mesh=new Mesh('reference-weather',scene),data=new VertexData();Object.assign(data,result.weather);data.applyToMesh(mesh);mesh.sideOrientation=Material.CounterClockWiseSideOrientation;mesh.material=weatherMaterial;mesh.parent=node;mesh.isPickable=false;mesh.metadata={role:'planet',style:recipe.style,planetWeather:true,trianglePlacementRanges:(result.weather.ranges??[{firstTriangle:0,triangleCount:result.weather.indices.length/3,partId:"weather"}]).map(r=>({...r,partId:`reference-review:${seed}:${r.partId}`}))};await uploadLifetime.yieldFrame(nextFrame);await uploadLifetime.wait(weatherMaterial.forceCompilationAsync(mesh));
  }
  if(result.smoke){await uploadLifetime.yieldFrame(nextFrame);const smoke=smokeRuntime.attach(node,lod,result.smoke);if(smoke){await uploadLifetime.yieldFrame(nextFrame);await uploadLifetime.wait(smoke.material!.forceCompilationAsync(smoke));}}
  }).then(root=>({root}));
 },v=>v.root.dispose(false,false));
 return {root,update(projected:number){if(uploadLifetime.isDisposed())return;previous=planetLOD(projected,previous);cache.update(fixedDetail?0:previous,projected);},stats:()=>({...cache.snapshot(),...smokeRuntime.stats(),requestedLOD:previous,fixedDetail,workerPending:workerClient.stats().pending,buildMs,localLights:localLights?.lights.length??0,transmissionMaterials:materials.filter(m=>m.subSurface.isRefractionEnabled).length,transmissionTargets:transmission.target?1:0}),dispose(){workerClient.dispose();uploadLifetime.dispose();smokeRuntime.dispose();localLights?.dispose();cache.dispose();root.dispose(false,false);transmission.dispose();materials.forEach(m=>m.dispose());weatherMaterial.dispose();for(const pending of texturePromises.values())void pending.then(texture=>texture.dispose());}};
}
