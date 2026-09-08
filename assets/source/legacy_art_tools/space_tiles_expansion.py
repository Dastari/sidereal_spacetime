"""Angled exterior modules, machinery, freight and animated airlock families."""


def prism(name, points, z, depth, color):
    ox, oy = CURRENT["origin"]
    count = len(points)
    verts = [(x + ox, y + oy, z + dz) for dz in (-depth / 2, depth / 2) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new("MESH-" + name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("GEO-" + TILES[-1]["name"] + "-" + name, mesh)
    CURRENT["collection"].objects.link(obj)
    obj.data.materials.append(material(color))
    return obj


def beam(name, a, b, z, width, depth, color):
    dx, dy = b[0] - a[0], b[1] - a[1]
    return box(name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z,
               math.hypot(dx, dy), width, depth, color, .015, math.atan2(dy, dx))


def angled_panel(points, variant):
    prism("structural-web", points, .10, .20, "dark")
    inset = [(x * .94, y * .94) for x, y in points]
    prism("armor-face", inset, .27, .16, "steel")
    prism("raised-inset", [(x * .80, y * .80) for x, y in points], .37, .04, "panel")
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        diagonal = abs(a[0] - b[0]) > .01 and abs(a[1] - b[1]) > .01
        if diagonal:
            beam("armored-slope", a, b, .34, .13, .17, "edge")
            beam("faction-stripe", (a[0] * .86, a[1] * .86),
                 (b[0] * .86, b[1] * .86), .42, .055, .035, "amber")
        cylinder("rivet", a[0] * .70, a[1] * .70, .43, .045, .02, "dark", 8)
    if variant == "vented":
        # Place vents around the polygon centroid, always inside the inset.
        cx = sum(p[0] for p in points) / len(points)
        cy = sum(p[1] for p in points) / len(points)
        for i in range(3):
            box("vent", cx, cy + (i - 1) * .14, .43, .36, .05, .025, "seam", 0)


SHAPES = [
    ("diagonal_45", (1, 1), [(-1, -1), (1, -1), (-1, 1)], ["S", "W"]),
    ("chamfer_45", (1, 1), [(-1, -1), (1, -1), (1, 0), (0, 1), (-1, 1)], ["S", "W"]),
    ("slope_shallow", (2, 1), [(-2, -1), (2, -1), (-2, 1)], ["S", "W"]),
    ("slope_steep", (1, 2), [(-1, -2), (1, -2), (-1, 2)], ["S", "W"]),
    ("chamfer_large", (2, 2), [(-2, -2), (2, -2), (2, 0), (0, 2), (-2, 2)], ["S", "W"]),
    ("bow_point", (1, 2), [(-1, -2), (1, -2), (.8, .8), (0, 2), (-.8, .8)], ["S"]),
    ("bow_broad", (2, 2), [(-2, -2), (2, -2), (2, .4), (.75, 2), (-.75, 2), (-2, .4)], ["S"]),
    ("wing_swept", (2, 2), [(-2, -2), (-.8, -2), (2, 1), (2, 2), (-2, .4)], ["W"]),
    ("notch_inner", (2, 2), [(-2, -2), (2, -2), (2, 0), (0, 0), (0, 2), (-2, 2)], ["S", "W"]),
    ("nacelle_shoulder", (3, 2), [(-3, -2), (3, -2), (3, 0), (1, 2), (-1, 2), (-3, 0)], ["S"]),
]
for shape, size, points, edges in list(SHAPES):
    if shape in ("slope_shallow", "slope_steep", "wing_swept"):
        SHAPES.append((shape + "_mirrored", size, list(reversed([(-x, y) for x, y in points])),
                       [{"E": "W", "W": "E"}.get(edge, edge) for edge in edges]))
for shape, size, points, edges in SHAPES:
    for facing_index, facing in enumerate(("N", "E", "S", "W")):
        angle = -facing_index * math.pi / 2
        rotated = [(round(x * math.cos(angle) - y * math.sin(angle), 8),
                    round(x * math.sin(angle) + y * math.cos(angle), 8)) for x, y in points]
        rotated_size = size if facing_index % 2 == 0 else (size[1], size[0])
        directions = ["N", "E", "S", "W"]
        attach_faces = [directions[(directions.index(edge) + facing_index) % 4] for edge in edges]
        begin("armor_" + shape + "_" + facing, "exterior", size=rotated_size,
              family="angled_armor", orientation=facing,
              collision_polygon_local_m=rotated, attach_edges=attach_faces,
              construction_note="Conservative cell footprint; polygon clips visual/physical outline; validate edge spans before gameplay publication")
        angled_panel(rotated, "vented" if shape in ("wing_swept", "bow_broad") else "plain")


def housing(width, height):
    box("base", 0, 0, .08, width - .1, height - .1, .16, "seam", .08)
    box("casing", 0, 0, .28, width - .28, height - .28, .40, "steel", .12)
    for x in (-(width / 2 - .27), width / 2 - .27):
        for y in (-(height / 2 - .27), height / 2 - .27):
            cylinder("anchor", x, y, .52, .07, .05, "dark", 8)


def power_unit(name, size, color, rings):
    begin(name, "equipment", size=size, family="power_and_shields")
    w, h = size[0] * CELL, size[1] * CELL
    housing(w, h)
    radius = min(w, h) * .33
    cylinder("generator-ring", 0, .12, .6, radius, .25, "dark", 16)
    cylinder("containment", 0, .12, .77, radius * .76, .15, "edge", 16)
    cylinder("field-core", 0, .12, .90, radius * .56, .10, color, 16)
    cylinder("core-cap", 0, .12, .98, radius * .25, .08, "light", 12)
    for i in range(rings):
        a = i * math.tau / rings
        box("coil", math.sin(a) * radius, .12 + math.cos(a) * radius, .85,
            .17, radius * .43, .18, "amber" if color == "cyan" else "cyan", .02, -a)
    for x in (-w * .31, w * .31):
        for j in range(max(3, size[1] * 3)):
            y = -h * .33 + j * .26
            box("cooler", x, y, .53, .3, .075, .1, "dark", .01)


for item in (("generator_fission_small", (1, 1), "amber", 4),
             ("generator_fusion_medium", (2, 2), "cyan", 8),
             ("generator_fusion_large", (2, 3), "cyan", 12),
             ("generator_auxiliary", (1, 2), "yellow", 4),
             ("shield_generator_small", (1, 1), "blue", 6),
             ("shield_generator_medium", (2, 2), "cyan", 6),
             ("shield_generator_large", (3, 3), "blue", 12),
             ("jump_core", (2, 2), "cyan", 6)):
    power_unit(*item)


def engine(name, size, nozzles, color):
    begin(name, "equipment", size=size, family="engines", orientation="N",
          attach_edges=["N"], exhaust_direction="S", exhaust_socket_local_m=[0, -size[1], .4])
    w, h = size[0] * CELL, size[1] * CELL
    housing(w, h)
    box("drive-block", 0, h * .15, .57, w * .68, h * .56, .35, "panel", .10)
    for x in (-w * .31, w * .31):
        for i in range(size[1] * 4):
            box("heat-sink", x, -.1 + i * .23 - h * .18, .70, .22, .10, .12, "dark", .015)
    for i in range(nozzles):
        x = (i - (nozzles - 1) / 2) * w * .68 / nozzles
        nw = w * .58 / nozzles
        box("nozzle", x, -h * .33, .34, nw, h * .29, .50, "dark", .05)
        box("drive-glow", x, -h * .40, .64, nw * .72, .12, .04, color, .015)
        for side in (-1, 1):
            box("nozzle-armour", x + side * nw * .44, -h * .32, .65,
                .12, h * .32, .15, "edge", .02)
    box("drive-stripe", 0, h * .36, .80, w * .55, .09, .03, "amber", 0)


for item in (("engine_chemical_small", (1, 2), 1, "amber"),
             ("engine_chemical_medium", (2, 2), 2, "amber"),
             ("engine_chemical_large", (2, 3), 3, "amber"),
             ("engine_ion", (1, 2), 1, "cyan"),
             ("engine_plasma", (2, 3), 2, "cyan"),
             ("engine_maneuvering", (1, 1), 2, "cyan"),
             ("engine_vector", (2, 2), 1, "blue")):
    engine(*item)
engine("engine_frigate_nacelle", (3, 3), 2, "cyan")


def lathe_y(name, profile, z, color, segments=20):
    """Revolved chamber/nozzle in the Y direction; real mesh with an open bell."""
    ox, oy = CURRENT["origin"]
    vertices = [(ox + radius * math.cos(i * math.tau / segments), oy + y,
                 z + radius * math.sin(i * math.tau / segments))
                for y, radius in profile for i in range(segments)]
    faces = [(ring * segments + i, ring * segments + (i + 1) % segments,
              (ring + 1) * segments + (i + 1) % segments, (ring + 1) * segments + i)
             for ring in range(len(profile) - 1) for i in range(segments)]
    mesh = bpy.data.meshes.new("MESH-" + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("GEO-" + TILES[-1]["name"] + "-" + name, mesh)
    CURRENT["collection"].objects.link(obj)
    obj.data.materials.append(material(color))
    return obj


def rocket_pod(name, size, technology):
    begin(name, "exterior", size=size, family="propulsion_pod", exhaust_face="S")
    width, length = size[0] * CELL, size[1] * CELL
    half = length / 2
    radius = width * .22
    z = radius + .15
    glow = "amber" if technology == "chemical" else "cyan" if technology == "fusion" else "blue"
    box("structural-socket", 0, half * .70, .15, width * .65, length * .25, .22, "edge", .07)
    lathe_y("pressure-chamber", [(half*.9, 0), (half*.86, radius*.65), (half*.64, radius),
                                 (-half*.13, radius), (-half*.30, radius*.45)], z, "steel")
    for y in (half*.61, half*.49, half*.05):
        lathe_y("reinforcement-band", [(y, radius*1.06), (y-length*.018, radius*1.06)], z, "edge")
    if technology == "chemical":
        # Bell contracts at the throat, expands toward the nozzle; dark inner wall remains visible.
        lathe_y("bell", [(-half*.25,radius*.42),(-half*.40,radius*.44),(-half*.59,radius*.67),
                         (-half*.89,radius*1.22),(-half*.94,radius*1.25),(-half*.94,radius*1.05),
                         (-half*.78,radius*.89),(-half*.55,radius*.44)], z, "dark")
        for y, r in ((-.48,.53),(-.62,.76),(-.78,1.03),(-.9,1.25)):
            lathe_y("cooling-ring", [(half*y,radius*r), (half*y-length*.012,radius*r)], z, "edge")
    else:
        for i in range(4):
            y = -half*.18-i*length*.09
            r = radius*(.74+i*.15)
            lathe_y("field-coil", [(y,r),(y-length*.036,r)], z, "edge")
            lathe_y("coil-emitter", [(y-length*.010,r*1.015),(y-length*.018,r*1.015)], z, glow)
        lathe_y("magnetic-bell", [(-half*.76,radius*.8),(-half*.94,radius*1.2),
                                  (-half*.94,radius*.95),(-half*.84,radius*.75)], z, "dark")
    for side in (-1, 1):
        x = side * width * .31
        box("feed-pipe", x, half*.27, z, width*.07, length*.57, width*.07, "amber", .035)
        for y in (half*.56, -half*.06):
            box("pipe-clamp", x, y, z+.07, width*.11, length*.045, .10, "edge", .02)
        box("control-pack", x, half*.22, z+.08, width*.16, length*.18, .22, "panel", .045)
        box("status-light", x, half*.23, z+.205, width*.07, length*.055, .025, glow, .01)
    box("service-spine", 0, half*.36, z+radius*.96, width*.13, length*.30, .11, "dark", .04)
    for y in (half*.36,half*.48):
        box("warning-stripe", 0,y,z+radius*1.03,width*.12,length*.025,.025,"amber",0)


rocket_pod("rocket_pod_small", (1, 2), "chemical")
rocket_pod("rocket_pod_medium", (2, 3), "chemical")
rocket_pod("rocket_pod_heavy", (3, 4), "chemical")
rocket_pod("fusion_drive_pod", (2, 3), "fusion")
rocket_pod("ion_drive_pod", (1, 2), "ion")

# Compact external attitude-control pod. +Y thrust, exhaust -Y; fits one socket
# while occupying much less than a full deck tile visually.
begin("thruster_side_micro", "exterior", size=(1, 1), family="propulsion")
box("mount-foot", 0, .54, .16, .70, .46, .20, "edge", .035)
box("feed-line", 0, .22, .23, .18, .55, .16, "amber", .025)
box("pod-shell", 0, -.10, .29, .56, .68, .42, "steel", .055)
for x in (-.19, .19):
    box("nozzle-shroud", x, -.48, .26, .20, .26, .32, "dark", .025)
    box("nozzle-mouth", x, -.60, .28, .13, .055, .23, "cyan", .01)
    cylinder("mount-bolt", x, .55, .28, .045, .03, "dark", 8)


def freight(name, size, color, style):
    begin(name, "equipment", size=size, family="cargo_and_trade", contents_kind=style)
    w, h = size[0] * CELL, size[1] * CELL
    housing(w, h)
    box("container", 0, 0, .62, w * .80, h * .84, .55, color, .10)
    for x in (-w * .27, w * .27):
        box("strap", x, 0, .95, .14, h * .88, .12, "dark", .02)
    for y in (-h * .31, h * .31):
        box("cross-strap", 0, y, .95, w * .87, .12, .12, "steel", .02)
    box("label", 0, .14, .97, min(.45, w * .2), .35, .03, "light", 0)
    if style in ("medical", "electronics", "secure"):
        box("category-mark", 0, .14, 1.0, .29, .065, .02,
            "red" if style == "medical" else "cyan", 0)
        if style == "medical":
            box("category-mark", 0, .14, 1.0, .065, .29, .02, "red", 0)
    else:
        for i in range(3):
            box("barcode", -.13 + i * .10, .14, 1.0, .03, .20, .02, "dark", 0)
    if size[1] > 1:
        for i in range(size[1] * 4):
            y = -h * .28 + i * .23
            for x in (-w * .13, w * .13):
                box("corrugation", x, y, .93, .14, .06, .06, "edge", .01)


for item in (("crate_supplies_small", (1, 1), "amber", "supplies"),
             ("crate_food", (1, 1), "green", "food"),
             ("crate_medical", (1, 1), "light", "medical"),
             ("crate_electronics", (1, 1), "blue", "electronics"),
             ("crate_secure", (1, 1), "dark", "secure"),
             ("crate_luxury", (1, 1), "red", "luxury"),
             ("crate_munitions", (1, 1), "green", "munitions"),
             ("cargo_bulk_medium", (2, 2), "amber", "bulk"),
             ("cargo_refrigerated", (1, 2), "light", "food"),
             ("cargo_freight_long", (1, 3), "blue", "freight"),
             ("cargo_freight_large", (2, 3), "red", "freight"),
             ("cargo_secure_large", (2, 2), "dark", "secure")):
    freight(*item)


def fluid(name, size, color, count):
    begin(name, "equipment", size=size, family="fluids_and_fuel")
    w, h = size[0] * CELL, size[1] * CELL
    housing(w, h)
    for i in range(count):
        x = (i - (count - 1) / 2) * w * .80 / count
        bw = min(w * .70 / count, h * .72)
        box("tank", x, 0, .62, bw, h * .80, .65, color, min(.22, bw * .22))
        for y in (-h * .25, h * .25):
            box("tank-band", x, y, .98, bw + .10, .14, .12, "edge", .035)
        cylinder("cap", x, h * .18, 1.04, min(.17, bw * .24), .10, "dark", 12)
        box("gauge", x, -h * .10, 1.0, .07, h * .20, .025, "cyan", .01)


for item in (("fluid_drum_small", (1, 1), "steel", 1),
             ("fluid_drum_pair", (1, 1), "amber", 2),
             ("fluid_water_tank", (1, 2), "blue", 1),
             ("fluid_coolant_tank", (2, 2), "green", 2),
             ("fluid_chemical_tank", (2, 3), "yellow", 2),
             ("fluid_pallet_three", (3, 1), "steel", 3),
             ("fuel_pod_small", (1, 1), "amber", 1),
             ("fuel_pod_medium", (1, 2), "amber", 1),
             ("fuel_pod_large", (2, 3), "amber", 2),
             ("fuel_cryogenic", (2, 2), "light", 2),
             ("gas_canister_rack", (2, 1), "red", 4)):
    fluid(*item)

for name, color in (("iron", "steel"), ("copper", "amber"), ("crystal", "cyan"),
                    ("ice", "light"), ("isotope", "green"), ("precious_metal", "yellow")):
    begin("resource_" + name, "equipment", family="resources")
    box("pallet", 0, 0, .1, 1.78, 1.78, .2, "dark", .06)
    for i, (x, y, radius) in enumerate(((-.46, -.42, .32), (.30, -.34, .35),
                                       (-.28, .30, .38), (.40, .40, .31), (.08, .05, .37))):
        cylinder("raw-material", x, y, .40 + i * .025, radius, .45, color, 5 if name == "crystal" else 7)

for size, family in (((1, 1), "airlock_single"), ((2, 1), "airlock_double")):
    for frame in range(8):
        begin(family + "_" + str(frame), "door", frame == 7, size=size,
              family=family, animation_frame=frame, duration_ms=90,
              anchor_kind="cell_edge", preview_passable=frame == 7)
        w = size[0] * CELL
        for x in (-(w / 2 - .16), w / 2 - .16):
            box("door-pillar", x, 0, .35, .30, 1.10, .70, "steel", .05)
            box("lock-light", x, -.20, .75, .10, .26, .04, "cyan" if frame == 7 else "amber", .015)
        box("threshold", 0, 0, .03, w, .68, .06, "dark", 0)
        travel = w / 2 - .30
        leaf = travel * (1 - frame / 7)
        if frame < 7:
            for side in (-1, 1):
                x = side * (travel - leaf / 2)
                box("pressure-leaf", x, 0, .32, leaf, .60, .56, "panel", .02)
                box("warning-band", x, -.12, .63, leaf, .10, .03, "amber", 0)
                box("seal", side * (travel - leaf), 0, .66, .025, .59, .04, "seam", 0)

for name, size in (("radiator", (1, 3)), ("armor_plate_long", (1, 2)),
                   ("armor_plate_heavy", (2, 2)), ("spine_connector", (1, 3))):
    begin(name, "exterior", size=size, family="exterior_connectors", attach_edges=["N", "E", "S", "W"])
    w, h = size[0] * CELL, size[1] * CELL
    housing(w, h)
    box("outer-plate", 0, 0, .53, w * .70, h * .84, .12, "panel", .06)
    for i in range(size[1] * 4):
        box("panel-divider", 0, -h * .35 + i * .32, .63, w * .64, .06, .05, "dark", 0)
    for x in (-w * .40, w * .40):
        box("accent-rail", x, 0, .56, .065, h * .82, .08, "amber", 0)

begin("bridge_canopy", "equipment", size=(2, 3), family="command")
housing(4, 6)
prism("bridge-shell", [(-1.75,-2.6),(1.75,-2.6),(1.6,1.2),(.8,2.65),(-.8,2.65),(-1.6,1.2)], .70, .40, "edge")
prism("canopy", [(-1.42,-.7),(1.42,-.7),(1.25,1.0),(.60,2.20),(-.60,2.20),(-1.25,1.0)], .95, .16, "screen")
beam("canopy-spine", (0,-.7),(0,2.2), 1.06, .10, .08, "steel")
for y in (.10, .92):
    beam("canopy-rib", (-1.16,y),(1.16,y), 1.06, .10, .08, "steel")
for x in (-.64,.64):
    box("glass-glint", x,.7,1.10,.055,1.3,.02,"cyan",0)
box("command-base",0,-1.70,.98,2.70,1.4,.18,"panel",.08)
for x in (-.8,0,.8):
    box("command-vent",x,-1.65,1.11,.20,.75,.04,"dark",.02)

for name, stripe_side in (("armor_backbone", 0), ("armor_flank_port", -1), ("armor_flank_starboard", 1)):
    begin(name, "exterior", size=(2, 3), family="exterior_panels", attach_edges=["N","E","S","W"])
    housing(4,6)
    prism("raised-armour", [(-1.75,-2.70),(1.75,-2.70),(1.75,2.20),(1.20,2.70),(-1.20,2.70),(-1.75,2.20)], .62,.28,"panel")
    box("recess-channel",0,0,.79,.48,4.65,.035,"dark",.02)
    for y in (-1.8,-1.2,-.6,0,.6,1.2,1.8):
        box("armour-louvre",0,y,.83,.68,.14,.06,"steel",.02)
    if stripe_side:
        box("fleet-band",stripe_side*1.25,0,.80,.30,4.70,.035,"amber",.01)
        box("fleet-band-border",stripe_side*1.47,0,.80,.06,4.70,.04,"edge",0)
    else:
        for x in (-1.1,1.1):
            box("spine-runner",x,0,.81,.12,4.90,.05,"edge",.02)

begin("turret_heavy", "equipment", size=(2,2), family="mounts", orientation="N",
      muzzle_sockets_local_m=[[-.50,1.85,.85],[.50,1.85,.85]])
housing(4,4)
cylinder("armoured-bearing",0,-.3,.60,1.42,.32,"edge",16)
cylinder("turntable",0,-.3,.82,1.13,.22,"dark",16)
box("turret-head",0,-.5,1.05,1.85,1.70,.40,"steel",.13)
for x in (-.50,.50):
    box("barrel",x,.8,1.02,.28,2.1,.22,"dark",.025)
    box("muzzle-collar",x,1.74,1.05,.39,.30,.28,"edge",.025)
box("identification",0,-.55,1.29,.65,.12,.025,"amber",0)
