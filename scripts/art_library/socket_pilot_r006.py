import bpy,math
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r006';bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'))
socket=bpy.data.objects.new('SOCKET-Future bridge door',None);bpy.context.scene.collection.objects.link(socket);socket.location=(0,8.8125,1.25);socket.rotation_euler.x=math.pi/2;socket.empty_display_type='ARROWS';socket.empty_display_size=.3;socket['purpose']='Future separate door mount; no door geometry or authority';socket['clear_width_m']=1.25;socket['structural_height_m']=2.125
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
