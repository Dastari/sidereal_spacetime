#!/usr/bin/env python3
"""Proposed private profile2 native cuts, standing support and qualified slide pockets.

blender -b --python scripts/art/build_wayfarer_access_profile.py -- --root REPO --output DIR --source DIR
Existing native and r002 pins are inputs only; no publication/default/live activation.
"""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, math, sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector

IDENTITY = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
MODULES = [('personnel',2.,4.,3.,1.2),('cargo',-9.,-5.,-7.,3.75)]
GROUPS = {}
SOURCE_PINS = {}
OMITTED = {'deck': [], 'flight': []}
COLLISION_REPLACEMENTS = {}
FLOOR_SUPPORT = []
NEW_BLOCKERS = []
FRAME_BLOCKERS = {}


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def bounds(objects):
    bpy.context.view_layer.update()
    corners=[o.matrix_world@o.data.vertices[index].co for o in objects for index in {v for p in o.data.polygons for v in p.vertices}]
    return ([min(v[a] for v in corners) for a in range(3)], [max(v[a] for v in corners) for a in range(3)])
def intersects(a,b): return all(a[0][i]<b[1][i] and b[0][i]<a[1][i] for i in range(3))


def subtract(rect, cutter):
    x0,y0,x1,y1=rect; a,b,c,d=cutter
    a,b,c,d=max(a,x0),max(b,y0),min(c,x1),min(d,y1)
    if a>=c or b>=d: return [rect]
    return [r for r in [(x0,y0,a,y1),(c,y0,x1,y1),(a,y0,c,b),(a,d,c,y1)] if r[0]<r[2]-1e-8 and r[1]<r[3]-1e-8]


def cut(objects, lo, hi):
    bpy.ops.mesh.primitive_cube_add(size=1, location=[(lo[i]+hi[i])/2 for i in range(3)])
    cutter=bpy.context.object;cutter.name='GEO-access-cut'
    cutter.dimensions=[hi[i]-lo[i] for i in range(3)]
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for obj in objects:
        if not obj.data.polygons or not intersects(bounds([obj]),(lo,hi)): continue
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Actual access aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        mod.use_self=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)


def box(kit, group, name, lo, hi, material='navy', blocker=False, floor=False):
    obj=kit.box(group,name,[(lo[i]+hi[i])/2 for i in range(3)],[hi[i]-lo[i] for i in range(3)],material,0)
    if blocker: NEW_BLOCKERS.append({'id':name,'rect':[lo[0],lo[1],hi[0],hi[1]],'minZ':lo[2]+.1875,'maxZ':hi[2]+.1875})
    if floor: FLOOR_SUPPORT.append({'id':name,'rect':[lo[0],lo[1],hi[0],hi[1]],'topM':hi[2]+.1875})
    return obj


