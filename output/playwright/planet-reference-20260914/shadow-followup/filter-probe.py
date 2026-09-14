import subprocess,json
from pathlib import Path
root=Path('/root/sidereal_spacetime');out=root/'output/playwright/planet-reference-20260914/shadow-followup'
code='''async(page)=>{for(const mode of ['pcf','unfiltered']){await page.evaluate(mode=>{const r=window.planetReview;r.scene.shadowsEnabled=true;for(const l of r.scene.lights){const s=l.getShadowGenerator();if(s){s.forceBackFacesOnly=false;s.normalBias=.006;s.bias=.0005;s.usePercentageCloserFiltering=mode==='pcf';}}r.scene.render();},mode);await page.waitForTimeout(500);await page.evaluate(()=>{window.planetReview.scene.render();window.planetReview.scene.render()});await page.screenshot({path:OUT+'/ice-filter-'+mode+'.png'});}}'''.replace('OUT',json.dumps(str(out)))
p=subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=planet-art-recovery','run-code',code],capture_output=True,text=True);(out/'filter-probe.log').write_text(p.stdout+p.stderr);p.check_returncode()
