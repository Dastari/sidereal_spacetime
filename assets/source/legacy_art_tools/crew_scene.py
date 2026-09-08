"""Original overhead crew geometry, evaluated only through the local Blender MCP.

Every pose is editable geometry. Layer atlases share identical pivots and timing.
The eight actions are independent poses, not copies of a walk strip.
"""
import bpy
import math
import json

scene = bpy.data.scenes.new('Sidereal crew')
bpy.context.window.scene = scene
layers = ['body', 'skin', 'hair', 'suit', 'accent', 'helmet']
animations = [('idle', 4, 4), ('walk', 8, 10), ('run', 8, 14), ('seated', 4, 4),
              ('interact', 6, 8), ('float', 4, 5), ('thrust', 4, 8), ('hurt', 3, 10), ('downed', 7, 9)]
materials = {}
for name, color in [('light', (.65,.68,.72,1)), ('dark', (.035,.045,.06,1)), ('white', (.8,.8,.8,1)),
                     ('visor', (.015,.30,.43,1)), ('shine', (.12,.85,1,1))]:
    mat = bpy.data.materials.new('CREW-'+name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = .65
    materials[name] = mat

def part(name, layer, center, size, material='light', sphere=False, angle=0):
    if sphere:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=center)
    else:
        bpy.ops.mesh.primitive_cube_add(size=2, location=center)
    obj = bpy.context.object
    obj.name = 'GEO-crew-' + name
    obj['crew_layer'] = layer
    obj.scale = size
    obj.rotation_euler.z = angle
    obj.data.materials.append(materials[material])
    if not sphere:
        bevel = obj.modifiers.new('Machined soft edges', 'BEVEL')
        bevel.width = .12
        bevel.segments = 2
    return obj

frame = 0
metadata = []
for action, count, fps in animations:
    metadata.append({'name': action, 'start': frame, 'frames': count, 'fps': fps, 'loop': action not in ('hurt','downed')})
    for n in range(count):
        phase = n / count * math.tau
        ox, oy = (frame % 8 + .5) * 1.8, -(frame // 8 + .5) * 1.8
        breath = math.sin(phase) * .008
        stride = math.sin(phase) * (.23 if action == 'walk' else .35 if action == 'run' else .025)
        spread = .15 if action in ('float','thrust') else 0
        seated = action == 'seated'
        reach = (1 - math.cos(phase)) * .14 if action == 'interact' else 0
        hurt = math.sin(n / max(count-1,1) * math.pi) * .18 if action == 'hurt' else 0
        fall = n / max(count-1,1) if action == 'downed' else 0
        def p(label, layer, xyz, scale, mat='light', sphere=False, angle=0):
            # The falling animation stretches the visible torso and lowers the head toward the deck.
            x,y,z=xyz
            return part(f'{action}-{n}-{label}',layer,(ox+x+hurt,oy+y-fall*.28,z),scale,mat,sphere,angle)
        for side in (-1,1):
            foot_y = .23 if seated else side*stride-.18-fall*.25
            p('leg'+str(side),'body',(side*.115,foot_y,.16),(.087,.22,.085),'dark',True)
            p('boot'+str(side),'body',(side*.115,foot_y+.15,.18),(.09,.12,.085),'light')
            p('shin-shell'+str(side),'suit',(side*.115,foot_y,.255),(.065,.13,.025),'white')
            arm_x = side*(.265+spread)
            hand_y = .25 if seated else -.04-side*stride*.62+reach
            p('upper-arm'+str(side),'body',(arm_x,.025,.43+breath),(.09,.16,.085),'light',True,side*.15)
            p('forearm'+str(side),'body',(arm_x,hand_y,.37),(.075,.14,.07),'dark',True)
            p('hand'+str(side),'skin',(arm_x,hand_y+.09,.45),(.064,.075,.035),'white',True)
            p('gauntlet'+str(side),'suit',(arm_x,hand_y+.075,.49),(.071,.085,.026),'white')
            p('pauldron'+str(side),'suit',(side*.225,.07,.56+breath),(.115,.115,.055),'white',True)
            p('rank'+str(side),'accent',(side*.23,.075,.617+breath),(.065,.025,.006),'white')
        p('torso','body',(0,-fall*.12,.38+breath),(.21,.24+fall*.12,.11),'light',True)
        p('belt','body',(0,-.15,.46),(.21,.036,.035),'dark')
        p('buckle','accent',(0,-.15,.50),(.037,.024,.009),'white')
        p('neck','skin',(0,.14,.61),(.08,.08,.04),'white',True)
        p('head','skin',(0,.16-fall*.1,.70),(.14,.15,.085),'white',True)
        p('hair','hair',(0,.12-fall*.1,.774),(.142,.115,.018),'white',True)
        p('fringe','hair',(0,.255-fall*.1,.753),(.105,.035,.022),'white')
        p('backpack','suit',(0,-.21,.53),(.16,.11,.09),'dark')
        p('oxygen-left','suit',(-.12,-.25,.6),(.06,.09,.06),'white',True)
        p('oxygen-right','suit',(.12,-.25,.6),(.06,.09,.06),'white',True)
        p('chest-shell','suit',(0,-.04,.515+breath),(.16,.12,.026),'white')
        p('pack-band','accent',(0,-.25,.676),(.12,.032,.006),'white')
        p('helmet-ring','helmet',(0,.14-fall*.1,.77),(.19,.19,.025),'dark',True)
        p('helmet-shell','helmet',(0,.135-fall*.1,.82),(.175,.17,.07),'white',True)
        p('visor','helmet',(0,.255-fall*.1,.854),(.137,.077,.025),'visor',True)
        p('visor-glint','helmet',(-.045,.277-fall*.1,.88),(.065,.012,.006),'shine')
        frame += 1

scene['crew_manifest'] = json.dumps({'animations':metadata,'frame_count':frame,'layers':layers,'columns':8,'rows':6,'frame_px':64,'size_m':1.8})
bpy.ops.object.camera_add(location=(7.2,-5.4,20))
camera = bpy.context.object
camera.name = 'CAM-crew-true-overhead'
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 14.4
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = 1024
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.world = bpy.data.worlds.new('Crew ambient')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.8,.85,1,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
light = bpy.data.lights.new('Crew key','SUN')
light.energy = 2
obj = bpy.data.objects.new('Crew key',light)
scene.collection.objects.link(obj)
obj.rotation_euler = (.35,-.45,-.4)
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT+'/crew.blend')
print('SIDEREAL_CREW='+scene['crew_manifest'])
