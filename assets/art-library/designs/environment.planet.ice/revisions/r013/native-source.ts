import type { NativePlanetKit, NativePlanetComposition } from "./native-planet-composition";
type V = [number, number, number];
const dot = (a: V,b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V,b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (a: V): V => {const l=Math.hypot(...a);return a.map(x=>x/l) as V;};
/** Recompose native closed volumes; no generated cap mesh or voxel occupancy shell. */
export function composeNativeGlacier(kit: NativePlanetKit, seed: number, coverage: number): NativePlanetComposition {
  if (kit.variants.length!==7 || kit.variants[6].name!=="sealing-core") throw new Error("Invalid native glacial form kit");
  const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],indices:[] as number[]}));
  const tiles:number[]=[],rotations:number[]=[];let triangles=0;
  let state=(seed^0x7629a37f)>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const axis=unit([random()-.5,random()-.5,random()-.5]), side=unit(cross(axis,[0,1,0])), up=unit(cross(axis,side));
  const heroes=[axis,side,up,...[axis,side,up].map(v=>v.map(x=>-x) as V)];
  function append(variant:number, center:V, tangent:V, bitangent:V, normal:V, scale:V) {
    const source=kit.variants[variant],points:V[]=[];
    for(let i=0;i<source.positions.length;i+=3)points.push([0,1,2].map(j=>center[j]+tangent[j]*source.positions[i]*scale[0]+bitangent[j]*source.positions[i+1]*scale[1]+normal[j]*source.positions[i+2]*scale[2]) as V);
    for(let i=0;i<source.indices.length;i+=3){
      const p=source.indices.slice(i,i+3).map(n=>points[n]);
      const a=p[1].map((n,j)=>n-p[0][j]) as V,b=p[2].map((n,j)=>n-p[0][j]) as V,raw=cross(a,b);
      if(Math.hypot(...raw)<1e-12)continue;
      const face=unit(raw),batch=batches[source.triangleMaterials[i/3]],base=batch.positions.length/3;
      for(const point of p){batch.positions.push(...point);batch.normals.push(...face);}
      batch.indices.push(base,base+2,base+1);triangles++;
    }
  }
  const count=4096, golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<count;i++){
    const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),angle=i*golden+seed*.001;
    const n:V=[Math.cos(angle)*r,y,Math.sin(angle)*r];
    const t=unit(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)),b=cross(n,t),yaw=Math.floor(random()*8)*Math.PI/4;
    const tangent=t.map((v,j)=>v*Math.cos(yaw)+b[j]*Math.sin(yaw)) as V,bitangent=cross(n,tangent);
    let hero=0,alignment=-1;heroes.forEach((h,j)=>{const d=dot(n,h);if(d>alignment){alignment=d;hero=j;}});
    const edge=.93+.014*Math.sin(n[0]*19+n[2]*13)+.012*Math.cos(n[1]*23-n[2]*9);
    const ice=coverage>0 && alignment>1-(1-edge)*Math.min(1.4,coverage/.55);
    const canyon=!ice && coverage>0 && alignment>.82 && Math.abs(Math.sin(n[0]*7+n[2]*5+seed*.01))<.09;
    const region=.026*Math.sin(n[0]*7+n[1]*5+seed*.004)+.018*Math.sin(n[2]*9-n[1]*4);
    let variant:number,radial:number,scale:V;
    if(ice || canyon){
      const recessed=canyon || hero===1 || hero===4;
      variant=recessed?5:3+(hero%2);
      radial=(recessed?.84:.93)+region;
      scale=[.075,.075,recessed?.055:.055+.022*Math.max(0,(alignment-.93)/.07)];
    }else{
      variant=Math.floor((Math.sin(n[0]*13+n[2]*8)+1)*1.49);
      radial=1+region+.006*Math.sin(n[0]*31+n[1]*21);
      const size=.066+random()*.01;scale=[size,size,.071+random()*.008];
    }
    append(variant,n.map(v=>v*radial) as V,tangent,bitangent,n,scale);tiles.push(variant);rotations.push(yaw);
  }
  append(6,[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.80,.80,.80]);
  if(triangles>150000)throw new Error("Native glacier exceeds150k triangle budget");
  return {batches,tiles,triangles,seed,rotations,links:[]};
}
