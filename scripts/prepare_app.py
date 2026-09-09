"""Prepare one app's runtime assets and explicitly public help only."""
from pathlib import Path
import argparse
import shutil

ROOT = Path(__file__).resolve().parents[1]
# Source -> public URL. Internal docs, ledgers and references are not public.
PUBLIC_HELP = {
    "client": {},
    "dashboard": {"docs/public/shipyard.md": "help/shipyard.md"},
}


def prepare(app: str, root: Path = ROOT) -> None:
    if app not in PUBLIC_HELP:
        raise ValueError("Unknown app")
    public = root / "apps" / app / "public"
    public.mkdir(parents=True, exist_ok=True)
    # Remove generated legacy copies, never repository source documents.
    # Clear the previous build too, until the independent app build replaces it.
    for output in (public, root / "apps" / app / "dist"):
        for name in ("docs", "reference", "help", "PIVOT.md"):
            path = output / name
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.is_dir():
                shutil.rmtree(path)
    shutil.copytree(root / "assets/runtime", public / "assets", dirs_exist_ok=True)
    for source, destination in PUBLIC_HELP[app].items():
        target = public / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / source, target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("app", choices=PUBLIC_HELP)
    prepare(parser.parse_args().app)
    print("Prepared runtime assets and allowlisted public help only.")
