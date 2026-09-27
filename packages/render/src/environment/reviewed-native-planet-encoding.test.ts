import {expect,it} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deepStrictEqual} from 'node:assert';
import {REVIEWED_NATIVE_PLANETS} from './reviewed-native-planet-catalog';
import {decodeReviewedNativePayload,REVIEWED_NATIVE_PAYLOAD_LIMIT} from './reviewed-native-planet-encoding';
const runtime=(url:string)=>`apps/dashboard/public${url}`;
function minimal(value:number){
 const header=Buffer.from(JSON.stringify({kit:{variants:[{positions:{$nativeBuffer:0}}]},buffers:[{type:'f64',offset:0,length:1}]}));
 const start=Math.ceil((16+header.length)/8)*8,b=Buffer.alloc(start+8);b.write('SDNPK001');b.writeUInt32LE(header.length,8);b.writeUInt32LE(8,12);header.copy(b,16);b.writeDoubleLE(value,start);return b;
}
it('decodes explicit little endian binary64 including signed zero and rejects corrupt bounds/nonfinite values',()=>{
 expect((decodeReviewedNativePayload(minimal(-0),'native-packed-v1') as any).variants[0].positions[0]).toBe(-0);
 expect((decodeReviewedNativePayload(minimal(1.125),'native-packed-v1') as any).variants[0].positions[0]).toBe(1.125);
 expect(()=>decodeReviewedNativePayload(minimal(NaN),'native-packed-v1')).toThrow('nonfinite');
 const bad=minimal(1);bad.writeUInt32LE(0xffffffff,8);expect(()=>decodeReviewedNativePayload(bad,'native-packed-v1')).toThrow('bounds');
 expect(()=>decodeReviewedNativePayload(minimal(1).subarray(0,-1),'native-packed-v1')).toThrow('bounds');
 const magic=minimal(1);magic[0]=0;expect(()=>decodeReviewedNativePayload(magic,'native-packed-v1')).toThrow('magic');
});
it('pins all 28 immutable catalog entries and normal asset payloads within unchanged budgets',()=>{
 expect(REVIEWED_NATIVE_PLANETS).toHaveLength(28);expect(new Set(REVIEWED_NATIVE_PLANETS.map(x=>x.id)).size).toBe(28);expect(Object.isFrozen(REVIEWED_NATIVE_PLANETS)).toBe(true);
 for(const d of REVIEWED_NATIVE_PLANETS){
  expect(Object.isFrozen(d)).toBe(true);expect(d.kitURL).toMatch(/^\/reviewed-planets\/[a-z0-9-]+\/kit\.(json|snp)$/);
  for(const p of [d,...(d.weather?[d.weather]:[])]){
   const file=runtime(p.kitURL);expect(statSync(file).size).toBeLessThanOrEqual(REVIEWED_NATIVE_PAYLOAD_LIMIT);
   expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(p.runtimeKitSha256);
  }
 }
 expect(REVIEWED_NATIVE_PLANETS.filter(d=>!d.fixedDetail).map(d=>d.id)).toEqual(['desert-r014','ocean-r007','temperate-r003','volcanic-r023']);
});
// Archived source comparison is opt-in when real source files are available.
for(const revision of ['desert-r014','toxic-r007'])it.skipIf(!process.env.REVIEWED_NATIVE_SOURCE_ROOT)(`losslessly decodes every ${revision} numeric field and metadata against accepted source`,()=>{
 const descriptor=REVIEWED_NATIVE_PLANETS.find(d=>d.id===revision)!;
 const sourceRoot=process.env.REVIEWED_NATIVE_SOURCE_ROOT;
 if(!sourceRoot)throw new Error('Set REVIEWED_NATIVE_SOURCE_ROOT to real accepted source checkout (LFS pointers are insufficient)');
 const sourceBytes=readFileSync(`${sourceRoot}/output/playwright/planet-reference-20260914/${revision}/kit.json`);
 expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(descriptor.sourceKitSha256);
 const decoded=decodeReviewedNativePayload(readFileSync(runtime(descriptor.kitURL)),descriptor.encoding);
 deepStrictEqual(decoded,JSON.parse(sourceBytes.toString('utf8')));
},30000);
