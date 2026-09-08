"""Build original layered avatar atlases using the configured Blender MCP; pack nearest pixels."""
import asyncio
import json
from datetime import timedelta
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from PIL import Image, ImageChops, ImageDraw
from starter_content import package

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/crew'

async def build():
    OUT.mkdir(parents=True,exist_ok=True)
    params=StdioServerParameters(command=str(ROOT/'scripts/siderealctl'),args=['art-mcp','--build-session'])
    with (OUT/'mcp.log').open('w') as log:
        async with stdio_client(params,errlog=log) as (read,write):
            async with ClientSession(read,write) as session:
                await session.initialize()
                scene=await session.call_tool('get_scene_info',{'user_prompt':'Create a customizable top-down crew avatar with spacesuit and full animations.'})
                if scene.isError: raise RuntimeError('Scene probe failed')
                code='OUTPUT='+repr(str(OUT))+'\n'+(ROOT/'scripts/art/crew_scene.py').read_text()
                result=await session.call_tool('execute_blender_code',{'code':code},read_timeout_seconds=timedelta(minutes=3))
                response='\n'.join(c.text for c in result.content if c.type=='text')
                if result.isError or 'SIDEREAL_CREW=' not in response: raise RuntimeError(response[-3000:])
                manifest=json.loads(next(l.partition('=')[2] for l in response.splitlines() if l.startswith('SIDEREAL_CREW=')))
                (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
                for layer in manifest['layers']:
                    code="import bpy\nscene=bpy.data.scenes['Sidereal crew']\nbpy.context.window.scene=scene\n"
                    code+=f"for obj in scene.objects:\n    if 'crew_layer' in obj: obj.hide_render = obj['crew_layer'] != {layer!r}\n"
                    code+=f"scene.render.filepath={str(OUT/('source_'+layer+'.png'))!r}\nbpy.ops.render.render(write_still=True)\nprint('CREW_LAYER_DONE')\n"
                    result=await session.call_tool('execute_blender_code',{'code':code},read_timeout_seconds=timedelta(minutes=3))
                    response='\n'.join(c.text for c in result.content if c.type=='text')
                    if result.isError or 'CREW_LAYER_DONE' not in response: raise RuntimeError(response[-3000:])
                    print('Rendered '+layer,flush=True)
    pack(manifest)

def pack(manifest):
    sheets={}
    for layer in manifest['layers']:
        im=Image.open(OUT/f'source_{layer}.png').convert('RGBA').resize((512,384),Image.Resampling.NEAREST)
        alpha=im.getchannel('A').point(lambda a:255 if a>=128 else 0)
        im=im.convert('RGB').quantize(colors=32,method=Image.Quantize.MEDIANCUT).convert('RGBA')
        im.putalpha(alpha)
        path=ROOT/'data/sprites/crew'/f'{layer}.png'
        path.parent.mkdir(parents=True,exist_ok=True)
        im.save(path)
        im.save(OUT/f'{layer}.png')
        sheets[layer]=im
        asset='crew.avatar.'+layer
        package('asset','assets',asset,{'asset_id':asset,'source_path':str(path.relative_to(ROOT/'data')),
            'content_type':'image/png','bootstrap_required':False,'startup_required':True,'dependencies':[],
            'editor_preview':None,'editor_schema':None,'shader_family':None})
    themes=[(170,180,192),(97,143,206),(206,210,221),(180,64,54),(75,149,109),(119,83,153)]
    def tint(im,color):
        result=ImageChops.multiply(im,Image.new('RGBA',im.size,(*color,255)))
        result.putalpha(im.getchannel('A'))
        return result
    def avatar(frame,palette,suit=True,helmet=True):
        box=(frame%8*64,frame//8*64,frame%8*64+64,frame//8*64+64)
        out=Image.new('RGBA',(64,64))
        for layer,color,show in [('body',palette,True),('skin',(196,147,113),True),('hair',(60,36,25),not helmet),
                                  ('suit',(225,232,237),suit),('accent',palette,suit),('helmet',(255,255,255),helmet)]:
            if show: out.alpha_composite(tint(sheets[layer].crop(box),color))
        return out
    board=Image.new('RGBA',(1152,760),(14,20,29,255))
    draw=ImageDraw.Draw(board)
    draw.text((24,12),'SIDEREAL / CREW 01    TRUE OVERHEAD / MODULAR OUTFITS',(220,230,240))
    for row,a in enumerate(manifest['animations']):
        draw.text((24,55+row*76),a['name'].upper(),(128,195,211))
        for n in range(a['frames']):
            board.alpha_composite(avatar(a['start']+n,themes[0]).resize((64,64),Image.Resampling.NEAREST),(145+n*72,38+row*76))
    for i,palette in enumerate(themes):
        board.alpha_composite(avatar(0,palette).resize((96,96),Image.Resampling.NEAREST),(810+i%3*108,60+i//3*115))
        board.alpha_composite(avatar(0,palette,False,False).resize((96,96),Image.Resampling.NEAREST),(810+i%3*108,330+i//3*115))
    board.save(OUT/'crew_board.png')
    frames=[]
    for f in range(8):
        tile=Image.new('RGBA',(512,320),(14,20,29,255))
        for i,palette in enumerate(themes):
            tile.alpha_composite(avatar(4+f,palette).resize((128,128),Image.Resampling.NEAREST),(20+i%3*160,10+i//3*150))
        frames.append(tile)
    frames[0].save(OUT/'crew_walk.png',save_all=True,append_images=frames[1:],duration=100,loop=0,disposal=0,blend=0)
    print('Packed 48 poses, six aligned customizable layers, nine animations and six outfit palettes.',flush=True)

if __name__=='__main__': asyncio.run(build())
