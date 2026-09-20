#!/usr/bin/env python3
"""Package bounded map thumbnails from recorded renders of the pinned native assets.
Does not render, edit native art, or publish to any running service.
Run with the project's art Python and --source-root containing capture evidence.
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
    parser.add_argument('--source-root', type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads((ROOT/'packages/render/src/environment/reviewed-native-planet-catalog.json').read_text())
    output = ROOT/'apps/dashboard/public/map-snapshots'
    output.mkdir(parents=True, exist_ok=True)
    entries = {}
    for body in catalog:
        directory = args.source_root/'output/playwright/planet-reference-20260914'/body['revision']
        captures = sorted(directory.glob('broader-shadow-fixed*-seed117.json'))
        valid = [p for p in captures if json.loads(p.read_text()).get('kitSha256') in (body['sourceKitSha256'], body['runtimeKitSha256']) and p.with_suffix('.png').is_file()]
        if not valid:
            raise ValueError(f"Missing hash-matched capture: {body['id']}")
        source = valid[-1].with_suffix('.png')
        entries[body['id']] = package(source, args.source_root, output, body['id'], json.loads(valid[-1].read_text())['kitSha256'], 117)
    star = ROOT/'assets/art-library/designs/star.yellow-main-sequence/revisions/r013'
    if digest(star/'star.glb') != 'f651ba13ade02fb918c97dd4d3924879dd9c204527a4e43cef90c8c578505bd2':
        raise ValueError('Star source differs from runtime pin')
    entries['yellow-main-sequence-r013'] = package(star/'blender-close.png', ROOT, output, 'yellow-main-sequence-r013', digest(star/'star.glb'), 3901)
    (output/'manifest.json').write_text(json.dumps({'schema':1, 'description':'Asset catalog portraits. Planet snapshots use reference seed 117; authored placement/seed remains independent.', 'entries':entries}, indent=2)+'\n')
    print(f"Packaged {len(entries)} asset portraits; {sum(p.stat().st_size for p in output.glob('*.webp'))} bytes")

def package(source, source_root, output, asset_id, asset_hash, seed):
    target = output/(asset_id+'.webp')
    with Image.open(source) as image:
        image.thumbnail((192,192), Image.Resampling.LANCZOS)
        image.convert('RGB').save(target, 'WEBP', quality=84, method=6)
    return {'url':'/map-snapshots/'+target.name, 'source':str(source.relative_to(source_root)), 'sourceSha256':digest(source), 'assetSha256':asset_hash, 'seed':seed, 'sha256':digest(target)}

if __name__ == '__main__':
    main()
