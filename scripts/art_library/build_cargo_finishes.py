from pathlib import Path
import bpy,json,sys,math,hashlib
from mathutils import Vector
jobs=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
colors={'pale':(.62,.68,.76),'amber':(.92,.30,.008),'blue':(.018,.10,.35),'red':(.34,.018,.034),'green':(.025,.24,.11),'dark':(.025,.034,.052),'covered':(.62,.68,.76),'glass-gauge':(.012,.10,.32)}
for j in jobs:
 out=Path(j['output']);base=Path(j['base']);bpy.ops.wm.open_mainfile(filepath=str(base/'blender-source.blend'));scene=bpy.context.scene;s=j['specification'];family=s['family'];w,d,h=s['dimensions_m'];finish=j['finish']
 mat=bpy.data.materials.new('Cargo finish | '+finish);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*colors[finish],1);p.inputs['Metallic'].default_value=.08;p.inputs['Roughness'].default_value=.34
 objects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('GEO-') and not o.hide_render]
 for o in objects:
  target=o.name.startswith(('GEO-fitted-side-panel','GEO-front-fitted-panel','GEO-lid-fitted-cap','GEO-door-service-plate'))
  if family=='refrigerated':target=o.name.startswith(('GEO-continuous-clipped-pressure-shell','GEO-cooling-service-housing'))
  if family=='vacuum':target=o.name.startswith('GEO-continuous-clipped-pressure-shell') or (finish=='amber' and o.name.startswith(('GEO-front-load-collar','GEO-rear-load-collar')))
  if family=='salvage':target=o.name.startswith(('GEO-compression-frame-band','GEO-front-load-collar','GEO-rear-load-collar','GEO-recovery-scrape-rail'))
  if family=='fluid':target=o.name.startswith('GEO-broad-opaque-level-housing')
  if target:o.data.materials.clear();o.data.materials.append(mat)
 if family=='fluid' and finish=='covered':
  for o in objects:
   if o.name.startswith('GEO-level-display'):o.hide_render=True
  # Replace the luminous broad gauge by a fitted solid cover, retaining a small end telltale.
  for sign in [-1,1]:
   bpy.ops.mesh.primitive_cube_add(size=1,location=(sign*(w/2+.047),0,(.14+min(w/2-.09,(h-.14)/2-.04))));o=bpy.context.object;o.name='GEO-covered-gauge-service-plate';o.dimensions=(.016,d*.45,.09);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);objects.append(o)
 if family=='fluid' and finish=='glass-gauge':
  glass=bpy.data.materials.new('Cargo | actual gauge glass');glass.use_nodes=True;gp=glass.node_tree.nodes.get('Principled BSDF');gp.inputs['Base Color'].default_value=(.15,.56,.72,.22);gp.inputs['Alpha'].default_value=.22;gp.inputs['Roughness'].default_value=.13;glass.surface_render_method='DITHERED'
  water=bpy.data.materials.new('Cargo | gauge liquid indicator');water.use_nodes=True;wp=water.node_tree.nodes.get('Principled BSDF');wp.inputs['Base Color'].default_value=(.01,.22,.65,1);wp.inputs['Roughness'].default_value=.21
  for sign in [-1,1]:
   x=sign*(w/2+.075);z=.14+min(w/2-.09,(h-.14)/2-.04)
   for name,radius,depth,m in [('glass-tube',.034,d*.45,glass),('blue-fluid-column',.023,d*.39,water)]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=(x,0,z),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='GEO-'+name;o.data.materials.append(m);objects.append(o)
   for yy in [-d*.225,d*.225]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.013,depth=.15,location=(sign*(w/2+.025),yy,z),rotation=(0,math.pi/2,0));o=bpy.context.object;o.name='GEO-connected-gauge-feed';o.data.materials.append(mat);objects.append(o)
 objects=[o for o in objects if not o.hide_render];bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();copies=[];pts=[];tri=0
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:
  me=bpy.data.meshes.new_from_object(o.evaluated_get(deps));me.transform(o.matrix_world);me.calc_loop_triangles();tri+=len(me.loop_triangles);pts.extend(v.co.copy() for v in me.vertices);cp=bpy.data.objects.new(o.name+'--export',me);scene.collection.objects.link(cp);cp.select_set(True);copies.append(cp)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
 for o in copies:bpy.data.objects.remove(o,do_unlink=True)
 materials=[]
 for m in {o.active_material for o in objects}:
  p=m.node_tree.nodes.get('Principled BSDF');c=list(p.inputs['Base Color'].default_value);c[3]=p.inputs['Alpha'].default_value;materials.append({'name':m.name,'base_color':c,'metallic':p.inputs['Metallic'].default_value,'roughness':p.inputs['Roughness'].default_value})
 (out/'materials.json').write_text(json.dumps(materials,indent=2));v=json.loads((base/'validation-blender.json').read_text());v.update({'finish':finish,'bounds_m':{'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]},'triangles':tri,'editable_meshes':len(objects),'base_source_sha256':hashlib.sha256((base/'blender-source.blend').read_bytes()).hexdigest(),'optical':'GLB alpha-blended gauge glass with separate opaque fluid column; no transmission/pressure simulation' if finish=='glass-gauge' else 'opaque PBR'});(out/'validation-blender.json').write_text(json.dumps(v,indent=2));scene['finish']=finish;scene['specification']=json.dumps(s);bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
 scene.render.filepath=str(out/'cutout.png');scene.render.film_transparent=True;bpy.ops.render.render(write_still=True)
 scene.render.film_transparent=False;scene.world.color=(.07,.08,.11);scene.render.filepath=str(out/'blender-close.png');bpy.ops.render.render(write_still=True)
 c=scene.camera;c.location=(0,-.001,max(w,d,h)*4);c.rotation_euler=(Vector((0,0,0))-c.location).to_track_quat('-Z','Y').to_euler();c.data.ortho_scale=max(w,d)*1.25+.15;scene.render.filepath=str(out/'blender-top.png');bpy.ops.render.render(write_still=True)
 print('FINISH_COMPLETE',j['slug'],flush=True)
