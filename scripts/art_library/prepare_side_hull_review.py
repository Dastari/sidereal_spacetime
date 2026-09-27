"""Isolated catalog and sampled fitting proxies for all eighteen existing placements."""
from pathlib import Path
import sys,json,hashlib,struct,copy
R=Path(__file__).resolve().parents[2];O=Path(sys.argv[1]);rev=int(O.name[1:]);B=R/'.runtime/art-library/side-hull/baseline'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def glb(p):b=p.read_bytes();return json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
c=read(B/'catalog.json');d=read(B/'wayfarer.json');v=read(B/'catalog.voxels.json');components={k['slug']:k for k in read(O/'components.json')};aids={a['id']:a for a in c['assets']}
for aid,k in components.items():
 a=aids[aid];a['nodes']=[];a['bounds']=k['bounds'];a['lights']=k['lights'];a['label']='Frontier side armor '+k['variant']+' / draft '+O.name;a['visual']={'url':'/assets/assembly/side-hull-review/kit.glb','sha256':sha(O/'kit.glb'),'designId':'shipyard.hull.side-armor','revision':rev,'bounds':k['bounds'],'nodePrefix':k['node_prefix'],'damagePreview':'unsupported'};a['thumbnail']='/assets/assembly/side-hull-review/'+aid+'/cutout.png'
 chunks={}
 for x,y,z,_ in read(O/aid/'samples.json')['cells']:
  arr=chunks.setdefault((x//32,y//32,z//32),[0]*32768);arr[x%32+y%32*32+z%32*1024]=1
 encoded=[]
 for key,arr in chunks.items():
  runs=[];previous=arr[0];count=0
  for value in arr:
   if value!=previous:runs.extend([previous,count]);previous=value;count=0
   count+=1
  runs.extend([previous,count]);encoded.append({'id':','.join(map(str,key)),'origin':[n*32 for n in key],'runs':runs})
 v['volumes'][aid]={'cellMeters':.0625,'layers':[{'layer':'armor','chunks':encoded}]}
# Reuse the approved independent decal system; each painted panel remains individually editable.
for p in d['parts']:
 if p['assetId'] not in components:continue
 k=components[p['assetId']]
 if k['variant']=='identity':
  side=k['side'];px=p['position'][0]
  p['decals']=[{'id':'side-registration-'+str(side),'kind':'text','text':'WF-01','face':'right' if side>0 else 'left','position':[side*6.027-px,0,1.42],'size':[1.45,.58],'rotation':0,'color':'#d2d5e0'}]
for name,data in [('ship-catalog.json',c),('ship-wayfarer.json',d),('ship-catalog.voxels.json',v)]: (O/name).write_text(json.dumps(data))
g=glb(O/'kit.glb');tri={}
for aid in components:
 gg=glb(O/aid/'model.glb');tri[aid]=sum(gg['accessors'][p['indices']]['count']//3 for m in gg['meshes']for p in m['primitives'])
 assert all('NORMAL'in p['attributes']and'TEXCOORD_0'in p['attributes']and'TANGENT'in p['attributes']for m in gg['meshes']for p in m['primitives'])
assert all(not any(key in n for key in ['translation','rotation','scale','matrix'])for n in g['nodes'])
old=glb(R/'assets/runtime/assembly/parts.glb');counts={n.get('name'):sum(old['accessors'][p['indices']]['count']//3 for p in old['meshes'][n['mesh']]['primitives']) for n in old['nodes']if 'mesh'in n};original={a['id']:a for a in read(B/'catalog.json')['assets']};baseline=sum(sum(counts.get(n,0)for n in original[aid]['nodes'])for aid in components)
report={'legacy_placed_triangles':baseline,'revision':rev,'kit_sha256':sha(O/'kit.glb'),'bytes':(O/'kit.glb').stat().st_size,'materials':[m['name']for m in g['materials']],'images':len(g.get('images',[])),'triangles':tri,'placed_triangles':sum(tri.values()),'placements':18,'canonical_variants':len(set(k['variant']for k in components.values())),'proxy':'Actual closed Blender solids, BVH scanline sampled 1/16m; details below sample pitch omitted. Separate fitting preview, no authority changes.','published':False}
(O/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
(O/'specification.json').write_text(json.dumps({'design':'shipyard.hull.side-armor','revision':rev,'purpose':'Replaceable external sacrificial armor and service access outside pressure wall','interfaces':{'module_length_m':2,'height_m':2.9375,'inner_world_x_abs_m':5.3125,'max_outer_world_x_abs_m':6.155,'world_z_m':[-.25,2.6875],'placement_records':'18 existing IDs/positions/rotations preserved; per-panel paint added separately','crew_clearance':'Outside pressure wall; no interior intrusion. Suggested EVA service clearance 0.8m outward is proposed only.','sockets':'Existing independent exterior mounts preserved; no authority socket changes'},'materials':'Shared pale enamel, indigo polymer, burgundy service paint, exposed steel, cyan/amber emissive lenses; packed normal/roughness maps','stats':[{'field':'armor_mass','value':None,'unit':'kg/module','status':'proposed','basis':'Requires gameplay balance and material thickness approval; visual envelope is not solid steel.'},{'field':'fixture_power','value':4,'unit':'W/fixture','status':'proposed','basis':'Small service LED strip; runtime light is presentation only.'},{'field':'armor_hit_points','value':None,'unit':'HP','status':'proposed','basis':'No authority/stat changes authorized by this redesign.'}],'lod':'Single native mesh per existing asset, shared kit/materials; no automatic LOD claimed','references':['3d-rpg-after--wayfarer-exterior-red-service-panel','3d-rpg-after--wayfarer-exterior-vent-wall','3d-rpg-after--wayfarer-exterior-side-hatch','3d-rpg-after--wayfarer-exterior-slogan-panel'],'scope':'Eighteen side-run modules outlined by owner. Approved bow, roof, stern returns, interiors and independent mounts retained.'},indent=2))
