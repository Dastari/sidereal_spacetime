"""Editable front integration subset; canonical review revisions stay untouched."""
from pathlib import Path
import bpy,sys,json,hashlib
from mathutils import Vector
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r004/context';source=root/'.runtime/art-library/hull/r004/pilot-kit.blend';docpath=out/'wayfarer-final.json'
expected='6379edbe1e37975a985ac1513b7747a910cc04d12c99dbb9793a219270f230db'
if hashlib.sha256(docpath.read_bytes()).hexdigest()!=expected:raise ValueError('Context changed; recapture exact stable composition')
if (out/'review-assembly.blend').exists():raise ValueError('Preserve meaningful context source before replacing')
doc=json.loads(docpath.read_text());parts={p['id']:p for p in doc['parts']}
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
included=[]
for o in scene.objects:
 if o.type=='EMPTY' and o.name in parts:
  p=parts[o.name];o.location=p['position'];o.rotation_euler.z=p['rotation'];o.scale.x=-1 if p['flipped'] else 1;included.append(p['id'])
# Append editable approved roof master meshes, not the flattened runtime export.
approved=root/'assets/source/published-hull/pilot-kit-r001.blend'
with bpy.data.libraries.load(str(approved),link=False) as (available,wanted):wanted.collections=['roof-square']
col=wanted.collections[0];scene.collection.children.link(col)
for o in col.objects:o.hide_render=True;o.hide_set(True);o['source']='Approved r001 editable roof master'
for p in doc['parts']:
 if not p['id'].startswith('pilot-context-vestibule-roof-'):continue
 node=bpy.data.objects.new(p['id'],None);scene.collection.objects.link(node);node.location=p['position'];node.rotation_euler.z=p['rotation'];node['asset_id']=p['assetId'];node['approved_source']=str(approved)
 for src in col.objects:
  o=src.copy();o.data=src.data;scene.collection.objects.link(o);o.parent=node;o.hide_render=False;o.hide_set(False);o['placed_object_id']=p['id']
 included.append(p['id'])
scene['review_scope']='Editable front integration subset: 26 r004 hull placements, 3 approved r001 roof tiles, 4 approved equipment placements. Retained main hull is intentionally not included; actual full Shipyard context is separate evidence.'
scene['context_sha256']=expected
scene.render.film_transparent=True;scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.cycles.samples=64
camera=scene.camera;target=Vector((0,10,1));camera.location=(-12,22,12);camera.data.ortho_scale=14;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
def roofs(visible):
 for o in scene.objects:
  if o.parent and ('pilot-roof' in o.parent.name or 'vestibule-roof' in o.parent.name):o.hide_render=not visible
roofs(True);bpy.ops.wm.save_as_mainfile(filepath=str(out/'review-assembly.blend'))
scene.render.filepath=str(out/'blender-context-closed.png');bpy.ops.render.render(write_still=True)
roofs(False);scene.render.filepath=str(out/'blender-context-cutout.png');bpy.ops.render.render(write_still=True)
camera.location=(0,10,20);camera.rotation_euler=(Vector((0,10,0))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/'blender-context-top.png');bpy.ops.render.render(write_still=True)
# Save open, legible default while roof objects remain editable and individually selectable.
camera.location=(-12,22,12);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();bpy.ops.wm.save_as_mainfile(filepath=str(out/'review-assembly.blend'))
report={'scope':scene['review_scope'],'context_sha256':expected,'included_placement_ids':included,'seat_position':parts['equipment-control-seat']['position'],'canonical_source':str(source),'approved_roof_source':str(approved),'editable_source':'review-assembly.blend','main_hull_included':False,'authority_changed':False,'published':False}
(out/'blender-context-manifest.json').write_text(json.dumps(report,indent=2));print('CONTEXT_SOURCE_COMPLETE',len(included),flush=True)
