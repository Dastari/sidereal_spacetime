import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {createCrewVisual} from '../packages/render/src/crew';
import {bindPoseEquipment} from '../packages/render/src/equipment/pose-anchors';
import {POSE_REVIEW_ITEMS} from '../packages/render/src/crew/pose-review-items';
const folder='assets/art-library/designs/crew.animation.aim/revisions/r002',rig=new Uint8Array(readFileSync(folder+'/crew-poses.glb')),gun=new Uint8Array(readFileSync(folder+'/equipment/carbine.glb')),aim=JSON.parse(readFileSync(folder+'/runtime-aim-space.json','utf8')),results=[];
for(const count of [1,16,32]){
 const engine=new NullEngine(),scene=new Scene(engine),ship=new TransformNode('ship',scene);scene.useRightHandedSystem=true;
 const controllers=[];
 for(let i=0;i<count;i++){
  const crew=await createCrewVisual(scene,ship,rig);crew.customize({outfit:i%2?'marine':'engineer',weaponFixture:false});crew.update({moving:false,seated:false,reducedMotion:true});crew.root.position.x=i*2;
  const solver=crew.createPoseController();solver.setAimSpace(aim);const gear=await SceneLoader.LoadAssetContainerAsync('',gun,scene,undefined,'.glb');gear.addAllToScene();const held=new TransformNode('held',scene);held.parent=crew.sockets.handR;for(const node of gear.rootNodes)node.parent=held;solver.bind(bindPoseEquipment(held,gear.rootNodes[0] as TransformNode,POSE_REVIEW_ITEMS.carbine,crew.root));controllers.push(solver);
 }
 for(const hidden of [false,true]){
  const times=[];
  for(let frame=0;frame<90;frame++){
   const start=performance.now();scene.onBeforeAnimationsObservable.notifyObservers(scene);for(const solver of controllers)solver.update({yaw:.8,pitch:.4,facing:0,active:true,profile:'RIFLE',hidden,reducedMotion:true},1/60);scene.onAfterAnimationsObservable.notifyObservers(scene);if(frame>20)times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);results.push({count,hidden,medianTotalMs:times[Math.floor(times.length*.5)],p95TotalMs:times[Math.floor(times.length*.95)],medianPerCharacterMs:times[Math.floor(times.length*.5)]/count,meshCount:scene.meshes.length,materialCount:scene.materials.length});
 }
 for(const solver of controllers)solver.dispose();scene.dispose();engine.dispose();
}
writeFileSync(folder+'/cpu-audit.json',JSON.stringify({scope:'Actual 1/16/32 instantiated GLB characters; animation-observer and solver CPU in Babylon NullEngine. Excludes GPU, scene render and normal animation evaluation; not a game frame-rate claim.',results},null,2));console.log(results);
