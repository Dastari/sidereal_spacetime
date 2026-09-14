"""Reference-led, image-backed finishes for the layered hull review.

Blender entry point: materials(out_dir, finish). All four returned roles have
packed base-color, tangent normal and roughness PNGs. UVs are metric: U=metres,
V=metres/.75. This recipe does not scale geometry, add collision or change the
damage lattice. Detail relief is cosmetic; holes must come from the cell mesh.
"""
from __future__ import annotations

from array import array
import hashlib
import math
from pathlib import Path

ROLE_ORDER = ("inner_skin", "rib", "outer_armor", "fracture")
TEXTURE_SIZE = (512, 384)
TEXTURE_PERIOD_M = (1.0, .75)
FINISHES = {
    "explorer": {
        "label": "Explorer · pale enamel / red service covers",
        "source": "reference/art/faction-ship-1.png",
        "reference": "assets/art-library/assets/faction-ship-1--reinforced-joint/revisions/r000/reference.png",
    },
    "raider": {
        "label": "Salvaged · dark staggered patch plates",
        "source": "reference/art/alien-ship-2.png",
        "reference": "assets/art-library/assets/alien-ship-2--salvaged-armor-closeup/revisions/r000/reference.png",
    },
    "industrial": {
        "label": "Mining · orange cladding / dark service spine",
        "source": "reference/art/faction-ship-2.png",
        "reference": "assets/art-library/assets/faction-ship-2--cargo-module-closeup/revisions/r000/reference.png",
    },
}
_CACHE = {}


def _inside(u, v, x0, y0, x1, y1):
    return x0 < u < x1 and y0 < v < y1


def _bolt(u, v, points, radius=.0075):
    return any((u-x)**2 + (v-y)**2 < radius**2 for x, y in points)


def _surface(finish, role, u, v):
    """Return linear RGB, millimetre-scale relief in metres and roughness."""
    dark = (.065, .080, .105)
    pale = (.64, .67, .72)
    red = (.42, .035, .058)
    orange = (.82, .24, .018)
    silver = (.29, .32, .35)
    height, rough = 0., .46
    if role == "fracture":
        # Newly exposed material is bare, unpainted, unmarked metal. Cell faces
        # supply the actual fracture relief; texture grain never imitates holes.
        grain = .014 * math.sin(590*u + 343*v) * math.sin(823*v - 149*u)
        return tuple(x + grain for x in (.25, .28, .32)), 0., .79
    if role == "rib":
        color = (.115, .14, .17)
        if abs((u % .125)-.0625) < .008:
            color, height = silver, .0008
        return color, height, .55
    if role == "inner_skin":
        color = {"explorer": (.69, .72, .75), "raider": (.33, .37, .40), "industrial": (.59, .56, .46)}[finish]
        if u < .006 or u > .994 or v < .006 or v > .744:
            color, height, rough = dark, -.001, .67
        if _inside(u, v, .74, .54, .90, .64):
            color, height = (.21, .24, .27), -.0005
            if int(u/.014) % 2 == 0:
                color, height = silver, .0005
        if _bolt(u, v, ((.025, .025), (.975, .025), (.025, .725), (.975, .725))):
            color, height = silver, -.001
        return color, height, rough

    if finish == "explorer":
        color = pale
        # Wide access hatch and two unequal stacked service covers.
        if u < .035 or u > .965 or v < .028 or v > .722:
            color, height = dark, -.0015
        if .645 < u < .665 or (.65 < u < .965 and .35 < v < .365):
            color, height = dark, -.0025
        if _inside(u, v, .68, .052, .941, .328):
            color, height = red, .001
        if _inside(u, v, .69, .405, .93, .62):
            color = (.28, .32, .39)
            if int((v-.405)/.032) % 2 == 0:
                color, height = dark, -.002
        if _inside(u, v, .10, .084, .34, .102):
            color = (.018, .48, .61)
        if _inside(u, v, .105, .595, .485, .606):
            color, height = (.37, .40, .44), -.0005
        if _bolt(u, v, ((.065,.065),(.615,.065),(.065,.685),(.615,.685),(.69,.37),(.94,.37),(.69,.69),(.94,.69))):
            color, height = silver, -.0015
    elif finish == "raider":
        color = dark
        # Asymmetric broad patch, lower inset plate, narrow pale repair strap.
        plate = .15 < u < .91 and .10 < v < .68 and u + .72*v > .36
        if plate:
            color, height = (.16, .185, .215), .0016
        if _inside(u, v, .43, .105, .895, .30):
            color, height = (.30, .105, .075), .0026
        if _inside(u, v, .30, .11, .36, .67):
            color, height = (.42, .39, .34), .003
        if _inside(u, v, .025, .12, .095, .61):
            color, height = (.028, .033, .043), -.002
            if int(v/.035) % 2 == 0:
                color, height = (.12, .14, .165), .001
        if _bolt(u, v, ((.19,.25),(.19,.62),(.39,.62),(.86,.62),(.86,.34),(.48,.15),(.85,.15),(.33,.20),(.33,.55))):
            color, height = silver, .001
        # Sparse deterministic chipped paint along patch edges, not damage.
        chip = int(u*417) * 73 + int(v*417) * 131
        if plate and (u < .166 or u > .894 or v < .114 or v > .666) and chip % 13 < 3:
            color, rough = (.35, .28, .21), .80
        rough = max(rough, .62)
    else:
        color = orange
        # Twin cladding doors, dark full-height centre spine, lower safety band.
        if u < .045 or u > .955 or .44 < u < .56 or v < .026 or v > .724:
            color, height = dark, -.0018
        if abs(u-.23) < .004 or abs(u-.77) < .004:
            color, height = (.35, .09, .008), -.0012
        if .042 < v < .092 and .055 < u < .945:
            color = (.035,.040,.046) if int((u+v)/.055) % 2 == 0 else (.86,.52,.025)
        if _inside(u, v, .465, .49, .535, .62):
            color, height = (.02, .10, .15), -.002
            if .52 < v < .545:
                color = (.025,.40,.52)
        if _inside(u, v, .69, .46, .86, .59):
            color, height = (.20,.235,.28), .0008
        if _bolt(u, v, ((.07,.12),(.41,.12),(.59,.12),(.93,.12),(.07,.68),(.41,.68),(.59,.68),(.93,.68))):
            color, height = silver, -.001
        if .15 < v < .37 and (.375 < u < .412 or .588 < u < .625):
            color, height = (.20, .225, .25), .0015
        rough = .49
    grain = 1 + .009 * math.sin(717*u + 449*v)
    return tuple(x*grain for x in color), height, rough


