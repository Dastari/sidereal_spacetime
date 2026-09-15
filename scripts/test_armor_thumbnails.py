"""Native palette coverage, exact source pins and explicit dashboard publication."""
import hashlib
import json
import struct
import unittest
from prepare_app import ARMOR_THUMBNAILS, EDITOR_NATIVE_ASSETS, ROOT


class ArmorThumbnailTests(unittest.TestCase):
    def test_every_native_variant_has_an_exact_source_preview(self):
        catalog = json.loads((ROOT / 'apps/dashboard/src/shipyard/layout/armor-kit-r005.json').read_text())
        folder = ROOT / ARMOR_THUMBNAILS
        manifest = json.loads((folder / 'manifest.json').read_text())
        source = ROOT / 'assets/art-library/framed-wayfarer/r005/library-02/hull.glb'
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), manifest['sourceSha256'])
        self.assertEqual(manifest['sourceSha256'], catalog['librarySha256'])
        previews = {p['id']: p for p in manifest['assets']}
        self.assertEqual(set(previews), {a['id'] for a in catalog['assets']})
        self.assertEqual(len(previews), len(manifest['assets']))
        hashes = set()
        for asset in catalog['assets']:
            preview = previews[asset['id']]
            data = (folder / preview['file']).read_bytes()
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', data[16:24]), (256, 256))
            self.assertEqual(hashlib.sha256(data).hexdigest(), preview['sha256'])
            self.assertEqual(preview['nodePrefix'], asset['visual']['nodePrefix'])
            self.assertGreater(preview['meshCount'], 0)
            self.assertEqual('/' + EDITOR_NATIVE_ASSETS[f"{ARMOR_THUMBNAILS}/{preview['file']}"], asset['thumbnail'])
            hashes.add(preview['sha256'])
        self.assertEqual(len(hashes), len(previews), 'A generic/repeated image replaced a native variant')
