"""CPU source look proofs, using the exact same sRGB palette as the runtime presets."""
import bpy, json
from mathutils import Vector
from pathlib import Path
from build_crew_archetypes import LOOKS

def linear(hex_color):
    rgb=[int(hex_color[i:i+2],16)/255 for i in [1,3,5]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)

def visible(slot,look,profile):
    if slot=='body':return True
    for kind,key in [('body','bodyStyle'),('armor','armor')]:
        if slot.startswith(kind+'-'):return slot==kind+'-'+profile[key]
    if slot.startswith('look-'):return slot=='look-'+look
    if slot.startswith('hair-'):return profile['helmet']=='none' and slot=='hair-'+profile['hairStyle']
    if slot=='helmet-standard':return profile['helmet'] in ['open','closed']
    if slot=='visor-standard':return profile['helmet']=='closed'
    if slot.startswith('helmet-'):return slot=='helmet-'+profile['helmet']
    if slot.startswith('backpack-'):return slot=='backpack-'+profile['backpackStyle']
    return False

def apply_look(look,parts,materials):
    profile=LOOKS[look]
    for role,mat in materials.items():
        color=profile.get(role)
        if not color:continue
        rgb=linear(color);p=mat.node_tree.nodes.get('Principled BSDF');alpha=.82 if role=='visor' else 1
        p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Alpha'].default_value=alpha;mat.diffuse_color=(*rgb,alpha)
        if role=='light':p.inputs['Emission Color'].default_value=(*rgb,1)
    for o in parts:o.hide_render=not visible(o.get('attachment','body'),look,profile)

def render_looks(scene,parts,materials,out):
    target=out/'looks';target.mkdir(parents=True,exist_ok=True)
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=480;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.camera.data.ortho_scale=2.55
    entries=[]
    camera_position=scene.camera.location.copy();camera_rotation=scene.camera.rotation_euler.copy()
    views=target/'views';views.mkdir(exist_ok=True)
    for look,profile in LOOKS.items():
        apply_look(look,parts,materials)
        scene.render.filepath=str(target/(look+'.png'));bpy.ops.render.render(write_still=True)
        for view,position in [('front',(0,-6,2.35)),('side',(6,0,2.35)),('rear',(0,6,2.35))]:
            scene.camera.location=position;scene.camera.rotation_euler=(Vector((0,0,1.03))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(views/(look+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
        scene.camera.location=camera_position;scene.camera.rotation_euler=camera_rotation
        entries.append({'id':look,'name':profile['name'],'file':'looks/'+look+'.png','visibleSolids':sum(not o.hide_render for o in parts),'palette':{k:v for k,v in profile.items() if isinstance(v,str) and v.startswith('#')}})
    (target/'manifest.json').write_text(json.dumps({'schema':1,'source':'assets/source/crew-astra.blend','palette':'packages/content/src/crew-looks.json','renderer':'Blender CPU Cycles24','entries':entries},indent=2)+'\n')
    apply_look('engineer',parts,materials)
    scene.render.filepath=str(out/'portrait.png');bpy.ops.render.render(write_still=True)
