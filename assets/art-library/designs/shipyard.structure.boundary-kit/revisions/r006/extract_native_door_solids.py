"""Retain evaluated authored solid identities for the exact r001 visual export."""
import bpy, json, sys
from pathlib import Path
root=Path.cwd();base=root/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001'
bpy.ops.wm.open_mainfile(filepath=str(base/'boundary-kit.blend'))
for o in bpy.context.scene.objects:o.hide_set(False)
bpy.context.view_layer.update();out={}
for prefix in ['GEO-door-leaf--','GEO-door-frame-2m--']:
 parts=[]
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH' or not o.name.startswith(prefix):continue
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()));cp=bpy.data.objects.new('AUDIT-'+o.name,mesh);bpy.context.scene.collection.objects.link(cp)
  bpy.context.view_layer.objects.active=cp;mod=cp.modifiers.new('Native export triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
  # The published r001 exporter copies evaluated local meshes then applies only
  # the part-root translation. Source child transforms are identity.
  t=o.parent.location if o.parent else o.location
  parts.append({'name':o.name,'vertices':[[float(v.co[i]+t[i])for i in range(3)]for v in cp.data.vertices],'triangles':[list(p.vertices)for p in cp.data.polygons]})
  bpy.data.objects.remove(cp,do_unlink=True)
 out[prefix+'surface']=parts
p=Path(sys.argv[sys.argv.index('--')+1]);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(out,indent=2)+'\n');print('Native door solids',len(out),sum(len(p)for p in out.values()))
# R004 continuous wall/node primitives also retain authored object boundaries.
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family/editable-parts.blend'))
for o in bpy.context.scene.objects:o.hide_set(False)
bpy.context.view_layer.update()
for partId in ['span-086cc581b11f','node-ee493bf1352e','node-b4c788600641']:
 parts=[]
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH' or not o.name.startswith('GEO-'+partId+'--'):continue
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()));mesh.calc_loop_triangles()
  parts.append({'name':o.name,'vertices':[[float(n)for n in v.co]for v in mesh.vertices],'triangles':[list(t.vertices)for t in mesh.loop_triangles]})
 out['GEO-boundary-r004-'+partId+'--surface']=parts
p.write_text(json.dumps(out,indent=2)+'\n');print('Native door and wall solids',len(out),sum(len(p)for p in out.values()))
