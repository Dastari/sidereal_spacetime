"""Editable Blender inlet, native GLBs, independent contact proxies and CPU evidence.
All model coordinates in common inlet frame, ship origin [5,-5,0].
"""
import bpy, sys, json, hashlib, math
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = False
scene.render.resolution_x = 1400
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('Indigo studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055,.075,.13,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
scene.view_settings.view_transform = 'AgX'
# Reuse actual existing material datablocks and their packed texture maps.
source = ROOT / 'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
with bpy.data.libraries.load(str(source), link=False) as (src, dst):
    dst.materials = list(src.materials)
loaded = [m for m in dst.materials if m]
print('SOURCE_MATERIALS', [m.name for m in loaded], flush=True)
def material(role, color, metal=0, emission=0):
    matches = [m for m in loaded if m.name == role or m.name.endswith('-'+role) or m.name.lower().startswith(role)]
    if matches:
        return matches[0]
    mat = bpy.data.materials.new('Inlet-'+role)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = .36
    p.inputs['Emission Color'].default_value = (*color,1)
    p.inputs['Emission Strength'].default_value = emission
    return mat
mats = {k:material(k,*v) for k,v in {
    'pale':((.55,.59,.66),), 'dark':((.060,.074,.115),),
    'red':((.30,.025,.055),), 'steel':((.095,.12,.15),.78),
    'black':((.009,.016,.025),), 'amber':((.8,.31,.045),0,2),
    'cyan':((.015,.7,1),0,5)}.items()}
parts = {
    'interior-frame': {'anchorM':[-1,1,0], 'replaces':'wall-2--2', 'objects':[]},
    'structural-aperture': {'anchorM':[.125,1,0], 'replaces':'wall-3--2', 'objects':[]},
    'armor-collar': {'anchorM':[.5625,1,-.25], 'replaces':'superstructure-3--2', 'objects':[]},
    'stepped-roof': {'anchorM':[0,0,0], 'replaces':None, 'objects':[]},
    'flush-threshold': {'anchorM':[0,0,0], 'replaces':None, 'objects':[]},
}
proxies=[]
def box(part, name, lo, hi, mat='pale', bevel=.012, core=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=tuple((a+b)/2 for a,b in zip(lo,hi)))
    o=bpy.context.object
    o.name='GEO-inlet-'+part+'--'+name
    o.dimensions=tuple(b-a for a,b in zip(lo,hi))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mats[mat])
    if bevel:
        mod=o.modifiers.new('Authored edge bevel','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=50
    o['component_role']='continuous-contact-core' if core else 'visual-detail'
    o['part_id']=part
    parts[part]['objects'].append(o)
    if core:proxies.append({'part':part,'component':name,'minM':lo,'maxM':hi,'role':'authored-contact-core','sourceObject':o.name})
    return o
# Aperture width1.25m, clear floor-to-header2.25m. Physical cores remain continuous;
# decorative bevels never define or falsely expand sealing contact.
for part, xmin,xmax in [('interior-frame',-.125,0),('structural-aperture',0,.3125)]:
    for name,lo,hi in [('port-jamb',[xmin,0,0],[xmax,.375,2.6875]),('starboard-jamb',[xmin,1.625,0],[xmax,2,2.6875]),('header',[xmin,.375,2.4375],[xmax,1.625,2.6875]),('flush-sill',[xmin,.375,0],[xmax,1.625,.1875])]:
        box(part,name,lo,hi,'dark',0,True)
box('interior-frame','underdeck-backing',[-2,0,0],[0,2,.09375],'steel',0,True)
for y in [.03,1.665]:
    box('interior-frame','enamel-jamb-'+str(y),[-.155,y,.23],[-.125,y+.305,2.39])
    box('interior-frame','dark-jamb-inset-'+str(y),[-.166,y+.04,.54],[-.155,y+.265,1.96],'dark',.008)
    box('interior-frame','amber-witness-'+str(y),[-.172,y+.1,1.95],[-.166,y+.2,2.06],'amber',.003)
box('interior-frame','enamel-head',[-.155,.02,2.47],[-.125,1.98,2.655])
# Exterior shell is separate armor, not inferred structural strength.
for name,lo,hi in [('left-carrier',[.3125,0,-.25],[.9375,.375,2.6875]),('right-carrier',[.3125,1.625,-.25],[.9375,2,2.6875]),('head-carrier',[.3125,.375,2.4375],[.9375,1.625,2.6875]),('bottom-carrier',[.3125,.375,-.25],[.9375,1.625,.1875])]:
    box('armor-collar',name,lo,hi,'dark',0,True)
for side,y in [('left',.03),('right',1.655)]:
    box('armor-collar',side+'-edge-rib',[.925,y,-.19],[1.075,y+.305,2.63],'pale',.027)
    box('armor-collar',side+'-service-recess',[1.07,y+.035,.47],[1.084,y+.27,1.91],'black',.012)
    box('armor-collar',side+'-wine-service-cover',[1.081,y+.062,.72],[1.112,y+.243,1.61],'red',.018)
    for z in [.58,1.72,1.79,1.86]:
        box('armor-collar',side+'-vent-'+str(z),[1.082,y+.057,z],[1.096,y+.248,z+.025],'steel',.004)
    for z in [.27,2.23]:
        box('armor-collar',side+'-enamel-fastener-'+str(z),[1.076,y+.07,z],[1.11,y+.235,z+.12],'pale',.01)
box('armor-collar','crown-enamel',[.925,.02,2.475],[1.07,1.98,2.66],'pale',.024)
box('armor-collar','crown-recess',[1.066,.45,2.49],[1.082,1.55,2.624],'black',.009)
box('armor-collar','cyan-status-strip',[1.081,.53,2.54],[1.088,1.47,2.582],'cyan',.004)
box('armor-collar','underdeck-enamel',[.925,.03,-.20],[1.07,1.97,.075],'pale',.025)
# Contact skins around roof-level change. Native old/new roofs unchanged.
box('stepped-roof','sealed-height-riser',[-.0625,0,2.6875],[.0625,2,3.125],'dark',0,True)
box('stepped-roof','lower-contact-lap',[-.25,0,2.6875],[.0625,2,2.8125],'dark',0,True)
box('stepped-roof','upper-contact-lap',[-.0625,0,3],[.35,2,3.14],'dark',0,True)
box('stepped-roof','upper-enamel-cap',[-.07,.015,3.13],[.36,1.985,3.19],'pale',.015)
box('stepped-roof','riser-inset',[.0625,.15,2.835],[.0825,1.85,3.055],'steel',.012)
box('flush-threshold','native-floor-contact',[-.125,0,.125],[.375,2,.1875],'steel',0,True)
box('flush-threshold','vestibule-longitudinal-seam',[0,.99375,.16],[2,1.00625,.1875],'steel',0,True)
box('flush-threshold','vestibule-cross-seam',[.99375,0,.16],[1.00625,2,.1875],'steel',0,True)
# Save editable model before export/context; independent proxies are metadata +
# a separate hidden collection of exact authored core bounds, never visual GLB.
proxy_collection=bpy.data.collections.new('PROXIES-contact-and-collision');scene.collection.children.link(proxy_collection)
for p in proxies:
    src=bpy.data.objects[p['sourceObject']]
    o=src.copy();o.data=src.data.copy();o.name='PROXY-'+p['part']+'--'+p['component'];proxy_collection.objects.link(o);o.hide_render=True;o.hide_set(True);o.display_type='WIRE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
manifest=[]
for name,part in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in part['objects']:
        o.location-=Vector(part['anchorM']);o.select_set(True)
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_texcoords=True,export_normals=True,export_tangents=True)
    for o in part['objects']:o.location+=Vector(part['anchorM'])
    manifest.append({'id':name,'replacesSourcePlacedId':part['replaces'],'anchorCommonM':part['anchorM'],'worldPositionM':[part['anchorM'][0]+5,part['anchorM'][1]-5,part['anchorM'][2]],'rotation':0,'flipped':False,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nodePrefix':'GEO-inlet-'+name+'--','editableComponents':len(part['objects'])})
(OUT/'contact-proxies.json').write_text(json.dumps({'schema':'sidereal.native-inlet-proxies.v1','frame':'common inlet XYZ metres; world origin[5,-5,0]','use':'separate provisional collision/contact representation; qualify against exported native meshes before authority','boxes':proxies},indent=2)+'\n')
(OUT/'delivery-manifest.json').write_text(json.dumps({'schema':'sidereal.native-inlet-candidate.v1','status':'awaiting-native-qualification-and-parent-review','ownerFinalSignoff':None,'sourceMaterialBlend':str(source.relative_to(ROOT)),'sourceMaterialSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'parts':manifest,'omittedNewAirlockPartIndices':[26],'originalPlacementsPreserved':262,'originalPlacementTransformChanges':0,'floorTopM':.1875,'oldRoofUndersideM':2.6875,'newRoofUndersideM':3,'apertureWidthM':1.25,'apertureHeightM':2.25},indent=2)+'\n')
# Actual CPU Blender image evidence, no synthetic mesh illustration.
def point(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;point(o,(0,1,1.5))
area('Cool key',(5,-4,7),1100,5,(.83,.9,1));area('Violet fill',(-4,-1,4),700,4,(.64,.7,1));area('Warm rim',(0,5,6),950,3,(1,.8,.65))
data=bpy.data.cameras.new('Review-camera');camera=bpy.data.objects.new('Review-camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=4.6
captures=[]
for name,loc,target in [('exterior',(7,-5,4.5),(.1,1,1.45)),('interior',(-6,-4,4),(0,1,1.5)),('roof-transition',(4,-4,6),(0,1,1.9))]:
    camera.location=loc;point(camera,target);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    captures.append({'path':name+'.png','engine':'Cycles CPU','samples':32,'cameraM':loc,'targetM':target,'orthographicScaleM':4.6,'role':'actual isolated Blender mesh render; not installed game evidence'})
# Render exact neighboring original native assets beside the candidate.
source_placements=json.loads((ROOT/'.runtime/wayfarer-semantic-candidate-r001/placements.json').read_text())
source_ids=['wall-2--2','wall-3--2','superstructure-3--2']
context_ids=['floor-2--2','roof-2--2','roof-3--2']
context_ids += [p['sourcePlacedId'] for p in source_placements if p['sourcePlacedId'] in ['superstructure-3--3','superstructure-3--1','wall-3--3','wall-3--1']]
context=[];old=[];context_pins=[]
for p in source_placements:
    if p['sourcePlacedId'] not in source_ids+context_ids:continue
    v=p['visual'];url=v['url'] if v else '/assets/assembly/parts.glb'
    path=ROOT/'assets/runtime'/url.removeprefix('/assets/')
    prefix=v.get('nodePrefix') if v else 'GEO-'+p['assetId']+'--'
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=set(bpy.data.objects)-before
    keep=[o for o in imported if o.type=='MESH' and o.name.startswith(prefix)]
    assert keep,(p['sourcePlacedId'],prefix)
    from mathutils import Matrix
    source_transform=p['originalPlacement']
    transform=Matrix.Translation(Vector(source_transform['position'])-Vector((5,-5,0))) @ Matrix.Rotation(source_transform['rotation'],4,'Z')
    if source_transform['flipped']:transform @= Matrix.Diagonal((-1,1,1,1))
    for o in keep:
        matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=transform @ matrix
        o.name='CONTEXT-'+p['sourcePlacedId']+'--'+o.name
    for o in imported-set(keep):bpy.data.objects.remove(o,do_unlink=True)
    (old if p['sourcePlacedId'] in source_ids else context).extend(keep)
    context_pins.append({'id':p['sourcePlacedId'],'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'transform':source_transform})
for name,is_new in [('context-original',False),('context-candidate',True)]:
    for o in old:o.hide_render=is_new
    for part in parts.values():
        for o in part['objects']:o.hide_render=not is_new
    camera.location=(8,-6,5);point(camera,(0,1,1.5));camera.data.ortho_scale=7
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    captures.append({'path':name+'.png','engine':'Cycles CPU','samples':32,'cameraM':[8,-6,5],'targetM':[0,1,1.5],'orthographicScaleM':7,'role':'actual native source context with identical camera/light; candidate is not installed','sourcePins':context_pins})
(OUT/'capture-context.json').write_text(json.dumps(captures,indent=2)+'\n')
print(json.dumps({'output':str(OUT),'parts':len(parts),'editableComponents':sum(len(p['objects'])for p in parts.values()),'contactCores':len(proxies)}),flush=True)