def doors(kit, output):
    variants=[]
    for kind,span,reverse in [('personnel',2,False),('personnel',2,True),('cargo',4,False)]:
        kit.GROUPS={}
        variant=kit.build(kind,span)
        name=variant['id'] + ('.reverse' if reverse else '')
        variant['id']=name
        variant['leafDirection']=1 if reverse else -1
        if reverse:
            kit.GROUPS={k.replace('personnel','personnel.reverse'):v for k,v in kit.GROUPS.items()}
            variant['parts']={k:v.replace('personnel','personnel.reverse') for k,v in variant['parts'].items()}
        for part,objects in kit.GROUPS.items():
            if part.endswith('frame'): continue
            for obj in objects: obj.location.y-=.1 if kind=='personnel' else .15
        frame=kit.GROUPS[variant['parts']['frame']]
        moving=[o for part,objects in kit.GROUPS.items() if not part.endswith('frame') for o in objects]
        lo,hi=bounds(moving)
        if kind=='personnel':
            lo[0] += 0 if reverse else -variant['strokeM'];hi[0] += variant['strokeM'] if reverse else 0
        else: lo[0]-=variant['strokeM'];hi[0]+=variant['strokeM']
        clearance=.015625
        cut(frame,[lo[0]-clearance,lo[1]-clearance,-clearance],[hi[0]+clearance,hi[1]+clearance,hi[2]+clearance])
        # Solid front/rear/end housings beyond each original jamb; their cavities
        # remain empty for the entire authored leaf stroke, not shortened to fit.
        ends=[(lo[0]-clearance-.0625,-span/2)] if kind=='personnel' and not reverse else [(span/2,hi[0]+clearance+.0625)] if kind=='personnel' else [(lo[0]-clearance-.0625,-span/2),(span/2,hi[0]+clearance+.0625)]
        for i,(a,b) in enumerate(ends):
            if b<=a: continue
            box(kit,variant['parts']['frame'],f'pocket-{i}-rear',[a,lo[1]-clearance-.0625,0],[b,lo[1]-clearance,2.4375])
            box(kit,variant['parts']['frame'],f'pocket-{i}-front',[a,hi[1]+clearance,0],[b,hi[1]+clearance+.0625,2.4375],'white')
            cap=(a,a+.0625) if a<0 else (b-.0625,b)
            box(kit,variant['parts']['frame'],f'pocket-{i}-end',[cap[0],lo[1]-clearance-.0625,0],[cap[1],hi[1]+clearance+.0625,2.4375])
            box(kit,variant['parts']['frame'],f'pocket-{i}-floor',[a,lo[1]-clearance-.0625,-.1875],[b,hi[1]+clearance+.0625,0],'grey')
        groups={k:[o for o in v if o.data.polygons] for k,v in kit.GROUPS.items()}
        FRAME_BLOCKERS[name]=[{'id':o.name,'min':bounds([o])[0],'max':bounds([o])[1]} for o in groups[variant['parts']['frame']] if bounds([o])[0][2]<1.8 and bounds([o])[1][2]>.3]
        pieces=[]
        for k,v in groups.items():
            piece=kit.export_group(k,v,output);piece['boundsMin'],piece['boundsMax']=bounds(v);pieces.append(piece)
        relevant=[p for p in pieces if p['id'] in variant['parts'].values()]
        variant['outerHeightM']=max(p['boundsMax'][2] for p in relevant)
        variant['depthM']=max(p['boundsMax'][1] for p in relevant)-min(p['boundsMin'][1] for p in relevant)
        variant['sweepBounds']={'min':lo,'max':hi,'clearanceM':clearance}
        variants.append(variant);GROUPS.update(groups)
    return variants


