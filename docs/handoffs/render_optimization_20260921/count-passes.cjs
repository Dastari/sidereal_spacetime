async (page) => {
 await page.evaluate(()=>{
  audit.map.renderList.find(m=>m.getClassName()==='InstancedMesh').position.x-=.25;
  audit.frame();
  const sample=(force)=>{audit.forceRedraw=force;audit.counts={};const draws=[];for(let i=0;i<6;i++){audit.engine._drawCalls.fetchNewFrame();audit.frame();draws.push(audit.engine._drawCalls.current)}return {frames:6,maps:{...audit.counts},draws}};
  audit.finalCounts={renderer:audit.engine.getGlInfo(),width:audit.engine.getRenderWidth(),height:audit.engine.getRenderHeight(),cached:sample(false),forced:sample(true)};
  audit.forceRedraw=false;
 });
}
