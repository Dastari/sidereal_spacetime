import {createVolcanicField,nativeVolcanicBasins} from "./native-volcanic-field";
import type { NativePlanetKit, NativePlanetComposition } from "./native-planet-composition";
type V = [number, number, number];
const dot = (a: V,b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V,b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (a: V): V => {const l=Math.hypot(...a);return a.map(x=>x/l) as V;};
/** Compose authored thick crust and cliff masses into seeded connected geography. */
export function composeNativeVolcanic(kit: NativePlanetKit, seed: number, coverage: number, cells: 8 | 12 | 20 = 20, relief = .55, unitOnly=false): NativePlanetComposition {
  if (kit.variants.length!==11 || kit.variants[6].name!=="sealing-core") throw new Error("Invalid native volcanic form kit");
  const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],indices:[] as number[]}));
  const tiles:number[]=[],rotations:number[]=[];let triangles=0,buriedBaseMaxClearance=-Infinity,nativeUnitCount=0;
  let state=(seed^0x7629a37f)>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const axis=unit([random()-.5,random()-.5,random()-.5]), side=unit(cross(axis,[0,1,0])), up=unit(cross(axis,side));
  
  function append(variant:number, center:V, tangent:V, bitangent:V, normal:V, scale:V) {
    const source=kit.variants[variant],points:V[]=[];
    for(let i=0;i<source.positions.length;i+=3){
      const point=[0,1,2].map(j=>center[j]+tangent[j]*source.positions[i]*scale[0]+bitangent[j]*source.positions[i+1]*scale[1]+normal[j]*source.positions[i+2]*scale[2]) as V;
      points.push(variant===5?unit(point).map(v=>v*field.moltenHeight(unit(point))) as V:point);
    }
    if(variant===8||variant===9||variant<5||variant===7){
      if(variant===8||variant===9)nativeUnitCount++;
      const bottom=Math.min(...source.positions.filter((_,i)=>i%3===2)),bottomIndices=points.map((_,i)=>i).filter(i=>source.positions[i*3+2]<bottom+.009);
      const clearance=()=>Math.max(...bottomIndices.map(i=>Math.hypot(...points[i])-field.moltenHeight(unit(points[i]))));
      const inward=unit(center);
      for(let pass=0;pass<16&&clearance()>-.015;pass++){
        const shift=clearance()+.018;
        for(const point of points)for(let i=0;i<3;i++)point[i]-=inward[i]*shift;
      }
      const residual=clearance();if(residual>-.010)throw new Error("Native buried basalt base protrudes through shell");
      buriedBaseMaxClearance=Math.max(buriedBaseMaxClearance,residual);
    }
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
  const field=createVolcanicField(seed);
  const craterCenters:V[]=[];
  const basinCenters=nativeVolcanicBasins(seed),phi=(1+Math.sqrt(5))/2,sites:V[]=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])sites.push(unit([x,y,z]));
  for(const a of [-1,1])for(const b of [-1,1])sites.push(unit([0,a/phi,b*phi]),unit([a/phi,b*phi,0]),unit([a*phi,0,b/phi]));
  const macroCenters=unitOnly?[unit([.80,.50,.25])]:sites.map(v=>unit(axis.map((x,i)=>x*v[0]+side[i]*v[1]+up[i]*v[2]) as V)).filter(n=>!basinCenters.some(center=>dot(n,center)>.97));
  const cragCenters=unitOnly?[]:[axis,side,up,...[axis,side,up].map(v=>v.map(x=>-x) as V),unit(axis.map((v,i)=>v+side[i]) as V)].filter(n=>field.distance(n)>.04);
  const detailCells=cells===20?12:cells===12?10:8;
  const step=2/detailCells;
  const faceDirection=(face:number,u:number,v:number):V=>unit([[1,v,-u],[-1,v,u],[u,1,-v],[u,-1,v],[u,v,1],[-u,v,-1]][face] as V);
  for(let face=0;face<(unitOnly?0:6);face++)for(let row=0;row<detailCells;row++)for(let col=0;col<detailCells;col++){
    const u=-1+(col+.5+(random()-.5)*.32)*step,v=-1+(row+.5+(random()-.5)*.32)*step;
    const n=faceDirection(face,u,v),coordinates:V=[dot(n,axis),dot(n,side),dot(n,up)];
    const t=unit(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)),b=cross(n,t);
    let yaw=Math.sin(coordinates[0]*5+coordinates[1]*3)*1.7+Math.cos(coordinates[2]*4)*.8,tangent=t.map((x,j)=>x*Math.cos(yaw)+b[j]*Math.sin(yaw)) as V,bitangent=cross(n,tangent);
    const channel=field.distance(n);
    if(basinCenters.some(center=>dot(center,n)>.989) || macroCenters.some(center=>dot(center,n)>.979))continue;
    if(channel<coverage*.052*(1+.20*Math.sin(coordinates[0]*29+coordinates[2]*21)))continue;
    const cellSize=step/Math.pow(1+u*u+v*v,.75);
    const region=Math.sin(coordinates[0]*9+coordinates[1]*7+seed*.013)+Math.cos(coordinates[2]*11-coordinates[1]*6);
    let variant=region>1.80?3:region< -1.85?4:Math.min(2,Math.floor((Math.sin(coordinates[0]*5+coordinates[2]*3)+1)*1.49));
    if(variant===4)variant=0;
    if(channel<.105 && channel>.06 && region>.1){
      variant=7;const destination=field.source(n),toward=unit(destination.map((x,j)=>x-n[j]*dot(destination,n)) as V);
      tangent=toward;bitangent=cross(n,tangent);
    }
    const radial=field.height(n)+(random()-.5)*.004,scale:V=[cellSize*(.98+random()*.24),cellSize*(.98+random()*.24),(variant===3?.048:.042)*(.7+relief*.3/.55)];
    const north=Math.abs(n[1])>.96?[1,0,0] as V:[0,1,0] as V,northT=unit(north.map((v,j)=>v-n[j]*dot(north,n)) as V);
    const geo=unit(n.map((v,j)=>v*Math.cos(.30)+northT[j]*Math.sin(.30)) as V),gt=unit(tangent.map((v,j)=>v-geo[j]*dot(tangent,geo)) as V);
    append(variant,n.map(x=>x*radial) as V,gt,cross(geo,gt),geo,scale);tiles.push(variant);rotations.push(yaw);
  }
  for(const n of craterCenters){
    const t=unit(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)),b=cross(n,t);
    append(0,n.map(v=>v*.945) as V,t,b,n,[.30,.30,.030]);
    append(4,n.map(v=>v*.972) as V,t,b,n,[.30,.30,.062]);
  }
  for(let i=0;i<macroCenters.length;i++){
    const n=macroCenters[i],t=unit(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)),b=cross(n,t);
    const yaw=(i%5)*.29,radialT=t.map((v,j)=>v*Math.cos(yaw)+b[j]*Math.sin(yaw)) as V;
    const north=Math.abs(n[1])>.96?[1,0,0] as V:[0,1,0] as V,northT=unit(north.map((v,j)=>v-n[j]*dot(north,n)) as V);
    const geological=unit(n.map((v,j)=>v*Math.cos(.62)+northT[j]*Math.sin(.62)) as V),tt=unit(radialT.map((v,j)=>v-geological[j]*dot(radialT,geological)) as V),bb=cross(geological,tt);
    for(let part=0;part<(unitOnly?1:3);part++){
      const angle=part*Math.PI*2/3+i*.43,center=n.map((v,j)=>v*(.945+(i%3)*.006)+tt[j]*Math.cos(angle)*.115+bb[j]*Math.sin(angle)*.115) as V;
      append(8+(i+part)%2,center,tt,bb,geological,[.18+(i%3)*.012,.18+(i%2)*.015,.115+(i%3)*.010]);
    }
  }
  for(const n of unitOnly?[]:basinCenters){const t=unit(cross([0,1,0],n)),b=cross(n,t),tt=t.map((v,i)=>v*Math.cos(.65)+b[i]*Math.sin(.65)) as V;append(10,n.map(v=>v*.971) as V,tt,cross(n,tt),n,[.20,.20,.12]);}
  for(const n of cragCenters){
    const t=unit(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)),b=cross(n,t);
    for(let k=0;k<3;k++){const center=n.map((v,i)=>v*.995+t[i]*(k-1)*.06+b[i]*Math.sin(k*2)*.04) as V;append(3,center,t,b,n,[.085,.080,.13+k*.018]);}
  }
  append(5,[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.855,.855,.855]);
  append(6,[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.65,.65,.65]);
  if(triangles>150000){if(cells!==8)return composeNativeVolcanic(kit,seed,coverage,cells===20?12:8,relief,unitOnly);throw new Error("Native volcanic globe exceeds150k triangle budget");}
  return {batches,tiles,triangles,seed,rotations,links:[],diagnostics:{buriedBaseMaxClearance,regionalGroupCount:macroCenters.length,nativeUnitCount,actualCells:detailCells}};
}
