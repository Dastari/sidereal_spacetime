import {nativeRadialSurface} from './native_radial_surface';
import {deformedNormalAt} from './native_deformation_normals';
import type {ReviewedComposerInput as NativePlanetKit} from './reviewed-composer-input';
type Vec=[number,number,number];
type Range={firstTriangle:number;triangleCount:number;partId:string};
const unit=(v:Vec):Vec=>{const n=Math.hypot(...v);if(n<1e-12)throw new Error('Degenerate native triangle');return [v[0]/n,v[1]/n,v[2]/n];};
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Native connected regional relief, pre-tessellated in Blender for curved
 * mapping. Embedded bowls, ledges and fractures share a closed native mesh.
 * Regions retain exact topology and transforms at every LOD. */
export function composeCrystalMoonReference(kit:NativePlanetKit,seed:number,lod:0|1|2,diagnostic=false){
 const recipe=(kit as NativePlanetKit&{compositionRecipe?:{referenceId:string;layoutSeed:number;scales:number[];hero:number}}).compositionRecipe;
 if(!recipe||!['planets--crystal-moon-1','planets--crystal-moon-2'].includes(recipe.referenceId)||![6,10].includes(recipe.scales.length))throw new Error('Explicit crystalline moon recipe required');
 const referenceId=recipe.referenceId;
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],uvs:[] as number[],indices:[] as number[],ranges:[] as Range[]}));
 const variant=(name:string)=>{const value=kit.variants.find(v=>v.name===name);if(!value)throw new Error(`Missing crystal native variant ${name}`);return value;};
 let state=(seed^recipe.layoutSeed)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const phase=random()*Math.PI*2;const existingEmitterTips:Vec[]=[];
 function emit(name:string,id:string,transform:(v:Vec)=>Vec,smooth=false,emitter=false){let highestTip:Vec|undefined;
  const mesh=variant(name) as NativePlanetKit['variants'][number]&{normals:number[];uvs:number[]},starts=batches.map(b=>b.indices.length/3);
  if(mesh.normals?.length!==mesh.positions.length||mesh.uvs?.length!==mesh.positions.length/3*2)throw new Error('Missing native crystal normals or UVs');
  for(let i=0;i<mesh.indices.length;i+=3){
   const batch=batches[mesh.triangleMaterials[i/3]];if(!batch)throw new Error('Invalid native material role');
   const source=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec),p=source.map(transform);
   if(emitter)for(const point of p)if(!highestTip||Math.hypot(...point)>Math.hypot(...highestTip))highestTip=point;
   const normals=source.map((point,k)=>deformedNormalAt(mesh.normals.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec,point,transform)),start=batch.positions.length/3;
   for(let k=0;k<3;k++){batch.positions.push(...p[k]);batch.normals.push(...normals[k]);batch.uvs.push(...mesh.uvs.slice(mesh.indices[i+k]*2,mesh.indices[i+k]*2+2));}
   // Blender source is CCW. No handedness reversal here; uploader uses CCW.
   batch.indices.push(start,start+1,start+2);
  }
  if(highestTip)existingEmitterTips.push(highestTip);
  batches.forEach((b,i)=>{const count=b.indices.length/3-starts[i];if(count)b.ranges.push({firstTriangle:starts[i],triangleCount:count,partId:`${referenceId}/${id}`});});
 }

 const regions:{n:Vec;scale:number;angle:number;name:string;id:string}[]=[];
 if(diagnostic)regions.push({n:unit([.452,.388,.794]),scale:.32,angle:0,name:'crystal-battered-region-a',id:'region-diagnostic'});
 else for(let i=0;i<recipe.scales.length;i++){
  const y=1-2*(i+.5)/recipe.scales.length,angle=phase+i*2.39996323,r=Math.sqrt(1-y*y);
  regions.push({n:[Math.cos(angle)*r,y,Math.sin(angle)*r],scale:recipe.scales[i],angle:random()*Math.PI*2,name:i%2?'crystal-battered-region-b':'crystal-battered-region-a',id:`region-${i}`});
 }
 const substrate=(v:Vec):Vec=>{
  const n=unit(v);let depression=0;
  for(const region of regions){
   const distance=Math.hypot(n[0]-region.n[0],n[1]-region.n[1],n[2]-region.n[2])/region.scale;
   const t=Math.max(0,Math.min(1,(distance-.47)/.40));
   depression=Math.max(depression,region.scale*.37*(1-t*t*(3-2*t)));
   const east=unit(cross(Math.abs(region.n[1])>.94?[1,0,0]:[0,1,0],region.n)),north=cross(region.n,east),c=Math.cos(region.angle),s=Math.sin(region.angle),x=(1.22*c-.07*s)*region.scale,y=(1.22*s+.07*c)*region.scale,pit=unit(region.n.map((v,k)=>v+east[k]*x+north[k]*y) as Vec),pd=Math.hypot(...n.map((v,k)=>v-pit[k]))/region.scale,pt=Math.max(0,Math.min(1,(pd-.22)/.20));
   depression=Math.max(depression,region.scale*.22*(1-pt*pt*(3-2*pt)));
  }
  const radius=Math.hypot(...v)-depression;return [n[0]*radius,n[1]*radius,n[2]*radius];
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
  const feet=[{x:index%4===2?.45:-.70,y:index%4===2?-.84:.43,hero:index%2===0},{x:.86,y:.27,hero:false},{x:index%4===2?-.70:.45,y:index%4===2?.43:-.84,hero:false},];
  for(let j=0;j<feet.length;j++){
   const foot=feet[j],height=nativeHeight(region.name,foot.x,foot.y),world=regionMap([foot.x,foot.y,height]),up=unit(world),e=unit(cross(Math.abs(up[1])>.94?[1,0,0]:[0,1,0],up)),north=cross(up,e),angle=(j<3?random():((Math.imul(seed+index*31+j,1664525)>>>0)/4294967296))*Math.PI*2,cs=Math.cos(angle),sn=Math.sin(angle),scale=foot.hero?recipe.hero*(.88+.08*(index%3)):.105+(index%3)*.018,altitude=Math.hypot(...world)-.006;
   emit(foot.hero?(index%4?'leaning-colossal-cluster':'colossal-cluster'):'medium-cluster',`${foot.hero?'colossal':'medium'}-${index}-${j}`,v=>{
    const x=(v[0]*cs-v[1]*sn)*scale,y=(v[0]*sn+v[1]*cs)*scale,h=altitude+v[2]*scale;
    return [up[0]*h+e[0]*x+north[0]*y,up[1]*h+e[1]*x+north[1]*y,up[2]*h+e[2]*x+north[2]*y];
   },false,true);
  }

 }

 // Native middle relief is supported by the FINAL opaque body, preserving
 // hollows instead of allowing hidden underlying spheres to lift placements.
 if(!diagnostic){
 const terrain=batches.map(b=>({...b,indices:b.ranges.filter(r=>r.partId.endsWith('/ground')||r.partId.includes('/region-')).flatMap(r=>b.indices.slice(r.firstTriangle*3,(r.firstTriangle+r.triangleCount)*3))}));
 const surface=nativeRadialSurface(terrain,terrain.map((_,i)=>i)),second=recipe.referenceId.endsWith('-2'),count=second?64:88;
 for(let i=0;i<count;i++){
  const y=1-2*(i+.5)/count,theta=phase+i*2.399963229728653,r=Math.sqrt(1-y*y),n:Vec=[Math.cos(theta)*r,y,Math.sin(theta)*r];
  // Both explicit large mouths and secondary bowls stay open.
  let cavity=false;
  for(const region of regions){
   if(Math.hypot(...n.map((v,k)=>v-region.n[k]))<region.scale*.60){cavity=true;break;}
   const east=unit(cross(Math.abs(region.n[1])>.94?[1,0,0]:[0,1,0],region.n)),north=cross(region.n,east),c=Math.cos(region.angle),s=Math.sin(region.angle),x=(1.22*c-.07*s)*region.scale,y=(1.22*s+.07*c)*region.scale,pit=unit(region.n.map((v,k)=>v+east[k]*x+north[k]*y)as Vec);
   if(Math.hypot(...n.map((v,k)=>v-pit[k]))<region.scale*.36){cavity=true;break;}
  }
  if(cavity)continue;
  const height=surface(n),east=unit(cross(Math.abs(y)>.94?[1,0,0]:[0,1,0],n)),north=cross(n,east),angle=random()*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),scale=second?.28+random()*.10:.22+random()*.065;
  if(!Number.isFinite(height))throw new Error('Native crystalline district lacks final terrain support');
  emit(second?'angular-crystal-district':'squat-crystal-district',`native-crystal-district-${i}`,v=>{
   const x=(v[0]*c-v[1]*s)*scale,z=(v[0]*s+v[1]*c)*scale,h=height+v[2]*scale-.008;
   return n.map((q,k)=>q*h+east[k]*x+north[k]*z)as Vec;
  });
 }
 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),uvs:Float32Array.from(b.uvs),indices:Uint32Array.from(b.indices)}));
}
