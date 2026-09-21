async (page) => {
  await page.evaluate(async () => {
    document.querySelector('#root').style.display='none';
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;
    canvas.style.cssText='width:960px;height:600px';document.body.append(canvas);
    const r=await import('/@fs/root/sidereal-render-performance/packages/render/src/index.ts');
    window.audit={};
    audit.loading=(async()=>{
      const equipmentPose=await r.loadEquipmentPoseConfiguration();
      audit.world=await r.createWorld(canvas,()=>{},{equipmentPose,onScene:s=>{
        audit.scene=s;
        const engine=s.getEngine(), start=engine.runRenderLoop.bind(engine);
        engine.runRenderLoop=fn=>{audit.loop=fn;};
        audit.resume=()=>start(audit.loop);
      }});
      audit.world.update({heading:0,x:0,y:0,localX:0,localY:0,interior:true,inspect:false,grid:false,bodies:[],equippedAsset:null,reducedMotion:true});
      audit.engine=audit.scene.getEngine();audit.shadow=audit.scene.lights.find(l=>l.name==='exterior-key').getShadowGenerator();audit.map=audit.shadow.getShadowMap();
      audit.counts={};
      for(const l of audit.scene.lights){const m=l.getShadowGenerator()?.getShadowMap();if(m)m.onBeforeRenderObservable.add(()=>audit.counts[l.name]=(audit.counts[l.name]||0)+1)}
      audit.scene.onBeforeRenderTargetsRenderObservable.add(()=>{if(audit.forceRedraw)audit.map.resetRefreshCounter()});
      audit.frame=()=>{audit.engine.beginFrame();audit.loop();audit.engine.endFrame()};
      audit.ready=true;
    })().catch(e=>{audit.error=String(e)});
  });
  console.log(await page.evaluate(()=>({started:!!audit.loading,error:audit.error})));
}
