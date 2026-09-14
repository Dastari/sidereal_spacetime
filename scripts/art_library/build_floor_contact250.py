"""Measured native floor-contact study; immutable output, never publishes assets.

python3 scripts/art_library/build_floor_contact250.py --preflight --revision 0
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import struct

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "assets/art-library/designs/shipyard.structure.floor-contact250"
SPEC = ROOT / "packages/content/src/ship-tileset-floor-contact-spec.v1.json"
SPEC_HASH = "a9b8f3a2b9d361ff9084e953666a66b3cd99ab907c946b8f0f02a866a0b14d33"
TOL = 1e-6


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def area(poly):
    return sum(a[0] * b[1] - b[0] * a[1]
               for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def cross(a, b, p):
    return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])


def intersect_area(poly, clip):
    result = list(poly)
    if area(clip) < 0:
        clip = list(reversed(clip))
    for a, b in zip(clip, clip[1:] + clip[:1]):
        old, result = result, []
        if not old:
            return 0.0
        for p, q in zip(old, old[1:] + old[:1]):
            dp, dq = cross(a, b, p), cross(a, b, q)
            if dp >= 0:
                result.append(p)
            if (dp < 0) != (dq < 0):
                t = dp / (dp-dq)
                result.append([p[k] + t*(q[k]-p[k]) for k in range(2)])
    return abs(area(result)) if len(result) > 2 else 0.0


def triangles(path, prefix):
    raw = Path(path).read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20+size])
    data = raw[28+size:]

    def accessor(index):
        a = doc["accessors"][index]
        v = doc["bufferViews"][a["bufferView"]]
        fmt = {5126: "f", 5123: "H", 5125: "I"}[a["componentType"]]
        count = {"VEC3": 3, "SCALAR": 1}[a["type"]]
        offset = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride", struct.calcsize(fmt)*count)
        return [struct.unpack_from("<"+fmt*count, data, offset+k*stride)
                for k in range(a["count"])]

    result, nodes = [], []
    for node in doc["nodes"]:
        if "mesh" not in node or not node.get("name", "").startswith(prefix):
            continue
        assert not any(k in node for k in ["matrix", "translation", "rotation", "scale"])
        nodes.append(node["name"])
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            assert primitive.get("mode", 4) == 4
            vertices = [(v[0], -v[2], v[1]) for v in accessor(primitive["attributes"]["POSITION"])]
            indices = [v[0] for v in accessor(primitive["indices"])]
            result.extend([[vertices[i] for i in indices[k:k+3]]
                           for k in range(0, len(indices), 3)])
    assert nodes
    return result, nodes


def point_in_projection(point, triangle):
    poly = [(v[0], v[1]) for v in triangle]
    sign = math.copysign(1, area(poly))
    return area(poly) != 0 and all(sign*cross(a, b, point) >= 0
                                  for a, b in zip(poly, poly[1:] + poly[:1]))


def preflight(out):
    assert sha(SPEC) == SPEC_HASH
    spec = json.loads(SPEC.read_text())
    native = ROOT / spec["source"]["nativePath"]
    assert sha(native) == spec["source"]["nativeSha256"]
    assert sha(ROOT/spec["source"]["interfacePath"]) == spec["source"]["interfaceSha256"]
    report = {"schema": "sidereal.floor-contact250-preflight.v1",
              "specSha256": SPEC_HASH, "source": spec["source"],
              "distanceToleranceM": TOL, "artApproval": "unapproved",
              "physicalQualification": "unqualified", "profiles": []}
    for profile in spec["profiles"]:
        ts, nodes = triangles(native, profile["nodePrefix"])
        upper = [t for t in ts if area([(v[0], v[1]) for v in t]) > 0]
        footprint = profile["footprintM"]
        center = [sum(p[i] for p in footprint)/len(footprint) for i in range(2)]
        witnesses = []
        for corner in footprint:
            length = math.dist(corner, center)
            point = [corner[i]+(center[i]-corner[i])*.0005/length for i in range(2)]
            if not any(point_in_projection(point, t) for t in ts):
                witnesses.append({"nominalCornerM": corner, "pointXYM": point,
                                  "nativeTriangleProjectionHits": 0})
        projected = sum(intersect_area([(v[0], v[1]) for v in t], footprint) for t in upper)
        report["profiles"].append({"id": profile["id"], "nodes": nodes,
            "nativeTriangles": len(ts), "upwardProjectedTriangles": len(upper),
            "nominalAreaM2": area(footprint),
            "upperFaceProjectedAreaUpperBoundM2": projected,
            "missingNativeProjectionAreaLowerBoundM2": max(0, area(footprint)-projected),
            "unsupportedCornerWitnesses": witnesses})
    ts, _ = triangles(native, spec["profiles"][0]["nodePrefix"])
    patch = [(1, 0), (3, 0), (3, .25), (1, .25)]
    top = [t for t in ts if area([(v[0], v[1]) for v in t]) > 0
           and all(abs(v[2]-spec["floorTopM"]) <= TOL for v in t)]
    upper = [t for t in ts if area([(v[0], v[1]) for v in t]) > 0]
    coverage = lambda triangles: sum(intersect_area([(v[0]+dx, v[1]) for v in t], patch)
                                     for t in triangles for dx in [0, 2])
    report["squareFrame"] = {"patchXYM": patch, "expectedContactAreaM2": .5,
        "nativeTopContactAreaM2": coverage(top),
        "maximumContactUpperBoundFromActualUpperSurfaceOnlyM2": coverage(upper),
        "unfillableWithoutCornerPolicyAreaLowerBoundM2": .5-coverage(upper),
        "areaAllowanceFromExisting1umTimesPatchPerimeterM2": TOL*4.5}
    report["blocker"] = (
        "Rounded vertical native corners leave nominal XY columns with no native surface at any Z. "
        "The frozen request both restricts fillers to above actual native upper surface and requires "
        "full nominal top contact. Define the bottom/side support policy for these missing corner "
        "columns before authoring; no extrapolation, original-floor mutation, or tolerance increase applied.")
    report["pass"] = False
    out.mkdir(parents=True, exist_ok=False)
    shutil.copy2(SPEC, out/SPEC.name)
    shutil.copy2(__file__, out/"recipe.py")
    (out/"preflight.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report["squareFrame"], indent=2))


def baseline_render(out):
    """Opaque Blender evidence of unchanged native corner gaps; no filler authored."""
    import bpy
    from mathutils import Vector
    assert sha(SPEC) == SPEC_HASH
    spec = json.loads(SPEC.read_text())
    native = ROOT/spec["source"]["nativePath"]
    assert sha(native) == spec["source"]["nativeSha256"]
    assert out.exists() and not (out/"baseline-source.blend").exists()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(native))
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    reference = bpy.data.collections.new("REFERENCE-PINNED-r002-UNCHANGED")
    scene.collection.children.link(reference)
    for obj in list(scene.objects):
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        reference.objects.link(obj)
        obj.hide_render = True
    square = next(o for o in reference.objects if o.name.startswith(spec["profiles"][0]["nodePrefix"]))
    visible = []
    for i in range(2):
        obj = square.copy()
        obj.name = f"GEO-baseline-retained-square-{i}"
        scene.collection.objects.link(obj)
        obj.location.x += i*2
        obj.hide_render = False
        obj["source_glb_sha256"] = sha(native)
        obj["reference_only"] = True
        visible.append(obj)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("WORLD-opaque-baseline")
    scene.world.color = (.055, .055, .055)
    sun = bpy.data.lights.new("LIGHT-baseline-sun", "SUN")
    sun.energy = 3
    light = bpy.data.objects.new(sun.name, sun)
    scene.collection.objects.link(light)
    light.rotation_euler = (.3, -.4, -.2)
    camera = bpy.data.objects.new("CAMERA-baseline", bpy.data.cameras.new("CAMERA-baseline"))
    scene.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    camera.data.clip_start = .00001
    scene.camera = camera
    captures = []
    for filename, target, eye, scale in [
        ("baseline-two-square.png", (2, 1, .1), (2, -3, 4), 4.8),
        ("baseline-native-corner-gap-top.png", (2, .004, .1875), (2, .004, .25), .025),
        ("baseline-native-corner-gap-section.png", (2, .002, .184), (2, -.045, .21), .03),
    ]:
        camera.location = eye
        camera.rotation_euler = (Vector(target)-camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = scale
        scene.render.filepath = str(out/filename)
        assert not Path(scene.render.filepath).exists()
        bpy.ops.render.render(write_still=True)
        captures.append({"path": filename, "sha256": sha(out/filename), "targetM": target,
                         "cameraM": eye, "orthoScaleM": scale,
                         "visibleMeshes": [o.name for o in visible]})
    bpy.ops.wm.save_as_mainfile(filepath=str(out/"baseline-source.blend"))
    shutil.copy2(__file__, out/"baseline-recipe.py")
    (out/"baseline-capture.json").write_text(json.dumps({"sourceSha256": sha(native),
        "blender": bpy.app.version_string, "engine": "Cycles CPU", "samples": 24,
        "resolution": [1200, 900], "opaque": True, "captures": captures,
        "scope": "Original native floors only; no adapter or new art has been authored."}, indent=2)+"\n")


def author(out, square_only=False):
    import bpy
    import bmesh
    from mathutils import Vector
    assert sha(SPEC) == SPEC_HASH
    spec = json.loads(SPEC.read_text())
    native = ROOT/spec["source"]["nativePath"]
    assert sha(native) == spec["source"]["nativeSha256"]
    out.mkdir(parents=True, exist_ok=False)
    shutil.copy2(SPEC, out/SPEC.name)
    shutil.copy2(__file__, out/"recipe.py")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(native))
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    references = bpy.data.collections.new("REFERENCE-PINNED-r002-UNCHANGED")
    scene.collection.children.link(references)
    for obj in list(scene.objects):
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        references.objects.link(obj)
        obj.hide_render = True
    edge_material = bpy.data.materials["MAT-deck-indigo-edge"]
    report = {"schema": "sidereal.floor-contact250-native-validation.v1",
              "specSha256": SPEC_HASH, "source": spec["source"], "profiles": [],
              "distanceToleranceM": TOL, "artApproval": "unapproved",
              "physicalQualification": "unqualified"}
    adapters = []
    for profile in spec["profiles"][:1] if square_only else spec["profiles"]:
        sid = profile["floorId"]
        source = next(o for o in references.objects if o.name.startswith(profile["nodePrefix"]))
        ts, nodes = triangles(native, profile["nodePrefix"])
        # An apparent upward projection on a nominally vertical native side is only
        # discarded when its full projected width is inside the original 1um allowance.
        upper, vertical_slivers = [], []
        for t in ts:
            n = (Vector(t[1])-Vector(t[0])).cross(Vector(t[2])-Vector(t[0]))
            if n.z <= 0:
                continue
            if n.normalized().z < .01:
                width = n.z/max(math.dist(t[i][:2], t[(i+1)%3][:2]) for i in range(3))
                assert width <= TOL, (sid, "ambiguous upward native side", width)
                vertical_slivers.append({"triangle": t, "projectedWidthM": width})
            else:
                upper.append(t)
        lower = min(v[2] for t in upper for v in t)
        top = spec["floorTopM"]
        assert 0 < lower < top
        footprint = profile["footprintM"]
        n = len(footprint)
        vertices = [(x, y, z) for z in [lower, top] for x, y in footprint]
        faces = [list(range(n-1, -1, -1)), list(range(n, n*2))]
        faces += [[i, (i+1)%n, (i+1)%n+n, i+n] for i in range(n)]
        mesh = bpy.data.meshes.new("MESH-floor-contact250-"+sid)
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(edge_material)
        obj = bpy.data.objects.new("GEO-floor-contact250-"+sid, mesh)
        scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new("Subtract-actual-pinned-native-floor", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = source
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Boolean source is preserved; new mesh owns only the surviving measured void.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        # Native float32 intersections can produce tens-of-nanometres slivers.
        # Weld only the new adapter inside 0.1um; qualification still uses 1um.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        nonmanifold = sum(not e.is_manifold for e in bm.edges)
        volume = bm.calc_volume(signed=True)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.dissolve_degenerate(bm, dist=1e-9, edges=list(bm.edges))
        # Exact subtraction can leave an opposing duplicate pair: an internal
        # zero-volume sheet. Remove the pair, never delete a unique surface.
        duplicate_faces = {}
        for face in bm.faces:
            key = tuple(sorted(tuple(v.co) for v in face.verts))
            duplicate_faces.setdefault(key, []).append(face)
        sheets = [face for group in duplicate_faces.values() if len(group) == 2 for face in group]
        if sheets:
            bmesh.ops.delete(bm, geom=sheets, context="FACES_ONLY")
        bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        nonmanifold = sum(not e.is_manifold for e in bm.edges)
        bm.to_mesh(obj.data)
        bm.free()
        if nonmanifold or volume <= 0:
            bpy.ops.wm.save_as_mainfile(filepath=str(out/"failed-authoring.blend"))
            (out/"failure.json").write_text(json.dumps({"floor": sid,
                "nonmanifoldEdges": nonmanifold, "volumeM3": volume}, indent=2)+"\n")
            raise AssertionError((sid, nonmanifold, volume))
        obj.data.materials.clear()
        obj.data.materials.append(edge_material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        uv = obj.data.uv_layers.new(name="UVMap")
        for polygon in obj.data.polygons:
            for li in polygon.loop_indices:
                p = obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = (p.x, p.y)
        obj["spec_sha256"] = SPEC_HASH
        obj["source_glb_sha256"] = sha(native)
        obj["measured_upper_bevel_start_m"] = lower
        obj["physical_qualification"] = "unqualified"
        obj["art_approval"] = "unapproved"
        obj["corner_policy"] = spec["absentCornerColumns"]["policy"]
        path = out/(sid+".glb")
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                  export_apply=True, export_extras=True, export_yup=True,
                                  export_tangents=True)
        actual, exported_nodes = triangles(path, "GEO-floor-contact250-")
        cap = [t for t in actual if all(abs(v[2]-top) <= TOL for v in t)]
        sourcecap = [t for t in ts if all(abs(v[2]-top) <= TOL for v in t)
                     and area([(v[0], v[1]) for v in t]) > 0]
        caparea = sum(area([(v[0], v[1]) for v in t]) for t in cap)
        nativearea = sum(area([(v[0], v[1]) for v in t]) for t in sourcecap)
        errors = []
        for t in actual:
            normal = (Vector(t[1])-Vector(t[0])).cross(Vector(t[2])-Vector(t[0]))
            if normal.length <= 1e-14:
                errors.append("degenerate triangle")
            for v in t:
                if not lower-TOL <= v[2] <= top+TOL:
                    errors.append("vertical containment")
                for a, b in zip(footprint, footprint[1:]+footprint[:1]):
                    if cross(a, b, v) < -TOL*math.dist(a, b):
                        errors.append("nominal footprint")
                distances = [cross(a,b,v)/math.dist(a,b)
                             for a,b in zip(footprint,footprint[1:]+footprint[:1])]
                if min(distances) > spec["perimeterBandM"]+TOL:
                    errors.append("outside inward perimeter band")
        perimeter = sum(math.dist(a,b) for a,b in zip(footprint,footprint[1:]+footprint[:1]))
        if abs(caparea+nativearea-area(footprint)) > TOL*perimeter:
            errors.append("nominal top coverage")
        entry = {"id": profile["id"], "floorId": sid, "nativeNodes": nodes,
                 "adapterNodes": exported_nodes, "nativeUpperBevelStartM": lower,
                 "nearVerticalNativeSlivers": vertical_slivers,
                 "nativeTopContactAreaM2": nativearea, "adapterTopContactAreaM2": caparea,
                 "combinedTopAreaM2": caparea+nativearea, "nominalAreaM2": area(footprint),
                 "volumeM3": volume, "closedManifold": nonmanifold == 0,
                 "exportTriangles": len(actual), "glbSha256": sha(path), "errors": sorted(set(errors))}
        report["profiles"].append(entry)
        adapters.append(obj)
        (out/"validation.json").write_text(json.dumps(report, indent=2)+"\n")
        if errors:
            bpy.ops.wm.save_as_mainfile(filepath=str(out/"failed-validation.blend"))
            raise AssertionError((sid, errors))
    square, _ = triangles(out/"square-2m.glb", "GEO-floor-contact250-")
    native_square, _ = triangles(native, spec["profiles"][0]["nodePrefix"])
    patch = [(1,0),(3,0),(3,.25),(1,.25)]
    contact = sum(intersect_area([(v[0]+dx,v[1]) for v in t],patch)
                  for t in square+native_square for dx in [0,2]
                  if all(abs(v[2]-spec["floorTopM"]) <= TOL for v in t)
                  and area([(v[0],v[1]) for v in t]) > 0)
    report["squareFrame"] = {"expectedAreaM2": .5, "combinedActualContactAreaM2": contact,
                              "pass": abs(contact-.5) <= TOL*4.5}
    report["pass"] = all(not p["errors"] for p in report["profiles"]) and report["squareFrame"]["pass"]
    report["remaining"] = ["exported manifold roundtrip", "native intersection volume", "negative controls",
                            "transformed complementary seams", "opaque before/after renders"]
    (out/"validation.json").write_text(json.dumps(report, indent=2)+"\n")
    bpy.ops.wm.save_as_mainfile(filepath=str(out/"blender-source.blend"))
    print(json.dumps(report["squareFrame"]))


def export_audit(out, source_revision):
    """Independent triangle-level audit of preserved exports, with native Blender views."""
    import bpy
    import bmesh
    from collections import Counter, defaultdict
    from mathutils import Vector
    assert sha(SPEC) == SPEC_HASH
    spec = json.loads(SPEC.read_text())
    native = ROOT/spec["source"]["nativePath"]
    assert sha(native) == spec["source"]["nativeSha256"]
    out.mkdir(parents=True, exist_ok=False)
    shutil.copy2(SPEC, out/SPEC.name)
    shutil.copy2(__file__, out/"recipe.py")
    for p in source_revision.glob("*.glb"):
        shutil.copy2(p, out/p.name)
    shutil.copy2(source_revision/"blender-source.blend", out/"blender-source.blend")
    shutil.copy2(source_revision/"validation.json",out/"authoring-validation.json")

    def clipped(poly, clip):
        result = list(poly)
        if area(clip) < 0:
            clip = list(reversed(clip))
        for a,b in zip(clip, clip[1:]+clip[:1]):
            old,result = result,[]
            if not old:
                break
            for p,q in zip(old,old[1:]+old[:1]):
                dp,dq = cross(a,b,p),cross(a,b,q)
                if dp >= 0:
                    result.append(p)
                if (dp<0)!=(dq<0):
                    t=dp/(dp-dq)
                    result.append(tuple(p[k]+t*(q[k]-p[k]) for k in range(2)))
        return result

    def plane_z(t, p):
        a=[t[1][i]-t[0][i] for i in range(3)]
        b=[t[2][i]-t[0][i] for i in range(3)]
        n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
        return t[0][2]-(n[0]*(p[0]-t[0][0])+n[1]*(p[1]-t[0][1]))/n[2]

    def topology(ts):
        edges=Counter()
        oriented=Counter()
        vertices=set()
        adjacency=defaultdict(set)
        degenerate=[]
        volume=0.
        for i,t in enumerate(ts):
            ps=[tuple(round(x,8) for x in v) for v in t]
            vertices.update(ps)
            n=(Vector(t[1])-Vector(t[0])).cross(Vector(t[2])-Vector(t[0]))
            if n.length <= 1e-14 or len(set(ps)) != 3:
                degenerate.append(i)
            volume += Vector(t[0]).dot(Vector(t[1]).cross(Vector(t[2])))/6
            for a,b in zip(ps,ps[1:]+ps[:1]):
                edges[tuple(sorted([a,b]))]+=1
                oriented[(a,b)]+=1
                adjacency[a].add(b)
                adjacency[b].add(a)
        components=0
        unseen=set(vertices)
        while unseen:
            components+=1
            stack=[unseen.pop()]
            while stack:
                for v in adjacency[stack.pop()] & unseen:
                    unseen.remove(v)
                    stack.append(v)
        return {"vertices":len(vertices),"edges":len(edges),"triangles":len(ts),
                "nonmanifoldEdges":sum(n!=2 for n in edges.values()),
                "inconsistentlyOrientedEdges":sum(oriented[(a,b)]!=1 or oriented[(b,a)]!=1 for a,b in edges),
                "degenerateTriangles":degenerate,"components":components,"signedVolumeM3":volume,
                "coordinateKeyPrecisionM":1e-8}

    def surface_comparison(adapter, base):
        bottoms=[]
        vertical=[]
        for t in adapter:
            n=(Vector(t[1])-Vector(t[0])).cross(Vector(t[2])-Vector(t[0]))
            if n.z >= 0:
                continue
            if -n.normalized().z < .01:
                width=abs(n.z)/max(math.dist(t[i][:2],t[(i+1)%3][:2]) for i in range(3))
                assert width<=TOL
                vertical.append(width)
            else:
                bottoms.append(t)
        upper=[]
        for t in base:
            n=(Vector(t[1])-Vector(t[0])).cross(Vector(t[2])-Vector(t[0]))
            if n.z > 0 and n.normalized().z >= .01:
                upper.append(t)
        max_overlap=max_gap=matched=0.
        for t in bottoms:
            for u in upper:
                poly=clipped([v[:2] for v in t],[v[:2] for v in u])
                if len(poly)<3 or abs(area(poly))<1e-14:
                    continue
                matched+=abs(area(poly))
                for p in poly:
                    delta=plane_z(t,p)-plane_z(u,p)
                    max_gap=max(max_gap,delta)
                    max_overlap=max(max_overlap,-delta)
        return {"maximumBelowNativeUpperSurfaceM":max_overlap,
                "maximumAboveNativeUpperSurfaceM":max_gap,"matchedBottomProjectionAreaM2":matched,
                "nearVerticalSideProjectedWidthsM":vertical}

    report={"schema":"sidereal.floor-contact250-export-audit.v1","specSha256":SPEC_HASH,
            "source":spec["source"],"preservedGeometryRevision":source_revision.name,
            "distanceToleranceM":TOL,"artApproval":"unapproved","physicalQualification":"unqualified",
            "profiles":[],"negativeControls":[],"fixtures":[]}
    all_ts={}
    for profile in spec["profiles"]:
        sid=profile["floorId"]
        ts,nodes=triangles(out/(sid+".glb"),"GEO-floor-contact250-")
        base,_=triangles(native,profile["nodePrefix"])
        all_ts[sid]=(base,ts)
        topo=topology(ts)
        comparison=surface_comparison(ts,base)
        good=(topo["nonmanifoldEdges"]==0 and topo["inconsistentlyOrientedEdges"]==0
              and not topo["degenerateTriangles"] and topo["components"]==1
              and topo["signedVolumeM3"]>0
              and comparison["maximumBelowNativeUpperSurfaceM"]<=TOL
              and comparison["maximumAboveNativeUpperSurfaceM"]<=TOL)
        entry={"floorId":sid,"glbSha256":sha(out/(sid+".glb")),"nodes":nodes,
               "topology":topo,"actualNativeSurfaceComparison":comparison,"pass":good}
        report["profiles"].append(entry)
        print(json.dumps(entry),flush=True)
        (out/"export-audit.json").write_text(json.dumps(report,indent=2)+"\n")
        if not good:
            raise AssertionError(entry)
        for dz in [-.001,.001]:
            moved=[[(v[0],v[1],v[2]+dz) for v in t] for t in ts]
            cmp=surface_comparison(moved,base)
            failed=cmp["maximumBelowNativeUpperSurfaceM"]>TOL or cmp["maximumAboveNativeUpperSurfaceM"]>TOL
            report["negativeControls"].append({"floorId":sid,"kind":"1mm vertical overlap" if dz<0 else "1mm vertical gap",
                "comparison":cmp,"rejected":failed})
            assert failed
        reversed_topo=topology([list(reversed(t)) for t in ts])
        report["negativeControls"].append({"floorId":sid,"kind":"reversed winding",
            "signedVolumeM3":reversed_topo["signedVolumeM3"],"rejected":reversed_topo["signedVolumeM3"]<0})
        assert reversed_topo["signedVolumeM3"]<0
    def transform(ts,origin,turn=0,mirror=False):
        result=[]
        for t in ts:
            vs=[]
            for x,y,z in t:
                if mirror:
                    x=-x
                for _ in range(turn%4):
                    x,y=-y,x
                vs.append((x+origin[0],y+origin[1],z))
            result.append(list(reversed(vs)) if mirror else vs)
        return result

    top=spec["floorTopM"]
    def topfaces(ts):
        return [t for t in ts if all(abs(v[2]-top)<=TOL for v in t) and area([v[:2] for v in t])>0]
    fixtures=[
        ("two-squares",[("square-2m",(0,0),0),("square-2m",(2,0),0)],4,2),
        ("two-halves",[("half-2x1",(0,0),0),("half-2x1",(0,1),0)],2,2),
        ("four-quarters",[("quarter-1m",(x,y),0) for x in [0,1] for y in [0,1]],2,2),
        ("two-triangle45",[("triangle-45",(0,0),0),("triangle-45",(2,2),2)],2,2),
        ("two-long-triangles",[("triangle-long-left",(0,0),0),("triangle-long-left",(4,2),2)],4,2),
        ("two-slim-triangles",[("triangle-slim-left",(0,0),0),("triangle-slim-left",(4,1),2)],4,1),
        ("two-small-triangles",[("triangle-1m",(0,0),0),("triangle-1m",(1,1),2)],1,1),
        ("strip-and-four-quarters",[("strip-4x1",(0,0),0)]+[("quarter-1m",(x,1),0) for x in range(4)],4,2),
    ]
    for name,placements,w,h in fixtures:
        for turn in range(4):
            for mirror in [False,True]:
                groups=[]
                for sid,origin,yaw in placements:
                    base,adapter=all_ts[sid]
                    groups.append(transform(transform(topfaces(base+adapter),origin,yaw),(0,0),turn,mirror))
                overlap=0.
                for i,group in enumerate(groups):
                    for other in groups[i+1:]:
                        overlap+=sum(intersect_area([v[:2] for v in a],[v[:2] for v in b]) for a in group for b in other)
                total=sum(area([v[:2] for v in t]) for group in groups for t in group)
                good=overlap<=TOL*2*(w+h) and abs(total-w*h)<=TOL*2*(w+h)
                report["fixtures"].append({"id":name,"quarterTurns":turn,"mirrored":mirror,
                    "placements":[{"floorId":sid,"originM":origin,"quarterTurns":yaw} for sid,origin,yaw in placements],
                    "expectedTopAreaM2":w*h,"actualTopAreaM2":total,"neighborTopOverlapM2":overlap,"pass":good})
                assert good,report["fixtures"][-1]
    base,adapter=all_ts["square-2m"]
    patch=[(1,0),(3,0),(3,.25),(1,.25)]
    for dx in [0.,.001,-.001]:
        contact=sum(intersect_area([v[:2] for v in t],patch)
                    for t in topfaces(base+adapter)+transform(topfaces(base+adapter),(2+dx,0)))
        entry={"id":"two-square-frame-contact","neighborOffsetErrorM":dx,"expectedAreaM2":.5,
               "actualContactAreaM2":contact,"passesContact":abs(contact-.5)<=TOL*4.5}
        (report["fixtures"] if dx==0 else report["negativeControls"]).append(entry)
        assert entry["passesContact"]==(dx==0),entry
    report["pass"]=True
    report["remaining"]=["opaque renders"]
    (out/"export-audit.json").write_text(json.dumps(report,indent=2)+"\n")

    # A review scene is constructed from the exact audited exports. Original
    # editable authoring scene above is retained byte-for-byte as a separate file.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(native))
    scene=bpy.context.scene
    native_objects=list(scene.objects)
    for o in native_objects:
        o.hide_render=True
    scene.unit_settings.system="METRIC"
    scene.render.engine="CYCLES"
    scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.render.resolution_x=1200
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.image_settings.color_mode="RGB"
    scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new("WORLD-floor-contact-review")
    scene.world.color=(.06,.075,.09)
    light_data=bpy.data.lights.new("LIGHT-review-key","SUN")
    light_data.energy=3
    light=bpy.data.objects.new(light_data.name,light_data)
    scene.collection.objects.link(light)
    light.rotation_euler=(.35,-.4,-.25)
    camera=bpy.data.objects.new("CAMERA-floor-contact",bpy.data.cameras.new("CAMERA-floor-contact"))
    scene.collection.objects.link(camera)
    camera.data.type="ORTHO"
    camera.data.clip_start=.000001
    scene.camera=camera
    captures=[]
    def capture(name,objects,target,eye,scale):
        for o in scene.objects:
            if o.type=="MESH":
                o.hide_render=True
        for o in objects:
            o.hide_render=False
        camera.location=eye
        camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler()
        camera.data.ortho_scale=scale
        scene.render.filepath=str(out/(name+".png"))
        bpy.ops.render.render(write_still=True)
        captures.append({"path":name+".png","sha256":sha(out/(name+".png")),"visibleMeshes":[o.name for o in objects],
                         "targetM":target,"cameraM":eye,"orthoScaleM":scale})
    pairs={}
    for profile in spec["profiles"]:
        sid=profile["floorId"]
        originals=[o for o in native_objects if o.name.startswith(profile["nodePrefix"])]
        before=set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(out/(sid+".glb")))
        added=[o for o in scene.objects if o not in before and o.type=="MESH"]
        pairs[sid]=(originals,added)
        points=profile["footprintM"]
        cx=sum(p[0] for p in points)/len(points)
        cy=sum(p[1] for p in points)/len(points)
        size=max(max(p[i] for p in points)-min(p[i] for p in points) for i in [0,1])
        capture("combined-"+sid,originals+added,(cx,cy,.1),(cx+size*.5,cy-size,size),size*1.55)
    originals,added=pairs["square-2m"]
    capture("square-original",originals,(1,1,.1),(2,-2,3),3.1)
    capture("square-adapter-only",added,(1,1,.185),(2,-2,3),3.1)
    capture("square-adapter-underside",added,(1,1,.185),(2,-2,-2),3.1)
    duplicates=[]
    for o in originals+added:
        copy=o.copy()
        copy.name="GEO-seam-second-"+o.name
        scene.collection.objects.link(copy)
        copy.location.x+=2
        duplicates.append(copy)
    combined=originals+added+duplicates
    capture("two-square-seam-top",combined,(2,.004,.1875),(2,.004,.25),.03)
    capture("two-square-seam-section",combined,(2,.002,.184),(2,-.045,.21),.03)
    capture("two-square-contact-assembly",combined,(2,1,.1),(3,-3,4),5)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/"export-review.blend"))
    (out/"capture.json").write_text(json.dumps({"engine":"Blender Cycles CPU","blender":bpy.app.version_string,
        "resolution":[1200,900],"samples":24,"opaque":True,"captures":captures,
        "sourcePins":{profile["floorId"]:sha(out/(profile["floorId"]+".glb")) for profile in spec["profiles"]},
        "nativeFloorSha256":sha(native),"scope":"Native geometry review only; no game installation or pressure qualification."},indent=2)+"\n")
    report["remaining"]=["root window/door whole-assembly contact re-audit","browser and game evidence","owner exact-revision art sign-off","physical authority qualification"]
    report["opaqueRenders"]=len(captures)
    report["editableSourceSha256"]=sha(out/"blender-source.blend")
    report["exportReviewSceneSha256"]=sha(out/"export-review.blend")
    (out/"export-audit.json").write_text(json.dumps(report,indent=2)+"\n")


if __name__ == "__main__":
    import sys
    if "--" in sys.argv:
        arguments = sys.argv[sys.argv.index("--")+1:]
        if arguments[0] == "audit":
            export_audit(Path(arguments[1]).resolve(),Path(arguments[2]).resolve())
        elif arguments[0] == "author":
            author(Path(arguments[1]).resolve(), "--square-only" in arguments)
        else:
            baseline_render(Path(arguments[0]).resolve())
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--preflight", action="store_true")
        parser.add_argument("--author", action="store_true")
        parser.add_argument("--square-only", action="store_true")
        parser.add_argument("--audit-source", type=int)
        parser.add_argument("--revision", type=int, required=True)
        args = parser.parse_args()
        assert args.revision >= 0
        out = DESIGN/"revisions"/f"r{args.revision:03}"
        if args.preflight:
            preflight(out)
        else:
            assert args.author or args.audit_source is not None
            import tomllib
            sys.path.insert(0, str(ROOT))
            from scripts.dev import run
            cfg = tomllib.loads((ROOT/"dev.toml").read_text())
            mode = (["audit",str(out),str(DESIGN/"revisions"/f"r{args.audit_source:03}")]
                    if args.audit_source is not None else ["author",str(out)]+(["--square-only"] if args.square_only else []))
            run([cfg["art"]["blender"], "--background", "--threads", "2", "--python-exit-code", "1",
                 "--python", str(Path(__file__).resolve()), "--"]+mode)
