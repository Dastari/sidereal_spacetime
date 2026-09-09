import { expect, test, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { updateHullDecals } from './hull-decals';
import type { HullDecal } from '../../content/src/hull-decals';
const decal: HullDecal = {id:'name',kind:'text',text:'WF-01',position:[1,2,3],size:[2,.5],rotation:0,color:'#dddddd'};
test('bounded paint geometry inherits cutaway/transforms, compensates mirror and releases shared materials', () => {
 vi.stubGlobal('OffscreenCanvas',class {width=512;height=256;getContext(){return {clearRect(){},fillText(){}}}});
 const engine=new NullEngine(),scene=new Scene(engine),a=new TransformNode('a',scene),b=new TransformNode('b',scene);
 const [paint]=updateHullDecals(scene,a,[decal]),[copy]=updateHullDecals(scene,b,[decal]);
 expect(paint.getTotalVertices()).toBe(4);expect(paint.getTotalIndices()).toBe(6);
 expect(paint.material).toBe(copy.material);expect(scene.lights).toHaveLength(0);
 expect(paint.position.asArray()).toEqual([1,3,-2]);
 a.setEnabled(false);expect(paint.isEnabled()).toBe(false);a.setEnabled(true);
 expect(updateHullDecals(scene,a,[decal])[0]).toBe(paint);
 const material=copy.material!;
 expect(material.getClassName()).toBe('PBRMaterial');
 for (const face of ['top','front','right','left'] as const) {
  const side=new TransformNode(face,scene);
  const [mark]=updateHullDecals(scene,side,[{...decal,face,rotation:.7}]);
  const p=mark.getVerticesData('position')!,n=mark.getVerticesData('normal')!;
  expect(p.every(Number.isFinite)).toBe(true);
  if(face==='left')expect(n.slice(0,3)).toEqual([-1,0,0]);
  if(face==='right')expect(n.slice(0,3)).toEqual([1,0,0]);
  const u=p.slice(3,6).map((v,i)=>v-p[i]),v=p.slice(6,9).map((v,i)=>v-p[i]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  expect(cross.reduce((sum,x,i)=>sum+x*n[i],0)).toBeGreaterThan(0);
  side.dispose();
 }
 const [flipped]=updateHullDecals(scene,a,[decal],true);
 expect(flipped.getVerticesData('uv')).toEqual([1,1,0,1,0,0,1,0]);
 expect(flipped.material).toBe(material);
 a.dispose();expect(scene.materials).toContain(material);
 b.dispose();expect(scene.materials).not.toContain(material);expect(scene.textures.some(t=>t.name==='hull-paint')).toBe(false);
 scene.dispose();engine.dispose();vi.unstubAllGlobals();
});
