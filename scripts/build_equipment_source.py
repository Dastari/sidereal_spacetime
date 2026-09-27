"""Original studless equipment kit. Run with managed dev.py export-equipment.
Coordinates in author helpers are glTF: +Y up, -Z forward; meters.
These are visual fixtures, with no damage/inventory/control authority.
"""
import bpy, json, math, hashlib, struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/runtime/equipment'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
materials={}
for key,color,metal,rough,emission in [
 ('porcelain',(.60,.64,.75),.05,.32,0),('indigo',(.045,.06,.15),0,.38,0),
 ('steel',(.19,.24,.32),.82,.28,0),('burgundy',(.37,.028,.08),0,.36,0),
 ('copper',(.69,.30,.08),.72,.30,0),('rubber',(.016,.023,.04),0,.78,0),
 ('cyan',(.025,.66,.95),.15,.24,2),('amber',(.95,.30,.025),.1,.3,1.3)]:
 m=bpy.data.materials.new('equipment.'+key); m.use_nodes=True; m.diffuse_color=(*color,1)
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
 materials[key]=m
parts=[]; entries=[]; roots=[]
def box(name,pos,size,mat='porcelain',bevel=.006):
 x,y,z=pos; sx,sy,sz=size
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y)); o=bpy.context.object
 o.name='GEO-'+name; o.dimensions=(sx,sz,sy); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(materials[mat])
 if bevel:
  mod=o.modifiers.new('Studless edge bevel','BEVEL'); mod.width=min(bevel,min(size)*.2); mod.segments=2 if min(size)>=.06 else 1
  bpy.ops.object.modifier_apply(modifier=mod.name)
 parts.append(o); return o

def start():
 global parts
 parts=[]
def handle():
 box('palm-grip',(0,0,0),(.075,.155,.09),'rubber')
 box('grip-heel',(0,-.087,.01),(.087,.03,.10),'steel')
 for i in range(3):
  for side in [-1,1]: box('grip-rib',(side*.04,-.05+i*.045,.006),(.013,.015,.07),'indigo',.002)
def rails(length):
 for side in [-1,1]:
  for i in range(5): box('heat-relief',(side*.087,.115,-.13-i*length/6),(.018,.026,.027),'rubber',.002)
def gun(kind,length,heavy=False):
 start(); handle()
 width=.18 if heavy else .14
 box('receiver',(0,.105,-.13),(width,.16,length*.57),'indigo')
 box('upper-slide',(0,.20,-length*.26),(width*.85,.065,length*.72),'porcelain')
 box('barrel-core',(0,.13,-length*.70),(.084,.084,length*.50),'steel')
 box('muzzle-collar',(0,.13,-length*.96),(.13,.12,.095),'porcelain')
 box('muzzle-recess',(0,.13,-length-0.011),(.078,.071,.015),'rubber',.001)
 box('bore',(0,.13,-length-.020),(.033,.033,.006),'cyan' if heavy else 'steel',.001)
 for side in [-1,1]:
  box('receiver-side',(side*(width/2+.004),.12,-.09),(.021,.085,length*.34),'burgundy')
  box('fastener',(side*(width/2+.018),.12,-.03),(.011,.025,.026),'copper',.002)
 box('rear-sight',(0,.25,.045),(.065,.035,.035),'steel')
 box('front-sight',(0,.25,-length*.64),(.037,.026,.03),'cyan',.002)
 box('guard-bottom',(0,-.056,-.12),(.025,.025,.16),'steel',.003)
 box('guard-front',(0,.01,-.19),(.027,.14,.025),'steel',.003)
 box('trigger',(0,.035,-.09),(.017,.064,.023),'copper',.003)
 if length>.6:
  box('stock-neck',(0,.10,.19),(.072,.076,.19),'steel')
  box('stock',(0,.08,.31),(.13,.19,.18),'indigo')
  box('stock-pad',(0,.075,.41),(.145,.22,.043),'rubber')
  box('magazine',(0,-.043,-.19),(.10,.25,.13),'indigo')
  box('magazine-base',(0,-.177,-.19),(.115,.025,.15),'burgundy')
  box('forward-grip',(0,0,-.23),(.13,.09,.22),'rubber'); rails(length*.55)
  for side in [-1,1]: box('rail',(side*.071,.19,-length*.54),(.025,.03,.22),'porcelain')
 if length>1:
  box('optic-base',(0,.261,-.17),(.095,.03,.20),'steel')
  box('optic',(0,.309,-.18),(.088,.085,.24),'indigo')
  box('optic-lens',(0,.31,-.307),(.062,.058,.016),'cyan')
 # Original railgun-sheet translation: nested cooling jacket and isolated energy inset.
 if length>.6:
  for side in [-1,1]:
   box('cooling-jacket',(side*.09,.13,-length*.64),(.036,.115,.23),'indigo')
   box('rail-energy-inset',(side*.113,.15,-length*.64),(.012,.024,.17),'cyan',.002)
   for j in range(3): box('jacket-clamp',(side*.116,.11,-length*.55-j*.055),(.018,.065,.017),'steel',.003)
  box('charging-handle',(.105,.19,-.08),(.09,.035,.05),'steel')
 if heavy:
  box('capacitor',(0,.11,-length*.46),(.24,.14,.14),'steel')
  for side in [-1,1]: box('charge-window',(side*.127,.12,-length*.46),(.02,.07,.10),'cyan')

