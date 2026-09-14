"""Stage immutable private review inputs; never install visual bindings.

An explicit qualified fixture and previous visual bindings are required. Missing
family members remain visibly recorded as previous-revision coverage during proof
review. Final review must have zero fallback hull entries.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stage(native, fixture, bindings, output, final=False):
    output.mkdir(parents=True, exist_ok=False)
    manifest = json.loads((native / 'models.json').read_text())
    original = json.loads(bindings.read_text())
    whole, bare = deepcopy(original), deepcopy(original)
    models = {m['slug']: m for m in manifest['models']}
    pairs = {
        'part-357cf42235c1a190e1d6': ('red-service', 'left'),
        'part-679e9e22f0af30b070a3': ('red-service', 'left'),
        'part-b9ca98146302dec24dd6': ('red-service', 'right'),
        'part-d16f3e3a2db2188e5ed6': ('red-service', 'right'),
        'part-f85394947090b7609d41': ('utility', 'left'),
        'part-d3e5e45b0f3f60b3fa0a': ('utility', 'left'),
        'part-08dac7402c764c4d89d7': ('utility', 'right'),
        'part-e43ac94780eb7a1adc50': ('utility', 'right'),
        'part-62c859bcc51b318b2c65': ('identity', 'left'),
        'part-5cd7ebc9a8d894fb2b3a': ('identity', 'left'),
        'part-0211e6d7960f233accb7': ('identity', 'right'),
        'part-64b068a5a6e987c1d518': ('identity', 'right'),
        'part-151314086c02e30e06f4': ('plain', 'left'),
        'part-77e9c39b3c50d6dd66f7': ('plain', 'left'),
        'part-9ab3a7a3dbc68586c530': ('plain', 'right'),
        'part-c9e43b70cbc1f9f77b1f': ('plain', 'right'),
    }
    parts = json.loads(json.loads(fixture.read_text())['documentJson'])['layout']['assembly']['parts']
    layout, coverage = [], []
    for entry, bare_entry in zip(whole['entries'], bare['entries']):
        if '/hull.glb' not in entry['visual']['url']:
            continue
        asset = entry['assetId']
        old_slug = entry['visual']['nodePrefix'].removeprefix('GEO-').split('--')[0]
        slug = old_slug.replace('side-', 'armor-', 1)
        requested = slug
        if asset in pairs:
            variant, role = pairs[asset]
            proposed = f'armor-{variant}-pair-{role}-w200-h300'
            requested = proposed
            if proposed in models:
                slug = proposed
        selected = [p for p in parts if p['assetId'] == asset]
        if old_slug.startswith('side-') and selected:
            handedness = {bool(p.get('flipped')) for p in selected}
            if final and len(handedness) != 1:
                raise ValueError('One asset binding cannot cover mixed exterior handedness: ' + asset)
            if handedness == {True}:
                requested += '-port'
                if slug + '-port' in models:
                    slug += '-port'
        missing_required = slug != requested or requested not in models
        if final and missing_required:
            raise ValueError('Final family requires exact model: ' + requested)
        model = models.get(slug)
        if not model:
            coverage.append({'assetId': asset, 'previousSlug': old_slug, 'requestedSlug': requested,
                             'candidateSlug': None, 'missingRequiredModel': True})
            continue
        path = native / model['path']
        if digest(path) != model['sha256']:
            raise ValueError('Native hash mismatch: ' + slug)
        visual = {
            'url': '/__armor-native/' + model['path'], 'sha256': model['sha256'],
            'designId': 'shipyard.wayfarer.armor-cassette.hull', 'revision': manifest['revision'],
            'bounds': model['bounds'], 'damagePreview': 'unsupported', 'nodePrefix': model['nodePrefix'],
        }
        entry['visual'] = visual
        bare_entry['visual'] = deepcopy(visual)
        liner = model['renderGroups'].get('liner')
        if entry['sources'][0]['category'] == 'wall':
            if not liner:
                raise ValueError('A structural front binding requires a retained liner: ' + slug)
            bare_entry['visual']['nodePrefix'] = liner['nodePrefix']
        for part in selected:
            layout.append({**part, 'slug': slug, 'isSide': model['family'] == 'side', 'visual': visual,
                           'armorGroup': model['renderGroups']['armor']['nodePrefix']})
        coverage.append({'assetId': asset, 'previousSlug': old_slug, 'requestedSlug': requested,
                         'candidateSlug': slug, 'missingRequiredModel': missing_required,
                         'placements': len(selected)})
    for name, data in [('whole-bindings.json', whole), ('bare-bindings.json', bare),
                       ('armor-layout.json', {'parts': layout, 'coverage': coverage})]:
        (output / name).write_text(json.dumps(data, indent=2) + '\n')
    (output / 'document.json').write_bytes(fixture.read_bytes())
    provenance = {
        'schema': 'sidereal.armor-cassette-private-review.v1', 'nativeDirectory': str(native),
        'fixture': {'path': str(fixture), 'sha256': digest(fixture)},
        'previousBindings': {'path': str(bindings), 'sha256': digest(bindings)},
        'nativeManifestSha256': digest(native / 'models.json'),
        'coverage': coverage, 'fallbackHullEntries': sum(c['candidateSlug'] is None for c in coverage),
        'finalFamilyRequired': final,
        'missingRequiredModels': sum(c['missingRequiredModel'] for c in coverage),
        'limits': ['Private pure fixture; no database access or publication.',
                   'Bare view uses exact front liner groups and hides separate hull meshes.',
                   'Exploded view offsets intact side/bow groups by 1.5 m for inspection only.'],
    }
    (output / 'inputs.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'fallbackHullEntries': provenance['fallbackHullEntries'],
                      'newArmorPlacements': len(layout)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('native', 'fixture', 'bindings', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--final', action='store_true', help='Require every planned pair, front and handedness model')
    args = parser.parse_args()
    stage(args.native.resolve(), args.fixture.resolve(), args.bindings.resolve(), args.output.resolve(), args.final)
