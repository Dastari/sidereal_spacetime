"""Blender-authored, provisional crew join/idle refit from the immutable r002 GLBs.

Run: blender -b --factory-startup -P scripts/art_library/refit_crew_joints.py
The study directory is never needed. Original topology, skins, materials and unrelated
binary channels survive export; only edited position/normal and idle rotation accessors
are replaced. The editable Blender scene records each mesh's source accessor.
"""
import hashlib
import json
import math
from pathlib import Path
import struct

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/runtime/crew/study-v2-r002"
OUT = ROOT / "assets/runtime/crew/refit-r001"
BLEND = ROOT / "assets/source/crew-refit/r001/crew.blend"
CATALOG = ROOT / "packages/content/src/crew-refit.catalog.json"
AXIS = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
COMPONENTS = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Glb:
    def __init__(self, file):
        self.file = file
        self.original = (SOURCE / file).read_bytes()
        size, kind = struct.unpack_from("<II", self.original, 12)
        assert kind == 0x4E4F534A
        self.doc = json.loads(self.original[20:20 + size])
        binary_size, kind = struct.unpack_from("<II", self.original, 20 + size)
        assert kind == 0x004E4942
        self.binary = bytearray(self.original[28 + size:28 + size + binary_size])
        self.changed = set()

    def rows(self, index):
        a = self.doc["accessors"][index]
        assert "sparse" not in a
        view = self.doc["bufferViews"][a["bufferView"]]
        fmt = "<" + COMPONENTS[a["componentType"]] * WIDTH[a["type"]]
        stride = view.get("byteStride", struct.calcsize(fmt))
        start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from(fmt, self.binary, start + i * stride) for i in range(a["count"])]

    def replace(self, index, rows):
        a = self.doc["accessors"][index]
        assert len(rows) == a["count"] and a["componentType"] == 5126
        view = self.doc["bufferViews"][a["bufferView"]]
        fmt = "<" + "f" * WIDTH[a["type"]]
        stride = view.get("byteStride", struct.calcsize(fmt))
        start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        for i, row in enumerate(rows):
            struct.pack_into(fmt, self.binary, start + i * stride, *row)
        for field, fn in [("min", min), ("max", max)]:
            if field in a:
                a[field] = [fn(row[k] for row in rows) for k in range(WIDTH[a["type"]])]
        self.changed.add(index)

    def write(self):
        payload = json.dumps(self.doc, separators=(",", ":")).encode()
        payload += b" " * (-len(payload) % 4)
        binary = bytes(self.binary)
        binary += b"\0" * (-len(binary) % 4)
        result = (struct.pack("<III", 0x46546C67, 2, 28 + len(payload) + len(binary))
                  + struct.pack("<II", len(payload), 0x4E4F534A) + payload
                  + struct.pack("<II", len(binary), 0x004E4942) + binary)
        destination = OUT / self.file
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(result)
        return {"sha256": sha(result), "bytes": len(result), "sourceSha256": sha(self.original),
                "changedAccessors": sorted(self.changed)}


def clamp(value):
    return max(0.0, min(1.0, value))


