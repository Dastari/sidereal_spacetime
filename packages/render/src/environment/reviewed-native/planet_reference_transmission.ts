import {PBRMaterial}from'@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3}from'@babylonjs/core/Maths/math.color';
import type{Scene}from'@babylonjs/core/scene';
import{TransmissionHelper,type ITransmissionHelperHolder}from'@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper';
import{PBRMaterialLoadingAdapter}from'@babylonjs/loaders/glTF/2.0/pbrMaterialLoadingAdapter';
export type ReferenceTransmissionRole={transmissionFactor?:number;thicknessFactor?:number;attenuationColor?:number[];attenuationDistance?:number};
/** Match the installed glTF transmission/volume adapter. Source alpha stays
 * independent: transmission is not an opacity fade or an emissive replacement. */
export function applyReferenceTransmission(material:PBRMaterial,role:ReferenceTransmissionRole){
 const transmission=role.transmissionFactor??0,thickness=role.thicknessFactor??0,distance=role.attenuationDistance??Number.MAX_VALUE,color=role.attenuationColor??[1,1,1];
 if(!Number.isFinite(transmission)||transmission<0||transmission>1||!Number.isFinite(thickness)||thickness<0||!Number.isFinite(distance)||distance<=0||color.length!==3||color.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Invalid authored transmission/volume values');
 if(transmission===0)return;
 const adapter=new PBRMaterialLoadingAdapter(material);adapter.configureTransmission();adapter.transmissionWeight=transmission;
 if(thickness>0){adapter.configureVolume();adapter.geometryThinWalled=false;adapter.transmissionColor=Color3.FromArray(color);adapter.transmissionDepth=distance;adapter.volumeThickness=thickness;}
}
type Lease={helper:TransmissionHelper;owners:number;borrowed:boolean;materials:Map<PBRMaterial,number>};const leases=new WeakMap<Scene,Lease>();
/** One opaque refraction target per isolated scene, shared across body materials
 * and every retained LOD. A helper owned by an existing loader is borrowed. */
export function acquireReferenceTransmission(scene:Scene,materials:readonly PBRMaterial[]){
 const glass=materials.filter(m=>m.subSurface.isRefractionEnabled&&m.subSurface.refractionIntensity>0);if(!glass.length)return{target:undefined,dispose(){}};
 if(glass.some(m=>m.getScene()!==scene))throw new Error('Transmission materials must belong to this scene');
 let lease=leases.get(scene);if(!lease){const existing=(scene as Scene&Partial<ITransmissionHelperHolder>)._transmissionHelper;lease={helper:existing??new TransmissionHelper({},scene),owners:0,borrowed:Boolean(existing),materials:new Map()};lease.helper.addMaterialImpl({materialClass:PBRMaterial,adapterClass:PBRMaterialLoadingAdapter});leases.set(scene,lease);}
 lease.owners++;const target=lease.helper.getOpaqueTarget()!;for(const material of new Set(glass)){lease.materials.set(material,(lease.materials.get(material)??0)+1);material.subSurface.refractionTexture=target;}
 let disposed=false;return{target,dispose(){if(disposed)return;disposed=true;for(const material of new Set(glass)){const owners=lease!.materials.get(material)!-1;if(owners>0)lease!.materials.set(material,owners);else{lease!.materials.delete(material);if(material.subSurface.refractionTexture===target)material.subSurface.refractionTexture=null;}}lease!.owners--;if(lease!.owners===0){if(!lease!.borrowed)lease!.helper.dispose();leases.delete(scene);}}};
}
