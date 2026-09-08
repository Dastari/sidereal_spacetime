"""Original connected armour and markings; run inside Blender through MCP."""
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Sidereal exterior'
ATLAS_WIDTH_M = 48.0


def slab(name, points, z, depth, color, bevel=.04):
    n = len(points)
    vertices = [(x, y, height) for height in (-depth/2, depth/2) for x, y in points]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = attach(bpy.data.objects.new(name, mesh), name, color)
    obj.location = (*CURRENT['origin'], z)
    if bevel:
        mod = obj.modifiers.new('Armour edge', 'BEVEL'); mod.width=bevel; mod.segments=1
    return obj


# Paint is authored only by the decal/glyph collections below. The roof is a
# continuous, fully opaque skin; its perimeter is a separate adjacency overlay.
# Albedo is flat emission: runtime lighting supplies illumination, with no noisy
# low-sample path-traced shadows baked into repeating pixels.
ROOF_MIXES = {
    'roof_face': ('steel', 'panel', .18),
    'roof_facet': ('steel', 'panel', .08),
    'roof_joint': ('steel', 'dark', .36),
    'roof_highlight': ('steel', 'panel', .32),
}
for key, (a, b, blend) in ROOF_MIXES.items():
    COLORS[key] = tuple(x*(1-blend)+y*blend for x,y in zip(COLORS[a], COLORS[b]))

for w,h in [(1,1),(1,2),(2,1),(2,2),(2,3),(3,2),(3,3),(2,4),(4,2),(1,3),(3,1)]:
    begin(f'plate_{w}x{h}', 'roof', size=(w,h))
    # Slight overscan avoids alpha fringes at the crop. There are deliberately no
    # cut-away corners, coupling teeth, inset gutters, vents or safety paint.
    slab('Continuous skin', [(-w-.02,-h-.02),(w+.02,-h-.02),
        (w+.02,h+.02),(-w-.02,h+.02)], .03, .04, 'roof_face', 0)
    slab('Swept flush sheet', [(-w-.02,-h-.02),(w+.02,-h-.02),
        (w+.02,h*.18),(w*.30,h*.42),(-w-.02,-h*.62)], .055,.002,'roof_facet',0)
    # A joint is owned by only the north/west edge: one pixel, not two inset
    # frames on either side of every panel. All pixels below it remain opaque.
    px=2/64
    box('North butt seam',0,h-px/2,.06,w*2+.04,px,.002,'roof_joint',0)
    box('West butt seam',-w+px/2,0,.06,px,h*2+.04,.002,'roof_joint',0)
    box('North seam lip',0,h-px*1.5,.065,w*2,px,.002,'roof_highlight',0)


def canonical_mask(mask):
    # N,E,S,W; NE,SE,SW,NW. A diagonal matters only if both side neighbours exist.
    for diagonal, sides in [(16,3),(32,6),(64,12),(128,9)]:
        if mask & sides != sides: mask &= ~diagonal
    return mask


def rim_color(mask, x, y):
    distances=[]
    for bit,d,lit in [(1,y,True),(2,63-x,False),(4,63-y,False),(8,x,True)]:
        if not mask & bit: distances.append((d,lit))
    for diagonal,sides,dx,dy,lit in [(16,3,63-x,y,True),(32,6,63-x,63-y,False),
            (64,12,x,63-y,False),(128,9,x,y,True)]:
        if mask & sides == sides and not mask & diagonal:
            distances.append((max(dx,dy),lit))
    if not distances: return None
    distance,lit=min(distances)
    if distance>=5: return None
    return ['seam','dark','panel' if lit else 'steel',
            'roof_highlight' if lit else 'roof_facet','roof_joint'][distance]


