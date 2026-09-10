import { setMeshRole } from './mesh-roles';
import {tracePhysicalBeam} from './equipment/physical-beam';
import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {Vector3,Matrix} from '@babylonjs/core/Maths/math.vector';
import {Ray} from '@babylonjs/core/Culling/ray';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';

/** Local aiming and laser feedback, never a damage/hit authority source. */
export function createCombatAim(scene:Scene,canvas:HTMLCanvasElement,ship:TransformNode,occluders:AbstractMesh[]) {
  let pointer:{x:number;y:number}|undefined;
  const blockers=new Set(occluders);
  const beam=CreateBox('rifle-laser-beam',{size:1},scene);
  setMeshRole(beam, 'effect');
  const dot=CreateBox('rifle-laser-target',{size:.08},scene);
  setMeshRole(dot, 'effect');
  const material=new StandardMaterial('rifle-laser-light',scene);
  material.disableLighting=true;material.emissiveColor=new Color3(.15,1,.35);material.diffuseColor=Color3.Black();
  for(const mesh of [beam,dot]){mesh.material=material;mesh.isPickable=false;mesh.setEnabled(false);}
  let collisionTimer=0,endpoint:Vector3|undefined;
  function aim(localX:number,localY:number,range=60) {
    if(!pointer || !scene.activeCamera)return;
    const rect=canvas.getBoundingClientRect();
    const ray=scene.createPickingRay(pointer.x-rect.left,pointer.y-rect.top,Matrix.Identity(),scene.activeCamera);
    const height=ship.getAbsolutePosition().y+1.3;
    if(Math.abs(ray.direction.y)<1e-6)return;
    const distance=(height-ray.origin.y)/ray.direction.y;
    if(distance<0)return;
    const world=ray.origin.add(ray.direction.scale(distance));
    const inverse=ship.computeWorldMatrix(true).clone().invert();
    const local=Vector3.TransformCoordinates(world,inverse);
    const dx=local.x-localX,dy=-local.z-localY,length=Math.hypot(dx,dy);
    if(length<.05)return;
    const ratio=Math.min(1,range/length);
    local.x=localX+dx*ratio;local.z=-localY-dy*ratio;
    return {angle:Math.atan2(dx,dy),target:Vector3.TransformCoordinates(local,ship.getWorldMatrix())};
  }
  return {
    meshes:[beam,dot],
    pointer(x:number,y:number){pointer={x,y};collisionTimer=0;},
    aim,
    update(active:boolean,muzzle:{position:Vector3;direction:Vector3}|undefined,localX:number,localY:number,dt:number,range=60) {
      const ray=active&&muzzle?tracePhysicalBeam(scene,muzzle,range,blockers):undefined;
      beam.setEnabled(!!ray);dot.setEnabled(!!ray);
      if(!ray || !muzzle){endpoint=undefined;return;}
      endpoint=ray.end;
      beam.position.copyFrom(muzzle.position.add(endpoint).scale(.5));
      beam.scaling.set(.012,.012,Vector3.Distance(muzzle.position,endpoint));
      beam.lookAt(endpoint);
      dot.position.copyFrom(endpoint);
    },
    dispose(){beam.dispose();dot.dispose();material.dispose();},
  };
}
