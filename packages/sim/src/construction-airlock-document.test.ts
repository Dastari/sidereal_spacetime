import { randomUUID } from "node:crypto";
import {expect,test}from"vitest";
import{createNativeAirlockDocument,readNativeAirlockDocument,nativeAirlockDocumentIdentities,remapNativeAirlockDocument}from"./construction-airlock-document";
import{compileLayout}from"./layout-compiler";
import{readConstructionDraft}from"./construction-transactions";
test('two semantic doors anchor actual landing partition, roof keeps landing unroofed through explicit binding',()=>{
 const d=createNativeAirlockDocument();expect(compileLayout(d.layout).valid).toBe(true);expect(readNativeAirlockDocument(JSON.stringify(d))).toEqual(d);expect(d.airlockRoom.roofTileIds).toHaveLength(12);expect(d.airlockRoom.exteriorTileIds).toHaveLength(4);
 // Shared parser must reject until ALL matching authority/native adapters land.
 expect(()=>readConstructionDraft(JSON.stringify(d))).toThrow('Unsupported');
});
test('two template spawns and JSON reload preserve independent exhaustive UUID mappings',()=>{
 const d=createNativeAirlockDocument(),ids=nativeAirlockDocumentIdentities(d),all:string[]=[];
 for(let i=0;i<2;i++){const map=Object.fromEntries(ids.map(id=>[id,randomUUID()]));const next=remapNativeAirlockDocument(d,map);expect(readNativeAirlockDocument(JSON.stringify(next))).toEqual(next);all.push(...nativeAirlockDocumentIdentities(next));}
 expect(new Set(all).size).toBe(ids.length*2);expect(()=>remapNativeAirlockDocument(d,{})).toThrow('mapping');
});
test.each(['floor','roof','door','part','old-proof'] as const)('rejects changed %s qualification',kind=>{
 const d=createNativeAirlockDocument();if(kind==='floor')d.layout.tiles[0].vertices[0][0]+=.5;if(kind==='roof')d.airlockRoom.roofTileIds.push(d.airlockRoom.exteriorTileIds[0]);if(kind==='door')d.layout.openings[1].a[1]=13;if(kind==='part')d.airlockRoom.parts[1].sourcePartIndex=0;if(kind==='old-proof')d.airlockRoom.pin.sha256='0'.repeat(64);
 expect(()=>readNativeAirlockDocument(JSON.stringify(d))).toThrow();
});
