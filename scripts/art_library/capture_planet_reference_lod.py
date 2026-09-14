"""Retained-LOD optical evidence; software timing is explicitly not acceptance."""
import argparse,fcntl,json,os,subprocess,time,hashlib
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='software-fixed-detail-glass-lod');args=parser.parse_args()
if not args.prefix.replace('-','').replace('_','').isalnum():raise ValueError('Invalid evidence prefix')
root=Path(__file__).resolve().parents[2];folder=root/'output/playwright/planet-reference-20260914/ice-r026'
lock=open(root/'.runtime/planet-reference-capture.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
out=folder/(args.prefix+'.json');assert not out.exists()
cli=['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s='+os.environ.get('SIDEREAL_REFERENCE_SESSION','planet-glass-review')]
url=os.environ.get('SIDEREAL_REFERENCE_URL','http://127.0.0.1:5173').rstrip('/')+'/@fs'+str(root)+'/scripts/art_library/planet_reference_review.html?candidate=1&style=ice&seed=38&kit=ice-r026&reviewRevision=ice-r026&capture='+str(time.time_ns())
code="""async(page)=>{
 await page.setViewportSize({width:1574,height:907});
 await page.goto(URL);
 await page.waitForFunction(()=>window.planetReview?.stats().candidate?.active===0,{}, {timeout:60000});
 await page.evaluate(()=>window.planetReview.lodRecorder.start({steps:[24,64,280,64,24,280].map(projected=>({projected,durationMs:7000})),viewport:{width:1574,height:907}}));
}""".replace('URL',json.dumps(url))
r=subprocess.run(cli+['run-code',code],cwd=root,text=True,capture_output=True);(folder/(args.prefix+'-start.log')).write_text(r.stdout+r.stderr)
if r.returncode or '### Error' in r.stdout:raise RuntimeError(r.stdout+r.stderr)
time.sleep(44)
r=subprocess.run(cli+['eval',"""JSON.stringify({record:window.planetReview.lodRecorder.stop('bounded software route complete'),stats:window.planetReview.stats(),optical:window.planetReview.scene.materials.filter(m=>m.subSurface?.isRefractionEnabled).map(m=>({id:m.uniqueId,name:m.name,targetId:m.subSurface.refractionTexture?.uniqueId,transmission:m.subSurface.refractionIntensity})),targets:window.planetReview.scene.textures.filter(t=>t.name==='opaqueSceneTexture').map(t=>({id:t.uniqueId,name:t.name})),url:location.href})"""],cwd=root,text=True,capture_output=True)
if r.returncode or '### Error' in r.stdout:raise RuntimeError(r.stdout+r.stderr)
raw=r.stdout.split('### Result\n',1)[1];data=json.JSONDecoder().raw_decode(raw)[0];data=json.loads(data)if isinstance(data,str)else data
data['method']='Isolated SwiftShader resource/continuity evidence only; frame timing is not hardware acceptance'
data['kitSha256']=hashlib.sha256((folder/'kit.json').read_bytes()).hexdigest()
out.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'summary':data['record']['summary'],'stats':data['stats']['candidate'],'optical':data['optical']}))
