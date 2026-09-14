import {deformedNormalAt} from './native_deformation_normals';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
type Vec=[number,number,number];
type Range={firstTriangle:number;triangleCount:number;partId:string};
const unit=(v:Vec):Vec=>{const n=Math.hypot(...v);if(n<1e-12)throw new Error('Degenerate native triangle');return [v[0]/n,v[1]/n,v[2]/n];};
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Native thick snow and glacial shaft assembly. Authored corner normals and
 * UVs retain snow smoothing, hard ice facets and source material boundaries.
 * Regions retain exact topology and transforms at every LOD. */
export function composeIceMoonReference(kit:NativePlanetKit,seed:number,_lod:0|1|2,diagnostic:boolean|'gorge'=false){
 const recipe=(kit as NativePlanetKit&{compositionRecipe?:{referenceId:string;layoutSeed:number;scales:number[];additionalRegion?:{normal:Vec;scale:number;angle:number}}}).compositionRecipe;
 if(!recipe||!['planets--ice-moon-1','planets--ice-moon-2'].includes(recipe.referenceId)||![8,10].includes(recipe.scales.length))throw new Error('Explicit glacial moon recipe required');
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],uvs:[] as number[],indices:[] as number[],ranges:[] as Range[]}));
 const variant=(name:string)=>{const value=kit.variants.find(v=>v.name===name);if(!value)throw new Error(`Missing ice native variant ${name}`);return value;};
 function emit(name:string,id:string,transform:(v:Vec)=>Vec,_smooth=false){
  const mesh=variant(name) as NativePlanetKit['variants'][number]&{normals:number[];uvs:number[]},starts=batches.map(b=>b.indices.length/3);
  if(mesh.normals?.length!==mesh.positions.length||mesh.uvs?.length!==mesh.positions.length/3*2)throw new Error('Missing authored ice normals or UVs');
  for(let i=0;i<mesh.indices.length;i+=3){
   const batch=batches[mesh.triangleMaterials[i/3]];if(!batch)throw new Error('Invalid native material role');
   const source=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec),p=source.map(transform);
   const normals=source.map((point,k)=>deformedNormalAt(mesh.normals.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec,point,transform)),start=batch.positions.length/3;
   for(let k=0;k<3;k++){batch.positions.push(...p[k]);batch.normals.push(...normals[k]);batch.uvs.push(...mesh.uvs.slice(mesh.indices[i+k]*2,mesh.indices[i+k]*2+2));}
   // Blender source is CCW. No handedness reversal here; uploader uses CCW.
   batch.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,i)=>{const count=b.indices.length/3-starts[i];if(count)b.ranges.push({firstTriangle:starts[i],triangleCount:count,partId:id});});
 }

 let state=(seed^recipe.layoutSeed)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};const phase=random()*Math.PI*2;
 const regions=diagnostic?[{n:unit([.452,.388,.794]),scale:.28,angle:0,name:diagnostic==='gorge'?'snow-open-gorge':'snow-cut-region',id:'region-diagnostic'}]:Array.from({length:recipe.scales.length},(_,i)=>{const y=1-2*(i+.5)/recipe.scales.length,r=Math.sqrt(1-y*y),theta=phase+i*2.39996323;return {n:[Math.cos(theta)*r,y,Math.sin(theta)*r] as Vec,scale:recipe.scales[i],angle:random()*Math.PI*2,name:i%2?'snow-open-gorge':'snow-cut-region',id:`${recipe.referenceId}/region-${i}`};});
 if(!diagnostic&&recipe.additionalRegion){
  const extra=recipe.additionalRegion;
  if(recipe.referenceId!=='planets--ice-moon-2'||extra.normal.length!==3||extra.normal.some(v=>!Number.isFinite(v))||!Number.isFinite(extra.scale)||extra.scale<.05||extra.scale>.5||!Number.isFinite(extra.angle))throw new Error('Invalid authored additional glacial region');
  regions.push({n:unit(extra.normal),scale:extra.scale,angle:extra.angle,name:'snow-open-gorge',id:`${recipe.referenceId}/blue-cut-hero`});
 }
 const frames=new Map(regions.map(region=>{const east=unit(cross(Math.abs(region.n[1])>.94?[1,0,0]:[0,1,0],region.n));return[region,{east,north:cross(region.n,east),c:Math.cos(region.angle),s:Math.sin(region.angle)}]as const;}));
 const stencil=[[.22,0],[-.22,0],[0,.22],[0,-.22],[.16,.16],[-.16,.16],[.16,-.16],[-.16,-.16]];
 function floorSampler(name:string){
 const sourceRegion=variant(name);
 type FloorTriangle={a:Vec;b:Vec;c:Vec;den:number};
 const cells=new Map<number,FloorTriangle[]>(),cellSize=.12;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(let i=0;i<sourceRegion.indices.length;i+=3){
  const [a,b,c]=[0,1,2].map(k=>sourceRegion.positions.slice(sourceRegion.indices[i+k]*3,sourceRegion.indices[i+k]*3+3) as Vec);
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  // Upward-facing authored surfaces define the floor; closed bottom faces and
  // nearly vertical shaft walls must never raise the supporting substrate.
  if(den<=1e-8)continue;
  minX=Math.min(minX,a[0],b[0],c[0]);maxX=Math.max(maxX,a[0],b[0],c[0]);minY=Math.min(minY,a[1],b[1],c[1]);maxY=Math.max(maxY,a[1],b[1],c[1]);
  const triangle={a,b,c,den};
  for(let x=Math.floor(Math.min(a[0],b[0],c[0])/cellSize);x<=Math.floor(Math.max(a[0],b[0],c[0])/cellSize);x++)
   for(let y=Math.floor(Math.min(a[1],b[1],c[1])/cellSize);y<=Math.floor(Math.max(a[1],b[1],c[1])/cellSize);y++){
    const key=x*4096+y;const list=cells.get(key)||[];list.push(triangle);cells.set(key,list);
   }
 }
 if((maxY-minY)/cellSize>=4094)throw new Error('Native floor index numeric cell stride exceeded');
 const floorAt=(x:number,y:number)=>{
  if(x<minX-1e-6||x>maxX+1e-6||y<minY-1e-6||y>maxY+1e-6)return Infinity;
  let floor=Infinity;
  for(const {a,b,c,den} of cells.get(Math.floor(x/cellSize)*4096+Math.floor(y/cellSize))||[]){
   const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;
   if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)floor=Math.min(floor,a[2]*u+b[2]*v+c[2]*w);
  }
  return floor;
 };
 return floorAt;
 }
 const samplers=new Map([...new Set(regions.map(r=>r.name))].map(name=>[name,floorSampler(name)]));
 const groundSource=variant('ground-sphere');let groundRelief=0;for(let i=0;i<groundSource.positions.length;i+=3)groundRelief=Math.max(groundRelief,Math.hypot(groundSource.positions[i],groundSource.positions[i+1],groundSource.positions[i+2])-1);
 const substrate=(v:Vec):Vec=>{
  const n=unit(v);let depression=0;
  for(const region of regions){
   const {east,north,c,s}=frames.get(region)!;
   const dot=n[0]*region.n[0]+n[1]*region.n[1]+n[2]*region.n[2];
   if(dot<=0)continue;
   const tx=(n[0]*east[0]+n[1]*east[1]+n[2]*east[2])/dot/region.scale,ty=(n[0]*north[0]+n[1]*north[1]+n[2]*north[2])/dot/region.scale,x=tx*c+ty*s,y=-tx*s+ty*c;
   // Clear the full native ground triangle footprint, not just its vertex.
   // A retained ground edge spans up to ~.22 local units at this unit scale.
   // Conservative neighbouring samples prevent an undeformed outer vertex
   // from bridging the open glacial cut.
   const floorAt=samplers.get(region.name)!;
   let floor=floorAt(x,y);
   for(const [dx,dy] of stencil)floor=Math.min(floor,floorAt(x+dx,y+dy));
   if(Number.isFinite(floor))depression=Math.max(depression,Math.max(0,region.scale*(.12-floor)+groundRelief));

  }
  const radius=Math.hypot(...v)-depression;return [n[0]*radius,n[1]*radius,n[2]*radius];
 };
 // Retained highest authored ground avoids triangles bridging native cavities.
 emit('ground-sphere',`${recipe.referenceId}/ground`,substrate,false);
 for(const region of regions){
  const n=region.n,east=unit(cross(Math.abs(n[1])>.94?[1,0,0]:[0,1,0],n)),north=cross(n,east),c=Math.cos(region.angle),s=Math.sin(region.angle);
  emit(region.name,region.id,v=>{
   const x=(v[0]*c-v[1]*s)*region.scale,y=(v[0]*s+v[1]*c)*region.scale,d=unit([n[0]+east[0]*x+north[0]*y,n[1]+east[1]*x+north[1]*y,n[2]+east[2]*x+north[2]*y]),h=1+v[2]*region.scale;
   return [d[0]*h,d[1]*h,d[2]*h];
  });


 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),uvs:Float32Array.from(b.uvs),indices:Uint32Array.from(b.indices)}));
}
