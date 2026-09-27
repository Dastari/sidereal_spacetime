import type {ReviewedComposerInput as NativePlanetKit} from './reviewed-composer-input';
export type Vec=[number,number,number];
export const unit=(v:Vec):Vec=>{const r=Math.hypot(...v);if(r<1e-12)throw new Error('Degenerate native direction');return v.map(x=>x/r) as Vec;};
export const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function seeded(seed:number){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
export function nativeAssembly(kit:NativePlanetKit){
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],indices:[] as number[],ranges:[] as {firstTriangle:number;triangleCount:number;partId:string}[]}));
 function emit(name:string,id:string,transform:(v:Vec)=>Vec,smooth=false){
  const variant=kit.variants.find(v=>v.name===name);if(!variant)throw new Error(`Missing native variant ${name}`);
  const starts=batches.map(b=>b.indices.length/3);
  for(let i=0;i<variant.indices.length;i+=3){
   const b=batches[variant.triangleMaterials[i/3]],p=[0,1,2].map(k=>transform(variant.positions.slice(variant.indices[i+k]*3,variant.indices[i+k]*3+3) as Vec));
   const n=unit(cross(p[1].map((v,k)=>v-p[0][k]) as Vec,p[2].map((v,k)=>v-p[0][k]) as Vec)),start=b.positions.length/3;
   for(const v of p){b.positions.push(...v);b.normals.push(...(smooth?unit(v):n));}b.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,m)=>{const count=b.indices.length/3-starts[m];if(count)b.ranges.push({firstTriangle:starts[m],triangleCount:count,partId:id});});
 }
 return {emit,finish:()=>batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),indices:Uint32Array.from(b.indices)}))};
}
export function tangent(anchor:Vec,scale:number,rotation:number,altitude=0,radial=false,heightScale=scale){
 const n=unit(anchor),east=unit(cross(Math.abs(n[1])>.95?[1,0,0]:[0,1,0],n)),north=cross(n,east),c=Math.cos(rotation),s=Math.sin(rotation);
 return(v:Vec):Vec=>{const x=(v[0]*c-v[1]*s)*scale,y=(v[0]*s+v[1]*c)*scale,h=1+altitude+v[2]*heightScale;
  if(radial){const direction=unit(n.map((k,j)=>k+east[j]*x+north[j]*y) as Vec);return direction.map(k=>k*h) as Vec;}
  return n.map((k,j)=>k*h+east[j]*x+north[j]*y) as Vec;
 };
}
export function globeAnchor(index:number,count:number,phase:number):Vec{const y=1-2*(index+.5)/count,a=index*2.399963229728653+phase,r=Math.sqrt(1-y*y);return[Math.cos(a)*r,y,Math.sin(a)*r];}
