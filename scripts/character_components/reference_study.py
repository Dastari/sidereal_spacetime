"""Native mesh calibration from the preserved r002 source. No voxel resampling.
Only two bases, three hair styles and medic components change. New open comms
are a separate staged design; no gender switch changes the equipped helmet.
"""
import bpy,math,json,hashlib,argparse,sys,collections,struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from render_crew_looks import linear
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--renders',action='store_true');p.add_argument('--revision',type=int,default=3)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);OUT=(ROOT/a.output).resolve()
assert OUT.is_relative_to(ROOT) and (not OUT.exists() or not any(OUT.iterdir())), 'Use a new empty revision directory'
OUT.mkdir(parents=True,exist_ok=True)
BASE=ROOT/'assets/art-library/designs/crew.base-and-outfits/revisions/r002/components'
bpy.ops.wm.open_mainfile(filepath=str(BASE/'blender-source.blend'))
scene=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
manifest=json.loads((BASE/'manifest.json').read_text())
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=None;scene.frame_set(1)
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
changed={'medic-'+s for s in ['helmet','visor','chest','shoulders','gloves','belt','legs','boots','back']}|{'hair-swept','hair-crest','hair-ponytail'}
for o in list(bpy.data.objects):
 key=o.get('component_id','')
 if key in changed or key.startswith('base-'):bpy.data.objects.remove(o,do_unlink=True)
built=collections.defaultdict(list)
for o in bpy.data.objects:
 if o.type=='MESH' and o.get('component_id'):built[o['component_id']].append(o)
C={}
def coll(key):
 name=('BASE-'+key.split('-')[1] if key.startswith('base-') else 'HAIR-'+key[5:] if key.startswith('hair-') else 'COMP-'+key)
 if name not in C:
  C[name]=bpy.data.collections.get(name) or bpy.data.collections.new(name)
  if C[name].name not in scene.collection.children:scene.collection.children.link(C[name])
  C[name].hide_render=False;C[name].hide_viewport=False
 return C[name]
M={}
def mat(role):
 if role in M:return M[role]
 colors={'skin':'#EBC2AC','hair':'#252139','white':'#E4E8F2','edge':'#9FAFC7','red':'#C82245','redDark':'#821B37','dark':'#172033','rubber':'#0D1624','metal':'#657995','ink':'#171A2D','lip':'#AD6C68','light':'#26BADD','glass':'#05264A'}
 name={'skin':'crew.skin.modular','hair':'crew.hair.modular'}.get(role,'component.medic.calibration.'+role)
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');rgb=linear(colors[role]);s.inputs['Base Color'].default_value=(*rgb,1);m.diffuse_color=(*rgb,1)
 s.inputs['Metallic'].default_value=.48 if role=='metal' else .06 if role in ['white','edge','red','redDark'] else 0
 s.inputs['Roughness'].default_value=.65 if role in ['skin','hair','dark','rubber','ink','lip'] else .32
 if role=='light':s.inputs['Emission Color'].default_value=(*rgb,1);s.inputs['Emission Strength'].default_value=1.5
 if role=='glass':
  s.inputs['Transmission Weight'].default_value=.58;s.inputs['IOR'].default_value=1.46;s.inputs['Roughness'].default_value=.12;s.inputs['Alpha'].default_value=.78;m.diffuse_color=(*rgb,.78);m.surface_render_method='DITHERED'
 M[role]=m;return m

def finish(o,key,name,role,bone,bevel=.004):
 o.name=f'GEO-{key}__{name}';o['component_id']=key;o['authoring_revision']=a.revision;o['detail_function']=name
 for old in list(o.users_collection):old.objects.unlink(o)
 coll(key).objects.link(o);o.data.materials.append(mat(role))
 if bevel:
  mod=o.modifiers.new('Narrow molded edge','BEVEL');mod.width=bevel;mod.segments=2;mod.limit_method='ANGLE'
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
 mod=o.modifiers.new('Shared deform rig','ARMATURE');mod.object=rig;o.parent=rig
 built[key].append(o);return o

def box(key,name,loc,size,role='white',bone='spine',bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,key,name,role,bone,min(bevel,min(size)*.20))

def loft(key,name,rings,role,bone,bevel=.003):
 # Each ring is (z, width, depth, centre x, centre y, corner chamfer).
 vs=[]
 for z,w,d,x,y,ch in rings:
  vs += [(x+u,y+v,z) for u,v in [(-w/2+ch,-d/2),(w/2-ch,-d/2),(w/2,-d/2+ch),(w/2,d/2-ch),(w/2-ch,d/2),(-w/2+ch,d/2),(-w/2,d/2-ch),(-w/2,-d/2+ch)]]
 fs=[tuple(reversed(range(8))),tuple(range(len(vs)-8,len(vs)))]
 for k in range(len(rings)-1):
  for j in range(8):n=(j+1)%8;fs.append((k*8+j,k*8+n,(k+1)*8+n,(k+1)*8+j))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
 return finish(o,key,name,role,bone,bevel)

