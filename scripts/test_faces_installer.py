"""Installer failure tests use tiny temporary files; never touch actual runtime."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

from character_components import publish_faces as installer


def png(alpha=255):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes((0, 32, 64, 96, alpha)))) + chunk(b'IEND', b'')


class FacesInstallerTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.candidate = self.root / installer.R009 / 'final-delivery'
        self.validation = self.candidate / 'final-validation.json'
        self.out = self.root / installer.RUNTIME
        self.catalog = {'revision': 8, 'components': [{'id': str(i), 'massKg': 2} for i in range(90)],
                        'visualRevisions': {key: 8 for key in installer.COMPONENTS | {'medic-chest'}},
                        'rigId': 'shared-16', 'bodyTypes': ['male', 'female'], 'hairStyles': list(installer.HAIR), 'sets': {}}
        self.before = {'revision': 8, 'files': {}, 'componentRevisions': self.catalog['visualRevisions']}
        sources = {}
        for name in sorted(installer.CHANGED_FILES | {'medic-chest.png'}):
            old = b'historical-' + name.encode()
            source = self.root / 'historical' / name
            self.write(source, old)
            self.write(self.out / name, old)
            self.before['files'][name] = self.sha(source)
            sources[name] = source
            if name in installer.CHANGED_FILES:
                self.write(self.candidate / name, png() if name.endswith('.png') else b'new-' + name.encode())
        self.write_json(self.out / 'manifest.json', self.before)
        self.write_json(self.root / installer.CATALOG, self.catalog)
        self.write_json(self.root / installer.PREVIOUS_MANIFEST['path'], self.before)
        self.write_json(self.root / installer.PREVIOUS_CATALOG['path'], self.catalog)
        self.write(self.root / 'assets/art-library/character-components/publications/r008/publication.json', b'old immutable r008 receipt')
        self.write(self.root / 'assets/art-library/designs/crew.animation.aim/publications/r003/publication.json', b'old immutable r003 receipt')
        self.write(self.candidate / 'blender-source.blend', b'new reviewed native source')
        self.source_sha = self.sha(self.candidate / 'blender-source.blend')
        combined_sha = self.sha(self.candidate / 'modular-crew.glb')
        checks = {key: {'passed': True} for key in ('elevenStandaloneAndCombinedFiles', 'catalogAndIdentityPreservation', 'unchangedSharedSkinMaterial', 'femaleHeadAndJawProportions')}
        checks['nativePreservation'] = {'passed': True, 'evidence': {'passed': True, 'errors': [], 'candidateSha256': self.source_sha,
                                      'objectsCompared': 1139, 'maxNativeVertexDisplacementM': 0, 'maxNativeCornerNormalDelta': 0}}
        for name in installer.CHANGED_FILES:
            if name.endswith('.glb'):
                for prefix in ('read/', 'data/', 'rig/', 'clips/'):
                    checks[prefix + name] = {'passed': True, 'evidence': {'sha256': self.sha(self.candidate / name)}}
        self.write_json(self.validation, {'passed': True, 'errors': [], 'candidate': str(self.candidate.relative_to(self.root)),
                                       'nativeSourceSha256': self.source_sha, 'checks': checks})
        native = {key: 0 for key in ('boundaryEdges', 'nonManifoldEdges', 'nonContiguousEdges', 'wireEdges', 'tinyFaces')}
        native.update(passed=True, allRetainedInputsHidden=True, nativeSurfaceSha256='surface-hash')
        exported = {key: 0 for key in ('boundaryEdges', 'nonManifoldEdges', 'inconsistentlyOrientedEdges', 'collapsedTriangles', 'zeroAreaTriangles')}
        exported['passed'] = True
        self.write_json(self.candidate / 'hair-topology-validation.json', {'passed': True, 'sourceSha256': self.source_sha,
            'glbSha256': combined_sha, 'hair': {'hair-' + style: {'passed': True, 'native': native, 'exported': exported} for style in installer.HAIR}})
        seven = {style: 'surface-hash' for style in set(installer.HAIR) - {'cropped'}}
        self.write_json(self.candidate / 'repair-record.json', {'passed': True, 'nativeSourceSha256': self.source_sha,
            'croppedBeforeBoundsM': [[0, 1], [0, 1], [1, 2]], 'croppedAfterBoundsM': [[0, 1], [0, 1], [1, 2]],
            'sevenNativeHairHashesBefore': seven, 'sevenNativeHairHashesAfter': seven})
        self.thumbnails = {}
        for key in installer.COMPONENTS:
            name = key + '.png'
            source = self.candidate.parent / 'native-captures' / name
            self.write(source, png())
            self.thumbnails[name] = {'source': str(source.relative_to(self.root)), 'sha256': self.sha(source)}
        self.write_json(self.candidate / 'thumbnail-provenance.json', {'files': self.thumbnails})
        for mocked in (patch.object(installer, 'r008_lineage', return_value=(self.before, self.catalog, sources)),
                       patch.object(installer, 'FINAL_SOURCE_SHA', self.source_sha),
                       patch.object(installer, 'FINAL_GLB_SHA', combined_sha)):
            mocked.start()
            self.addCleanup(mocked.stop)
        self.initial = self.installed_snapshot()

    def write(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def write_json(self, path, value):
        self.write(path, (json.dumps(value, indent=2) + '\n').encode())

    def sha(self, path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def installed_snapshot(self):
        paths = list(self.out.rglob('*')) + [self.root / installer.CATALOG]
        paths += list((self.root / 'assets/art-library/character-components/publications').rglob('*'))
        paths += list((self.root / 'assets/art-library/designs/crew.animation.aim/publications').rglob('*'))
        return {str(path.relative_to(self.root)): self.sha(path) for path in paths if path.is_file()}

    def assert_untouched(self):
        self.assertEqual(self.initial, self.installed_snapshot())
        self.assertFalse((self.root / installer.PUBLICATION).exists())
        self.assertFalse(list(self.out.parent.glob('.r009-stage-*')))

    def install(self):
        return installer.install(self.root, self.candidate, self.validation)

    def test_altered_standalone_is_rejected_before_install(self):
        self.write(self.candidate / 'base-female.glb', b'changed after validation')
        with self.assertRaisesRegex(ValueError, 'Validation/export identity mismatch'):
            self.install()
        self.assert_untouched()

    def test_altered_native_source_is_rejected_before_install(self):
        self.write(self.candidate / 'blender-source.blend', b'changed after validation')
        with self.assertRaisesRegex(ValueError, 'Unreviewed native source'):
            self.install()
        self.assert_untouched()

    def test_topology_for_other_source_is_rejected(self):
        path = self.candidate / 'hair-topology-validation.json'
        data = json.loads(path.read_text())
        data['sourceSha256'] = '0' * 64
        self.write_json(path, data)
        with self.assertRaisesRegex(ValueError, 'Hair topology source/export mismatch'):
            self.install()
        self.assert_untouched()

    def test_blank_thumbnail_with_consistent_hashes_is_rejected(self):
        name = 'hair-cropped.png'
        self.write(self.candidate / name, png(alpha=0))
        source = self.root / self.thumbnails[name]['source']
        self.write(source, png(alpha=0))
        self.thumbnails[name]['sha256'] = self.sha(source)
        self.write_json(self.candidate / 'thumbnail-provenance.json', {'files': self.thumbnails})
        with self.assertRaisesRegex(ValueError, 'Empty/transparent thumbnail'):
            self.install()
        self.assert_untouched()

    def test_failed_staging_copy_preserves_actual_install_and_receipts(self):
        original = shutil.copy2
        calls = 0
        def failing_copy(source, target, *args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 4:
                Path(target).write_bytes(b'partial staging copy')
                raise OSError('injected staging failure')
            return original(source, target, *args, **kwargs)
        with patch.object(installer.shutil, 'copy2', side_effect=failing_copy):
            with self.assertRaisesRegex(OSError, 'injected staging failure'):
                self.install()
        self.assertEqual(calls, 4)
        self.assert_untouched()

    def test_failed_json_staging_preserves_actual_install_and_receipts(self):
        original = installer.write
        calls = 0
        def failing_write(path, value):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError('injected JSON staging failure')
            return original(path, value)
        with patch.object(installer, 'write', side_effect=failing_write):
            with self.assertRaisesRegex(OSError, 'injected JSON staging failure'):
                self.install()
        self.assert_untouched()

    def test_commit_error_recovers_from_existing_sources_without_backup(self):
        original = installer.os.replace
        calls = 0
        def failing_replace(source, target):
            nonlocal calls
            calls += 1
            if calls == 5:
                raise OSError('injected commit failure')
            return original(source, target)
        with patch.object(installer.os, 'replace', side_effect=failing_replace):
            with self.assertRaisesRegex(OSError, 'injected commit failure'):
                self.install()
        self.assert_untouched()

    def test_receipt_failure_recovers_catalog_manifest_and_files(self):
        with patch.object(installer.os, 'rename', side_effect=OSError('injected receipt failure')):
            with self.assertRaisesRegex(OSError, 'injected receipt failure'):
                self.install()
        self.assert_untouched()

    def test_success_changes_only_21_files_and_records_pending_final_signoff(self):
        result = self.install()
        self.assertEqual(result['files'], 21)
        self.assertFalse(result['backup'])
        receipt = json.loads((self.root / installer.PUBLICATION / 'publication.json').read_text())
        self.assertIsNone(receipt['ownerFinalSignoff'])
        self.assertFalse(receipt['authorization']['finalArtSignoff'])
        self.assertEqual(set(receipt['files']), installer.CHANGED_FILES)
        self.assertEqual(receipt['unchangedRuntimeFiles'], {'medic-chest.png': self.before['files']['medic-chest.png']})
        current = json.loads((self.root / installer.CATALOG).read_text())
        self.assertEqual(current['components'], self.catalog['components'])
        for name in installer.CHANGED_FILES:
            self.assertEqual((self.out / name).read_bytes(), (self.candidate / name).read_bytes())
        after = self.installed_snapshot()
        for name, sha in self.initial.items():
            if '/publications/' in name or name.endswith('/medic-chest.png'):
                self.assertEqual(after[name], sha)
        self.assertFalse(list(self.out.parent.glob('.r009-stage-*')))


if __name__ == '__main__':
    unittest.main()
