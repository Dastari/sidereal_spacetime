"""Review the canonical starter's public roof and owner's cutaway from shipped tiles."""
import math
from PIL import Image, ImageDraw, ImageFont


def render_starter(root, output, hull, blocks):
    scale = 48
    size = ((hull['hull_size']['width'] + 2) * scale, (hull['hull_size']['length'] + 2) * scale)
    parts = []
    floor = {}
    for placed in hull['components']:
        block = blocks[placed['block_id']]
        angle = {'N': 0, 'E': -math.pi / 2, 'S': math.pi, 'W': math.pi / 2}[placed['facing']]
        cells = block['footprint']
        lo = [min(c[i] for c in cells) for i in (0, 1)]
        hi = [max(c[i] for c in cells) for i in (0, 1)]
        def rotate(p):
            return [p[0]*math.cos(angle)-p[1]*math.sin(angle), p[0]*math.sin(angle)+p[1]*math.cos(angle)]
        offset = rotate([(lo[i]+hi[i])/2 for i in (0, 1)])
        center = [placed['cell'][i]+offset[i] for i in (0, 1)]
        extent = [hi[i]-lo[i]+1 for i in (0, 1)]
        interior = block.get('interior') or {}
        if interior.get('walkable'):
            for cell in cells:
                delta = rotate(cell)
                point = tuple(round(placed['cell'][i] + delta[i]) for i in (0,1))
                floor[point] = interior.get('wall_asset_prefix')
        door = interior.get('airlock')
        if door:
            parts.append((.3, door['frames'][0], center, extent, angle+door['rotation_rad'], True, True))
        visual = block['visual']
        depth = 0 if block['layer'] == 'structure' else .1
        for key, private in [('tile_asset_id',False),('interior_asset_id',True)]:
            if visual[key]:
                parts.append((depth, visual[key], center, extent, angle+(door['rotation_rad'] if door else 0), private, visual['visible_in_cutaway']))
        for overlay in visual['interior_overlays']:
            delta = rotate(overlay['center_offset_cells'])
            parts.append((.05, overlay['asset_id'], [center[i]+delta[i] for i in (0,1)],
                          overlay['size_cells'], angle+overlay['rotation_rad'], True, True))
    # One half-edge junction per exposed vertex, matching the runtime compiler.
    junctions = {}
    for x,y in sorted(floor):
        for neighbour,a,b,first,second in [
            ((x,y+1),(2*x-1,2*y+1),(2*x+1,2*y+1),2,8),
            ((x+1,y),(2*x+1,2*y-1),(2*x+1,2*y+1),1,4),
            ((x,y-1),(2*x-1,2*y-1),(2*x+1,2*y-1),2,8),
            ((x-1,y),(2*x-1,2*y-1),(2*x-1,2*y+1),1,4),
        ]:
            if neighbour in floor: continue
            for vertex,mask in [(a,first),(b,second)]:
                old,prefix = junctions.get(vertex,(0,floor[(x,y)]))
                junctions[vertex] = (old|mask,prefix)
    for (x,y),(mask,prefix) in junctions.items():
        if prefix:
            parts.append((.15,prefix+str(mask),[x/2,y/2],[1,1],0,True,True))
    board = Image.new('RGB', (size[0]*2, size[1]+80), '#0b151d')
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 22)
    for index, cutaway in enumerate((True,False)):
        canvas = Image.new('RGBA',size)
        for depth,asset,center,extent,angle,private,visible in sorted(parts,key=lambda p:p[0]):
            if private and not cutaway or not private and cutaway and not visible:
                continue
            _,theme,tile = asset.split('.',2)
            frame = Image.open(root/'data/sprites/tiles'/theme/(tile+'.png')).convert('RGBA')
            frame = frame.resize(tuple(round(n*scale) for n in extent),Image.Resampling.NEAREST)
            frame = frame.rotate(round(math.degrees(angle)),expand=True,resample=Image.Resampling.NEAREST)
            point = (round(size[0]/2+center[0]*scale-frame.width/2),round(size[1]/2-center[1]*scale-frame.height/2))
            canvas.alpha_composite(frame,point)
        board.paste(canvas,(index*size[0],65),canvas)
        ImageDraw.Draw(board).text((index*size[0]+24,20),'WAYFARER / '+('OWNER CUTAWAY' if cutaway else 'PUBLIC ARMOUR'),font=font,fill='#c6dada')
    board.save(output/'starter_layers.png')
