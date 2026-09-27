import type {ReviewedComposerInput as NativePlanetKit} from './reviewed-composer-input';
import {globeAnchor,nativeAssembly,seeded,tangent,type Vec} from './native_reference_assembly';

const BANKS=['cloud-swept-bank','cloud-swept-bank','cloud-broken-wisp','cloud-swept-bank','cloud-towering-bank'] as const;
export const NATIVE_CLOUD_BANK_LIMIT=16;
const ANCHOR_ORDER=[6,9,1,14,4,11,0,15,3,12,7,8,2,13,5,10] as const;
/** Worker-safe assembly of exact native cloud lobes. No per-frame rebuild or LOD input.
 * Weather uses an independent salted seed and hemisphere-interleaved anchors.
 * Every positive coverage has at least two banks, one in each hemisphere.
 * Coverage adds stable bank IDs; phase is one rigid rotation of the complete field.
 * Runtime drift should rotate the retained cloud root instead of rebuilding buffers.
 * Output batch order is the kit material order, with original linear PBR colors.
 */
export function composeNativeClouds(kit:NativePlanetKit,seed:number,coverage:number,phase=0){
 if(![seed,coverage,phase].every(Number.isFinite))throw new Error('Native cloud inputs must be finite');
 for(const name of new Set(BANKS))if(!kit.variants.some(v=>v.name===name))throw new Error(`Missing native cloud variant ${name}`);
 const assembly=nativeAssembly(kit),random=seeded((seed>>>0)^0x6d2b79f5),count=coverage<=0?0:Math.max(2,Math.ceil(Math.min(1,coverage)*NATIVE_CLOUD_BANK_LIMIT));
 const directionPhase=random()*Math.PI*2,c=Math.cos(phase),s=Math.sin(phase);
 for(let i=0;i<count;i++){
  // The fixed anchor population preserves every existing bank when coverage rises.
  // Unequal sweep scale and thickness avoid a continuous planetary ribbon.
  const scale=.15+random()*.11,rotation=random()*Math.PI*2,altitude=.099+random()*.004;
  const name=BANKS[i%BANKS.length],heightScale=name==='cloud-towering-bank'?.058:.065;
  const place=tangent(globeAnchor(ANCHOR_ORDER[i],NATIVE_CLOUD_BANK_LIMIT,directionPhase),scale,rotation,altitude,true,heightScale);
  assembly.emit(name,`cloud-bank-${String(i).padStart(3,'0')}`,v=>{
   const p=place(v);return[c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]] as Vec;
  });
 }
 return assembly.finish();
}
