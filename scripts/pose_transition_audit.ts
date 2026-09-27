import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {createCrewVisual} from '../packages/render/src/crew';
import {bindPoseEquipment} from '../packages/render/src/equipment/pose-anchors';
import {POSE_REVIEW_ITEMS} from '../packages/render/src/crew/pose-review-items';
import type {EquipmentPoseType} from '../packages/content/src/equipment-poses';
const folder='assets/art-library/designs/crew.animation.aim/revisions/r002',results:unknown[]=[],costs:number[]=[];
const cases:Array<[string,EquipmentPoseType,boolean?]>=[['carbine','RIFLE'],['long-rifle','RIFLE'],['long-rifle','LONG_RIFLE'],['heavy-handgun','PISTOL_TWO_HAND'],['compact-pistol','PISTOL_ONE_HAND'],['flashlight','FLASHLIGHT'],['sample-scanner','HANDHELD_DEVICE'],['sample-scanner','HANDHELD_DEVICE',true],['plasma-cutter','TOOL']];
for(const rightHanded of [false,true])for(const look of ['marine'] as const){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=rightHanded;
 const ship=new TransformNode('ship',scene);ship.rotation.y=.7;const crew=await createCrewVisual(scene,ship,new Uint8Array(readFileSync(folder+'/crew-poses.glb')));
 crew.customize({outfit:look,weaponFixture:false});crew.update({moving:false,seated:false,reducedMotion:true});const solver=crew.createPoseController();solver.setAimSpace(JSON.parse(readFileSync(folder+'/runtime-aim-space.json','utf8')));
 for(const [asset,profile,directed] of cases){
  const item={...POSE_REVIEW_ITEMS[asset],profile,...(directed?{deviceMode:'DIRECTED_DEVICE' as const}:{})};
  const gear=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(folder+'/equipment/'+asset+'.glb')),scene,undefined,'.glb');gear.addAllToScene();const node=new TransformNode('equipment',scene);node.parent=crew.sockets.handR;for(const r of gear.rootNodes)r.parent=node;
  solver.bind(bindPoseEquipment(node,gear.rootNodes[0] as TransformNode,item,crew.root));
  let failed=0,maxPrimary=0,maxSupport=0,maxPenetration=0;
  for(let frame=0;frame<240;frame++){
   const yaw=frame<60?0:frame<120?135:-135,pitch=frame<90?0:frame<150?60:-60;
   const action=frame<30?'equip':frame<160?'raised':frame<210?'lowered':'raised';
   scene.onBeforeAnimationsObservable.notifyObservers(scene);solver.update({yaw:yaw*Math.PI/180,pitch:pitch*Math.PI/180,facing:0,profile,active:true,reducedMotion:false,action,itemId:asset,shotSequence:frame>110?1n:0n},1/60);scene.onAfterAnimationsObservable.notifyObservers(scene);
   const d=solver.diagnostics;costs.push(d.cpuMs);maxPrimary=Math.max(maxPrimary,d.primaryErrorM);maxSupport=Math.max(maxSupport,d.supportErrorM);maxPenetration=Math.max(maxPenetration,d.penetrationM);if(d.status==='unreachable'||d.status==='clearance-failed')failed++;
   results.push({rightHanded,look,asset,profile,directed:!!directed,frame,yaw,pitch,action,status:d.status,primaryM:d.primaryErrorM,supportM:d.supportErrorM,shoulderM:d.shoulderErrorM,eyeM:d.eyeErrorM,penetrationM:d.penetrationM,upperArmPenetrationM:d.upperArmPenetrationM,aimErrorDegrees:d.aimErrorDegrees,iterations:d.iterations});
  }
  console.log({rightHanded,look,asset,profile,directed,failed,maxPrimary,maxSupport,maxPenetration});solver.bind(undefined);gear.dispose();node.dispose();
 }
 crew.dispose();scene.dispose();engine.dispose();
}
costs.sort((a,b)=>a-b);if(existsSync(folder+'/transition-audit.json'))copyFileSync(folder+'/transition-audit.json',folder+'/transition-audit-'+Date.now()+'.json');writeFileSync(folder+'/transition-audit.json',JSON.stringify({note:'Actual staged GLB rig and equipment; two handedness paths, rotated parent, 240 frames per profile: acquisition, opposite target, accepted recoil, lowering and raising. Failures retained, not acceptance.',samples:results.length,cpuMs:{median:costs[Math.floor(costs.length*.5)],p95:costs[Math.floor(costs.length*.95)],max:costs.at(-1)},results},null,2));
