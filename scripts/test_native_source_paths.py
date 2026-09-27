"""Native pin lookup must use this checkout even when the author's tree exists."""
from pathlib import Path
import tempfile
import unittest
from native_source_paths import checkout_source_path


class NativeSourcePathsTests(unittest.TestCase):
    def test_relative_and_historical_pins_read_the_relocated_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'assets/kit.glb'
            source.parent.mkdir()
            source.write_bytes(b'exact relocated native bytes')
            for pin in ['assets/kit.glb', '/root/sidereal_spacetime/assets/kit.glb']:
                self.assertEqual(checkout_source_path(pin, root), source)
                self.assertEqual(checkout_source_path(pin, root).read_bytes(), source.read_bytes())

    def test_other_absolute_paths_and_traversal_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            for pin in ['/elsewhere/kit.glb', '../kit.glb', 'assets/../../kit.glb']:
                with self.subTest(pin=pin), self.assertRaises(ValueError):
                    checkout_source_path(pin, temporary)

    def test_symlink_cannot_redirect_to_another_checkout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'assets').symlink_to(root.parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                checkout_source_path('assets/kit.glb', root)
