"""Generate reproducible Playwright CLI review scripts, no published asset writes."""
from pathlib import Path
import json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[2]
jobs=json.loads((ROOT/'.runtime/art-library/equipment/jobs.json').read_text())
review=ROOT/'output/playwright/equipment';review.mkdir(parents=True,exist_ok=True)
config={'browser':{'browserName':'chromium','launchOptions':{'executablePath':'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome','args':['--no-sandbox','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']},'contextOptions':{'viewport':{'width':1440,'height':1000}}}}
(review/'config.json').write_text(json.dumps(config))
inventory=json.loads((ROOT/'assets/art-library/shipyard-equipment/inventory.json').read_text())
for j in jobs:
 for v in j['variants']:
  d=ROOT/j['output']/v['name'];mesh=json.loads((d/'mesh.json').read_text())
  if (d/'runtime-top.png').exists():continue
  a={'id':v['asset_id'],'label':j['slug']+' / '+v['name']+' / unsigned r'+str(j['revision']),'category':'equipment','nodes':['GEO-'+v['asset_id']+'--equipment-review'],'bounds':mesh.get('visual_bounds',mesh['bounds']),'lights':json.loads((d/'lights.json').read_text()) if (d/'lights.json').exists() else []}
  original=next(e for e in inventory['assets'] if e['catalog_asset']['id']==v['asset_id'])
  placement={**original['placements'][0],'position':[0,0,0],'rotation':0,'flipped':False,'removedCells':[]}
  (d/'catalog.json').write_text(json.dumps({'schema':'sidereal.part-catalog.v1','assets':[a]}))
  (d/'wayfarer.json').write_text(json.dumps({'schema':'sidereal.assembly-draft.v1','id':'equipment-review','name':'Unsigned equipment','parts':[placement]}))
  volumes=json.loads((d/'voxels.json').read_text());(d/'catalog.voxels.json').write_text(json.dumps({'schema':'sidereal.part-volumes.v1','palette':mesh['palette'],'volumes':{v['asset_id']:volumes}}))
  paths={name:str(d/name) for name in ['catalog.json','catalog.voxels.json','wayfarer.json']};paths['parts.glb']=str(d/'glb.glb')
  height=a['bounds']['max'][2];size=max(b-a for a,b in zip(a['bounds']['min'],a['bounds']['max']))
  alpha=-.95 if j['slug']=='pilot-seat' else 2.52 if j['slug'] in ['wall-locker','lounge-sofa'] else .95
  radius=max(4,size*2.65)
  script='''async (page) => {
    await page.unrouteAll({behavior:'wait'});
    const paths=PATHS;
    for(const [name,path] of Object.entries(paths))await page.route('**/assets/assembly/'+name,route=>route.fulfill({path,contentType:name.endsWith('.json')?'application/json':'model/gltf-binary'}));
    // Expose the existing scene only to this isolated review browser. Rendering stays in the actual Shipyard.
    await page.route('**/packages/render/src/assembly-editor.ts*',async route=>{
      const response=await route.fetch();let text=await response.text();
      if(!text.includes('scene.useRightHandedSystem'))throw Error('Renderer hook changed');
      text=text.replace('scene.useRightHandedSystem','window.__equipmentReviewScene = scene; scene.useRightHandedSystem');
      await route.fulfill({response,body:text});
    });
    await page.goto('http://localhost:5174/shipyard');
    await page.evaluate(()=>localStorage.removeItem('sidereal.assembly.draft.v1'));
    await page.reload();
    await page.getByText('Select a part to inspect or move it',{exact:true}).waitFor({timeout:90000});
    await page.waitForFunction(()=>window.__equipmentReviewScene?.meshes.some(m=>m.name.includes('equipment-review')),{},{timeout:90000});
    const stats=await page.evaluate(({alpha,radius,height})=>{
      const s=window.__equipmentReviewScene,e=s.getEngine(),c=s.activeCamera;
      if(!s||!s.meshes.some(m=>m.name.includes('equipment-review')))throw Error('Review GLB not visible');
      e.stopRenderLoop();c.lowerRadiusLimit=.5;c.radius=radius;c.alpha=alpha;
      c.target.set(0,height/2,0);s.render();
      return {alpha:c.alpha,beta:c.beta,radius:c.radius,target:c.target.asArray(),renderer:e.webGLVersion,meshes:s.meshes.length,viewport:[innerWidth,innerHeight],draft:localStorage.getItem('sidereal.assembly.draft.v1')};
    },CAMERA);
    await page.screenshot({path:CLOSE,timeout:90000});
    await page.evaluate(()=>{const s=window.__equipmentReviewScene,c=s.activeCamera;c.lowerBetaLimit=.0001;c.upperBetaLimit=Math.PI/2;c.beta=.0001;s.render();});
    await page.screenshot({path:TOP,timeout:90000});
    const illumination=await page.evaluate(()=>{
      const s=window.__equipmentReviewScene,c=s.activeCamera;c.beta=.955316618;
      for(const l of s.lights)if(!l.name.includes('-fixture-'))l.intensity=.015;
      s.environmentIntensity=.015;
      const fixtures=s.lights.filter(l=>l.name.includes('-fixture-'));
      for(const l of fixtures)l.setEnabled(false);s.render();
      return {fixtures:fixtures.map(l=>({name:l.name,position:l.position.asArray(),direction:l.direction.asArray(),intensity:l.intensity,range:l.range,meshCount:l.includedOnlyMeshes.length})),emissive:s.materials.filter(m=>m.emissiveColor?.asArray().some(v=>v>0)).map(m=>({name:m.name,color:m.emissiveColor.asArray(),intensity:m.emissiveIntensity}))};
    });
    await page.screenshot({path:LIGHTOFF,timeout:90000});
    await page.evaluate(()=>{const s=window.__equipmentReviewScene;for(const l of s.lights)if(l.name.includes('-fixture-'))l.setEnabled(true);s.render();});
    await page.screenshot({path:LIGHTON,timeout:90000});
    return {...stats,illumination};
}'''.replace('PATHS',json.dumps(paths)).replace('CAMERA',json.dumps({'alpha':alpha,'radius':radius,'height':height})).replace('CLOSE',json.dumps(str(d/'runtime-close.png'))).replace('TOP',json.dumps(str(d/'runtime-top.png'))).replace('LIGHTOFF',json.dumps(str(d/'runtime-lighting-off.png'))).replace('LIGHTON',json.dumps(str(d/'runtime-lighting-on.png')))
  (review/(j['slug']+'-'+v['name']+'.js')).write_text(script)
  capture={'actual_app':'http://localhost:5174/shipyard','kind':'Actual dashboard Shipyard, single unsigned model through isolated Playwright browser route.fulfill','publication':False,'placement_id':placement['id'],'catalog_asset_id':v['asset_id'],'review_transform':'Single existing placement identity recentered at origin for inspection; saved source transforms remain in inventory','viewport':[1440,1000],'renderer':'Babylon WebGL2, Chromium software SwiftShader','camera_close':{'alpha':alpha,'beta':.955316618,'radius':radius,'target':[0,height/2,0]},'camera_top':{'beta':.0001,'scope':'Explicit review override, not native gameplay flight mode'},'renderer_override':'Expose scene reference and stop animation loop for deterministic stills; no source files or live state changed','git_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'hashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'packages/render/src/assembly-editor.ts',ROOT/'packages/sim/src/voxels.ts',d/'glb.glb',d/'catalog.json',d/'wayfarer.json']},'status':'capture-planned; mark captured only after actual screenshot command succeeds'}
  (d/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