def cross(key,name,x,y,z,size,bone='spine',role='red'):
 box(key,name+'-v',(x,y,z),(size*.33,.010,size),role,bone,.0015)
 box(key,name+'-h',(x,y-.001,z),(size,.010,size*.33),role,bone,.0015)

def detail_panel(key,name,x,y,z,w,h,bone='spine',role='white'):
 box(key,name+'-gasket',(x,y+.008,z),(w+.02,.03,h+.02),'dark',bone,.003)
 box(key,name,(x,y-.008,z),(w,.026,h),role,bone,.004)

# Bases: retained joints, connected shoulder rhythm, controlled jaw/cheek planes.
basegroups={}
for body in ['male','female']:
 female=body=='female';prefix='base-'+body
 def b(region,name,loc,size,role='skin',bone='spine',bevel=.006):return box(prefix+'-'+region,name,loc,size,role,bone,bevel)
 core=prefix+'-core'
 loft(core,'head cheek and jaw',[(1.315,.438 if female else .458,.354,0,-.006,.020),(1.347,.49,.396,0,0,.024),(1.68,.515,.424,0,0,.026),(1.746,.484,.401,0,.002,.024)],'skin','head',.006)
 b('core','neck',(0,.01,1.282),(.204,.204,.13),bone='spine',bevel=.012)
 for s in [-1,1]:
  b('core','ear-'+str(s),(s*.262,.003,1.49),(.035,.087,.113),bone='head',bevel=.008)
  ex=s*(.118 if female else .116);eyeH=.124 if female else .113
  b('core','eye-'+str(s),(ex,-.217,1.535),(.066,.008,eyeH),'ink','head',.001)
  # Tiny source-like upper-corner glint: no large white sclera/iris spheres.
  b('core','eye-glint-'+str(s),(ex-s*.017,-.222,1.571),(.013,.004,.018),'white','head',.0005)
  b('core','brow-'+str(s),(ex,-.216,1.618),(.075,.007,.011),'hair','head',.001)
  if female:b('core','outer-lash-'+str(s),(ex+s*.034,-.220,1.583),(.020,.007,.013),'ink','head',.001)
 b('core','nose shallow plane',(0,-.214,1.474),(.027,.016,.021),bone='head',bevel=.003)
 b('core','muted mouth',(0,-.211,1.414),(.038,.007,.009),'lip','head',.001)
 loft(prefix+'-torso','shoulder waist transition',[(.824,.348 if female else .36,.234,0,.006,.027),(.944,.335 if female else .382,.252,0,.008,.035),(1.128,.421 if female else .455,.284,0,.012,.04),(1.218,.524,.275,0,.013,.055)],'skin','spine',.011)
 loft(prefix+'-legs','pelvis fit',[(.72,.365,.236,0,.003,.028),(.80,.383 if female else .368,.24,0,.003,.03),(.862,.349,.229,0,.003,.025)],'skin','pelvis',.008)
 loft(prefix+'-modesty','opaque shorts waist',[(.712,.376,.244,0,0,.026),(.782,.388 if female else .376,.248,0,0,.027),(.83,.357,.237,0,0,.025)],'dark','pelvis',.007)
 b('modesty','shorts waistband',(0,-.003,.815),(.361,.244,.026),'rubber','pelvis',.004)
 if female:
  loft(prefix+'-modesty','opaque shaped chest covering',[(1.028,.378,.274,0,.008,.032),(1.132,.442,.296,0,.012,.04),(1.192,.448,.286,0,.012,.04)],'dark','spine',.009)
  for s in [-1,1]:b('modesty','chest strap '+str(s),(s*.148,.012,1.218),(.044,.267,.09),'dark','spine',.006)
 for side,s in [('L',1),('R',-1)]:
  loft(prefix+'-upperarms','connected shoulder arm '+side,[(.963,.163,.188,s*.379,.003,.03),(1.11,.182,.212,s*.348,.005,.035),(1.224,.181,.213,s*.30,.006,.035)],'skin','upper_arm.'+side,.011)
  b('forearms','elbow '+side,(s*.393,0,.948),(.151,.184,.091),bone='forearm.'+side,bevel=.014)
  loft(prefix+'-forearms','tapered forearm '+side,[(.737,.130,.157,s*.4,-.008,.025),(.878,.164,.19,s*.4,0,.028),(.945,.151,.18,s*.393,0,.029)],'skin','forearm.'+side,.009)
  b('hands','palm '+side,(s*.4,-.015,.702),(.146,.163,.134),bone='hand.'+side,bevel=.012)
  b('hands','thumb '+side,(s*.325,-.055,.727),(.045,.10,.074),bone='hand.'+side,bevel=.008)
  b('modesty','shorts leg '+side,(s*.14,0,.682),(.201,.244,.165),'dark','thigh.'+side,.006)
  loft(prefix+'-legs','thigh '+side,[(.456,.166,.195,s*.14,.002,.03),(.573,.191,.227,s*.14,0,.035),(.714,.193,.235,s*.14,0,.035)],'skin','thigh.'+side,.011)
  b('legs','knee '+side,(s*.14,-.002,.436),(.167,.188,.088),bone='shin.'+side,bevel=.014)
  loft(prefix+'-legs','calf '+side,[(.135,.135,.16,s*.14,.012,.025),(.278,.18,.217,s*.14,.016,.032),(.418,.17,.195,s*.14,.005,.031)],'skin','shin.'+side,.01)
  loft(prefix+'-feet','foot '+side,[(.008,.185,.301,s*.14,-.07,.032),(.075,.194,.31,s*.14,-.069,.033),(.132,.153,.215,s*.14,-.024,.025)],'skin','foot.'+side,.009)
 basegroups[body]=[k for k in built if k.startswith(prefix+'-')]

