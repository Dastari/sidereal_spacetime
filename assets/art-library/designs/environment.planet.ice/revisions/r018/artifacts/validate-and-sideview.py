import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
rows=[]
for obj in bpy.context.scene.objects:
 if obj.type!='MESH' or not any(n in obj.name for n in ['hero-blue-column','blue-column-companion','blue-column-short']):continue
 bm=bmesh.new();bm.from_mesh(obj.data);volume=abs(bm.calc_volume());assert all(e.is_manifold for e in bm.edges);bm.free()
 dims=[max(v.co[i]for v in obj.data.vertices)-min(v.co[i]for v in obj.data.vertices)for i in range(3)]
 assert volume>.07 and dims[2]>dims[0]*2 and dims[2]>dims[1]*2,(obj.name,volume,dims)
 area=sum(p.area for p in obj.data.polygons if abs(p.normal.z)<.05);assert area>.6
 rows.append({'part':obj.name,'volume':volume,'dimensions':dims,'verticalWallArea':area})
assert len(rows)==3
(out/'orientation-volume-validation.json').write_text(json.dumps({'closedAngularColumns':rows,'sourceUp':'Blender Z maps to radial outward under compositor18','snowCorniceThickness':.038},indent=2))
scene=bpy.context.scene;camera=scene.camera;camera.location=(4,-6,1.2);camera.rotation_euler=(Vector((0,0,.05))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/'kit-sideview.png');bpy.ops.render.render(write_still=True)
print('ICE18_NATIVE_VOLUME_ORIENTATION_PASS')
