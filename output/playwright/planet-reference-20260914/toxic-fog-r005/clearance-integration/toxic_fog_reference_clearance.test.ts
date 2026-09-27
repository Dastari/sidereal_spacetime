import{expect,it}from'vitest';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{NullEngine}from'@babylonjs/core/Engines/nullEngine';import{Scene}from'@babylonjs/core/scene';import{Mesh}from'@babylonjs/core/Meshes/mesh';import{VertexData}from'@babylonjs/core/Meshes/mesh.vertexData';import{Ray}from'@babylonjs/core/Culling/ray';import{Vector3}from'@babylonjs/core/Maths/math.vector';
import{PBRMaterial}from'@babylonjs/core/Materials/PBR/pbrMaterial';
import{composeToxicReference}from'./toxic_reference_composition_r004';import{composeToxicReferenceWeather}from'./toxic_fog_reference_integration';import{composeClearedToxicReferenceWeather}from'./toxic_fog_reference_clearance';
const load=(folder:string)=>JSON.parse(readFileSync(`output/playwright/planet-reference-20260914/${folder}/kit.json`,'utf8')),body=load('toxic-r004'),fog=load('toxic-fog-r005');
it('clears native crust height while preserving density, UV topology and identities across LODs',()=>{
 const batches=composeToxicReference(body,38,0),old=composeToxicReferenceWeather(fog,38,1,batches,[8])!,next=composeClearedToxicReferenceWeather(fog,38,1,batches,[8])!,low=composeClearedToxicReferenceWeather(fog,38,1,composeToxicReference(body,38,2),[8])!;
 expect(next).toEqual(low);expect(next.indices).toEqual(old.indices);expect(next.uvs).toEqual(old.uvs);expect(next.ranges).toEqual(old.ranges);expect(next.anchorClearance).toHaveLength(12);
 for(const r of next.anchorClearance){expect(r.minimumFogRadius-r.terrainRadius).toBeCloseTo(.012,6);expect(r.terrainPartIds).toContain(r.partId);expect(r.correctedRadius).toBeGreaterThan(r.initialRadius+.10);}
 mkdirSync('output/playwright/planet-reference-20260914/toxic-fog-r005/clearance-integration',{recursive:true});writeFileSync('output/playwright/planet-reference-20260914/toxic-fog-r005/clearance-integration/anchor-clearance.json',JSON.stringify(next.anchorClearance,null,2));
});
it('NullEngine rays show fog footprint samples above all actual native body surfaces',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;try{
 const batches=composeToxicReference(body,38,0),weather=composeClearedToxicReferenceWeather(fog,38,1,batches,[8])!;
 const meshes=batches.filter(b=>b.indices.length).map((b,i)=>{const mesh=new Mesh('native-body-'+i,scene);mesh.metadata={role:'planet',trianglePlacementRanges:b.ranges};mesh.material=new PBRMaterial('native-role',scene);const data=new VertexData();Object.assign(data,b);data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;});
 let hits=0;for(const range of weather.ranges)for(let sample=0;sample<12;sample++){
  const triangle=range.firstTriangle+Math.floor(range.triangleCount*sample/12),index=weather.indices[triangle*3]*3,p=Vector3.FromArray(weather.positions,index),n=p.normalizeToNew(),ray=new Ray(n.scale(2),n.negate(),3),intersections=meshes.map(mesh=>ray.intersectsMesh(mesh,false)).filter(hit=>hit.hit).sort((a,b)=>a.distance-b.distance);
  if(!intersections.length)continue;hits++;expect(p.length()-intersections[0].pickedPoint!.length()).toBeGreaterThan(.0119);
 }
 expect(hits).toBeGreaterThan(100);
 }finally{scene.dispose();engine.dispose();}
});
