"""Native R006-derived armor pocket; originals/placed frames remain immutable."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=Path(sys.argv[sys.argv.index('--')+1])
sources={
 'shoulder':ROOT/'assets/art-library/shipyard-hull/material-studies/native-r006-polymer-04/candidate.blend',
 'collar':ROOT/'assets/art-library/designs/shipyard.roof.frontier/revisions/r004/blender-source.blend'}
bpy.ops.wm.read_factory_settings(use_empty=True)
parts={};pins=[]
for key,path in sources.items():
 with bpy.data.libraries.load(str(path),link=False) as (src,dst):
  if key=='shoulder':dst.collections=['outer-shoulder-transition']
  else:dst.objects=['GEO-outer-roof-collar--collar']
 objects=list(dst.collections[0].objects) if key=='shoulder' else dst.objects
 for obj in objects:
  if not obj.users_collection or key=='collar':bpy.context.scene.collection.objects.link(obj)
 if key=='shoulder':bpy.context.scene.collection.children.link(dst.collections[0])
 parts[key]=objects
 pins.append({'role':key,'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})

def export(key,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
 path=OUT/(key+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_texcoords=True,export_normals=True,export_tangents=True)
 return {'id':key,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

# Preserve original editable masters in this source. Pocket edits use the
# exact published native tessellation as a separate editable derived mesh;
# this is the authored Blender GLB, never an occupancy/voxel reconstruction.
for objects in parts.values():
 for obj in objects:obj.hide_render=True;obj.hide_set(True)
published={
 'shoulder':(ROOT/'assets/runtime/assembly/hull/finish-r004/part-e965a5502d9fe4c25406/clean.glb',None),
 'collar':(ROOT/'assets/runtime/assembly/roof/r004/kit.glb','GEO-outer-roof-collar--surface')}
for key,(path,prefix) in published.items():
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));imported=set(bpy.data.objects)-before
 keep=[obj for obj in imported if obj.type=='MESH' and (prefix is None or obj.name.startswith(prefix))]
 assert keep
 for obj in keep:
  matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=matrix
  obj['interface_role']='Editable exact published native surface derivation'
 for obj in imported-set(keep):bpy.data.objects.remove(obj,do_unlink=True)
 parts[key]=keep
 pins.append({'role':'published-native-'+key,'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nodePrefix':prefix})
exports=[]
for key,objects in parts.items():exports.append(export('baseline-'+key,objects))
# Source Z includes the original -0.25m placement: structural worldZ0..2.75
# therefore requires sourceZ0.25..3.00. Contact pocket has no runtime scaling.
lo=[0,0,.25];hi=[.25,.25,3.0]
bpy.ops.mesh.primitive_cube_add(size=1,location=tuple((a+b)/2 for a,b in zip(lo,hi)))
cutter=bpy.context.object;cutter.name='PROXY-structural-corner-reservation';cutter.dimensions=tuple(b-a for a,b in zip(lo,hi));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
cutter['interface_role']='Separate structural reserved-volume operand; never visual export'
changed=[]
for key,objects in parts.items():
 for obj in objects:
  # Leave source objects editable; Boolean is a native Blender authoring modifier.
  # Export evaluates the result while source geometry and material slots survive.
  modifier=obj.modifiers.new('Reserved structural corner pocket','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
  obj['source_name']=obj.name;obj['construction_revision']='structural-pocket-r000-a001'
  changed.append({'component':key,'node':obj.name,'modifier':modifier.name})
 exports.append(export(key,objects))
cutter.hide_render=True;cutter.hide_set(True);cutter.display_type='WIRE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
manifest={'schema':'sidereal.shoulder-structural-pocket.v1','sourcePins':pins,'exports':exports,'changedNativeModifiers':changed,
 'reservedStructuralPocketSourceM':{'min':lo,'max':hi},'originalPlacedOffsetM':[0,0,-.25],
 'preservePlacedIds':['pilot-r005-outer-shoulder-transition-starboard','pilot-r005-outer-shoulder-transition-port','pilot-r005-outer-roof-collar-starboard','pilot-r005-outer-roof-collar-port'],
 'originalSourcesModified':False,'placedTransformsChanged':0,'installed':False,'ownerFinalSignoff':None,
 'status':'Native pocket candidate awaiting complete geometry/material/seam qualification','capabilities':None}
(OUT/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'separate-pocket-proxy.json').write_text(json.dumps({'reservedVolume':{'min':lo,'max':hi},'role':'Structural corner accommodation; no inferred seal/strength/damage rating'},indent=2)+'\n')
