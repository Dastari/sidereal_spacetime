"""Measured source checks for the finite independent physical-review findings."""
from pathlib import Path
import bpy,json,math,sys,hashlib
from mathutils import Vector

OUT=Path(sys.argv[sys.argv.index('--')+1]);jobs=json.loads((OUT/'jobs.json').read_text())+json.loads((OUT/'variant-jobs.json').read_text())
rows=[]
def world_points(o):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();pts=[o.matrix_world@v.co for v in me.vertices];ev.to_mesh_clear();return pts
def bounds(o):
    pts=world_points(o);return [min(v[i] for v in pts) for i in range(3)],[max(v[i] for v in pts) for i in range(3)]

for job in jobs:
    out=Path(job['output']);family=job.get('family',job.get('slug'))
    if family not in ['fuel','chemical','water']:continue
    bpy.ops.wm.open_mainfile(filepath=str(out/'blender-source.blend'));bpy.context.view_layer.update()
    checks={}
    meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('GEO-')]
    if family=='water':
        neck=bounds(bpy.data.objects['GEO-water-fill-neck']);cap=bounds(bpy.data.objects['GEO-water-fill-cap']);cup=bounds(bpy.data.objects['GEO-water-hollow-cup'])
        overlap=neck[1][2]-cap[0][2];assert overlap>.0019
        checks['fill_cap_seating_overlap_m']=overlap
        top=max(bounds(o)[1][2] for o in meshes if 'water-vessel-support-pad' in o.name)
        assert abs(top-cup[0][2])<1e-6
        checks['support_pad_top_m']=top;checks['cup_underside_m']=cup[0][2]
        checks['shallow_accessory_inner_clearance_m']={}
        for o in meshes:
            if 'water-vertical-band' in o.name or 'water-level-back' in o.name:
                lo,hi=bounds(o);clear=(-hi[1] if o.location.y<0 else lo[1])-.262
                assert clear>0
                checks['shallow_accessory_inner_clearance_m'][o.name]=clear
    else:
        allpts=[p for o in meshes for p in world_points(o)];bottom=min(p.z for p in allpts);assert abs(bottom)<1e-6
        checks['bottom_datum_m']=bottom
        rim=bpy.data.objects['GEO-reinforced-roll-rim'];rimlo,rimhi=bounds(rim)
        cup=bpy.data.objects['GEO-'+family+'-hollow-shell'];cuplo,cuphi=bounds(cup)
        inside=json.loads(cup['inner_profile_radius_height_m']);rmax=max(p[0] for p in inside);innerbottom=min(p[1] for p in inside)
        rimr=min(math.hypot(v.x,v.y) for v in world_points(rim));assert rimr<.2309 and rimhi[2]>cuplo[2] and rimhi[2]<innerbottom
        checks['bottom_rim']={'inner_radius_m':rimr,'top_m':rimhi[2],'vessel_bottom_m':cuplo[2],'inner_bottom_m':innerbottom}
        checks['external_hardware_clearance_m']={}
        for o in meshes:
            if any(s in o.name for s in ['protective-stave','stave-clamp','head-retainer','hazard-label-backing','batch-label']):
                centre=o.matrix_world.translation;u=Vector((centre.x,centre.y,0)).normalized()
                # Lower bound on radius over every convex box solid, including bevels.
                minimum=min(p.dot(u) for p in world_points(o));clear=minimum-rmax
                assert clear>0, (o.name,clear)
                checks['external_hardware_clearance_m'][o.name]=clear
            if 'reinforced-roll-rim' in o.name and o.name!='GEO-reinforced-roll-rim':
                lo,hi=bounds(o)
                if hi[2]<.75:
                    minimum=min(math.hypot(p.x,p.y) for p in world_points(o));assert minimum-rmax>.001
        checks['capacity_L']=json.loads((out/'specification.json').read_text())['usable_capacity']['value']
    record={'schema':'sidereal.fluid-source-support-audit.v1','id':job.get('id',job['design_id']),'blender_source_sha256':hashlib.sha256((out/'blender-source.blend').read_bytes()).hexdigest(),'checks':checks,'result':'pass','limits':'Bounded source measurements addressing independent review; not pressure/thermal/load certification or owner acceptance.'}
    (out/'support-audit.json').write_text(json.dumps(record,indent=2)+'\n');rows.append(record)
(OUT/'support-audit-summary.json').write_text(json.dumps(rows,indent=2)+'\n')
print('FINITE_SUPPORT_AUDIT_PASSED',len(rows))
