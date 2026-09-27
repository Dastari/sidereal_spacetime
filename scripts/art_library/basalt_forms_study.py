"""Isolated editable native basalt geology forms; never publishes runtime assets."""
import bpy,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/root/sidereal_spacetime');OUT=ROOT/'assets/art-library/planet-geology-studies/basalt-forms-02'
OUT.mkdir(parents=True,exist_ok=True)
if (OUT/'basalt-forms.blend').exists():raise RuntimeError('Preserve previous revision')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
roles=[('basalt-dark',(.018,.010,.030)),('slate-cliff',(.040,.025,.052)),('lavender-top',(.075,.062,.100))];mats=[]
for name,color in roles:
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.58;p.inputs['Metallic'].default_value=0;mats.append(m)
# Authored height courses and broken footprints, not radial polygon rings.
forms={
'broken-escarpment':[
[None,None,.18,.18,.34,.34,None,None],
[None,.31,.31,.58,.58,.43,.17,None],
[.22,.52,.88,.88,.62,.38,.17,.12],
[.22,.52,1.12,1.12,.76,.38,.14,.12],
[None,.47,.91,.91,.76,.31,.08,None],
[None,.24,.60,.60,.35,.12,None,None],
[None,None,.25,.25,.14,None,None,None]],
'fractured-plateau':[
[None,.18,.18,.35,.35,None,None,None],
[.16,.44,.72,.72,.57,.35,.15,None],
[.16,.44,.72,.96,.96,.57,.34,.14],
[None,.38,.72,.96,.42,.42,.57,.14],
[.12,.38,.63,.63,.42,.24,.44,.14],
[.12,.24,.48,.63,.48,.24,.18,None],
[None,None,.24,.24,.18,.18,None,None]],
'breached-caldera':[
[None,None,.14,.24,.42,.42,.22,None,None],
[None,.18,.43,.72,.95,.72,.46,.18,None],
[.14,.43,.72,.46,.38,.56,.82,.36,.14],
[.24,.62,.38,.12,.08,.18,.62,.56,.22],
[.24,.86,.43,.08,-.12,.08,.34,.62,.22],
[.16,.62,.34,.04,-.12,.04,.18,.38,.14],
[None,.34,.18,.02,-.08,.02,.12,.22,None],
[None,None,.12,.00,-.04,.00,.08,None,None]],
}
# Remove edge-only saddle contacts in authored courses: bridge one low cell
# to the adjacent high course before mesh construction, preserving depressions.
for rows in forms.values():
 for iteration in range(100):
  changed=False
  for yy in range(len(rows)-1):
   for xx in range(len(rows[0])-1):
    a,b,c,d=rows[yy][xx],rows[yy][xx+1],rows[yy+1][xx],rows[yy+1][xx+1]
    if any(v is None for v in [a,b,c,d]):continue
    if min(a,d)>max(b,c):rows[yy][xx+1]=min(a,d);changed=True
    elif min(b,c)>max(a,d):rows[yy][xx]=min(b,c);changed=True
  if not changed:break
