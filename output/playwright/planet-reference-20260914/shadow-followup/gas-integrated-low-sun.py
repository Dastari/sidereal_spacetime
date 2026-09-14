import subprocess,json
from pathlib import Path
root=Path('/root/sidereal_spacetime');out=root/'output/playwright/planet-reference-20260914/shadow-followup'
code="""async(page)=>{for(const beta of [1.9,1.1]){for(const enabled of [true,false]){await page.evaluate(({beta,enabled})=>{const r=window.planetReview;r.scene.shadowsEnabled=enabled;r.camera.beta=beta;r.camera.radius=7.5;for(const l of r.scene.lights){if(l.getShadowGenerator()){l.direction.set(-.6,-.22,.45).normalize();const distance=l.position.length();l.position.copyFrom(l.direction.scale(-distance));}}r.scene.render();r.scene.render();},{beta,enabled});await page.screenshot({path:OUT+'/gas-tight-low-sun-'+beta+'-'+(enabled?'on':'off')+'.png'});}}}""".replace('OUT',json.dumps(str(out)))
p=subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=planet-art-recovery','run-code',code],capture_output=True,text=True);(out/'gas-tight-low-sun.log').write_text(p.stdout+p.stderr);p.check_returncode()
