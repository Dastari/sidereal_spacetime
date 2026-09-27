"""No browser/GPU: execute the real capture gate against scheduled render frames."""
import json
import subprocess
import unittest
from capture_planet_reference_settle import SETTLE_VIEW_JS

class CaptureSettleTests(unittest.TestCase):
    def test_pending_stale_fixed_failure_and_stalled_frames(self):
        harness = r'''
const assert=require('node:assert/strict');
const settle=SETTLE;
async function scenario({fixed=false,error=false,stalled=false}={}){
 let frames=0,ticks=0,stopped=false;
 const c={active:0,requestedLOD:2,fixedDetail:fixed,pendingBuilds:1,workerPending:1,retained:[0]};
 const loop=()=>{};
 global.window={planetReview:{camera:{alpha:1,beta:2,radius:60},scene:{isReady:()=>ticks>=5},engine:{activeRenderLoops:[loop],runRenderLoop(fn){assert.equal(fn,loop);stopped=false;},stopRenderLoop(){stopped=true;}},stats:()=>({frames,candidate:{...c}})}};
 global.requestAnimationFrame=fn=>setImmediate(()=>{ticks++;if(!stalled)frames++;if(ticks===2){c.pendingBuilds=0;c.workerPending=0;}if(ticks===4){c.active=fixed?0:2;c.retained=[0,2];}if(error)c.error='worker rejected';fn();});
 global.cancelAnimationFrame=clearImmediate;
 if(error||stalled){await assert.rejects(settle({label:'test',timeoutMs:15}),error?/worker rejected/:/did not settle/);assert.ok(stopped);return;}
 const result=await settle({label:'test',timeoutMs:1000});
 assert.ok(result.endFrame>=7,'requires ready scene plus three advancing frames');assert.equal(result.candidate.active,fixed?0:2);assert.equal(result.stableFrames,3);assert.equal(result.candidate.pendingBuilds,0);assert.ok(stopped);assert.equal(window.__referenceCaptureSettlements.length,1);
 // Resume the preserved callback for a second view after freezing the first.
 window.planetReview.engine.activeRenderLoops=[];
 const next=await settle({label:'angle2',timeoutMs:1000});assert.ok(next.endFrame>=result.endFrame+3);assert.equal(window.__referenceCaptureSettlements.length,2);
}
(async()=>{await scenario();await scenario({fixed:true});await scenario({error:true});await scenario({stalled:true});console.log('four capture gate scenarios passed');})().catch(e=>{console.error(e);process.exit(1);});
'''.replace('SETTLE', SETTLE_VIEW_JS)
        result = subprocess.run(['node', '-e', harness], text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_every_screenshot_has_a_settle_gate(self):
        from pathlib import Path
        source = Path(__file__).with_name('capture_planet_reference.py').read_text()
        self.assertIn("await settleView('close');await page.screenshot", source)
        self.assertIn("await settleView('angle2');await page.screenshot", source)
        self.assertIn('await settleView("reference-scale");await page.screenshot', source)
        self.assertIn('viewSettlements:window.__referenceCaptureSettlements', source)

if __name__ == '__main__':
    unittest.main()
