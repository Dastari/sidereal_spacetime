#!/usr/bin/env python3
"""Private fixed-body housing finish r002; preserve r001 moving bytes and authority.

blender -b --python scripts/art/build_wayfarer_access_finish.py -- --root REPO
New detail is contained by each original solid housing. No publication/activation.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import re
import shutil
import sys
from pathlib import Path
import bpy

BASE_BLEND = '52ead742bd51323daffd0f504cb7702f38628061e260e73b30a21cdb99e334a1'
BASE_DESCRIPTOR = 'de7ae4ff208e732dff9866393e22744225004d310eaef0e617d988eadcf4ae25'
FIXED = ['personnel.frame', 'personnel.reverse.frame', 'cargo.4m.frame', 'native.flight']
DETAILS = []


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def bounds(objects):
    bpy.context.view_layer.update()
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    return [[min(v[i] for v in points) for i in range(3)], [max(v[i] for v in points) for i in range(3)]]


def group_for(obj):
    name = obj.name
    if name.startswith('GEO-personnel.reverse.frame-'):
        return 'personnel.reverse.frame'
    if name.startswith('GEO-personnel.frame-'):
        return 'personnel.reverse.frame' if re.search(r'\.\d{3}$', name) else 'personnel.frame'
    for group in FIXED[2:]:
        if name.startswith('GEO-' + group + '-') or (group.startswith('native.') and name.startswith('GEO-access-native-' + group.split('.')[1] + '-')):
            return group
    return None


def cuboid(obj, low, high):
    """Change only an authored axis-aligned primitive layer, never imported geometry."""
    obj.location = [(low[i] + high[i]) / 2 for i in range(3)]
    obj.dimensions = [high[i] - low[i] for i in range(3)]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add(kit, group, base, label, low, high, slot, bevel=.008):
    obj = kit.box(group, 'finish-' + label, [(low[i] + high[i]) / 2 for i in range(3)], [high[i] - low[i] for i in range(3)], slot, bevel)
    obj['role'] = 'fixed-housing-finish'
    obj['finish_base'] = base['name']
    actual = bounds([obj])
    for i in range(3):
        if actual[0][i] < base['min'][i] - 2e-6 or actual[1][i] > base['max'][i] + 2e-6:
            raise ValueError('Finish escaped original solid: ' + obj.name)
    DETAILS.append({'id': obj.name, 'group': group, 'base': base['name'], 'baseMin': base['min'], 'baseMax': base['max'], 'min': actual[0], 'max': actual[1]})
    return obj


def face_panel(kit, group, base, label, a, b, z0, z1, low_y, high_y, slot='white'):
    bevel = .008 if any(tag in label for tag in ('-cover-', '-fascia-plate-', '-service-spine')) else 0
    return add(kit, group, base, label, [a, low_y, z0], [b, high_y, z1], slot, bevel)


def pocket_finish(kit, group, obj):
    low, high = bounds([obj]); base = {'name': obj.name, 'min': low, 'max': high}
    # Keep the back plane of the original solid; service panels occupy only the
    # original front-layer volume and cannot enter the moving-leaf cavity.
    back_high = high[:]; back_high[1] = high[1] - .03125
    cuboid(obj, low, back_high)
    obj.data.materials.clear(); obj.data.materials.append(kit.material('access.navy'))
    x0, x1 = low[0] + .04, high[0] - .04
    y0, y1 = high[1] - .028, high[1] - .007
    cargo = group.startswith('cargo')
    light = 'amber' if cargo else 'cyan'
    width = x1 - x0
    spine = .16 if cargo else .11
    # Outer edge service spine; the three cover tiers give the broad housing a
    # readable molded assembly instead of a single flat white slab.
    outer_left = (x0 + x1) < 0
    pa, pb = (x0 + spine + .025, x1) if outer_left else (x0, x1 - spine - .025)
    tiers = [(.06, .58), (.625, 1.765), (1.81, 2.375)]
    for i, (a, b) in enumerate(tiers):
        face_panel(kit, group, base, f'{obj.name}-cover-{i}', pa, pb, a, b, y0, y1)
        # Small dark captive screws, inset field and vent bank remain inside the
        # original cover surface; no detail changes usable aperture width.
        for x in (pa + .055, pb - .055):
            for z in (a + .055, b - .055):
                face_panel(kit, group, base, f'{obj.name}-screw-{i}-{x}-{z}', x-.013, x+.013, z-.013, z+.013, y1-.005, high[1]-.003, 'trim')
    va, vb = pa + width*.08, pb - width*.08
    face_panel(kit, group, base, obj.name+'-vent-recess', va, vb, 1.105, 1.495, y1-.005, high[1]-.005, 'navy')
    for i in range(5):
        z = 1.145 + i * .066
        face_panel(kit, group, base, obj.name+f'-vent-fin-{i}', va+.02, vb-.02, z, z+.023, high[1]-.005, high[1]-.0015, 'grey')
    sa, sb = (x0, x0+spine) if outer_left else (x1-spine, x1)
    face_panel(kit, group, base, obj.name+'-service-spine', sa, sb, .14, 2.295, y0, high[1]-.008, 'trim')
    for z0, z1, colour in [(.235,.52,'red'),(.61,1.87,'white'),(1.94,2.105,light),(2.16,2.255,'white')]:
        face_panel(kit, group, base, obj.name+f'-spine-{z0}', sa+.02, sb-.02, z0, z1, high[1]-.008, high[1]-.002, colour)
    face_panel(kit, group, base, obj.name+'-serial-field', pa+.05, min(pb-.05,pa+.29), .225, .305, y1-.004, high[1]-.003, 'trim')
    for i in range(4):
        x=pa+.072+i*.04
        face_panel(kit, group, base, obj.name+f'-serial-tick-{i}', x, x+.014, .245, .284, high[1]-.003, high[1]-.0015, 'white')


def header_finish(kit, group, obj):
    low, high = bounds([obj]); base={'name':obj.name,'min':low,'max':high}
    # Retain the exact complete top and underside rectangles: the recess stops
    # 2cm short of both planes, inside the front fascia of the original solid.
    cutter_low=[low[0]-.01,high[1]-.03125,low[2]+.02]
    cutter_high=[high[0]+.01,high[1]+.01,high[2]-.02]
    bpy.ops.mesh.primitive_cube_add(size=1,location=[(cutter_low[i]+cutter_high[i])/2 for i in range(3)])
    cutter=bpy.context.object;cutter.name='GEO-finish-fascia-cutter'
    cutter.dimensions=[cutter_high[i]-cutter_low[i] for i in range(3)]
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Contained fascia recess','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    light='amber' if 'cargo' in obj.name else 'cyan'
    y0,y1=high[1]-.03125,high[1]
    face_panel(kit,group,base,obj.name+'-fascia-backing',low[0],high[0],low[2]+.022,high[2]-.022,y0,y1-.015625,'navy')
    count=max(3,math.ceil((high[0]-low[0])/.8)); step=(high[0]-low[0])/count
    for i in range(count):
        a=low[0]+i*step+.028;b=low[0]+(i+1)*step-.028
        face_panel(kit,group,base,obj.name+f'-fascia-plate-{i}',a,b,low[2]+.02,high[2]-.02,y1-.014,y1-.002,'white')
        if i in {0,count-1,count//2}:
            face_panel(kit,group,base,obj.name+f'-fascia-socket-{i}',a+.04,min(b-.04,a+.255),low[2]+.047,high[2]-.047,y1-.005,y1-.0015,'trim')
            face_panel(kit,group,base,obj.name+f'-fascia-marker-{i}',a+.06,min(b-.06,a+.235),low[2]+.075,high[2]-.075,y1-.0015,y1-.0005,light)


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root.resolve()
    base=root/'assets/runtime/wayfarer-access/r001';source=root/'assets/source/wayfarer-access/r001/profile.blend'
    if sha(source)!=BASE_BLEND or sha(base/'descriptor.json')!=BASE_DESCRIPTOR:
        raise ValueError('r001 source/descriptor changed')
    descriptor=json.loads((base/'descriptor.json').read_text());pack=json.loads((base/'doors.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(source))
    spec=importlib.util.spec_from_file_location('kit',root/'scripts/art/build_ship_access_doors.py');kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
    kit.MATERIALS={m.name:m for m in bpy.data.materials if m.name in kit.PALETTE}
    groups={k:[o for o in bpy.data.objects if o.type=='MESH' and o.data.polygons and group_for(o)==k] for k in FIXED}
    if any(not v for v in groups.values()):raise ValueError('Missing original fixed source group')
    kit.GROUPS=groups
    for group,objects in list(groups.items()):
        # Iterate an immutable snapshot; newly added finish layers are not edited again.
        for obj in list(objects):
            if '-pocket-' in obj.name and obj.name.endswith('-front'):pocket_finish(kit,group,obj)
            elif group=='native.flight' and '-header-roof' in obj.name:header_finish(kit,group,obj)
    out=root/'assets/runtime/wayfarer-access/r002';src=root/'assets/source/wayfarer-access/r002'
    out.mkdir(parents=True,exist_ok=True);src.mkdir(parents=True,exist_ok=True)
    # Never replace any r001 output. New folder copies immutable moving bytes.
    bpy.ops.wm.save_as_mainfile(filepath=str(src/'profile.blend'))
    exported=[]
    for original in descriptor['pieces']:
        group=original['id']
        if group in groups:
            piece=kit.export_group(group,groups[group],out);piece['boundsMin'],piece['boundsMax']=bounds(groups[group])
            for i in range(3):
                if piece['boundsMin'][i]<original['boundsMin'][i]-2e-5 or piece['boundsMax'][i]>original['boundsMax'][i]+2e-5:
                    raise ValueError('Fixed finish group escaped original bounds: '+group)
        else:
            piece=copy.deepcopy(original);shutil.copy2(base/piece['file'],out/piece['file'])
            if sha(out/piece['file'])!=piece['sha256']:raise ValueError('Moving-byte copy changed')
        exported.append(piece)
    descriptor=copy.deepcopy(descriptor);descriptor.update({'revision':'wayfarer-access-r002','pieces':exported,'sourceSha256':sha(src/'profile.blend'),'finishBase':{'revision':'wayfarer-access-r001','sourceSha256':BASE_BLEND,'descriptorSha256':BASE_DESCRIPTOR}})
    pack=copy.deepcopy(pack);pack.update({'revision':'wayfarer-access-doors-r002','pieces':[p for p in exported if not p['id'].startswith('native.')]})
    added=sum(p['triangles'] for p in exported)-sum(p['triangles'] for p in json.loads((base/'descriptor.json').read_text())['pieces'])
    if added>12000:raise ValueError('Finish triangle budget exceeded: '+str(added))
    finish={'schema':'sidereal.wayfarer-access-finish/v1','revision':'wayfarer-access-r002','base':descriptor['finishBase'],'details':DETAILS,'addedTriangles':added}
    finish_text=json.dumps(finish,indent=2,sort_keys=True)+'\n'
    descriptor['finishSha256']=hashlib.sha256(finish_text.encode()).hexdigest()
    for folder in (src,out):
        (folder/'finish.json').write_text(finish_text)
        (folder/'descriptor.json').write_text(json.dumps(descriptor,indent=2,sort_keys=True)+'\n')
        (folder/'doors.json').write_text(json.dumps(pack,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'revision':descriptor['revision'],'details':len(DETAILS),'addedTriangles':added,'sourceSha256':descriptor['sourceSha256'],'pieces':[{k:p[k] for k in ('id','sha256','triangles','bytes')} for p in exported]}))

if __name__=='__main__':main()
