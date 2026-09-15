import {expect,test,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {createReviewedPlanetRuntime} from './runtime';
import type {ReviewedNativePlanetDescriptor} from '../reviewed-native-planet-catalog';
import type {ReviewedBuildResult} from './build-reviewed-planet';
import {planetRecipe} from '../../../../content/src/environment';
const descriptor={id:'gas-r005',revision:'gas-r005',style:'gas',layout:'gas-bands-and-rings',textureBaseURL:'/assets/planets/gas-r005/',fixedDetail:false,localLight:false} as ReviewedNativePlanetDescriptor;
const header={schema:'sidereal.native-planet-kit.v1' as const,layout:'gas-bands-and-rings' as const,materials:[{name:'native',linearColor:[.1,.2,.3],roughness:.84,clearcoatFactor:.4}] as const};
const result:ReviewedBuildResult={buildMs:1,shadowRadii:[1],batches:[{positions:new Float32Array([1,0,0,0,1,0,0,0,1]),normals:new Float32Array([1,0,0,0,1,0,0,0,1]),uvs:new Float32Array([0,0,1,0,0,1]),indices:new Uint32Array([0,1,2]),ranges:[{partId:'body-patch',firstTriangle:0,triangleCount:1}]}],weather:undefined,smoke:undefined,weatherShadowRadius:undefined};
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){const engine=new NullEngine(),scene=new Scene(engine),worker={registerReviewed:vi.fn(async()=>({assetKey:'shared-asset',header})),buildReviewed:vi.fn(async()=>result),releaseReviewed:vi.fn(async()=>{}),nextFrame:vi.fn(async()=>{})};return{engine,scene,worker};}
test('shares authored material across retained levels and swaps only after preparation at update boundary',async()=>{
 const f=fixture();let ready!:()=>void;const prepared: string[]=[];
 const runtime=await createReviewedPlanetRuntime(f.scene,{bodyId:'editor-7',descriptor,recipe:planetRecipe('gas',38),worker:f.worker,prepareMaterial:async mesh=>{prepared.push(mesh.metadata.trianglePlacementRanges[0].partId);if(mesh.parent!.metadata.lod===0)await new Promise<void>(r=>{ready=r;});}});
 try{runtime.update(20);await flush();runtime.update(20);expect(runtime.stats().active).toBe(2);const far=runtime.root.getChildMeshes()[0],material=far.material;
 runtime.update(200);await flush();expect(runtime.stats().active).toBe(2);expect(far.isEnabled()).toBe(true);const near=runtime.root.getChildMeshes().find(m=>m.parent!.metadata.lod===0)!;expect(near.isEnabled()).toBe(false);expect(near.material).toBe(material);expect(prepared).toEqual(['editor-7:38:body-patch','editor-7:38:body-patch']);
 ready();await flush();expect(runtime.stats().active).toBe(2);runtime.update(200);expect(runtime.stats().active).toBe(0);expect(far.isEnabled()).toBe(false);runtime.update(20);expect(runtime.stats().active).toBe(2);expect(f.worker.buildReviewed).toHaveBeenCalledTimes(2);
 runtime.dispose();expect(f.worker.releaseReviewed).toHaveBeenCalledExactlyOnceWith('shared-asset');expect(f.scene.meshes).toHaveLength(0);expect(f.scene.materials).toHaveLength(0);
 }finally{runtime.dispose();f.scene.dispose();f.engine.dispose();}
});
test('abort rejects pending level publication and releases lease before stale build completion',async()=>{
 const f=fixture(),controller=new AbortController();let complete!:(value:ReviewedBuildResult)=>void;f.worker.buildReviewed.mockImplementationOnce(()=>new Promise(r=>{complete=r;}));const runtime=await createReviewedPlanetRuntime(f.scene,{bodyId:'old-selection',descriptor,recipe:planetRecipe('gas',38),worker:f.worker,signal:controller.signal,prepareMaterial:async()=>{}});
 runtime.update(20);controller.abort();complete(result);await flush();expect(runtime.root.isDisposed()).toBe(true);expect(f.scene.meshes).toHaveLength(0);expect(f.worker.releaseReviewed).toHaveBeenCalledTimes(1);f.scene.dispose();f.engine.dispose();
});
test('scene disposal releases body registration and all fixed-detail resources exactly once',async()=>{
 const f=fixture(),runtime=await createReviewedPlanetRuntime(f.scene,{bodyId:'scene-owned',descriptor:{...descriptor,fixedDetail:true},recipe:planetRecipe('gas',38),worker:f.worker,prepareMaterial:async()=>{}});runtime.update(20);await flush();runtime.update(20);runtime.update(300);await flush();expect(f.worker.buildReviewed).toHaveBeenCalledTimes(1);f.scene.dispose();runtime.dispose();expect(f.worker.releaseReviewed).toHaveBeenCalledTimes(1);expect(runtime.root.isDisposed()).toBe(true);f.engine.dispose();
});
