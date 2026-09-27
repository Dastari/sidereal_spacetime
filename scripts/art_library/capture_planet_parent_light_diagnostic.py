"""Isolated hypothetical parent-light comparison; unchanged source, not runtime acceptance."""
import fcntl,hashlib,json,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
lock=open(root/'.runtime/planet-reference-capture.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
for name in ['gas-giant-moon-1','gas-giant-moon-3']:
 folder=root/'output/playwright/planet-reference-20260914'/f'{name}-r001'
 paths=[folder/f'parent-light-diagnostic-{x}.png' for x in ['angle1','angle2','reference-scale']]
 record=folder/'parent-light-diagnostic.json'
 assert not any(p.exists() for p in paths+[record]),'Preserve evidence'
 url=f'http://127.0.0.1:5173/@fs/root/sidereal_spacetime/scripts/art_library/planet_reference_review.html?candidate=1&style=moon&seed=38&kit={name}-r001&capture={time.time_ns()}&shadowBias=.006'
 code='''async(page)=>{
 await page.route('**/@fs/**',r=>r.continue());
 await page.route('**/@fs/root/sidereal_spacetime/output/playwright/planet-reference-20260914/REVISION/**',r=>r.fulfill({path:FOLDER+r.request().url().split('/REVISION/')[1]}));
 await page.route('**/assets/runtime/materials/frontier-workshop.hdr',r=>r.fulfill({path:'/root/sidereal_spacetime/assets/runtime/materials/frontier-workshop.hdr'}));
 await page.goto('about:blank');await page.goto(URL);
 await page.waitForFunction(()=>window.planetReview?.stats().candidate?.active===0,{}, {timeout:60000});
 await page.evaluate(async()=>{const r=window.planetReview;r.engine.stopRenderLoop();r.camera.radius=5.5;const sun=r.scene.lights.find(l=>l.name==='review-sun');const light=new sun.constructor('diagnostic-hypothetical-parent',sun.direction.clone().set(-.9,-.25,-.25),r.scene);light.diffuse.copyFromFloats(1,.025,.65);light.intensity=3.2;light.specular.copyFromFloats(1,.08,.8);light.metadata={role:'planet-review-light',hypothesis:'Unverified reflected parent light; not an authored emissive material'};r.scene.render();await r.scene.whenReadyAsync();r.scene.render();});
 await page.screenshot({path:PATH0});await page.evaluate(()=>{const r=window.planetReview;r.camera.alpha+=1.6;r.scene.render()});await page.screenshot({path:PATH1});await page.evaluate(()=>{const r=window.planetReview;r.camera.radius=RADIUS;r.scene.render()});await page.screenshot({path:PATH2});
 return await page.evaluate(()=>({stats:window.planetReview.stats(),lights:window.planetReview.scene.lights.map(l=>({name:l.name,intensity:l.intensity,diffuse:l.diffuse.asArray(),direction:l.direction?.asArray()}))}));
 }'''
 import struct
 w,h=struct.unpack('>II',(folder/'exact-reference.png').read_bytes()[16:24]);radius=56*62/max(w,h)
 for key,value in [('URL',json.dumps(url)),('FOLDER',json.dumps(str(folder)+'/')),('REVISION',name+'-r001'),('RADIUS',str(radius))]+[(f'PATH{i}',json.dumps(str(p)))for i,p in enumerate(paths)]:code=code.replace(key,value)
 result=subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=planet-reference','run-code',code],text=True,capture_output=True,cwd=root)
 (folder/'parent-light-diagnostic.log').write_text(result.stdout+result.stderr)
 assert result.returncode==0 and '### Error'not in result.stdout,result.stdout[-2000:]
 record.write_text(json.dumps(dict(url=url,hypothesis='One fixed magenta directional parent reflection, intensity3.2. Diagnostic only: reference does not identify illumination versus intrinsic material.',kitSha256=hashlib.sha256((folder/'kit.json').read_bytes()).hexdigest(),images={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in paths},method='SwiftShader appearance only; no hardware or production acceptance'),indent=2))
 print(name,flush=True)
