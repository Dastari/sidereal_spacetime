import {Scene} from "@babylonjs/core/scene";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {VertexData} from "@babylonjs/core/Meshes/mesh.vertexData";
import {RawTexture} from "@babylonjs/core/Materials/Textures/rawTexture";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import type {NativePlanetKit,NativePlanetComposition} from "./native-planet-composition";
import {composeNativeVolcanic} from "./native-volcanic-composition";
import {createVolcanicField,nativeLavaRadiance,type VolcanicVector} from "./native-volcanic-field";
import {terrainContactOcclusion} from "./planet-contact-lighting";
import {createNativeBasaltMaterial,type NativeLavaSpillPlugin} from "./native-volcanic-material";
const unit=(v:VolcanicVector):VolcanicVector=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length) as VolcanicVector;};
/** Native authored mesh composition plus bounded molten material/near-field illumination. */
export function createNativeVolcanicPlanet(scene:Scene,name:string,kit:NativePlanetKit,seed:number,emission=2.4,options:{geometry?:NativePlanetComposition;revision?:string}={}){
 const root=new TransformNode(name+"-native-volcanic",scene),geometry=options.geometry??composeNativeVolcanic(kit,seed,.55),field=createVolcanicField(seed),plugins:NativeLavaSpillPlugin[]=[];
 const pixels=new Uint8Array(512*256*4),stops=[[.0025,"ffffcb",.90],[.005,"ffd43b",.045],[.017,"ff7900",.065],[.045,"f32900",.035]] as const;
 for(let y=0;y<256;y++)for(let x=0;x<512;x++){
  const longitude=((x+.5)/512-.5)*Math.PI*2,latitude=(y+.5)/256*Math.PI,n:VolcanicVector=[Math.cos(longitude)*Math.sin(latitude),Math.cos(latitude),Math.sin(longitude)*Math.sin(latitude)],width=.72+.20*Math.sin(n[0]*51+n[1]*33+n[2]*29+seed)+.08*Math.cos(n[0]*37-n[2]*43),d=field.distance(n)/width,stop=stops.find(([limit],index)=>d<limit&&(index!==0||Math.sin(n[0]*47+n[1]*37+n[2]*53+seed)>.92)),i=(y*512+x)*4;
  if(stop){const c=Color3.FromHexString("#"+stop[1]).toLinearSpace().scale(stop[2]);pixels[i]=c.r*255;pixels[i+1]=c.g*255;pixels[i+2]=c.b*255;}
  pixels[i+3]=255;
 }
 const moltenTexture=RawTexture.CreateRGBATexture(pixels,512,256,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);moltenTexture.gammaSpace=false;moltenTexture.wrapU=Texture.WRAP_ADDRESSMODE;moltenTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
 const emitters:Mesh[]=[];const moltenMaterials:{material:PBRMaterial;vent:boolean}[]=[];let litVertices=0,minimumAO=1,maximumRadiance=0;
 geometry.batches.forEach((batch,index)=>{
  if(!batch.indices.length)return;
  const mesh=new Mesh(name+"-"+kit.materials[index].name,scene),data=new VertexData(),colors:number[]=[],radiance:number[]=[],uvs:number[]=[];
  data.positions=batch.positions;data.normals=batch.normals;data.indices=batch.indices;
  for(let i=0;i<batch.positions.length;i+=3){
   const p=batch.positions.slice(i,i+3) as VolcanicVector,n=unit(p),normal=batch.normals.slice(i,i+3) as VolcanicVector,r=Math.hypot(...p);
   uvs.push(.5+Math.atan2(p[2],p[0])/(2*Math.PI),Math.acos(Math.max(-1,Math.min(1,p[1]/r)))/Math.PI);
   if(index<3){
    const neighbors=[[-.04,0,0],[.04,0,0],[0,0,-.04],[0,0,.04]].map(offset=>field.height(unit(n.map((v,j)=>v+offset[j]) as VolcanicVector)));
    const ao=terrainContactOcclusion(r,neighbors,.09),light=nativeLavaRadiance(p,normal,field,emission);
    colors.push(ao,ao,ao,1);radiance.push(...light);minimumAO=Math.min(minimumAO,ao);maximumRadiance=Math.max(maximumRadiance,light[0]);if(light[0]>.015)litVertices++;
   }else{colors.push(1,1,1,1);radiance.push(0,0,0);}
  }
  // Native vertices are triangle-local; unwrap seam-crossing triangles into repeat U.
  for(let i=0;i<uvs.length;i+=6)if(Math.max(uvs[i],uvs[i+2],uvs[i+4])-Math.min(uvs[i],uvs[i+2],uvs[i+4])>.5)for(const k of [i,i+2,i+4])if(uvs[k]<.5)uvs[k]+=1;
  data.colors=colors;data.uvs=uvs;data.applyToMesh(mesh);mesh.setVerticesData("nativeLavaRadiance",radiance,false,3);
  if(index===3||index===5){
   const moltenMaterial=new PBRMaterial(name+"-molten-material",scene);moltenMaterial.albedoColor=new Color3(.018,.010,.025);if(index===3)moltenMaterial.emissiveTexture=moltenTexture;moltenMaterial.emissiveColor=(index===5?new Color3(1,.12,.002):new Color3(1,1,1)).scale(Math.min(4,Math.max(0,emission))*3*.9);moltenMaterial.roughness=.38;moltenMaterial.metallic=0;mesh.material=moltenMaterial;emitters.push(mesh);moltenMaterials.push({material:moltenMaterial,vent:index===5});
  }else{
   const {material,spill}=createNativeBasaltMaterial(scene,name+"-"+kit.materials[index].name+"-material");material.albedoColor=Color3.FromArray(kit.materials[index].linearColor).scale(index===2?1.8:1);mesh.material=material;plugins.push(spill);
  }
  mesh.parent=root;mesh.isPickable=false;mesh.metadata={style:"volcanic",nativeRevision:options.revision??"volcanic-r018"};
 });
 root.metadata={nativePlanet:true,nativeRevision:options.revision??"volcanic-r018",seed,triangles:geometry.triangles,litVertices,minimumAO,maximumRadiance,...geometry.diagnostics};
 return {root,emitters,geometry,stats:root.metadata,setSpillEnabled(enabled:boolean){for(const plugin of plugins)plugin.enabled=enabled;},update(age:number,reducedMotion:boolean){if(reducedMotion)return;for(const plugin of plugins)plugin.age=age;for(const {material,vent} of moltenMaterials){const gain=Math.min(4,Math.max(0,emission))*3*(.90+.10*Math.sin(age*.6));material.emissiveColor.set(gain,vent?gain*.12:gain,vent?gain*.002:gain);}},dispose(){root.dispose(false,true);moltenTexture.dispose();}};
}
