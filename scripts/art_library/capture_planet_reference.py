"""Preserved isolated browser evidence. SwiftShader proves appearance, not timing."""
import argparse,json,subprocess,hashlib,time,fcntl,os
from pathlib import Path
from capture_planet_reference_settle import SETTLE_VIEW_JS
p=argparse.ArgumentParser();p.add_argument('--style',required=True);p.add_argument('--revision',required=True);p.add_argument('--seed',type=int,default=38);p.add_argument('--radius',type=float,default=5.5);p.add_argument('--alpha',type=float);p.add_argument('--beta',type=float);p.add_argument('--bias',type=float);p.add_argument('--depth-bias',type=float);p.add_argument('--glow',action='store_true');p.add_argument('--local-light',action='store_true');p.add_argument('--prefix',default='review');p.add_argument('--reference-scale',action='store_true');p.add_argument('--weather-revision',default='cloud-r002');p.add_argument('--sample-surfaces',action='store_true');p.add_argument('--unit',action='store_true');p.add_argument('--staged',action='store_true');p.add_argument('--target',type=float,nargs=3);p.add_argument('--shadows-off',action='store_true');p.add_argument('--reference-radius',type=float,default=13.5);a=p.parse_args()
root=Path(__file__).resolve().parents[2];folder=root/'output/playwright/planet-reference-20260914'/a.revision
capture_lock=open(root/'.runtime/planet-reference-capture.lock','w');fcntl.flock(capture_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
prefix=f'{a.prefix}-seed{a.seed}';paths=[folder/(prefix+'.png'),folder/(prefix+'-angle2.png')]
if a.reference_scale:paths.append(folder/(prefix+'-reference-scale.png'))
record=folder/(prefix+'.json')
if any(x.exists() for x in paths+[record]):raise RuntimeError('Preserve previous capture; choose a new prefix')
base=os.environ.get('SIDEREAL_REFERENCE_URL','http://127.0.0.1:5173').rstrip('/')
url=f'{base}/@fs{root}/scripts/art_library/planet_reference_review.html?style={a.style}&seed={a.seed}&candidate=1&reviewRevision={a.revision}&capture={time.time_ns()}'
if a.staged:url+='&kit='+a.revision
if a.unit:url+='&unit=1'
if a.bias is not None:url+=f'&shadowBias={a.bias}'
if a.shadows_off:url+='&shadowsOff=1'
if a.glow:url+='&glow=1'
if a.local_light:url+='&localLight=1'
q=json.dumps
code=f'''async (page)=>{{
 const settleView=label=>page.evaluate({SETTLE_VIEW_JS},{{label}});
 await page.setViewportSize({{width:900,height:900}});
 await page.unroute("**/planet-reference-kit.json");await page.route("**/planet-reference-kit.json",r=>r.fulfill({{path:{q(str(folder/'kit.json'))},contentType:"application/json"}}));
 await page.unroute("**/planet-reference-cloud-kit.json");await page.route("**/planet-reference-cloud-kit.json",r=>r.fulfill({{path:{q(str(folder.parent/a.weather_revision/'kit.json'))},contentType:"application/json"}}));
 await page.unroute("**/planet-reference-assets/**");await page.route("**/planet-reference-assets/**",r=>r.fulfill({{path:{q(str(folder)+'/')}+r.request().url().split("/planet-reference-assets/")[1]}}));
 await page.unroute("**/planet-reference-weather-assets/**");await page.route("**/planet-reference-weather-assets/**",r=>r.fulfill({{path:{q(str(folder.parent/a.weather_revision)+'/')}+r.request().url().split("/planet-reference-weather-assets/")[1]}}));
 await page.goto("about:blank");await page.goto({q(url)});
 await page.waitForFunction(()=>window.planetReview?.stats().candidate?.error||(window.planetReview?.stats().candidate?.active===0&&window.planetReview.stats().frames>15),{{}},{{timeout:60000}});
 const error=await page.evaluate(()=>window.planetReview.stats().candidate.error);if(error)throw new Error(error);
 await page.evaluate(()=>{{const r=window.planetReview;{'r.scene.onBeforeRenderObservable.add(()=>{for(const light of r.scene.lights){const shadow=light.getShadowGenerator();if(shadow)shadow.bias='+str(a.depth_bias)+';}});' if a.depth_bias is not None else ''}r.camera.radius={a.radius};{'r.camera.target.set('+','.join(map(str,a.target))+');' if a.target else ''}{'r.camera.alpha='+str(a.alpha)+';' if a.alpha is not None else ''}{'r.camera.beta='+str(a.beta)+';' if a.beta is not None else ''}}});await settleView('close');await page.screenshot({{path:{q(str(paths[0]))}}});
 await page.evaluate(()=>{{const r=window.planetReview;r.camera.alpha+=1.6;}});await settleView('angle2');await page.screenshot({{path:{q(str(paths[1]))}}});
'''
if a.reference_scale:code+=f'await page.evaluate(()=>{{const r=window.planetReview;r.camera.radius={a.reference_radius};}});await settleView("reference-scale");await page.screenshot({{path:{q(str(paths[2]))}}});\n'
code+='}'
cli=['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s='+os.environ.get('SIDEREAL_REFERENCE_SESSION','planet-reference')]
r=subprocess.run(cli+['run-code',code],cwd=root,text=True,capture_output=True)
(folder/(prefix+'-capture.log')).write_text(r.stdout+r.stderr)
if r.returncode or '### Error' in r.stdout:raise RuntimeError((r.stdout+r.stderr)[-3000:])
expression='JSON.stringify({viewSettlements:window.__referenceCaptureSettlements,viewport:{width:innerWidth,height:innerHeight},canvas:{width:window.planetReview.engine.getRenderWidth(),height:window.planetReview.engine.getRenderHeight()},stats:window.planetReview.stats(),shadowsEnabled:window.planetReview.scene.shadowsEnabled,camera:{alpha:window.planetReview.camera.alpha,beta:window.planetReview.camera.beta,radius:window.planetReview.camera.radius},shadows:window.planetReview.scene.lights.filter(l=>l.isEnabled()&&l.getShadowGenerator()).map(l=>({casters:l.getShadowGenerator().getShadowMap().renderList?.length,normalBias:l.getShadowGenerator().normalBias,bias:l.getShadowGenerator().bias}))})'
r=subprocess.run(cli+['eval',expression],cwd=root,text=True,capture_output=True,check=True)
if a.sample_surfaces:
 sample_expression='JSON.stringify([[300,450],[450,450],[560,400],[350,330]].map(([x,y])=>{const r=window.planetReview;r.camera.radius='+str(a.radius)+';r.camera.alpha-=1.6;r.scene.render();const hit=r.scene.pick(x,y,m=>m.isEnabled()&&m.metadata?.trianglePlacementRanges);r.camera.alpha+=1.6;return {x,y,mesh:hit.pickedMesh?.name,face:hit.faceId,placement:hit.pickedMesh?.metadata?.trianglePlacementRanges.find(t=>hit.faceId>=t.firstTriangle&&hit.faceId<t.firstTriangle+t.triangleCount)?.partId};}))'
 sampled=subprocess.run(cli+['eval',sample_expression],cwd=root,text=True,capture_output=True,check=True)
 (folder/(prefix+'-surface-samples.log')).write_text(sampled.stdout)
raw=r.stdout.split('### Result\n',1)[1];payload=json.JSONDecoder().raw_decode(raw)[0];payload=json.loads(payload) if isinstance(payload,str) else payload
if payload['stats']['style']!=a.style:raise RuntimeError('Capture style changed during review')
payload['checkoutHead']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
payload['sourceRoot']=str(root)
payload.update(method='Isolated Babylon review; software renderer timing is not hardware acceptance',request=vars(a),url=url,images={x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in paths},kitSha256=hashlib.sha256((folder/'kit.json').read_bytes()).hexdigest())
if a.staged:
 staged=root/'scripts/art_library/review-staging'/a.revision
 payload['sourceKitSha256']=payload['kitSha256'];payload['kitSha256']=hashlib.sha256((staged/'kit.json').read_bytes()).hexdigest();payload['stagingManifest']=json.loads((staged/'staging-manifest.json').read_text())
record.write_text(json.dumps(payload,indent=2)+'\n');print(json.dumps({'record':str(record),'candidate':payload['stats']['candidate'],'renderer':payload['stats']['renderer']}))
