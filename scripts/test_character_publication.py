"""Hermetic integrity failures for the bounded r009 publication successor."""
import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

from character_components import publication_validation as publication


def glb(*, hair=False, bind_shift=0, animation_shift=0):
    matrix = [1 if i % 5 == 0 else 0 for i in range(16)]
    matrices = matrix * 16
    matrices[12] += bind_shift
    binary = struct.pack('<256f', *matrices) + struct.pack('<2f', 0, 1)
    binary += struct.pack('<8f', 0, 0, 0, 1, animation_shift, 0, 0, 1)
    document = {
        'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
        'nodes': [{'name': 'joint-' + str(i)} for i in range(16)],
        'skins': [{'joints': list(range(16)), 'inverseBindMatrices': 0}],
        'bufferViews': [{'buffer': 0, 'byteOffset': offset, 'byteLength': size} for offset, size in [(0, 1024), (1024, 8), (1032, 32)]],
        'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 16, 'type': 'MAT4'},
                      {'bufferView': 1, 'componentType': 5126, 'count': 2, 'type': 'SCALAR'},
                      {'bufferView': 2, 'componentType': 5126, 'count': 2, 'type': 'VEC4'}],
        'animations': [] if hair else [{'name': 'clip-' + str(i), 'samplers': [{'input': 1, 'output': 2}],
                                      'channels': [{'sampler': 0, 'target': {'node': 0, 'path': 'rotation'}}]} for i in range(12)],
    }
    encoded = json.dumps(document).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(binary), 0x004E4942) + binary


class CharacterPublicationTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.previous = {'revision': 8, 'files': {}}
        self.catalog = {'revision': 8, 'rigId': 'shared-16', 'bodyTypes': ['male', 'female'], 'hairStyles': ['none', *publication.HAIR],
                        'sets': {}, 'components': [{'id': 'medic-chest', 'massKg': 4}],
                        'visualRevisions': {key: 8 for key in publication.COMPONENTS | {'medic-chest'}}}
        self.old_catalog = copy.deepcopy(self.catalog)
        self.catalog['revision'] = 9
        self.catalog['visualRevisions'].update({key: 9 for key in publication.COMPONENTS})
        self.manifest = {'revision': 9, 'files': {}, 'componentRevisions': self.catalog['visualRevisions']}
        candidate = publication.R009 + '/arbitrary-final-candidate'
        self.source = candidate + '/blender-source.blend'
        self.write(self.source, b'preserved native source')
        self.manifest.update(blenderSource=self.source, sourceSha256=self.sha(self.source))
        self.receipt = {'schema': 'sidereal.character-visual-publication.v2', 'revision': 9, 'previousManifest': dict(publication.PREVIOUS_MANIFEST),
                        'previousCatalog': dict(publication.PREVIOUS_CATALOG), 'pairedPoseRevision': 3,
                        'authorization': {'ownerQuote': 'Activate normal game', 'messageReference': 'owner message', 'finalArtSignoff': False},
                        'ownerFinalSignoff': None, 'installedComponents': sorted(publication.COMPONENTS), 'files': {},
                        'source': self.source, 'sourceSha256': self.sha(self.source)}
        sources = {}
        checks = {key: {'passed': True} for key in ['elevenStandaloneAndCombinedFiles', 'catalogAndIdentityPreservation', 'unchangedSharedSkinMaterial', 'nativePreservation']}
        for name in sorted(publication.CHANGED_FILES | {'medic-chest.png'}):
            raw = glb(hair=name.startswith('hair-')) if name.endswith('.glb') else b'original-image'
            old = 'preserved/' + name
            self.write(old, raw)
            sources[name] = self.root / old
            self.previous['files'][name] = self.sha(old)
            new = candidate + '/' + name
            self.write(new, raw if name.endswith('.glb') or name == 'medic-chest.png' else b'new-image')
            self.write(publication.RUNTIME + '/' + name, (self.root / new).read_bytes())
            self.manifest['files'][name] = self.sha(new)
            if name in publication.CHANGED_FILES:
                self.receipt['files'][name] = {'source': new, 'sha256': self.sha(new), 'previousSha256': self.sha(old)}
                if name.endswith('.glb'):
                    for prefix in ['read/', 'data/', 'rig/', 'clips/']:
                        checks[prefix + name] = {'passed': True, 'evidence': {'sha256': self.sha(new)}}
        self.write(publication.RUNTIME + '/manifest.json', b'{}')
        self.receipt.update(runtimeSha256=self.manifest['files']['modular-crew.glb'], unchangedRuntimeFiles={'medic-chest.png': self.previous['files']['medic-chest.png']})
        self.report_path = candidate + '/faces-validation-002.json'
        self.report = {'passed': True, 'errors': [], 'candidate': candidate, 'nativeSourceSha256': self.sha(self.source), 'checks': checks}
        self.refresh_report()
        mocked = patch.object(publication, 'r008_lineage', return_value=(self.previous, self.old_catalog, sources))
        mocked.start()
        self.addCleanup(mocked.stop)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)

    def sha(self, name):
        return hashlib.sha256((self.root / name).read_bytes()).hexdigest()

    def refresh_report(self):
        self.write(self.report_path, json.dumps(self.report).encode())
        self.receipt['validation'] = {'path': self.report_path, 'sha256': self.sha(self.report_path)}

    def validate(self):
        return publication.validate_r009(self.root, self.manifest, self.catalog, self.receipt)

    def test_explicit_lineage_accepts_different_candidate_and_report_names(self):
        self.assertEqual(len(self.validate()[1]), 22)

    def test_unauthorized_scope_or_predecessor_fails(self):
        self.receipt['files']['medic-chest.png'] = {'sha256': self.manifest['files']['medic-chest.png']}
        with self.assertRaisesRegex(ValueError, 'may replace only'):
            self.validate()
        del self.receipt['files']['medic-chest.png']
        self.receipt['previousManifest']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'exact preserved r008'):
            self.validate()

    def test_failed_or_incomplete_rig_report_is_rejected(self):
        self.report['passed'] = False
        self.refresh_report()
        with self.assertRaisesRegex(ValueError, 'did not pass'):
            self.validate()
        self.report['passed'] = True
        del self.report['checks']['rig/base-female.glb']
        self.refresh_report()
        with self.assertRaisesRegex(ValueError, 'Missing rig/clip'):
            self.validate()

    def test_unrelated_asset_or_file_membership_changes_are_rejected(self):
        self.write(publication.RUNTIME + '/medic-chest.png', b'changed equipment')
        with self.assertRaisesRegex(ValueError, 'Installed character artifact changed'):
            self.validate()
        self.write(publication.RUNTIME + '/medic-chest.png', b'original-image')
        self.write(publication.RUNTIME + '/unlisted.glb', b'extra')
        with self.assertRaisesRegex(ValueError, 'Unexpected installed'):
            self.validate()

    def test_catalog_gameplay_field_cannot_change_with_faces(self):
        self.catalog['components'][0]['massKg'] = 1
        with self.assertRaisesRegex(ValueError, 'catalog contract changed'):
            self.validate()

    def test_claimed_pass_cannot_hide_changed_actual_bind_or_animation(self):
        name = 'base-female.glb'
        for value, message in [(glb(bind_shift=.01), 'bind matrices changed'), (glb(animation_shift=.01), 'animation channels changed')]:
            with self.subTest(message=message):
                source = self.receipt['files'][name]['source']
                self.write(source, value)
                self.write(publication.RUNTIME + '/' + name, value)
                sha = self.sha(source)
                self.receipt['files'][name]['sha256'] = self.manifest['files'][name] = sha
                self.report['checks']['read/' + name]['evidence']['sha256'] = sha
                self.refresh_report()
                with self.assertRaisesRegex(ValueError, message):
                    self.validate()

    def test_final_approval_cannot_be_inferred_from_publication(self):
        self.receipt['authorization']['finalArtSignoff'] = True
        with self.assertRaisesRegex(ValueError, 'separate from final sign-off'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
