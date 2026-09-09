import {validatePoseItem, type EquipmentPoseItem} from '../../../content/src/equipment-poses';
import type {AuthoredAimSpace} from './aim-space';
export interface EquipmentPoseConfiguration {crewUrl?:string;equipmentUrl:string;items:Readonly<Record<string,EquipmentPoseItem>>;aimSpace:AuthoredAimSpace}
export type PoseReviewConfiguration = EquipmentPoseConfiguration & {crewUrl:string};
/** Published paired metadata/handhelds, used with the installed modular crew. */
export async function loadEquipmentPoseConfiguration(base='/assets/crew/poses/r002/'):Promise<EquipmentPoseConfiguration>{
 const [aimResponse,metadataResponse]=await Promise.all([fetch(base+'runtime-aim-space.json'),fetch(base+'profile-socket-metadata.json')]);
 if(!aimResponse.ok || !metadataResponse.ok)throw new Error('Paired staged pose library or socket metadata unavailable');
 const [aimSpace,metadata]=await Promise.all([aimResponse.json(),metadataResponse.json()]);
 if(metadata.version!==1 || !metadata.items || !Object.keys(metadata.items).length)throw new Error('Unsupported staged pose metadata');
 for(const [id,item] of Object.entries(metadata.items) as [string,EquipmentPoseItem][]){
  if(item.assetId!==id)throw new Error('Staged pose asset identity mismatch');
  validatePoseItem(item);
 }
 return {equipmentUrl:base+'equipment/',items:metadata.items,aimSpace};
}
/** Historical exact-rig comparison only; normal gameplay uses the published configuration. */
export async function loadPoseReviewConfiguration(base='/__pose-review/r002/'):Promise<PoseReviewConfiguration>{
 return {...await loadEquipmentPoseConfiguration(base),crewUrl:base+'crew-poses.glb'};
}
