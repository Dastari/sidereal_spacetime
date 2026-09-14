from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parents[2];rev=sys.argv[1] if len(sys.argv)>1 else 'r001';folder='cargo' if rev=='r001' else 'cargo-'+rev;base=root/'.runtime/art-library/cargo'/rev;jobs=json.loads((base/'jobs.json').read_text())
for j in jobs:
 d=Path(j['output'])
 if (d/'runtime-top.png').exists():continue
 with (root/'output/playwright'/folder/(j['slug']+'-capture.log')).open('w') as log:
  subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=cargo','run-code','--filename='+str(root/'output/playwright'/folder/(j['slug']+'.js'))],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
 print('CAPTURED',j['slug'],flush=True)
