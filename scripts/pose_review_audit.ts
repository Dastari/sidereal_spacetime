import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {createCrewVisual} from '../packages/render/src/crew';
import {bindPoseEquipment} from '../packages/render/src/equipment/pose-anchors';
import {EQUIPMENT_POSE_ITEMS,EQUIPMENT_POSE_PROFILES} from '../packages/content/src/equipment-poses';
const e=new NullEngine(),s=new Scene(e),p=new TransformNode('ship',s),c=await createCrewVisual(s,p,new Uint8Array(readFileSync('assets/runtime/crew/frontier-crew.glb')));
c.customize({outfit:'marine',weaponFixture:false});c.update({moving:false,seated:false,reducedMotion:true});
const solver=c.createPoseController(),gear=await SceneLoader.LoadAssetContainerAsync('',new Uint8Array(readFileSync('assets/runtime/equipment/carbine.glb')),s,undefined,'.glb');gear.addAllToScene();
const node=new TransformNode('held',s);node.parent=c.sockets.handR;for(const root of gear.rootNodes)root.parent=node;
solver.bind(bindPoseEquipment(node,gear.rootNodes[0] as TransformNode,{...EQUIPMENT_POSE_ITEMS.carbine,sockets:{...EQUIPMENT_POSE_ITEMS.carbine.sockets,'Contact.Shoulder':[0,.075,.18],'Grip.Secondary':[.05,0,-.13]},clearance:EQUIPMENT_POSE_ITEMS.carbine.clearance.map(b=>b.name==='stock'?{...b,center:[0,.075,.15],half:[.073,.11,.05]}:b.name==='receiver'?{...b,half:[.095,.14,b.half[2]]}:b)},p));

const results=[];
for(const yaw of [.95,1.0,1.05,1.1,1.15])for(const x of [.02,.065,.10])for(const z of [-.1,-.15,-.2]){
 EQUIPMENT_POSE_PROFILES.RIFLE.stanceYaw=yaw;EQUIPMENT_POSE_PROFILES.RIFLE.shoulderPocketOffset=[x,-.07,z];
 s.onBeforeAnimationsObservable.notifyObservers(s);solver.update({yaw:0,pitch:0,facing:0,active:true,profile:'RIFLE',reducedMotion:true},1/60);s.onAfterAnimationsObservable.notifyObservers(s);
 const d=solver.diagnostics;results.push({yaw,x,z,primary:d.primaryErrorM,support:d.supportErrorM,contact:d.shoulderErrorM,penetration:d.penetrationM});
}
results.sort((a,b)=>a.primary+a.support+a.contact*.3-b.primary-b.support-b.contact*.3);console.log(results.slice(0,10));
c.dispose();gear.dispose();s.dispose();e.dispose();
