import type { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {applyReferenceTransmission,type ReferenceTransmissionRole} from './planet_reference_transmission';
/** Authoring export values remain linear, matching the native GLB material. */
export type ReferenceMaterialRole = ReferenceTransmissionRole & {
 name:string; linearColor:number[]; roughness:number; metallic?:number;
 clearcoatFactor?:number;clearcoatRoughnessFactor?:number;clearCoat?:{intensity:number;roughness:number};
 alpha?:number;alphaMode?:'OPAQUE'|'MASK'|'BLEND';doubleSided?:boolean;useTextureAlpha?:boolean;alphaCutoff?:number;baseColorTexture?:string;invertY?:boolean;textureColorSpace?:'sRGB'|'linear';
 emissiveTexture?:string;clearcoatNormalTexture?:string;normalTexture?:string;normalScale?:number;metallicRoughnessTexture?:string;
 emissiveColor?:number[]; emissiveStrength?:number; ior?:number;
};
export function referenceMaterial(scene:Scene,role:ReferenceMaterialRole){
 const material=new PBRMaterial(role.name,scene);material.enableSpecularAntiAliasing=true;material.clearCoat.remapF0OnInterfaceChange=false;material.clearCoat.useRoughnessFromMainTexture=false;
 material.albedoColor=Color3.FromArray(role.linearColor);
 material.roughness=role.roughness;material.metallic=role.metallic??0;
 material.maxSimultaneousLights=4;
 if(role.emissiveColor)material.emissiveColor=Color3.FromArray(role.emissiveColor);
 material.emissiveIntensity=role.emissiveStrength??1;
 if(role.ior!==undefined)material.indexOfRefraction=role.ior;
 const coat=role.clearcoatFactor??role.clearCoat?.intensity??0;material.clearCoat.isEnabled=coat>0;material.clearCoat.intensity=coat;material.clearCoat.roughness=role.clearcoatRoughnessFactor??role.clearCoat?.roughness??0;
 material.alpha=role.alphaMode==='BLEND'||role.alphaMode==='MASK'?role.alpha??1:1;material.backFaceCulling=!role.doubleSided;material.twoSidedLighting=role.doubleSided??false;material.useAlphaFromAlbedoTexture=role.useTextureAlpha??(role.alphaMode==='BLEND'||role.alphaMode==='MASK');material.alphaCutOff=role.alphaCutoff??.5;
 material.transparencyMode=role.alphaMode==='BLEND'?PBRMaterial.PBRMATERIAL_ALPHABLEND:role.alphaMode==='MASK'?PBRMaterial.PBRMATERIAL_ALPHATEST:PBRMaterial.PBRMATERIAL_OPAQUE;
 applyReferenceTransmission(material,role);
 return material;
}
