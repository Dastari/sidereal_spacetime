import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {createPlanetLODCache} from '../../packages/render/src/environment/planet-lod-cache';
import {planetRecipe,type PlanetStyle} from '../../packages/content/src/environment';
import {referenceFixedDetail} from './planet_reference_worker_lifetime';

/** Exact pending revisions: test the real worker dispatch, including weather and
 * smoke, rather than a second approximation of its composition functions. */
export const fullOutputCandidates = [
 ['rocky-r010','rock'],['toxic-r007','toxic'],['crystal-r013','crystal'],
 ['rocky-moon-r002','moon'],['rocky-moon-2-r001','moon'],
 ['desert-moon-1-r001','moon'],['desert-moon-2-r001','moon'],['gas-giant-moon-2-r001','moon'],
 ['ocean-moon-1-r001','moon'],['ocean-moon-2-r002','moon'],
 ['temperate-moon-1-r002','moon'],['temperate-moon-2-r002','moon'],
 ['toxic-moon-1-r001','moon'],['toxic-moon-2-r001','moon'],
] as const;
const root=resolve('output/playwright/planet-reference-20260914');
function digest(value:unknown):string {
 const hash=createHash('sha256');
 function visit(v:unknown):void {
  if(ArrayBuffer.isView(v)){hash.update(v.constructor.name);hash.update(Buffer.from(v.buffer,v.byteOffset,v.byteLength));return;}
  if(Array.isArray(v)){hash.update('[');for(const item of v)visit(item);hash.update(']');return;}
  if(v&&typeof v==='object'){hash.update('{');for(const key of Object.keys(v).sort()){hash.update(key);visit((v as Record<string,unknown>)[key]);}hash.update('}');return;}
  hash.update(JSON.stringify(v)??'undefined');
 }
 visit(value);return hash.digest('hex');
}
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
for(const[revision,style]of fullOutputCandidates){
 it(`${revision} real worker full output is invariant at every LOD for three seeds`,async()=>{
  const kit=JSON.parse(readFileSync(resolve(root,revision,'kit.json'),'utf8'));
  const cloud=style==='toxic'?JSON.parse(readFileSync(resolve(root,'toxic-fog-r005/kit.json'),'utf8')):undefined;
  let answer:Record<string,unknown>|undefined;
  const worker={onmessage:undefined as undefined|((event:{data:unknown})=>Promise<void>),postMessage(value:Record<string,unknown>){answer=value;}};
  vi.stubGlobal('self',worker);
  vi.stubGlobal('fetch',async(url:string)=>({ok:true,json:async()=>url==='selected-kit'?kit:cloud}));
  await import('./planet_reference_worker');
  await worker.onmessage!({data:{type:'initialize',id:0,kitURL:'selected-kit',cloudKitURL:cloud?'selected-weather':undefined}});
  for(const seed of[38,117,904]){
   let expected:string|undefined;
   for(const lod of[0,1,2]){
    answer=undefined;
    await worker.onmessage!({data:{type:'build',id:1,seed,lod,unit:false,recipe:planetRecipe(style as PlanetStyle,seed)}});
    expect(answer).toBeDefined();
    const result=answer as Record<string,unknown>|undefined;
    expect(result?.error).toBeUndefined();
    const {id,buildMs,...rendered}=result!;
    expect(id).toBe(1);expect(Number.isFinite(buildMs)).toBe(true);
    expect(rendered.smoke).toBeUndefined();
    if(style==='toxic')expect((rendered.weather as {indices:number[]}).indices.length).toBeGreaterThan(0);
    else expect(rendered.weather).toBeUndefined();
    const actual=digest(rendered);if(expected===undefined)expected=actual;else expect(actual).toBe(expected);
    answer=undefined;
   }
  }
  expect(referenceFixedDetail(kit.layout,revision)).toBe(true);
  expect(referenceFixedDetail(kit.layout,revision.replace(/r\d+$/,'r999'))).toBe(false);
  expect(referenceFixedDetail(kit.layout,null)).toBe(false);
 },180000);
}
it('each newly qualified revision retains one NullEngine node across approach, retreat and abrupt Observe',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{for(const[revision]of fullOutputCandidates){
  const kit=JSON.parse(readFileSync(resolve(root,revision,'kit.json'),'utf8'));const builds:number[]=[];
  const cache=createPlanetLODCache(async lod=>{builds.push(lod);const root=new TransformNode(revision,scene);root.setEnabled(false);return{root};},value=>value.root.dispose());
  for(const[requested,size]of[[2,20],[1,90],[0,500],[2,20],[0,800]]as const){
   cache.update(referenceFixedDetail(kit.layout,revision)?0:requested,size);
   for(let i=0;i<8;i++)await Promise.resolve();
   cache.update(referenceFixedDetail(kit.layout,revision)?0:requested,size);
   expect(cache.snapshot().active).toBe(0);expect(cache.snapshot().retained).toEqual([0]);
  }
  expect(builds).toEqual([0]);cache.dispose();expect(scene.transformNodes).toHaveLength(0);
 }}finally{scene.dispose();engine.dispose();}
});
