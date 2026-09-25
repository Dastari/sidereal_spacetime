import {readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{VoxelVolume,decodeVoxels}from'../../packages/sim/src/voxels';
import{hullVisualVolume}from'../hull_publication';
const source=JSON.parse(readFileSync('assets/runtime/voxels/wayfarer.voxels.json','utf8')),layer=source.layers.find((l:{name:string})=>l.name==='armor'),volume=new VoxelVolume();
for(const c of layer.chunks)volume.chunks.set(c.id,{origin:c.origin,cells:decodeVoxels(c.runs)});
const visual=hullVisualVolume('armor',volume);let retired=0,retained=0;
for(const c of volume.chunks.values())for(let i=0;i<c.cells.length;i++){
 const material=c.cells[i];if(!material)continue;
 const x=c.origin[0]+i%32,y=c.origin[1]+Math.floor(i/32)%32,z=c.origin[2]+Math.floor(i/1024);
 const side=y>=-144&&y<144&&(x>=80&&x<320||x>=-320&&x<-80),expected=y<144&&!side?material:0;
 if(visual.get(x,y,z)!==expected)throw Error('Unexpected legacy visual cell '+[x,y,z]);
 if(side)retired++;else if(expected)retained++;
}
if(!retired||!retained)throw Error('Expected both retired sides and retained stern armor');
const report={status:'passed',retiredSideArmorCells:retired,retainedOtherArmorCells:retained,originalVoxelDataUnmodified:true,scope:'Presentation filtering only; separate native GLB retains approved surfaces.'};mkdirSync('docs/releases/side-hull-r003',{recursive:true});writeFileSync('docs/releases/side-hull-r003/legacy-retirement.json',JSON.stringify(report,null,2));console.log(report);
