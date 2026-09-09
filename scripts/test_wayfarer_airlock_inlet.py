"""Source-identity, native asset and conservative-proxy regression gates."""
import hashlib
import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / 'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003'


class NativeInletTests(unittest.TestCase):
    def test_exact_sources_and_real_material_export(self):
        manifest = json.loads((KIT / 'delivery-manifest.json').read_text())
        self.assertEqual(len(manifest['parts']), 5)
        self.assertEqual(hashlib.sha256((ROOT / manifest['sourceMaterialBlend']).read_bytes()).hexdigest(), manifest['sourceMaterialSha256'])
        for part in manifest['parts']:
            data = (KIT / part['file']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), part['sha256'])
            size = struct.unpack_from('<I', data, 12)[0]
            gltf = json.loads(data[20:20 + size])
            self.assertTrue(all('uri' not in image for image in gltf.get('images', [])))
            self.assertTrue(any('normalTexture' in material for material in gltf['materials']))
            self.assertTrue(any('metallicRoughnessTexture' in material.get('pbrMetallicRoughness', {}) for material in gltf['materials']))
            self.assertFalse(any(node.get('name', '').startswith('PROXY-') for node in gltf['nodes']))
            self.assertTrue(all('NORMAL' in primitive['attributes'] and 'TANGENT' in primitive['attributes'] for mesh in gltf['meshes'] for primitive in mesh['primitives']))

    def test_independent_replacement_preserves_source_identities(self):
        plan = json.loads((KIT / 'replacement-mapping.json').read_text())
        original = {row['sourcePlacedId']: row for row in plan['preserveOriginalPlacements']}
        self.assertEqual(len(original), 262)
        self.assertEqual({row['sourcePlacedId'] for row in plan['replacements']}, {'wall-2--2', 'wall-3--2', 'superstructure-3--2'})
        for row in plan['replacements']:
            self.assertEqual(row['preservedOriginal'], original[row['sourcePlacedId']])
            self.assertEqual(row['placement'], {key: row['preservedOriginal']['originalPlacement'][key] for key in ['position', 'rotation', 'flipped']})
        self.assertEqual(len(plan['attachedNativeParts']), 69)
        self.assertNotIn(26, [row['sourcePartIndex'] for row in plan['attachedNativeParts']])
        self.assertEqual(plan['resultingVisualPlacementCount'], 333)
        self.assertFalse(plan['runtimeInstalled'])
        self.assertIsNone(plan['ownerFinalSignoff'])

    def test_separate_conservative_components_do_not_close_qualified_inlet(self):
        proxy = json.loads((KIT / 'collision-proxies.json').read_text())
        self.assertEqual(sum(len(part['components']) for part in proxy['parts']), 50)
        self.assertFalse(proxy['authorityInstalled'])
        # World-space accepted body corridor, with a1micrometre floor separation
        # matching the native swept-body qualification. Floor seam strips remain
        # real supporting geometry below this body, never erased to open a route.
        body_min, body_max = [3.3, -4.3, .187501], [6.65, -3.7, 1.987501]
        for part in proxy['parts']:
            origin = part['placementWorldM']
            for component in part['components']:
                lo = [a + b for a, b in zip(component['minLocalM'], origin)]
                hi = [a + b for a, b in zip(component['maxLocalM'], origin)]
                overlap = all(min(b, d) > max(a, c) for a, b, c, d in zip(lo, hi, body_min, body_max))
                self.assertFalse(overlap, component['nativeNode'])
        report = json.loads((KIT / 'native-qualification.json').read_text())
        self.assertTrue(report['pass'])
        self.assertEqual(len(report['checks']), 21)
        self.assertTrue(all(check['pass'] for check in report['checks']))
        failed_previous = json.loads((KIT.parent / 'a002/native-qualification.json').read_text())
        self.assertFalse(failed_previous['pass'])
        self.assertTrue(any(not check['pass'] and 'floor support' in check['name'] for check in failed_previous['checks']))


if __name__ == '__main__':
    unittest.main()
