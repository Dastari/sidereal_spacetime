"""Editable native end and shoulder composites at immutable original origins."""
import bpy,hashlib,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2];OUT=Path(sys.argv[sys.argv.index('--')+1])
plan_path=ROOT/('.runtime/usable-wall-end-plan-a009.json' if '--shoulder-pockets' in sys.argv else '.runtime/usable-wall-end-plan-a008.json' if '--reuse-native-shoulders' in sys.argv else '.runtime/usable-wall-end-plan.json')
plan=json.loads(plan_path.read_text())
source=OUT.parent/'a005/blender-source.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
canonical={key:list(bpy.data.collections['NATIVE-'+key].objects) for key in ['straight-2m','outer-corner']}
# Narrow rear-corner native revision, authored to the actual unchanged
# armor inner planes. Original a005 corner and all existing assets survive.
if plan.get('reuseUnchangedNativeShoulderBoundaries'):
    materials={}
    for obj in canonical['outer-corner']:
        for material in obj.data.materials:
            for role in ['steel','dark','pale']:
                if material.name.lower()==role or material.name.lower().endswith('-'+role):materials[role]=material
    assert len(materials)==3,materials
    for key,tx,ty in [('aft-corner-port',.1875,.25),('aft-corner-starboard',.25,.1875)]:
        corex,corey=tx-.03125,ty-.03125
        canonical[key]=[];contacts=[]
        specifications=[('core',[-corex,-corey,0],[0,0,2.75],'steel',True),
          ('contact-x',[0,-corey,.03125],[.03125,-.025,2.71875],'steel',True),
          ('contact-y',[-corex,0,.03125],[-.025,.03125,2.71875],'steel',True),
          ('floor',[-.0625,-.0625,.03125],[.0625,.0625,.125],'steel',True),
          ('roof',[-.0625,-.0625,2.703125],[.0625,.0625,2.734375],'steel',True),
          ('enamel-x',[-tx,-corey,.23],[-corex+.01,-.04,2.53],'dark',False),
          ('enamel-y',[-corex,-ty,.23],[-.04,-corey+.01,2.53],'dark',False)]
        for label,lo,hi,role,contact in specifications:
            bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)))
            obj=bpy.context.object;obj.name='GEO-'+key+'--'+label
            obj.dimensions=tuple(b-a for a,b in zip(lo,hi));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            obj.data.materials.append(materials[role])
            if contact:contacts.append(obj)
            else:
                bevel=obj.modifiers.new('Authored inset corner bevel','BEVEL');bevel.width=.006;bevel.segments=3
                canonical[key].append(obj)
        body=contacts[0].copy();body.data=contacts[0].data.copy();body.name='GEO-'+key+'--continuous-body'
        bpy.context.scene.collection.objects.link(body)
        for operand in contacts[1:]:
            modifier=body.modifiers.new('Native contact union','BOOLEAN');modifier.operation='UNION';modifier.solver='EXACT';modifier.object=operand
            bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=modifier.name)
        for obj in contacts:obj.hide_set(True);obj.hide_render=True
        canonical[key].append(body)
legacy=ROOT/'assets/runtime/assembly/parts.glb';before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(legacy)); imported=set(bpy.data.objects)-before;by_name={o.name:o for o in imported}
parts=[]
for index,entry in enumerate(plan['entries']):
    key=f'end{index:02}';objects=[];sources=[]
    for ci,component in enumerate(entry['components']):
        frame=Matrix.Translation(Vector(component['sourceTranslationM']))@Matrix.Rotation(component['quarterTurns']*math.pi/2,4,'Z')
        for oi,original in enumerate(canonical[component['source']]):
            body=original.name.endswith('--continuous-body')
            if component['selection']=='body' and not body:continue
            if component['selection']=='facing' and body:continue
            obj=original.copy();obj.data=original.data.copy();obj.name=f'GEO-{key}--c{ci:02}-native-{oi:02}'
            obj['interface_role']='new-outward-body' if body else 'new-outward-facing'
            bpy.context.scene.collection.objects.link(obj);obj.matrix_world=frame@original.matrix_world;objects.append(obj)
        sources.append({**component,'sourceFrame':[list(row) for row in frame],'nodePrefix':f'GEO-{key}--c{ci:02}-native-'})
    for pi,name in enumerate(entry['preservePartitionNodes']):
        original=by_name[name];obj=original.copy();obj.data=original.data.copy()
        obj.name=f'GEO-{key}--retained-partition-{pi:02}';obj['source_name']=name
        obj['interface_role']='preserved-historical-partition-not-pressure-qualified'
        bpy.context.scene.collection.objects.link(obj);obj.matrix_world=original.matrix_world.copy();objects.append(obj)
    collection=bpy.data.collections.new('CANDIDATE-'+key);bpy.context.scene.collection.children.link(collection)
    for obj in objects:
        for old in list(obj.users_collection):old.objects.unlink(obj)
        collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
    path=OUT/(key+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_texcoords=True,export_normals=True,export_tangents=True)
    parts.append({'id':key,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nodePrefix':f'GEO-{key}--',**entry,'components':sources})
for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
manifest={'schema':'sidereal.usable-wall-end-exports.v1','parts':parts,'sourceMappingSha256':plan['sourceMappingSha256'],
          'sourceBlend':str(source.relative_to(ROOT)),'sourceBlendSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'legacySourceSha256':hashlib.sha256(legacy.read_bytes()).hexdigest(),'originalPlacementCount':262,
          'placedTransformsChanged':0,'installed':False,'ownerFinalSignoff':None,'status':'awaiting-native-qualification'}
(OUT/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(OUT/'end-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
