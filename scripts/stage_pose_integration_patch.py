"""Generate a reviewable shared-wiring patch. Never applies edits to parent-owned paths."""
import difflib,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];changes={}
def edit(path,fn):
 original=(root/path).read_text();modified=fn(original);changes[path]=(original,modified)
def renderer(s):
 if 'equipmentPoseReview?: PoseReviewConfiguration' in s or 'equipmentPose?: EquipmentPoseConfiguration' in s:
  return s  # Parent already integrated; never duplicate controllers or imports.
 s="import type { PoseReviewConfiguration } from './crew/pose-review-config';\nexport { loadPoseReviewConfiguration } from './crew/pose-review-config';\n"+s
 s=s.replace('combat?: {active:boolean;angle:number;range:number};','combat?: {active:boolean;angle:number;range:number;itemId?:string;shotSequence?:bigint};')
 s=s.replace('export interface WorldOptions {','export interface WorldOptions {\n  equipmentPoseReview?: PoseReviewConfiguration;')
 s=s.replace('let avatar = new TransformNode',"let equipmentPose: ReturnType<Awaited<ReturnType<typeof createCrewVisual>>['createPoseController']> | undefined;\n  let avatar = new TransformNode")
 s=s.replace('crew = await createCrewVisual(scene, shipRoot);',"crew = await createCrewVisual(scene, shipRoot, options.equipmentPoseReview?.crewUrl);\n      if(options.equipmentPoseReview){equipmentPose=crew.createPoseController();equipmentPose.setAimSpace(options.equipmentPoseReview.aimSpace);}")
 s=s.replace('if(state.combat?.active && !state.seated)avatar.rotation.y=-state.combat.angle;', 'if(!equipmentPose && state.combat?.active && !state.seated)avatar.rotation.y=-state.combat.angle;')
 needle='    // The imported body starts at local height zero;'
 s=s.replace(needle,"""    const poseItem=selectedAsset ? options.equipmentPoseReview?.items[selectedAsset] : undefined;
    if(equipmentPose && poseItem)equipmentPose.update({
      yaw:state.combat?.angle ?? -avatar.rotation.y,pitch:0,facing:-avatar.rotation.y,
      active:!!state.combat?.active,moving:walking,movementYaw:walking?Math.atan2(-dx,dy)+avatar.rotation.y:0,seated:!!state.seated,sprinting:state.sprinting,
      hidden:!cabinVisible || !debugFeatures.snapshot().characters,reducedMotion:state.reducedMotion,
      profile:poseItem.profile,itemId:state.combat?.itemId,shotSequence:state.combat?.shotSequence,
    },dt);
"""+needle)
 s=s.replace('crew.bindHeldEquipment(undefined);equipment?.dispose();', 'equipmentPose?.bind(undefined);crew.bindHeldEquipment(undefined);equipment?.dispose();')
 s=s.replace('createEquipmentVisual(scene,crew.sockets.handR,selectedAsset)', 'createEquipmentVisual(scene,crew.sockets.handR,selectedAsset,selectedAsset && options.equipmentPoseReview?.items[selectedAsset] ? options.equipmentPoseReview.equipmentUrl : undefined)')
 s=s.replace('equipment=visual;crew?.bindHeldEquipment(visual);',"equipment=visual;\n      const poseItem=options.equipmentPoseReview?.items[selectedAsset!];\n      if(equipmentPose && crew && poseItem)equipmentPose.bind(visual.createPoseBinding(crew.root,poseItem));\n      else crew?.bindHeldEquipment(visual);")
 s=s.replace('equipment?.getMuzzleWorld(),displayed.localX', '(equipmentPose ? equipmentPose.diagnostics.muzzle : equipment?.getMuzzleWorld()),displayed.localX')
 return s
def beam(s):
 if 'tracePhysicalBeam(scene,muzzle,range,blockers)' in s:
  return s
 s="import {tracePhysicalBeam} from './equipment/physical-beam';\n"+s
 start=s.index('      const target=active&&muzzle?aim(');end=s.index('      beam.position.copyFrom',start)
 s=s[:start]+"""      const ray=active&&muzzle?tracePhysicalBeam(scene,muzzle,range,blockers):undefined;
      beam.setEnabled(!!ray);dot.setEnabled(!!ray);
      if(!ray || !muzzle){endpoint=undefined;return;}
      endpoint=ray.end;
"""+s[end:]
 return s
def app(s):
 if "loadEquipmentPoseConfiguration" in s or "loadPoseReviewConfiguration" in s:
  return s
 s=s.replace('.then(({ createWorld }) => {','.then(async ({ createWorld, loadPoseReviewConfiguration }) => {')
 s=s.replace('        return createWorld(\n',"        const equipmentPoseReview=import.meta.env.DEV && new URLSearchParams(location.search).get('poseReview')==='r002' ? await loadPoseReviewConfiguration() : undefined;\n        if(disposed)return null;\n        return createWorld(\n",1)
 s=s.replace('            signal: abort.signal,','            signal: abort.signal,\n            equipmentPoseReview,',1)
 s=s.replace('range:combat?.rangeMeters ?? 60},','range:combat?.rangeMeters ?? 60,itemId:combat?.weaponItemId,shotSequence:combat?.shotSequence},')
 return s
edit('packages/render/src/index.ts',renderer);edit('packages/render/src/combat-aim.ts',beam);edit('apps/client/src/App.tsx',app)
out=root/'docs/handoffs/combat_pose_integration.patch'
out.write_text(''.join(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+p,tofile='b/'+p)) for p,(a,b) in changes.items()))
(root/'docs/handoffs/combat_pose_patch_inputs.json').write_text(json.dumps({p:hashlib.sha256(a.encode()).hexdigest() for p,(a,b) in changes.items()},indent=2))
(root/'.runtime/pose-shared-preview.json').write_text(json.dumps({str(root/p):b for p,(a,b) in changes.items()}))
print(out)
