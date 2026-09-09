import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {validatePoseItem,type EquipmentPoseItem,type EquipmentSocket} from '../../../content/src/equipment-poses';
export const LEGACY_SOCKET_NAMES:Readonly<Record<string,EquipmentSocket>>={attachmentOrigin:'Grip.Primary',PrimaryGrip:'Grip.Primary',supportPalm:'Grip.Secondary',SupportGrip:'Grip.Secondary',SecondaryGrip:'Grip.Secondary',StockContact:'Contact.Shoulder',ShoulderContact:'Contact.Shoulder',muzzle:'Aim.Muzzle',MuzzleSocket:'Aim.Muzzle',effect:'Interaction.Contact',DirectionSocket:'Aim.Direction',SightSocket:'Sight.Primary',ScopeEyeReference:'Sight.EyeReference',DisplayReference:'Display.Reference',SupportHandContact:'SupportHandContact'};
export interface PoseEquipmentBinding {
 item:EquipmentPoseItem;
 setMatrix(matrix:Matrix):void;
 restMatrix():Matrix;
 followAttachment():void;
 socket(name:EquipmentSocket):{position:Vector3;direction:Vector3}|undefined;
 release():void;
}
/** The physical item is driven independently of both hands. Authored glTF conversion
 * is canceled explicitly in setMatrix; reflected imports/parents retain socket axes.
 * matrix is authored glTF coordinates -> scene world, never a server transform. */
export function bindPoseEquipment(placement:TransformNode,imported:TransformNode,item:EquipmentPoseItem,poseParent:TransformNode):PoseEquipmentBinding {
 validatePoseItem(item);
 const parent=placement.parent,position=placement.position.clone(),rotation=placement.rotationQuaternion?.clone(),euler=placement.rotation.clone(),scale=placement.scaling.clone();
 placement.parent=poseParent;
 imported.computeWorldMatrix(true);placement.computeWorldMatrix(true);
 const conversion=imported.getWorldMatrix().multiply(Matrix.Invert(placement.getWorldMatrix()));
 const inverseConversion=Matrix.Invert(conversion);
 let released=false;
 const follow=()=>{if(released||placement.isDisposed())return;placement.parent=parent;placement.position.copyFrom(position);placement.rotationQuaternion=rotation?.clone()??null;placement.rotation.copyFrom(euler);placement.scaling.copyFrom(scale);placement.computeWorldMatrix(true);};
 return {item,restMatrix(){return conversion.multiply(Matrix.Compose(scale,rotation??Quaternion.FromEulerVector(euler),position)).multiply(parent?.computeWorldMatrix(true)??Matrix.Identity());},followAttachment:follow,setMatrix(matrix){if(released||placement.isDisposed())return;placement.parent=poseParent;
  const local=inverseConversion.multiply(matrix).multiply(Matrix.Invert(poseParent.computeWorldMatrix(true)));
  placement.rotationQuaternion??=Quaternion.Identity();local.decompose(placement.scaling,placement.rotationQuaternion,placement.position);placement.computeWorldMatrix(true);
 },socket(name){if(released||imported.isDisposed()||!item.sockets[name])return;
  const m=imported.computeWorldMatrix(true);return {position:Vector3.TransformCoordinates(Vector3.FromArray(item.sockets[name]!),m),direction:Vector3.TransformNormal(new Vector3(0,0,-1),m).normalize()};
 },release(){if(released)return;released=true;if(placement.isDisposed())return;placement.parent=parent;placement.position.copyFrom(position);placement.rotationQuaternion=rotation??null;placement.rotation.copyFrom(euler);placement.scaling.copyFrom(scale);}};
}
