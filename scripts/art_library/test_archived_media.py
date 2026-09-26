"""Archived reference/review media (assets/art-library/ARCHIVED.json) still satisfy ledger hash checks."""
import hashlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:  # profiles.py is a local, untracked module on some checkouts; the helper under test does not use it.
    import art_library.profiles  # noqa: F401
except ModuleNotFoundError:
    stub = types.ModuleType("art_library.profiles")
    stub.proposal = stub.design_family = stub.style = None
    sys.modules["art_library.profiles"] = stub
import art_catalog  # noqa: E402


class ArchivedMediaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.lib = root / "repo/assets/art-library"
        self.archive = root / "archive"
        self.rel = "designs/demo/revisions/r001/render.png"
        self.data = b"exact original"
        self.sha = hashlib.sha256(self.data).hexdigest()
        (self.lib / "designs/demo/revisions/r001").mkdir(parents=True)
        (self.lib / "ARCHIVED.json").write_text(json.dumps({
            "archive_root": str(self.archive), "files": {self.rel: {"sha256": self.sha, "bytes": len(self.data)}}}))
        self._lib, art_catalog.LIB, art_catalog._ARCHIVED = art_catalog.LIB, self.lib, None

    def tearDown(self):
        art_catalog.LIB, art_catalog._ARCHIVED = self._lib, None
        self.tmp.cleanup()

    def test_archived_file_absent_from_tree_passes_with_recorded_hash(self):
        self.assertTrue(art_catalog.present(self.lib / self.rel, self.sha))

    def test_wrong_hash_or_unlisted_path_fails(self):
        self.assertFalse(art_catalog.present(self.lib / self.rel, "0" * 64))
        self.assertFalse(art_catalog.present(self.lib / "designs/demo/revisions/r001/other.png", self.sha))

    def test_mounted_archive_copy_is_verified(self):
        copy = self.archive / "sidereal_spacetime/assets/art-library" / self.rel
        copy.parent.mkdir(parents=True)
        copy.write_bytes(self.data)
        self.assertTrue(art_catalog.present(self.lib / self.rel, self.sha))
        copy.write_bytes(b"tampered")
        self.assertFalse(art_catalog.present(self.lib / self.rel, self.sha))

    def test_file_in_tree_is_hashed_directly(self):
        path = self.lib / "designs/demo/revisions/r001/in-tree.png"
        path.write_bytes(b"in tree")
        self.assertTrue(art_catalog.present(path, hashlib.sha256(b"in tree").hexdigest()))
        self.assertFalse(art_catalog.present(path, self.sha))


if __name__ == "__main__":
    unittest.main()
