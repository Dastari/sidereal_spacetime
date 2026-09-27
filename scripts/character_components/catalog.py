"""Independent component revision/feedback ledger, linked from the main art index.
Never publishes runtime art, signs off for the owner, or overwrites evidence.
"""
import argparse,json,hashlib,shutil,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LIB=ROOT/'assets/art-library/character-components';FILE=LIB/'ledger.json'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(d):
 FILE.parent.mkdir(parents=True,exist_ok=True);FILE.write_text(json.dumps(d,indent=2)+'\n');index(d)
def index(d):
 lines=['# Character components — living index','',f'Current integration: **r{d["integrationRevision"]:03}**. Owner final sign-offs are per component and exact revision.','', '[Authoring contract](../../../docs/character_component_authoring.md) · [Family revision and source references](../designs/crew.base-and-outfits/DESIGN.md) · [Machine-readable ledger](ledger.json)','', 'All ten archetypes use the same male/female rig. Existing inventory equipment can be owned and equipped separately; staged designs without an inventory definition are explicitly labeled. Paired gloves, boots and shoulder guards contain distinct left/right skinned parts. Base modesty clothing cannot be removed.','', 'Workflow: choose an unsigned component below; inspect its current source collection, standalone GLB, image and feedback. Start a new revision with `python3 scripts/character_components/catalog.py start ID --change "..."`. Keep all work in the new directory. Add source/model/images/validation using `evidence`, then record feedback and review in the ledger. Integration must rebuild the shared bundle using the current component revisions, retain weights/materials, and check both bodies and mixed sets. Do not rerun the original decomposition script over later authored revisions.','', 'Only explicit owner feedback identifying the exact revision and deliverables permits `ownerFinalSignoff`. Agent review is recorded separately. An owner approval must include the original message reference and the approved evidence hashes; never infer it from silence, successful checks or implementation authorization.','', '| Component | Kind / slot | Design revision | Installed revision | State | Owner signed off |','| --- | --- | --- | --- | --- | --- |']
 if calibration:=d.get('calibration'):
  publication='14 existing components installed with owner authorization; final art sign-off remains pending' if calibration.get('published') else 'staged only'
  lines[4:4]=[f'Focused reference calibration: **r{calibration["currentRevision"]:03}**, **{calibration["status"]}**, {publication}. [Compare the reference, preserved r002 baseline and reviewed model](calibration/README.md). Two bases, three hairstyles and medic armor are covered; other sets retain r002. Open comms is a new proposed design with no inventory definition. Later calibration revisions retain unchanged body/armor geometry while correcting and revalidating the hair assembly.','']
 if face:=d.get('faceStudy'):
  handoff=Path(__import__('os').path.relpath(ROOT/face['handoff'],LIB)).as_posix()
  lines[4:4]=[f'Head, hair and facial customization: **r{face["currentRevision"]:03}**, **{face["status"]}**; installed r{face["installedRevision"]:03}. Two heads and all eight existing hairstyles are covered. [Native sources, face atlases, browser evidence and remaining reference work]({handoff}). New revision final art approval remains pending. The calibration entry below describes the earlier r008 work.','']
 if pose:=d.get('runtimePoseIntegration'):
  handoff=Path(__import__('os').path.relpath(ROOT/pose['handoff'],LIB)).as_posix()
  lines[4:4]=[f'Normal-game poses: **{pose["status"]}**. Modular character r{pose["characterRevision"]:03} uses paired equipment/aim data r{pose["pairedPoseRevision"]:03} in the world and paper doll without a query gate. [Integration, exact assets, browser evidence and remaining fit/playback work]({handoff}). Publication does not confer owner final sign-off.','']
 if (bundle:=d.get('installedBundleArtApproval')) and bundle['revision']==d['integrationRevision']:
  approval=ROOT/bundle['path']
  if digest(approval)!=bundle['sha256']:raise ValueError('Installed bundle approval record changed')
  link=Path(__import__('os').path.relpath(approval,LIB)).as_posix()
  lines[4:4]=[f'**Installed r{bundle["revision"]:03} character/armor bundle: owner art APPROVED.** [Exact dated approval and all delivered hashes]({link}). Technical playback remains incomplete. This later bundle-level decision supersedes earlier pending appearance status for the installed deliverable; individual component revision rows and canonical reference coverage below remain separate records.','']
 for c in d['components']:
  folder=LIB/'components'/c['id'];folder.mkdir(parents=True,exist_ok=True)
  current=c['revisions'][-1];n=current['revision'];approved=c.get('ownerFinalSignoff')
  installed=f'r{c["installedRevision"]:03}' if c.get('installedRevision') is not None else ('staged / unissued' if 'installedRevision' in c else 'see integration')
  lines.append(f'| [{c["name"]}](components/{c["id"]}/ASSET.md) | {c["slot"]} | r{n:03} | {installed} | {current["state"]} | {"YES" if approved and approved["revision"]==n else "NO"} |')
  detail=[f'# {c["name"]}','',f'Stable ID: `{c["id"]}`. Current revision: **r{n:03}**. State: **{current["state"]}**. Owner final sign-off: **{"YES" if approved and approved["revision"]==n else "NO"}**.','',f'Kind/slot: {c["slot"]}. Compatible bodies: male and female. Source collection: `{c["collection"]}`.','',f'Inventory definition: `{c.get("inventoryDefinition","none — saved appearance or mandatory base")}`.','',f'Physical bounds / mass / grid: `{json.dumps(c.get("stats",{}),separators=(",",":"))}`. Mass and storage are lab balance; no defense/class/oxygen bonuses are implied.','', '[Authoring contract](../../../../../docs/character_component_authoring.md) · [Living index](../../INDEX.md)','']
  if 'installedRevision' in c:
   installed=f'r{c["installedRevision"]:03}' if c['installedRevision'] is not None else 'not issued / staged only'
   detail[4:4]=[f'Installed visual revision: **{installed}**. Publication authorization is separate from final art sign-off.','']
  for rev in c['revisions']:
   detail.extend([f'## r{rev["revision"]:03} — {rev["state"]}','',rev['change'],''])
   for e in rev['evidence']:
    path=ROOT/e['path'];link=Path(__import__('os').path.relpath(path,folder));detail.append(f'- [{e["role"]}]({link.as_posix()}) — SHA256 `{e["sha256"]}`')
   detail.extend(['',f'Feedback: {json.dumps(rev["feedback"])}',''])
  (folder/'ASSET.md').write_text('\n'.join(detail)+'\n')
 (LIB/'INDEX.md').write_text('\n'.join(lines)+'\n')
