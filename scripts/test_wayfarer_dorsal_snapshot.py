"""Exact dorsal admission and non-overwrite tests against the shipped selected source bytes."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('dorsal_snapshot', Path(__file__).parent / 'art_library/wayfarer_dorsal_snapshot.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class DorsalSnapshotTests(unittest.TestCase):
    def test_refuses_existing_revision_without_touching_it(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'retained.glb').write_bytes(b'exact prior revision')
            with self.assertRaisesRegex(ValueError, 'never overwrite'):
                module.stage(root / 'unneeded', root)
            self.assertEqual((root / 'retained.glb').read_bytes(), b'exact prior revision')

    def test_metadata_mismatch_never_creates_a_partial_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'manifest.json').write_text('{}')
            (root / 'layout.json').write_text('{}')
            output = root / 'candidate'
            with self.assertRaisesRegex(ValueError, 'Changed completed flight metadata'):
                module.stage(root, output)
            self.assertFalse(output.exists())

    def test_refuses_path_escape_and_symlink_escape(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'source'
            root.mkdir()
            for value in ('../outside.glb', '/absolute.glb'):
                with self.assertRaisesRegex(ValueError, 'Unsafe'):
                    module.checked_relative(root, value)
            (root / 'escape').symlink_to(root.parent, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'leaves root'):
                module.checked_relative(root, 'escape/outside.glb')


if __name__ == '__main__':
    unittest.main()
