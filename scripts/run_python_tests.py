"""Run standard, Pillow-art and declared native-geometry Python test environments."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"], cwd=ROOT, check=True)
art_python = ROOT / ".tools/art/bin/python"
interpreter = str(art_python) if art_python.is_file() else sys.executable
subprocess.run([interpreter, "-m", "unittest", "discover", "-s", "scripts/art_library", "-p", "test_*.py"], cwd=ROOT, check=True)
geometry_python = ROOT / ".runtime/construction-enclosure-python/bin/python"
if not geometry_python.is_file():
    raise SystemExit("Native geometry tests require their declared environment. Run: python3 -m venv .runtime/construction-enclosure-python && .runtime/construction-enclosure-python/bin/python -m pip install -r scripts/geometry_tests/requirements.txt")
# The numeric/CSG evidence is versioned. A different installed version is a new
# qualification, not a reason to silently skip tests or accept stale artifacts.
subprocess.run([str(geometry_python), "-c", "from importlib.metadata import version; from pathlib import Path; pins=[line.split('==') for line in Path('scripts/geometry_tests/requirements.txt').read_text().splitlines() if line and not line.startswith('#')]; assert all(version(name)==expected for name,expected in pins), 'Native geometry dependency versions differ from declared qualification environment'"], cwd=ROOT, check=True)
# Rebuild private read-only fixtures from exact tracked source hashes for clean CI.
subprocess.run([str(ROOT / "node_modules/.bin/tsx"), "scripts/prepare_wayfarer_conversion.ts"], cwd=ROOT, check=True)
subprocess.run([str(geometry_python), "-m", "unittest", "discover", "-s", "scripts/geometry_tests", "-p", "test_*.py"], cwd=ROOT, check=True)
