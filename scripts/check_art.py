"""Validate actual exported model, data textures and declared asset hashes."""
from pathlib import Path
import hashlib,json,struct,math
ROOT=Path(__file__).resolve().parents[1]
def glb(path):
 data=path.read_bytes();magic,version,size=struct.unpack_from('<III',data)
 assert magic==0x46546c67 and version==2 and size==len(data),path
 length,kind=struct.unpack_from('<II',data,12);assert kind==0x4e4f534a
 return json.loads(data[20:20+length])
for name in ['voxels','materials','assembly']:
 manifest=json.loads((ROOT/f'assets/runtime/{name}/manifest.json').read_text())
 for file,digest in manifest['outputs'].items():
  path=ROOT/file if file.startswith('assets/') else ROOT/f'assets/runtime/{name}'/file
  assert hashlib.sha256(path.read_bytes()).hexdigest()==digest,f'Asset hash changed: {path}'
ship=glb(ROOT/'assets/runtime/voxels/wayfarer.glb')
raw=(ROOT/'assets/runtime/voxels/wayfarer.glb').read_bytes()
json_length=struct.unpack_from('<I',raw,12)[0];binary=raw[28+json_length:]
def values(attribute):
 a=ship['accessors'][attribute];view=ship['bufferViews'][a['bufferView']]
 width={'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5123:'H',5121:'B'}[a['componentType']]
 size=struct.calcsize(fmt)*width;offset=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',size)
 divisor=(65535 if fmt=='H' else 255) if a.get('normalized') else 1
 for i in range(a['count']):yield tuple(v/divisor for v in struct.unpack_from('<'+fmt*width,binary,offset+i*stride))
assert any(node.get('name')=='GEO-roof' for node in ship['nodes'])
for room in ['engineering','hydroponics','storage','crew','medbay','lounge']:
 assert any(node.get('name','').startswith('GEO-room-'+room) for node in ship['nodes']) or any(p['id'].startswith('room-'+room) for e in json.loads((ROOT/'assets/runtime/assembly/equipment-manifest.json').read_text())['entries'] for p in e['placements']),room
triangles=0;primitives=0;textured=0
for mesh in ship['meshes']:
 for primitive in mesh['primitives']:
  primitives+=1;triangles+=ship['accessors'][primitive['indices']]['count']//3
  assert primitive.get('mode',4)==4
  position=ship['accessors'][primitive['attributes']['POSITION']]
  assert all(math.isfinite(v) for v in position['min']+position['max'])
  if 'COLOR_0' in primitive['attributes']:
   assert all(all(math.isfinite(v) and 0<=v<=1 for v in color) for color in values(primitive['attributes']['COLOR_0'])),'Corrupt vertex palette (possible stale Blender UV layer reference)'
  material=ship['materials'][primitive['material']]
  if 'normalTexture' in material:
   textured+=1;assert 'TEXCOORD_0' in primitive['attributes']
   assert 'metallicRoughnessTexture' in material['pbrMetallicRoughness']
assert textured>0 and 10000<triangles<325000
assert len(ship.get('images',[]))>=2
metrics=json.loads((ROOT/'assets/runtime/voxels/metrics.json').read_text())
surfaces=json.loads((ROOT/'assets/runtime/voxels/surface-metrics.json').read_text())
assert triangles==sum(s['triangles'] for s in surfaces)
assert triangles < metrics['triangles'] * 3.5
assert all(s['nonmanifoldEdges']==s['evaluatedNonmanifoldEdges'] for s in surfaces)
assert sum(s['beveledEdges'] for s in surfaces)>1000
rock=glb(ROOT/'assets/runtime/voxels/asteroid.glb');assert rock['meshes']
print(json.dumps({'ship_triangles':triangles,'ship_primitives':primitives,'textured_primitives':textured,'layer_batches':metrics['batches'],'occupied_voxels':metrics['occupied'],'hashes':'passed'}))

for slug in ['engine-pod','bulkhead','airlock']:
 manifest=json.loads((ROOT/f'assets/runtime/voxels/{slug}-manifest.json').read_text())
 for file,digest in {**manifest['outputs'],**manifest['tools']}.items():
  assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,f'Changed sampled artifact: {file}'
 data=json.loads((ROOT/f'assets/runtime/voxels/{slug}.voxels.json').read_text())
 metric=json.loads((ROOT/f'assets/runtime/voxels/{slug}-metrics.json').read_text())
 model=glb(ROOT/f'assets/runtime/voxels/{slug}.glb')
 triangles=sum(model['accessors'][p['indices']]['count']//3 for m in model['meshes'] for p in m['primitives'])
 assert triangles==metric['triangles'] and triangles<metric['occupied']*12
 assert metric['emissiveVoxels']>0 and any(any(m.get('emissiveFactor',[0,0,0])) for m in model['materials'])
 cells={};occupied=0
 for chunk in data['chunks']:
  runs=chunk['runs'];assert len(runs)%2==0
  decoded=[]
  for material,count in zip(runs[::2],runs[1::2]):
   assert isinstance(count,int) and count>0 and 0<=material<len(data['palette'])
   decoded.extend([material]*count)
  assert len(decoded)==32**3
  for i,material in enumerate(decoded):
   if not material:continue
   occupied+=1
   if slug=='bulkhead':
    o=chunk['origin'];cells[(o[0]+i%32,o[1]+(i//32)%32,o[2]+i//1024)]=material
 assert occupied==metric['occupied']
 if slug=='bulkhead':
  # Full continuous sealing core and flush mating faces, including brick seams.
  assert all(cells.get((x,0,z),0) for x in range(-32,32) for z in range(80))
  assert all(cells.get((31,0,z),0) and cells.get((-32,0,z),0) for z in range(80))
 print(json.dumps({'asset':slug,**metric,'solid_material_data':'passed'}))
catalog=json.loads((ROOT/'assets/runtime/assembly/catalog.json').read_text())
volumes=json.loads((ROOT/'assets/runtime/assembly/catalog.voxels.json').read_text())
model=glb(ROOT/'assets/runtime/assembly/parts.glb')
nodes={n.get('name') for n in model['nodes']}
for asset in catalog['assets']:
 assert asset['id'] in volumes['volumes']
 visual=asset.get('visual')
 asset_nodes={n.get('name') for n in glb(ROOT/'assets/runtime'/visual['url'].removeprefix('/assets/'))['nodes']} if visual else nodes
 assert all(node in asset_nodes for node in asset['nodes'])
 if visual:assert hashlib.sha256((ROOT/'assets/runtime'/visual['url'].removeprefix('/assets/')).read_bytes()).hexdigest()==visual['sha256']
 thumbnail=asset.get('thumbnail',f"/assets/assembly/thumbnails/{asset['id']}.svg")
 assert thumbnail.startswith('/assets/')
 assert (ROOT/'assets/runtime'/thumbnail.removeprefix('/assets/')).is_file(), 'Missing asset thumbnail: '+asset['id']
 assert volumes['volumes'][asset['id']]['cellMeters'] in (.0625,.03125)
print(json.dumps({'part_assets':len(catalog['assets']),'assembly_sources':'passed'}))

# The ship's Blender-first fixture is real solid sampling, merged into its matter
# volume by build_voxel.ts. Validate its independent source provenance as well.
fixture_manifest=json.loads((ROOT/'assets/runtime/voxels/ship-wall-fixture-manifest.json').read_text())
for file,digest in {**fixture_manifest['outputs'],**fixture_manifest['tools']}.items():
 assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,f'Changed ship fixture artifact: {file}'
fixture=json.loads((ROOT/'assets/runtime/voxels/ship-wall-fixture.voxels.json').read_text())
assert fixture['schema']=='sidereal.sampled-solid.v1' and fixture['cellMeters']==.0625
assert len(fixture['cells'])==fixture_manifest['occupied']>0
assert len({tuple(cell[:3]) for cell in fixture['cells']})==len(fixture['cells'])
assert all(len(cell)==4 and all(isinstance(value,int) for value in cell) and 0<cell[3]<len(fixture['palette']) for cell in fixture['cells'])
assert {fixture['palette'][cell[3]]['voxelMaterialId'] for cell in fixture['cells']}=={3,13,27,31}
ship_manifest=json.loads((ROOT/'assets/runtime/voxels/manifest.json').read_text())
assert all(source in ship_manifest['sources'] for source in ['packages/content/src/voxel-wayfarer-shell.ts','packages/content/src/voxel-wayfarer-interior.ts','scripts/build_ship_fixture_source.py','scripts/voxelize_blender.py'])
print(json.dumps({'ship_fixture_cells':len(fixture['cells']),'source_materials_and_provenance':'passed'}))

# Authored hydroponics: actual closed-solid occupancy and explicit botanical
# presentation are separate, bounded representations of the same placed prop.
prop_manifest=json.loads((ROOT/'assets/runtime/voxels/interior-props-manifest.json').read_text())
for file,digest in {**prop_manifest['outputs'],**prop_manifest['tools']}.items():
 assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,file
hydro=json.loads((ROOT/'assets/runtime/voxels/interior-props.voxels.json').read_text())['hydroponics']
assert hydro['cellMeters']==.0625
assert len({tuple(c[:3]) for c in hydro['cells']})==len(hydro['cells'])>2000
assert all(-12<=x<12 and -5<=y<5 and 0<=z<28 for x,y,z,m in hydro['cells'])
assert {17,18,27,31,34,36,37,38,39}.issubset({p['voxelMaterialId'] for p in hydro['palette'][1:]})
visual=hydro['visualSurface'];assert visual['kind']=='authored-botanical-surface'
assert set(visual['materials'])=={17,18,36,38}
assert len(visual['faces'])<2000 and all(math.isfinite(n) for p in visual['vertices'] for n in p)
assert sum(p['id'].startswith('room-hydroponics-tray-') for e in json.loads((ROOT/'assets/runtime/assembly/equipment-manifest.json').read_text())['entries'] for p in e['placements'])==3
print(json.dumps({'hydroponics_samples':len(hydro['cells']),'botanical_visual':'approved native equipment GLBs; historical sampled source retained','prop_provenance':'passed'}))

# Inventory UI icons are CPU renders of preserved original equipment sources.
icons_root=ROOT/'assets/runtime/equipment/icons'
icons_manifest=json.loads((icons_root/'manifest.json').read_text())
assert hashlib.sha256((ROOT/icons_manifest['source']).read_bytes()).hexdigest()==icons_manifest['sourceSha256']
assert hashlib.sha256((ROOT/icons_manifest['generator']).read_bytes()).hexdigest()==icons_manifest['generatorSha256']
assert len(icons_manifest['entries'])==11 and icons_manifest['iconBytes']<1024*1024
for entry in icons_manifest['entries']:
 raw=(icons_root/entry['file']).read_bytes()
 assert hashlib.sha256(raw).hexdigest()==entry['sha256'],entry['file']
 assert raw[:8]==b'\x89PNG\r\n\x1a\n' and raw[12:16]==b'IHDR'
 assert struct.unpack('>II',raw[16:24])==(256,256) and raw[24:26]==bytes([8,6]),entry['file']
 assert len(raw)==entry['bytes'] and all(6<=coordinate<=250 for coordinate in entry['boundsPixels'])
assert sum(entry['bytes'] for entry in icons_manifest['entries'])==icons_manifest['iconBytes']
assert hashlib.sha256((icons_root/icons_manifest['contactSheet']).read_bytes()).hexdigest()==icons_manifest['contactSheetSha256']
print(json.dumps({'inventory_icons':11,'icon_bytes':icons_manifest['iconBytes'],'preserved_source_and_rgba_provenance':'passed'}))

# Exact owner-approved equipment exports and unchanged placement/occupancy contracts.
import runpy
runpy.run_path(str(ROOT/"scripts/validate_installed_equipment.py"),run_name="__main__")

# Interim hull publication is authorized separately from final design sign-off.
if (ROOT/'assets/runtime/assembly/hull-manifest.json').exists():
 import subprocess
 subprocess.run(['python3',str(ROOT/'scripts/validate_installed_hull.py')],cwd=ROOT,check=True)

# Authored modular crew publication and its preserved native source.
runpy.run_path(str(ROOT/"scripts/character_components/check_installed.py"),run_name="__main__")

# Owner-authorized paired pose equipment; canonical equipment remains preserved.
if (ROOT/'assets/runtime/crew/poses/r002').exists():
 runpy.run_path(str(ROOT/'scripts/validate_installed_poses.py'),run_name='__main__')
