/** Versioned PRESENTATION data. Metres/radians; no weapon stats or collision authority. */
export type PoseVector = readonly [number, number, number];
export type EquipmentPoseType = 'RIFLE' | 'LONG_RIFLE' | 'PISTOL_TWO_HAND' | 'PISTOL_ONE_HAND' | 'FLASHLIGHT' | 'HANDHELD_DEVICE' | 'TOOL';
export type EquipmentSocket = 'Grip.Primary' | 'Grip.Secondary' | 'SupportHandContact' | 'Contact.Shoulder' | 'Aim.Muzzle' | 'Aim.Direction' | 'Sight.Primary' | 'Sight.EyeReference' | 'Interaction.Contact' | 'Display.Reference';
export interface PoseBox { name: string; center: PoseVector; half: PoseVector }
export interface EquipmentPoseProfile {
  version: 1; type: EquipmentPoseType; primaryHand: 'R' | 'L';
  secondaryHandMode: 'foregrip' | 'primary-hand' | 'free';
  aimPivot: 'shoulder' | 'primary-grip'; requiresShoulderContact: boolean;
  requiresEyeAlignment: boolean; deviceMode: 'DIRECTED_DEVICE' | 'VIEW_SCREEN_DEVICE';
  maxUpperBodyYaw: number; maxUpperBodyPitch: number; torsoAimContribution: number; hipAimContribution: number;
  turnStart: number; turnFull: number; rootRate: number; aimRate: number;
  acquireSeconds: number; releaseSeconds: number; recoilRadians: number; recoilMeters: number;
  maxStockContactCompressionM:number; maxShoulderGirdleM:number; elbowBendLimits:readonly[number,number]; screenGripOffset:PoseVector; screenRoll:number; stanceYaw: number; shoulderPocketOffset: PoseVector; gripOffset: PoseVector; supportExtension: number; freeArmOffset: PoseVector;
  clearanceMargin: number; maxShoulderSeparation: number; maxCorrections: number;
  basePose: string; aimPoseSet: string; locomotionPoseSet: readonly string[];
}
const rad = (n:number) => n*Math.PI/180;
const locomotion = ['Idle','Walk','Sprint','Seated'] as const;
const common = {version:1,primaryHand:'R',deviceMode:'DIRECTED_DEVICE',maxUpperBodyYaw:rad(45),maxUpperBodyPitch:rad(60),torsoAimContribution:.55,hipAimContribution:.18,turnStart:rad(35),turnFull:rad(65),rootRate:rad(160),aimRate:rad(190),acquireSeconds:.24,releaseSeconds:.22,recoilRadians:rad(3),recoilMeters:.018,supportExtension:0,freeArmOffset:[-.3,1.04,-.18],clearanceMargin:.012,maxShoulderSeparation:.13,maxCorrections:12,locomotionPoseSet:locomotion} as const;
function profile(type:EquipmentPoseType, overrides:Partial<EquipmentPoseProfile>):EquipmentPoseProfile {
 return {...common,type,secondaryHandMode:'free',aimPivot:'primary-grip',requiresShoulderContact:false,requiresEyeAlignment:false,maxStockContactCompressionM:.008,maxShoulderGirdleM:.045,elbowBendLimits:[.08,2.85],screenGripOffset:[.27,.96,-.36],screenRoll:0,stanceYaw:.08,shoulderPocketOffset:[.065,-.01,-.12],gripOffset:[.26,1.18,-.36],basePose:`${type}.Aim.0.0`,aimPoseSet:`${type}.Aim`,locomotionPoseSet:locomotion.map(name=>name+(type.includes('RIFLE')?'-Rifle':'-Pistol')),...overrides};
}
export const EQUIPMENT_POSE_PROFILES:Readonly<Record<EquipmentPoseType,EquipmentPoseProfile>> = {
 RIFLE:profile('RIFLE',{secondaryHandMode:'foregrip',aimPivot:'shoulder',requiresShoulderContact:true,hipAimContribution:.65,stanceYaw:1.3,shoulderPocketOffset:[.06,-.08,.28],gripOffset:[.25,1.21,-.18]}),
 LONG_RIFLE:profile('LONG_RIFLE',{secondaryHandMode:'foregrip',aimPivot:'shoulder',requiresShoulderContact:true,requiresEyeAlignment:true,hipAimContribution:.65,stanceYaw:1.3,shoulderPocketOffset:[.06,-.08,.28],supportExtension:.07,torsoAimContribution:.65,gripOffset:[.25,1.24,-.19]}),
 PISTOL_TWO_HAND:profile('PISTOL_TWO_HAND',{secondaryHandMode:'primary-hand',gripOffset:[0,1.18,-.41]}),
 PISTOL_ONE_HAND:profile('PISTOL_ONE_HAND',{gripOffset:[.29,1.23,-.42]}),
 FLASHLIGHT:profile('FLASHLIGHT',{gripOffset:[.30,1.16,-.30],recoilRadians:0,recoilMeters:0}),
 HANDHELD_DEVICE:profile('HANDHELD_DEVICE',{screenRoll:-.6,screenGripOffset:[.2,1.05,-.32],gripOffset:[.22,1.12,-.32],recoilRadians:0,recoilMeters:0}),
 TOOL:profile('TOOL',{gripOffset:[.28,1.10,-.34],recoilRadians:0,recoilMeters:0}),
};
export interface EquipmentPoseItem {
 version:1; assetId:string; profile:EquipmentPoseType;
 /** glTF authored right-handed frame: +X right,+Y up,-Z forward. */
 sockets: Partial<Record<EquipmentSocket,PoseVector>>;
 clearance:readonly PoseBox[]; deviceMode?:EquipmentPoseProfile['deviceMode'];
}
const gun = (assetId:string,profile:EquipmentPoseType,length:number):EquipmentPoseItem => ({version:1,assetId,profile,sockets:{'Grip.Primary':[0,0,0],'Grip.Secondary':[0,0,-.23],'Contact.Shoulder':[0,.075,.4315],'Aim.Muzzle':[0,.13,-length-.02],'Sight.Primary':[0,.25,.045]},clearance:[{name:'receiver',center:[0,.105,-.13],half:[.096,.08,length*.285]},{name:'slide',center:[0,.20,-length*.26],half:[.060,.033,length*.36]},{name:'charging-handle',center:[.105,.19,-.08],half:[.045,.018,.025]},{name:'grip',center:[0,-.01,0],half:[.044,.094,.055]},{name:'stock',center:[0,.075,.31],half:[.073,.11,.1215]},{name:'barrel',center:[0,.13,-length*.70],half:[.085,.07,length*.25]}]});
const pistol=(assetId:string,profile:EquipmentPoseType,length:number):EquipmentPoseItem=>({version:1,assetId,profile,sockets:{'Grip.Primary':[0,0,0],'SupportHandContact':[-.065,-.012,.015],'Aim.Muzzle':[0,.13,-length-.02],'Sight.Primary':[0,.25,.045]},clearance:[{name:'receiver',center:[0,.12,-.14],half:[.14,.15,length*.5]}]});
/** Measured from preserved equipment-kit source; explicit compatibility metadata, not invented foregrips. */
export const EQUIPMENT_POSE_ITEMS:Readonly<Record<string,EquipmentPoseItem>> = {
 carbine:gun('carbine','RIFLE',.76),
 'long-rifle':{...gun('long-rifle','LONG_RIFLE',1.10),clearance:[...gun('long-rifle','LONG_RIFLE',1.10).clearance,{name:'optic',center:[0,.309,-.18],half:[.044,.043,.12]}],sockets:{...gun('long-rifle','LONG_RIFLE',1.10).sockets,'Grip.Secondary':[0,0,-.30],'Sight.Primary':[0,.309,-.06],'Sight.EyeReference':[0,.309,.04]}},
 'compact-pistol':pistol('compact-pistol','PISTOL_ONE_HAND',.37),
 'heavy-handgun':pistol('heavy-handgun','PISTOL_TWO_HAND',.47),
 'plasma-cutter':{version:1,assetId:'plasma-cutter',profile:'TOOL',sockets:{'Grip.Primary':[0,0,0],'Aim.Direction':[0,.13,-.50],'Interaction.Contact':[0,.13,-.50]},clearance:[{name:'device-body',center:[0,.12,-.13],half:[.151,.14,.17]},{name:'forks',center:[0,.13,-.38],half:[.105,.045,.12]}]},
 'sample-scanner':{version:1,assetId:'sample-scanner',profile:'HANDHELD_DEVICE',deviceMode:'VIEW_SCREEN_DEVICE',sockets:{'Grip.Primary':[0,0,0],'Aim.Direction':[.085,.35,-.19],'Display.Reference':[0,.19,-.251]},clearance:[{name:'device-body',center:[0,.12,-.055],half:[.10,.085,.085]},{name:'display',center:[0,.19,-.19],half:[.11,.125,.065]},{name:'antenna',center:[.085,.35,-.19],half:[.015,.065,.02]}]},
};
export function validatePoseItem(item:EquipmentPoseItem, profile=EQUIPMENT_POSE_PROFILES[item.profile]):void {
 if(item.version!==1 || !profile || profile.version!==1)throw new Error('Unsupported equipment pose version/profile');
 const required:EquipmentSocket[]=['Grip.Primary'];
 required.push(item.deviceMode==='VIEW_SCREEN_DEVICE'?'Display.Reference':item.sockets['Aim.Muzzle']?'Aim.Muzzle':'Aim.Direction');
 if(profile.requiresShoulderContact)required.push('Contact.Shoulder');
 if(profile.requiresEyeAlignment)required.push('Sight.Primary','Sight.EyeReference');
 if(profile.secondaryHandMode==='foregrip')required.push('Grip.Secondary');
 if(profile.secondaryHandMode==='primary-hand')required.push('SupportHandContact');
 if(item.version!==1 || !profile || profile.version!==1)throw new Error('Unsupported equipment pose version/profile');
 for(const name of required)if(!item.sockets[name])throw new Error(`${item.assetId}: missing ${name}`);
 for(const p of Object.values(item.sockets))if(p.length!==3||!p.every(Number.isFinite))throw new Error(`${item.assetId}: invalid socket`);
 if(!item.clearance.length)throw new Error(`${item.assetId}: missing clearance`);
 for(const b of item.clearance)if(![...b.center,...b.half].every(Number.isFinite)||b.half.some(n=>n<=0))throw new Error(`${item.assetId}: invalid clearance`);
}