def shape(co, bone, garment, coat, decoration=False):
    """Edit in Blender's Z-up metres; rig pivots and the grip tunnel remain fixed."""
    x, y, z = (v * 32 for v in co)
    absolute = abs(x)
    sign = 1 if x >= 0 else -1
    if coat and bone == "spine":
        # The study deliberately left a belt gap: its front panel ends at 25.3
        # vox while the skirt starts at 23.6. Close that cut for ordinary coats.
        if decoration:
            # Lower fasteners move with the extended panel without stretching.
            z -= 1.9 * clamp((27.0 - (26.2 if z < 27.0 else 28.0)) / 1.7)
        else:
            z -= 1.9 * clamp((27.0 - z) / 1.7)
    elif coat and bone == "pelvis":
        z += 0.65 * clamp((z - 23.0) / 1.7)
    if bone.startswith("shoulder."):
        # A broad, tapered armhole inside the torso, rather than a floating cap.
        x -= sign * 2.6 * clamp((10.0 - absolute) / 2.6)
    elif bone.startswith("upper_arm."):
        x -= sign * 2.2 * clamp((z - 31.0) / 4.0) * clamp((9.5 - absolute) / 2.0)
        # Keep the upper sleeve inside the elbow's rounded overlap.
        z -= 0.7 * clamp((28.3 - z) / 1.5)
    elif bone.startswith("forearm."):
        if garment:
            # Extend sleeve/cuff into the hand, including short sleeves' wrist bands.
            z -= 0.9 * clamp((23.0 - z) / 1.5)
        else:
            z += 0.7 * clamp((z - 26.3) / 1.3)
            z -= 0.4 * clamp((22.0 - z) / 1.0)
    elif bone.startswith("hand."):
        # Enclose the finger hinge inside the palm at every finger angle. Only
        # the knuckle side grows down; retain the authored grip-side clearance.
        z -= 1.4 * clamp((19.0 - z) / 1.5) * clamp((absolute - 8.3) / 1.4)
        z += 0.8 * clamp((z - 20.3) / 1.2)
    elif bone.startswith(("fingers.", "index.")):
        z += 0.55 * clamp((z - 17.3) / 1.0)
        # Remove the open line between the adjacent index and finger blocks.
        if bone.startswith("fingers."):
            y += 0.18 * clamp((y - 0.2) / 0.9)
        else:
            y -= 0.18 * clamp((1.9 - y) / 0.9)
    return Vector((x / 32, y / 32, z / 32))


def rest_matrix(doc, node, cache):
    if node in cache:
        return cache[node]
    n = doc["nodes"][node]
    if "matrix" in n:
        local = Matrix([n["matrix"][i:i + 4] for i in range(0, 16, 4)]).transposed()
    else:
        q = n.get("rotation", [0, 0, 0, 1])
        local = Matrix.LocRotScale(Vector(n.get("translation", [0, 0, 0])),
                                  Quaternion((q[3], q[0], q[1], q[2])),
                                  Vector(n.get("scale", [1, 1, 1])))
    parent = next((i for i, p in enumerate(doc["nodes"]) if node in p.get("children", [])), None)
    cache[node] = (rest_matrix(doc, parent, cache) @ local) if parent is not None else local
    return cache[node]


def armature(glb, collection):
    data = bpy.data.armatures.new("crew_rig-refit")
    ob = bpy.data.objects.new("crew_rig-refit", data)
    collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    joints = glb.doc["skins"][0]["joints"]
    cache, lookup = {}, {}
    for node in joints:
        name = glb.doc["nodes"][node]["name"]
        b = data.edit_bones.new(name)
        b.matrix = AXIS @ rest_matrix(glb.doc, node, cache) @ AXIS.inverted()
        b.length = 0.08
        lookup[node] = b
    for parent in joints:
        for child in glb.doc["nodes"][parent].get("children", []):
            if child in lookup:
                lookup[child].parent = lookup[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)
    return ob


