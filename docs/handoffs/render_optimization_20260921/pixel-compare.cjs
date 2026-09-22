async (page) => {
 await page.evaluate(async()=>{
  const s=audit.scene,e=audit.engine;
  const frame=async(force)=>{audit.forceRedraw=force;e.beginFrame();s.render(false,true);e.endFrame();return e.readPixels(0,0,e.getRenderWidth(),e.getRenderHeight())};
  const compare=async(name,mutate)=>{mutate();audit.counts={};const a=await frame(false),maps={...audit.counts},b=await frame(true);let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d)}return {name,maps,changed,max,channels:a.length}};
  audit.pixels=[];
  audit.pixels.push(await compare('stationary',()=>{}));
  audit.pixels.push(await compare('camera orbit',()=>s.activeCamera.alpha+=.3));
  audit.pixels.push(await compare('camera zoom',()=>s.activeCamera.radius*=.9));
  audit.pixels.push(await compare('sun direction',()=>audit.shadow.getLight().direction.x+=.2));
  audit.pixels.push(await compare('native instance placement',()=>audit.map.renderList.find(m=>m.getClassName()==='InstancedMesh').position.x+=.25));
  audit.forceRedraw=false;
 });
 await page.locator('body > canvas').screenshot({path:'docs/handoffs/render_optimization_20260921/integrated-deck.png'});
}
