import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Ray} from '@babylonjs/core/Culling/ray';
import type {Scene} from '@babylonjs/core/scene';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
/** Actual physical socket forward ONLY. No cursor argument and no cached world end.
 * Client geometry clipping is visual feedback; never authoritative hit or damage. */
export function tracePhysicalBeam(scene:Scene,muzzle:{position:Vector3;direction:Vector3},range:number,blockers:ReadonlySet<AbstractMesh>){
 if(![...muzzle.position.asArray(),...muzzle.direction.asArray(),range].every(Number.isFinite)||range<=0||muzzle.direction.lengthSquared()<1e-10)return;
 const ray=new Ray(muzzle.position.clone(),muzzle.direction.normalizeToNew(),range);
 const hit=scene.pickWithRay(ray,mesh=>blockers.has(mesh)&&mesh.isEnabled()&&mesh.isVisible&&mesh.visibility>=.995);
 return {origin:ray.origin,direction:ray.direction,end:hit?.hit&&hit.pickedPoint?hit.pickedPoint.clone():ray.origin.add(ray.direction.scale(range))};
}
