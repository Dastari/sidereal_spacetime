import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {createCrewVisual} from './index';
import {bindPoseEquipment} from '../equipment/pose-anchors';
import {POSE_REVIEW_ITEMS} from './pose-review-items';
import {EQUIPMENT_POSE_PROFILES} from '../../../content/src/equipment-poses';
const folder=new URL('../../../../assets/art-library/designs/crew.animation.aim/revisions/r002/',import.meta.url);
for(const rightHanded of [false,true])it(`actual staged rig preserves looks, physical grips, pause, hidden and disposal (${rightHanded})`,async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=rightHanded;const ship=new TransformNode('ship',scene);ship.rotation.y=.7;
 const crew=await createCrewVisual(scene,ship,new Uint8Array(readFileSync(new URL('crew-poses.glb',folder))));crew.customize({outfit:'marine',weaponFixture:false});crew.update({moving:false,seated:false,reducedMotion:true});
 expect(scene.skeletons[0].bones).toHaveLength(16);expect(scene.animationGroups).toHaveLength(75);
 const solver=crew.createPoseController();solver.setAimSpace(JSON.parse(readFileSync(new URL('runtime-aim-space.json',folder),'utf8')));
 const gear=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(new URL('equipment/carbine.glb',folder))),scene,undefined,'.glb');gear.addAllToScene();const placement=new TransformNode('equipment',scene);placement.parent=crew.sockets.handR;for(const root of gear.rootNodes)root.parent=placement;
 solver.bind(bindPoseEquipment(placement,gear.rootNodes[0] as TransformNode,POSE_REVIEW_ITEMS.carbine,crew.root));
 const intent={yaw:0,pitch:0,facing:0,active:true,reducedMotion:true,profile:'RIFLE' as const,itemId:'item-a',shotSequence:3n};
 const step=(dt=0,overrides={})=>{scene.onBeforeAnimationsObservable.notifyObservers(scene);solver.update({...intent,...overrides},dt);scene.onAfterAnimationsObservable.notifyObservers(scene);};
 step();const muzzle=solver.diagnostics.muzzle!.position.clone();expect(solver.diagnostics.primaryErrorM).toBeLessThan(.004);expect(solver.diagnostics.supportErrorM).toBeLessThan(.025);expect(solver.diagnostics.penetrationM).toBe(0);expect(solver.diagnostics.upperArmPenetrationM).toBeLessThan(.005);
 for(let i=0;i<30;i++)step();expect(Vector3.Distance(muzzle,solver.diagnostics.muzzle!.position)).toBeLessThan(1e-5);
 const appearances=['captain','engineer','medic','pilot','security','marine','salvage','recon','scientist','mechanic'] as const;
 for(const outfit of appearances){crew.customize({outfit,weaponFixture:false});step();expect(solver.diagnostics.muzzle!.position.asArray().every(Number.isFinite)).toBe(true);}
 step(.1,{hidden:true,shotSequence:4n});expect(solver.diagnostics.status).toBe('hidden');expect(solver.diagnostics.iterations).toBe(0);expect(solver.diagnostics.muzzle).toBeUndefined();
 step(0,{shotSequence:4n});expect(Vector3.Distance(muzzle,solver.diagnostics.muzzle!.position)).toBeLessThan(1e-5);
 step(.1,{seated:true});expect(solver.diagnostics.muzzle).toBeUndefined();expect(placement.parent).toBe(crew.sockets.handR);
 expect(crew.root.position.asArray()).toEqual([0,0,0]);expect(ship.rotation.y).toBe(.7);
 // Reuse the same measured sockets with a left-primary profile, not a bespoke animation.
 EQUIPMENT_POSE_PROFILES.RIFLE.primaryHand='L';try{step(0);expect(solver.diagnostics.primaryErrorM).toBeLessThan(.04);}finally{EQUIPMENT_POSE_PROFILES.RIFLE.primaryHand='R';}
 crew.dispose();expect(solver.diagnostics.status).toBe('disposed');expect(solver.diagnostics.muzzle).toBeUndefined();expect(solver.isBound).toBe(false);expect(ship.isDisposed()).toBe(false);gear.dispose();scene.dispose();engine.dispose();
});

it('all staged profiles have feasible heavy-armor neutral grips and clearance',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),ship=new TransformNode('ship',scene);
 const crew=await createCrewVisual(scene,ship,new Uint8Array(readFileSync(new URL('crew-poses.glb',folder))));crew.customize({outfit:'marine',weaponFixture:false});crew.update({moving:false,seated:false,reducedMotion:true});const solver=crew.createPoseController();solver.setAimSpace(JSON.parse(readFileSync(new URL('runtime-aim-space.json',folder),'utf8')));
 for(const asset of ['carbine','long-rifle','heavy-handgun','compact-pistol','flashlight','sample-scanner','plasma-cutter']){
  const item=POSE_REVIEW_ITEMS[asset],gear=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(new URL(`equipment/${asset}.glb`,folder))),scene,undefined,'.glb');gear.addAllToScene();const held=new TransformNode(asset,scene);held.parent=crew.sockets.handR;for(const root of gear.rootNodes)root.parent=held;
  solver.bind(bindPoseEquipment(held,gear.rootNodes[0] as TransformNode,item,crew.root));
  scene.onBeforeAnimationsObservable.notifyObservers(scene);solver.update({yaw:0,pitch:0,facing:0,active:true,reducedMotion:true,profile:item.profile,itemId:asset},0);scene.onAfterAnimationsObservable.notifyObservers(scene);
  const d=solver.diagnostics;expect(['solved','fallback'],asset).toContain(d.status);expect(d.primaryErrorM,asset).toBeLessThan(.004);expect(d.supportErrorM,asset).toBeLessThan(.025);expect(d.shoulderErrorM,asset).toBeLessThan(.13);expect(d.penetrationM,asset).toBe(0);expect(d.upperArmPenetrationM,asset).toBeLessThan(.005);
  solver.bind(undefined);expect(solver.isBound).toBe(false);expect(solver.diagnostics.muzzle).toBeUndefined();gear.dispose();held.dispose();
 }
 crew.dispose();scene.dispose();engine.dispose();
});
