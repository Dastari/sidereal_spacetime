#!/usr/bin/env python3
"""Blender-authored access kit, proposal r002. No runtime publication or ship migration.

blender -b --python scripts/art/build_ship_access_doors.py -- --output DIR --source DIR
Author axes: X along opening, Y outward, Z up. GLBs convert to native Y-up.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

REVISION = 'ship-access-r002'
PALETTE = {
    'access.white': ((.66, .68, .69), 'plastic-light', 0),
    'access.navy': ((.013, .025, .065), 'plastic-dark', 0),
    'access.grey': ((.18, .20, .24), 'plastic-deck', 0),
    'access.trim': ((.065, .085, .12), 'plastic-dark', 0),
    'access.rubber': ((.006, .009, .014), 'rubber', 0),
    'access.red': ((.42, .018, .034), 'plastic-colour', 0),
    'access.amber': ((1, .38, .015), 'emissive', 2.4),
    'access.cyan': ((.015, .48, 1), 'emissive', 2.4),
    'access.hazard': ((.72, .39, .025), 'plastic-colour', 0),
    'access.metal': ((.28, .32, .37), 'metal', 0),
}
MATERIALS = {}
GROUPS = {}


def material(name):
    if name in MATERIALS: return MATERIALS[name]
    colour, family, emission = PALETTE[name]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Metallic'].default_value = .68 if family == 'metal' else 0
    shader.inputs['Roughness'].default_value = .34 if family.startswith('plastic') else .55
    if emission:
        shader.inputs['Emission Color'].default_value = (*colour, 1)
        shader.inputs['Emission Strength'].default_value = emission
    m['family'] = family
    MATERIALS[name] = m
    return m


def finish(obj, group, name, slot, bevel=.016):
    obj.name = 'GEO-' + group + '-' + name
    obj.data.materials.append(material('access.'+slot))
    bpy.context.view_layer.objects.active = obj
    if bevel:
        modifier = obj.modifiers.new('Molded roundover', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        normal = obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    GROUPS.setdefault(group, []).append(obj)
    obj['role'] = 'door-frame' if group.endswith('frame') else 'door-leaf'
    return obj


def box(group, name, center, size, slot, bevel=.016):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, group, name, slot, min(bevel, min(size)/3))


def panel(group, name, x0, x1, z0, z1, y0, y1, slot, chamfer=.06):
    c = min(chamfer, (x1-x0)/4, (z1-z0)/4)
    outline = [(x0+c,z0),(x1-c,z0),(x1,z0+c),(x1,z1-c),
               (x1-c,z1),(x0+c,z1),(x0,z1-c),(x0,z0+c)]
    vertices = [(x,y,z) for y in (y0,y1) for x,z in outline]
    faces = [tuple(reversed(range(8))), tuple(range(8,16))]
    faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    # Consistent outward orientation, independently of the outline winding.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return finish(obj,group,name,slot,.009)


def build(kind, span):
    key = 'personnel' if kind == 'personnel' else f'cargo.{span}m'
    clear = 1.2 if kind == 'personnel' else span-.25
    height = 2.2 if kind == 'personnel' else 2.25
    outer = 2.3125
    jamb = (span-clear)/2
    frame = key+'.frame'
    light = 'cyan' if kind == 'personnel' else 'amber'
    # Open ring; no backplate fills the aperture. Recess cheeks create the vestibule depth.
    for side in (-1,1):
        x = side*(clear/2+jamb/2)
        box(frame, f'jamb-{side}',(x,-.19 if kind=='personnel' else -.025,outer/2),(jamb,.72 if kind=='personnel' else .35,outer),'navy',.024)
        box(frame,f'face-{side}',(x,.165,outer/2),(jamb*.82,.085,outer-.085),'white',.018)
        box(frame,f'seal-seat-{side}',(side*(clear/2+.012),-.02,height/2),(.024,.12,height),'rubber',.006)
        box(frame,f'recess-cheek-{side}',(side*(clear/2+jamb*.13),-.16,height/2),(jamb*.26,.16,height),'trim',.012)
        for z in (.16,1.32,2.08):
            box(frame,f'bolt-{side}-{z}',(x,.217,z),(.045,.016,.045),'metal',.005)
        box(frame,f'service-catch-{side}',(side*(span/2-.065),.22,.58),(.065,.06,.36),'red',.01)
        box(frame,f'status-socket-{side}',(x,.224,1.7),(max(.065,jamb*.5),.025,.13),'trim',.008)
        box(frame,f'status-{side}',(x,.242,1.7),(max(.032,jamb*.3),.012,.038),light,.003)
    box(frame,'lintel',(0,-.02,height+(outer-height)/2),(span,.37,outer-height),'navy',.016)
    box(frame,'light-housing',(0,.177,height+.045),(max(.65,clear*.48),.10,.077),'trim',.01)
    box(frame,'header-emitter',(0,.234,height+.045),(max(.53,clear*.43),.02,.025),light,.004)
    box(frame,'threshold',(0,-.065,.0125),(clear,.52,.025),'trim',.004)
    for i in range(max(8,round(clear/.12))):
        width=clear/max(8,round(clear/.12))
        obj=box(frame,f'hazard-{i}',(-clear/2+(i+.5)*width,.03,.028),(width*.65,.21,.009),'hazard',.002)
        obj.rotation_euler.z=-math.pi/7
    if kind == 'personnel':
        # Recess landing at the datum; its floor support is explicitly not simulation authority.
        box(frame,'recess-landing',(0,-.21,-.022),(clear,.5,.04),'grey',.006)
        for i in range(5):
            box(frame,f'landing-rail-{i}',(-.44+i*.22,-.20,.003),(.016,.42,.008),'metal',.002)
        for side in (-1,1):
            x=side*(clear/2+jamb*.58)
            box(frame,f'control-housing-{side}',(x,.26,1.04),(.16,.10,.31),'navy',.017)
            box(frame,f'control-screen-{side}',(x,.32,1.10),(.095,.016,.085),'cyan',.006)
            box(frame,f'control-key-{side}',(x,.32,.98),(.072,.024,.047),'white',.005)
    if kind == 'personnel':
        # One sealed EVA leaf: octagonal molded face, central port and layered
        # surround. The full backing plate preserves the rectangular seal.
        leaf=key+'.leaf'
        panel(leaf,'pressure-seal',-clear/2,clear/2,0,height,-.28,-.12,'rubber',.008)
        panel(leaf,'octagonal-border',-.595,.595,.025,height-.02,-.12,-.055,'trim',.145)
        panel(leaf,'octagonal-leaf',-.555,.555,.065,height-.055,-.05,.025,'white',.145)
        panel(leaf,'inset-field',-.46,.46,.18,height-.17,.025,.053,'grey',.12)
        panel(leaf,'molded-inset',-.42,.42,.23,height-.22,.05,.071,'white',.105)
        panel(leaf,'port-bezel',-.17,.17,1.38,1.72,.072,.10,'trim',.065)
        panel(leaf,'port-trim',-.135,.135,1.415,1.685,.10,.12,'metal',.048)
        panel(leaf,'central-port',-.105,.105,1.445,1.655,.12,.126,'navy',.035)
        box(leaf,'port-reflection',(.02,.131,1.575),(.10,.008,.017),'grey',.002)
        box(leaf,'central-locking-bar',(0,.11,.98),(.10,.058,.25),'trim',.018)
        box(leaf,'handle',(0,.152,1.015),(.16,.038,.038),'metal',.008)
        for side in (-1,1):
            for z in (.32,1.96):
                box(leaf,f'pressure-dog-{side}-{z}',(side*.45,.09,z),(.11,.056,.13),'metal',.016)
        box(leaf,'leaf-kick-plate',(0,.088,.20),(.56,.035,.055),'trim',.008)
        # Deep jamb cheeks and alternating ledges, rather than a flat opening.
        for side in (-1,1):
            box(frame,f'white-recess-step-{side}',(side*.76,.115,height/2),(.22,.18,height),'white',.025)
            box(frame,f'grey-seal-step-{side}',(side*.675,.045,height/2),(.11,.22,height),'grey',.012)
            box(frame,f'inner-seal-rail-{side}',(side*.613,-.04,height/2),(.025,.17,height),'rubber',.004)
        box(frame,'recess-roof',(0,-.24,height+.052),(1.45,.61,.105),'navy',.016)
        parts={'frame':frame,'leaf':leaf}
        stroke=clear+.025
    else:
        for side in (-1,1):
            leaf=key+('.left' if side==-1 else '.right')
            x0,x1=(-clear/2,-.004) if side==-1 else (.004,clear/2)
            panel(leaf,'pressure-leaf',x0 if side==-1 else 0,0 if side==-1 else x1,0,height,-.12,.018,'rubber',.008)
            panel(leaf,'molded-face',x0+.014,x1-.014,.048,height-.028,.005,.088,'white',.06)
            panel(leaf,'inner-field',x0+.08,x1-.08,.22,height-.21,.083,.103,'grey',.04)
            panel(leaf,'face-inset',x0+.11,x1-.11,.30,height-.28,.10,.127,'white',.03)
            box(leaf,'kick-plate',((x0+x1)/2,.145,.15),(x1-x0-.065,.045,.095),'trim',.008)
            for z in (.35,1.94):
                box(leaf,f'locking-shoe-{z}',(x0+.06 if side==1 else x1-.06,.154,z),(.075,.052,.14),'metal',.01)
            for z in (1.20,1.30,1.40):
                box(leaf,f'vent-{z}',((x0+x1)/2,.145,z),(min(x1-x0-.22,.65),.025,.035),'trim',.005)
            box(leaf,'service-spine',((x0+x1)/2,.145,.74),(.075,.046,.47),'navy',.012)
            box(leaf,'warning-pin',((x0+x1)/2,.177,.90),(.034,.015,.055),'amber',.004)
        parts={p:key+'.'+p for p in ('frame','left','right')}
        stroke=clear/2+.025
    return {'id':key,'spanM':span,'clearWidthM':clear,'clearHeightM':height,
            'outerHeightM':outer,'depthM':.64 if kind=='personnel' else .375,'strokeM':stroke,
            'parts':parts,'motion':'single-sliding' if kind=='personnel' else 'split-sliding',
            'requiresPocketReservationM':stroke}


def export_group(name, objects, output):
    bpy.ops.object.select_all(action='DESELECT')
    clones=[]
    for obj in objects:
        clone=obj.copy();clone.data=obj.data.copy();bpy.context.collection.objects.link(clone)
        clone.select_set(True);clones.append(clone)
    bpy.context.view_layer.objects.active=clones[0]
    bpy.ops.object.join()
    merged=bpy.context.object;merged.name='GEO-export-'+name
    # Joined authoring objects can repeat the same material slot. Collapse these
    # before export so each material produces one GLB primitive per component.
    unique=[]; remap={}
    for index,slot in enumerate(merged.data.materials):
        if slot not in unique: unique.append(slot)
        remap[index]=unique.index(slot)
    indices=[remap[p.material_index] for p in merged.data.polygons]
    merged.data.materials.clear()
    for material in unique: merged.data.materials.append(material)
    for polygon,index in zip(merged.data.polygons,indices): polygon.material_index=index
    path=output/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
                              export_apply=True,export_yup=True,export_extras=True,
                              export_cameras=False,export_lights=False)
    bpy.data.objects.remove(merged,do_unlink=True)
    data=path.read_bytes()
    doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    corners=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
    return {'id':name,'file':path.name,'sha256':hashlib.sha256(data).hexdigest(),
            'bytes':len(data),'triangles':triangles,'frame':'piece-local',
            'boundsMin':[min(p[k] for p in corners) for k in range(3)],
            'boundsMax':[max(p[k] for p in corners) for k in range(3)]}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--source',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    args.output.mkdir(parents=True,exist_ok=True)
    args.source.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    variants=[build('personnel',2),*[build('cargo',s) for s in (2,4,6)]]
    pieces=[export_group(k,v,args.output) for k,v in GROUPS.items()]
    for variant in variants:
        part_ids=set(variant['parts'].values())
        bounds=[piece for piece in pieces if piece['id'] in part_ids]
        variant['outerHeightM']=max(p['boundsMax'][2] for p in bounds)
        variant['depthM']=max(p['boundsMax'][1] for p in bounds)-min(p['boundsMin'][1] for p in bounds)
    # Save true authoring data, not a GLB roundtrip.
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source/'doors.blend'))
    manifest={'schema':'sidereal.ship-access-doors/v1','revision':REVISION,
              'approval':'proposal','axes':'author X along / Y outward / Z up; native GLB Y up',
              'variants':variants,'pieces':pieces,
              'palette':{k:{'colour':list(c),'family':f,'kind':'authored-access','strength':s}
                         for k,(c,f,s) in PALETTE.items()},
              'sourceSha256':hashlib.sha256((args.source/'doors.blend').read_bytes()).hexdigest()}
    encoded=json.dumps(manifest,indent=2,sort_keys=True)+'\n'
    (args.output/'manifest.json').write_text(encoded)
    (args.source/'manifest.json').write_text(encoded)
    print(json.dumps({'revision':REVISION,'pieces':len(pieces),'triangles':sum(p['triangles'] for p in pieces),
                      'manifestSha256':hashlib.sha256(encoded.encode()).hexdigest()}))

if __name__=='__main__': main()
