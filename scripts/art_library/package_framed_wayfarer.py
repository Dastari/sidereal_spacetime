"""Package qualified native surfaces without changing the physical asset catalogs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hull-revision', type=int, default=2)
    parser.add_argument('--engine-revision', type=int, default=3)
    args = parser.parse_args()
    library = ROOT / 'assets/art-library/framed-wayfarer'
    kit_root = library / 'runtime-r001'
    kits = {k['component']: k for k in json.loads((kit_root / 'manifest.json').read_text())['kits']}
    catalogs = [json.loads((ROOT / 'assets/runtime/assembly' / name).read_text())
                for name in ('catalog.json', 'catalog-shipyard-r005.json')]
    assets = {a['id']: a for c in catalogs for a in c['assets']}
    entries, copies, models = [], [], []
    for component, number in [('hull', args.hull_revision), ('engines', args.engine_revision)]:
        folder = library / f'r{number:03}' / component
        manifest = json.loads((folder / 'models.json').read_text())
        assert sha(folder / manifest['source']) == manifest['sourceSha256']
        kit = kits[component]
        assert kit['sourceRevision'] == number
        assert sha(folder / 'models.json') == kit['sourceManifestSha256']
        kit_source = kit_root / kit['path']
        assert sha(kit_source) == kit['sha256']
        kit_target = ROOT / 'assets/runtime/assembly/native/framed-wayfarer/runtime-r001' / kit['path']
        copies.append((kit_source, kit_target))
        for model in manifest['models']:
            source = folder / model.get('path', model.get('glb', ''))
            assert sha(source) == model['sha256'], source
            slug = model.get('slug', model.get('assetId'))
            member = next(m for m in kit['models'] if m['slug'] == slug)
            assert member['sourceSha256'] == model['sha256']
            visual = dict(url='/assets/' + str(kit_target.relative_to(ROOT / 'assets/runtime')),
                          sha256=kit['sha256'], designId='shipyard.wayfarer.framed.' + component,
                          revision=number, bounds=model['bounds'], damagePreview='unsupported')
            visual['nodePrefix'] = member['nodePrefix']
            ids = [model['assetId']] if 'assetId' in model else []
            if model.get('family') == 'side' and model['widthM'] == 2 and model['heightM'] == 3:
                for asset in assets.values():
                    if '/native/side-hull-r005/' not in asset.get('visual', {}).get('url', ''):
                        continue
                    label = asset['label'].split(' · ')[0].removeprefix('Frontier side armor ')
                    variant = {'twin-vent': 'vent', 'forward-vent': 'vent', 'plain-service': 'plain'}.get(label, label)
                    if variant == model['variant']:
                        ids.append(asset['id'])
            for asset_id in ids:
                asset = assets[asset_id]
                for axis in range(3):
                    assert model['bounds']['min'][axis] >= asset['bounds']['min'][axis] - .0001, (asset_id, 'min', axis)
                    assert model['bounds']['max'][axis] <= asset['bounds']['max'][axis] + .0001, (asset_id, 'max', axis)
                sources = []
                for catalog in catalogs:
                    for original in catalog['assets']:
                        if original['id'] != asset_id:
                            continue
                        source_contract = dict(category=original['category'], bounds=original['bounds'],
                                               nodes=original['nodes'], visualSha256=original.get('visual', {}).get('sha256'))
                        if source_contract not in sources:
                            sources.append(source_contract)
                entries.append(dict(assetId=asset_id, sources=sources, visual=visual))
            models.append(dict(component=component, revision=number, source=str(source.relative_to(ROOT)), sourceSha256=model['sha256'], visual=visual, assetIds=ids))
    assert len(entries) == 30 and len({e['assetId'] for e in entries}) == 30
    # Validate the entire package before copying anything into the installed asset tree.
    for source, target in copies:
        if target.exists() and sha(source) != sha(target):
            raise ValueError('Preserve installed revision: ' + str(target))
    for source, target in copies:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    revision = dict(schema='sidereal.presentation-revision.v1', revision=1, entries=sorted(entries, key=lambda e: e['assetId']))
    (ROOT / 'packages/render/src/framed-wayfarer-visuals.json').write_text(json.dumps(revision, indent=2) + '\n')
    report = dict(schema='sidereal.framed-wayfarer-package.v1', models=models,
                  sourceCatalogs={str((ROOT / 'assets/runtime/assembly' / name).relative_to(ROOT)): sha(ROOT / 'assets/runtime/assembly' / name)
                                  for name in ('catalog.json', 'catalog-shipyard-r005.json')},
                  note='Presentation surfaces only; original catalog, native collision and authority pins unchanged.')
    (library / 'r001/package.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'libraries': len(copies), 'surfaces': len(models), 'assetBindings': len(entries), 'physicalCatalogs': 'unchanged'}))


if __name__ == '__main__':
    main()