objects=[];report=[];geometry={}
for slug,rows in forms.items():
 ny=len(rows);nx=len(rows[0]);xs=[0];ys=[0]
 for i in range(nx):xs.append(xs[-1]+[.16,.23,.14,.19,.21,.15,.22,.17,.18][i])
 for i in range(ny):ys.append(ys[-1]+[.19,.14,.22,.17,.23,.16,.20,.18][i])
 xs=[(v/xs[-1]-.5)*1.4 for v in xs];ys=[(v/ys[-1]-.5)*1.4 for v in ys]
 verts=[];faces=[];indices=[];lookup={}
 def v(x,y,z):
  key=(round(x,7),round(y,7),round(z,7))
  if key not in lookup:lookup[key]=len(verts);verts.append(key)
  return lookup[key]
 def face(coords,mat):faces.append(tuple(v(*p) for p in coords));indices.append(mat)
 # Shared-course vertices avoid cracks/T-junctions: side quads split at every authored height.
 levels=sorted({-.9}|{h for row in rows for h in row if h is not None})
 for y,row in enumerate(rows):
  for x,h in enumerate(row):
   if h is None:continue
   x0,x1=xs[x:x+2];y0,y1=ys[y:y+2]
   face([(x0,y0,h),(x1,y0,h),(x1,y1,h),(x0,y1,h)],0 if h<.15 else 2)
   face([(x0,y1,-.9),(x1,y1,-.9),(x1,y0,-.9),(x0,y0,-.9)],0)
   for dx,dy,a,b in [(0,-1,(x0,y0),(x1,y0)),(1,0,(x1,y0),(x1,y1)),(0,1,(x1,y1),(x0,y1)),(-1,0,(x0,y1),(x0,y0))]:
    xx,yy=x+dx,y+dy;n=rows[yy][xx] if 0<=xx<nx and 0<=yy<ny else None;n=-.9 if n is None else n
    if n>=h:continue
    cuts=[z for z in levels if n<=z<=h]
    for z0,z1 in zip(cuts,cuts[1:]):face([(a[0],a[1],z0),(b[0],b[1],z0),(b[0],b[1],z1),(a[0],a[1],z1)],0 if z1<.12 else 1)
 mesh=bpy.data.meshes.new(slug+'-editable');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+slug,mesh);bpy.context.collection.objects.link(o)
 for m in mats:mesh.materials.append(m)
 for p,mi in zip(mesh.polygons,indices):p.material_index=mi
 # Merge coplanar course seams before modest manufactured edge softening.
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 dec=o.modifiers.new('Dissolve coplanar authored courses','DECIMATE');dec.decimate_type='DISSOLVE';dec.angle_limit=.001;bpy.ops.object.modifier_apply(modifier=dec.name)
 bev=o.modifiers.new('Basalt edge break 8mm','BEVEL');bev.width=.008;bev.segments=2;bev.limit_method='ANGLE';bev.angle_limit=.15;bev.use_clamp_overlap=True
 objects.append(o);o['interface']='XY tangent, Z outward; origin footprint center; buried base -.9';o['study']='basalt-forms-02'
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 dst=OUT/(slug+'.glb');bpy.ops.export_scene.gltf(filepath=str(dst),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
 evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=evaluated.to_mesh();me.calc_loop_triangles();geometry[slug]={'positions':[list(v.co)for v in me.vertices],'triangles':[list(t.vertices)for t in me.loop_triangles],'materialIndices':[me.polygons[t.polygon_index].material_index for t in me.loop_triangles]};report.append({'slug':slug,'triangles':len(me.loop_triangles),'vertices':len(me.vertices),'glbSha256':hashlib.sha256(dst.read_bytes()).hexdigest()});evaluated.to_mesh_clear();o.select_set(False)
(OUT/'geometry.json').write_text(json.dumps(geometry,separators=(',',':')))
# Read-only source sheet scene; optional CPU render after GPU/resource coordination.
for i,o in enumerate(objects):o.location.x=(i-1)*2.0
bpy.ops.object.camera_add(location=(4,-7,5));camera=bpy.context.object;camera.name='REVIEW-camera';camera.rotation_euler=(Vector((0,0,.2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=6.8;bpy.context.scene.camera=camera
for pos,power,size in [((0,-3,6),950,4),((-4,1,3),500,3),((4,3,4),700,3)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.3))-o.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1200;scene.render.resolution_y=650;scene.render.resolution_percentage=100;scene.world.color=(.05,.05,.05);scene.view_settings.view_transform='AgX';scene.render.film_transparent=True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'basalt-forms.blend'))
(OUT/'study.json').write_text(json.dumps({'status':'isolated geology study; unpublished; not owner-approved','reference':'assets/art-library/assets/planets--volcanic-world/revisions/r000/reference.png','interface':{'axes':'BlenderXY tangent, Z radial outward; GLB standard Y-up conversion','footprint':[-.7,.7],'buriedBase':-.9,'topRange':[-.12,1.12],'materials':roles,'sourceObjectReviewOffsets':'source sheet objects at x−2,0,+2; GLBs/geometry.json exported centered before sheet arrangement'},'forms':report},indent=2))
print(json.dumps(report))