def materials(out_dir, finish):
    """Create packed exportable Blender materials; ordered as ROLE_ORDER.

    out_dir is the revision output root; maps go in textures/<finish>/. Cache
    keys include the absolute output directory, so separate revisions do not
    reuse mutable image datablocks or overwrite each other's recipe outputs.
    """
    import bpy
    if finish not in FINISHES:
        raise ValueError(f"Unknown finish {finish!r}; expected {tuple(FINISHES)}")
    root = Path(out_dir).resolve()
    key = (str(root), finish)
    if key in _CACHE:
        return _CACHE[key]
    target = root / "textures" / finish
    target.mkdir(parents=True, exist_ok=True)
    tag = hashlib.sha256(str(root).encode()).hexdigest()[:8]
    w, h = TEXTURE_SIZE
    result = []
    for role in ROLE_ORDER:
        color, height, rough = array('f'), array('f'), array('f')
        for iy in range(h):
            for ix in range(w):
                c, z, r = _surface(finish, role, (ix+.5)/w, (iy+.5)/h*.75)
                color.extend((*c, 1.))
                height.append(z)
                rough.extend((r, r, r, 1.))
        normal = array('f')
        for iy in range(h):
            for ix in range(w):
                dx = (height[iy*w+(ix+1)%w]-height[iy*w+(ix-1)%w])/(2./w)
                dy = (height[((iy+1)%h)*w+ix]-height[((iy-1)%h)*w+ix])/(1.5/h)
                inv = 1/math.sqrt(dx*dx+dy*dy+1)
                normal.extend((.5-.5*dx*inv, .5-.5*dy*inv, .5+.5*inv, 1.))
        images = []
        for kind, pixels in (("basecolor",color),("normal",normal),("roughness",rough)):
            image = bpy.data.images.new(f"Layered-{tag}-{finish}-{role}-{kind}", width=w, height=h, alpha=True)
            image.colorspace_settings.name = "sRGB" if kind == "basecolor" else "Non-Color"
            image.pixels.foreach_set(pixels)
            image.filepath_raw = str(target/f"{role}-{kind}.png")
            image.file_format = "PNG"
            image.save()
            image.pack()
            images.append(image)
        mat = bpy.data.materials.new(f"Layered-{tag}-{finish}-{role}")
        mat.use_nodes = True
        mat["finish"] = finish
        mat["layer_role"] = role
        mat["texture_period_m"] = TEXTURE_PERIOD_M
        mat["cosmetic_relief_only"] = True
        p = mat.node_tree.nodes.get("Principled BSDF")
        p.inputs["Metallic"].default_value = .48 if role in ("rib", "fracture") else .12
        nodes = [mat.node_tree.nodes.new("ShaderNodeTexImage") for _ in images]
        for node, img in zip(nodes, images):
            node.image = img
            node.extension = "REPEAT"
            node.interpolation = "Linear"
        nm = mat.node_tree.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 1.
        links = mat.node_tree.links
        links.new(nodes[0].outputs["Color"], p.inputs["Base Color"])
        links.new(nodes[1].outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], p.inputs["Normal"])
        links.new(nodes[2].outputs["Color"], p.inputs["Roughness"])
        result.append(mat)
    _CACHE[key] = result
    return result
