import subprocess,json
from pathlib import Path
root=Path('/root/sidereal_spacetime');out=root/'output/playwright/planet-reference-20260914/shadow-followup'
code='''async(page)=>{for(const value of [.003,.006]){await page.evaluate(value=>{const r=window.planetReview;for(const l of r.scene.lights){const s=l.getShadowGenerator();if(s){s.normalBias=.003;s.bias=value;}}r.scene.render();},value);await page.waitForTimeout(500);await page.evaluate(()=>window.planetReview.scene.render());await page.screenshot({path:OUT+'/ice-rhs-bias-'+value+'.png'});}}'''.replace('OUT',json.dumps(str(out)))
p=subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=planet-art-recovery','run-code',code],capture_output=True,text=True);(out/'rhs-bias-probe.log').write_text(p.stdout+p.stderr);p.check_returncode()