def edit_meshes(glb):
    collection = bpy.data.collections.new(glb.file)
    bpy.context.scene.collection.children.link(collection)
    arm = armature(glb, collection)
    joints = [glb.doc["nodes"][i]["name"] for i in glb.doc["skins"][0]["joints"]]
    coat = any(id in glb.file for id in ("uniform.captain", "uniform.scientist"))
    for mi, mesh in enumerate(glb.doc["meshes"]):
        for pi, primitive in enumerate(mesh["primitives"]):
            attrs = primitive["attributes"]
            if not {"POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"} <= attrs.keys():
                continue
            positions, normals = glb.rows(attrs["POSITION"]), glb.rows(attrs["NORMAL"])
            material_name = glb.doc["materials"][primitive["material"]]["name"]
            decoration = material_name.startswith(("crew.accent", "crew.metal"))
            weights, indices = glb.rows(attrs["WEIGHTS_0"]), glb.rows(attrs["JOINTS_0"])
            bone_names = [joints[j[max(range(4), key=lambda k: w[k])]] for j, w in zip(indices, weights)]
            coords = [AXIS.to_3x3() @ Vector(p) for p in positions]
            edits, new_normals = [], []
            for co, normal, bone in zip(coords, normals, bone_names):
                edited = shape(co, bone, glb.file != "crew-body.glb", coat, decoration)
                edits.append(edited)
                # Transform authored bevel normals by the deformation's Jacobian.
                step = 1e-6
                columns = []
                for axis in range(3):
                    delta = Vector((0, 0, 0)); delta[axis] = step
                    columns.append((shape(co + delta, bone, glb.file != "crew-body.glb", coat, decoration)
                                    - shape(co - delta, bone, glb.file != "crew-body.glb", coat, decoration)) / (2 * step))
                jacobian = Matrix(columns).transposed()
                n = (jacobian.inverted().transposed() @ (AXIS.to_3x3() @ Vector(normal))).normalized()
                new_normals.append(n)
            faces = glb.rows(primitive["indices"])
            flat = [row[0] for row in faces]
            data = bpy.data.meshes.new(mesh["name"] + f"-p{pi}")
            data.from_pydata(edits, [], [flat[i:i + 3] for i in range(0, len(flat), 3)])
            patched_joints, patched_weights = list(indices), list(weights)
            for vi, (co, bone) in enumerate(zip(coords, bone_names)):
                if bone.startswith(("fingers.", "index.")):
                    # Root the proximal knuckles in the palm. Rigid finger
                    # blocks otherwise rotate away from it in relaxed/open poses.
                    hand = clamp((abs(co.x) * 32 - 8.6) / 1.6)
                    patched_joints[vi] = (joints.index(bone), joints.index("hand." + bone[-1]), 0, 0)
                    patched_weights[vi] = (1 - hand, hand, 0, 0)
                elif coat and bone in ("spine", "pelvis") and 22.0 <= co.z * 32 <= 26.0:
                    # A continuous waist transition; lower panels keep their thigh blend.
                    spine = clamp((co.z * 32 - 22.0) / 4.0)
                    patched_joints[vi] = (joints.index("spine"), joints.index("pelvis"), 0, 0)
                    patched_weights[vi] = (spine, 1 - spine, 0, 0)
            if patched_weights != weights:
                # JOINTS is integer data; retain layout while changing its values.
                a = glb.doc["accessors"][attrs["JOINTS_0"]]
                view = glb.doc["bufferViews"][a["bufferView"]]
                fmt = "<" + COMPONENTS[a["componentType"]] * 4
                stride = view.get("byteStride", struct.calcsize(fmt))
                offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
                for vi, row in enumerate(patched_joints):
                    struct.pack_into(fmt, glb.binary, offset + vi * stride, *row)
                glb.changed.add(attrs["JOINTS_0"])
                glb.replace(attrs["WEIGHTS_0"], patched_weights)
                indices, weights = patched_joints, patched_weights
            data.normals_split_custom_set_from_vertices(new_normals)
            ob = bpy.data.objects.new(mesh["name"] + f"-p{pi}", data)
            collection.objects.link(ob)
            ob["source_file"], ob["source_mesh"], ob["source_primitive"] = glb.file, mi, pi
            ob["position_accessor"] = attrs["POSITION"]
            for j, name in enumerate(joints):
                group = ob.vertex_groups.new(name=name)
                for vertex, (js, ws) in enumerate(zip(indices, weights)):
                    amount = sum(w for ji, w in zip(js, ws) if ji == j)
                    if amount > 0:
                        group.add([vertex], amount, "REPLACE")
            modifier = ob.modifiers.new("crew_rig", "ARMATURE"); modifier.object = arm
            ob.parent = arm
            mat_doc = glb.doc["materials"][primitive["material"]]
            mat = bpy.data.materials.get(mat_doc["name"]) or bpy.data.materials.new(mat_doc["name"])
            mat.diffuse_color = mat_doc.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])
            data.materials.append(mat)
            if "COLOR_0" in attrs:
                colours = data.color_attributes.new(name="COLOR_0", type="FLOAT_COLOR", domain="POINT")
                for vertex, colour in zip(colours.data, glb.rows(attrs["COLOR_0"])):
                    vertex.color = (*colour[:3], colour[3] if len(colour) == 4 else 1)
            if "TEXCOORD_0" in attrs:
                uv = data.uv_layers.new(name="TEXCOORD_0")
                values = glb.rows(attrs["TEXCOORD_0"])
                for loop in data.loops:
                    uv.data[loop.index].uv = values[loop.vertex_index]
            if any((co - old).length > 1e-8 for co, old in zip(edits, coords)):
                glb.replace(attrs["POSITION"], [tuple(AXIS.inverted().to_3x3() @ v.co) for v in data.vertices])
                glb.replace(attrs["NORMAL"], [tuple(AXIS.inverted().to_3x3() @ n) for n in new_normals])
    # Each fit remains editable, with others disabled to avoid coincident review surfaces.
    collection.hide_render = True
    collection.hide_viewport = True