def import_native(root, cohort, placements, pieces, cuts):
    imported=[]
    prefix='assets/runtime/ship-study/'+('wayfarer-authored-r001' if cohort=='deck' else 'wayfarer-dorsal-r001')
    for row in placements:
        if row['role'] not in {'floor','partition','door-post','hull-bay','hull-corner','structure','wall-dressing','header-light','door-light','threshold','roof','armour','panel','rib','livery','hull-upper','roof-joint','roof-module','roof-plinth','roof-shoulder','roof-skin'}: continue
        piece=pieces[row['piece']]
        path=root/prefix/piece['file']
        if digest(path)!=piece['sha256']: raise ValueError('Changed native source '+str(path))
        low=piece.get('boundsMin',piece.get('bounds_min'));high=piece.get('boundsMax',piece.get('bounds_max'))
        baked=piece.get('frame') in {'ship (object transform kept in the GLB node)','ship-node-baked'}
        matrix=Matrix(row.get('originalMatrix',row['matrix']) if baked else row['matrix'])
        source_corners=[matrix@Vector(c) for c in __import__('itertools').product(*zip(low,high))]
        source_bounds=([min(c[i] for c in source_corners) for i in range(3)],[max(c[i] for c in source_corners) for i in range(3)])
        # Flatten dressing above datum; retain the actual native floor cores.
        applicable=[([c[0][0],c[0][1],max(0,c[0][2])],c[1]) if row['role']=='floor' else c for c in cuts if intersects(source_bounds,(c[0],c[1]))]
        if cohort=='deck' and row['object'] in {'PART_near_3','POST_near_hdr_3.25'}:
            applicable.append(([2.875,1.2,-.015625],[4.375,1.8,2.625]))
        if not applicable: continue
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));objects=[o for o in set(bpy.data.objects)-before if o.type=='MESH']
        for obj in objects:
            # Unique study GLBs already keep the ship placement in their node.
            # Manifest bounds are local and need the placement for broad phase,
            # but applying it again to imported vertices would duplicate livery.
            if not baked:
                obj.matrix_world=matrix@obj.matrix_world
            obj.name='GEO-access-native-'+cohort+'-'+row['object']
            mesh=bmesh.new();mesh.from_mesh(obj.data)
            bmesh.ops.remove_doubles(mesh,verts=list(mesh.verts),dist=1e-6)
            bmesh.ops.recalc_face_normals(mesh,faces=list(mesh.faces));mesh.to_mesh(obj.data);mesh.free();obj.data.update()
        for a,b in applicable: cut(objects,a,b)
        objects=[o for o in objects if o.data.polygons]
        imported.extend(objects);OMITTED[cohort].append(row['object']);SOURCE_PINS[str(path.relative_to(root))]=piece['sha256']
        # Conservative fragments of source envelopes after full-height standing cuts.
        if cohort=='deck' and row['role'] in {'partition','door-post','wall-dressing','header-light','door-light','threshold'}:
            rects=[[source_bounds[0][0],source_bounds[0][1],source_bounds[1][0],source_bounds[1][1]]]
            for a,b in applicable:
                if a[2]<=0 and b[2]>=2.25:
                    rects=[p for r in rects for p in subtract(r,[a[0],a[1],b[0],b[1]])]
            COLLISION_REPLACEMENTS[row['object']]=rects
    return imported


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--source',type=Path,required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);args.output.mkdir(parents=True,exist_ok=True);args.source.mkdir(parents=True,exist_ok=True)
    spec=importlib.util.spec_from_file_location('kit',args.root/'scripts/art/build_ship_access_doors.py');kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    variants=doors(kit,args.output)
    door_groups=dict(GROUPS);kit.GROUPS={}
    # Explicit source support surfaces cover the complete admitted standing cells,
    # including the seams beneath the retained native panel dressing.
    for name,x0,x1,center,clear in MODULES:
        box(kit,'native.deck',name+'-continuous-support',[x0,-5,-.1875],[x1,7,0],'grey',floor=True)
        # Side bulkheads stop at the deep recess/pocket housing; they never cross a leaf slot.
        y0,y1=(3.4,6.6) if name=='personnel' else (3.3125,6.6875)
        for i,x in enumerate([x0,x1]):
            box(kit,'native.deck',name+f'-side-{i}',[x-.0625,y0,0],[x+.0625,y1,2.4375],'navy',blocker=True)
            if (name=='personnel' and i==1) or (name=='cargo' and i==0):
                box(kit,'native.deck',name+'-hall-control-pilaster',[x-.0625,2,0],[x+.0625,2.625,2.4375],'white',blocker=True)
        box(kit,'native.flight',name+'-chamber-roof',[x0-.0625,3.6,2.4375],[x1+.0625,6.4,2.625],'white')
        # Fixed source skins, real local raised roof support only at door headers.
        for label,y in [('inner',3),('outer',7)]:
            pocket=1.225 if name=='personnel' else 1.9
            rx0=center-clear/2-pocket-.125;rx1=center+clear/2+(0 if name=='personnel' else pocket)+.125
            rx0=min(rx0,x0-.0625);rx1=max(rx1,x1+.0625)
            box(kit,'native.flight',name+'-'+label+'-header-roof',[rx0,y-.625,2.4375],[rx1,min(7.375,y+.625),2.625],'white')
            box(kit,'native.deck',name+'-'+label+'-raised-surround',[x0-.0625,y-.625,2.3],[x1+.0625,min(7.375,y+.625),2.4375],'navy')
    cuts=[]
    for name,x0,x1,center,clear in MODULES:
        # Clear the native divider and old near-wall aperture within the real chamber.
        cuts.append(([x0,3,-.015625],[x1,7.4,2.625]))
        for y in [3,7]:
            pocket=1.225 if name=='personnel' else 1.9
            cuts.append(([center-clear/2-pocket-.09375,y-.625,-.015625],[center+clear/2+(0 if name=='personnel' else pocket)+.09375,y+.625,2.625]))
    native=args.root/'assets/runtime/ship-study/wayfarer-authored-r001'
    manifest=json.loads((native/'manifest.json').read_text());layout=json.loads((native/'layout.json').read_text())
    pieces={p['id']:p for p in manifest['pieces']+manifest['unique']}
    deck=import_native(args.root,'deck',layout['placements'],pieces,cuts)
    # Camera-facing wall dressing is a code-owned arrangement of pinned existing panels.
    variants_wall=['int.wallpanel.cockpit+amber.w1.s0.i1','int.wallpanel.cockpit+cyanbox.w1.s0.i1','int.wallpanel.machinery.w1.s0.i0.25']
    near=[]
    for k in range(15):
        p=variants_wall[k%3];x=-10.5+k;y=5.75 if 'machinery' in p else 6.5
        for prefix,piece,py in [('WALL',p,y),('LINER',f'int.rimliner.v{k%3}.w1',6.5)]:
            mat=[r[:] for r in IDENTITY];mat[0][3]=x;mat[1][3]=py
            near.append({'object':f'{prefix}_near_{k:02}','piece':piece,'role':'wall-dressing','matrix':mat})
    deck += import_native(args.root,'deck',near,pieces,cuts)
    flight_root=args.root/'assets/runtime/ship-study/wayfarer-dorsal-r001'
    flight=json.loads((flight_root/'descriptor.json').read_text())
    flight_objects=import_native(args.root,'flight',flight['instances'],{p['id']:p for p in flight['pieces']},cuts)
    kit.GROUPS.setdefault('native.deck',[]).extend(deck);kit.GROUPS.setdefault('native.flight',[]).extend(flight_objects)
    GROUPS.update(kit.GROUPS);GROUPS.update(door_groups)
    # GLB imports may suffix repeated material names. Preserve their original
    # immutable family metadata instead of guessing a finish from the suffix.
    import re
    for material in bpy.data.materials:
        base=re.sub(r'\.\d{3}$','',material.name)
        if base in manifest['palette']: material['sr_family']=manifest['palette'][base]['family']
    # Every proposed revision keeps source meshes, material textures, transforms and roles.
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source/'profile.blend'))
    exported=[]
    for k,v in GROUPS.items():
        if not v:continue
        piece=kit.export_group(k,v,args.output);piece['boundsMin'],piece['boundsMax']=bounds(v);exported.append(piece)
    palette={**manifest['palette'],**{k:{'colour':list(c),'family':f,'kind':'authored-access','strength':s} for k,(c,f,s) in kit.PALETTE.items()}}
    descriptor={'schema':'sidereal.wayfarer-access-profile/v1','revision':'wayfarer-access-r001','approval':'proposal','pieces':exported,'omitted':OMITTED,'collisionReplacements':COLLISION_REPLACEMENTS,'newBlockers':NEW_BLOCKERS,'frameBlockers':FRAME_BLOCKERS,'floorSupport':FLOOR_SUPPORT,'sourcePins':SOURCE_PINS,'palette':palette,'sourceSha256':digest(args.source/'profile.blend')}
    pack={'schema':'sidereal.ship-access-doors/v1','revision':'wayfarer-access-doors-r001','variants':variants,'pieces':[p for p in exported if not p['id'].startswith('native.')],'palette':palette}
    for base in [args.source,args.output]:
        (base/'descriptor.json').write_text(json.dumps(descriptor,indent=2,sort_keys=True)+'\n');(base/'doors.json').write_text(json.dumps(pack,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'pieces':len(exported),'nativeDeckReplacements':len(OMITTED['deck']),'nativeFlightReplacements':len(OMITTED['flight']),'triangles':sum(p['triangles'] for p in exported)}))

if __name__=='__main__':main()
