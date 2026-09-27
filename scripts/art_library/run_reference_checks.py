"""Run large native-kit fixtures in separate processes to release parsed JSON."""
import json, os, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[2]
env = dict(os.environ)
env["NODE_OPTIONS"] = "--max-old-space-size=4096"
def run(command):
    print("Running: " + " ".join(command), flush=True)
    subprocess.run(command, cwd=root, env=env, check=True)
run(["npx", "tsc", "-p", "scripts/art_library/reference_review.tsconfig.json"])
files = json.loads((root / "scripts/art_library/reference_review_test_files.json").read_text())
for path in files:
    run(["npx", "vitest", "run", "--config", "scripts/art_library/reference_review.vitest.config.ts", path, "--maxWorkers=1", "--no-file-parallelism"])
for pattern in ["test_*reference*.py", "test_native_kit_attribute_audit.py", "test_preserve_native_kit_ior.py", "test_ice_moon_runtime_projection.py"]:
    run(["python3", "-m", "unittest", "discover", "-s", "scripts/art_library", "-p", pattern])
print("All reference checks passed", flush=True)
