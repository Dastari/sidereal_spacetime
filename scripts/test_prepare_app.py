"""Packaging publishes only allowlisted runtime assets and never internal documents."""
from pathlib import Path
import json
import re
import tempfile
import unittest

from prepare_app import EDITOR_NATIVE_ASSETS, PUBLISHED_RUNTIME, ROOT, check_references, prepare

ASSET_LITERAL = re.compile(r'["\'`](/assets/[^"\'`\s]+)')


def write(root: Path, name: str, text: str | None = None) -> None:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(name if text is None else text)


def seed_runtime(root: Path) -> None:
    """Every allowlisted entry must exist; a missing one is a broken build, not a skip."""
    for source in EDITOR_NATIVE_ASSETS:
        write(root, source)
    for entry in PUBLISHED_RUNTIME:
        path = root / "assets/runtime" / entry
        if entry.endswith(".glb"):
            write(root, f"assets/runtime/{entry}")
        else:
            path.mkdir(parents=True, exist_ok=True)


class PrepareAppTests(unittest.TestCase):
    def test_only_allowlisted_help_and_runtime_survive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            seed_runtime(root)
            for name in ("assets/runtime/wayfarer.glb", "assets/runtime/assembly/parts.glb",
                         "docs/public/shipyard.md", "docs/handoffs/private.md",
                         "reference/legacy.md", "PIVOT.md"):
                write(root, name)
            for app in ("client", "dashboard"):
                for destination in ("public", "dist"):
                    for name in ("docs/old.md", "reference/private.txt", "help/stale.md", "PIVOT.md"):
                        write(root, f"apps/{app}/{destination}/{name}", "old internal content")
                prepare(app, root)
                public = root / "apps" / app / "public"
                self.assertEqual((public / "assets/wayfarer.glb").read_text(), "assets/runtime/wayfarer.glb")
                self.assertEqual((public / "assets/assembly/parts.glb").read_text(), "assets/runtime/assembly/parts.glb")
                for destination in ("public", "dist"):
                    output = root / "apps" / app / destination
                    for name in ("docs", "reference", "PIVOT.md", "help/stale.md"):
                        self.assertFalse((output / name).exists(), str(output / name))
                self.assertEqual((public / "help/shipyard.md").exists(), app == "dashboard")
                for source, destination in EDITOR_NATIVE_ASSETS.items():
                    self.assertEqual((public / destination).exists(), app == "dashboard")
                    if app == "dashboard":
                        self.assertEqual((public / destination).read_text(), source)
            self.assertTrue((root / "docs/handoffs/private.md").exists())
            self.assertTrue((root / "reference/legacy.md").exists())

    def test_unlisted_runtime_packages_and_review_renders_stay_private(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            seed_runtime(root)
            for name in ("assets/runtime/wayfarer.glb",
                         "assets/runtime/construction/boundary-r004/kit.glb",
                         "assets/runtime/construction/complex-preview-r000/join.glb",
                         "assets/runtime/wayfarer-rebuild-r002/hull.glb",
                         "assets/runtime/crew/looks/captain.png",
                         "assets/runtime/crew/looks/views/captain-front.png",
                         "assets/runtime/crew/browser-walk.png",
                         "assets/runtime/equipment/contact-sheet.png",
                         "assets/runtime/equipment/carbine.glb"):
                write(root, name)
            # A previously published file that is no longer listed must disappear.
            write(root, "apps/client/public/assets/stale/old.glb")
            prepare("client", root)
            assets = root / "apps/client/public/assets"
            for published in ("wayfarer.glb", "construction/boundary-r004/kit.glb",
                              "crew/looks/captain.png", "equipment/carbine.glb"):
                self.assertTrue((assets / published).is_file(), published)
            for private in ("construction/complex-preview-r000/join.glb", "wayfarer-rebuild-r002",
                            "crew/looks/views", "crew/browser-walk.png",
                            "equipment/contact-sheet.png", "stale"):
                self.assertFalse((assets / private).exists(), private)

    def test_published_manifest_may_not_reference_unpublished_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            seed_runtime(root)
            write(root, "assets/runtime/assembly/hull-manifest.json",
                  json.dumps({"parts": [{"url": "/assets/assembly/parts.glb?revision=r001"},
                                        {"url": "/assets/construction/complex-preview-r000/join.glb"}]}))
            write(root, "assets/runtime/assembly/parts.glb")
            write(root, "assets/runtime/construction/complex-preview-r000/join.glb")
            with self.assertRaises(RuntimeError) as failure:
                prepare("client", root)
            self.assertIn("complex-preview-r000/join.glb", str(failure.exception))
            self.assertNotIn("parts.glb", str(failure.exception))

    def test_preparing_one_app_does_not_modify_other_app(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            seed_runtime(root)
            other = root / "apps/dashboard/public/docs/untouched.md"
            other.parent.mkdir(parents=True)
            other.write_text("sibling")
            prepare("client", root)
            self.assertEqual(other.read_text(), "sibling")

    def test_missing_allowlisted_entry_fails_the_build(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            seed_runtime(root)
            (root / "assets/runtime/construction/floor-finishes").rmdir()
            with self.assertRaises(FileNotFoundError):
                prepare("client", root)

    def test_invalid_app_cannot_choose_an_arbitrary_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                prepare("../../docs", Path(folder))

    def test_repository_allowlist_covers_every_asset_path_in_app_source(self):
        """Literal `/assets/...` paths in shipped code must resolve inside the published tree."""
        runtime = ROOT / "assets/runtime"
        if not runtime.is_dir():
            self.skipTest("runtime assets not exported in this checkout")
        for entry in PUBLISHED_RUNTIME:
            self.assertTrue((runtime / entry).exists(), f"allowlisted entry missing: {entry}")
        unresolved = set()
        for base in ("apps/client/src", "apps/dashboard/src", "packages"):
            for source in (ROOT / base).rglob("*.ts*"):
                if ".test." in source.name or "node_modules" in source.parts:
                    continue
                for match in ASSET_LITERAL.finditer(source.read_text(errors="ignore")):
                    url = match.group(1)
                    if "${" in url:
                        continue
                    relative = url.split("?")[0].split("#")[0][len("/assets/"):]
                    if not any(relative == e or relative.startswith(e.rstrip("/") + "/") or
                               relative.rstrip("/") == e for e in PUBLISHED_RUNTIME):
                        unresolved.add(f"{source.relative_to(ROOT)}: {url}")
                    elif not (runtime / relative).exists():
                        unresolved.add(f"{source.relative_to(ROOT)}: {url} (missing)")
        self.assertEqual(unresolved, set())

    def test_repository_published_manifests_resolve(self):
        runtime = ROOT / "assets/runtime"
        if not runtime.is_dir():
            self.skipTest("runtime assets not exported in this checkout")
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "assets").symlink_to(ROOT / "assets")
            (root / "docs/public").mkdir(parents=True)
            (root / "docs/public/shipyard.md").write_text("help")
            prepare("dashboard", root)
            check_references(root / "apps/dashboard/public/assets")


if __name__ == "__main__":
    unittest.main()
