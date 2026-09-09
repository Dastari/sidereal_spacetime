import {it,expect} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {tracePhysicalBeam} from './physical-beam';
it('clips physical muzzle forward and never retains a stale cursor/world endpoint',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=CreateBox('wall',{size:1},scene);wall.material=new StandardMaterial('solid',scene);wall.position.z=-2;wall.computeWorldMatrix(true);const blockers=new Set([wall]);
 const first=tracePhysicalBeam(scene,{position:Vector3.Zero(),direction:new Vector3(0,0,-2)},10,blockers)!;expect(first.end.z).toBeCloseTo(-1.5);
 const next=tracePhysicalBeam(scene,{position:new Vector3(1,0,0),direction:Vector3.Right()},10,blockers)!;expect(next.end.asArray()).toEqual([11,0,0]);expect(next.direction.asArray()).toEqual([1,0,0]);
 expect(tracePhysicalBeam(scene,{position:Vector3.Zero(),direction:Vector3.Zero()},10,blockers)).toBeUndefined();scene.dispose();engine.dispose();
});
