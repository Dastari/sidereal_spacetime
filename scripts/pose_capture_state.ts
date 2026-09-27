import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {createCrewVisual} from '../packages/render/src/crew';
import {bindPoseEquipment} from '../packages/render/src/equipment/pose-anchors';
import {boxPenetration} from '../packages/render/src/crew/pose-math';
import {POSE_REVIEW_ITEMS} from '../packages/render/src/crew/pose-review-items';
const asset=process.argv[2]??'carbine';
const folder='assets/art-library/designs/crew.animation.aim/revisions/r002',e=new NullEngine(),s=new Scene(e);s.useRightHandedSystem=true;const ship=new TransformNode('ship',s);
const c=await createCrewVisual(s,ship,new Uint8Array(readFileSync(folder+'/crew-poses.glb')));c.customize({outfit:'marine',weaponFixture:false});c.update({moving:false,seated:false,reducedMotion:true});const solver=c.createPoseController();solver.setAimSpace(JSON.parse(readFileSync(folder+'/runtime-aim-space.json','utf8')));
const g=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync(folder+'/equipment/'+asset+'.glb')),s,undefined,'.glb');g.addAllToScene();const p=new TransformNode('held',s);p.parent=c.sockets.handR;for(const r of g.rootNodes)r.parent=p;
solver.bind(bindPoseEquipment(p,g.rootNodes[0] as TransformNode,POSE_REVIEW_ITEMS[asset],c.root));
for(let f=0;f<20;f++){s.onBeforeAnimationsObservable.notifyObservers(s);solver.update({yaw:0,pitch:0,facing:0,active:true,profile:POSE_REVIEW_ITEMS[asset].profile,reducedMotion:true},.1);s.onAfterAnimationsObservable.notifyObservers(s);}
const bones=Object.fromEntries(s.transformNodes.filter(n=>/^(root|pelvis|spine|head|upper_arm\.[LR]|forearm\.[LR]|hand\.[LR]|thigh\.[LR]|shin\.[LR]|foot\.[LR])$/.test(n.name)).map(n=>[n.name,Array.from(n.computeWorldMatrix(true).m)]));
writeFileSync(folder+(asset==='carbine'?'/solved-pose.json':'/solved-'+asset+'.json'),JSON.stringify({bones,equipment:Array.from(g.rootNodes[0].computeWorldMatrix(true).m),diagnostics:solver.diagnostics},null,2));console.log(solver.diagnostics.weapon.flatMap(w=>solver.diagnostics.body.map(b=>({weapon:w.name,body:b.name,depth:boxPenetration(w,b)})).filter(x=>x.depth>0)));console.log(solver.diagnostics.status,solver.diagnostics.primaryErrorM,solver.diagnostics.supportErrorM);c.dispose();g.dispose();s.dispose();e.dispose();
