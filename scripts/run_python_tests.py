"""Use the installed art environment locally, or CI's declared Pillow environment."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"], cwd=ROOT, check=True)
art_python = ROOT / ".tools/art/bin/python"
interpreter = str(art_python) if art_python.is_file() else sys.executable
subprocess.run([interpreter, "-m", "unittest", "discover", "-s", "scripts/art_library", "-p", "test_*.py"], cwd=ROOT, check=True)
