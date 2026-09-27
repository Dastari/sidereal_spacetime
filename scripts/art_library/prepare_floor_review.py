"""Prepare floor kit review catalogs/proxies and validate exact Blender exports."""
from pathlib import Path
import copy
import hashlib
import json
import math
import struct
import sys

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[1])
REV=int(OUT.name[1:]);DESIGN='shipyard.floor.mapped-deck-kit'
components=json.loads((OUT/'components.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read_glb(path):
    b=path.read_bytes();length=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+length])

kit=read_glb(OUT/'kit.glb')
assert any('normalTexture' in m and 'occlusionTexture' in m for m in kit['materials'])
assert all('bufferView' in i for i in kit.get('images',[]))
validation={'result':'geometry/material validation only; browser review pending','components':[],
 'kit':{'sha256':sha(OUT/'kit.glb'),'bytes':(OUT/'kit.glb').stat().st_size,'materials':len(kit['materials']),
 'images':len(kit.get('images',[])),'shared_import':'One native kit GLB, per-asset nodePrefix; materials/textures imported once',
 'normal_materials':[m['name'] for m in kit['materials'] if 'normalTexture' in m],
 'occlusion_materials':[m['name'] for m in kit['materials'] if 'occlusionTexture' in m]},
 'maps':{p.name:sha(p) for p in sorted((OUT/'maps').glob('*.png'))},'lights_per_tile':0}
volumes={};assets=[];placements=[]
pitch=.0625
def inside(x,y,xy):
    # Exclude centres exactly on an angled boundary so rotated complements do
    # not claim the same cell. This conservative draft proxy leaves <=1-cell
    # boundary uncertainty; it is not authoritative collision geometry.
    return all((xy[(i+1)%len(xy)][0]-xy[i][0])*(y-xy[i][1])-(xy[(i+1)%len(xy)][1]-xy[i][1])*(x-xy[i][0])>1e-8 for i in range(len(xy)))
def encode(cells):
    runs=[];prev=cells[0];count=0
    for v in cells:
        if v!=prev:runs.extend((prev,count));prev=v;count=0
        count+=1
    runs.extend((prev,count));return runs
