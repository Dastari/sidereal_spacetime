import subprocess,json
from pathlib import Path
root=Path('/root/sidereal_spacetime');out=root/'output/playwright/planet-reference-20260914/shadow-followup'
code='''async(page)=>{await page.evaluate(()=>{const r=window.planetReview;for(const l of r.scene.lights){const s=l.getShadowGenerator();if(s){s.forceBackFacesOnly=false;s.normalBias=0;s.bias=.0005;s.onBeforeShadowMapRenderMeshObservable.add(()=>r.engine.setState(true,0,false,false,true));}}r.scene.render();});await page.waitForTimeout(500);await page.evaluate(()=>window.planetReview.scene.render());await page.screenshot({path:OUT+'/ice-rhs-backfaces.png'});}'''.replace('OUT',json.dumps(str(out)))
p=subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=planet-art-recovery','run-code',code],capture_output=True,text=True);(out/'rhs-probe.log').write_text(p.stdout+p.stderr);p.check_returncode()
