import {expect,it,vi} from 'vitest';
import {createDiagnosticsUI} from './diagnostics';
import type {CanvasUI} from './toolkit';
import type {RenderDiagnostics} from '../../render/src/diagnostics';
it('shows worker build milliseconds and pending planet jobs without inventing a first sample',()=>{
 const text=vi.fn();
 const ui={width:900,height:900,ctx:new Proxy({},{get:()=>()=>{}}),text,invalidate:vi.fn(),windowFrame:vi.fn(),button:vi.fn()} as unknown as CanvasUI;
 const data={fps:60,frameMs:16,renderCpuMs:4,drawCalls:100,activeMeshes:10,totalMeshes:20,activeIndices:300,materials:5,textures:2,lights:1,shadowMaps:1,renderWidth:1574,renderHeight:907,hardwareScale:1,planetBuild:{pendingBuilds:2}} as RenderDiagnostics;
 const panel=createDiagnosticsUI(ui,()=>data);panel.toggle();panel.draw();
 expect(text.mock.calls.some(([v])=>v==='Last planet build')).toBe(true);expect(text.mock.calls.some(([v])=>v==='Pending planet builds')).toBe(true);
 data.planetBuild={lastBuildMs:127.234,pendingBuilds:0};text.mockClear();panel.draw();
 expect(text.mock.calls.some(([v])=>v==='127.23 ms')).toBe(true);panel.dispose();
});
