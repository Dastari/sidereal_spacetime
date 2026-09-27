"""Inventory current Shipyard equipment and start isolated reference-led revisions."""
from pathlib import Path
import json, hashlib, subprocess, sys
ROOT=Path(__file__).resolve().parents[2]
LIB=ROOT/'assets/art-library'
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def cli(*args): subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),*args],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
# Catalog order is explicitly verified below, never used as a replacement identity.
rows=[
 ('pilot-seat','chair','3d-rpg-after--wayfarer-pilot-seat','part-c0b6b036f5b3dd8bd2f3','Seated piloting workstation; artwork grants no control.',65,25,1,'seat',.75),
 ('command-console','console','internal-components-2--command-console','part-d9f37a5f7ea6e8d13254','Three display command desk with reachable input shelf.',110,350,1,'operator',.8),
 ('wall-locker','locker','internal-components-2--locker','part-c03ec0260cd7329050a8','Two-door personal supply locker; access from either cabin side.',55,0,.25,'storage_m3',.6),
 ('reactor','reactor','modular-spaceship-design-2--reactor-module','part-77728ecc8ad36b0ff45f','Compact generator machinery with guarded luminous core and coolant interfaces.',1200,-1000000,200000,'heat_W',.6),
 ('hydroponics','bed','internal-components-2--hydroponics-bed','part-acbbef7209c4ef100693','Three cultivated plant wells, feed unit and overhead grow light.',45,180,3,'plant_wells',.6),
 ('crew-bunk','bunk','internal-components-2--bunk-bed','part-c41467ac46f6b350df24','Two stacked sleeping berths with separate cushions and climbing steps.',145,12,2,'berths',.75),
 ('medical-bed','bed','modular-spaceship-design-2--medical-bed-module','part-cc610ba071b8eb38ab8c','One treatment couch with raised headrest, side rails and diagnostic screen.',180,250,1,'patients',.8),
 ('lounge-sofa','sofa','modular-spaceship-design-2--lounge-straight-sofa','part-73df516feb786d73fc5e','Three-place straight upholstered bench with removable seat modules.',85,0,3,'seats',.75),
 ('bridge-bank','console','internal-components-2--navigation-console','part-75910d7a0d27dfc17aaf','Compact auxiliary navigation terminal; port/starboard service-access variants.',35,120,1,'operator',.7),
]
catalog=read(ROOT/'assets/runtime/assembly/catalog.json');assembly=read(ROOT/'assets/runtime/assembly/wayfarer.json')
equipment={a['id']:a for a in catalog['assets'] if a['category']=='equipment'}
expected={r[3] for r in rows}|{'part-0f14bf002f4c11854337'}
if set(equipment)!=expected: raise ValueError('Catalog changed; inspect before mapping')
source_paths=['assets/runtime/assembly/catalog.json','assets/runtime/assembly/wayfarer.json','assets/runtime/assembly/catalog.voxels.json','assets/runtime/assembly/parts.glb','assets/source/modular_parts.blend','assets/source/voxel_wayfarer.blend','assets/source/interior_hydroponics.blend','scripts/build_assembly.ts','scripts/export_voxel_blender.py','packages/content/src/voxel-wayfarer.ts','packages/content/src/voxel-wayfarer-interior.ts','packages/content/src/voxel-wayfarer-props.ts','scripts/build_interior_prop_source.py','scripts/voxelize_blender.py','packages/sim/src/voxels.ts']
inventory={'schema':'sidereal.shipyard-equipment-review.v1','publication':'not authorized','source_hashes':{p:sha(ROOT/p) for p in source_paths if (ROOT/p).exists()},'assets':[]}
jobs=[]
for slug,family,ref,aid,purpose,mass,power,capacity,unit,clearance in rows:
 design='shipyard.equipment.'+slug
 cli('split','pale-studless.'+family+'.standard',design,'--references',ref,'--reason','Owner requested current Shipyard equipment redesign; resolve this precise silhouette and retain other family appearances.')
 hypothesis='Use the selected reference silhouette, fitted pale studless plates and distinct soft/metal/emissive roles inside the current placement envelope.'
 cli('start',design,'--covers',ref,'--change','Replace current coarse equipment study with measured Blender solids and actual voxel review.','--hypothesis',hypothesis,'--agent','shipyard-equipment-redesign')
 ledger=read(LIB/'designs'/design/'design.json');revision=ledger['current_revision']
 ids=[aid]+(['part-0f14bf002f4c11854337'] if slug=='bridge-bank' else [])
 variants=[]
 for id in ids:
  a=equipment[id]; placements=[p for p in assembly['parts'] if p['assetId']==id]
  variant='starboard' if id=='part-0f14bf002f4c11854337' else 'port' if slug=='bridge-bank' else 'standard'
  entry={'catalog_asset':a,'design_id':design,'design_asset_uuid':ledger['asset_uuid'],'variant':variant,'placements':placements,'reference_ids':[ref], 'source_chain': ['packages/content/src/voxel-wayfarer.ts','packages/content/src/voxel-wayfarer-interior.ts','scripts/build_assembly.ts','scripts/export_voxel_blender.py','assets/source/modular_parts.blend'], 'source_note':'Editable original geometry is TS-authored voxel solids; modular_parts.blend is the derived mesh, not the authoring recipe.'}
  if slug=='hydroponics':entry.update(source_chain=['scripts/build_interior_prop_source.py','assets/source/interior_hydroponics.blend','assets/runtime/voxels/interior-props.voxels.json','packages/content/src/voxel-wayfarer-props.ts',*entry['source_chain']],source_note='Original closed Blender solids plus authored botanical presentation surface. New revision samples all geometry; compare botanical coarsening explicitly.')
  inventory['assets'].append(entry);variants.append({'asset_id':id,'name':variant,'placement_ids':[p['id'] for p in placements],'bounds_m':a['bounds']})
 dimensions=[b-a for a,b in zip(equipment[aid]['bounds']['min'],equipment[aid]['bounds']['max'])]
 stat=lambda value,unit,basis: {'value':value,'unit':unit,'status':'proposed','basis':basis}
 spec={'design_id':design,'revision':revision,'reference_ids':[ref],'purpose':purpose,'dimensions_m':dimensions,'dimension_status':'current catalog envelope; validate measured new bounds','origin':'bottom center; X east/width, Y north/depth, Z up; runtime X/-Z and Y height','variants':variants,'canonical_geometry':'shared recipe; bridge bank retains two IDs and explicit handed service panels','crew':{'height_m':1.8,'standing_clearance_height_m':2.1,'access_clearance_m':clearance,'basis':'Human reach/egress proposal; collision and animated rig fitting are not implemented by this review','access':'front -Y; locker both X faces; bunk/medical both X sides; sofa -X; pilot +Y'},'interfaces':[{'name':'SOCK_MOUNT','position_m':[0,0,0],'status':'proposed'},{'name':'SOCK_POWER','position_m':[0,dimensions[1]/2,.125],'status':'proposed'},{'name':'SOCK_DATA','position_m':[.125,dimensions[1]/2,.1875],'status':'proposed'}], 'stats':{'dry_mass':stat(mass,'kg','Furniture frame or compact machinery class estimate; excludes contents/crew, not voxel-density derived'),'power':stat(power,'W','Design discussion estimate; negative is proposed generation, no reducer wiring'),'capacity':stat(capacity,unit,'Count of visible intended user/plant stations; reactor heat is unvalidated engineering proposal')},'materials':{'shell':'pale enamel/polymer, metalness 0.05 roughness .36','frame':'dark indigo, roughness .48','service':'burgundy enamel','structure':'exposed steel .8 metallic','cushions':'fabric/foam .82 roughness','emitter':'opaque cyan insert, constant emission; no unsupported glass'},'collision':'Closed material-bearing voxels for preview; intended authoritative collision linkage pending. Clearance envelopes stay separate from geometry.','animation':'Named component solids retained; mechanical/crew animation not yet authored.','lod':'One measured hero voxel mesh; no fleet/LOD performance claim.','uncertainties':['Back and underside are inferred, not observed.','Reference perspective and cropped edges do not establish depth.','Proposed stats are neither approved design nor implemented authority.','Placement and animation fit require review before publication.'], 'pipeline':{'pitch_m':.03125,'sampler':'scripts/voxelize_blender.py','mesher':'packages/sim/src/voxels.ts meshChunk','optics':'opaque-only; reject transmission rather than flattening it'}}
 if slug=='reactor':spec['interfaces'] += [{'name':'SOCK_COOLANT','position_m':[.5,1.2,.25],'status':'proposed'},{'name':'SOCK_FUEL','position_m':[-.5,1.2,.25],'status':'proposed'}]
 if slug=='pilot-seat':spec['interfaces'].append({'name':'SOCK_SEAT','position_m':[0,0,.48],'status':'proposed; not a control grant'})
 if slug=='hydroponics':spec['interfaces'].append({'name':'SOCK_WATER','position_m':[.625,.2,.25],'status':'proposed'})
 out=Path('.runtime/art-library/equipment')/design/f'r{revision:03}'
 (ROOT/out).mkdir(parents=True,exist_ok=False)
 (ROOT/out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
 jobs.append({'design_id':design,'slug':slug,'revision':revision,'reference_id':ref,'output':str(out),'variants':variants})
review=LIB/'shipyard-equipment';review.mkdir(exist_ok=True)
(review/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
lines=['# Shipyard equipment redesign inventory','','All 10 current equipment catalog IDs and all original placement records are preserved below. Nine canonical designs; two bridge-bank variants. No final sign-off or publication.','','| Catalog asset | Design | Variant | Placements | Authoring source |','| --- | --- | --- | --- | --- |']
for e in inventory['assets']:lines.append(f"| {e['catalog_asset']['label']} (`{e['catalog_asset']['id']}`) | [{e['design_id']}](../designs/{e['design_id']}/DESIGN.md) | {e['variant']} | {len(e['placements'])} | {'Blender hydroponics source' if 'hydroponics' in e['design_id'] else 'TypeScript voxel solids → derived modular_parts.blend'} |")
lines+=['','Exact placement IDs, transforms, source hashes, bounds and reference links: [inventory.json](inventory.json).','', 'The wearable twelve-item equipment-kit.blend is a different catalog and is outside this request. Room labels represent one placed furnishing/machine aggregate, not permission to merge other room contents. New gameplay child identities require a future explicit migration.']
(review/'README.md').write_text('\n'.join(lines)+'\n')
(ROOT/'.runtime/art-library/equipment/jobs.json').write_text(json.dumps(jobs,indent=2)+'\n')
print(f'Started {len(jobs)} designs covering {len(equipment)} catalog assets and {sum(len(e["placements"]) for e in inventory["assets"])} placements')
