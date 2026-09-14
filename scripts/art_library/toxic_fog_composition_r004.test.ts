import {expect,it}from'vitest';import{readFileSync}from'node:fs';
import {NullEngine}from'@babylonjs/core/Engines/nullEngine';import{Scene}from'@babylonjs/core/scene';import{Mesh}from'@babylonjs/core/Meshes/mesh';import{VertexData}from'@babylonjs/core/Meshes/mesh.vertexData';import{VertexBuffer}from'@babylonjs/core/Buffers/buffer';
import{referenceMaterial}from'./planet_reference_materials';import{composeToxicFog}from'./toxic_fog_composition_r004';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/toxic-fog-r004/kit.json','utf8'));
it('caps native geometry and preserves authored anchor identities with deterministic buffers',()=>{
 const a=composeToxicFog(kit,38,1),b=composeToxicFog(kit,38,1);expect(a).toEqual(b);expect(a[0].ranges).toHaveLength(12);expect(a[0].indices.length/3).toBeLessThan(50000);
 expect(composeToxicFog(kit,38,0)[0].indices).toHaveLength(0);
 const anchored=composeToxicFog(kit,38,1,0,[{partId:'vent-a',position:[1.10,0,0]},{partId:'vent-b',position:[0,1.12,0]}]);expect(anchored[0].ranges.map(r=>r.partId)).toEqual(['toxic-fog:vent-a','toxic-fog:vent-b']);expect(()=>composeToxicFog(kit,38,1,0,Array.from({length:13},(_,i)=>({partId:String(i),position:[1,0,0]})))).toThrow('at most12');
});
it('coverage and drift preserve geometry/UV identity instead of creating new particles',()=>{
 const a=composeToxicFog(kit,38,.4)[0],b=composeToxicFog(kit,38,1)[0],rotated=composeToxicFog(kit,38,.4,.7)[0];
 expect(a.positions).toEqual(b.positions.slice(0,a.positions.length));expect(a.uvs).toEqual(rotated.uvs);expect(a.indices).toEqual(rotated.indices);expect(a.ranges).toEqual(rotated.ranges);
 for(let i=0;i<a.positions.length;i+=3){expect(Math.hypot(...a.positions.slice(i,i+3))).toBeCloseTo(Math.hypot(...rotated.positions.slice(i,i+3)),6);expect(Math.hypot(...a.normals.slice(i,i+3))).toBeCloseTo(1,5);}
});
it('NullEngine retains PBR alpha and native UV/normal attributes without a smoke shader',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);try{const b=composeToxicFog(kit,38,.2)[0],mesh=new Mesh('toxic-fog',scene);mesh.metadata={role:'planet',planetWeather:true,trianglePlacementRanges:b.ranges};const data=new VertexData();Object.assign(data,b);data.applyToMesh(mesh);const material=referenceMaterial(scene,kit.materials[0]);mesh.material=material;expect(material.needAlphaBlending()).toBe(true);expect(material.useAlphaFromAlbedoTexture).toBe(true);expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(true);expect(material.emissiveColor.asArray()).toEqual([0,0,0]);}finally{scene.dispose();engine.dispose();}
});
it('keeps three closed density layers bounded with air-like IOR and decreasing fringe opacity',()=>{
 expect(kit.materials.map((m:{alpha:number})=>m.alpha)).toEqual([.30,.56,.85]);
 for(const m of kit.materials)expect(m.ior).toBe(1);
 const batches=composeToxicFog(kit,38,1);expect(batches).toHaveLength(3);expect(batches.reduce((sum,b)=>sum+b.indices.length/3,0)).toBeLessThan(25000);
 for(const b of batches){expect(b.ranges.map(r=>r.partId)).toEqual(batches[0].ranges.map(r=>r.partId));expect([...b.positions,...b.normals,...b.uvs].every(Number.isFinite)).toBe(true);}
});