def edit_idle(glb):
    """Bake the extra bend into idle only; no runtime pose offsets or grip changes."""
    idle = next(a for a in glb.doc["animations"] if a["name"] == "idle")
    action = bpy.data.actions.new("crew-refit-r001.idle")
    for channel in idle["channels"]:
        name = glb.doc["nodes"][channel["target"]["node"]]["name"]
        if channel["target"]["path"] != "rotation" or name not in ("forearm.R", "forearm.L"):
            continue
        sampler = idle["samplers"][channel["sampler"]]
        index = sampler["output"]
        # Do not mutate a sampler shared with another clip.
        assert all(a is idle or all(s["output"] != index for s in a["samplers"]) for a in glb.doc["animations"])
        bend = Quaternion((1, 0, 0), math.radians(16 if name.endswith("R") else 10))
        values = []
        for x, y, z, w in glb.rows(index):
            q = (Quaternion((w, x, y, z)) @ bend).normalized()
            values.append((q.x, q.y, q.z, q.w))
        glb.replace(index, values)
        frames = [r[0] * 24 + 1 for r in glb.rows(sampler["input"])]
        for component in range(4):
            curve = action.fcurves.new(data_path=f'pose.bones["{name}"].rotation_quaternion', index=component)
            curve.keyframe_points.add(len(values))
            for key, frame, value in zip(curve.keyframe_points, frames, values):
                # Blender's quaternion component order is w,x,y,z.
                key.co = (frame, value[(component + 3) % 4]); key.interpolation = "LINEAR"
    action.use_fake_user = True
    text = bpy.data.texts.new("idle-gltf-rotation-keys.json")
    text.write(json.dumps({"animation": "idle", "changedAccessors": sorted(glb.changed),
                           "quaternions": {str(i): glb.rows(i) for i in sorted(glb.changed)}}, indent=2))


def main():
    if OUT.exists() or BLEND.exists():
        raise FileExistsError("Immutable refit revision exists; author a new revision instead")
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    catalog = json.loads((ROOT / "packages/content/src/crew-study.catalog.json").read_text())
    files = [catalog["body"]["file"], catalog["animation"]["file"]]
    for id, part in catalog["parts"].items():
        if id.startswith(("uniform.", "gloves.")):
            files.extend(record["file"] for record in part["files"].values())
    records = {}
    for file in sorted(set(files)):
        glb = Glb(file)
        if file == catalog["animation"]["file"]:
            edit_idle(glb)
        else:
            edit_meshes(glb)
        if glb.changed:
            records[file] = glb.write()
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
    manifest = {"schema": "sidereal.crew-refit.v1", "revision": "refit-r001",
                "status": "provisional, not owner-approved", "sourceRevision": catalog["revision"],
                "sourceCommit": catalog["sourceCommit"], "sourceBlend": str(BLEND.relative_to(ROOT)),
                "sourceBlendSha256": sha(BLEND.read_bytes()), "files": records}
    CATALOG.write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"refitFiles": len(records), "blendBytes": BLEND.stat().st_size}))


if __name__ == "__main__":
    main()
