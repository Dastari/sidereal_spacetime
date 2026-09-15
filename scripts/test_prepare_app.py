"""Packaging must not expose internal documents, even from an older build."""
from pathlib import Path
import tempfile
import unittest

from prepare_app import prepare


class PrepareAppTests(unittest.TestCase):
    def test_only_allowlisted_help_and_runtime_survive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ("assets/runtime/ship.glb", "docs/public/shipyard.md",
                         "docs/handoffs/private.md", "reference/legacy.md", "PIVOT.md"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(name)
            for app in ("client", "dashboard"):
                for destination in ("public", "dist"):
                    for name in ("docs/old.md", "reference/private.txt", "help/stale.md", "PIVOT.md"):
                        path = root / "apps" / app / destination / name
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_text("old internal content")
                prepare(app, root)
                public = root / "apps" / app / "public"
                self.assertEqual((public / "assets/ship.glb").read_text(), "assets/runtime/ship.glb")
                for destination in ("public", "dist"):
                    output = root / "apps" / app / destination
                    for name in ("docs", "reference", "PIVOT.md", "help/stale.md"):
                        self.assertFalse((output / name).exists(), str(output / name))
                self.assertEqual((public / "help/shipyard.md").exists(), app == "dashboard")
            self.assertTrue((root / "docs/handoffs/private.md").exists())
            self.assertTrue((root / "reference/legacy.md").exists())

    def test_preparing_one_app_does_not_modify_other_app(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "assets/runtime").mkdir(parents=True)
            other = root / "apps/dashboard/public/docs/untouched.md"
            other.parent.mkdir(parents=True)
            other.write_text("sibling")
            prepare("client", root)
            self.assertEqual(other.read_text(), "sibling")

    def test_shared_celestials_are_exact_and_do_not_require_the_sibling_app(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "assets/runtime").mkdir(parents=True)
            for name in ("reviewed-planets", "reviewed-stars"):
                source = root / "assets/reviewed-celestials" / name / "revision/asset.bin"
                source.parent.mkdir(parents=True)
                source.write_bytes(bytes(range(256)))
                stale = root / "apps/client/public" / name / "old.bin"
                stale.parent.mkdir(parents=True)
                stale.write_text("stale")
            prepare("client", root)
            self.assertFalse((root / "apps/dashboard").exists())
            for name in ("reviewed-planets", "reviewed-stars"):
                output = root / "apps/client/public" / name
                self.assertFalse((output / "old.bin").exists())
                self.assertEqual((output / "revision/asset.bin").read_bytes(), bytes(range(256)))

    def test_invalid_app_cannot_choose_an_arbitrary_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                prepare("../../docs", Path(folder))


if __name__ == "__main__":
    unittest.main()
