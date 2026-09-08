"""Blender MCP builds roof turret layers, previews and canonical source packages."""
from pathlib import Path
import asyncio,json
from datetime import timedelta
from mcp import ClientSession,StdioServerParameters
from mcp.client.stdio import stdio_client
from PIL import Image
from build_exterior import tool_output
from starter_content import package
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/turrets'
async def build():
    OUT.mkdir(parents=True,exist_ok=True)
    themes=json.loads((ROOT/'scripts/art/themes.json').read_text())['themes']
    params=StdioServerParameters(command=str(ROOT/'scripts/siderealctl'),args=['art-mcp','--build-session'])
    with (OUT/'mcp.log').open('w') as log:
        async with stdio_client(params,errlog=log) as (read,write):
            async with ClientSession(read,write) as session:
                await session.initialize()
                code='OUTPUT='+repr(str(OUT))+'\nTHEMES='+repr(themes)+'\n'
                code+=(ROOT/'scripts/art/space_tiles_scene.py').read_text().split('bpy.ops.object.select_all')[0]
                code+=(ROOT/'scripts/art/turret_scene.py').read_text()
                result=tool_output(await session.call_tool('execute_blender_code',{'code':code},read_timeout_seconds=timedelta(minutes=3)))
                line=next(l for l in result.splitlines() if l.startswith('TURRET_MANIFEST='))
                manifest=json.loads(line.split('=',1)[1]);(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
                for theme in themes:
                    code='import bpy\nCOLORS='+repr(theme['colors_srgb'])+'\n'
                    code+='''for mat in bpy.data.materials:
    if not mat.name.startswith('MAT-') or mat.name[4:] not in COLORS: continue
    rgb=tuple(int(COLORS[mat.name[4:]][i:i+2],16)/255 for i in (1,3,5))
    rgb=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    mat.node_tree.nodes.get('Emission').inputs[0].default_value=(*rgb,1)
'''
                    code+=f"bpy.context.scene.render.filepath={str(OUT/(theme['id']+'.png'))!r}\nbpy.ops.render.render(write_still=True)\nprint('TURRET_RENDERED')"
                    result=tool_output(await session.call_tool('execute_blender_code',{'code':code},read_timeout_seconds=timedelta(minutes=3)))
                    assert 'TURRET_RENDERED' in result
                    print('Rendered '+theme['name'],flush=True)
    # Validate all exports before writing canonical assets.
    staged=[]
    for theme in themes:
        source=Image.open(OUT/(theme['id']+'.png')).convert('RGBA');assert source.size==tuple(manifest['source_atlas_px'])
        for tile in manifest['tiles']:
            x,y,w,h=tile['source_frame_px'];frame=source.crop((x,y,x+w,y+h)).resize((w//2,h//2),Image.Resampling.NEAREST)
            alpha=frame.getchannel('A').point(lambda v:255 if v>=128 else 0);frame.putalpha(alpha)
            assert alpha.getbbox() and alpha.getextrema()==(0,255)
            staged.append((theme,tile,frame))
    for theme,tile,frame in staged:
        path=ROOT/'data/sprites/turrets'/theme['id']/(tile['name']+'.png');path.parent.mkdir(parents=True,exist_ok=True);frame.save(path)
        identifier=f"turret.{theme['id']}.{tile['name']}"
        package('asset','assets',identifier,{'asset_id':identifier,'source_path':str(path.relative_to(ROOT/'data')),'content_type':'image/png','bootstrap_required':False,'startup_required':False,'dependencies':[],'editor_preview':None,'editor_schema':None,'shader_family':None})
    for theme in themes:
        for name,size,rate,mass,rpm,damage,speed,range_m,ammo in [('light',1,240,100,240,10,400,600,500),('twin',1,120,220,480,8,550,750,1000),('heavy',2,45,650,60,75,300,900,150)]:
            identifier=f"block.{theme['id']}.roof_turret_{name}";prefix=f"turret.{theme['id']}.{name}_"
            definition={'block_id':identifier,'display_name':theme['name']+' / '+name.title()+' roof turret','category':'mount','layer':'roof','footprint':[[x,y] for y in range(size) for x in range(size)],'mass_kg':mass,'health':400*size,'collision_polygon':[],'cost':{'capacity':size*2,'credits':mass*10},'power':None,'directional':True,
                'placement':{'attach_edges':['N','E','S','W'],'requires_support':True,'attach_to':['hull','armor'],'min_attachments':1,'clearance':[],'keep_clear':[]},'visual':{'tile_asset_id':prefix+'preview','interior_asset_id':None,'visible_in_cutaway':False,'interior_overlays':[]},'interior':None,
                'components':[{'kind':'turret_drive','properties':{'traverse_rate_deg_s':rate,'arc_deg':360,'muzzle_offsets_m':([[-.24,.94],[.24,.94]] if name=='twin' else [[0,size*.94]]),'firing_tolerance_deg':3}}, {'kind':'turret_visual','properties':{'base_asset_id':prefix+'base','barrel_asset_id':prefix+'barrel','size_m':[size*2,size*2]}}, {'kind':'ballistic_weapon','properties':{'weapon_name':name.title()+' roof turret','fire_audio_profile_id':'weapon.ballistic_gatling','rpm':rpm,'damage_per_shot':damage,'max_range_m':range_m,'projectile_speed_mps':speed,'spread_rad':0,'damage_type':'Ballistic'}},{'kind':'ammo_count','properties':{'current':ammo,'capacity':ammo}}]}
            package('block','blocks',identifier,definition,{'block_id':identifier,'script':'','tags':[theme['id'],'mount','turret','roof']})
    print('Prepared 18 turret fittings and 54 layered assets.',flush=True)
if __name__=='__main__':asyncio.run(build())