# Hair is organized into tapered, overlapping locks with a complete rear cap.
for style in ['swept','crest','ponytail']:
 key='hair-'+style
 loft(key,'fitted scalp',[(1.624,.507,.407,0,.012,.042),(1.75,.535,.45,0,.027,.015),(1.805,.537,.454,0,.027,.012),(1.845,.467,.402,.01,.027,.025)],'hair','head',.003)
 # Continuous U-shaped rear/temple cover. No rectangular bald back of the head.
 for i in range(6):
  x=-.225+i*.09;low=1.416+.022*abs(i-2.5)
  loft(key,'nape flowing lock '+str(i),[(low,.087,.071,x,.203,.009),(1.58,.112,.092,x-.011,.218,.013),(1.755,.127,.117,x+.015,.207,.015),(1.801,.125,.120,x+.009,.192,.015),(1.84,.125,.151,x*.92,.175,.013)],'hair','head',.0025)
 for sign in [-1,1]:
  for i in range(3):
   low=1.47+i*.044
   loft(key,'sideburn lock '+str((sign,i)),[(low,.063,.13,sign*.264,-.027+i*.07,.012),(low+.13,.086,.156,sign*.267,-.003+i*.065,.014),(1.792,.105,.17,sign*.245,.012+i*.06,.015),(1.839,.10,.175,sign*.211,.01+i*.058,.012)],'hair','head',.003)
  loft(key,'under lock temple nape join '+str(sign),[(1.741,.08,.135,sign*.252,.175,.009),(1.805,.088,.16,sign*.245,.163,.012),(1.837,.092,.135,sign*.214,.151,.012)],'hair','head',.002)
 if style in ['swept','ponytail']:
  # One high part feeding broad diagonal locks, with selected finer end steps.
  for i,(x,low,w) in enumerate([(-.225,1.576,.096),(-.149,1.565,.13),(-.053,1.617,.143),(.05,1.673,.13),(.15,1.705,.106),(.225,1.663,.068)]):
   loft(key,'diagonal fringe lock '+str(i),[(low,w*.72,.075,x,-.232,.01),(low+.074,w,.126,x+.026,-.226,.013),(1.826-i*.011,w*1.08,.153,x+.065,-.155,.017)],'hair','head',.003)
  for i,(x,y,z,w,d) in enumerate([(-.18,.006,1.799,.143,.23),(-.063,-.012,1.851,.154,.246),(.07,.021,1.873,.172,.213),(.179,.063,1.825,.137,.195),(-.159,.159,1.793,.148,.14),(-.024,.182,1.841,.165,.142),(.131,.182,1.817,.16,.136)]):
   loft(key,'swept crown mass '+str(i),[(z-.07,w,d,x,y,.019),(z+.018,w*.88,d*.9,x-.027,y-.025,.017),(z+.052,w*.62,d*.72,x-.035,y-.042,.014)],'hair','head',.003)
  for i in range(3):box(key,'part seam overlap '+str(i),(.12-i*.05,-.12+i*.08,1.86-i*.012),(.098,.122,.025),'hair','head',.002)
 else:
  # Crest rises as a swept wedge from a close cap, never a block tower.
  for i in range(5):
   y=-.19+i*.09;z=1.85+.055*math.sin((i+1)/6*math.pi)
   loft(key,'crest swept ridge '+str(i),[(1.735,.196,.13,-.036,y,.02),(z,.164,.14,-.055,y+.012,.019),(z+.04,.111,.108,-.078,y+.033,.016)],'hair','head',.003)
  for sign in [-1,1]:
   for i in range(3):box(key,'short side sweep '+str((sign,i)),(sign*.179,-.06+i*.09,1.757+i*.013),(.116,.129,.043),'hair','head',.003)
  for i in range(3):
   loft(key,'crest forehead sweep '+str(i),[(1.653+i*.018,.09,.075,-.11+i*.079,-.222,.01),(1.79,.118,.138,-.153+i*.075,-.174,.017)],'hair','head',.003)
 if style=='ponytail':
  # Near-side gathered arc: visible beside the head, then tapers clear of pack.
  points=[(1.208,.088,.101,.355,.305),(1.363,.173,.141,.414,.348),(1.556,.235,.19,.428,.374),(1.742,.238,.21,.345,.342),(1.871,.195,.18,.216,.258),(1.942,.11,.125,.143,.20)]
  loft(key,'continuous gathered ponytail',[(z,w,d,x,y,.018 if w>.13 else .012) for z,w,d,x,y in points],'hair','head',.003)
  # Two uninterrupted lock ribbons follow the gather-to-tip arc. Offset tips and
  # broad overlap create intentional steps without isolated stud-like blocks.
  for sign in [-1,1]:
   rings=[]
   for i,(z,w,d,x,y) in enumerate(points):
    rings.append((z+(.018*sign if i==0 else -.012 if i==len(points)-1 else 0),w*.39,d*.80,x+sign*w*(.22 if i==len(points)-1 else .31),y+d*.20,.009 if i==0 else .014))
   loft(key,'continuous tail lock '+str(sign),rings,'hair','head',.002)
  box(key,'tail tie',(.236,.256,1.82),(.20,.025,.03),'redDark','head',.002)

