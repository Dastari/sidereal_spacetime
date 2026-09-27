/** Isolated review meshing using the active game's material-bearing voxel rules. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { VoxelVolume, meshChunk, encodeVoxels } from "../../packages/sim/src/voxels";
const jobs = JSON.parse(readFileSync(process.argv[2], "utf8")) as {output:string;design_id:string;variant:string;sampled_from:string}[];
const review=".runtime/art-library/assembly-review";
mkdirSync(review,{recursive:true});
const assets:unknown[]=[],parts:unknown[]=[],volumes:Record<string,unknown>={};
for(const [index,job] of jobs.entries()){
  const data=JSON.parse(readFileSync(`${job.sampled_from}/samples.json`,"utf8"));
  const volume=new VoxelVolume();
  for(const [x,y,z,material] of data.cells)volume.set(x,y,z,material);
  const vertices:number[][]=[],faces:number[][]=[],materials:number[]=[],chunks=[];
  for(const chunk of volume.chunks.values()){
    chunks.push({origin:chunk.origin,runs:encodeVoxels(chunk.cells)});
    for(const face of meshChunk(volume,chunk)){
      const start=vertices.length;
      vertices.push(...face.corners.map(p=>p.map(n=>n*data.cellMeters)));
      faces.push([start,start+1,start+2,start+3]);materials.push(face.material);
    }
  }
  const id="part-"+createHash("sha256").update(job.design_id+JSON.stringify(data.cells)).digest("hex").slice(0,20);
  const bounds=JSON.parse(readFileSync(`${job.sampled_from}/validation.json`,"utf8")).bounds_m;
  mkdirSync(job.output,{recursive:true});
  writeFileSync(`${job.output}/mesh.json`,JSON.stringify({id,vertices,faces,materials,palette:data.palette,cellMeters:data.cellMeters}));
  writeFileSync(`${job.output}/voxels.json`,JSON.stringify({schema:"sidereal.art-review-voxels.v1",cellMeters:data.cellMeters,palette:data.palette,chunkSize:32,chunks}));
  assets.push({id,label:job.design_id,category:job.variant==="floor"?"floor":job.variant==="roof"?"roof":job.variant==="wall"||job.variant==="corner"?"wall":"superstructure",nodes:[`GEO-${id}--voxel`],bounds:{min:bounds.min,max:bounds.max}});
  parts.push({id:`review-placement-${index+1}`,assetId:id,position:[(index%3-1)*4,Math.floor(index/3)*4,0],rotation:0,flipped:false,removedCells:[]});
  volumes[id]={cellMeters:data.cellMeters,layers:[{chunks}]};
  console.log({design:job.design_id,voxelCells:data.cells.length,triangles:faces.length*2});
}
writeFileSync(`${review}/catalog.json`,JSON.stringify({schema:"sidereal.part-catalog.v1",assets}));
writeFileSync(`${review}/wayfarer.json`,JSON.stringify({schema:"sidereal.assembly-draft.v1",id:"isolated-art-review",name:"Unsigned construction reference study",parts}));
writeFileSync(`${review}/catalog.voxels.json`,JSON.stringify({volumes}));
