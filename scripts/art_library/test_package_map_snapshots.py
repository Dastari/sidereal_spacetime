import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

spec = importlib.util.spec_from_file_location('portraits', Path(__file__).with_name('package_map_snapshots.py'))
portraits = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portraits)
STAR = 'yellow-main-sequence-r013'
PIN = 'f651ba13ade02fb918c97dd4d3924879dd9c204527a4e43cef90c8c578505bd2'


class PortraitPackagingTest(unittest.TestCase):
    def run_capture(self, mode):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        catalog = root/'packages/render/src/environment/reviewed-native-planet-catalog.json'
        catalog.parent.mkdir(parents=True)
        catalog.write_text('[]')
        source = root/'output/playwright/map-portraits-alpha'/(STAR+'.png')
        source.parent.mkdir(parents=True)
        image = Image.new(mode, (9, 9))
        image.putpixel((4,4), (0,0,0,255) if mode == 'RGBA' else (0,0,0))
        if mode == 'RGBA':
            image.putpixel((5,4), (200,100,40,64))
        image.save(source)
        source.with_suffix('.json').write_text(json.dumps({
            'id':STAR, 'assetSha256':PIN, 'seed':3901,
            'sourceSha256':portraits.digest(source), 'transparent':True,
            'state':{'selected':STAR, 'ready':True},
        }))
        return root

    def test_dark_surface_and_soft_coverage_survive_packaging(self):
        root = self.run_capture('RGBA')
        with patch.object(portraits, 'ROOT', root), patch('sys.argv', ['package', '--source-root', str(root)]), contextlib.redirect_stdout(io.StringIO()):
            portraits.main()
        with Image.open(root/'apps/dashboard/public/map-snapshots'/(STAR+'-alpha-v1.webp')) as image:
            self.assertEqual(image.mode, 'RGBA')
            self.assertEqual(image.getpixel((0,0))[3], 0)
            self.assertEqual(image.getpixel((4,4))[3], 255)
            self.assertEqual(image.getpixel((5,4))[3], 64)

    def test_opaque_capture_cannot_replace_catalog(self):
        root = self.run_capture('RGB')
        manifest = root/'apps/dashboard/public/map-snapshots/manifest.json'
        manifest.parent.mkdir(parents=True)
        manifest.write_text('prior catalog')
        with patch.object(portraits, 'ROOT', root), patch('sys.argv', ['package', '--source-root', str(root)]):
            with self.assertRaisesRegex(ValueError, 'transparent coverage'):
                portraits.main()
        self.assertEqual(manifest.read_text(), 'prior catalog')


if __name__ == '__main__':
    unittest.main()
