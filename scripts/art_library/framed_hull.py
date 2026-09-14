"""Editable native framed hull and bow family, authored directly in Blender.

Called by the managed framed Wayfarer runner: build_all(output_directory).
Nothing here mutates a runtime catalogue, placement, collider or world state.
The separate source layers are visual construction, not a pressure adapter.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
CELL = 1 / 32
REVISION = 1
PALETTE = {
    'pale': (.67, .70, .77, 1),
    'navy': (.055, .070, .11, 1),
    'black': (.014, .022, .032, 1),
    'red': (.43, .052, .073, 1),
    'metal': (.23, .27, .33, 1),
    'cyan': (.008, .59, .92, 1),
    'amber': (1, .34, .025, 1),
}
FONT = {
    'W': ['10001','10001','10001','10101','10101','11011','10001'],
    'F': ['11111','10000','10000','11110','10000','10000','10000'],
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'Y': ['10001','10001','01010','00100','00100','00100','00100'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    '0': ['01110','10001','10011','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '-': ['00000','00000','00000','11111','00000','00000','00000'],
}


def _image(name, pixels, path, color=False):
    h, w, _ = pixels.shape
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def _write_text(pixels, text, x, y, scale, color):
    for character in text:
        for row, bits in enumerate(FONT.get(character, ['00000'] * 7)):
            for column, bit in enumerate(bits):
                if bit == '1':
                    yy = y + (6 - row) * scale
                    xx = x + column * scale
                    pixels[yy:yy+scale, xx:xx+scale, :3] = color
        x += 6 * scale


def _materials(out):
    """Packed fixed-metric enamel normal/roughness plus authored signs.

    Small bolt seats and etched joints are in this 2 m repeating map; broad
    recesses and functional bay silhouettes remain geometry. No shader-only
    noise or displacement nodes are expected to survive GLB export.
    """
    target = out / 'textures'
    target.mkdir(parents=True)
    n = 512
    yy, zz = np.meshgrid((np.arange(n)+.5)/n*2, (np.arange(n)+.5)/n*2)
    relief = np.zeros((n, n), dtype=np.float32)
    # One fixed 1 m course, sparse 5 mm incised seam and bolt sockets.
    relief[(np.abs(yy % 1 - .03125) < .003) |
           (np.abs(zz % 1 - .0625) < .003)] = -.0015
    for cy in (.09375, .90625, 1.09375, 1.90625):
        for cz in (.125, .875, 1.125, 1.875):
            radius = np.sqrt((yy-cy)**2+(zz-cz)**2)
            relief[radius < .012] = -.0025
            relief[(radius < .007) & (np.abs(zz-cz) < .0025)] = -.004
    dz, dy = np.gradient(relief, 2/n)
    normal = np.stack((-dy, -dz, np.ones_like(dy)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    rgba = np.ones((n, n, 4), dtype=np.float32)
    rgba[:, :, :3] = normal*.5+.5
    normal_image = _image('Framed hull / metric enamel normal', rgba,
                          target/'enamel-normal.png')
    rough = .37 + .022*np.sin(yy*231+zz*173)*np.sin(yy*79-zz*211)
    rough[relief < 0] = .57
    rgba[:, :, :3] = rough[:, :, None]
    rough_image = _image('Framed hull / metric enamel roughness', rgba,
                         target/'enamel-roughness.png')
    mats = {}
    for key, color in PALETTE.items():
        material = bpy.data.materials.new('Framed hull / '+key)
        material.use_nodes = True
        material.diffuse_color = color
        p = material.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = color
        p.inputs['Metallic'].default_value = .65 if key == 'metal' else .08
        p.inputs['Roughness'].default_value = .32 if key == 'metal' else .4
        if key in ('cyan', 'amber'):
            p.inputs['Emission Color'].default_value = color
            p.inputs['Emission Strength'].default_value = 2
        elif key != 'black':
            tex = material.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = normal_image
            nm = material.node_tree.nodes.new('ShaderNodeNormalMap')
            material.node_tree.links.new(tex.outputs['Color'], nm.inputs['Color'])
            material.node_tree.links.new(nm.outputs['Normal'], p.inputs['Normal'])
            r = material.node_tree.nodes.new('ShaderNodeTexImage')
            r.image = rough_image
            material.node_tree.links.new(r.outputs['Color'], p.inputs['Roughness'])
        mats[key] = material
    for kind in ('identity', 'wayfarer'):
        # Opaque sign texture on its own shallow closed nameplate, not an alpha
        # plane. Lettering is a deliberate authored bitmap, not generated art.
        pixels = np.ones((256, 512, 4), dtype=np.float32)
        pixels[:, :, :3] = (.24, .27, .34) if kind == 'identity' else (.74, .77, .82)
        if kind == 'identity':
            _write_text(pixels, 'WF-01', 34, 97, 7, (.86,.88,.92))
            x, z = np.meshgrid(np.arange(512), np.arange(256))
            disc = (x-391)**2 + (z-134)**2 < 45**2
            pixels[disc, :3] = (.82,.84,.88)
            ring = ((x-391)/69)**2 + ((z-134-(x-391)*.36)/16)**2
            pixels[(ring > .72) & (ring < 1.1), :3] = (.63,.17,.20)
        else:
            _write_text(pixels, 'WAYFARER', 66, 87, 8, (.105,.14,.22))
        image = _image('Framed hull / '+kind+' marking', pixels,
                       target/(kind+'-basecolor.png'), True)
        material = mats['navy' if kind == 'identity' else 'pale'].copy()
        material.name = 'Framed hull / '+kind+' sign'
        p = material.node_tree.nodes.get('Principled BSDF')
        tex = material.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.interpolation = 'Closest'
        tex.extension = 'EXTEND'
        sign_uv = material.node_tree.nodes.new('ShaderNodeUVMap')
        sign_uv.uv_map = 'Sign'
        material.node_tree.links.new(sign_uv.outputs['UV'], tex.inputs['Vector'])
        material.node_tree.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        # Sign UV has fixed lettering extent, so use separate metric layer for
        # its enamel rather than changing the grain size with the inscription.
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.name != tex.name:
                uv = material.node_tree.nodes.new('ShaderNodeUVMap')
                uv.uv_map = 'Metric2m'
                material.node_tree.links.new(uv.outputs['UV'], node.inputs['Vector'])
        mats[kind] = material
    return mats


class Module:
    def __init__(self, slug, mats):
        self.slug = slug
        self.mats = mats
        self.collection = bpy.data.collections.new('SOURCE-'+slug)
        bpy.context.scene.collection.children.link(self.collection)
        self.root = bpy.data.objects.new('ASSET-'+slug, None)
        self.collection.objects.link(self.root)
        self.root['native_source'] = f'framed_hull.py / r{REVISION:03}'
        self.root['damage_cell_m'] = CELL
        self.objects = []
        self.sockets = {}

    def mesh(self, name, verts, faces, material, bevel=0, layer='exterior-finish'):
        mesh = bpy.data.meshes.new('MESH-'+self.slug+'--'+name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new('GEO-'+self.slug+'--'+name, mesh)
        self.collection.objects.link(obj)
        obj.parent = self.root
        obj['construction_layer'] = layer
        mesh.materials.append(self.mats[material])
        uv = mesh.uv_layers.new(name='Metric2m')
        for face in mesh.polygons:
            axis = max(range(3), key=lambda i: abs(face.normal[i]))
            for li in face.loop_indices:
                p = mesh.vertices[mesh.loops[li].vertex_index].co
                uv.data[li].uv = ((p.y+1)/2, p.z/2) if axis == 0 else (p.x/2,p.z/2) if axis == 1 else (p.x/2,p.y/2)
        if bevel:
            b = obj.modifiers.new('Editable single-step edge chamfer', 'BEVEL')
            # A chamfer equal to half a thin plate's depth collapses its
            # middle quad to duplicate vertices in GLB triangulation. Keep a
            # physical centre face on every thin source solid instead of
            # filtering invalid export triangles or weakening validation.
            min_edge = min((Vector(verts[face[(i+1)%len(face)]])-Vector(verts[v])).length
                           for face in faces for i,v in enumerate(face))
            b.width = min(bevel,min_edge*.4)
            b.segments = 1
            b.affect = 'EDGES'
            b.harden_normals = True
            obj.modifiers.new('Weighted broad face normals', 'WEIGHTED_NORMAL')
        self.objects.append(obj)
        return obj

    def box(self, name, x0, x1, y0, y1, z0, z1, material='pale', bevel=.008, layer='exterior-finish'):
        if min(x1-x0, y1-y0, z1-z0) <= 0:
            raise ValueError(('Invalid cuboid', self.slug, name))
        verts = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
                 (x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
        return self.mesh(name, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),
                                      (1,2,6,5),(2,3,7,6),(3,0,4,7)], material, bevel, layer)

    def prism(self, name, xy, low, high, material='navy', bevel=0):
        n = len(xy)
        verts = [(x,y,low) for x,y in xy] + [(x,y,high(y) if callable(high) else high) for x,y in xy]
        return self.mesh(name, verts, [tuple(reversed(range(n))),tuple(range(n,2*n))] +
                         [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)], material, bevel)

    def socket(self, name, position, normal=(1,0,0)):
        obj = bpy.data.objects.new('SOCKET-'+self.slug+'--'+name, None)
        self.collection.objects.link(obj)
        obj.parent = self.root
        obj.location = position
        obj.empty_display_type = 'ARROWS'
        obj.empty_display_size = .12
        obj['socket_name'] = name
        obj['normal'] = list(normal)
        self.sockets[name] = {'position': list(position), 'normal': list(normal)}

    def sign(self, name, x, y0, y1, z0, z1, kind='identity'):
        obj = self.box(name,x,x+.006,y0,y1,z0,z1,kind,0)
        uv = obj.data.uv_layers.new(name='Sign')
        obj.data.uv_layers.active = uv
        for face in obj.data.polygons:
            for li in face.loop_indices:
                p = obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = ((p.y-y0)/(y1-y0), (p.z-z0)/(z1-z0))
        return obj


def _side(slug, variant, width, height, mats):
    m = Module(slug, mats)
    half = width/2
    # Separate editable skins, internal void and ribs. The cosmetic exterior
    # and these native source layers do not replace authoritative occupancy.
    m.box('inner-pressure-skin',0,CELL,-half,half,0,height,'metal',0,'inner-pressure-skin')
    m.box('outer-armor-skin',.125,.25,-half,half,0,height,'navy',0,'outer-armor')
    for y in np.arange(-half, half-.001, .5):
        m.box('cavity-rib',CELL,.125,float(y),min(float(y)+CELL,half),0,height,'metal',0,'internal-rib')
    for z in (0,height-CELL):
        m.box('sealed-layer-end',CELL,.125,-half,half,z,z+CELL,'metal',0,'sealed-end')
    # Each module contributes only half a 250mm connector post inside its span.
    # Adjacent modules therefore form one post, never two full-width posts.
    for side in (-1,1):
        y0,y1 = (-half,-half+.125) if side < 0 else (half-.125,half)
        m.box('half-edge-carrier',.1875,.4375,y0,y1,0,height,'navy',.012)
        for z0,z1 in ((0,.25),(.28125,height-.28125),(height-.25,height)):
            if z1 <= z0:
                continue
            m.box('pale-half-post',.3125,.5,y0,y1,z0,z1,'pale',.015625)
        if height >= 1.5:
            center = height*.42
            m.box('amber-post-socket',.491,.498,y0+.034,y1-.034,center-.18,center+.18,'black',.004)
            m.box('amber-post-lens',.498,.5,y0+.049,y1-.049,center-.135,center+.135,'amber',.001)
    # Physical cap size is invariant; only central infill changes height.
    for z0,z1 in ((0,.25),(height-.25,height)):
        m.box('navy-cap-rail',.25,.4375,-half+.125,half-.125,z0,z1,'navy',.015625)
        m.box('cap-inset-seam',.438,.445,-half+.20,half-.20,z0+.0625,z0+.078125,'black',.001)
    if width >= 1:
        m.box('lower-cyan-socket',.4375,.46,-.25,.25,.0625,.15625,'black',.008)
        m.box('lower-cyan-lens',.46,.467,-.1875,.1875,.0875,.13125,'cyan',.002)
    y0,y1 = -half+.1875,half-.1875
    z0,z1 = .3125,height-.3125
    # A black shadow recess separates the decorated bay from pale connectors.
    m.box('bay-shadow',.25,.28125,y0-.03125,y1+.03125,z0-.03125,z1+.03125,'black',.01)
    face = 'red' if variant == 'red-service' else 'navy' if variant == 'identity' else 'pale'
    m.box('replaceable-bay',.28125,.34375,y0,y1,z0,z1,face,.03125)
    if variant == 'vent':
        vy0,vy1 = y0+.125,y1-.125
        vz0,vz1 = z0+.25,z1-.25
        m.box('deep-vent-recess',.344,.354,vy0-.03125,vy1+.03125,vz0-.03125,vz1+.03125,'black',.012)
        for z in np.arange(vz0+.0625,vz1-.035,.1875):
            # Blade front ridge projects; rear sloping face gives true shadow.
            lo,hi = float(z),min(float(z)+.08,vz1)
            m.box('vent-blade',.35,.40625,vy0,vy1,lo,hi,'metal',.008)
        for y in (vy0-.0625,vy1):
            m.box('vent-edge',.344,.39,y,y+.0625,vz0-.0625,vz1+.0625,'navy',.008)
    elif variant == 'red-service':
        m.box('service-upper-fold',.344,.382,y0+.08,y1-.08,z1-.15625,z1-.0625,'red',.008)
        for z in (z0+.18,z1-.34):
            m.box('service-hinge',.344,.40625,y0-.02,y0+.10,z,z+.15625,'metal',.008)
        m.box('handle-pocket',.344,.351,y1-.24,y1-.06,height*.44,height*.56,'black',.012)
        m.box('recessed-handle',.353,.387,y1-.20,y1-.14,height*.45,height*.54,'metal',.006)
        m.box('service-data-tab',.344,.352,-.30,.14,z0+.24,z0+.34,'navy',.002)
        for i in range(4):
            m.box('service-warning-key',.353,.356,-.27+i*.086,-.235+i*.086,z0+.27,z0+.30,'amber',0)
    elif variant == 'utility':
        m.box('utility-spine',.344,.40625,-.19,.19,z0+.14,z1-.14,'navy',.015625)
        for side in (-1,1):
            a,b = (y0+.08,-.29) if side < 0 else (.29,y1-.08)
            m.box('utility-cassette',.344,.46875,a,b,z0+.28,z0+1.05,'pale',.03125)
            m.box('cassette-port',.469,.479,a+.04,b-.04,z0+.39,z0+.73,'black',.012)
            m.box('cassette-status',.479,.489,a+.06,b-.06,z0+.81,z0+.90,'amber',.004)
        m.box('utility-cyan-port',.407,.4375,-.075,.075,height*.56,height*.78,'cyan',.006)
        m.box('utility-coupler',.407,.5,-.125,.125,z0+.16,z0+.45,'metal',.015625)
    elif variant == 'identity':
        m.sign('identity-inscription',.344,y0+.0625,y1-.0625,height*.34,height*.68)
    # Sparse, physical top clamps tie the repeating rails to the bay language.
    if width >= 1 and height >= 1.5:
        m.box('top-clamp',.25,.46875,-.15625,.15625,height-.25,height,'pale',.015625)
    m.socket('HULL_ATTACH',(0,0,0))
    m.socket('HULL_EDGE_START',(0,-half,0),(0,-1,0))
    m.socket('HULL_EDGE_END',(0,half,0),(0,1,0))
    m.socket('HULL_TOP',(0,0,height),(0,0,1))
    m.root['nominal_width_m'] = width
    m.root['nominal_height_m'] = height
    return m


def _edge_box(m, name, a, b, t0, t1, depth0, depth1, z0, z1, material='pale', bevel=.008):
    """Author an edge-local cuboid using distances in metres, not mesh scaling.
    Its positive depth points outward. Source face is retained in XY coords.
    """
    a,b = Vector(a),Vector(b)
    u = (b-a).normalized()
    normal = Vector((u.y,-u.x,0))
    aa,bb = a+u*t0,a+u*t1
    verts = [tuple(p+normal*d+Vector((0,0,z))) for z in (z0,z1)
             for p,d in ((aa,depth0),(bb,depth0),(bb,depth1),(aa,depth1))]
    # a->b then outward is clockwise in XY, so reverse the usual prism winding.
    faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    return m.mesh(name,verts,faces,material,bevel)


def _front_bay(m, a, b, height, relief=.03125, variant='plain'):
    length = (Vector(b)-Vector(a)).length
    def box(name,t0,t1,d0,d1,z0,z1,mat='pale',bevel=.008):
        return _edge_box(m,name,a,b,t0,t1,d0,d1,z0,z1,mat,bevel)
    box('front-shadow-bay',.0625,length-.0625,-.045,0,.125,height-.125,'black')
    for t0,t1 in ((.03125,.15625),(length-.15625,length-.03125)):
        box('front-connector',t0,t1,-.0625,relief,.03125,height-.03125,'pale',.015625)
    for z0,z1 in ((.03125,.15625),(height-.15625,height-.03125)):
        box('front-cap-rail',.15625,length-.15625,-.0625,relief-.008,z0,z1,'navy')
    box('front-armor-panel',.1875,length-.1875,-.055,.004,.1875,height-.1875,
        'red' if variant == 'service' else 'pale',.015625)
    if variant == 'vent':
        vy0,vy1 = length*.28,length*.72
        box('front-vent-well',vy0,vy1,.005,.012,.32,height-.30,'black')
        for z in np.arange(.38,height-.34,.125):
            box('front-louver',vy0+.03125,vy1-.03125,.013,relief,float(z),float(z)+.035,'metal',.003)
    elif variant == 'name':
        obj = box('WAYFARER-inscription',length*.20,length*.80,.006,.009,
                  height*.32,height*.70,'wayfarer',0)
        u = (Vector(b)-Vector(a)).normalized()
        uv = obj.data.uv_layers.new(name='Sign')
        obj.data.uv_layers.active = uv
        for face in obj.data.polygons:
            for li in face.loop_indices:
                co = obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = (((co-Vector(a)).dot(u)-length*.20)/(length*.60),
                                     (co.z-height*.32)/(height*.38))
    else:
        box('front-service-latch',length*.73,length*.77,.006,relief,
            height*.40,height*.57,'metal',.004)
    box('front-cyan-housing',length*.42,length*.63,.003,relief-.003,height-.145,height-.055,'black',.003)
    box('front-cyan-lens',length*.445,length*.605,relief-.003,relief,height-.12,height-.085,'cyan',.001)


FRONTS = {
    'front-sill-straight': 'part-4c25a5fd9da0bce537f5',
    'front-sill-diagonal45': 'part-540c83fc49ee792d9a4a',
    'front-bow-transom': 'part-ecd751f76e602db806a3',
    'front-bow-bumper': 'part-63a0c40bbb71cfeba4dd',
    'front-diagonal-cheek': 'part-437732483fa4d7acbcbc',
    'front-shoulder-transition': 'part-e965a5502d9fe4c25406',
}


def _front(slug, mats):
    m = Module(slug,mats)
    if slug in ('front-sill-straight','front-bow-transom'):
        m.prism('original-sill-interface',[(0,.0625),(2,.0625),(2,.375),(0,.375)],0,1.125,'navy')
        _front_bay(m,(0,0,0),(2,0,0),1.125,.03125,
                   'name' if slug == 'front-bow-transom' else 'plain')
        # Retain minimum X/Y and full-height sill planes without extending them.
        for z in (0,1.0625):
            m.box('sill-interface-band',0,2,0,.375,z,z+.0625,'navy',0)
    elif slug == 'front-sill-diagonal45':
        # A native chamfered datum on the accepted 2x2 diagonal, with the
        # existing .0176777 corner setback, not an oversized rotated rectangle.
        e = .0176776684820652
        xy = [(0,2*e),(e,e),(2-e,2-e),(2-2*e,2),(1.625,2),(0,.375)]
        m.prism('diagonal-sill-interface',xy,0,1.125,'navy')
        # Inset edge avoids exceeding the inherited diagonal mating profile.
        _front_bay(m,(.0625,.0625,0),(1.9375,1.9375,0),1.125,.015625,'plain')
    elif slug == 'front-bow-bumper':
        m.prism('bow-impact-carrier',[(0,0),(4,0),(3.75,.5),(.25,.5)],0,1.48,'navy')
        m.prism('bow-top-weather-skin',[(.03125,.03125),(3.96875,.03125),(3.71875,.46875),(.28125,.46875)],1.48,1.55,'pale',.008)
        _front_bay(m,(3.75,.5,0),(.25,.5,0),1.50,.125,'name')
    elif slug == 'front-diagonal-cheek':
        xy = [(2,0),(4,0),(1,2),(0,2)]
        m.prism('diagonal-impact-carrier',xy,0,1.48,'navy')
        m.prism('diagonal-top-weather-skin',[(2.04,.04),(3.87,.04),(1,1.94),(.09,1.94)],1.48,1.55,'pale',.008)
        a,b = Vector((4,0,0)),Vector((1,2,0))
        mid = a.lerp(b,.5)
        tangent = (b-a).normalized()
        # Recess backing also has depth inward. Reserve a fixed 125 mm end
        # shoulder so its negative-depth corner stays within the diagonal
        # component's existing Y=0 plane instead of crossing the next module.
        _front_bay(m,a+tangent*.125,mid,1.50,.0625,'service')
        _front_bay(m,mid,b-tangent*.125,1.50,.0625,'vent')
    else:
        height = lambda y: 2.9375-1.375*y/2
        m.prism('lower-transition-carrier',[(0,0),(.75,0),(0,2)],0,1.25,'navy')
        m.prism('upper-tapered-spine',[(0,0),(.625,0),(0,2)],1.25,height,'navy')
        lower_a,lower_b = Vector((.75,0,0)),Vector((0,2,0))
        lower_tangent = (lower_b-lower_a).normalized()
        # The narrow triangular shoulder requires enough terminal land for
        # the full negative-depth recess, not only its exterior front face.
        _front_bay(m,lower_a+lower_tangent*.1875,
                   lower_b-lower_tangent*.1875,1.24,.0625,'vent')
        # Upper trapezoidal pale insert remains inside the accepted sloped roof
        # line and leaves its physical top-edge thickness unchanged.
        a,b = Vector((.625,0,0)),Vector((0,2,0))
        u = (b-a).normalized()
        normal = Vector((u.y,-u.x,0))
        aa,bb = a+u*.14,b-u*.14
        p = [tuple(aa+Vector((0,0,1.375))),tuple(bb+Vector((0,0,1.375))),
             tuple(bb+Vector((0,0,height(bb.y)-.125))),tuple(aa+Vector((0,0,height(aa.y)-.125)))]
        verts = [tuple(Vector(v)+normal*d) for d in (.018,.045) for v in p]
        m.mesh('tapered-upper-pale-surround',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'pale',.008)
        _edge_box(m,'upper-service-inset',a,b,.24,.78,.046,.052,1.55,1.87,'navy')
        _edge_box(m,'upper-status-cyan',a,b,.32,.69,.053,.058,1.65,1.70,'cyan',.003)
    m.socket('HULL_ATTACH',(0,0,0))
    return m


def _bounds(objects):
    points = []
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        ev = obj.evaluated_get(deps)
        mesh = ev.to_mesh()
        points.extend(obj.matrix_world @ v.co for v in mesh.vertices)
        ev.to_mesh_clear()
    return {'min':[min(p[i] for p in points) for i in range(3)],
            'max':[max(p[i] for p in points) for i in range(3)]}


def _export(m, out, metadata):
    """Keep editable semantic solids, export one joined multi-material mesh.
    Joining is a visual batching operation; object identity remains asset root.
    """
    target = out / 'models' / m.slug
    target.mkdir(parents=True)
    bpy.context.view_layer.update()
    bounds = _bounds(m.objects)
    copies = []
    for source in m.objects:
        obj = source.copy()
        obj.data = source.data.copy()
        m.collection.objects.link(obj)
        obj.parent = None
        copies.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = 'GEO-'+m.slug+'--native-surface'
    joined.parent = m.root
    joined['construction_layer'] = 'native-render-batch; semantic layers retained in Blender source'
    # Root and sockets preserve local native datum; only this selected surface
    # is exported. No authoring cameras, lights, proxy or source overlaps.
    bpy.ops.object.select_all(action='DESELECT')
    joined.select_set(True)
    m.root.select_set(True)
    selected_sockets = []
    for obj in m.collection.objects:
        if obj.type == 'EMPTY' and obj is not m.root:
            selected_sockets.append((obj,obj.name))
            obj.name = obj['socket_name']
            obj.select_set(True)
    path = target / 'model.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
                              use_selection=True, export_apply=True, export_extras=True)
    for obj, original_name in selected_sockets:
        obj.name = original_name
    record = {'slug':m.slug, 'path':str(path.relative_to(out)),
              'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
              'bounds':bounds,'sockets':m.sockets,
              'collection':m.collection.name,'root':m.root.name,
              'nodePrefix':'GEO-'+m.slug+'--native-surface',
              'authoredMeshCount':len(m.objects),'materialSlots':len(joined.data.materials),
              'triangles':sum(len(p.vertices)-2 for p in joined.data.polygons),
              'nonuniformScale':False,'cellSizeM':CELL, **metadata}
    (target/'model.json').write_text(json.dumps(record,indent=2)+'\n')
    bpy.data.objects.remove(joined,do_unlink=True)
    return record


def build_all(out_dir):
    global REVISION
    out = Path(out_dir).resolve()
    REVISION = int(out.parent.name[1:])
    out.mkdir(parents=True,exist_ok=True)
    if (out/'models.json').exists() or (out/'source.blend').exists():
        raise FileExistsError('Preserve the meaningful native revision: '+str(out))
    mats = _materials(out)
    records, modules = [], []
    for variant in ('plain','vent','red-service','utility','identity'):
        slug = 'side-'+variant+'-w200-h300'
        m = _side(slug,variant,2,3,mats)
        records.append(_export(m,out,{'family':'side','variant':variant,'widthM':2,'heightM':3}))
        modules.append(m)
    for width,height in ((1,3),(.5,3),(2,.75),(2,1.5),(2,2.25)):
        slug = f'side-plain-w{round(width*100):03}-h{round(height*100):03}'
        m = _side(slug,'plain',width,height,mats)
        records.append(_export(m,out,{'family':'side','variant':'plain','widthM':width,'heightM':height}))
        modules.append(m)
    catalogue = {a['id']:a for a in json.loads((ROOT/'assets/runtime/assembly/catalog-shipyard-r005.json').read_text())['assets']}
    for slug, asset_id in FRONTS.items():
        m = _front(slug,mats)
        old = catalogue[asset_id]
        record = _export(m,out,{'family':'front','assetId':asset_id,
                              'existingBounds':old['bounds'],'existingVisual':old['visual'],
                              'glazingChanged':False})
        # Reject accidental visual widening rather than changing qualified size.
        for axis in range(3):
            if record['bounds']['min'][axis] < old['bounds']['min'][axis]-.0001 or record['bounds']['max'][axis] > old['bounds']['max'][axis]+.0001:
                raise ValueError(('Front native envelope overflow',slug,record['bounds'],old['bounds']))
        records.append(record)
        modules.append(m)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    for m in modules:
        m.collection.hide_render = m is not modules[0]
        m.collection.hide_viewport = m is not modules[0]
    bpy.context.scene['native_hull_contract'] = '1/32 m datum; shared half-post; no scale; separate source layers; unpublished'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'))
    result = {'schema':'sidereal.framed-hull-native.v1','revision':REVISION,'models':records,
              'source':'source.blend','sourceSha256':hashlib.sha256((out/'source.blend').read_bytes()).hexdigest(),
              'recipeSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'maps':[{'path':str(p.relative_to(out)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((out/'textures').glob('*.png'))],
              'limits':['Visual native skins/ribs are not a qualified pressure or collision adapter.',
                        'Sill and front replacements retain inherited local profile bounds.',
                        'No glass, engine cutout, installed transform or physics edit.']}
    (out/'models.json').write_text(json.dumps(result,indent=2)+'\n')
    return records
