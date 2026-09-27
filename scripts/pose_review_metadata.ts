/** Snapshot exact review metadata next to immutable staged source/exports. No install. */
import {writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {EQUIPMENT_POSE_PROFILES} from '../packages/content/src/equipment-poses';
import {POSE_REVIEW_ITEMS} from '../packages/render/src/crew/pose-review-items';
const folder='assets/art-library/designs/crew.animation.aim/revisions/r002';
const output=folder+'/profile-socket-metadata.json';
if(existsSync(output))copyFileSync(output,folder+'/profile-socket-metadata-'+Date.now()+'.json');
writeFileSync(output,JSON.stringify({version:1,units:'metres/radians',space:'authored glTF +Y up/-Z forward; shoulder offsets in spine local frame',profiles:EQUIPMENT_POSE_PROFILES,items:POSE_REVIEW_ITEMS},null,2));
writeFileSync(folder+'/equipment/manifest.json',JSON.stringify({schema:1,status:'Unapproved r002 review; presentation only',entries:Object.values(POSE_REVIEW_ITEMS).map(item=>({id:item.assetId,file:item.assetId+'.glb',attachmentOrigin:item.sockets['Grip.Primary'],forward:[0,0,-1],up:[0,1,0],anchors:{muzzle:item.sockets['Aim.Muzzle']??item.sockets['Aim.Direction'],supportPalm:item.sockets['Grip.Secondary']??item.sockets.SupportHandContact}}))},null,2));