# Resolve overlapping native hair solids without voxelization. Preserve every
# editable lock/support input beside the final watertight surface in the source.
for style in ['swept','crest','ponytail']:
 key='hair-'+style;inputs=list(built[key]);operands=bpy.data.collections.new('AUTHORING-INPUTS-'+key);scene.collection.children.link(operands)
 for o in inputs:
  for c in list(o.users_collection):c.objects.unlink(o)
  operands.objects.link(o)
 result=box(key,'resolved native hair surface',(0,0,1.74),(.005,.005,.005),'hair','head',0)
 mod=result.modifiers.new('Exact union of editable lock solids','BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.operand_type='COLLECTION';mod.collection=operands;mod.use_self=True
 bpy.context.view_layer.objects.active=result;bpy.ops.object.modifier_apply(modifier=mod.name)
 group=result.vertex_groups.get('head');group.add(list(range(len(result.data.vertices))),1,'REPLACE')
 for o in inputs:
  o['source_component_id']=key;del o['component_id'];o.hide_render=True;o.hide_set(True)
 built[key]=[result]

# Sealed helmet: curved optical opening, profiled side rails, inset crown badge.
key='medic-helmet'
for i in range(4):
 box(key,'crown shell course '+str(i),(0,.033,1.748+i*.036),(.586-i*.077,.47-i*.035,.065),'white','head',.006)
 box(key,'crown red stripe '+str(i),(0,.03,1.784+i*.036),(.105,.447-i*.035,.014),'red','head',.002)
for s in [-1,1]:
 loft(key,'profile cheek rail '+str(s),[(1.364,.088,.30,s*.262,.026,.025),(1.447,.13,.38,s*.267,.018,.024),(1.674,.116,.413,s*.265,.022,.025),(1.737,.087,.36,s*.26,.025,.023)],'white','head',.005)
 detail_panel(key,'temple cassette '+str(s),s*.311,-.021,1.548,.055,.127,'head','red')
 box(key,'ear comms housing '+str(s),(s*.322,.034,1.563),(.084,.197,.193),'edge','head',.005)
 box(key,'ear red core '+str(s),(s*.37,-.005,1.56),(.018,.094,.096),'red','head',.003)
 for i in range(3):box(key,'side vent '+str((s,i)),(s*.372,.055,1.51+i*.027),(.014,.064,.011),'dark','head',.001)
 box(key,'visor side socket '+str(s),(s*.252,-.22,1.592),(.051,.071,.183),'edge','head',.003)
 box(key,'lower corner lock '+str(s),(s*.222,-.231,1.408),(.089,.068,.054),'redDark','head',.003)
box(key,'chin gasket',(0,-.155,1.379),(.464,.199,.045),'dark','head',.004)
box(key,'chin shell',(0,-.197,1.404),(.468,.133,.061),'white','head',.006)
box(key,'chin inset',(0,-.27,1.404),(.235,.012,.022),'edge','head',.002)
detail_panel(key,'forehead plate',0,-.229,1.756,.265,.12,'head')
box(key,'red forehead field',(0,-.26,1.761),(.158,.017,.104),'red','head',.002)
cross(key,'helmet white cross',0,-.276,1.763,.080,'head','white')
box(key,'dark brow seal',(0,-.235,1.7),(.493,.123,.040),'dark','head',.003)
for sign in [-1,1]:box(key,'dark optical corner seal '+str(sign),(sign*.239,-.233,1.581),(.043,.091,.243),'dark','head',.003)
for s in [-1,1]:box(key,'collar latch '+str(s),(s*.176,-.174,1.372),(.06,.083,.045),'metal','head',.003)
key='medic-visor'
# Native curved, closed optical shell, not a flat painted rectangle.
from build_crew_archetypes import curved_visor
parts=[];o=curved_visor('calibration-optical','visor-medic',rig,parts,mat('glass'),width=.458,bottom=1.438,top=1.69,front=-.32)
o['component_id']=key;o.name='GEO-'+key+'__curved optical pane'
for c in list(o.users_collection):c.objects.unlink(o)
coll(key).objects.link(o);built[key].append(o)
for s in [-1,1]:
 box(key,'optical edge '+str(s),(s*.237,-.246,1.564),(.026,.026,.226),'dark','head',.002)
 box(key,'small HUD emitter '+str(s),(s*.213,-.282,1.644),(.018,.012,.028),'light','head',.001)

# Open comms is an explicit independent staged helmet-slot design for either body.
key='medic-open-comms'
for s in [-1,1]:
 box(key,'ear gasket '+str(s),(s*.285,.00,1.519),(.072,.16,.163),'dark','head',.004)
 box(key,'white ear shell '+str(s),(s*.325,-.002,1.519),(.067,.148,.174),'white','head',.005)
 box(key,'red ear panel '+str(s),(s*.363,-.018,1.527),(.017,.079,.097),'red','head',.002)
 box(key,'ear light '+str(s),(s*.373,-.023,1.54),(.008,.018,.026),'light','head',.001)
 box(key,'strap rail '+str(s),(s*.268,.061,1.656),(.028,.087,.186),'dark','head',.003)
box(key,'small medical crest',(0,.012,1.912),(.124,.10,.069),'white','head',.004)
cross(key,'open comms crest',0,-.045,1.919,.052,'head')
box(key,'mic stem',(-.293,-.117,1.446),(.023,.15,.024),'metal','head',.003)
box(key,'mic terminal',(-.237,-.182,1.445),(.107,.029,.036),'dark','head',.003)

# Undersuit, harness and thinner independent chest shells.
key='medic-chest'
loft(key,'dark tailored underlayer',[(.841,.371,.261,0,.012,.037),(.969,.386,.282,0,.012,.04),(1.178,.495,.322,0,.008,.044),(1.241,.487,.285,0,.01,.04)],'dark','spine',.007)
loft(key,'white torso shell',[(.88,.338,.258,0,-.028,.034),(1.01,.373,.292,0,-.027,.034),(1.113,.446,.311,0,-.020,.035),(1.2,.439,.296,0,-.017,.035)],'white','spine',.005)
for s in [-1,1]:
 box(key,'dark harness '+str(s),(s*.199,-.18,1.115),(.049,.038,.224),'rubber','spine',.003)
 box(key,'harness buckle '+str(s),(s*.20,-.202,1.143),(.059,.027,.044),'metal','spine',.003)
 box(key,'collar riser '+str(s),(s*.135,-.036,1.239),(.063,.223,.06),'white','spine',.004)
 box(key,'collar red tab '+str(s),(s*.134,-.158,1.226),(.065,.033,.037),'red','spine',.002)
 box(key,'flank red insert '+str(s),(s*.222,-.071,.991),(.035,.111,.087),'red','spine',.003)
 detail_panel(key,'rib inset '+str(s),s*.206,-.12,.92,.048,.06,'spine','edge')
 side='L' if s==1 else 'R'
 box(key,'undersleeve '+side,(s*.354,.009,1.084),(.20,.239,.258),'dark','upper_arm.'+side,.012)
 box(key,'upper sleeve shell '+side,(s*.36,-.014,1.085),(.173,.222,.149),'white','upper_arm.'+side,.005)
 box(key,'upper sleeve red stripe '+side,(s*.37,-.13,1.078),(.143,.017,.039),'red','upper_arm.'+side,.003)
 detail_panel(key,'lower vest '+str(s),s*.104,-.162,.954,.16,.048,'spine','edge')
detail_panel(key,'sternum medical plate',0,-.192,1.101,.302,.146,'spine','white');cross(key,'medical chest emblem',.041,-.222,1.123,.073)
box(key,'chest lower seam',(0,-.201,1.019),(.24,.011,.013),'edge','spine',.0015)
for x in [-.132,.131]:box(key,'chest fastener '+str(x),(x,-.223,1.105),(.014,.009,.014),'metal','spine',.002)

key='medic-shoulders'
for side,s in [('L',1),('R',-1)]:
 bone='upper_arm.'+side
 box(key,'flex socket '+side,(s*.299,.016,1.229),(.195,.222,.121),'dark',bone,.013)
 box(key,'lower shoulder shell '+side,(s*.322,.00,1.225),(.193,.249,.109),'white',bone,.007)
 box(key,'raised red pad '+side,(s*.321,.009,1.279),(.171,.218,.037),'red',bone,.004)
 box(key,'outer shoulder lip '+side,(s*.412,.018,1.229),(.03,.216,.057),'edge',bone,.003)
 detail_panel(key,'medical shoulder patch '+side,s*.326,-.135,1.237,.089,.063,bone,'red')
 cross(key,'shoulder patch cross '+side,s*.326,-.159,1.237,.043,bone,'white')

key='medic-gloves'
for side,s in [('L',1),('R',-1)]:
 bone='forearm.'+side
 box(key,'dark elbow '+side,(s*.395,.006,.945),(.168,.196,.083),'dark',bone,.012)
 box(key,'forearm gauntlet '+side,(s*.4,-.004,.862),(.182,.213,.133),'white',bone,.006)
 box(key,'forearm inset '+side,(s*.4,-.117,.869),(.116,.018,.068),'edge',bone,.002)
 box(key,'red wrist band '+side,(s*.4,-.008,.785),(.177,.204,.031),'red',bone,.003)
 box(key,'wrist gasket '+side,(s*.4,-.005,.752),(.165,.205,.036),'rubber','hand.'+side,.004)
 box(key,'dark glove palm '+side,(s*.4,-.008,.690),(.159,.183,.139),'dark','hand.'+side,.006)
 box(key,'thumb '+side,(s*.311,-.043,.721),(.052,.119,.079),'dark','hand.'+side,.005)
 for i in range(3):box(key,'knuckle '+str((side,i)),(s*.4+(i-1)*.041,-.102,.719),(.036,.027,.033),'edge','hand.'+side,.003)
 if side=='L':detail_panel(key,'wrist diagnostic',s*.4,-.14,.864,.06,.055,bone,'dark')

key='medic-belt'
box(key,'webbing waist',(0,.009,.825),(.405,.299,.078),'rubber','pelvis',.006)
box(key,'buckle rim',(0,-.157,.827),(.119,.039,.085),'metal','pelvis',.003)
box(key,'buckle centre',(0,-.18,.827),(.075,.014,.047),'dark','pelvis',.002)
for name,x,z,w,h in [('left small',-.211,.817,.092,.123),('right field',.225,.738,.121,.17),('left tall',-.20,.66,.1,.118)]:
 box(key,name+' pouch gasket',(x,-.064,z),(w+.019,.131,h+.012),'dark','pelvis',.005)
 box(key,name+' red pouch',(x,-.117,z),(w,.103,h),'red','pelvis',.004)
 box(key,name+' lid',(x,-.17,z+h*.34),(w+.008,.024,h*.24),'redDark','pelvis',.002)
 box(key,name+' pull',(x,-.187,z),(.022,.014,.043),'metal','pelvis',.002)
detail_panel(key,'white diagnostic clip',-.194,-.18,.802,.09,.11,'pelvis','white')
box(key,'clip red inset',(-.194,-.21,.802),(.043,.015,.053),'red','pelvis',.002)

key='medic-legs'
box(key,'hip garment',(0,.012,.757),(.377,.284,.123),'white','pelvis',.007)
for side,s in [('L',1),('R',-1)]:
 loft(key,'white tailored thigh '+side,[(.482,.193,.236,s*.14,.012,.025),(.605,.207,.273,s*.14,.006,.027),(.758,.206,.267,s*.14,.006,.026)],'white','thigh.'+side,.005)
 box(key,'thigh seam '+side,(s*.23,-.023,.60),(.014,.185,.168),'edge','thigh.'+side,.002)
 box(key,'knee flex '+side,(s*.14,.018,.445),(.198,.227,.128),'dark','shin.'+side,.008)
 box(key,'dark knee cap '+side,(s*.14,-.124,.448),(.164,.056,.106),'rubber','shin.'+side,.005)
 box(key,'kneecap edge '+side,(s*.14,-.155,.476),(.139,.012,.018),'edge','shin.'+side,.0015)
 loft(key,'white shin '+side,[(.203,.182,.209,s*.14,.013,.025),(.34,.195,.229,s*.14,.013,.028),(.401,.185,.209,s*.14,.012,.025)],'white','shin.'+side,.004)
 box(key,'lower red service stripe '+side,(s*.14,-.006,.225),(.189,.227,.033),'red','shin.'+side,.003)

key='medic-boots'
for side,s in [('L',1),('R',-1)]:
 bone='foot.'+side
 loft(key,'dark articulated boot '+side,[(.018,.228,.38,s*.14,-.084,.032),(.083,.228,.387,s*.14,-.087,.035),(.162,.211,.30,s*.14,-.043,.03),(.204,.199,.23,s*.14,.005,.028)],'dark',bone,.005)
 box(key,'sole '+side,(s*.14,-.084,.020),(.232,.383,.028),'rubber',bone,.003)
 box(key,'toe cap '+side,(s*.14,-.236,.082),(.216,.069,.079),'rubber',bone,.004)
 box(key,'toe inset '+side,(s*.14,-.273,.096),(.17,.011,.018),'edge',bone,.0015)
 for i in range(3):box(key,'sole tread '+str((side,i)),(s*.14,-.187+i*.113,.011),(.21,.033,.018),'dark',bone,.001)
 box(key,'ankle lock '+side,(s*.242,-.033,.159),(.022,.082,.046),'metal',bone,.002)

key='medic-back'
box(key,'back harness frame',(0,.216,1.06),(.366,.127,.423),'dark','spine',.006)
box(key,'pack body',(0,.31,1.078),(.375,.21,.356),'white','spine',.008)
box(key,'recessed back panel',(0,.424,1.078),(.297,.027,.26),'edge','spine',.004)
box(key,'red medical inset',(0,.444,1.102),(.193,.019,.174),'red','spine',.003)
# Cross faces the back of the actual pack.
box(key,'back cross vertical',(0,.457,1.102),(.035,.012,.114),'white','spine',.001)
box(key,'back cross horizontal',(0,.458,1.102),(.113,.012,.035),'white','spine',.001)
for s in [-1,1]:
 box(key,'side canister '+str(s),(s*.218,.311,1.064),(.094,.177,.271),'dark','spine',.005)
 box(key,'canister white face '+str(s),(s*.219,.41,1.085),(.080,.038,.183),'white','spine',.004)
 box(key,'canister red cap '+str(s),(s*.219,.32,1.199),(.099,.184,.05),'red','spine',.003)
 for z in [.965,1.174]:box(key,'pack corner clasp '+str((s,z)),(s*.151,.452,z),(.048,.031,.039),'metal','spine',.003)
for i in range(4):box(key,'bottom vent '+str(i),(-.096+i*.064,.449,.965),(.041,.018,.013),'dark','spine',.001)
box(key,'lift handle',(0,.313,1.285),(.185,.086,.038),'dark','spine',.004)

# Save native editable meshes before any export batching.
for k,objects in built.items():
 for o in objects:o.hide_render=True
manifest['revision']=a.revision;manifest['baseGroups']=basegroups
manifest['parentSource']='assets/art-library/designs/crew.base-and-outfits/revisions/r002/components/blender-source.blend'
manifest['parentSourceSha256']=hashlib.sha256((BASE/'blender-source.blend').read_bytes()).hexdigest()
manifest['focus']={'updatedComponents':sorted(changed),'updatedBases':['male','female'],'newDraftDesigns':['medic-open-comms'],'unchangedSets':[s for s in manifest['sets'] if s!='medic'],'scope':'Native medic/base/hair calibration. Existing inventory IDs and runtime publication remain r002 until explicitly integrated.'}
manifest['components'].append({'id':'medic-open-comms','slot':'helmet','archetype':'medic','name':'Open medical comms (draft)','collection':'COMP-medic-open-comms','bodyTypes':['male','female'],'covers':[],'hidesHair':False,'revision':a.revision,'glb':'medic-open-comms.glb','image':'medic-open-comms.png','massKg':.25,'grid':[2,1],'statsStatus':'proposal only; not inventory-issued or authoritative','sourceObjects':[],'ownerFinalSignoff':None})
def bounds(objects):
 bpy.context.view_layer.update();v=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box];lo=[min(p[i] for p in v) for i in range(3)];hi=[max(p[i] for p in v) for i in range(3)];return {'min':lo,'max':hi,'size':[hi[i]-lo[i] for i in range(3)]}