# All 47 canonical eight-neighbour configurations, except the fully surrounded
# cell (255) which needs no trim at all. One overlay owns every corner, so no
# independently overlapping corner sprites or coplanar faces are required.
for mask in sorted({canonical_mask(n) for n in range(256)}-{255}):
    begin(f'rim_{mask}', 'roof_trim', size=(1,1), neighbour_mask=mask)
    vertices=[]; faces=[]; colors=[]
    for y in range(64):
        x=0
        while x<64:
            color=rim_color(mask,x,y)
            end=x+1
            while end<64 and rim_color(mask,end,y)==color: end+=1
            if color:
                left,right=-1+x/32,-1+end/32
                top,bottom=1-y/32,1-(y+1)/32
                n=len(vertices)
                vertices.extend([(left,bottom,.08),(right,bottom,.08),
                                 (right,top,.08),(left,top,.08)])
                faces.append((n,n+1,n+2,n+3)); colors.append(color)
            x=end
    mesh=bpy.data.meshes.new(f'Perimeter {mask}')
    mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=attach(bpy.data.objects.new(f'Perimeter {mask}',mesh),'Joined rim',colors[0])
    obj.location=(*CURRENT['origin'],0)
    keys=sorted(set(colors)); mesh.materials.clear()
    for key in keys: mesh.materials.append(material(key))
    for face,color in zip(mesh.polygons,colors): face.material_index=keys.index(color)

for name in ['chevron','hazard','service','roundel','designation']:
    begin('decal_'+name,'decal',size=(1,1))
    if name=='chevron':
        for y in [-.4,0,.4]:
            slab('Identification chevron',[(-.8,y+.12),(0,y-.28),(.8,y+.12),(.8,y+.27),(0,y-.13),(-.8,y+.27)],.02,.006,'light',0)
    elif name=='hazard':
        for x in [-.6,-.2,.2,.6]:
            slab('Hazard stripe',[(x-.15,-.6),(x+.05,-.6),(x+.35,.6),(x+.15,.6)],.02,.006,'amber',0)
    elif name=='service':
        for y in [-.55,.55]: box('Service boundary',0,y,.02,1.3,.035,.006,'light',0)
        for x in [-.65,.65]: box('Service boundary',x,0,.02,.035,1.1,.006,'light',0)
        for i in range(3): box('Service code',-.34+i*.25,0,.02,.11,.6,.006,'light',0)
    elif name=='roundel':
        slab('Faction badge',[(-.65,-.35),(0,.85),(.65,-.35),(0,-.08)],.02,.006,'light',0)
        slab('Badge inset',[(-.30,-.10),(0,.48),(.30,-.10),(0,.04)],.025,.006,'dark',0)
    else:
        for x in [-.68,.68]:
            box('Registration bracket',x,0,.02,.04,1.1,.006,'light',0)
            box('Registration bracket',x- (0.12 if x>0 else -.12),.55,.02,.25,.04,.006,'light',0)

for letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-':
    begin('glyph_'+str(ord(letter)), 'decal', size=(1,1))
    curve=bpy.data.curves.new('Stencil '+letter,'FONT')
    curve.body=letter; curve.align_x='CENTER'; curve.align_y='CENTER'; curve.size=1.55
    curve.extrude=.002; curve.space_character=1
    obj=attach(bpy.data.objects.new('Stencil '+letter,curve),'stencil','light')
    obj.location=(*CURRENT['origin'],.02)

ATLAS_HEIGHT_M = PACK['y'] + PACK['row_height']
bpy.ops.object.camera_add(location=(ATLAS_WIDTH_M/2,-ATLAS_HEIGHT_M/2,50))
camera=bpy.context.object; camera.data.type='ORTHO'; camera.data.ortho_scale=max(ATLAS_WIDTH_M,ATLAS_HEIGHT_M)
scene.camera=camera; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=1
scene.cycles.pixel_filter_type='BOX'; scene.cycles.filter_width=1.0
scene.cycles.use_denoising=False; scene.render.threads_mode='FIXED'; scene.render.threads=4
scene.render.resolution_x=round(ATLAS_WIDTH_M*64); scene.render.resolution_y=round(ATLAS_HEIGHT_M*64)
scene.render.resolution_percentage=100; scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'
scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.72,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
light_data=bpy.data.lights.new('Exterior key','SUN'); light_data.energy=1.7; light_data.angle=.25
light=bpy.data.objects.new('Exterior key',light_data); scene.collection.objects.link(light); light.rotation_euler=(.45,-.5,-.4)
scene['exterior_tiles_json']=json.dumps(TILES)
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT+'/exterior.blend')
print('EXTERIOR_MANIFEST='+json.dumps({'tiles':TILES,'pixels_per_cell':64,'roof_material_mixes':ROOF_MIXES,'source_atlas_px':[scene.render.resolution_x,scene.render.resolution_y]}))
