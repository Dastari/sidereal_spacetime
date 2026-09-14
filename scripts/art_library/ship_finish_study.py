"""Isolated material study on preserved native Blender r001 hull; never publishes."""
from pathlib import Path
import sys, json, hashlib, struct, tomllib, subprocess
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/art-library/shipyard-hull/material-studies/native-r001-polymer-01'
SOURCE=ROOT/'assets/art-library/designs/shipyard.hull.pilot-section/revisions/r001/blender-source.blend'
if '--blender' not in sys.argv:
    if (OUT/'candidate.blend').exists(): raise SystemExit('Preserve prior candidate; use a new study for another iteration')
    OUT.mkdir(parents=True,exist_ok=True)
    config=tomllib.loads((ROOT/'dev.toml').read_text())
    subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',__file__,'--','--blender'],check=True,cwd=ROOT)
    raise SystemExit()
import bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
manifest=json.loads((ROOT/'assets/runtime/assembly/hull-manifest.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def geometry_digest():
    h=hashlib.sha256()
    for ob in sorted((o for o in bpy.data.objects if o.type=='MESH'),key=lambda o:o.name):
        h.update(ob.name.encode());h.update(str([tuple(v.co) for v in ob.data.vertices]).encode());h.update(str([tuple(f.vertices) for f in ob.data.polygons]).encode());h.update(str([tuple(row) for row in ob.matrix_world]).encode());h.update(str([(m.name,m.type,getattr(m,'width',None),getattr(m,'segments',None)) for m in ob.modifiers]).encode())
    return h.hexdigest()
original_geometry=geometry_digest()
# Original authored surfaces and modifiers remain untouched; only shader inputs change.
roles={}
for m in bpy.data.materials:
    if not m.use_nodes:continue
    p=m.node_tree.nodes.get('Principled BSDF')
    if not p:continue
    role='paint' if m.name.startswith('clean') else 'seal' if m.name=='Graphite seals' else 'accent' if m.name=='Service red' else None
    if role:roles[m.name]=(m,p,role)
# One calibrated isolated panel pair makes source material differences reviewable.
for o in scene.objects:
    if o.type in {'MESH','LIGHT'}:o.hide_render=True
for o in bpy.data.collections['hull-straight'].objects:o.hide_set(False);o.hide_render=False
camera=scene.camera;camera.location=(4,-5,3);target=Vector((1,.19,.55));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.2
for name,position,energy,size in [('Study broad key',(-2,-3,5),350,3),('Study edge fill',(3,2,3),180,2)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.shape='DISK';light.size=size;ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob);ob.location=position;ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.resolution_x=900;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.render.filepath=str(OUT/'blender-before.png');bpy.ops.render.render(write_still=True)
changes=[]
for name,(m,p,role) in roles.items():
    old={k:p.inputs[k].default_value for k in ['Metallic','Roughness','IOR','Coat Weight','Coat Roughness']}
    rough={'paint':.30,'seal':.62,'accent':.28}[role];coat={'paint':.12,'seal':0,'accent':.08}[role]
    # r001 clean roughness map is constant130/255, so replace its link with an explicit scalar.
    for link in list(p.inputs['Roughness'].links):m.node_tree.links.remove(link)
    for k,v in {'Metallic':0,'Roughness':rough,'IOR':1.46,'Coat Weight':coat,'Coat Roughness':.20}.items():p.inputs[k].default_value=v
    changes.append({'material':name,'role':role,'before':old,'after':{'metallic':0,'roughness':rough,'ior':1.46,'coat':coat,'coatRoughness':.2}})
scene.render.filepath=str(OUT/'blender-candidate.png');bpy.ops.render.render(write_still=True)
assert geometry_digest()==original_geometry,'Material study changed geometry'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'candidate.blend'))
exports=[]
for entry in manifest['entries']:
    asset=entry['asset'];slug=asset['label'].split(' / ')[0].removeprefix('Pilot ');collection=bpy.data.collections[slug]
    bpy.ops.object.select_all(action='DESELECT')
    for o in collection.objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=list(collection.objects)[0]
    path=OUT/asset['id']/'clean.glb';path.parent.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')
    # Blender omits opaque IOR; retain this explicit supported PBR input without touching buffers.
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);changed=False
    for material in doc.get('materials',[]):
        if material['name'] in roles:
            material.setdefault('extensions',{})['KHR_materials_ior']={'ior':1.46};changed=True
    if changed:
        used=doc.setdefault('extensionsUsed',[])
        if 'KHR_materials_ior' not in used:used.append('KHR_materials_ior')
        chunk=json.dumps(doc,separators=(',',':')).encode();chunk+=b' '*((-len(chunk))%4);tail=raw[20+n:]
        path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(chunk)+len(tail))+struct.pack('<I4s',len(chunk),b'JSON')+chunk+tail)
    exports.append({'assetId':asset['id'],'url':asset['visual']['url'],'candidate':str(path.relative_to(ROOT)),'sha256':sha(path),'baselineSha256':asset['visual']['sha256']})
record={'schema':'sidereal.material-study.v1','status':'draft-awaiting-runtime-review','design':'shipyard.hull.pilot-section','sourceRevision':1,'doesNotAdvanceActiveDesignRevision':2,'owner':'geometry_snap_bevel finish subtask; structural author retains hull r002','source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE),'geometryDigestBefore':original_geometry,'geometryDigestAfter':geometry_digest(),'changes':changes,'untouchedRoles':['Titanium hardware','Blue laminated glazing','Canopy marker emitter','all equipment'],'reference':'assets/art-library/assets/3d-rpg-after--wayfarer-target-cutaway/revisions/r000/reference.png','referenceSha256':sha(ROOT/'assets/art-library/assets/3d-rpg-after--wayfarer-target-cutaway/revisions/r000/reference.png'),'exports':exports,'publication':False,'approval':None,'limitations':['Material-only study; does not redesign or claim reference-matching hull geometry','Production lighting and shadows unchanged; runtime gate required']}
(OUT/'study.json').write_text(json.dumps(record,indent=2))
print(json.dumps({'output':str(OUT),'exports':len(exports),'unchangedGeometry':original_geometry==geometry_digest()}))
