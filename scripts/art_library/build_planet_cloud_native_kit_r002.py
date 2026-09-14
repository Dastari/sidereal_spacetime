"""Native editable multiscale cloud banks; no live publication.
Run blender -b --python THIS_SCRIPT -- NEW_OUTPUT_DIR.
Three stable morphologies, each a single runtime variant retaining authored lobes.
"""
import bpy,bmesh,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'kit.blend').exists():raise RuntimeError('Preserve existing candidate source')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
mat=bpy.data.materials.new('cloud-white');mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.86,.91,1,1);shader.inputs['Roughness'].default_value=.94
# Hand-authored unequal lobe centres/sizes follow a broken sweeping footprint.
# Each native box has a two-segment bevel; overlap is intentional cloud mass.
layouts=[
 ('cloud-swept-bank',[
 (-1.05,-.16,-.035,.32,.31,.21),(-.79,-.05,.015,.46,.43,.29),(-.51,.10,.055,.57,.51,.42),
 (-.15,.16,.095,.65,.57,.56),(.24,.11,.06,.54,.47,.39),(.59,-.06,.035,.48,.37,.29),(.90,-.17,0,.34,.28,.20),
 (-.37,-.16,-.04,.40,.37,.27),(.01,-.21,-.02,.41,.36,.31),(.35,-.22,-.05,.33,.29,.21),
 (-.29,.34,.19,.35,.33,.32),(.06,.32,.16,.32,.28,.29),(1.23,-.24,-.03,.18,.15,.13),(-1.31,-.23,-.04,.13,.12,.10)]),
 ('cloud-towering-bank',[
 (-.63,-.03,-.03,.44,.48,.28),(-.30,.01,.09,.61,.59,.48),(.09,.06,.12,.63,.57,.51),(.47,.15,.025,.42,.44,.30),
 (-.15,.05,.37,.43,.44,.42),(.11,.13,.43,.36,.36,.43),(-.37,.24,.19,.38,.36,.35),(.34,-.17,.04,.34,.30,.26),
 (-.34,-.26,-.02,.41,.33,.24),(.00,-.26,.02,.43,.33,.30),(.77,.27,-.03,.21,.24,.18),(-.92,-.19,-.06,.22,.20,.15),(.95,.37,-.04,.12,.13,.10)]),
 ('cloud-broken-wisp',[
 (-.97,.17,-.02,.28,.25,.15),(-.74,.12,.015,.36,.33,.22),(-.45,.00,.04,.47,.39,.29),(-.12,-.12,.03,.41,.34,.25),
 (.21,-.16,-.01,.33,.31,.20),(.47,-.06,-.03,.27,.24,.16),(.70,.08,-.04,.20,.18,.13),
 (-.38,.19,.11,.29,.25,.26),(.01,.05,.025,.25,.23,.18),(.95,.18,-.04,.11,.12,.08),(-1.21,.25,-.04,.12,.11,.08)])
]
# r002 preserves bank identity while adding unequal vertical development.
# Thick billows coexist with broken thin edges, not a single stretched bar.
for bank,(name,lobes) in enumerate(layouts):
    for i,values in enumerate(lobes):
        x,y,z,w,d,h=values
        lobes[i]=(x,y,z*(1.2 if bank==2 else 1.4),w,d,h*(1.15+.35*((i*7)%5)/4))
    if bank==0:
        lobes.extend([(-.18,.17,.43,.44,.39,.45),(.20,.10,.29,.34,.32,.37),(-.67,.08,.21,.28,.27,.34)])
    elif bank==1:
        lobes.extend([(-.03,.07,.73,.31,.34,.42),(.31,.15,.42,.28,.29,.41),(-.49,-.08,.19,.30,.33,.37)])
    else:
        lobes.extend([(-.44,.06,.26,.27,.29,.35),(.22,-.05,.12,.23,.21,.23)])
forms=[]
for name,layout in layouts:
 parts=[]
 for i,(x,y,z,w,d,h) in enumerate(layout):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));obj=bpy.context.object;obj.name='GEO-'+name+'-lobe-'+str(i);obj.scale=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  obj.rotation_euler.z=.18*math.sin(i*2.1)
  obj.rotation_euler.x=.07*math.sin(i*1.3);obj.rotation_euler.y=.09*math.cos(i*1.7)
  obj.data.materials.append(mat);obj['role']='planet';obj['authoring']='native-planet-cloud-r002'
  mod=obj.modifiers.new('Soft-authored-lobe-corners','BEVEL');mod.width=min(w,d,h)*.40;mod.segments=2
  # Apply exact modifier result to native export, retain editable shape in source.
  parts.append(obj)
 forms.append((name,parts))
kit={'schema':'sidereal.native-planet-kit.v1','layout':'cloud-banks','materials':[{'name':'cloud-white','linearColor':[.86,.91,1],'roughness':.94}],'variants':[]}
validation={'publication':'isolated draft; no owner final sign-off','coordinates':'Blender Z up, cloud centred around Z0; drift/composition is renderer presentation','partsManifold':True,'variants':[]}
for name,parts in forms:
 positions=[];indices=[];roles=[]
 for obj in parts:
  dg=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(dg);mesh=ev.to_mesh();mesh.calc_loop_triangles()
  bm=bmesh.new();bm.from_mesh(mesh)
  if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Nonmanifold '+obj.name)
  bm.free();base=len(positions)//3
  for v in mesh.vertices:positions.extend(obj.matrix_world@v.co)
  for tri in mesh.loop_triangles:indices.extend(base+i for i in tri.vertices);roles.append(0)
  ev.to_mesh_clear()
 kit['variants'].append({'name':name,'positions':positions,'indices':indices,'triangleMaterials':roles})
 validation['variants'].append({'name':name,'vertices':len(positions)//3,'triangles':len(indices)//3,'bounds':[[min(positions[a::3]),max(positions[a::3])] for a in range(3)]})
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
for i,(name,parts) in enumerate(forms):
 for obj in parts:obj.location.y+=i*1.7-1.7
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.film_transparent=True
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.12,.12,.12)
bpy.ops.object.camera_add(location=(4,-7,6));cam=bpy.context.object;cam.name='CAM-cloud-kit';cam.rotation_euler=(Vector((0,0,.05))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.4;scene.camera=cam
for loc,power,size in [((-4,-3,8),1000,5),((3,2,4),550,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));scene.render.filepath=str(out/'kit-preview.png');bpy.ops.render.render(write_still=True)
validation['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()};(out/'validation.json').write_text(json.dumps(validation,indent=2));print('NATIVE_CLOUD_KIT_DONE',validation['variants'])
