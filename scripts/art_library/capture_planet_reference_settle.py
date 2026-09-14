"""Browser-side capture gate, kept importable for a tiny deterministic harness."""
SETTLE_VIEW_JS = r'''async ({label, timeoutMs=60000}) => {
 const r=window.planetReview;
 const loops=window.__referenceCaptureLoops??=r.engine.activeRenderLoops.slice();
 if(!loops.length)throw new Error('No reference render loop to advance '+label);
 const start=r.stats().frames;
 for(const loop of loops)r.engine.runRenderLoop(loop);
 return await new Promise((resolve,reject)=>{
  let previousFrame=start, stable=0, signature='', finished=false, frameHandle;
  const fail=error=>{if(finished)return;finished=true;clearTimeout(timer);cancelAnimationFrame(frameHandle);r.engine.stopRenderLoop();reject(error);};
  const timer=setTimeout(()=>fail(new Error('Capture view did not settle: '+label+' '+JSON.stringify(r.stats()))),timeoutMs);
  const poll=()=>{
   if(finished)return;
   const stats=r.stats(),c=stats.candidate;
   if(c?.error){fail(new Error('Capture candidate failed: '+c.error));return;}
   if(stats.frames>previousFrame){
    previousFrame=stats.frames;
    const expected=c?.fixedDetail?0:c?.requestedLOD;
    const ready=c&&[0,1,2].includes(expected)&&c.active===expected&&c.pendingBuilds===0&&c.workerPending===0&&r.scene.isReady();
    const next=JSON.stringify([c?.active,c?.requestedLOD,c?.fixedDetail,c?.retained]);
    stable=ready?(signature===next?stable+1:1):0;signature=next;
    if(stable>=3){
     finished=true;clearTimeout(timer);r.engine.stopRenderLoop();
     const result={label,startFrame:start,endFrame:stats.frames,stableFrames:stable,camera:{alpha:r.camera.alpha,beta:r.camera.beta,radius:r.camera.radius},candidate:c};
     (window.__referenceCaptureSettlements??=[]).push(result);resolve(result);return;
    }
   }
   frameHandle=requestAnimationFrame(poll);
  };
  frameHandle=requestAnimationFrame(poll);
 });
}'''
