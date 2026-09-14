import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {createCrewVisual} from '../packages/render/src/crew';
import {bindPoseEquipment} from '../packages/render/src/equipment/pose-anchors';
import {EQUIPMENT_POSE_PROFILES} from '../packages/content/src/equipment-poses';
import {POSE_REVIEW_ITEMS} from '../packages/render/src/crew/pose-review-items';
const folder='assets/art-library/designs/crew.animation.aim/revisions/r002',e=new NullEngine(),s=new Scene(e);s.useRightHandedSystem=true;const ship=new TransformNode('ship',s);
const c=await createCrewVisual(s,ship,new Uint8Array(readFileSync(folder+'/crew-poses.glb')));c.customize({outfit:'marine',weaponFixture:false});c.update({moving:false,seated:false,reducedMotion:true});const solver=c.createPoseController();solver.setAimSpace(JSON.parse(readFileSync(folder+'/runtime-aim-space.json','utf8')));
const g=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(folder+'/equipment/long-rifle.glb')),s,undefined,'.glb');g.addAllToScene();const p=new TransformNode('held',s);p.parent=c.sockets.handR;for(const r of g.rootNodes)r.parent=p;
solver.bind(bindPoseEquipment(p,g.rootNodes[0] as TransformNode,POSE_REVIEW_ITEMS['long-rifle'],c.root));
const results=[];const profile=EQUIPMENT_POSE_PROFILES.LONG_RIFLE;
for(const stance of [.85,1.1,1.3])for(const x of [-.06,0,.06])for(const y of [.16,.12,.08,.04,0,-.04])for(const z of [.16,.24,.32]){
 profile.shoulderPocketOffset=[x,y,z];profile.stanceYaw=stance;
 s.onBeforeAnimationsObservable.notifyObservers(s);solver.update({yaw:0,pitch:0,facing:0,active:true,profile:'LONG_RIFLE',reducedMotion:true},.1);s.onAfterAnimationsObservable.notifyObservers(s);
 const d=solver.diagnostics;results.push({x,y,z,stance,primary:d.primaryErrorM,support:d.supportErrorM,eye:d.eyeErrorM,shoulder:d.shoulderErrorM,arm:d.upperArmPenetrationM,body:d.penetrationM,status:d.status,score:d.eyeErrorM*10+d.penetrationM*10000+d.upperArmPenetrationM*1000+d.primaryErrorM*100+d.supportErrorM*50+Math.max(0,d.shoulderErrorM-.07)*10});
}
results.sort((a,b)=>a.score-b.score);console.log(results.slice(0,20));
writeFileSync(folder+'/scope-fit-search.json',JSON.stringify(results,null,2));
c.dispose();g.dispose();s.dispose();e.dispose();
