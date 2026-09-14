/** Private local-file visual harness. Real crew renderer, no database connection. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { createCrewVisual } from "../../packages/render/src/crew";
import type { CrewAppearance } from "../../packages/render/src/crew/appearance";
import { CHARACTER_COMPONENT_SETS, CHARACTER_HAIR_STYLES } from "../../packages/content/src/character-components";
import { CHARACTER_EXPRESSIONS, CHARACTER_FACE_DETAILS, CHARACTER_FACIAL_HAIR, CHARACTER_FACE_AGES } from "../../packages/content/src/character-face-options";

type Pane={engine:Engine;scene:Scene;camera:ArcRotateCamera;pivot:TransformNode;crew:Awaited<ReturnType<typeof createCrewVisual>>};
const panes=new Map<string,Pane>();
let appearance:CrewAppearance={bodyType:"female",hairStyle:"swept",hair:"#353047",skin:"#edc8ad",equippedComponents:{},weaponFixture:false};
let close=true,angle=0.38,clip="Idle",playing=false;
function apply(){
  for(const p of panes.values()){
    p.engine.stopRenderLoop();
    p.crew.customize(appearance);p.pivot.rotation.y=angle;
    p.camera.setTarget(new Vector3(0,close?1.59:1,0));
    const h=close?.52:1.18;p.camera.orthoTop=h;p.camera.orthoBottom=-h;p.camera.orthoLeft=-h*.8;p.camera.orthoRight=h*.8;
    for(const g of p.scene.animationGroups)g.stop();p.scene.skeletons[0]?.returnToRest();
    const g=p.scene.animationGroups.find(g=>g.name===clip);g?.start(true);
    if(!playing){g?.pause();g?.goToFrame((g.from+g.to)/2);}
    p.scene.render();
    if(playing)p.engine.runRenderLoop(()=>p.scene.render());
  }
}
function select(label:string,values:readonly string[],change:(value:string)=>void){
  const el=document.createElement("label");el.textContent=label;const select=document.createElement("select");select.id="select-"+label;
  for(const v of values){const option=document.createElement("option");option.value=v;option.textContent=v;select.append(option);}
  select.onchange=()=>{change(select.value);apply();};el.append(select);document.querySelector("#controls")!.append(el);return select;
}
select("Body",["female","male"],v=>appearance.bodyType=v as "female");
select("Hair",CHARACTER_HAIR_STYLES,v=>appearance.hairStyle=v as "swept").value="swept";
select("Dye",["#353047","#ff319a","#148bff","#ff7318","#f22232","#a93aff","#25ecdc","#dfded5"],v=>appearance.hair=v);
select("Skin",["#edc8ad","#b59976","#9c6948","#4b312a"],v=>appearance.skin=v);
select("Eyes",["#754c2b","#248aff","#24b976","#edaa26","#eb2749","#30efff"],v=>appearance.eyes=v);
select("Expression",CHARACTER_EXPRESSIONS,v=>appearance.expression=v as "neutral");
select("Detail",CHARACTER_FACE_DETAILS,v=>appearance.faceDetail=v as "none");
select("Beard",CHARACTER_FACIAL_HAIR,v=>appearance.facialHair=v as "none");
select("Age",CHARACTER_FACE_AGES,v=>appearance.faceAge=v as "adult").value="adult";
select("Equipment",["bare","medic","mixed"],v=>appearance.equippedComponents=v==="bare"?{}:v==="medic"?CHARACTER_COMPONENT_SETS.medic:{...CHARACTER_COMPONENT_SETS.medic,helmet:CHARACTER_COMPONENT_SETS.captain.helmet,legs:CHARACTER_COMPONENT_SETS.engineer.legs,back:CHARACTER_COMPONENT_SETS.recon.back});
select("Camera",["head","full","rear","side"],v=>{close=v!=="full";angle=v==="rear"?3.3:v==="side"?1.57:.38;});
select("Clip",["Idle","Walk","Sprint","Seated","Idle-Rifle","Idle-Pistol"],v=>clip=v);
select("Playback",["paused","playing"],v=>playing=v==="playing");
for(const id of ["previous","candidate"]){
  document.querySelector<HTMLInputElement>("#"+id+"-file")!.onchange=async event=>{
    const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
    const old=panes.get(id);if(old){old.crew.dispose();old.scene.dispose();old.engine.dispose();}
    const canvas=document.querySelector<HTMLCanvasElement>("#"+id)!;
    const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.028,.052,.09,1);
    const camera=new ArcRotateCamera("face-review-camera",-Math.PI/2,1.36,5,new Vector3(0,1.59,0),scene);camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.01;camera.maxZ=20;
    const key=new DirectionalLight("face-review-key",new Vector3(.4,-.7,.75),scene);key.diffuse=new Color3(.84,.91,1);key.intensity=2.4;
    const fill=new HemisphericLight("face-review-fill",Vector3.Up(),scene);fill.intensity=.9;fill.groundColor=new Color3(.18,.20,.23);
    const pivot=new TransformNode("face-review-pivot",scene);const crew=await createCrewVisual(scene,pivot,new Uint8Array(await file.arrayBuffer()));
    panes.set(id,{engine,scene,camera,pivot,crew});apply();
    document.querySelector("#status")!.textContent=`Loaded ${[...panes.keys()].join(" + ")}. Per-character atlas selection, shared rig, preserved clips.`;
  };
}
function dispose(){for(const p of panes.values()){p.crew.dispose();p.scene.dispose();p.engine.dispose();}panes.clear();}
document.querySelector<HTMLButtonElement>("#close")!.onclick=dispose;
window.addEventListener("pagehide",dispose);
Object.assign(window,{faceReview:{panes,apply,dispose,set:(patch:CrewAppearance)=>{appearance={...appearance,...patch};apply();}}});
