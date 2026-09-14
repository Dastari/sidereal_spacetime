import {referenceDirectPaths} from './planet_reference_direct_paths';
import {createReferenceLODRecorder} from './planet_reference_lod_recorder';
import '@babylonjs/core/Culling/ray';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import {GlowLayer} from '@babylonjs/core/Layers/glowLayer';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {createGlowOccluders} from '../../packages/render/src/glow-occluders';
import {createPlanetAtmosphere} from '../../packages/render/src/environment/planet-atmosphere';
import {createPlanetShadows} from "../../packages/render/src/environment/planet-shadows";
import {createReferenceCandidate} from "./planet_reference_candidate";
import "@babylonjs/loaders/glTF";
/** Isolated visual evidence only. No app imports, network intent or authority writes. */
import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {HDRCubeTexture} from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import {createSpaceEnvironment} from '../../packages/render/src/environment';
import {planetRecipe,planetEffects,type PlanetStyle} from '../../packages/content/src/environment';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
const query=new URLSearchParams(location.search),style=(query.get('style')??'desert') as PlanetStyle,seed=Number(query.get('seed')??38);
const canvas=document.querySelector('canvas')!,engine=new Engine(canvas,true,{preserveDrawingBuffer:true}),scene=new Scene(engine);
scene.shadowsEnabled=!query.has('shadowsOff');scene.useRightHandedSystem=true;scene.clearColor=new Color4(.012,.016,.035,1);
scene.environmentTexture=new HDRCubeTexture(referenceDirectPaths(query).hdr,scene,128,false,true,false,true);scene.environmentIntensity=.28;
const camera=new ArcRotateCamera('review',Math.atan2(4.3,2.45),Math.acos(2.1/Math.hypot(2.45,4.3,2.1)),4.7,Vector3.Zero(),scene);camera.fov=.52;camera.minZ=.01;camera.maxZ=10000;camera.attachControl(canvas,true);
const sun=new DirectionalLight('review-sun',new Vector3(-.6,-1,.45),scene);sun.intensity=2.1;sun.diffuse=new Color3(.93,.95,1);sun.position.set(3,5,-2.25);
const fill=new HemisphericLight('review-fill',Vector3.Up(),scene);fill.intensity=.2;fill.diffuse=new Color3(.6,.72,1);fill.groundColor=new Color3(.025,.02,.06);
const environment=query.has('candidate')?undefined:createSpaceEnvironment(scene);environment?.setPrimaryLight(sun);await environment?.ready;
const body={id:'reference-review',kind:'planet' as const,appearance:style,seed,x:0,y:0,vx:0,vy:0,heading:0,omega:0,height:0,radius:1,recipe:planetRecipe(style,seed)};
const candidateShadows=createPlanetShadows(scene);candidateShadows.setPrimaryLight(sun);
const candidate=query.has("candidate")?await createReferenceCandidate(scene,seed):undefined;
if(candidate){const colors={temperate:'#86cfff',ocean:'#86cfff',desert:'#f5aa62',rock:'#a5a2c6',ice:'#64d6ff',volcanic:'#ff7429',toxic:'#b8e943',gas:'#a677ff',crystal:'#da65ff',moon:'#a5a2c6'};const shell=createPlanetAtmosphere(scene,'reference',1,Color3.FromHexString(colors[style]),planetEffects(body.recipe).atmosphere);shell.mesh.parent=candidate.root;}
const candidateGlow=new GlowLayer('reference-deposit-glow',scene,{blurKernelSize:24,mainTextureRatio:.25,excludeByDefault:true});candidateGlow.intensity=.45;candidateGlow.isEnabled=query.has('glow');const candidateOccluders=createGlowOccluders(candidateGlow);
const lodRecorder=createReferenceLODRecorder(scene,engine,camera,()=>candidate);
let frames=0;engine.runRenderLoop(()=>{
 lodRecorder.beforeFrame();
 environment?.update({id:'orion-veil',x:0,y:0,dt:1/60,enabled:true,reducedMotion:true,bodies:[body]});
 const baseline=scene.getTransformNodeByName('world-body-reference-review');if(candidate){baseline?.setEnabled(false);candidate.update(engine.getRenderHeight()/(camera.radius*2*Math.tan(camera.fov/2)));}
 const root=candidate?.root??baseline;
 for(const mesh of scene.meshes)if(!root||!mesh.isDescendantOf(root))mesh.setEnabled(false);
 if(candidate)candidateShadows.update([{node:candidate.root,radius:1,lod:candidate.stats().requestedLOD??2}]);
 if(candidate&&candidateGlow.isEnabled){const visible=candidate.root.getChildMeshes().filter(m=>m.isEnabled()),emitters=visible.filter(m=>m.material instanceof PBRMaterial&&m.material.emissiveColor.r+m.material.emissiveColor.g+m.material.emissiveColor.b>0);candidateOccluders.set(visible.filter(m=>!emitters.includes(m)));for(const mesh of emitters)if(mesh instanceof Mesh)candidateGlow.addIncludedOnlyMesh(mesh);}
 const diagnosticBias=Number(query.get('shadowBias'));if(query.has('shadowBias')&&Number.isFinite(diagnosticBias)&&diagnosticBias>=0)for(const light of scene.lights){const generator=light.getShadowGenerator() as ShadowGenerator|null;if(generator)generator.normalBias=diagnosticBias;}
 scene.render();frames++;lodRecorder.afterFrame();
});
Object.assign(window,{planetReview:{scene,engine,camera,body,candidateGlow,lodRecorder,stats:()=>({style,seed,frames,candidate:candidate?.stats(),baselineEnvironmentEnabled:Boolean(environment),build:environment?.planetBuildSnapshot(),meshes:scene.getActiveMeshes().length,triangles:scene.getActiveIndices()/3,renderer:engine.getGlInfo(),lods:scene.transformNodes.filter(n=>n.metadata?.layeredPlanet||n.metadata?.nativePlanet).map(n=>({name:n.name,...n.metadata,enabled:n.isEnabled()}))})}});
