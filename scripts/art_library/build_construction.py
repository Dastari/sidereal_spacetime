"""Six reference-led construction studies, isolated from published game assets.

Run through npm run art:library:construction. Blender X/Y/Z are width/depth/up.
This is an initial reconstruction, not a claim of final reference fidelity.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"scripts"))
from voxelize_blender import voxelize

args=json.loads(Path(sys.argv[sys.argv.index("--")+1]).read_text())
PALETTE={13:("structure","393957",.5,.47,0),14:("pale enamel","b8b9cf",.25,.39,0),
         15:("burgundy service","8e345b",.3,.43,0),5:("copper","cf824c",.75,.34,0),
         7:("cyan emitter","6fcabd",.15,.3,3),25:("steel","939bb7",.78,.32,0),
         26:("cool pale","aab2c9",.28,.42,0),27:("light pale","ced0df",.25,.4,0)}


def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4


for job in args:
    out=ROOT/job["output"]
    out.mkdir(parents=True,exist_ok=True)
    if (out/"blender-source.blend").exists():raise ValueError("Never overwrite an existing source revision")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene;scene.unit_settings.system="METRIC";scene.unit_settings.scale_length=1
    mats={}
    for key,(role,color,metal,rough,emission) in PALETTE.items():
        m=bpy.data.materials.new(f"MAT-{key}-{role}");m.use_nodes=True;m["voxel_material_id"]=key
        rgb=tuple(linear(int(color[i:i+2],16)/255) for i in (0,2,4))
        p=m.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=(*rgb,1)
        p.inputs["Metallic"].default_value=metal;p.inputs["Roughness"].default_value=rough
        p.inputs["Emission Color"].default_value=(*rgb,1);p.inputs["Emission Strength"].default_value=emission
        mats[key]=m

    def box(name,position,size,material=14,bevel=.012,priority=1):
        bpy.ops.mesh.primitive_cube_add(size=1,location=position)
        o=bpy.context.object;o.name="GEO-"+name;o.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        o.data.materials.append(mats[material]);o["voxel_priority"]=priority
        if bevel:
            mod=o.modifiers.new("Restrained machined bevel","BEVEL");mod.width=bevel;mod.segments=2
        return o

    def wall(prefix="wall",rotation=0,shift=(0,0,0)):
        start=set(bpy.data.objects)
        box(prefix+"-sealed-core",(0,0,1.25),(2,.25,2.5),13,0,0)
        # Datum-owned jamb courses continue from bottom to the 2.5 m cap.
        for side in [-1,1]:
            for row in range(10):
                box(f"{prefix}-jamb-{side}-{row}",(side*.875,-.015625,.125+row*.25),(.25,.375,.21875),[14,26,27,14][row%4],.01,2)
        for row in [0,9]:
            for col in range(6):
                box(f"{prefix}-rail-{row}-{col}",(-.625+col*.25,-.015625,.125+row*.25),(.21875,.375,.21875),14,.01,2)
        for row in range(8):
            for col in range(4):
                box(f"{prefix}-face-course-{row}-{col}",(-.5625+col*.375,-.15625,.375+row*.25),(.34375,.09375,.21875),[14,26,14,27][(col+row)%4],.01,3)
        # The reference's long cyan service strip is on the right, in a dark well.
        box(prefix+"-emitter-well",(.6875,-.203125,1.25),(.1875,.09375,1.75),13,.015,4)
        box(prefix+"-thin-cyan-insert",(.6875,-.265625,1.25),(.0625,.0625,1.375),7,.01,5)
        box(prefix+"-service-panel",(-.28125,-.21875,1.25),(.625,.09375,1.25),26,.02,4)
        box(prefix+"-access-hatch",(-.28125,-.28125,.875),(.3125,.0625,.4375),15,.015,5)
        box(prefix+"-handle",(-.21875,-.328125,.9375),(.0625,.03125,.125),25,.003,6)
        for col in range(4):
            box(f"{prefix}-vent-slot-{col}",(-.4375+col*.09375,-.28125,1.625),(.0625,.0625,.25),13,.005,5)
        for x in [-.625,.3125]:
            for z in [.4375,2.0625]:box(f"{prefix}-latch-{x}-{z}",(x,-.234375,z),(.0625,.0625,.125),25,.008,5)
        # Hidden rear design is a deliberate simple service backing, not observed.
        for row in range(4):
            box(f"{prefix}-inferred-rear-plate-{row}",(0,.15625,.5+row*.5),(1.4375,.0625,.4375),26,.015,2)
        for o in set(bpy.data.objects)-start:
            x,y,z=o.location;o.location=(x*math.cos(rotation)-y*math.sin(rotation)+shift[0],x*math.sin(rotation)+y*math.cos(rotation)+shift[1],z+shift[2]);o.rotation_euler.z+=rotation

    def slab(name,roof=False):
        box(name+"-pressure-core",(0,0,.09375),(2,2,.1875),13,0,0)
        for axis in [0,1]:
            for side in [-1,1]:
                for i in range(8):
                    loc=[-.875+i*.25,side*.875,.171875]
                    if axis:loc[0],loc[1]=loc[1],loc[0]
                    size=(.21875,.25,.15625) if not axis else (.25,.21875,.15625)
                    box(f"{name}-rim-{axis}-{side}-{i}",loc,size,[14,26,27,14][i%4],.01,2)
        if roof:
            box(name+"-inset-vent-well",(0,0,.15625),(1.375,1.375,.125),13,.02,2)
            for i in range(7):box(f"{name}-vent-louver-{i}",(0,-.5625+i*.1875,.21875),(1.125,.09375,.125),25,.008,3)
        else:
            for x in [-.375,.375]:
                for y in [-.375,.375]:box(f"{name}-walking-panel-{x}-{y}",(x,y,.203125),(.71875,.71875,.09375),26,.012,2)
            for side in [-1,1]:
                for i in range(3):box(f"{name}-hazard-{side}-{i}",(-.5+i*.5,side*.734375,.25),(.125,.0625,.03125),5,.002,4)

    variant=job["variant"]
    if variant=="wall":wall()
    elif variant=="corner":
        wall("left",shift=(0,.8125,0))
        wall("right",rotation=math.pi/2,shift=(-.8125,0,0))
    elif variant in ["floor","roof"]:slab(variant,variant=="roof")
    elif variant=="hull":
        box("hull-sealed-core",(0,0,1),(2,2,2),13,0,0)
        for side in [-1,1]:
            for row in range(8):
                for col in range(8):
                    m=[14,26,27,14][(row+col)%4]
                    box(f"hull-front-course-{side}-{row}-{col}",(-.875+col*.25,side*.96875,.125+row*.25),(.21875,.0625,.21875),m,.008,2)
                    box(f"hull-side-course-{side}-{row}-{col}",(side*.96875,-.875+col*.25,.125+row*.25),(.0625,.21875,.21875),m,.008,2)
        for x in [-.625,-.125,.375,.75]:
            for y in [-.625,-.125,.375,.75]:box(f"hull-roof-plate-{x}-{y}",(x,y,1.984375),(.3125,.3125,.03125),14,.005,3)
        box("hull-burgundy-service-hatch",(.3125,-1.03125,.875),(.6875,.0625,1.125),15,.018,4)
        for z in [.625,1.25]:box(f"hull-hatch-latch-{z}",(.5,-1.09375,z),(.125,.0625,.125),13,.008,5)
        box("hull-right-recess",(1.03125,0,1),(.0625,1.25,1.25),13,.02,4)
        box("hull-cyan-service-screen",(1.09375,0,1),(.0625,.8125,.75),7,.02,5)
    elif variant=="base":
        box("utility-foundation",(0,0,.4375),(2,2,.875),13,.02,0)
        for x in [-.875,.875]:
            for y in [-.875,.875]:
                for z in [.15625,.4375,.71875]:box(f"base-corner-{x}-{y}-{z}",(x,y,z),(.25,.25,.25),25,.015,2)
        for side in [-1,1]:
            for i in range(6):
                box(f"base-rib-{side}-{i}",(-.6875+i*.28125,side*.90625,.4375),(.125,.1875,.5),25,.012,2)
                box(f"base-copper-union-{side}-{i}",(-.6875+i*.28125,side*.984375,.375),(.125,.03125,.1875),5,.005,3)
        for x in [-.5,.5]:
            for y in [-.5,.5]:box(f"base-top-access-{x}-{y}",(x,y,.890625),(.875,.875,.09375),13,.02,2)
    else:raise ValueError(variant)

    # Named interfaces remain editable. Preview geometry never installs an item.
    for name,loc in [("SOCK_EAST",(1,0,0)),("SOCK_WEST",(-1,0,0)),("SOCK_BOTTOM",(0,0,0))]:
        obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj);obj.location=loc;obj.empty_display_size=.15
    scene["reference_id"]=job["reference_id"];scene["design_id"]=job["design_id"];scene["design_revision"]=job["revision"]
    scene["status"]="Unapproved reconstruction draft; underside/back faces inferred"
    bpy.context.view_layer.update()
    meshes=[o for o in scene.objects if o.type=="MESH"]
    points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
    center=Vector([(a+b)/2 for a,b in zip(low,high)])
    size=[b-a for a,b in zip(low,high)]
    # Use the same material-preserving closed-solid sampler as the active pipeline.
    cell=.03125
    samples=voxelize(meshes,cell)
    (out/"samples.json").write_text(json.dumps(samples))
    bpy.ops.export_scene.gltf(filepath=str(out/"original.glb"),export_format="GLB",export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
    scene.render.engine="CYCLES";scene.cycles.device="CPU";scene.cycles.samples=64;scene.cycles.use_denoising=False
    scene.render.resolution_x=896;scene.render.resolution_y=896;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG";scene.render.image_settings.color_mode="RGBA";scene.render.film_transparent=True
    scene.view_settings.view_transform="AgX"
    world=bpy.data.worlds.new("Neutral review world");world.use_nodes=True;world.node_tree.nodes["Background"].inputs[0].default_value=(.3,.35,.45,1);world.node_tree.nodes["Background"].inputs[1].default_value=.4;scene.world=world
    for name,loc,energy,color in [("Key",(-4,-6,7),1200,(1,.94,.87)),("Fill",(5,-2,4),900,(.7,.82,1)),("Rim",(1,4,6),1400,(.85,.9,1))]:
        data=bpy.data.lights.new(name,"AREA");data.energy=energy;data.shape="DISK";data.size=4;data.color=color
        light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=Vector(loc)+center
        light.rotation_euler=(center-light.location).to_track_quat("-Z","Y").to_euler()
    data=bpy.data.cameras.new("CAM-Reference-review");cam=bpy.data.objects.new("CAM-Reference-review",data);scene.collection.objects.link(cam);scene.camera=cam;data.type="ORTHO"
    cam.location=center+Vector((6,-8,math.sqrt(50)));cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler()
    data.ortho_scale=max(size)*1.62
    bpy.ops.wm.save_as_mainfile(filepath=str(out/"blender-source.blend"))
    scene.render.filepath=str(out/"cutout.png");bpy.ops.render.render(write_still=True)
    cam.location=center+Vector((0,0,10));cam.rotation_euler=(0,0,0);data.ortho_scale=max(size[0],size[1])*1.3
    scene.render.filepath=str(out/"blender-top.png");bpy.ops.render.render(write_still=True)
    report={"status":"draft-unapproved","blender":bpy.app.version_string,"reference_id":job["reference_id"],"axes":"Blender X width / Y depth / Z up; runtime X / height / -Y", "bounds_m":{"min":low,"max":high,"size":size},"cell_meters":cell,"occupied_cells":len(samples["cells"]),"closed_source_solids":len(meshes),"material_roles":list(PALETTE.values()),"camera":{"projection":"orthographic","elevation_degrees":35.2643897,"azimuth_vector":[6,-8],"resolution":[896,896],"lighting":"Three area lights, neutral world, AgX, bloom off"},"known_differences":["Source 1 m labels replaced by active 2 m construction scale","Back and underside are explicitly inferred","Source tiny greebles simplified; exact interlocking interfaces need adjacent-kit review","Source GLB is a high-detail authoring export; voxel mesh is a separate generated artifact","No in-game placement, collision/pressure authority or final owner sign-off"],"files":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}}
    (out/"validation.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"completed":job["design_id"],"bounds_m":size,"cells":len(samples["cells"])}),flush=True)