def finish(asset,title,role,socket='handR',anchors=None):
 bpy.ops.object.select_all(action='DESELECT')
 for p in parts:p.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); mesh=bpy.context.object
 mesh.name='GEO-'+asset; bpy.context.scene.cursor.location=(0,0,0); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
 root=bpy.data.objects.new(asset,None); bpy.context.collection.objects.link(root); mesh.parent=root
 root['assetId']='equipment.'+asset; root['usage']='visual-preview'; root['socket']=socket
 mesh.data.calc_loop_triangles(); tris=len(mesh.data.loop_triangles)
 points=[mesh.matrix_world@Vector(c) for c in mesh.bound_box]
 bounds=[[min(p[a] for p in points),max(p[a] for p in points)] for a in range(3)]
 dims=[bounds[0][1]-bounds[0][0],bounds[2][1]-bounds[2][0],bounds[1][1]-bounds[1][0]]
 root.select_set(True)
 out=OUT/(asset+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
 entries.append({'id':'equipment.'+asset,'name':title,'file':out.name,'role':role,'socket':socket,'attachmentOrigin':[0,0,0],'forward':[0,0,-1],'up':[0,1,0],'dimensionsM':[round(v,4) for v in dims],'anchors':anchors or {},'triangles':tris,'materialPrimitives':len([s for s in mesh.material_slots if s.material]),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
 roots.append(root)

gun('pistol',.37); finish('compact-pistol','Kestrel compact pistol','one-handed weapon preview',anchors={'muzzle':[0,.13,-.39]})
gun('heavy',.47,True); finish('heavy-handgun','Bulwark heavy handgun','one-handed weapon preview',anchors={'muzzle':[0,.13,-.49]})
gun('carbine',.76); finish('carbine','Courier carbine','two-handed weapon preview',anchors={'supportPalm':[0,0,-.23],'muzzle':[0,.13,-.78]})
gun('rifle',1.10); finish('long-rifle','Longwatch rifle','two-handed weapon preview',anchors={'supportPalm':[0,0,-.23],'muzzle':[0,.13,-1.12]})
start(); handle()
box('tool-housing',(0,.12,-.13),(.21,.21,.34),'burgundy')
box('upper-enamel',(0,.235,-.10),(.19,.045,.24))
for side in [-1,1]:
 box('fork-arm',(side*.073,.13,-.36),(.052,.075,.20),'steel')
 box('fork-tip',(side*.073,.13,-.464),(.062,.082,.04),'copper')
 box('energized-tip',(side*.073,.13,-.489),(.042,.04,.012),'cyan')
 box('side-cell',(side*.115,.12,-.08),(.052,.12,.20),'indigo')
 box('status-strip',(side*.146,.12,-.08),(.01,.028,.14),'cyan')
finish('plasma-cutter','Arc fork cutter','repair tool preview',anchors={'effect':[0,.13,-.50]})
start(); handle()
box('scanner-body',(0,.12,-.055),(.20,.17,.17),'indigo')
box('screen-frame',(0,.19,-.19),(.22,.25,.09))
box('screen',(0,.19,-.24),(.18,.19,.016),'rubber')
for i in range(4): box('screen-bars',(-.059+i*.039,.18,-.251),(.015,.04+i*.029,.006),'cyan',.001)
box('antenna',(.085,.35,-.19),(.03,.13,.04),'copper')
finish('sample-scanner','Field sample scanner','science tool preview')
start()
box('case',(0,-.19,0),(.37,.27,.18),'indigo')
for side in [-1,1]:
 box('case-shell',(0,-.19,side*.091),(.33,.23,.035))
 box('medical-panel',(0,-.19,side*.114),(.16,.18,.015),'burgundy')
 box('aid-mark-h',(0,-.19,side*.125),(.12,.032,.01))
 box('aid-mark-v',(0,-.19,side*.125),(.033,.12,.011))
 box('handle-post',(side*.07,-.039,0),(.031,.067,.043),'steel')
 box('case-latch',(side*.12,-.063,.103),(.044,.046,.029),'copper')
box('carry-handle',(0,0,0),(.16,.035,.043),'rubber')
finish('medkit','Trauma field case','medical item preview')
start()
box('resource-vessel',(0,-.21,0),(.24,.36,.23),'indigo')
for y in [-.055,-.36]: box('vessel-ring',(0,y,0),(.28,.06,.27),'steel')
for side in [-1,1]:
 box('canister-shield',(side*.125,-.20,0),(.035,.23,.19),'burgundy')
 box('handle-post',(side*.065,-.023,0),(.025,.075,.035),'steel')
box('handle',(0,.012,0),(.15,.03,.04),'rubber')
box('level-gauge',(0,-.20,-.126),(.095,.22,.022),'cyan')
for y in [-.27,-.20,-.13]:box('gauge-divider',(0,y,-.14),(.11,.014,.015),'steel',.002)
finish('resource-canister','Sealed sample canister','resource container preview')
start()
box('power-core',(0,0,0),(.12,.22,.12),'cyan')
for y in [-.125,.125]:box('cell-terminal',(0,y,0),(.16,.05,.16),'steel')
for side in [-1,1]:box('cell-rail',(side*.073,0,0),(.03,.22,.145),'burgundy')
box('contact',(0,.157,0),(.07,.018,.07),'copper')
finish('power-cell','Ceramic power cell','consumable preview')
start()
box('crate-pressure-core',(0,.22,0),(.58,.44,.43),'indigo')
for side in [-1,1]:
 box('crate-panel',(0,.23,side*.22),(.46,.30,.025))
 box('service-plate',(0,.23,side*.24),(.20,.18,.016),'burgundy')
 box('latch',(side*.21,.425,0),(.075,.034,.18),'copper')
 for z in [-.20,.20]:box('corner-rail',(side*.27,.22,z),(.075,.45,.075),'steel')
for y in [.045,.40]:box('crate-band',(0,y,0),(.60,.045,.455))
box('status',(.14,.29,-.24),(.055,.034,.013),'cyan')
# Reference standard cargo crate: recessed docking face, segmented top plates,
# reinforced corners, fork feet, handles and discrete status lamps.
for side in [-1,1]:
 box('crate-side-gasket',(side*.296,.22,0),(.027,.31,.30),'rubber')
 box('crate-docking-frame',(side*.315,.23,0),(.036,.245,.25),'porcelain',.01)
 box('crate-docking-recess',(side*.337,.23,0),(.014,.16,.17),'indigo')
 box('crate-docking-key',(side*.348,.23,0),(.017,.07,.08),'steel')
 box('crate-lift-handle',(side*.16,.478,0),(.10,.035,.15),'rubber')
 box('crate-foot',(side*.22,.012,0),(.12,.045,.45),'rubber')
 for z in [-.205,.205]:
  for y in [.085,.35]:
   box('crate-corner-cap',(side*.28,y,z),(.085,.072,.087),'porcelain')
   box('crate-corner-bolt',(side*.28,y,z+(.048 if z>0 else -.048)),(.023,.026,.012),'steel',.002)
 box('crate-beacon',(side*.245,.31,-.253),(.032,.065,.018),'amber')
for x in [-.17,0,.17]:box('crate-top-panel',(x,.442,0),(.16,.035,.35),'porcelain')
for x in [-.05,0,.05]:box('crate-id-bars',(x,.23,-.255),(.017,.064,.012),'rubber',.002)
finish('supply-crate','Expedition supply crate','placed cargo preview','ground')
for shield in [False,True]:
 start()
 box('back-mount',(0,0,.035),(.26,.30,.07),'rubber')
 box('pack-core',(0,0,.145),(.36,.42,.23),'indigo')
 for side in [-1,1]:
  box('pack-corner',(side*.17,0,.20),(.065,.38,.17),'porcelain')
  box('latch',(side*.14,.21,.18),(.067,.044,.10),'copper')
  box('lower-pouch',(side*.09,-.15,.278),(.14,.13,.085),'burgundy')
 if shield:
  box('shield-window',(0,.065,.272),(.24,.19,.035),'cyan')
  for i in range(3):box('shield-fin',(0,.015+i*.07,.30),(.27,.018,.035),'steel')
 else:
  box('service-cover',(0,.065,.27),(.25,.19,.04),'burgundy')
  for i in range(4):box('vent',(0,.01+i*.037,.296),(.17,.015,.012),'rubber',.002)
  box('status',(0,.19,.28),(.11,.025,.025),'cyan')
 finish('shield-backpack' if shield else 'utility-backpack','Aegis shield pack' if shield else 'Engineer utility pack','back attachment preview','back')
# Stage a review grid. Individual exports retain their grip/mount origin at zero.
for i,root in enumerate(roots):
 root.location=((i%4)*1.55, -(i//4)*1.12, .40)
 # Rotate each item to expose its broad side in the contact sheet.
 root.rotation_euler.z=math.radians(-28)
 bpy.ops.object.text_add(location=(root.location.x-.49,root.location.y-.49,.012))
 label=bpy.context.object; label.name='LABEL-'+entries[i]['id']; label.data.body=entries[i]['name']; label.data.size=.072; label.data.extrude=0
 label.data.materials.append(materials['porcelain'])
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
 root.select_set(True)
 for child in root.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'equipment-review.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
source=ROOT/'assets/source/equipment-kit.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
manifest={'schema':1,'status':'original visual preview; inventory/combat authority not implemented','units':'meters','source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string,'materialPolicy':'8 shared PBR materials, merged mesh per unique asset; no per-brick draw calls; opaque and emissive only','attachmentConvention':'glTF right-handed +Y up / -Z forward; palm or mounting plane at origin; Babylon scene must honor glTF handedness conversion','entries':entries}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Orthographic source review, neutral lights, no effect required for silhouettes.
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=False
scene.world=bpy.data.worlds.new('Review-world'); scene.world.color=(.16,.16,.16)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.055)); floor=bpy.context.object; floor.name='REVIEW-ground'; floor.data.materials.append(materials['indigo'])
for pos,power,size in [((0,-3,7),1200,7),((5,2,5),1000,6)]:
 bpy.ops.object.light_add(type='AREA',location=pos); light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size
 light.rotation_euler=(Vector((2,-1,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(8,-11,10)); cam=bpy.context.object; cam.rotation_euler=(Vector((2.25,-1.14,.2))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=7.4; scene.camera=cam
scene.render.resolution_x=1800; scene.render.resolution_y=1200; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/'contact-sheet.png')
bpy.ops.render.render(write_still=True)
print(json.dumps({'equipmentAssets':len(entries),'triangles':sum(e['triangles'] for e in entries),'runtimeBytes':sum(e['bytes'] for e in entries),'manifest':str(OUT/'manifest.json')}))
