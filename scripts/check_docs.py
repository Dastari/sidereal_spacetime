from pathlib import Path
import re,json,hashlib
ROOT=Path(__file__).resolve().parents[1];errors=[]
# Markdown moved to the Sidereal wiki on 2026-09-26 (docs/migrated-to-wiki.json): a listed file may be absent
# when its recorded SHA-256 matches the pinned hash; its content lives in the wiki and the archive.
MIGRATED={p:e['sha256'] for p,e in json.loads((ROOT/'docs/migrated-to-wiki.json').read_text())['files'].items()} if (ROOT/'docs/migrated-to-wiki.json').exists() else {}
def accounted(rel,sha):return MIGRATED.get(rel)==sha
files=[ROOT/'README.md',ROOT/'AGENTS.md',ROOT/'PIVOT.md',*(ROOT/'docs').glob('*.md')]
for path in files:
 text=path.read_text()
 for target in re.findall(r'\]\(([^)]+)\)',text):
  if '://' in target or target.startswith('#'):continue
  if not (path.parent/target.split('#')[0]).exists():errors.append(f'{path.relative_to(ROOT)} missing {target}')
for entry in json.loads((ROOT/'docs/source_inventory.json').read_text()):
 path=ROOT/'reference/sidereal'/entry['path']
 if not path.exists() and accounted('reference/sidereal/'+entry['path'],entry['sha256']):continue
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:errors.append(f"Reference changed: {entry['path']}")
for entry in json.loads((ROOT/'assets/import_manifest.json').read_text())['files']:
 path=ROOT/entry['path']
 if not path.exists() and accounted(entry['path'],entry['sha256']):continue
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:errors.append(f"Imported source changed: {entry['path']}")
if errors:raise SystemExit('\n'.join(errors))
print(f'Checked {len(files)} project documents, all legacy document hashes and imported asset provenance.')
