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
const g=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(folder+'/equipment/heavy-handgun.glb')),s,undefined,'.glb');g.addAllToScene();const p=new TransformNode('held',s);p.parent=c.sockets.handR;for(const r of g.rootNodes)r.parent=p;
solver.bind(bindPoseEquipment(p,g.rootNodes[0] as TransformNode,POSE_REVIEW_ITEMS['heavy-handgun'],c.root));
const results=[];const profile=EQUIPMENT_POSE_PROFILES.PISTOL_TWO_HAND;
for(const x of [0,.02,.04,.06,.08,.10])for(const y of [1.02,1.06,1.10,1.14,1.18])for(const z of [-.35,-.37,-.39,-.41]){
 profile.gripOffset=[x,y,z];
 s.onBeforeAnimationsObservable.notifyObservers(s);solver.update({yaw:0,pitch:0,facing:0,active:true,profile:'PISTOL_TWO_HAND',reducedMotion:true},.1);s.onAfterAnimationsObservable.notifyObservers(s);
 const d=solver.diagnostics;results.push({x,y,z,primary:d.primaryErrorM,support:d.supportErrorM,arm:d.upperArmPenetrationM,body:d.penetrationM,status:d.status,score:d.primaryErrorM*100+d.supportErrorM*80+d.upperArmPenetrationM*1000+d.penetrationM*10000});
}
results.sort((a,b)=>a.score-b.score);console.log(results.slice(0,20));
writeFileSync(folder+'/pistol-fit-search.json',JSON.stringify(results,null,2));
c.dispose();g.dispose();s.dispose();e.dispose();
