"""Render connected armour and stencil markings through the installed Blender MCP."""
from pathlib import Path
import asyncio
from datetime import timedelta
import json
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from PIL import Image
from pack_tiles import contact_sheet
from starter_content import package
from verify_exterior import validate_frame
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/exterior'

def tool_output(result):
    response='\n'.join(c.text for c in result.content if c.type=='text')
    try:
        envelope=json.loads(response)
    except ValueError:
        envelope={}
    if result.isError or envelope.get('status')=='error' or envelope.get('error'):
        raise RuntimeError(response[-3000:])
    return envelope.get('result',{}).get('output',response)

async def build():
    OUT.mkdir(parents=True,exist_ok=True)
    themes=json.loads((ROOT/'scripts/art/themes.json').read_text())['themes']
    params=StdioServerParameters(command=str(ROOT/'scripts/siderealctl'),args=['art-mcp','--build-session'])
    with (OUT/'mcp.log').open('w') as log:
        async with stdio_client(params,errlog=log) as (read,write):
            async with ClientSession(read,write) as session:
                await session.initialize()
                probe=await session.call_tool('get_scene_info',{'user_prompt':'Create original connected ship armour, faction decals and stencil markings.'})
                if probe.isError: raise RuntimeError(str(probe.content)[-1000:])
                code='OUTPUT='+repr(str(OUT))+'\nTHEMES='+repr(themes)+'\n'
                code+=(ROOT/'scripts/art/space_tiles_scene.py').read_text().split('bpy.ops.object.select_all')[0]
                code+=(ROOT/'scripts/art/exterior_scene.py').read_text()
                result=await session.call_tool('execute_blender_code',{'code':code},read_timeout_seconds=timedelta(minutes=3))
                response=tool_output(result)
                line=next((l for l in response.splitlines() if l.startswith('EXTERIOR_MANIFEST=')),None)
                if not line: raise RuntimeError(response[-3000:])
                manifest=json.loads(line.split('=',1)[1]); (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
                for theme in themes:
                    code="import bpy\nscene=bpy.data.scenes['Sidereal exterior']\nbpy.context.window.scene=scene\n"
                    code+='COLORS='+repr(theme['colors_srgb'])+'\n'
                    code+='ROOF_MIXES='+repr(manifest['roof_material_mixes'])+'\n'
                    code+='''for mat in bpy.data.materials:
    if not mat.name.startswith('MAT-'): continue
    name=mat.name[4:]
    def linear_color(key):
        rgb=tuple(int(COLORS[key][i:i+2],16)/255 for i in (1,3,5))
        return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    if name in ROOF_MIXES:
        a,b,blend=ROOF_MIXES[name]
        rgb=tuple(x*(1-blend)+y*blend for x,y in zip(linear_color(a),linear_color(b)))
    elif name in COLORS: rgb=linear_color(name)
    else: continue
    mat.node_tree.nodes.clear()
    output=mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    surface=mat.node_tree.nodes.new('ShaderNodeEmission')
    surface.inputs[0].default_value=(*rgb,1)
    mat.node_tree.links.new(surface.outputs[0],output.inputs['Surface'])
'''
                    code+=f"scene.render.filepath={str(OUT/(theme['id']+'.png'))!r}\nbpy.ops.render.render(write_still=True)\nprint('EXTERIOR_RENDERED')\n"
                    result=await session.call_tool('execute_blender_code',{'code':code},read_timeout_seconds=timedelta(minutes=3))
                    if 'EXTERIOR_RENDERED' not in tool_output(result):
                        raise RuntimeError('Blender did not complete the render; refusing to package stale atlas files')
                    print('Rendered '+theme['name'],flush=True)
    # Stage and validate the entire kit before replacing any canonical source.
    for theme in themes:
        source=Image.open(OUT/(theme['id']+'.png')).convert('RGBA')
        assert source.size==tuple(manifest['source_atlas_px']), 'stale atlas dimensions'
        target=OUT/'tiles'/theme['id']; target.mkdir(parents=True,exist_ok=True)
        palette=source.convert('RGB').quantize(colors=64,dither=Image.Dither.NONE)
        for tile in manifest['tiles']:
            x,y,w,h=tile['source_frame_px']; frame=source.crop((x,y,x+w,y+h)).resize((w//2,h//2),Image.Resampling.NEAREST)
            alpha=frame.getchannel('A').point(lambda v:255 if v>=128 else 0)
            frame=frame.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA');frame.putalpha(alpha)
            validate_frame(tile,frame)
            frame.save(target/(tile['name']+'.png'))
        contact_sheet(OUT,manifest,target,theme['id']+'_board.png',theme['name']+' / Connected armour')
    for theme in themes:
        target=ROOT/'data/sprites/exterior'/theme['id']; target.mkdir(parents=True,exist_ok=True)
        for tile in manifest['tiles']:
            path=target/(tile['name']+'.png')
            path.write_bytes((OUT/'tiles'/theme['id']/path.name).read_bytes())
            asset='exterior.'+theme['id']+'.'+tile['name']
            package('asset','assets',asset,{'asset_id':asset,'source_path':str(path.relative_to(ROOT/'data')),
                'content_type':'image/png','bootstrap_required':False,'startup_required':False,'dependencies':[],
                'editor_preview':None,'editor_schema':None,'shader_family':None})
    print('Prepared authored source packages for continuous roofs, perimeter joins and separate markings in six themes.',flush=True)

if __name__=='__main__': asyncio.run(build())
