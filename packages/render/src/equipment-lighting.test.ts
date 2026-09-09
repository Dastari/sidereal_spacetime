import { expect, test } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { createEquipmentLighting } from './equipment-lighting';
import type { PartLight } from '../../content/src/assembly';
const fixture:PartLight={position:[.4,.1,1.5],direction:[0,0,-1],color:[1,.8,.6],intensity:.8,range:1.6,angle:1.9};
test('grow fixtures point down, follow their placement and illuminate only its meshes',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),parent=new TransformNode('tray',scene);
 const own=CreateBox('leaves',{},scene),other=CreateBox('neighbour',{},scene);own.parent=parent;
 const rig=createEquipmentLighting(scene,parent,[fixture]);rig.setMeshes([own]);const light=rig.lights[0]!;
 expect(light.position.asArray()).toEqual([.4,1.5,-.1]);expect(light.direction.y).toBe(-1);
 expect(light.canAffectMesh(own)).toBe(true);expect(light.canAffectMesh(other)).toBe(false);
 parent.position.set(10,2,3);parent.computeWorldMatrix(true);light.computeTransformedInformation();
 expect(light.transformedPosition!.asArray()).toEqual([10.4,3.5,2.9]);
 parent.setEnabled(false);expect(light.isEnabled()).toBe(false);
 rig.dispose();expect(scene.lights).toHaveLength(0);scene.dispose();engine.dispose();
});
test('fixture budgets and finite bounded inputs survive malformed catalog data',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),parent=new TransformNode('tray',scene);
 const rig=createEquipmentLighting(scene,parent,[{...fixture,intensity:100,range:100},fixture,fixture]);
 expect(rig.lights).toHaveLength(2);expect(rig.lights[0]!.intensity).toBe(2);expect(rig.lights[0]!.range).toBe(3);
 const invalid=createEquipmentLighting(scene,parent,[{...fixture,direction:[0,0,0]},{...fixture,position:[NaN,0,0]}]);expect(invalid.lights).toHaveLength(0);
 scene.dispose();engine.dispose();
});
