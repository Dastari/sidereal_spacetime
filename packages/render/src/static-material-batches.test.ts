import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import {expect,test} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {batchStaticMaterials} from './static-material-batches';

test('static cargo batches retain exact material identity, transparent separation and transformed geometry',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('author-root',scene);
 root.position.x=3;
 const paint=new PBRMaterial('paint',scene),glass=new PBRMaterial('glass',scene);glass.alpha=.3;
 const a=CreateBox('a',{},scene),b=CreateBox('b',{},scene),c=CreateBox('gauge',{},scene);
 a.material=b.material=paint;c.material=glass;a.parent=b.parent=root;b.position.x=2;
 const indices=a.getTotalIndices()+b.getTotalIndices()+c.getTotalIndices();
 const result=batchStaticMaterials([a,b,c]);
 expect(result).toHaveLength(2);expect(result.reduce((sum,m)=>sum+m.getTotalIndices(),0)).toBe(indices);
 const body=result.find(m=>m.material===paint)!;body.computeWorldMatrix(true);
 expect(body.getBoundingInfo().boundingBox.minimumWorld.x).toBeCloseTo(2.5);
 expect(body.getBoundingInfo().boundingBox.maximumWorld.x).toBeCloseTo(5.5);
 expect(result.find(m=>m.material===glass)).toBe(c);expect(glass.alpha).toBe(.3);
 expect(body.isVisible).toBe(false);expect(body.isPickable).toBe(false);
 scene.dispose();engine.dispose();
});

test('same-material cargo preserves UV-less, UV and tangent channels in separate compatible batches',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),paint=new PBRMaterial('shared cargo paint',scene);
 paint.metallic=.25;paint.roughness=.46;
 const withUV=[CreateBox('uv-a',{},scene),CreateBox('uv-b',{},scene)];
 const withoutUV=[CreateBox('flat-a',{},scene),CreateBox('flat-b',{},scene)];
 const withTangents=[CreateBox('mapped-a',{},scene),CreateBox('mapped-b',{},scene)];
 for(const mesh of withoutUV)mesh.removeVerticesData(VertexBuffer.UVKind);
 for(const mesh of withTangents)mesh.setVerticesData(VertexBuffer.TangentKind,
  Array.from({length:mesh.getTotalVertices()*4},(_,i)=>i%4===0||i%4===3?1:0));
 const sources=[...withUV,...withoutUV,...withTangents];
 for(const mesh of sources)mesh.material=paint;
 const indices=sources.reduce((sum,mesh)=>sum+mesh.getTotalIndices(),0);
 const uv=withUV.flatMap(mesh=>Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!));
 const tangents=withTangents.flatMap(mesh=>Array.from(mesh.getVerticesData(VertexBuffer.TangentKind)!));
 // Previously throws at the mixed UV/no-UV group, exactly like both placed GLBs.
 const result=batchStaticMaterials(sources);
 expect(result).toHaveLength(3);
 expect(result.reduce((sum,mesh)=>sum+mesh.getTotalIndices(),0)).toBe(indices);
 for(const mesh of result)expect(mesh.material).toBe(paint);
 expect(paint.metallic).toBe(.25);expect(paint.roughness).toBe(.46);
 const flat=result.find(mesh=>!mesh.isVerticesDataPresent(VertexBuffer.UVKind))!;
 expect(flat.getVerticesDataKinds().sort()).toEqual(['normal','position']);
 const mapped=result.find(mesh=>mesh.isVerticesDataPresent(VertexBuffer.TangentKind))!;
 expect(Array.from(mapped.getVerticesData(VertexBuffer.TangentKind)!)).toEqual(tangents);
 const textured=result.find(mesh=>mesh!==flat&&mesh!==mapped)!;
 expect(textured.getVerticesDataKinds().sort()).toEqual(['normal','position','uv']);
 expect(Array.from(textured.getVerticesData(VertexBuffer.UVKind)!)).toEqual(uv);
 scene.dispose();engine.dispose();
});


test("opaque MultiMaterial prototypes split by authored submesh material and retain source ranges",()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=CreateBox("multi",{},scene);
 const a=new PBRMaterial("a",scene),b=new PBRMaterial("b",scene),multi=new MultiMaterial("multi",scene);
 multi.subMaterials=[a,b];mesh.material=multi;mesh.subMeshes=[];
 new SubMesh(0,0,mesh.getTotalVertices(),0,18,mesh);new SubMesh(1,0,mesh.getTotalVertices(),18,18,mesh);
 const id=mesh.uniqueId, result=batchStaticMaterials([mesh],"cargo");
 expect(result).toHaveLength(2);expect(result.map(m=>m.material)).toEqual([a,b]);
 for(const m of result){expect(m.getTotalIndices()).toBe(18);expect(m.metadata.role).toBe("cargo");expect(m.metadata.triangleSources).toEqual([{start:0,count:6,sourceMeshId:id}]);}
 scene.dispose();engine.dispose();
});
