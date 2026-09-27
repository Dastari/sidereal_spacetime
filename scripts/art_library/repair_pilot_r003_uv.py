from pathlib import Path
import bpy,sys,json,shutil
out=Path(sys.argv[sys.argv.index('--')+1]);a=out/'attempt-03';a.mkdir(exist_ok=True)
for name in ['pilot-kit.blend','blender-damaged.png','blender-worn.png']:shutil.copy2(out/name,a/name)
cs=json.loads((out/'components.json').read_text())
for comp in cs:
 (a/comp['slug']).mkdir(exist_ok=True)
 for state in ['clean','worn','damaged']:shutil.copy2(out/comp['slug']/(state+'.glb'),a/comp['slug']/(state+'.glb'))
bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'))
for comp in cs:
 col=bpy.data.collections[comp['slug']]
 for o in col.objects:
  m=o.data
  if m.uv_layers.get('AuthoredSurfaceUV'):
   uv=m.uv_layers['AuthoredSurfaceUV']
   for f in m.polygons:
    coords=[m.vertices[m.loops[i].vertex_index].co for i in f.loop_indices];axes=sorted(range(3),key=lambda a:max(v[a] for v in coords)-min(v[a] for v in coords),reverse=True)[:2]
    if abs(f.normal.z)<.5:axes=[axes[0] if axes[0]!=2 else axes[1],2]
    for idx,v in zip(f.loop_indices,coords):uv.data[idx].uv=[(v[ax]-min(w[ax] for w in coords))/max(.00001,max(w[ax] for w in coords)-min(w[ax] for w in coords)) for ax in axes]
 for state in ['clean','worn','damaged']:
  bpy.ops.object.select_all(action='DESELECT')
  for o in col.objects:
   o.hide_set(False);o.select_set(True)
   for slot in o.material_slots:
    if slot.material.name.startswith(('clean','worn','damaged')):slot.material=bpy.data.materials[state+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
  bpy.context.view_layer.objects.active=list(col.objects)[0]
  bpy.ops.export_scene.gltf(filepath=str(out/comp['slug']/(state+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
 for o in col.objects:
  o.hide_set(True)
  for slot in o.material_slots:
   if slot.material.name.startswith(('clean','worn','damaged')):slot.material=bpy.data.materials['clean'+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'assembly.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
