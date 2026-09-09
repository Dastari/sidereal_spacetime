import type { NativePlanetKit, NativePlanetComposition } from "./native-planet-composition";
type V = [number, number, number];
const dot = (a: V,b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V,b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (a: V): V => {const l=Math.hypot(...a);return a.map(x=>x/l) as V;};
/** Compose authored thick crust and cliff masses into seeded connected geography. */
export function composeNativeGlacialGeography(kit: NativePlanetKit, seed: number, coverage: number): NativePlanetComposition {
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
  // Jittered cube-face coverage has no Fibonacci bands or independent tile yaw.
  const cells=16,step=2/cells;
  const faceDirection=(face:number,u:number,v:number):V=>unit([[1,v,-u],[-1,v,u],[u,1,-v],[u,-1,v],[u,v,1],[-u,v,-1]][face] as V);
  for(let face=0;face<6;face++)for(let row=0;row<cells;row++)for(let col=0;col<cells;col++){
    const u=-1+(col+.5+(random()-.5)*.36)*step,v=-1+(row+.5+(random()-.5)*.36)*step;
    const n=faceDirection(face,u,v),field:V=[dot(n,axis),dot(n,side),dot(n,up)];
    const t=unit(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)),b=cross(n,t);
    const yaw=.18*Math.sin(field[0]*3+field[2]*4),tangent=t.map((x,j)=>x*Math.cos(yaw)+b[j]*Math.sin(yaw)) as V,bitangent=cross(n,tangent);
    let hero=0,alignment=-1;heroes.forEach((h,j)=>{const d=dot(n,h);if(d>alignment){alignment=d;hero=j;}});
    const ripple=.022*Math.sin(field[0]*11+field[2]*7)+.016*Math.sin(field[1]*13-field[2]*9);
    const boundary=1-.102*Math.min(1.35,coverage/.55)+ripple;
    const basin=Math.max(0,(alignment-boundary)/(1-boundary));
    const branch=Math.abs(field[2]+.13*Math.sin(field[0]*7+field[1]*4));
    const channel=coverage>0 && branch<.06 && Math.abs(field[0])>.34;
    const ice=coverage>0 && (basin>0 || channel);
    const region=.055*Math.sin(field[0]*4+field[1]*3)+.032*Math.cos(field[2]*5-field[1]*3);
    const cellSize=step/Math.pow(1+u*u+v*v,.75);
    let variant:number,radial:number,scale:V;
    if(ice){
      const ridge=!channel && basin<.48;
      variant=ridge?3+(hero%2):5;
      radial=(ridge?.79:.66)+region;
      const height=ridge?(.12+.036*Math.sin(field[0]*13+field[2]*17)):.075;
      scale=[cellSize*1.24,cellSize*1.24,height];
    }else{
      variant=Math.min(2,Math.floor((Math.sin(field[0]*5+field[2]*3)+1)*1.49));
      radial=.98+Math.round(region/.034)*.034;
      scale=[cellSize*1.18,cellSize*1.18,.11];
    }
    append(variant,n.map(x=>x*radial) as V,tangent,bitangent,n,scale);tiles.push(variant);rotations.push(yaw);
  }
  append(6,[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.57,.57,.57]);
  if(triangles>150000)throw new Error("Native glacier exceeds150k triangle budget");
  return {batches,tiles,triangles,seed,rotations,links:[]};
}
