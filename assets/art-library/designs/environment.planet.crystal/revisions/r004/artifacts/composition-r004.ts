import {deformedFaceNormals} from './native_deformation_normals';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
type Vec=[number,number,number];
type Range={firstTriangle:number;triangleCount:number;partId:string};
const unit=(v:Vec):Vec=>{const n=Math.hypot(...v);if(n<1e-12)throw new Error('Degenerate native triangle');return [v[0]/n,v[1]/n,v[2]/n];};
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Native connected regional relief, pre-tessellated in Blender for curved
 * mapping. Embedded bowls, ledges and fractures share a closed native mesh.
 * Regions retain exact topology and transforms at every LOD. */
export function composeCrystalReference(kit:NativePlanetKit,seed:number,lod:0|1|2,diagnostic=false){
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],indices:[] as number[],ranges:[] as Range[]}));
 const variant=(name:string)=>{const value=kit.variants.find(v=>v.name===name);if(!value)throw new Error(`Missing crystal native variant ${name}`);return value;};
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const phase=random()*Math.PI*2;
 function emit(name:string,id:string,transform:(v:Vec)=>Vec,smooth=false){
  const mesh=variant(name),starts=batches.map(b=>b.indices.length/3);
  for(let i=0;i<mesh.indices.length;i+=3){
   const batch=batches[mesh.triangleMaterials[i/3]];if(!batch)throw new Error('Invalid native material role');
   const source=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec),p=source.map(transform);
   const normals=smooth?p.map(unit):deformedFaceNormals(source,transform),start=batch.positions.length/3;
   for(let k=0;k<3;k++){batch.positions.push(...p[k]);batch.normals.push(...normals[k]);}
   // Blender source is CCW. No handedness reversal here; uploader uses CCW.
   batch.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,i)=>{const count=b.indices.length/3-starts[i];if(count)b.ranges.push({firstTriangle:starts[i],triangleCount:count,partId:id});});
 }

 const regions:{n:Vec;scale:number;angle:number;name:string;id:string}[]=[];
 if(diagnostic)regions.push({n:unit([.452,.388,.794]),scale:.32,angle:0,name:'crystal-battered-region-a',id:'region-diagnostic'});
 else for(let i=0;i<8;i++){
  const y=1-2*(i+.5)/8,angle=phase+i*2.39996323,r=Math.sqrt(1-y*y);
  regions.push({n:[Math.cos(angle)*r,y,Math.sin(angle)*r],scale:[.34,.28,.31,.26,.33,.29,.32,.27][i],angle:random()*Math.PI*2,name:i%2?'crystal-battered-region-b':'crystal-battered-region-a',id:`region-${i}`});
 }
 const substrate=(v:Vec):Vec=>{
  const n=unit(v);let depression=0;
  for(const region of regions){
   const distance=Math.hypot(n[0]-region.n[0],n[1]-region.n[1],n[2]-region.n[2])/region.scale;
   const t=Math.max(0,Math.min(1,(distance-.47)/.40));
   depression=Math.max(depression,region.scale*.37*(1-t*t*(3-2*t)));
  }
  return [n[0]*(1-depression),n[1]*(1-depression),n[2]*(1-depression)];
 };
 // Retained highest authored ground avoids triangles bridging native cavities.
 emit('ground-sphere','ground',substrate,false);
 function nativeHeight(name:string,x:number,y:number){
  const mesh=variant(name);let height=-Infinity;
  for(let i=0;i<mesh.indices.length;i+=3){
   const a=mesh.positions.slice(mesh.indices[i]*3,mesh.indices[i]*3+3),b=mesh.positions.slice(mesh.indices[i+1]*3,mesh.indices[i+1]*3+3),c=mesh.positions.slice(mesh.indices[i+2]*3,mesh.indices[i+2]*3+3),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if(Math.abs(den)<1e-10)continue;
   const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
   if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)height=Math.max(height,u*a[2]+v*b[2]+(1-u-v)*c[2]);
  }
  if(!Number.isFinite(height))throw new Error('Crystal foot outside native foundation');return height;
 }
 for(const region of regions){
  const n=region.n,east=unit(cross(Math.abs(n[1])>.94?[1,0,0]:[0,1,0],n)),north=cross(n,east),c=Math.cos(region.angle),s=Math.sin(region.angle);
  const regionMap=(v:Vec):Vec=>{
   const x=(v[0]*c-v[1]*s)*region.scale,y=(v[0]*s+v[1]*c)*region.scale,d=unit([n[0]+east[0]*x+north[0]*y,n[1]+east[1]*x+north[1]*y,n[2]+east[2]*x+north[2]*y]),h=1+v[2]*region.scale;
   return [d[0]*h,d[1]*h,d[2]*h];
  };
  emit(region.name,region.id,regionMap);
  const index=regions.indexOf(region);
  const feet=[{x:.86,y:.27,hero:index%2===0},{x:-.70,y:.43,hero:false},{x:.45,y:-.84,hero:false}];
  for(let j=0;j<feet.length;j++){
   const foot=feet[j],height=nativeHeight(region.name,foot.x,foot.y),world=regionMap([foot.x,foot.y,height]),up=unit(world),e=unit(cross(Math.abs(up[1])>.94?[1,0,0]:[0,1,0],up)),north=cross(up,e),angle=random()*Math.PI*2,cs=Math.cos(angle),sn=Math.sin(angle),scale=foot.hero?[.27,.234,.306,.252][Math.floor(index/2)%4]:.12+(index%3)*.020,altitude=Math.hypot(...world)-.006;
   emit(foot.hero?(index%4?'leaning-colossal-cluster':'colossal-cluster'):'medium-cluster',`${foot.hero?'colossal':'medium'}-${index}-${j}`,v=>{
    const x=(v[0]*cs-v[1]*sn)*scale,y=(v[0]*sn+v[1]*cs)*scale,h=altitude+v[2]*scale;
    return [up[0]*h+e[0]*x+north[0]*y,up[1]*h+e[1]*x+north[1]*y,up[2]*h+e[2]*x+north[2]*y];
   });
  }

 }

 // Native fractured outcrops bridge regional relief; seeded globally and retained
 // unchanged at every LOD. This is placement of authored meshes, not remeshing.
 for(let i=0;i<(diagnostic?0:100);i++){
  const y=1-2*(i+.5)/100,theta=phase+i*2.39996323,r=Math.sqrt(1-y*y),n:Vec=[Math.cos(theta)*r,y,Math.sin(theta)*r],east=unit(cross(Math.abs(y)>.94?[1,0,0]:[0,1,0],n)),north=cross(n,east),rotation=random()*Math.PI*2,c=Math.cos(rotation),s=Math.sin(rotation),scale=.21+random()*.12;
  // Avoid filling the authored crater cavities themselves.
  if(regions.some(region=>Math.hypot(...n.map((v,k)=>v-region.n[k]))<region.scale*.75))continue;
  emit(i%4===0?'fracture-cliffs':'low-fractured-shelf',`outcrop-${i}`,v=>{const x=(v[0]*c-v[1]*s)*scale,z=(v[0]*s+v[1]*c)*scale,d=unit(n.map((q,k)=>q+east[k]*x+north[k]*z) as Vec),h=1+v[2]*scale+.02;return d.map(q=>q*h) as Vec;});
 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),indices:Uint32Array.from(b.indices)}));
}
