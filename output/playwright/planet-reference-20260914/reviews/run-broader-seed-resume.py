"""Serialized, resumable evidence collection; preserve failed/corrected captures."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path('/root/sidereal_spacetime')
out=root/'output/playwright/planet-reference-20260914'
manifest=json.loads((out/'reviews/broader-seed-capture-manifest.json').read_text())
results=[]
for job in manifest['jobs']:
 folder=out/job['revision']; seed=job['seed']; valid=None
 for record in sorted(folder.glob(f'broader-shadow-fixed*-seed{seed}.json')):
  value=json.loads(record.read_text());request=value.get('request',{})
  if request.get('reference_radius')==job['referenceRadius'] and request.get('style')==job['style'] and value.get('sourceKitSha256',value.get('kitSha256'))==job['kitSha256']:
   valid=record;break
 if valid:
  results.append({'id':job['id'],'record':str(valid.relative_to(root)),'status':'complete'});continue
 if hashlib.sha256((folder/'kit.json').read_bytes()).hexdigest()!=job['kitSha256']:raise RuntimeError('Kit changed '+job['id'])
 prefix='broader-shadow-fixed';attempt=0
 while list(folder.glob(f'{prefix}-seed{seed}*')):
  attempt+=1;prefix=f'broader-shadow-fixed-retry{attempt}'
 argv=job['argv'].copy();argv[argv.index('--prefix')+1]=prefix
 print('CAPTURE '+job['id']+' '+prefix,flush=True)
 completed=subprocess.run(argv,cwd=root,env=dict(os.environ,SIDEREAL_REFERENCE_SESSION='planet-art-recovery'),capture_output=True,text=True)
 record=folder/f'{prefix}-seed{seed}.json'
 result={'id':job['id'],'record':str(record.relative_to(root)),'status':'complete' if completed.returncode==0 else 'failed','exitCode':completed.returncode,'output':completed.stdout[-1800:],'error':completed.stderr[-2400:]}
 results.append(result)
 with (out/'reviews/broader-seed-resume-events.jsonl').open('a') as f:f.write(json.dumps(result)+'\n')
 (out/'reviews/broader-seed-final-records.json').write_text(json.dumps(results,indent=2)+'\n')
 print(result['status']+' '+job['id'],flush=True)
 if completed.returncode:raise SystemExit(completed.returncode)
(out/'reviews/broader-seed-final-records.json').write_text(json.dumps(results,indent=2)+'\n')
print('COMPLETE '+str(len(results)),flush=True)
