from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parents[2];mode=sys.argv[1];folder=root/'output/playwright'/('cargo-'+mode);session='cargo-'+mode
for row in json.loads((folder/'captures.json').read_text()):
 if Path(row['top']).exists():continue
 with Path(row['log']).open('w') as log:subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s='+session,'run-code','--filename='+row['script']],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
 if not Path(row['top']).exists():raise ValueError('Missing capture: '+row['tag'])
 print('CAPTURED',row['tag'],flush=True)
