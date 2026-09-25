"""Prepare isolated roof review by stable identity; no publication."""
from pathlib import Path
import sys,json,hashlib,copy,struct,math
R=Path(__file__).resolve().parents[2];O=Path(sys.argv[1]);rev=int(O.name[1:])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def glb(p):b=p.read_bytes();return json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
c=json.loads((R/'assets/runtime/assembly/catalog.json').read_text());ship=json.loads((R/'assets/runtime/assembly/wayfarer.json').read_text());cs=json.loads((O/'components.json').read_text());by={v['slug']:v for v in cs};assets={a['id']:a for a in c['assets']};roofs=[p for p in ship['parts'] if assets[p['assetId']]['category']=='roof'];baseline={'catalog_sha256':sha(R/'assets/runtime/assembly/catalog.json'),'assembly_sha256':sha(R/'assets/runtime/assembly/wayfarer.json'),'roof_placements':roofs,'roof_assets':[a for a in c['assets'] if a['id'] in {p['assetId'] for p in roofs}],'all_placements':len(ship['parts'])};(O/'baseline-inventory.json').write_text(json.dumps(baseline,indent=2))
mapid={}
for p in roofs:
 a=assets[p['assetId']];x,y,z=p['position'];label=a['label']
 if 'outer-roof-collar' in label:slug='outer-roof-collar'
 elif 'pilot-roof' in label:slug='pilot-roof'
 elif 'roof-square' in label:slug='vestibule-name'
 elif abs(x)>5:slug='edge-short' if y< -9 else 'edge-long'
 elif y< -9:slug='stern-strip'
 elif abs(x)>3:
  slug='shoulder-red' if y in [-6,6] else 'shoulder-vent-fore-datum' if y==8 else 'shoulder-vent' if y in [-8,-4,2] else 'shoulder-lamp' if y in [-2,4] else 'shoulder-plain'
 elif abs(x)>1:
  slug='transition-'+('break-' if y in [-4,4] else 'service-aft-' if y==-8 else 'service-fore-' if y==-6 else 'service-' if y==6 else '')+('port' if x<0 else 'starboard')
 else:slug='center-crossbreak' if y in [-4,4] else 'center-service-aft' if y==-8 else 'center-service-fore' if y==-6 else 'center-service' if y==6 else 'center-quiet'
 if p['assetId'] in mapid:assert mapid[p['assetId']]==slug
 mapid[p['assetId']]=slug
for a in c['assets']:
 if a['id'] not in mapid:continue
 k=by[mapid[a['id']]];a['nodes']=[];a['label']='Frontier roof '+k['slug']+' / draft r%03d'%rev;a['bounds']=k['bounds'];a['lights']=k['lights'];a['visual']={'url':'/assets/assembly/roof-review/kit.glb','sha256':sha(O/'kit.glb'),'designId':'shipyard.roof.frontier','revision':rev,'bounds':k['bounds'],'nodePrefix':k['node_prefix'],'damagePreview':'unsupported'};a['thumbnail']='/assets/assembly/roof-review/'+k['slug']+'/cutout.png'
(O/'ship-catalog.json').write_text(json.dumps(c,indent=2));(O/'ship-wayfarer.json').write_text(json.dumps(ship,indent=2));(O/'placement-mapping.json').write_text(json.dumps([{'placed_id':p['id'],'asset_id':p['assetId'],'component':mapid[p['assetId']],'position':p['position'],'rotation':p['rotation'],'flipped':p['flipped']} for p in roofs],indent=2))
# Separate occupancy samples from closed authored Blender solids.
# Native PBR meshes are untouched; subcell decorative pieces are explicitly omitted.
v=json.loads((R/'assets/runtime/assembly/catalog.voxels.json').read_text());pitch=.0625
for aid,slug in mapid.items():
 samples=json.loads((O/slug/'samples.json').read_text());chunks={}
 for x,y,z,_material in samples['cells']:
  key=(x//32,y//32,z//32);arr=chunks.setdefault(key,[0]*32768);arr[x%32+(y%32)*32+(z%32)*1024]=1
 encoded=[]
 for key,arr in chunks.items():
  runs=[];prev=arr[0];count=0
  for val in arr:
   if val!=prev:runs.extend([prev,count]);prev=val;count=0
   count+=1
  runs.extend([prev,count]);encoded.append({'id':','.join(map(str,key)),'origin':[n*32 for n in key],'runs':runs})
 v['volumes'][aid]={'cellMeters':pitch,'layers':[{'layer':'roof','chunks':encoded}]}
(O/'ship-catalog.voxels.json').write_text(json.dumps(v))
g=glb(O/'kit.glb');assert all(not any(k in n for k in ['translation','rotation','scale','matrix']) for n in g['nodes']), 'Merged export nodes must have identity datum transforms';tri={}
for k in cs:
 gg=glb(O/k['slug']/'model.glb');tri[k['slug']]=sum(gg['accessors'][p['indices']]['count']//3 for m in gg['meshes'] for p in m['primitives']);assert all('NORMAL' in p['attributes'] and 'TEXCOORD_0' in p['attributes'] and 'TANGENT' in p['attributes'] for m in gg['meshes'] for p in m['primitives'])
old=glb(R/'assets/runtime/assembly/parts.glb');oldtri={}
for n in old['nodes']:
 if 'mesh' in n:oldtri[n.get('name','')]=sum(old['accessors'][p['indices']]['count']//3 for p in old['meshes'][n['mesh']]['primitives'])
original_assets={a['id']:a for a in json.loads((R/'assets/runtime/assembly/catalog.json').read_text())['assets']};base=sum(sum(oldtri.get(n,0) for n in original_assets[p['assetId']]['nodes']) for p in roofs)
report={'revision':rev,'status':'Geometry validated; visual browser review pending','kit_sha256':sha(O/'kit.glb'),'kit_bytes':(O/'kit.glb').stat().st_size,'materials':[m['name'] for m in g['materials']],'images':len(g.get('images',[])),'normal_mapped_materials':[m['name'] for m in g['materials'] if 'normalTexture' in m],'triangles_by_component':tri,'total_placed_roof_triangles':sum(tri[mapid[p['assetId']]] for p in roofs),'legacy_roof_triangle_baseline':base,'legacy_baseline_note':'Legacy part GLB only; baseline native cockpit excluded','placement_count':len(roofs),'all_placement_records_unchanged':ship==json.loads((R/'assets/runtime/assembly/wayfarer.json').read_text()),'proxy':'Actual evaluated closed Blender source solids sampled by BVH scanline union at1/16m. Subcell decorative geometry explicitly omitted; transparent/PBR materials replaced only on separate sampling copies. Not authoritative collision/damage.','textures':{p.name:sha(p) for p in (O/'maps').glob('*.png')},'export_nodes_identity':True,'source_blend_sha256':sha(O/'roof-kit.blend'),'all_normal_mapped_primitives_have_tangents':True,'publication':False}
(O/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
