"""Preserved study02 low-LOD derivative: remove bevel modifiers only; no publication."""
import bpy,json,hashlib,bmesh
from pathlib import Path
ROOT=Path('/root/sidereal_spacetime');SRC=ROOT/'assets/art-library/planet-geology-studies/basalt-forms-02';OUT=ROOT/'assets/art-library/planet-geology-studies/basalt-forms-lod-01'
OUT.mkdir(parents=True,exist_ok=True)
if (OUT/'basalt-forms.blend').exists():raise RuntimeError('Preserve existing revision')
bpy.ops.wm.open_mainfile(filepath=str(SRC/'basalt-forms.blend'))
geometry={};audit=[]
for o in list(bpy.data.objects):
 if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True);continue
 slug=o.name.removeprefix('GEO-');before=[tuple(v.co)for v in o.data.vertices];faces=[tuple(p.vertices)for p in o.data.polygons];roles=[p.material_index for p in o.data.polygons]
 removed=[]
 for mod in list(o.modifiers):
  if mod.type=='BEVEL':removed.append({'name':mod.name,'width':mod.width,'segments':mod.segments});o.modifiers.remove(mod)
 assert before==[tuple(v.co)for v in o.data.vertices] and faces==[tuple(p.vertices)for p in o.data.polygons] and roles==[p.material_index for p in o.data.polygons]
 o.location=(0,0,0) # remove source-sheet presentation offsets, not vertex changes
 bpy.context.view_layer.update();e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=e.to_mesh();me.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(me)
 assert all(edge.is_manifold for edge in bm.edges),slug
 assert bm.calc_volume(signed=True)>0,slug
 geometry[slug]={'positions':[list(v.co)for v in me.vertices],'triangles':[list(t.vertices)for t in me.loop_triangles],'materialIndices':[me.polygons[t.polygon_index].material_index for t in me.loop_triangles]}
 audit.append({'slug':slug,'vertices':len(me.vertices),'triangles':len(me.loop_triangles),'removedModifiers':removed,'authoredVerticesFacesAndMaterialRolesUnchanged':True,'closedManifold':True,'signedVolume':bm.calc_volume(signed=True)})
 bm.free();e.to_mesh_clear();bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
 audit[-1]['glbSha256']=hashlib.sha256((OUT/(slug+'.glb')).read_bytes()).hexdigest()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'basalt-forms.blend'))
(OUT/'geometry.json').write_text(json.dumps(geometry,separators=(',',':')))
(OUT/'study.json').write_text(json.dumps({'status':'unpublished LOD derivative, no final art approval','source':str((SRC/'basalt-forms.blend').relative_to(ROOT)),'sourceSha256':hashlib.sha256((SRC/'basalt-forms.blend').read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256((OUT/'basalt-forms.blend').read_bytes()).hexdigest(),'geometrySha256':hashlib.sha256((OUT/'geometry.json').read_bytes()).hexdigest(),'interface':'Same study02 nativeXYZ tangent-plane coordinates and material indices0dark/1cliff/2top. No source-sheet offsets. Base−.9, footprint±.7. Only bevel modifiers removed; authored course/ledge geometry untouched.','forms':audit},indent=2))
print(json.dumps(audit))