for i,c in enumerate(components):
    g=read_glb(OUT/c['slug']/'model.glb')
    triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
    primitives=[p for m in g['meshes'] for p in m['primitives']]
    assert triangles==c['runtime_triangles'] and 0<triangles<300
    assert all(all(k in p['attributes'] for k in ['POSITION','NORMAL','TEXCOORD_0','TANGENT']) for p in primitives)
    a={'id':c['id'],'label':c['label']+' / mapped draft','category':'floor','nodes':[],
       'bounds':c['bounds'],'thumbnail':'/assets/assembly/floor-review/'+c['slug']+'/cutout.png','lights':[],
       'visual':{'url':'/assets/assembly/floor-review/kit.glb','sha256':sha(OUT/'kit.glb'),'designId':DESIGN,
        'revision':REV,'bounds':c['bounds'],'damagePreview':'unsupported','nodePrefix':c['node_prefix']}}
    assets.append(a)
    pos=c.get('board_position_m',[(i%4)*4.8,(i//4)*4.8,0])
    placements.append({'id':'floor-review-'+c['slug'],'assetId':c['id'],'position':pos,'rotation':0,'flipped':False,'removedCells':[]})
    chunks={}
    for y in range(math.ceil(c['bounds']['max'][1]/pitch)):
        for x in range(math.ceil(c['bounds']['max'][0]/pitch)):
            if not inside((x+.5)*pitch,(y+.5)*pitch,c['polygon_xy_m']):continue
            for z in range(3):
                key=(x//32,y//32,z//32);cells=chunks.setdefault(key,[0]*32768)
                cells[x%32+(y%32)*32+(z%32)*1024]=1
    volumes[c['id']]={'cellMeters':pitch,'layers':[{'layer':'floor-proxy','chunks':[{'id':','.join(map(str,key)),
       'origin':[n*32 for n in key],'runs':encode(cells)} for key,cells in chunks.items()]}]}
    count=sum(sum(bool(v) for v in cells) for cells in chunks.values())
    validation['components'].append({'slug':c['slug'],'triangles':triangles,'primitives':len(primitives),
       'normal_uv_tangents':True,'bounds_m':c['bounds'],'proxy_occupied_cells':count,
       'proxy_volume_m3':count*pitch**3,'analytic_volume_m3':c['area_m2']*.1875,
       'proxy_basis':'XY polygon cell-centre sampling, excluding centres exactly on the edge, and exact 3-cell thickness. Rotated complementary shapes do not double-own boundary cells. Conservative boundary uncertainty <= one sample; not authoritative collision publication.'})
baseline=json.loads((ROOT/'assets/runtime/assembly/catalog.json').read_text())
current=json.loads((ROOT/'assets/runtime/assembly/wayfarer.json').read_text())
old_floor=[a for a in baseline['assets'] if a['category']=='floor']
ids={a['id'] for a in old_floor}
original_glb=read_glb(ROOT/'assets/runtime/assembly/parts.glb')
old_triangles={}
for node in original_glb['nodes']:
    if 'mesh' not in node:continue
    for a in old_floor:
        if node.get('name','').startswith('GEO-'+a['id']+'--'):
            old_triangles[a['id']]=old_triangles.get(a['id'],0)+sum(original_glb['accessors'][p['indices']]['count']//3 for p in original_glb['meshes'][node['mesh']]['primitives'])
validation['legacy_baseline']={'catalog_sha256':sha(ROOT/'assets/runtime/assembly/catalog.json'),
 'parts_glb_sha256':sha(ROOT/'assets/runtime/assembly/parts.glb'),'floor_asset_count':len(old_floor),
 'floor_placement_count':sum(p['assetId'] in ids for p in current['parts']),
 'procedural_floor_triangles_by_asset':old_triangles,
 'note':'Counts are geometry measurements, not FPS or light-count savings. Native pilot floor placements are separately identified in the current catalog.'}
# Isolated board still imports the actual baseline GLB to permit matched comparison.
catalog={'schema':'sidereal.part-catalog.v1','assets':assets}
board={'schema':'sidereal.assembly-draft.v1','id':f'floor-review-r{REV:03}','name':'Floor kit / unsigned draft','parts':placements}
(OUT/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
(OUT/'wayfarer.json').write_text(json.dumps(board,indent=2)+'\n')
(OUT/'catalog.voxels.json').write_text(json.dumps({'schema':'sidereal.part-volumes.v1','palette':['#000000','#8e99b2'],'volumes':volumes})+'\n')
# A second review catalog replaces existing floor visuals only. Keep placement IDs
# and store explicit frame migration: old centre origins → new lower-left datum.
ship_catalog=copy.deepcopy(baseline);ship_catalog['assets']+=assets
by_slug={c['slug']:c for c in components};square=by_slug['square-2m'];triangle=by_slug['triangle-45']
ship=copy.deepcopy(current);ship['id']=f'floor-ship-review-r{REV:03}';ship['name']='Wayfarer / unsigned mapped floor preview'
migrations=[]
for p in ship['parts']:
    a=next(a for a in baseline['assets'] if a['id']==p['assetId'])
    if a['category']!='floor':continue
    before=copy.deepcopy(p)
    native=bool(a.get('visual'))
    p['assetId']=triangle['id'] if 'corner45' in a['label'] else square['id']
    if not native:
        # Original deck surface is 0.1875 m above its ship datum. Structural
        # backing below it is an independent integration concern, retained in data.
        dx,dy=a['bounds']['min'][:2];angle=p['rotation']
        p['position'][0]+=dx*math.cos(angle)-dy*math.sin(angle)
        p['position'][1]+=dx*math.sin(angle)+dy*math.cos(angle)
        p['position'][2]=0
    migrations.append({'before':before,'review_after':copy.deepcopy(p),'publication':False})
(OUT/'ship-catalog.json').write_text(json.dumps(ship_catalog,indent=2)+'\n')
(OUT/'ship-wayfarer.json').write_text(json.dumps(ship,indent=2)+'\n')
original_volumes=json.loads((ROOT/'assets/runtime/assembly/catalog.voxels.json').read_text())
original_volumes['volumes'].update(volumes)
(OUT/'ship-catalog.voxels.json').write_text(json.dumps(original_volumes)+'\n')
(OUT/'placement-migration-preview.json').write_text(json.dumps(migrations,indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps(validation,indent=2)+'\n')
print('FLOOR_PREPARED',len(assets),'variants;',len(migrations),'isolated floor replacement placements')
