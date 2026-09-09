"""Staged entrance headroom specimen only; no runtime export or full-kit qualification."""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
ROOT=Path.cwd(); OUT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'
def material(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.38;return m
steel=material('MAT-stair-formed-steel',(.19,.25,.28),.65)
edge=material('MAT-stair-nosing',(.8,.45,.08),.3)
body=material('REVIEW-capsule',(.04,.55,.8),.05)
def box(name,lo,hi,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)));o=bpy.context.object;o.name=name;o.dimensions=tuple(b-a for a,b in zip(lo,hi));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:m=o.modifiers.new('Editable formed edge bevel','BEVEL');m.width=bevel;m.segments=2
 return o
def bounds(o):
 deps=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(deps);me=e.to_mesh();v=[e.matrix_world@v.co for v in me.vertices];r={'min':[min(p[i] for p in v) for i in range(3)],'max':[max(p[i] for p in v) for i in range(3)]};e.to_mesh_clear();return r
# Editable closed folded tread and riser pieces; service/support structure intentionally absent in this specimen.
treads=[]
for k in range(1,9):
 y=1.6875+(k-1)*.3125;z=.1875+k*.1875
 o=box(f'GEO-flight-a-tread-{k}',(.25,y,z-.03125),(1.75,y+.3125,z),steel,.002);treads.append(o)
 box(f'GEO-flight-a-riser-{k}',(.25,y,z-.1875),(1.75,y+.025,z-.025),steel,.002)
 box(f'GEO-flight-a-nosing-{k}',(.25,y,z-.016),(1.75,y+.045,z),edge,.001)
box('GEO-review-lower-landing',(0,0,0),(2,1.6875,.1875),steel)
# Import exact native slab surfaces and retain all their authored transforms/materials.
pins={'roof':{'path':'assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/kit.glb','prefix':'GEO-roof-square-2m--surface','z':3},'floor':{'path':'assets/runtime/assembly/floor/r002/kit.glb','prefix':next(p['native']['nodePrefix'] for p in json.loads((ROOT/'packages/content/src/construction-floor-interfaces.json').read_text())['parts'] if p['id']=='square-2m'),'z':3.1875}}
obstacles=[]
for role,pin in pins.items():
 pin['sha256']=hashlib.sha256((ROOT/pin['path']).read_bytes()).hexdigest();before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/pin['path']));added=set(bpy.data.objects)-before
 chosen=[o for o in added if o.type=='MESH' and (o.name==pin['prefix'] or o.name.startswith(pin['prefix']+'_') or o.name.startswith(pin['prefix']+'.'))];assert chosen
 for original in chosen:
  o=original.copy();o.data=original.data;scene.collection.objects.link(o);o.parent=None;o.matrix_world=Matrix.Translation((0,0,pin['z']))@original.matrix_world;o.name='REVIEW-native-'+role+'--'+original.name;obstacles.append(o)
 for o in added:bpy.data.objects.remove(o,do_unlink=True)
# Capsule radius .3, total height 1.8. It is a separate review proxy, never stair visual geometry.
def capsule(center,feet):
 verts=[];faces=[];rings=[]
 for j in range(9):
  a=-math.pi/2+j*math.pi/16;r=.3*math.cos(a);z=feet+.3+.3*math.sin(a);rings.append((r,z))
 for j in range(9):
  a=j*math.pi/16;r=.3*math.cos(a);z=feet+1.5+.3*math.sin(a);rings.append((r,z))
 for r,z in rings:
  for i in range(48):a=i*math.tau/48;verts.append((center[0]+r*math.cos(a),center[1]+r*math.sin(a),z))
 for j in range(len(rings)-1):
  for i in range(48):a=j*48+i;b=j*48+(i+1)%48;faces.append((a,b,b+48,a+48))
 me=bpy.data.meshes.new('REVIEW-capsule-mesh');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('REVIEW-actor-envelope-not-character',me);scene.collection.objects.link(o);me.materials.append(body)
 for f in me.polygons:f.use_smooth=True
 return o