for e in manifest['components']:
 if e['id'] in changed|{'medic-open-comms'}:e['revision']=a.revision;e['boundsMeters']=bounds(built[e['id']])
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))

# Controlled capture protocol: matched r002 camera and neutral light first.
for o in list(bpy.data.objects):
 if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
world=bpy.data.worlds.new('Calibration neutral world');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.12,.14,.18,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.4;scene.world=world
for name,loc,power,size,color in [('neutral key',(3,-4,5),450,4,(1,.94,.88)),('neutral fill',(-3,-2,3),180,4,(.68,.80,1)),('edge separation',(1,3,4),220,3,(.53,.69,1))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [x.name for x in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'
scene.camera.data.type='ORTHO'
def show(keys):
 covers={r for e in manifest['components'] if e['id'] in keys for r in e['covers']}
 for k,objs in built.items():
  for o in objs:o.hide_render=k not in keys or (k.startswith('base-') and k.split('-')[-1] in covers)
def render(name,keys,view='three-quarter',individual=False):
 show(keys);b=bounds([o for k in keys for o in built[k]]);target=Vector([(b['min'][i]+b['max'][i])/2 for i in range(3)]) if individual else Vector((0,0,.99))
 direction={'front':(0,-6,1.5),'three-quarter':(3,-6,2.2),'opposite':(-3,-6,2.2),'rear':(3,6,2),'side':(6,0,1.5),'top':(0,0,6)}[view];scene.camera.location=target+Vector(direction);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=max(b['size'])*1.55 if individual else 2.36
 scene.render.resolution_x=480;scene.render.resolution_y=480 if individual else 640;scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
if a.renders:
 slots=manifest['sets']['medic']
 for body in ['male','female']:
  keys=basegroups[body]
  render('base-'+body,keys+['hair-'+('ponytail' if body=='female' else 'swept')]);render('base-'+body+'-front',keys+['hair-crest'],'front')
  render(body+'-medic-sealed',keys+list(slots.values()));render(body+'-medic-open',keys+[v for s,v in slots.items() if s not in ['helmet','visor']]+['medic-open-comms','hair-ponytail' if body=='female' else 'hair-swept'])
  render(body+'-medic-open-rear',keys+[v for s,v in slots.items() if s not in ['helmet','visor']]+['medic-open-comms','hair-ponytail' if body=='female' else 'hair-swept'],'rear')
 for style in ['swept','crest','ponytail']:
  render('hair-'+style,['base-female-core','hair-'+style],individual=True);render('hair-'+style+'-rear',['base-female-core','hair-'+style],'rear',True)
 for e in manifest['components']:
  if e['id'] in changed|{'medic-open-comms'}:render(e['id'],[e['id']],individual=True)
 render('medic-back-outward',['medic-back'],'rear',True)
 render('hair-ponytail-opposite',['base-female-core','hair-ponytail'],'opposite',True)
 render('blender-top',basegroups['female']+list(slots.values()),'top')
# Re-save reviewed neutral lights and native edit structure, not the merged copy.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
for o in bpy.data.objects:
 if o.type=='MESH' and not o.get('component_id'):o.name='REFERENCE-'+o.name
for key,objects in built.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.hide_viewport=False;o.hide_render=False;o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='GEO-'+key;merged['component_id']=key;built[key]=[merged]
 assert all(v.groups and abs(sum(g.weight for g in v.groups)-1)<1e-5 for v in merged.data.vertices)
def export(name,keys,animations=False):
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
 for k in keys:
  for o in built[k]:o.select_set(True)
 for t in rig.animation_data.nla_tracks:t.mute=not animations
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=animations,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_extras=True,export_yup=True)
for key in sorted(changed|{'medic-open-comms'}):export(key,[key])
for body in ['male','female']:export('base-'+body,basegroups[body],True)
export('modular-crew',list(built),True)
(OUT/'study.json').write_text(json.dumps({'revision':a.revision,'nativeSourceSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256((OUT/'modular-crew.glb').read_bytes()).hexdigest(),'updatedExistingComponents':len(changed),'bases':2,'newDraftComponents':1,'rigBones':len(rig.data.bones),'ownerFinalSignoff':None,'published':False,'lighting':'Cycles neutral area key/fill/rim, no bloom; inspect renderer stage separately','bounds':{k:bounds(objs) for k,objs in built.items() if k in changed or k.startswith('base-') or k=='medic-open-comms'}},indent=2)+'\n')
print('NATIVE CHARACTER CALIBRATION COMPLETE',OUT)
