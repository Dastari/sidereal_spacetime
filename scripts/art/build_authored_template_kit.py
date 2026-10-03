#!/usr/bin/env python3
"""Derive reusable native meshes; run with blender -b --python THIS -- --output DIR.

Only the verified catalogue archive is accepted as upstream. No live study access.
Piece axes are authored Z-up; the GLB exporter converts them to native glTF Y-up.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import sys
from pathlib import Path

ARCHIVE = Path("/root/sidereal-art-archive/wayfarer-study-catalogue-20261003")
PINS = {
    "export": "9afe368702b81891905165fe2adef6c860f23b0d3ce5672e5bf1b6ad93a4d855",
    "export_tiles": "c8ecd4383ceee5f10fd409207d135af88c706245fd648abd492c3773e07d648a",
}
SHAPES = ["square", *[f"slope{r}" for r in range(1, 5)],
          *[f"arc{r}{c}" for c in ("", "c") for r in range(1, 5)]]
REVISION = "template-authored-r001"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def shape_polygon(shape: str) -> list[tuple[float, float]]:
    """Exact construction grammar: four snapped arc segments per radius."""
    if shape == "square":
        return [(0, 0), (1, 0), (1, 1), (0, 1)]
    if shape.startswith("slope"):
        return [(0, 0), (int(shape[5:]), 0), (0, 1)]
    match = re.fullmatch(r"arc([1-4])(c?)", shape)
    if not match:
        raise ValueError(f"Unknown shape {shape}")
    r = int(match[1])
    arc = [(round(r * math.cos(i * math.pi / (8 * r)), 9),
            round(r * math.sin(i * math.pi / (8 * r)), 9))
           for i in range(4 * r + 1)]
    return [(r, 0), (r, r), (0, r), *list(reversed(arc))[1:-1]] if match[2] else [(0, 0), *arc]


def read_glb(path: Path) -> tuple[dict, list[tuple[int, bytes]]]:
    data = path.read_bytes()
    if struct.unpack_from("<III", data) != (0x46546C67, 2, len(data)):
        raise ValueError(f"Invalid GLB {path}")
    chunks = []
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        chunks.append((kind, data[offset + 8:offset + 8 + size]))
        offset += size + 8
    if offset != len(data) or chunks[0][0] != 0x4E4F534A:
        raise ValueError("Invalid GLB chunks")
    return json.loads(chunks[0][1]), chunks[1:]


def write_glb(path: Path, doc: dict, chunks: list[tuple[int, bytes]]) -> None:
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    payload = b"".join(struct.pack("<II", len(content), kind) + content
                       for kind, content in [(0x4E4F534A, encoded), *chunks])
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, len(payload) + 12) + payload)


def canonical_materials(doc: dict, names: dict[str, str], palette: dict) -> dict[str, str]:
    """Unique runtime names; coalesce only complete equal native definitions.

    Texture references remain part of identity. Distinct images/parameters never
    merge merely because two source objects called their material `secondary`.
    """
    materials, identities, used_names, remap, aliases = [], {}, {}, {}, {}
    for old_index, material in enumerate(doc.get("materials", [])):
        blender_name = material["name"]
        base = names.get(blender_name, blender_name)
        entry = palette.get(base)
        if not entry:
            raise ValueError(f"Native material lacks palette family: {base}")
        material.setdefault("extras", {})["family"] = entry["family"]
        material["extras"]["sourceSlotName"] = base
        definition = {key: value for key, value in material.items() if key != "name"}
        identity = json.dumps(definition, sort_keys=True, separators=(",", ":"))
        if identity in identities:
            index = identities[identity]
        else:
            suffix = hashlib.sha256(identity.encode()).hexdigest()[:12]
            name = base if base not in used_names else f"{base}@{suffix}"
            if name in used_names and used_names[name] != identity:
                raise ValueError("Native material alias collision")
            material["name"] = name
            if name != base:
                palette[name] = {**entry, "sourceSlotName": base}
            index = len(materials)
            materials.append(material)
            identities[identity] = index
            used_names[name] = identity
        remap[old_index] = index
        aliases[blender_name] = materials[index]["name"]
    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            if "material" in primitive:
                primitive["material"] = remap[primitive["material"]]
    doc["materials"] = materials
    return aliases


class Builder:
    def __init__(self, output: Path):
        import bpy
        self.bpy = bpy
        self.output = output
        self.output.mkdir(parents=True, exist_ok=True)
        self.manifests = {}
        for folder, pin in PINS.items():
            path = ARCHIVE / folder / "manifest.json"
            if sha(path) != pin:
                raise ValueError(f"Archive manifest pin mismatch: {folder}")
            self.manifests[folder] = json.loads(path.read_text())
        self.palette = self.manifests["export_tiles"]["palette"]
        self.palette.update(self.manifests["export"]["palette"])
        self.cache = {}
        self.pieces = []
        self.lights = []
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)

    def source(self, folder: str, piece: str):
        """Preserve native materials and every UV channel; bake source node once."""
        import bpy
        if (folder, piece) not in self.cache:
            manifest = self.manifests[folder]
            item = next(x for x in manifest["pieces"] + manifest["unique"] if x["id"] == piece)
            path = ARCHIVE / folder / item["file"]
            if sha(path) != item["sha256"]:
                raise ValueError(f"Source mesh pin mismatch: {piece}")
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(path))
            meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
            if len(meshes) != 1:
                raise ValueError(f"Expected single native mesh: {piece}")
            obj = meshes[0]
            obj.data.transform(obj.matrix_world)
            from mathutils import Matrix
            obj.matrix_world = Matrix.Identity(4)
            obj.name = "GEO-source-" + piece
            obj.hide_render = True
            obj.hide_viewport = True
            # glTF import may append Blender duplicate-name suffixes. Record actual
            # source slot names from the GLB, not Blender's mutable datablock names.
            glb, _ = read_glb(path)
            names = [m["name"] for m in glb.get("materials", [])]
            for index, material in enumerate(obj.data.materials):
                material["authored_source_name"] = names[index]
            self.cache[folder, piece] = (obj, item)
        source, item = self.cache[folder, piece]
        obj = source.copy()
        obj.data = source.data.copy()
        obj.hide_render = False
        obj.hide_viewport = False
        obj.name = "GEO-derived-" + piece
        self.bpy.context.scene.collection.objects.link(obj)
        return obj, {"collection": folder, "id": piece, "file": item["file"], "sha256": item["sha256"]}

    def copy(self, obj):
        new = obj.copy()
        new.data = obj.data.copy()
        new.hide_render = False
        new.hide_viewport = False
        self.bpy.context.scene.collection.objects.link(new)
        return new

    def join(self, objs):
        bpy = self.bpy
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        return objs[0]

    def prism(self, polygon, z0, z1, material=None):
        bpy = self.bpy
        n = len(polygon)
        vertices = [(x, y, z) for z in (z0, z1) for x, y in polygon]
        faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
        faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
        mesh = bpy.data.meshes.new("GEO-prism")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new("GEO-prism", mesh)
        bpy.context.scene.collection.objects.link(obj)
        if material:
            mesh.materials.append(material)
        return obj

    def clip(self, obj, polygon):
        """Exact solid clipping closes both convex and reflex cut surfaces."""
        import bmesh
        turns = []
        for i, a in enumerate(polygon):
            b, c = polygon[(i + 1) % len(polygon)], polygon[(i + 2) % len(polygon)]
            turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
        if min(turns) >= -1e-9:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
            for i, a in enumerate(polygon):
                b = polygon[(i + 1) % len(polygon)]
                cut = bmesh.ops.bisect_plane(
                    bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=1e-7,
                    plane_co=(a[0], a[1], 0), plane_no=(a[1] - b[1], b[0] - a[0], 0),
                    clear_inner=True)
                edges = [e for e in cut["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
                if edges:
                    bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            bm.to_mesh(obj.data)
            bm.free()
            return
        bpy = self.bpy
        cutter = self.prism(polygon, -5, 5)
        modifier = obj.modifiers.new("Exact grammar footprint", "BOOLEAN")
        modifier.operation = "INTERSECT"
        modifier.solver = "EXACT"
        modifier.use_self = True
        modifier.use_hole_tolerant = True
        modifier.object = cutter
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    def cleanup(self, obj, *, close=True):
        """Close cut loops and reject non-finite/zero-area triangles at export."""
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-7)
        if close:
            boundary = [e for e in bm.edges if e.is_boundary]
            if boundary:
                bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        for edge in bm.edges:
            if edge.is_manifold and edge.calc_face_angle() > .7:
                edge.smooth = False
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bad = [f for f in bm.faces if f.calc_area() < 1e-14]
        if bad:
            bmesh.ops.delete(bm, geom=bad, context="FACES")
        if any(not math.isfinite(x) for v in bm.verts for x in v.co):
            raise ValueError("Non-finite derived vertex")
        open_edges = sum(e.is_boundary for e in bm.edges)
        bm.to_mesh(obj.data)
        bm.free()
        if obj.data.has_custom_normals:
            # Source split normals refer to its old vertex order/shape. Rebuild
            # them from retained face smoothing plus sharp molded edges after edits.
            self.bpy.context.view_layer.objects.active = obj
            self.bpy.ops.mesh.customdata_custom_splitnormals_clear()
        obj.data.update()
        return open_edges

    def surface(self, shape, source_id, folder, z_offset, finish, family):
        polygon = shape_polygon(shape)
        width = math.ceil(max(p[0] for p in polygon))
        height = math.ceil(max(p[1] for p in polygon))
        native, provenance = self.source(folder, source_id)
        # Repair existing open source trim loops before the footprint boolean.
        self.cleanup(native)
        instances = []
        for y in range(height):
            for x in range(width):
                obj = self.copy(native)
                for v in obj.data.vertices:
                    v.co.x += x
                    v.co.y += y
                    v.co.z -= z_offset
                instances.append(obj)
        self.bpy.data.objects.remove(native, do_unlink=True)
        obj = self.join(instances)
        if shape != "square":
            self.clip(obj, polygon)
        # Continuous dark substrate reaches the exact grammar border; inset native
        # plate/grate leaves deliberate source seams rather than unsupported cracks.
        material = next((m for m in obj.data.materials
                         if m.get("authored_source_name", "") in ("deck_dark", "dark")), obj.data.materials[0])
        # Backing overlaps deeply but avoids exactly coplanar source bottom faces;
        # welding coincident closed shells would turn their caps non-manifold.
        low = min(v.co.z for v in obj.data.vertices) - .003
        backing = self.prism(polygon, low, low + .018, material)
        obj = self.join([obj, backing])
        self.emit(f"{family}.{shape}.{finish}", obj, [provenance],
                  {"family": family, "shape": shape, "finish": finish,
                   "operation": "native unit repetition; exact grammar polygon solid clip; closed dark border backing",
                   "polygon": polygon, "topDatum": 0})

    def straight_hull(self, source_id, variant, inner_id):
        obj, provenance = self.source("export_tiles", source_id)
        lower = min(v.co.z for v in obj.data.vertices)
        upper = max(v.co.z for v in obj.data.vertices)
        width = max(v.co.x for v in obj.data.vertices)
        if width > 1.000001:
            # Extract one metre of a native two-metre seed, preserving feature size
            # rather than squeezing twice the panel detail into a one-metre bay.
            self.cleanup(obj)
            self.clip(obj, [(0, -2), (1, -2), (1, 2), (0, 2)])
        for v in obj.data.vertices:
            if v.co.y < 0:
                v.co.y *= .20
            v.co.z = (v.co.z - lower) / (upper - lower)
        inner, inner_source = self.source("export", inner_id)
        iymin = min(v.co.y for v in inner.data.vertices)
        iymax = max(v.co.y for v in inner.data.vertices)
        izmax = max(v.co.z for v in inner.data.vertices)
        for v in inner.data.vertices:
            v.co.y = -.20 - .05 * (iymax - v.co.y) / (iymax - iymin)
            v.co.z /= izmax
        obj = self.join([obj, inner])
        self.cleanup(obj)
        sources = [provenance, inner_source]
        self.emit(f"hull.straight.{variant}", obj, sources,
                  {"family": "hull", "operation": "native facade; inward backing compressed to .25m; height normalized",
                   "sourceHeight": [lower, upper], "sourceWidth": width, "normalizedHeight": True,
                   "inwardDepth": .25, "length": 1}, keep=True)
        return obj, sources

    def arc_hull(self, base, source, radius, concave, variant):
        import bmesh
        span = radius * math.pi / 2
        count = math.ceil(span)
        native = []
        for i in range(count):
            obj = self.copy(base)
            for v in obj.data.vertices:
                v.co.x += i
            native.append(obj)
        obj = self.join(native)
        # Trim the last repeat instead of shrinking every metre of native detail.
        self.clip(obj, [(0, -2), (span, -2), (span, 2), (0, 2)])
        # Subdivision before nonlinear deformation preserves all source features and
        # gives a continuous curved facade, not disconnected chord-aligned panels.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        # Slice only along the bend axis. Isotropic triangle subdivision would
        # subdivide height needlessly and inflate a curved panel by ~64x.
        for step in range(1, math.ceil(span * 4)):
            bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces],
                                  dist=1e-7, plane_co=(step / 4, 0, 0), plane_no=(1, 0, 0))
        for v in bm.verts:
            x, y, z = v.co
            angle = x / radius
            if concave:
                angle = math.pi / 2 - angle
                distance = radius - y
            else:
                distance = radius + y
            v.co = (distance * math.cos(angle), distance * math.sin(angle), z)
        # Face-local X/Y(outward) has negative orientation in a tile-local XY frame.
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        self.emit(f"hull.arc{radius}{'c' if concave else ''}.{variant}", obj, source,
                  {"family": "hull", "radius": radius, "concave": concave,
                   "normalizedHeight": True, "inwardDepth": .25,
                   "operation": "native facade repeat; subdivide; analytic quarter-circle radial deformation",
                   "arcCentre": [0, 0], "arcStartDegrees": 90 if concave else 0,
                   "arcEndDegrees": 0 if concave else 90, "sourceRepeatCount": count})

    def wall(self, piece, variant):
        obj, provenance = self.source("export", piece)
        lower = min(v.co.z for v in obj.data.vertices)
        upper = max(v.co.z for v in obj.data.vertices)
        ymin = min(v.co.y for v in obj.data.vertices)
        ymax = max(v.co.y for v in obj.data.vertices)
        for v in obj.data.vertices:
            v.co.y = .0125 + (ymax - v.co.y) * .1125 / (ymax - ymin)
            v.co.z = (v.co.z - lower) / (upper - lower)
        other = self.copy(obj)
        for v in other.data.vertices:
            v.co.y *= -1
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(other.data)
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.to_mesh(other.data)
        bm.free()
        backing = self.prism([(0, -.018), (1, -.018), (1, .018), (0, .018)], 0, 1, obj.data.materials[0])
        self.emit(f"wall.straight.{variant}", self.join([obj, other, backing]), [provenance],
                  {"family": "wall", "normalizedHeight": True, "inwardDepth": .125,
                   "operation": "native panel mirrored on both sides; depth adapted within .25m partition; closed core"})

    def post_beam(self, root):
        path = root / "assets/runtime/ship-study/wayfarer-details-r001/descriptor.json"
        item = next(x for x in json.loads(path.read_text())["pieces"] if x["id"] == "int.post.white")
        source_path = path.parent / item["file"]
        if item["sha256"] != "83c180a53c954c9e6566858c0694ed8fdde991ccebf5ebb5885bc90adf16b1ed" or sha(source_path) != item["sha256"]:
            raise ValueError("Corrected pillar pin mismatch")
        before = set(self.bpy.data.objects)
        self.bpy.ops.import_scene.gltf(filepath=str(source_path))
        obj = next(o for o in self.bpy.data.objects if o not in before and o.type == "MESH")
        doc, _ = read_glb(source_path)
        for i, material in enumerate(obj.data.materials):
            material["authored_source_name"] = doc["materials"][i]["name"]
        mins = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
        maxs = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
        for v in obj.data.vertices:
            v.co.x = (v.co.x - (mins[0] + maxs[0]) / 2) * .25 / (maxs[0] - mins[0])
            v.co.y = (v.co.y - (mins[1] + maxs[1]) / 2) * .25 / (maxs[1] - mins[1])
            v.co.z = (v.co.z - mins[2]) / (maxs[2] - mins[2])
        provenance = {"collection": "wayfarer-details-r001", "id": item["id"], "file": item["file"],
                      "sha256": item["sha256"], "sourceSha256": item["sourceSha256"]}
        self.emit("post.normal", obj, [provenance], {"family": "post", "normalizedHeight": True,
                  "operation": "corrected source pillar aperture retained; .25m square band; normalized height"})
        obj, provenance = self.source("export", "int.doorbeam.emit_a.l1")
        mins = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
        maxs = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
        for v in obj.data.vertices:
            v.co.x = (v.co.x - mins[0]) / (maxs[0] - mins[0])
            v.co.z = (v.co.z - mins[2]) / (maxs[2] - mins[2])
        self.emit("beam.normal", obj, [provenance], {"family": "beam", "normalizedHeight": True,
                  "operation": "native closed emissive door header; normalized span and height"})

    def canopy(self):
        # Reusable window follows the source canopy's actual native glass material;
        # structural braces are the aperture-corrected native post and door header.
        canopy, provenance = self.source("export", "unique.BOW_canopy")
        glass = next(m for m in canopy.data.materials if m.get("authored_source_name") == "glass_canopy")
        pane = self.prism([(.045, -.025), (.955, -.025), (.955, .025), (.045, .025)], .035, .965, glass)
        self.bpy.data.objects.remove(canopy, do_unlink=True)
        header, beam_source = self.source("export", "int.doorbeam.emit_a.l1")
        lo = [min(v.co[i] for v in header.data.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in header.data.vertices) for i in range(3)]
        for v in header.data.vertices:
            v.co.x = (v.co.x - lo[0]) / (hi[0] - lo[0])
            v.co.z = .94 + .06 * (v.co.z - lo[2]) / (hi[2] - lo[2])
        bottom = self.copy(header)
        for v in bottom.data.vertices:
            v.co.z -= .94
        # Native header repeated perpendicular to form edge jambs; no open glass.
        left = self.copy(header)
        right = self.copy(header)
        for target, offset in ((left, 0), (right, .94)):
            for v in target.data.vertices:
                x, y, z = v.co
                v.co = (z - .94 + offset, y, x)
        self.emit("canopy.straight", self.join([pane, header, bottom, left, right]),
                  [provenance, beam_source], {"family": "canopy", "normalizedHeight": True,
                  "operation": "native source glass and emissive header/braces assembled as reusable sealed window"})

    def emit(self, piece, obj, sources, metadata, keep=False):
        bpy = self.bpy
        boundaries = self.cleanup(obj)
        obj.name = "GEO-" + piece
        mins = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
        maxs = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
        if boundaries:
            raise ValueError(f"Unsealed derived piece {piece}: {boundaries} open edges")
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        filename = piece + ".glb"
        path = self.output / filename
        materials = [(m.name, m.get("authored_source_name", m.name)) for m in obj.data.materials]
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                  export_apply=True, export_texcoords=True, export_normals=True,
                                  export_yup=True, export_materials="EXPORT", export_extras=True)
        doc, chunks = read_glb(path)
        names = dict(materials)
        aliases = canonical_materials(doc, names, self.palette)
        # Stable output contains neither absolute source paths nor mutable Blender IDs.
        doc["asset"]["extras"] = {"revision": REVISION, "piece": piece, "sourceDerived": True}
        write_glb(path, doc, chunks)
        triangles = sum(doc["accessors"][p["indices"]]["count"] // 3
                        for mesh in doc["meshes"] for p in mesh["primitives"])
        item = {"id": piece, "file": filename, "sha256": sha(path), "triangles": triangles,
                "frame": "piece-local", "boundsMin": mins, "boundsMax": maxs,
                "materials": sorted({m["name"] for m in doc.get("materials", [])}),
                "source": sources, **metadata,
                "qualification": {"finiteVertices": True, "zeroAreaTriangles": 0, "openBoundaryEdges": boundaries}}
        self.pieces.append(item)
        emissions = {}
        luminous = []
        for index, material in enumerate(obj.data.materials):
            name = aliases.get(material.name)
            if not name:
                continue
            exported = next((m for m in doc.get("materials", []) if m["name"] == name), {})
            factor = exported.get("emissiveFactor", [0, 0, 0])
            strength = exported.get("extensions", {}).get("KHR_materials_emissive_strength", {}).get("emissiveStrength", 1)
            if any(factor):
                emissions[name] = {"factor": factor, "strength": strength}
                for face in obj.data.polygons:
                    if face.material_index == index:
                        luminous.append((face.area * strength, face.center.copy(), factor))
        sockets = []
        if luminous and metadata["family"] in ("wall", "post", "beam", "canopy", "hull"):
            if metadata["family"] == "hull":
                if "radius" in metadata:
                    radius = metadata["radius"]
                    inner = [p for p in luminous if (math.hypot(p[1].x, p[1].y) > radius + .19
                             if metadata["concave"] else math.hypot(p[1].x, p[1].y) < radius - .19)]
                else:
                    inner = [p for p in luminous if p[1].y < -.19]
                luminous = inner
            # Place one socket on the strongest native emissive patch, in glTF axes.
            if luminous:
                _, point, color = max(luminous, key=lambda p: p[0])
                sockets = [{"id": "source-strip", "position": [point.x, point.z, -point.y],
                            "color": color, "intensity": .35, "range": 1.75,
                            "provenance": {"kind": "source-emissive-surface", "piece": piece}}]
        self.lights.append({"id": piece, "sha256": item["sha256"], "emissions": emissions, "sockets": sockets})
        print("DERIVED", piece, triangles, "open", boundaries, flush=True)
        if keep:
            obj.hide_render = True
            obj.hide_viewport = True
        else:
            bpy.data.objects.remove(obj, do_unlink=True)

    def run(self, root):
        for shape in SHAPES:
            self.surface(shape, "floor.plate.WESN", "export_tiles", 0, "plate", "floor")
            self.surface(shape, "floor.grate", "export_tiles", 0, "grate", "floor")
            self.surface(shape, "roof.skin.square.WESN", "export_tiles", 2.507, "plate", "roof")
            self.surface(shape, "floor.grate", "export_tiles", 0, "grate", "roof")
        seeds = ["face.straight.column.split.navy.plate.w1.s1.deck",
                 "face.straight.navy.navy.mixed.mixed.w2.s0.deck",
                 "face.straight.vent.amber.navy.louvre.w2.s1.deck"]
        inner_seeds = ["int.wallpanel.cockpit+cyanbox.w1.s0.i1",
                       "int.wallpanel.cockpit+amber.w1.s0.i1",
                       "int.wallpanel.machinery.w1.s0.i0.25"]
        for source_id, variant, inner_id in zip(seeds, "abc", inner_seeds):
            base, source = self.straight_hull(source_id, variant, inner_id)
            for concave in (False, True):
                for radius in range(1, 5):
                    self.arc_hull(base, source, radius, concave, variant)
            self.bpy.data.objects.remove(base, do_unlink=True)
        for source, variant in zip(("int.wallpanel.cockpit+cyanbox.w1.s0.i1",
                                    "int.wallpanel.cockpit+amber.w1.s0.i1",
                                    "int.wallpanel.machinery.w1.s0.i0.25"), "abc"):
            self.wall(source, variant)
        self.post_beam(root)
        self.canopy()
        self.pieces.sort(key=lambda p: p["id"])
        manifest = {"schema": "sidereal.authored-template-kit/v1", "revision": REVISION,
                    "axes": "source +X/+Y planar, +Z up; glTF Y-up export", "palette": self.palette,
                    "sourcePins": PINS, "sourceRevision": "333bd9b718078e4e8e064054af9abffee817a9a0",
                    "pieces": self.pieces,
                    "totals": {"pieces": len(self.pieces), "triangles": sum(p["triangles"] for p in self.pieces)},
                    "producer": {"file": "scripts/art/build_authored_template_kit.py", "sha256": sha(Path(__file__))}}
        (self.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        lighting = {"schema": "authored-asset-lighting/v1", "frame": "glTF-Y-up",
                    "assets": sorted(self.lights, key=lambda a: a["id"])}
        manifest["lighting"] = lighting
        (self.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (self.output / "lighting.json").write_text(json.dumps(lighting, indent=2) + "\n")
        print("COMPLETE", manifest["totals"], flush=True)


def verify_pack(output: Path) -> dict:
    """Re-import each actual final GLB through Blender, including its node frame."""
    import bpy
    manifest = json.loads((output / "manifest.json").read_text())
    verified = []
    for piece in manifest["pieces"]:
        path = output / piece["file"]
        if sha(path) != piece["sha256"]:
            raise ValueError(f"Output pin mismatch {piece['id']}")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.gltf(filepath=str(path))
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        positions = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
        triangles = 0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
        if triangles != piece["triangles"]:
            raise ValueError(f"Re-import triangle mismatch {piece['id']}")
        for axis in range(3):
            if abs(min(p[axis] for p in positions) - piece["boundsMin"][axis]) > 1e-5:
                raise ValueError(f"Re-import min frame mismatch {piece['id']}")
            if abs(max(p[axis] for p in positions) - piece["boundsMax"][axis]) > 1e-5:
                raise ValueError(f"Re-import max frame mismatch {piece['id']}")
        verified.append({"id": piece["id"], "sha256": piece["sha256"], "triangles": triangles})
    return {"manifestSha256": sha(output / "manifest.json"), "verified": verified,
            "allNativeNodeFrames": True, "allTriangleCounts": True, "placeholders": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.verify_only:
        receipt = verify_pack(args.output)
        if args.receipt:
            args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
        print("VERIFIED", len(receipt["verified"]), receipt["manifestSha256"], flush=True)
    else:
        Builder(args.output).run(args.root)


if __name__ == "__main__":
    main()