measured=[{'id':o.name,'boundsM':bounds(o)} for o in treads];obs=[{'id':o.name,'boundsM':bounds(o)} for o in obstacles]
# Piecewise constant conservative lift: support is highest actual tread reached by the leading radius.
# Test both sides of every support event and all closest-approach Y values. Between events,
# capsule-axis-to-obstacle-AABB distance is convex in Y; its minimum is at clamped obstacle Y.
r=.3;h=1.8;events={.75,3.0}
for t in measured:events.add(t['boundsM']['min'][1]-r)
for o in obs:events.update([o['boundsM']['min'][1],o['boundsM']['max'][1],o['boundsM']['max'][1]+r])
yvalues=sorted({v+d for v in events for d in [-1e-7,0,1e-7] if .75<=v+d<=3})
rows=[]
for y in yvalues:
 feet=max([.1875]+[t['boundsM']['max'][2] for t in measured if t['boundsM']['min'][1]<=y+r+1e-9])
 for o in obs:
  b=o['boundsM'];dx=max(b['min'][0]-1,0,1-b['max'][0]);dy=max(b['min'][1]-y,0,y-b['max'][1]);dz=max(b['min'][2]-(feet+h-r),0,(feet+r)-b['max'][2]);clear=math.sqrt(dx*dx+dy*dy+dz*dz)-r
  rows.append({'centerYM':y,'feetZM':feet,'obstacleId':o['id'],'capsuleClearanceLowerBoundM':clear})
worst=min(rows,key=lambda a:a['capsuleClearanceLowerBoundM']);assert worst['capsuleClearanceLowerBoundM']>0
# Full rectangular body upper envelope remains .45m below actual native underside while footprint overlaps.
roof=[o for o in obs if 'native-roof' in o['id']];edgeY=max(o['boundsM']['max'][1] for o in roof);under=min(o['boundsM']['min'][2] for o in roof)
maxfeet=max([.1875]+[t['boundsM']['max'][2] for t in measured if t['boundsM']['min'][1]<=edgeY+2*r+1e-9]);boxgap=under-maxfeet-h
capsule((1,worst['centerYM']),worst['feetZM'])
report={'schema':'sidereal.stair-native-headroom-study.v1','status':'entrance-only-staged','sourcePins':pins,'nativeTreads':measured,'nativeObstacleBounds':obs,'body':{'radiusM':r,'heightM':h},'method':'Actual evaluated mesh bounds contain native surfaces. Continuous piecewise-constant leading-radius lift envelope; critical support events plus obstacle interval closest points. Capsule-axis distance to containing AABBs minus radius is a conservative surface-clearance lower bound. Applies in either direction to this same upright body envelope.','criticalSamples':len(yvalues),'worst':worst,'rectangularBodyRoofClearanceLowerBoundM':boxgap,'pass':worst['capsuleClearanceLowerBoundM']>0 and boxgap>0,'limits':['Roof-edge clearance only: conservative lift envelope is not a qualified supported step gait.','No landing turn, guards, supports, full-kit collision, upper ceiling, armor fit or runtime qualification.','No native GLB export or publication.']}
(OUT/'headroom.json').write_text(json.dumps(report,indent=2)+'\n')
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15)
for name,loc,power in [('key',(4,-2,7),1300),('fill',(-3,2,5),900)]:
 d=bpy.data.lights.new('REVIEW-'+name,'AREA');d.energy=power;d.size=5;o=bpy.data.objects.new('REVIEW-'+name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((1,2,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('REVIEW-camera');cam=bpy.data.objects.new('REVIEW-camera',c);scene.collection.objects.link(cam);scene.camera=cam;c.type='ORTHO';c.ortho_scale=5;cam.location=(8,5.8,3.7);target=Vector((1,2.1,1.7));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'roof-edge-capsule.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'));bpy.ops.render.render(write_still=True)
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','samples':24,'cameraM':list(cam.location),'targetM':list(target),'orthographicScaleM':5,'image':'roof-edge-capsule.png','blendSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest()},indent=2)+'\n')
print(json.dumps({'pass':report['pass'],'worst':worst,'boxGapM':boxgap}))
