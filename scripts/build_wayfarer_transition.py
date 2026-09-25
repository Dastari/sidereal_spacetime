"""Blender native companion authoring.

blender -b --python scripts/build_wayfarer_transition.py -- /NEW/OUTPUT [--transition]
Default: 125mm internal spacer. --transition: exact U roof riser.
Revisions and import/render/audit recipes remain in the design ledger.
"""
import sys
if '--transition' in sys.argv:
    from pathlib import Path
    recipe=Path('/root/sidereal_spacetime/assets/art-library/designs/shipyard.structure.wayfarer-transition/revisions/r003/recipe.py').read_text()
    original="OUT=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-transition/revisions/r003';OUT.mkdir(parents=True,exist_ok=True)"
    replacement="OUT=Path("+repr(sys.argv[sys.argv.index('--')+1])+");OUT.mkdir(parents=True,exist_ok=False)"
    assert original in recipe
    exec(recipe.replace(original,replacement))
    raise SystemExit(0)
import bpy,bmesh,ast,math,json,hashlib,sys
from pathlib import Path
ROOT=Path('/root/sidereal_spacetime');OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
SOURCE=ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
SPEC=ROOT/'packages/content/src/ship-tileset-internal-spec.v1.json'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
with bpy.data.libraries.load(str(SOURCE),link=False) as (src,dst):dst.materials=[n for n in src.materials if n.startswith('MAT-Frontier-side-hull-')]
roles=['pale','dark','steel','red','cyan'];mats=[bpy.data.materials['MAT-Frontier-side-hull-'+r] for r in roles]
c=bpy.data.collections.new('GEO');bpy.context.scene.collection.children.link(c);cols={'GEO':c}
source=(ROOT/'assets/art-library/designs/shipyard.structure.internal250/revisions/r000/recipe.py').read_text();tree=ast.parse(source);author=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='author');exec(compile(ast.Module(body=[author],type_ignores=[]),'original-internal-author','exec'))
sid,o,lo,hi,volume=author({'id':'internal-span-0.125','reservationPolygonM':[[0,-.125],[.125,-.125],[.125,.125],[0,.125]]},3)
bpy.context.view_layer.objects.active=o;o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'internal-span-0.125-q4.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'internal-span-0.125-q4.glb'),export_format='GLB',use_selection=True,export_yup=True)
report={'profileId':sid,'family':'wayfarer-transition-r002','placementFloorTopM':.1875,'reservationMinM':lo,'reservationMaxM':hi,'contactPlanesX':[0,.125],'fullContactAreaM2':.75,'volumeM3':volume,'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'sourceManifold':True,'materials':[m.name for m in mats],'glbSha256':sha(OUT/'internal-span-0.125-q4.glb'),'nativeSourceSha256':sha(SOURCE),'authorFunctionSourceSha256':sha(ROOT/'assets/art-library/designs/shipyard.structure.internal250/revisions/r000/recipe.py'),'pressureQualified':False,'artApproved':False}
(OUT/'spacer-validation.json').write_text(json.dumps(report,indent=2))
from mathutils import Vector
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.resolution_x=700;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.world=bpy.data.worlds.new('Review world');s.world.color=(.2,.2,.2)
for pos in [(2,-3,5),(-2,2,4)]:
 bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=500;l.data.size=4;l.rotation_euler=(Vector((0,0,1.5))-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2,-4,2.5));cam=bpy.context.object;cam.rotation_euler=(Vector((.0625,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.6;s.camera=cam;s.render.filepath=str(OUT/'spacer-front.png');bpy.ops.render.render(write_still=True)
