import {expect,it}from'vitest';
import {NullEngine}from'@babylonjs/core/Engines/nullEngine';
import {Scene}from'@babylonjs/core/scene';
import {TransformNode}from'@babylonjs/core/Meshes/transformNode';
import {MeshBuilder}from'@babylonjs/core/Meshes/meshBuilder';
import {PBRMaterial}from'@babylonjs/core/Materials/PBR/pbrMaterial';
import {Vector3}from'@babylonjs/core/Maths/math.vector';
import {createPlanetReferenceLocalLights,resolvePlanetEmitterAnchor,type AuthoredPlanetEmitter,type PlacementLightBatch}from'./planet_reference_local_lights';
const emitter=(partId:string):AuthoredPlanetEmitter=>({partId,color:[1,.02,.3],range:.4,intensity:.02});
const batches:PlacementLightBatch[]=[{positions:[1,0,0,1,.2,0,1,0,.2,0,1,0,.2,1,0,0,1,.2,-1,0,0,-1,-.2,0,-1,0,.2,0,-1,0,.2,-1,0,0,-1,.2],indices:[0,1,2,3,4,5,6,7,8,9,10,11],ranges:[0,1,2,3].map(i=>({firstTriangle:i,triangleCount:1,partId:`authored-${i}`}))}];
function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('body',scene),otherRoot=new TransformNode('other-body',scene),material=new PBRMaterial('body-shared-PBR',scene);
 const mesh=MeshBuilder.CreateSphere('arbitrary-render-name',{},scene);mesh.parent=root;mesh.metadata={role:'planet'};mesh.material=material;
 const other=MeshBuilder.CreateSphere('unrelated',{},scene);other.parent=otherRoot;other.metadata={role:'planet'};other.material=new PBRMaterial('other-PBR',scene);
 return{engine,scene,root,mesh,other,material,options:{scene,bodyId:'body-id',bodyRoot:root,meshes:[mesh],batches,emitters:[0,1,2,3].map(i=>emitter(`authored-${i}`))},dispose(){scene.dispose();engine.dispose();}};
}
it('NullEngine bounds four body-owned PBR lights without extra meshes or shadow generators',()=>{
 const f=fixture();try{
  const beforeMeshes=f.scene.meshes.length,beforeMaterials=f.scene.materials.length,lights=createPlanetReferenceLocalLights(f.options);
  expect(lights.lights).toHaveLength(4);expect(f.scene.meshes).toHaveLength(beforeMeshes);expect(f.scene.materials).toHaveLength(beforeMaterials);
  expect(f.material.maxSimultaneousLights).toBe(6);
  for(const [index,light]of lights.lights.entries()){
   expect(light.metadata).toEqual({role:'planet-local-light',bodyId:'body-id',partId:`authored-${index}`});expect(light.parent).toBe(f.root);
   expect(light.canAffectMesh(f.mesh)).toBe(true);expect(light.canAffectMesh(f.other)).toBe(false);expect(light.shadowEnabled).toBe(false);expect(light.getShadowGenerator()).toBeNull();
  }
  lights.dispose();expect(f.scene.lights).toHaveLength(0);expect(f.material.maxSimultaneousLights).toBe(4);expect(f.mesh.material).toBe(f.material);
 }finally{f.dispose();}
});
it('retained LOD replacement reuses lights and shared materials, disables an empty include list and obeys Lighting Off',()=>{
 const f=fixture();try{
  const owner=createPlanetReferenceLocalLights(f.options),identities=owner.lights.map(l=>l.uniqueId),positions=owner.lights.map(l=>l.position.clone());
  const next=MeshBuilder.CreateSphere('any-lod-name',{},f.scene);next.parent=f.root;next.metadata={role:'planet'};next.material=f.material;
  owner.replaceMeshes([f.mesh,next]);expect(owner.lights.map(l=>l.uniqueId)).toEqual(identities);expect(owner.lights.map(l=>l.position)).toEqual(positions);expect(next.material).toBe(f.mesh.material);
  owner.setEnabled(false);expect(owner.lights.every(l=>!l.isEnabled())).toBe(true);owner.replaceMeshes([next]);expect(owner.lights.every(l=>!l.isEnabled())).toBe(true);
  owner.setEnabled(true);expect(owner.lights.every(l=>l.canAffectMesh(next)&&!l.canAffectMesh(f.mesh))).toBe(true);
  owner.replaceMeshes([]);expect(owner.lights.every(l=>!l.isEnabled())).toBe(true);
  owner.replaceMeshes([next]);expect(owner.lights.every(l=>l.isEnabled())).toBe(true);
  f.root.dispose();expect(owner.disposed).toBe(true);expect(f.scene.lights).toHaveLength(0);expect(f.material.maxSimultaneousLights).toBe(4);owner.dispose();
 }finally{f.dispose();}
});
it('rejects arbitrary truncation, foreign meshes and cross-body material mutation before allocating lights',()=>{
 const f=fixture();try{
  expect(()=>createPlanetReferenceLocalLights({...f.options,emitters:[...f.options.emitters,emitter('fifth')]})).toThrow('At most four');
  expect(()=>createPlanetReferenceLocalLights({...f.options,meshes:[f.other]})).toThrow('body-owned');
  f.other.material=f.material;expect(()=>createPlanetReferenceLocalLights(f.options)).toThrow('material shared with another body');
  expect(f.scene.lights).toHaveLength(0);expect(f.material.maxSimultaneousLights).toBe(4);
 }finally{f.dispose();}
});
it('resolves indexed placement triangles rather than names and keeps anchors independent of tessellation order',()=>{
 const anchor=resolvePlanetEmitterAnchor(batches,emitter('authored-0'));
 const reordered=[{...batches[0],indices:[2,0,1,...Array.from(batches[0].indices).slice(3)]}];expect(resolvePlanetEmitterAnchor(reordered,emitter('authored-0')).equalsWithEpsilon(anchor,1e-12)).toBe(true);
 expect(()=>resolvePlanetEmitterAnchor(batches,emitter('missing'))).toThrow('Missing non-degenerate');
 expect(()=>resolvePlanetEmitterAnchor(batches,{...emitter('authored-0'),materialRoles:[1]})).toThrow('Missing non-degenerate');
 expect(anchor.x).toBeGreaterThan(.99);expect(anchor.length()).toBeLessThan(1.05);
});
it('follows body transform and scales range and physical intensity consistently without changing anchors',()=>{
 const f=fixture();try{
  const owner=createPlanetReferenceLocalLights(f.options),anchor=owner.lights[0].position.clone();f.root.scaling.setAll(3);f.root.position.set(10,2,-1);owner.syncWorldScale();
  expect(owner.lights[0].position).toEqual(anchor);expect(owner.lights[0].range).toBeCloseTo(1.2);expect(owner.lights[0].intensity).toBeCloseTo(.18);
  expect(Vector3.TransformCoordinates(anchor,f.root.getWorldMatrix())).toEqual(anchor.scale(3).add(f.root.position));
  f.root.scaling.x=4;expect(()=>owner.syncWorldScale()).toThrow('uniform');owner.dispose();
 }finally{f.dispose();}
});
