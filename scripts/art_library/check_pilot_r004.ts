/** Review-only: actual sampled Blender proxies, meshChunk and placement validator. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {VoxelVolume,encodeVoxels,meshChunk} from '../../packages/sim/src/voxels';
import {placementError,validateAssembly,snapPlacement,type PartCatalog,type AssemblyVoxelLibrary} from '../../packages/content/src/assembly';
const out='.runtime/art-library/hull/r004', read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const components=read(`${out}/components.json`);
const catalog:PartCatalog={schema:'sidereal.part-catalog.v1',assets:[]};
const original:PartCatalog=read('assets/runtime/assembly/catalog.json');
const base:AssemblyVoxelLibrary=read('assets/runtime/assembly/catalog.voxels.json');
const library:AssemblyVoxelLibrary={...base,volumes:{}};const meshes=[];
for(const component of components){
 const samples=read(`${out}/${component.slug}/samples.json`),v=new VoxelVolume();
 for(const [x,y,z,m] of samples.cells)v.set(x,y,z,m);
 const chunks=[],faces=[];
 for(const chunk of v.chunks.values()){chunks.push({origin:[...chunk.origin],runs:encodeVoxels(chunk.cells)});faces.push(...meshChunk(v,chunk));}
 library.volumes[component.id]={cellMeters:samples.cellMeters,layers:[{chunks}]};
 meshes.push({component:component.slug,proxyCells:samples.cells.length,proxyTriangles:faces.length*2});
 catalog.assets.push({id:component.id,label:`Pilot ${component.slug} / r004`,category:component.category,nodes:[],bounds:component.bounds,thumbnail:`/assets/assembly/hull-review/${component.slug}/cutout.png`,visual:{url:`/assets/assembly/hull-review/${component.slug}/clean.glb`,sha256:createHash('sha256').update(readFileSync(`${out}/${component.slug}/clean.glb`)).digest('hex'),designId:'shipyard.hull.pilot-section',revision:4,bounds:component.bounds,damagePreview:'unsupported'}});
}
for(const id of ['part-c0b6b036f5b3dd8bd2f3','part-d9f37a5f7ea6e8d13254','part-75910d7a0d27dfc17aaf','part-0f14bf002f4c11854337']){catalog.assets.push(original.assets.find(a=>a.id===id)!);library.volumes[id]=base.volumes[id];}
writeFileSync(`${out}/catalog.json`,JSON.stringify(catalog));writeFileSync(`${out}/catalog.voxels.json`,JSON.stringify(library));
const document=validateAssembly(read(`${out}/wayfarer.json`),catalog);
const checks=document.parts.map(p=>({id:p.id,error:placementError(p,document,catalog,library)??null}));
const diagonal=document.parts.find(p=>p.id.includes('hull-diagonal45'))!;
const duplicate={...diagonal,id:'duplicate-test'};
const rejection=placementError(duplicate,document,catalog,library);
const invalidRotation=placementError({...diagonal,rotation:Math.PI/4},document,catalog,library);
const rotations=[0,1,2,3].flatMap(turn=>[false,true].map(flipped=>({turn,flipped,error:placementError({...diagonal,position:[30,30,0],rotation:turn*Math.PI/2,flipped},document,catalog,library)??null})));
const snapped=snapPlacement({...diagonal,position:[20.021,20.043,.2]});
const report={pipeline:'Blender closed opaque proxy → voxelize_blender 1/16 m → VoxelVolume → meshChunk → actual placementError. Native textured/glazed GLBs remain visual.',checks,duplicateRejected:!!rejection,arbitrary45RotationRejected:!!invalidRotation,quarterTurnsAndMirrors:rotations,snap:{input:[20.021,20.043,.2],actual:snapped.position},meshes,authorityChanged:false,published:false};
writeFileSync(`${out}/placement-validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(checks.some(c=>c.error)||rotations.some(c=>c.error)||!rejection||!invalidRotation)process.exitCode=1;
