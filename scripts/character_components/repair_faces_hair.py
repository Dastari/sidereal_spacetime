"""Bounded native hair topology repairs from the frozen r009 sources.

python3 scripts/character_components/repair_faces_hair.py --renders
python3 scripts/character_components/repair_faces_hair.py --cropped-g --renders
The first command creates only attempt-f from E; the separately authorized
second command creates only attempt-g by removing one diagnosed cropped fin
from F. Original locks and prior union surfaces remain hidden and retained.
Existing attempts are never overwritten. No voxel resampling, runtime install,
service operation, backup or publication occurs.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/art-library/designs/crew.base-and-outfits/revisions/r009/delivery"
OUT = SOURCE.parent / "attempt-f"
SOURCE_SHA = "531e91a45536b50144ba41bf7e5bf374251de6c525b5967572dc18acd3797e94"
GLB_SHA = "88aa9a9787fbeff1478cb33414b9678d7ffff4bd440197303b57be900447307a"
HAIR = ("swept", "cropped", "crest", "scientist", "bob", "ponytail", "bun", "braids")
MERGE_M = 2e-6
DEGENERATE_M = 1e-6
OVERLAP_MARGIN_M = 0.00006
SAMPLE_DISPLACEMENT_LIMIT_M = .0005


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def worker(renders):
    import bpy
    import bmesh
    from collections import Counter, defaultdict
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    assert not OUT.exists(), "Preserve previous F; this is one bounded attempt"
    assert sha(SOURCE / "blender-source.blend") == SOURCE_SHA
    assert sha(SOURCE / "modular-crew.glb") == GLB_SHA
    OUT.mkdir()
    for name in ("manifest.json", "source-edit-record.json"):
        shutil.copy2(SOURCE / name, OUT / name)
    shutil.copytree(SOURCE / "textures", OUT / "textures")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / "blender-source.blend"), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    scene.frame_set(1)
    for bone in rig.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
    manifest = json.loads((OUT / "manifest.json").read_text())
    record = {"source": str(SOURCE.relative_to(ROOT)), "sourceSha256": SOURCE_SHA,
              "sourceGlbSha256": GLB_SHA, "scriptSha256": sha(Path(__file__)),
              "method": "One cleanup and at most one exact re-union per style. Merge <=2um, dissolve degenerate <=1um, explicit triangulation. If pinches remain, clean copies of the original current locks expand by at most60um/axis around local bounds, with <=3um deterministic translation, then one EXACT Boolean union and cleanup. No voxel resampling or smoothing. Original E surfaces/inputs remain hidden and untouched.",
              "sampleDisplacementLimitM": SAMPLE_DISPLACEMENT_LIMIT_M, "hair": {},
              "ownerFinalSignoff": None}

    def topology(mesh):
        bm = bmesh.new()
        bm.from_mesh(mesh)
        result = {"vertices": len(bm.verts), "faces": len(bm.faces),
                  "boundaryEdges": sum(edge.is_boundary for edge in bm.edges),
                  "nonManifoldEdges": sum(not edge.is_manifold for edge in bm.edges),
                  "nonContiguousEdges": sum(edge.is_manifold and not edge.is_contiguous for edge in bm.edges),
                  "wireEdges": sum(edge.is_wire for edge in bm.edges),
                  "tinyFaces": sum(face.calc_area() <= 1e-14 for face in bm.faces)}
        bm.free()
        result["passed"] = not any(result[k] for k in ("boundaryEdges", "nonManifoldEdges", "nonContiguousEdges", "wireEdges", "tinyFaces"))
        return result

    def clean(mesh):
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=MERGE_M)
        bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method="BEAUTY", ngon_method="BEAUTY")
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=DEGENERATE_M)
        # Cancel duplicate internal triangles; retain one same-winding copy.
        bm.verts.index_update()
        groups = defaultdict(list)
        for face in bm.faces:
            groups[tuple(sorted(v.index for v in face.verts))].append(face)
        remove = []
        for faces in groups.values():
            if len(faces) > 1:
                opposing = any(faces[0].normal.dot(face.normal) < -.9 for face in faces[1:])
                remove.extend(faces if opposing else faces[1:])
        if remove:
            bmesh.ops.delete(bm, geom=remove, context="FACES_ONLY")
        wire = [edge for edge in bm.edges if edge.is_wire]
        if wire:
            bmesh.ops.delete(bm, geom=wire, context="EDGES")
        isolated = [v for v in bm.verts if not v.link_edges]
        if isolated:
            bmesh.ops.delete(bm, geom=isolated, context="VERTS")
        bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method="BEAUTY", ngon_method="BEAUTY")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()

    def clone(obj, name, collection):
        result = obj.copy()
        result.data = obj.data.copy()
        result.name = name
        collection.objects.link(result)
        result.hide_set(False)
        result.hide_viewport = False
        result.hide_render = False
        for modifier in list(result.modifiers):
            result.modifiers.remove(modifier)
        return result

    def sample_surface(obj):
        obj.data.calc_loop_triangles()
        vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        polygons = [list(p.vertices) for p in obj.data.loop_triangles]
        tree = BVHTree.FromPolygons(vertices, polygons, all_triangles=True)
        samples = list(vertices)
        samples += [sum((vertices[i] for i in face), Vector()) / len(face) for face in polygons]
        bounds = [[min(v[axis] for v in vertices), max(v[axis] for v in vertices)] for axis in range(3)]
        return tree, samples, bounds

    built = defaultdict(list)
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.get("component_id"):
            built[obj["component_id"]].append(obj)
    for style in HAIR:
        key = "hair-" + style
        assert len(built[key]) == 1
        original = built[key][0]
        before_tree, before_samples, before_bounds = sample_surface(original)
        destination = bpy.data.collections.new("REPAIRED-F-" + key)
        scene.collection.children.link(destination)
        repaired = clone(original, "GEO-" + key + "__bounded-native-repair", destination)
        clean(repaired.data)
        first = topology(repaired.data)
        row = {"before": topology(original.data), "cleanupOnly": first,
               "reunionUsed": not first["passed"], "inputChanges": []}
        if not first["passed"]:
            # Select only E's current operand collection, not retained r008
            # source history. The original fitted scalp is the initial operand.
            expected = original["native_union_input_count"]
            collections = [c for c in bpy.data.collections if c.name.startswith("AUTHORING-LOCKS-" + style)
                           and len([o for o in c.objects if o.get("source_component_id") == key]) == expected - 1]
            assert len(collections) == 1, (style, "ambiguous current source operands")
            scalp = [o for o in bpy.data.objects if o.type == "MESH" and o.get("source_component_id") == key
                     and o.get("detail_function") == "continuous fitted scalp"]
            assert len(scalp) == 1, (style, "ambiguous fitted scalp")
            originals = scalp + sorted([o for o in collections[0].objects if o.get("source_component_id") == key], key=lambda o: o.name)
            assert len(originals) == expected
            operands = bpy.data.collections.new("REPAIR-F-OVERLAP-INPUTS-" + style)
            scene.collection.children.link(operands)
            copies = []
            for index, source in enumerate(originals):
                copy = clone(source, "SOURCE-F-" + style + "-" + str(index), operands)
                copy["source_component_id"] = key
                if "component_id" in copy:
                    del copy["component_id"]
                clean(copy.data)
                bounds = [(min(v.co[a] for v in copy.data.vertices), max(v.co[a] for v in copy.data.vertices)) for a in range(3)]
                shift = Vector(tuple((((index * (axis + 3) + axis) % 7) - 3) * 1e-6 for axis in range(3))) if index else Vector()
                maximum = 0
                for vertex in copy.data.vertices:
                    before = vertex.co.copy()
                    for axis, (low, high) in enumerate(bounds):
                        centre = (low + high) / 2
                        if high > low:
                            vertex.co[axis] = centre + (vertex.co[axis] - centre) * (1 + 2 * OVERLAP_MARGIN_M / (high - low))
                    vertex.co += shift
                    maximum = max(maximum, (vertex.co - before).length)
                copy.data.update()
                row["inputChanges"].append({"source": source.name, "copy": copy.name, "maxVertexDisplacementM": maximum})
                copies.append(copy)
            bpy.data.objects.remove(repaired, do_unlink=True)
            repaired = clone(copies[0], "GEO-" + key + "__bounded-native-repair", destination)
            # The collection must not include the copy that duplicates target.
            operands.objects.unlink(copies[0])
            destination.objects.link(copies[0])
            bpy.ops.object.select_all(action="DESELECT")
            repaired.select_set(True)
            bpy.context.view_layer.objects.active = repaired
            modifier = repaired.modifiers.new("One bounded overlap re-union", "BOOLEAN")
            modifier.operation = "UNION"
            modifier.operand_type = "COLLECTION"
            modifier.collection = operands
            modifier.solver = "EXACT"
            modifier.use_self = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            clean(repaired.data)
            for copy in copies:
                copy.hide_render = True
                copy.hide_set(True)
            operands.hide_render = True
            operands.hide_viewport = True
        original["source_component_id"] = key
        del original["component_id"]
        original.hide_render = True
        original.hide_set(True)
        repaired["component_id"] = key
        if "source_component_id" in repaired:
            del repaired["source_component_id"]
        repaired["native_union_input_count"] = original["native_union_input_count"]
        repaired["detail_function"] = "Bounded native pinched-edge repair; originals and input edits retained"
        head = repaired.vertex_groups.get("head") or repaired.vertex_groups.new(name="head")
        head.add(list(range(len(repaired.data.vertices))), 1, "REPLACE")
        deform = repaired.modifiers.new("Unchanged shared head bind", "ARMATURE")
        deform.object = rig
        repaired.parent = rig
        built[key] = [repaired]
        bpy.context.view_layer.update()
        after_tree, after_samples, after_bounds = sample_surface(repaired)
        forward = max((after_tree.find_nearest(v)[3] for v in before_samples), default=0)
        reverse = max((before_tree.find_nearest(v)[3] for v in after_samples), default=0)
        row.update({"after": topology(repaired.data), "beforeBoundsM": before_bounds, "afterBoundsM": after_bounds,
                    "maxBoundsDeltaM": max(abs(x - y) for a, b in zip(before_bounds, after_bounds) for x, y in zip(a, b)),
                    "maxSampledEToFDistanceM": forward, "maxSampledFToEDistanceM": reverse,
                    "sampleMethod": "Bidirectional BVH closest surface from every native vertex and polygon centroid. This samples displacement; it is not an exhaustive Hausdorff bound."})
        row["passed"] = row["after"]["passed"] and max(forward, reverse) <= SAMPLE_DISPLACEMENT_LIMIT_M
        record["hair"][key] = row
        print(json.dumps({"style": key, "cleanupPassed": first["passed"], "after": row["after"], "maxDisplacementM": max(forward, reverse)}), flush=True)

    # Native mesh object protection is checked independently by validate_faces.
    def show(keys):
        for key, objects in built.items():
            for obj in objects:
                obj.hide_render = key not in keys
    captures = []
    if renders:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 32
        scene.cycles.use_denoising = False
        scene.cycles.transparent_max_bounces = 64
        scene.render.resolution_x = scene.render.resolution_y = 512
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        for style in HAIR:
            for view, direction in (("front", (3, -6, 1.6)), ("rear", (3, 6, 2.0))):
                show(["base-female-core", "hair-" + style])
                target = Vector((0, 0, 1.59))
                scene.camera.location = target + Vector(direction)
                scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
                scene.camera.data.type = "ORTHO"
                scene.camera.data.ortho_scale = .96
                name = "hair-" + style + "-" + view + ".png"
                scene.render.filepath = str(OUT / name)
                bpy.ops.render.render(write_still=True)
                captures.append({"file": name, "direction": direction, "target": list(target), "orthoScale": .96})
    show(manifest["baseGroups"]["female"] + ["hair-swept"])
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "blender-source.blend"))
    record["nativeSourceSha256"] = sha(OUT / "blender-source.blend")
    record["passed"] = all(row["passed"] for row in record["hair"].values())
    (OUT / "repair-record.json").write_text(json.dumps(record, indent=2) + "\n")
    (OUT / "capture-record.json").write_text(json.dumps({"sourceSha256": record["nativeSourceSha256"], "renderer": "Blender Cycles 32 samples, Standard, transparent, no denoiser, exact E lighting", "records": captures}, indent=2) + "\n")

    # Match the established component export, preserving the same 16-bone rig
    # and original NLA clips. Only visible component_id objects are selected.
    for key, objects in built.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = "GEO-" + key
        merged["component_id"] = key
        built[key] = [merged]
    source_raw = (SOURCE / "modular-crew.glb").read_bytes()
    size = struct.unpack_from("<I", source_raw, 12)[0]
    source_gltf = json.loads(source_raw[20:20 + size])
    factors = {m["name"]: m["pbrMetallicRoughness"]["baseColorFactor"] for m in source_gltf["materials"]
               if m["name"] in ("crew.face.iris", "crew.face.brows", "crew.face.facialHair")}
    encoded = []

    def export(name, keys, animations=False):
        bpy.ops.object.select_all(action="DESELECT")
        rig.select_set(True)
        for key in keys:
            for obj in built[key]:
                obj.select_set(True)
        for track in rig.animation_data.nla_tracks:
            track.mute = not animations
        path = OUT / (name + ".glb")
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                  export_animations=animations, export_animation_mode="NLA_TRACKS",
                                  export_force_sampling=True, export_skins=True, export_extras=True, export_yup=True)
        # Encode the exact preserved E/native Multiply constants, following the
        # root pack_faces contract; do not alter pixels or geometry buffers.
        raw = path.read_bytes()
        length = struct.unpack_from("<I", raw, 12)[0]
        gltf = json.loads(raw[20:20 + length])
        changed = []
        for material in gltf.get("materials", []):
            if material["name"] in factors:
                material["pbrMetallicRoughness"]["baseColorFactor"] = factors[material["name"]]
                changed.append(material["name"])
        if changed:
            text = json.dumps(gltf, separators=(",", ":")).encode()
            text += b" " * (-len(text) % 4)
            tail = raw[20 + length:]
            path.write_bytes(struct.pack("<III", 0x46546C67, 2, 20 + len(text) + len(tail)) + struct.pack("<II", len(text), 0x4E4F534A) + text + tail)
        encoded.append({"file": path.name, "rawExportSha256": hashlib.sha256(raw).hexdigest(), "sha256": sha(path), "encodedNativeMultiplyFactors": changed})
    for style in HAIR:
        export("hair-" + style, ["hair-" + style])
    for body in ("male", "female"):
        export("base-" + body, manifest["baseGroups"][body], True)
    export("modular-crew", list(built), True)
    (OUT / "export-factor-record.json").write_text(json.dumps({"sourceCandidate": str(SOURCE.relative_to(ROOT)), "sourceGlbSha256": GLB_SHA, "nativeSourceSha256": record["nativeSourceSha256"], "factors": factors, "files": encoded, "ownerFinalSignoff": None}, indent=2) + "\n")
    print(json.dumps({"output": str(OUT.relative_to(ROOT)), "nativeRepairPassed": record["passed"], "runtimeSha256": sha(OUT / "modular-crew.glb"), "requires": "Independent preservation, exported closure and visual review"}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--renders", action="store_true")
    parser.add_argument("--native-worker", action="store_true")
    parser.add_argument("--cropped-g", action="store_true", help="Explicitly authorized G follow-up: remove only the diagnosed cropped-hair fin from frozen F")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else None)
    if args.native_worker:
        if args.cropped_g:
            cropped_worker(args.renders)
        else:
            worker(args.renders)
    else:
        sys.path.insert(0, str(ROOT / "scripts"))
        from dev import CFG, run
        run([CFG["art"]["blender"], "--background", "--threads", "8", "--factory-startup",
             "--python-exit-code", "1", "--python", str(Path(__file__).resolve()), "--", "--native-worker",
             *(["--renders"] if args.renders else []), *(["--cropped-g"] if args.cropped_g else [])])


def cropped_worker(renders):
    """One diagnosed 2.31um fin deletion; seven F surfaces are never rebuilt."""
    import bpy
    import bmesh
    from collections import defaultdict
    from mathutils import Vector

    source = SOURCE.parent / "attempt-f"
    out = SOURCE.parent / "attempt-g"
    expected_source = "54610bc9edee6fe35eec3c49e3402faef4773f092e505d0d43ab0232271e5427"
    expected_glb = "b4190a603ae6d2a25f523b1676917eec36399d877d4bfad9cb55eeb60634f601"
    assert not out.exists(), "Preserve any prior G attempt"
    assert sha(source / "blender-source.blend") == expected_source
    assert sha(source / "modular-crew.glb") == expected_glb
    out.mkdir()
    for name in ("manifest.json", "source-edit-record.json", "base-male.glb", "base-female.glb"):
        shutil.copy2(source / name, out / name)
    shutil.copytree(source / "textures", out / "textures")
    preserved = {}
    for style in HAIR:
        if style == "cropped":
            continue
        for suffix in (".glb", "-front.png", "-rear.png"):
            name = "hair-" + style + suffix
            shutil.copy2(source / name, out / name)
            preserved[name] = sha(out / name)
    bpy.ops.wm.open_mainfile(filepath=str(source / "blender-source.blend"), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    manifest = json.loads((out / "manifest.json").read_text())
    built = defaultdict(list)
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.get("component_id"):
            built[obj["component_id"]].append(obj)

    def native_hash(obj):
        mesh = obj.data
        record = {"vertices": [tuple(v.co) for v in mesh.vertices],
                  "normals": [tuple(n.vector) for n in mesh.corner_normals],
                  "faces": [(tuple(p.vertices), p.material_index, p.use_smooth) for p in mesh.polygons],
                  "uv": {layer.name: [tuple(v.uv) for v in layer.data] for layer in mesh.uv_layers},
                  "weights": [[(obj.vertex_groups[g.group].name, g.weight) for g in v.groups] for v in mesh.vertices],
                  "materials": [m.name for m in mesh.materials]}
        return hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()

    seven_before = {style: native_hash(built["hair-" + style][0]) for style in HAIR if style != "cropped"}
    obj = built["hair-cropped"][0]
    original = obj.copy()
    original.data = obj.data.copy()
    original.name = "SOURCE-G-cropped-before-fin-removal"
    original["source_component_id"] = "hair-cropped"
    del original["component_id"]
    scene.collection.objects.link(original)
    original.hide_render = True
    original.hide_set(True)
    before_bounds = [[min(v.co[a] for v in obj.data.vertices), max(v.co[a] for v in obj.data.vertices)] for a in range(3)]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.index_update()
    fins = [face for face in bm.faces if len(face.verts) == 3 and sorted(len(edge.link_faces) for edge in face.edges) == [1, 1, 3]]
    assert len(fins) == 1, "The diagnosed single dangling cropped fin has changed"
    fin = fins[0]
    area = fin.calc_area()
    altitude = 2 * area / max(edge.calc_length() for edge in fin.edges)
    assert area < 1e-8 and altitude < 5e-6, "Refuse a meaningful surface deletion"
    removed = {"nativeFaceIndex": fin.index, "verticesBlenderM": [list(v.co) for v in fin.verts],
               "areaM2": area, "altitudeM": altitude, "edgeIncidentFaces": [len(e.link_faces) for e in fin.edges]}
    bmesh.ops.delete(bm, geom=[fin], context="FACES_ONLY")
    wires = [edge for edge in bm.edges if edge.is_wire]
    bmesh.ops.delete(bm, geom=wires, context="EDGES")
    isolated = [v for v in bm.verts if not v.link_edges]
    if isolated:
        bmesh.ops.delete(bm, geom=isolated, context="VERTS")
    topology = {"vertices": len(bm.verts), "faces": len(bm.faces),
                "boundaryEdges": sum(e.is_boundary for e in bm.edges),
                "nonManifoldEdges": sum(not e.is_manifold for e in bm.edges),
                "nonContiguousEdges": sum(e.is_manifold and not e.is_contiguous for e in bm.edges)}
    assert topology["boundaryEdges"] == topology["nonManifoldEdges"] == topology["nonContiguousEdges"] == 0
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    after_bounds = [[min(v.co[a] for v in obj.data.vertices), max(v.co[a] for v in obj.data.vertices)] for a in range(3)]
    assert after_bounds == before_bounds, "Unexpected cropped silhouette bounds change"
    seven_after = {style: native_hash(built["hair-" + style][0]) for style in HAIR if style != "cropped"}
    assert seven_before == seven_after, "Untouched F hair changed"
    captures = []

    def show(keys):
        for key, objects in built.items():
            for item in objects:
                item.hide_render = key not in keys
                if key in keys:
                    item.hide_set(False)
                    item.hide_viewport = False
    if renders:
        # Preserve F camera exposure, shader materials, light rig and sampling.
        scene.render.resolution_x = scene.render.resolution_y = 512
        scene.render.resolution_percentage = 100
        for view, direction in (("front", (3, -6, 1.6)), ("rear", (3, 6, 2.0))):
            show(["base-female-core", "hair-cropped"])
            target = Vector((0, 0, 1.59))
            scene.camera.location = target + Vector(direction)
            scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
            scene.camera.data.ortho_scale = .96
            bpy.context.view_layer.update()
            name = "hair-cropped-" + view + ".png"
            scene.render.filepath = str(out / name)
            bpy.ops.render.render(write_still=True)
            captures.append({"file": name, "direction": direction, "target": list(target), "orthoScale": .96})
    show(manifest["baseGroups"]["female"] + ["hair-swept"])
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "blender-source.blend"))
    record = {"passed": True, "source": str(source.relative_to(ROOT)), "sourceSha256": expected_source,
              "sourceGlbSha256": expected_glb, "nativeSourceSha256": sha(out / "blender-source.blend"),
              "scriptSha256": sha(Path(__file__)), "authorization": "Integration owner explicitly authorized one cropped-only G follow-up after seven F styles passed closure.",
              "operation": "Delete the single diagnosed dangling triangular fin, then its two loose edges/isolated vertex. No smoothing, resampling, further Boolean or edits to other faces/styles.",
              "removedFace": removed, "croppedTopology": topology,
              "croppedBeforeBoundsM": before_bounds, "croppedAfterBoundsM": after_bounds,
              "sevenNativeHairHashesBefore": seven_before, "sevenNativeHairHashesAfter": seven_after,
              "copiedSevenStandaloneAndRenderHashes": preserved, "ownerFinalSignoff": None}
    (out / "repair-record.json").write_text(json.dumps(record, indent=2) + "\n")
    (out / "capture-record.json").write_text(json.dumps({"sourceSha256": record["nativeSourceSha256"],
        "newRecords": captures, "copiedUnchangedRecordsFrom": str((source / "capture-record.json").relative_to(ROOT)),
        "copiedImageHashes": {k: v for k, v in preserved.items() if k.endswith(".png")}}, indent=2) + "\n")

    # Regenerate only cropped standalone and combined. All seven other hair
    # GLBs and the two base GLBs remain byte-identical copies of frozen F.
    for key, objects in built.items():
        bpy.ops.object.select_all(action="DESELECT")
        for item in objects:
            item.hide_set(False)
            item.hide_viewport = False
            item.hide_render = False
            item.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = "GEO-" + key
        merged["component_id"] = key
        built[key] = [merged]
    raw = (source / "modular-crew.glb").read_bytes()
    length = struct.unpack_from("<I", raw, 12)[0]
    gltf = json.loads(raw[20:20 + length])
    factors = {m["name"]: m["pbrMetallicRoughness"]["baseColorFactor"] for m in gltf["materials"]
               if m["name"] in ("crew.face.iris", "crew.face.brows", "crew.face.facialHair")}
    records = []
    for name, keys, animations in (("hair-cropped", ["hair-cropped"], False), ("modular-crew", list(built), True)):
        bpy.ops.object.select_all(action="DESELECT")
        rig.select_set(True)
        for key in keys:
            for item in built[key]:
                item.select_set(True)
        for track in rig.animation_data.nla_tracks:
            track.mute = not animations
        path = out / (name + ".glb")
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
            export_animations=animations, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
            export_skins=True, export_extras=True, export_yup=True)
        raw = path.read_bytes()
        length = struct.unpack_from("<I", raw, 12)[0]
        data = json.loads(raw[20:20 + length])
        changed = []
        for material in data.get("materials", []):
            if material["name"] in factors:
                material["pbrMetallicRoughness"]["baseColorFactor"] = factors[material["name"]]
                changed.append(material["name"])
        if changed:
            encoded = json.dumps(data, separators=(",", ":")).encode()
            encoded += b" " * (-len(encoded) % 4)
            tail = raw[20 + length:]
            path.write_bytes(struct.pack("<III", 0x46546C67, 2, 20 + len(encoded) + len(tail)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + tail)
        records.append({"file": path.name, "rawExportSha256": hashlib.sha256(raw).hexdigest(), "sha256": sha(path), "encodedNativeMultiplyFactors": changed})
    (out / "export-factor-record.json").write_text(json.dumps({"sourceAttempt": str(source.relative_to(ROOT)),
        "nativeSourceSha256": record["nativeSourceSha256"], "factors": factors, "regeneratedFiles": records,
        "copiedGlbHashes": {p.name: sha(p) for p in out.glob("*.glb") if p.name not in ("modular-crew.glb", "hair-cropped.glb")},
        "ownerFinalSignoff": None}, indent=2) + "\n")
    print(json.dumps({"output": str(out.relative_to(ROOT)), "croppedRepairPassed": True,
                      "nativeSourceSha256": record["nativeSourceSha256"], "runtimeSha256": sha(out / "modular-crew.glb")}), flush=True)


if __name__ == "__main__":
    main()
