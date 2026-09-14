"""Editable, deterministic pixel face layers. No reference image is resampled.

64 authored texels across a 0.45m face; 16 horizontal variant cells. Blender packs
the original PNGs; game selects cells on per-character texture instances.
"""
import bpy

EXPRESSIONS = ['neutral', 'happy', 'stern', 'sad', 'surprised', 'wink', 'grin', 'determined']
DETAILS = ['none', 'freckles', 'scar', 'scratch', 'tattoo', 'bandage', 'dirt', 'warpaint', 'cyber', 'birthmark']
BEARDS = ['none', 'stubble', 'short', 'full', 'goatee', 'moustache', 'handlebar', 'sideburns']
AGES = ['young', 'adult', 'mature', 'elder']

def make_atlases(out):
    out.mkdir(exist_ok=True)
    images = {}
    for role, variants in [('eyes', EXPRESSIONS), ('iris', EXPRESSIONS), ('brows', EXPRESSIONS),
                           ('mouth', EXPRESSIONS), ('detail', DETAILS), ('facialHair', BEARDS), ('age', AGES)]:
        pixels = [0.0] * (1024 * 64 * 4)
        def rect(tile, x, y, w, h, color):
            for yy in range(max(0, y), min(64, y+h)):
                for xx in range(max(0, x), min(64, x+w)):
                    k = ((63-yy)*1024 + tile*64 + xx)*4
                    pixels[k:k+4] = color
        ink = (.025, .032, .07, 1)
        white = (.96, .98, 1, 1)
        lip = (.42, .18, .19, 1)
        for i, value in enumerate(variants):
            if role in ['eyes', 'iris', 'brows']:
                for side, x in [(-1, 15), (1, 41)]:
                    wink = value == 'wink' and side == 1
                    top, height = (23, 14) if value in ['stern', 'determined'] else (21, 16)
                    if value == 'surprised': top, height = 20, 18
                    if role == 'eyes':
                        if wink:
                            rect(i, x-1, 28, 9, 2, ink); rect(i, x+6, 26, 2, 2, ink)
                        else:
                            rect(i, x-1, top, 9, 1, (.21, .12, .12, .72))
                            rect(i, x, top+1, 7, height-1, ink)
                            rect(i, x+1, top+1, 2, 2, white)
                            rect(i, x+2, top+3, 1, 1, (.44, .62, .75, 1))
                            rect(i, x+1, top+height, 5, 1, (.30, .18, .19, .45))
                    if role == 'iris' and not wink:
                        rect(i, x+4, top+6, 2, height-8, (.78, .88, .91, 1))
                        rect(i, x+5, top+6, 1, 2, white)
                    if role == 'brows':
                        y = 16 if value not in ['surprised', 'sad'] else 12
                        rect(i, x-1, y, 9, 2, (.55, .55, .55, 1))
                        if value in ['stern', 'determined']:
                            rect(i, x+(6 if side == -1 else -1), y+2, 4, 2, (.55, .55, .55, 1))
                        elif value == 'sad':
                            rect(i, x+(6 if side == -1 else -1), y-2, 4, 2, (.55, .55, .55, 1))
            elif role == 'mouth':
                if value in ['happy', 'grin']:
                    rect(i, 28, 50, 9, 2, lip); rect(i, 29, 52, 7, 2, lip)
                    if value == 'grin': rect(i, 29, 50, 7, 2, white)
                    else: rect(i, 27, 49, 2, 2, lip); rect(i, 36, 49, 2, 2, lip)
                elif value == 'surprised':
                    rect(i, 30, 49, 5, 6, lip); rect(i, 31, 50, 3, 4, ink)
                elif value == 'sad':
                    rect(i, 29, 49, 7, 2, lip); rect(i, 28, 51, 2, 2, lip); rect(i, 35, 51, 2, 2, lip)
                else:
                    rect(i, 29, 51, 7, 1, lip); rect(i, 30, 52, 5, 1, (.56, .27, .27, .65))
            elif role == 'detail':
                if value == 'freckles':
                    for x,y in [(10,39),(14,41),(19,40),(23,43),(12,44),(43,40),(48,42),(52,40),(50,45),(39,43)]:
                        rect(i,x,y,1,1,(.27,.12,.055,.75))
                if value in ['scar','scratch']:
                    for k in range(15):
                        x=47-k//4; y=18+k
                        rect(i,x,y,1,1,(.58,.23,.22,.95)); rect(i,x+1,y,1,1,(.94,.69,.57,.9))
                    if value=='scratch':
                        for k in range(9):rect(i,51-k//4,21+k,1,1,(.60,.17,.17,1))
                if value == 'tattoo':
                    for x,y,w,h in [(49,34,3,12),(45,39,8,2),(47,35,2,2),(53,42,2,3)]:rect(i,x,y,w,h,(.04,.12,.22,.9))
                if value == 'bandage':
                    rect(i,8,39,13,5,(.82,.66,.42,1));rect(i,12,39,5,5,(.93,.84,.66,1))
                    for x in [9,18]:rect(i,x,40,2,1,(.49,.38,.24,1));rect(i,x,42,2,1,(.49,.38,.24,1))
                if value == 'dirt':
                    for x,y,w,h in [(8,39,11,3),(11,43,8,2),(45,12,7,3),(49,15,5,3),(37,51,7,3)]:rect(i,x,y,w,h,(.17,.11,.07,.48))
                if value == 'warpaint':
                    for x in [10,41]:rect(i,x,39,13,3,(.025,.18,.25,.94));rect(i,x+2,43,9,2,(.025,.18,.25,.85))
                if value == 'cyber':
                    rect(i,48,18,6,18,(.10,.15,.23,1));rect(i,50,19,2,10,(.05,.90,1,1))
                    rect(i,49,36,7,2,(.11,.27,.33,1));rect(i,54,31,2,7,(.10,.68,.82,1))
                if value == 'birthmark':
                    rect(i,12,40,5,5,(.31,.11,.12,.6));rect(i,14,38,3,3,(.31,.11,.12,.6))
            elif role == 'facialHair':
                c=(.45,.45,.45,1)
                if value == 'stubble':
                    for y in range(45,60,2):
                        for x in range(12,53,3):
                            if y>54 or x<24 or x>39:rect(i,x+(y%3),y,1,1,(.4,.4,.4,.65))
                if value in ['short','full']:
                    for y in range(43,62):
                        inset=max(0,(y-54)//2)
                        for x in range(10+inset,55-inset):
                            if y>54 or x<24 or x>39:
                                if (x+y)%11 or y<59:rect(i,x,y,1,1,c)
                    if value=='full':rect(i,19,61,28,3,c)
                if value in ['goatee','short','full','moustache','handlebar']:
                    rect(i,25,46,6,3,c);rect(i,34,46,6,3,c)
                    rect(i,28,45,3,1,c);rect(i,34,45,3,1,c)
                if value=='goatee':rect(i,28,56,10,6,c);rect(i,26,53,3,7,c);rect(i,37,53,3,7,c)
                if value=='handlebar':rect(i,22,46,4,5,c);rect(i,39,46,4,5,c);rect(i,20,45,3,2,c);rect(i,42,45,3,2,c)
                if value=='sideburns':rect(i,8,23,4,21,c);rect(i,52,23,4,21,c)
            elif role=='age' and value in ['mature','elder']:
                c=(.33,.18,.15,.45)
                rect(i,22,10,21,1,c);rect(i,25,7,15,1,c)
                for x in [12,42]:rect(i,x,40,10,1,c)
                if value=='elder':
                    rect(i,23,13,19,1,c)
                    for x in [9,51]:rect(i,x,31,3,1,c);rect(i,x,34,3,1,c)
                    rect(i,24,46,1,7,c);rect(i,41,46,1,7,c)
        image=bpy.data.images.new('Face atlas '+role, width=1024, height=64, alpha=True)
        image.pixels.foreach_set(pixels); image.filepath_raw=str(out/(role+'.png'));image.file_format='PNG'
        image.save();image.pack();images[role]=image
    return images
