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
const g=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(folder+'/equipment/sample-scanner.glb')),s,undefined,'.glb');g.addAllToScene();const p=new TransformNode('held',s);p.parent=c.sockets.handR;for(const r of g.rootNodes)r.parent=p;
solver.bind(bindPoseEquipment(p,g.rootNodes[0] as TransformNode,POSE_REVIEW_ITEMS['sample-scanner'],c.root));
const results=[];const profile=EQUIPMENT_POSE_PROFILES.HANDHELD_DEVICE;
for(const x of [.2,.25,.3,.35,.4])for(const y of [1.0,1.05,1.1])for(const z of [-.32,-.37,-.42,-.47])for(const roll of [0,.3,-.3,.6,-.6]){
 profile.screenGripOffset=[x,y,z];profile.screenRoll=roll;
 s.onBeforeAnimationsObservable.notifyObservers(s);solver.update({yaw:0,pitch:0,facing:0,active:true,profile:'HANDHELD_DEVICE',reducedMotion:true},.1);s.onAfterAnimationsObservable.notifyObservers(s);
 const d=solver.diagnostics;results.push({x,y,z,roll,primary:d.primaryErrorM,arm:d.upperArmPenetrationM,body:d.penetrationM,status:d.status});
}
results.sort((a,b)=>a.primary*100+a.arm*1000+a.body*10000-b.primary*100-b.arm*1000-b.body*10000);console.log(results.slice(0,20));
writeFileSync(folder+'/screen-fit-search.json',JSON.stringify(results,null,2));
c.dispose();g.dispose();s.dispose();e.dispose();