p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
a=sub.add_parser('bootstrap');a.add_argument('--source',required=True)
sub.add_parser('index');sub.add_parser('status')
a=sub.add_parser('start');a.add_argument('id');a.add_argument('--change',required=True)
a=sub.add_parser('feedback');a.add_argument('id');a.add_argument('--author',choices=['agent','owner'],required=True);a.add_argument('--text',required=True);a.add_argument('--message-reference')
a=sub.add_parser('evidence');a.add_argument('id');a.add_argument('--role',required=True);a.add_argument('--file',required=True)
a=sub.add_parser('review');a.add_argument('id');a.add_argument('--outcome',choices=['pass','fail'],required=True);a.add_argument('--notes',required=True)
args=p.parse_args()
if args.command=='bootstrap':
 if FILE.exists():raise SystemExit('Ledger already exists; never overwrite it with bootstrap')
 source=(ROOT/args.source).resolve();m=json.loads((source/'manifest.json').read_text());entries=[]
 def evidence(role,file):
  f=source/file;return {'role':role,'path':str(f.relative_to(ROOT)),'sha256':digest(f),'bytes':f.stat().st_size}
 for c in m['components']:
  entries.append({'id':c['id'],'name':c['name'],'slot':c['slot'],'collection':c['collection'],'inventoryDefinition':'crew-'+c['id'],'stats':{'boundsMeters':c['boundsMeters'],'massKg':c['massKg'],'grid':c['grid']},'ownerFinalSignoff':None,'revisions':[{'revision':m['revision'],'state':'in-progress','change':'Native source separated into independent equipment; shared-rig runtime validation.','feedback':[],'evidence':[evidence('blender-source','blender-source.blend'),evidence('model',c['glb']),evidence('image',c['image'])]}]})
 for kind,ids in [('base',m['bodyTypes']),('hair',[h for h in m['hairStyles'] if h!='none'])]:
  for value in ids:
   id=f'{kind}-{value}';entries.append({'id':id,'name':f'{value.title()} {kind}','slot':kind,'collection':f'{kind.upper()}-{value}','ownerFinalSignoff':None,'revisions':[{'revision':m['revision'],'state':'in-progress','change':'Modesty-covered shared-rig base.' if kind=='base' else 'Independently selectable shared-rig hairstyle.','feedback':[],'evidence':[evidence('blender-source','blender-source.blend'),evidence('model',id+'.glb'),evidence('image',id+'.png')]}]})
 write({'schema':'sidereal.character-components.v1','integrationRevision':m['revision'],'updatedAt':now(),'components':entries});print('Indexed',len(entries),'components')
else:
 d=json.loads(FILE.read_text())
 if args.command=='status':
  print(json.dumps({'components':len(d['components']),'unsigned':sum(not c.get('ownerFinalSignoff') or c['ownerFinalSignoff']['revision']!=c['revisions'][-1]['revision'] for c in d['components'])}));raise SystemExit
 if args.command=='index':index(d);raise SystemExit
 c=next(c for c in d['components'] if c['id']==args.id);rev=c['revisions'][-1]
 if args.command=='start':
  n=rev['revision']+1;folder=LIB/'components'/c['id']/'revisions'/f'r{n:03}';folder.mkdir(parents=True,exist_ok=False)
  c['revisions'].append({'revision':n,'state':'in-progress','change':args.change,'feedback':[],'evidence':[]});c['ownerFinalSignoff']=None;print(folder)
 elif args.command=='feedback':
  if args.author=='owner' and not args.message_reference:raise SystemExit('Owner feedback needs the actual message reference')
  rev['feedback'].append({'author':args.author,'text':args.text,'messageReference':args.message_reference,'recordedAt':now()})
 elif args.command=='evidence':
  src=Path(args.file).resolve();target=LIB/'components'/c['id']/'revisions'/f'r{rev["revision"]:03}'/src.name;target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists():raise SystemExit('Evidence is immutable; choose a new filename/revision')
  shutil.copy2(src,target);rev['evidence'].append({'role':args.role,'path':str(target.relative_to(ROOT)),'sha256':digest(target),'bytes':target.stat().st_size});rev['state']='in-progress'
 elif args.command=='review':
  roles={e['role'] for e in rev['evidence']}
  if args.outcome=='pass' and not {'blender-source','model','image','runtime','validation'}<=roles:raise SystemExit('Review pass needs editable source, model, image, runtime and validation evidence')
  rev['state']='awaiting-owner' if args.outcome=='pass' else 'changes-requested';rev['feedback'].append({'author':'agent','text':args.notes,'review':args.outcome,'recordedAt':now()})
 d['updatedAt']=now();write(d)
