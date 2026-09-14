/** Downstream Blender sample meshing only: no TS equipment shape authoring. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {VoxelVolume,meshChunk,encodeVoxels} from '../../packages/sim/src/voxels';
type Job={design_id:string;output:string;slug:string;variants:{asset_id:string;name:string;bounds_m:{min:number[];max:number[]}}[]};
const jobs:Job[]=JSON.parse(readFileSync(process.argv[2],'utf8'));
const review=resolve('.runtime/art-library/equipment');
const safe=(p:string)=>{const r=relative(review,resolve(p));if(r.startsWith('..'+sep)||r==='..'||resolve(p)===review)throw Error('Output must be inside isolated review');return p;};
for(const job of jobs){
 const out=safe(job.output),data=JSON.parse(readFileSync(`${out}/samples.json`,'utf8'));
 for(const variant of job.variants){
  const path=safe(`${out}/${variant.name}`);mkdirSync(path,{recursive:true});
  if(existsSync(`${path}/mesh.json`))throw Error('Immutable review mesh exists');
  const volume=new VoxelVolume();
  const offsetX=Math.round((variant.bounds_m.min[0]+variant.bounds_m.max[0])/2/data.cellMeters);
  // Handed service face; cell reflection uses -x-1 to preserve occupied intervals.
  for(const [x,y,z,m] of data.cells)volume.set((variant.name==='starboard'?-x-1:x)+offsetX,y,z,m);
  const vertices:number[][]=[],faces:number[][]=[],materials:number[]=[],chunks=[];
  for(const chunk of volume.chunks.values()){
   chunks.push({origin:chunk.origin,runs:encodeVoxels(chunk.cells)});
   for(const face of meshChunk(volume,chunk)){
    const offset=vertices.length;vertices.push(...face.corners.map(p=>p.map(n=>n*data.cellMeters)));
    faces.push([offset,offset+1,offset+2,offset+3]);materials.push(face.material);
   }
  }
  const min=[0,1,2].map(i=>data.cells.reduce((n:number,p:number[])=>Math.min(n,p[i]),Infinity)*data.cellMeters);
  const max=[0,1,2].map(i=>(data.cells.reduce((n:number,p:number[])=>Math.max(n,p[i]),-Infinity)+1)*data.cellMeters);
  if(variant.name==='starboard'){const old=min[0];min[0]=-max[0];max[0]=-old;}
  min[0]+=offsetX*data.cellMeters;max[0]+=offsetX*data.cellMeters;
  writeFileSync(`${path}/mesh.json`,JSON.stringify({id:variant.asset_id,vertices,faces,materials,palette:data.palette,cellMeters:data.cellMeters,bounds:{min,max}}));
  writeFileSync(`${path}/voxels.json`,JSON.stringify({cellMeters:data.cellMeters,palette:data.palette,layers:[{chunks}]}));
  console.log({design:job.design_id,variant:variant.name,cells:data.cells.length,triangles:faces.length*2,bounds:{min,max}});
 }
}
