"""Check compiled exterior assets and their canonical package references."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]

def validate_frame(tile, image):
    assert image.mode=='RGBA'
    assert image.size==tuple(n*64 for n in tile['size_cells'])
    alpha=image.getchannel('A')
    assert alpha.getbbox(), f"empty frame: {tile['name']}"
    assert set(alpha.get_flattened_data()) <= {0,255}
    if tile['layer']=='roof':
        assert alpha.getextrema()==(255,255), f"roof gap: {tile['name']}"
    elif tile['layer']=='roof_trim':
        mask=tile['neighbour_mask']
        for y in range(64):
            for x in range(64):
                exposed=(not mask&1 and y<5) or (not mask&2 and x>=59) or (not mask&4 and y>=59) or (not mask&8 and x<5)
                for bit,sides,corner in [(16,3,x>=59 and y<5),(32,6,x>=59 and y>=59),
                                         (64,12,x<5 and y>=59),(128,9,x<5 and y<5)]:
                    exposed |= mask&sides==sides and not mask&bit and corner
                assert alpha.getpixel((x,y))==(255 if exposed else 0), f"broken perimeter: {tile['name']} at {x},{y}"
    return alpha

def verify():
    manifest=json.loads((ROOT/'artifacts/exterior/manifest.json').read_text())
    assert len(manifest['tiles'])==100
    masks={t['neighbour_mask'] for t in manifest['tiles'] if t['layer']=='roof_trim'}
    assert len(masks)==46 and 255 not in masks
    themes=json.loads((ROOT/'scripts/art/themes.json').read_text())['themes']
    silhouettes={}
    hashes=set()
    for theme in themes:
        for tile in manifest['tiles']:
            asset=f"exterior.{theme['id']}.{tile['name']}"
            definition=json.loads((ROOT/'data/content/assets'/asset.replace('.','__')/'definition.json').read_text())
            assert definition['asset_id']==asset
            path=ROOT/'data'/definition['source_path']
            with Image.open(path) as image:
                alpha=validate_frame(tile,image)
                key=tile['name']
                if key in silhouettes: assert silhouettes[key]==alpha.tobytes()
                else: silhouettes[key]=alpha.tobytes()
            if tile['name']=='plate_2x3': hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
    assert len(hashes)==6, 'faction finishes should remain distinct'
    assert (ROOT/'artifacts/exterior/exterior.blend').stat().st_size>10000
    print('Verified 600 exterior assets: opaque gap-free panels, all 46 perimeter masks, independent markings, six themes and canonical references.')

if __name__=='__main__': verify()
