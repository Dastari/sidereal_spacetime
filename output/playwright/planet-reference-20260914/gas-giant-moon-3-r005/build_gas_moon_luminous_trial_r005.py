"""Bounded luminous-mineral interpretation, not a claim about reference physics.
Blender --background --python THIS -- NEW_OUTPUT gas-giant-moon-[13]
"""
import sys,json,hashlib,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=Path(sys.argv[sys.argv.index('--')+1]).resolve();name=sys.argv[sys.argv.index('--')+2]
assert name in ['gas-giant-moon-1','gas-giant-moon-3'];prior=root/'output/playwright/planet-reference-20260914'/(name+'-r004');source=(prior/'generator.py').read_text()
source=source.replace('.40<r<.73 and .10<angle<1.35','.38<r<1.03 and -.12<angle<1.38').replace('.56<angle<.84 and r>.51','.40<angle<.98 and r>.51')
source=source.replace('clearcoat=1,clearcoatRoughness=.08','clearcoatFactor=1,clearcoatRoughnessFactor=.08')
insert='''# Explicit art interpretation: existing native mineral faces emit bounded colored light.
# No global glow, replacement shader, new point lights or geometry changes.
for role,color,strength in [(6,(.42,.015,.90),.7),(7,(1.,.025,.44),1.1)]:
 shader=materials[role].node_tree.nodes.get('Principled BSDF')
 shader.inputs['Emission Color'].default_value=(*color,1)
 shader.inputs['Emission Strength'].default_value=strength
 kit['materials'][role].update(emissiveColor=list(color),emissiveStrength=strength)
'''
source=source.replace("validation={'publication':",insert+"\nvalidation={'publication':",1)
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists();(out/'generator.py').write_text(source);(out/'foundation-source-r004.py').write_bytes((prior/'generator.py').read_bytes())
exec(compile(source,str(out/'generator.py'),'exec'))
old=json.loads((prior/'kit.json').read_text());new=json.loads((out/'kit.json').read_text());
for before,after in zip(old['variants'],new['variants']):
 for field in ['name','positions','normals','uvs','indices']:assert before[field]==after[field],field
assert old['materials'][:6]==new['materials'][:6]
for role in (6,7):
 for key,value in old['materials'][role].items():assert new['materials'][role][key]==value,(role,key)
for path in prior.glob('*.png'):
 if path.name.startswith('rocky-'):assert path.read_bytes()==(out/path.name).read_bytes(),path.name
# Blender omits opaque IOR. Preserve its untouched export and normalize only JSON,
# retaining exact BIN geometry/attributes and authored physical IOR in final GLBs.
sys.path.insert(0,str(root/'scripts/art_library'))
from preserve_native_kit_ior import corrected_glb
records=[]
for path in out.glob('*.glb'):
 raw=path.read_bytes();corrected,changes=corrected_glb(raw,{m['name']:m for m in new['materials']})
 if changes:
  archive=out/'unmodified-blender-exports';archive.mkdir(exist_ok=True);(archive/path.name).write_bytes(raw);path.write_bytes(corrected);records.append({'file':path.name,'changes':changes,'originalSHA256':hashlib.sha256(raw).hexdigest(),'finalSHA256':hashlib.sha256(corrected).hexdigest(),'binByteIdentical':True})
(out/'ior-preservation.json').write_text(json.dumps(records,indent=2))
(out/'interpretation.json').write_text(json.dumps({'referenceId':'planets--'+name,'source':'r004','sourceSHA256':hashlib.sha256((prior/'kit.json').read_bytes()).hexdigest(),'hypothesis':'Bounded luminous mineral facets intentionally interpret ambiguous localized magenta illustrated highlights; not recovered physical truth.','changes':{'role6':new['materials'][6],'role7':new['materials'][7]},'geometryAndRoles':'all11 variants retain exact geometry, normals, UVs and indices; only selected existing rim-sector face material assignments broaden','originalSixMaterials':'exact','all16TextureBytes':'exact','coverage':'Existing single regional mineral sector expands to outer rim facets after emission-only78px preview remained unreadable; no new geometry or population. Actual whole-moon reference-scale gate remains open.','approval':None},indent=2))
# Controlled native-region optical A/B: same camera, geometry, materials and lamps.
from mathutils import Vector
parts=dict(forms)['battered-region-a'];visible=set(parts)
for obj in scene.objects:
 if obj.type=='MESH':obj.hide_render=obj not in visible
corners=[obj.matrix_world@Vector(corner)for obj in parts for corner in obj.bound_box]
center=Vector(tuple((min(p[i]for p in corners)+max(p[i]for p in corners))/2 for i in range(3)))
scene.camera.location=center+Vector((3.1,3.6,3.6));scene.camera.rotation_euler=(center-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=4.6
scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.resolution_percentage=100
for role in (6,7):materials[role].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=0
scene.render.filepath=str(out/'native-mineral-emission-off.png');bpy.ops.render.render(write_still=True)
for role in (6,7):materials[role].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=new['materials'][role]['emissiveStrength']
scene.render.filepath=str(out/'native-mineral-emission-on.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_percentage=13;scene.render.filepath=str(out/'native-mineral-small.png');bpy.ops.render.render(write_still=True)
