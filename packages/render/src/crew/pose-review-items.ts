import {EQUIPMENT_POSE_ITEMS,type EquipmentPoseItem} from '../../../content/src/equipment-poses';
/** Exact r002 staged GLBs only. Never apply these sockets to canonical long-gun geometry. */
export const POSE_REVIEW_ITEMS:Readonly<Record<string,EquipmentPoseItem>>={
 ...EQUIPMENT_POSE_ITEMS,
 ...Object.fromEntries(['carbine','long-rifle'].map(id=>{const item=EQUIPMENT_POSE_ITEMS[id];return [id,{...item,sockets:{...item.sockets,'Contact.Shoulder':[0,.075,.18],'Grip.Primary':id==='long-rifle'?[0,.03,.055]:[0,0,0],'Grip.Secondary':id==='long-rifle'?[-.065,.045,-.20]:[-.065,.045,-.12]},clearance:item.clearance.map(b=>b.name==='stock'?{...b,center:[0,.075,.15],half:[.073,.11,.03]}:b)} as EquipmentPoseItem];})),
 flashlight:{version:1,assetId:'flashlight',profile:'FLASHLIGHT',sockets:{'Grip.Primary':[0,0,0],'Aim.Direction':[0,.06,-.31]},clearance:[{name:'device-body',center:[0,.05,-.15],half:[.08,.09,.16]}]},
};
