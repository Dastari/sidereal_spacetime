import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
import {nativeAssembly,tangent,seeded,globeAnchor,unit} from './native_reference_assembly';
/** Native crystal formations keep their complete geometry at every LOD. */
export function composeCrystalReference(kit:NativePlanetKit,seed:number,lod:0|1|2){
 const assembly=nativeAssembly(kit),random=seeded(seed),phase=random()*Math.PI*2;
 assembly.emit(['ground-sphere','ground-sphere-medium','ground-sphere-low'][lod],'ground',v=>v,true);
 for(let i=0;i<5;i++){
  const anchor=globeAnchor(i,5,phase),scale=[.26,.19,.23,.18,.21][i];
  assembly.emit(i%2?'leaning-colossal-cluster':'colossal-cluster',`colossal-${i}`,tangent(anchor,scale,random()*Math.PI*2,-.02));
  for(let j=0;j<5;j++){
   const near=unit([anchor[0]+(random()-.5)*.8,anchor[1]+(random()-.5)*.8,anchor[2]+(random()-.5)*.8]);
   assembly.emit(j%2?'low-fractured-shelf':'fracture-cliffs',`crust-${i}-${j}`,tangent(near,.18+random()*.1,random()*Math.PI*2,-.01));
   if(j<3)assembly.emit('medium-cluster',`medium-${i}-${j}`,tangent(near,.08+random()*.06,random()*Math.PI*2,-.008));
  }
 }
 return assembly.finish();
}
