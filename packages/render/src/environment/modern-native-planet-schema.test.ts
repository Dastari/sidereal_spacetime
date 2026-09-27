import {expect,it} from 'vitest';
import {openSync,readSync,closeSync,fstatSync} from 'node:fs';
import {resolve} from 'node:path';
import fixtures from './fixtures/modern-native-planet-headers.json';
import {validateModernNativePlanetDescriptor,validateModernNativePlanetHeader,validateModernNativePlanetKit,validateModernNativePayloadBytes} from './modern-native-planet-schema';
const triangle=()=>({name:'body',positions:[0,0,1,1,0,1,0,1,1],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1],indices:[0,1,2],triangleMaterials:[0]});
const kit=()=>({schema:'sidereal.native-planet-kit.v1',layout:'crystal-moon-native-body',materials:[{name:'native',linearColor:[1,1,1],roughness:.7,alphaMode:'OPAQUE',transmissionFactor:.82,thicknessFactor:.16,ior:1.31,attenuationDistance:1.8,normalTexture:'normal.png'}],compositionRecipe:{referenceId:'planets--crystal-moon-1',layoutSeed:587,bodyVariant:'body'},variants:[triangle()],nativePartRanges:[{partId:'panel/step-a',firstTriangle:0,triangleCount:1}]});
it('validates all 28 reviewed metadata prefixes and flags oversized sources without composing or loading geometry',()=>{
 expect(fixtures.candidates).toHaveLength(28);const oversized:string[]=[];
 for(const c of fixtures.candidates){
  const file=openSync(resolve('output/playwright/planet-reference-20260914',c.revision,'kit.json'),'r');
  try{
   const buffer=Buffer.alloc(65536),length=readSync(file,buffer,0,buffer.length,0),prefix=buffer.toString('utf8',0,length),match=/"variants"\s*:/.exec(prefix);
   expect(match,`${c.revision} header must fit the bounded prefix`).not.toBeNull();
   const actual=JSON.parse(prefix.slice(0,match!.index).trimEnd().replace(/,$/,'')+'}');
   expect(actual).toEqual(c.header);expect(fstatSync(file).size).toBe(c.sourceBytes);
  }finally{closeSync(file);}
  expect(()=>validateModernNativePlanetHeader(c.header)).not.toThrow();
  if(c.sourceBytes>64*1024*1024){expect(()=>validateModernNativePayloadBytes(c.sourceBytes)).toThrow('byte budget');oversized.push(c.revision);}
  else expect(()=>validateModernNativePayloadBytes(c.sourceBytes)).not.toThrow();
  // This descriptor is a type/URL exercise, not a live appearance mapping.
  expect(()=>validateModernNativePlanetDescriptor({appearanceIdentity:'fixture-only',revision:c.revision,layout:c.header.layout,kitURL:`/assets/planets/${c.revision}/kit.json`,kitSha256:c.sourceKitSha256})).not.toThrow();
 }
 expect(oversized).toEqual(['desert-r014','toxic-r007','ice-moon-1-r002']);
});
it('preserves exact attribute, optical and part objects without reconstructing geometry',()=>{
 const source=kit(),before=JSON.stringify(source),result=validateModernNativePlanetKit(source,1000);
 expect(result).toBe(source);expect(result.variants[0].normals).toBe(source.variants[0].normals);expect(result.materials[0]).toBe(source.materials[0]);expect(result.nativePartRanges).toBe(source.nativePartRanges);expect(JSON.stringify(source)).toBe(before);
});
it('rejects malformed native attributes, material references and missing or overlapping source parts',()=>{
 const corruptions:Array<(v:ReturnType<typeof kit>)=>void>=[v=>{v.variants[0].positions[0]=NaN;},v=>{v.variants[0].normals.pop();},v=>{v.variants[0].uvs.pop();},v=>{v.variants[0].indices[2]=3;},v=>{v.variants[0].triangleMaterials[0]=1;},v=>{v.nativePartRanges[0].firstTriangle=1;},v=>{v.nativePartRanges[0].triangleCount=2;},v=>{v.nativePartRanges=[];},v=>{v.variants.push(triangle());},v=>{v.variants[0].normals.fill(0);}];
 for(const change of corruptions){const source=kit();change(source);expect(()=>validateModernNativePlanetKit(source,1000)).toThrow('Invalid native planet');}
});
it('rejects unsafe texture routes, unsupported optics/schema and resource excess before upload',()=>{
 for(const path of ['../secret.png','/normal.png','https://host/normal.png','normal.png?x=1','%2e%2e.png','a\\b.png']){const source=kit();source.materials[0].normalTexture=path;expect(()=>validateModernNativePlanetKit(source,1000)).toThrow('path');}
 for(const field of ['transmissionFactor','attenuationDistance','ior']as const){const source=kit();source.materials[0][field]=-1;expect(()=>validateModernNativePlanetKit(source,1000)).toThrow();}
 const source=kit();source.layout='unreviewed';expect(()=>validateModernNativePlanetKit(source,1000)).toThrow('layout');
 expect(()=>validateModernNativePlanetKit(kit(),64*1024*1024+1)).toThrow('byte budget');
 expect(()=>validateModernNativePlanetKit({...kit(),materials:Array(65).fill(kit().materials[0])},1000)).toThrow('materials budget');
 expect(()=>validateModernNativePlanetKit({...kit(),variants:Array(257).fill(triangle())},1000)).toThrow('variants budget');
});
it('descriptor validation cannot accept public arbitrary URLs or mismatched revision paths',()=>{
 const d={appearanceIdentity:'moon',revision:'crystal-moon-1-r010',layout:'crystal-moon-native-body',kitURL:'/assets/planets/crystal-moon-1-r010/kit.json',kitSha256:'a'.repeat(64)};
 for(const patch of [{kitURL:'https://example.test/kit.json'},{revision:'../r010'},{kitURL:'/assets/planets/crystal-moon-2-r010/kit.json'},{kitSha256:'abc'},{weather:{revision:'cloud-r002',kitURL:'/wrong',kitSha256:'b'.repeat(64)}}])expect(()=>validateModernNativePlanetDescriptor({...d,...patch})).toThrow();
});
