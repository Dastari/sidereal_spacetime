#!/usr/bin/env python3
"""Package true-alpha native map portraits captured by capture_map_portraits.mjs.
Opaque reference screenshots are rejected rather than color-keyed: black pixels
can belong to the body, and halos need their renderer-produced coverage.
Does not modify native art or publish to a running service.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True,
                        help='Checkout containing output/playwright/map-portraits-alpha')
    args = parser.parse_args()
    catalog = json.loads((ROOT/'packages/render/src/environment/reviewed-native-planet-catalog.json').read_text())
    pins = {body['id']: (body['runtimeKitSha256'], 117) for body in catalog}
    pins['yellow-main-sequence-r013'] = ('f651ba13ade02fb918c97dd4d3924879dd9c204527a4e43cef90c8c578505bd2', 3901)
    directory = args.source_root/'output/playwright/map-portraits-alpha'
    # Validate the entire capture set before replacing the catalog manifest.
    for asset_id, (asset_hash, seed) in pins.items():
        source = directory/(asset_id+'.png')
        evidence = json.loads(source.with_suffix('.json').read_text())
        if (evidence['id'], evidence['assetSha256'], evidence['seed'], evidence['sourceSha256']) != (asset_id, asset_hash, seed, digest(source)):
            raise ValueError(f'Capture does not match runtime pin: {asset_id}')
        if not evidence.get('transparent') or evidence['state'].get('selected') != asset_id or not evidence['state'].get('ready'):
            raise ValueError(f'Incomplete transparent render: {asset_id}')
        with Image.open(source) as image:
            if image.mode != 'RGBA' or image.getchannel('A').getextrema() != (0, 255):
                raise ValueError(f'Portrait requires actual transparent coverage: {asset_id}')
            if any(image.getpixel(p)[3] for p in [(0,0), (image.width-1,0), (0,image.height-1), (image.width-1,image.height-1)]):
                raise ValueError(f'Portrait has an opaque/clipped background: {asset_id}')
    output = ROOT/'apps/dashboard/public/map-snapshots'
    output.mkdir(parents=True, exist_ok=True)
    entries = {}
    for asset_id, (asset_hash, seed) in pins.items():
        source = directory/(asset_id+'.png')
        target = output/(asset_id+'-alpha-v1.webp')
        with Image.open(source) as image:
            image.thumbnail((192,192), Image.Resampling.LANCZOS)
            image.save(target, 'WEBP', quality=84, method=6, alpha_quality=100)
        entries[asset_id] = {
            'url':'/map-snapshots/'+target.name,
            'source':str(source.relative_to(args.source_root)),
            'sourceSha256':digest(source), 'assetSha256':asset_hash,
            'seed':seed, 'sha256':digest(target), 'alpha':True,
        }
    (output/'manifest.json').write_text(json.dumps({
        'schema':1,
        'description':'Transparent portraits rendered from runtime-pinned native assets. Planet seed 117; authored placement/seed remains independent.',
        'entries':entries,
    }, indent=2)+'\n')
    print(f'Packaged {len(entries)} transparent asset portraits')


if __name__ == '__main__':
    main()
