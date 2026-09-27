"""Sequential actual packaged catalog validation/build with a 1GiB JS heap per asset."""
import json, os, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'output/genesis-reviewed-native-smoke'
out.mkdir(parents=True, exist_ok=True)
catalog = json.loads((root / 'packages/render/src/environment/reviewed-native-planet-catalog.json').read_text())
results = json.loads((out / "results.json").read_text()) if "--failed-only" in sys.argv else []
retry = {r["id"] for r in results if r["exitCode"]}
if "--failed-only" in sys.argv:
    catalog = [item for item in catalog if item["id"] in retry]
    results = [r for r in results if r["id"] not in retry]
for item in catalog:
    result = subprocess.run([str(root / 'node_modules/.bin/tsx'), 'scripts/reviewed-native-smoke.ts', item['id']], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=1024'}, capture_output=True, text=True, timeout=180)
    (out / (item['id'] + '.log')).write_text(result.stdout + result.stderr)
    row = {'id': item['id'], 'exitCode': result.returncode}
    if result.returncode == 0:
        row.update(json.loads(result.stdout.strip().splitlines()[-1]))
    results.append(row)
    (out / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(row), flush=True)
sys.exit(any(row['exitCode'] for row in results))
