import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { planNativeExternalAirlock, acceptNativeExternalAirlockInstallation, nativeExternalAirlockPressure } from "./construction-airlock-plan";
import { stepCompartmentGas } from "./construction-topology";
import type { NativeAirlockState } from "./construction-airlock-controller";
const audit=readFileSync('assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json');
const pins=JSON.parse(audit.toString()).sourcePins as Record<string,{path:string}>;
const sources=Object.fromEntries(Object.entries(pins).map(([key,pin])=>[key,readFileSync(pin.path)]));
const state=():NativeAirlockState=>({inner:{hingeFraction:0,sealRetraction:0,targetOpen:false,blocked:false},outer:{hingeFraction:0,sealRetraction:0,targetOpen:false,blocked:false},pumpTarget:null});
const policy={id:'explicit-test-gameplay-flow',openConductance:.002,unsealedConductance:.00001};
test('exact new native composite has70 independent placements and unroofed exterior excludes pressure volume',()=>{
 const a=planNativeExternalAirlock('one',audit,sources),b=planNativeExternalAirlock('two',audit,sources);
 expect(a.installation).toHaveLength(70);expect(a.sealedFloorCount).toBe(12);expect(a.exteriorFloorCount).toBe(4);
 expect(a.doors[1]).toMatchObject({originM:[6,2,0],quarterTurns:3});expect(a.cells.reduce((n,c)=>n+c.volumeM3,0)).toBeCloseTo(30.78371595325845,9);
 expect(new Set([...a.installation,...b.installation].map(p=>p.id)).size).toBe(140);
 expect(acceptNativeExternalAirlockInstallation(a,[...a.installation].reverse())).toBe(a.installationFingerprint);
 const bad=structuredClone(a.installation);bad[0].originM[0]+=.01;expect(()=>acceptNativeExternalAirlockInstallation(a,bad)).toThrow('transform');
 expect(()=>acceptNativeExternalAirlockInstallation(a,b.installation)).toThrow();
});
test('rejects old room audit, changed native GLB and missing geometry dependencies',()=>{
 expect(()=>planNativeExternalAirlock('one',new Uint8Array(),sources)).toThrow('exact composite');
 expect(()=>planNativeExternalAirlock('one',audit,{...sources,door:new Uint8Array()})).toThrow('native door');
 const {gasket,...missing}=sources;expect(()=>planNativeExternalAirlock('one',audit,missing)).toThrow('native gasket');
});
test('accepted deployed seals retain gas, retraction enables finite transfer and outer opening accounts vented gas',()=>{
 const p=planNativeExternalAirlock('gas',audit,sources),s=state();
 const closed=nativeExternalAirlockPressure(p,'deck',s,policy).topology;
 const gas=closed.compartments.map(c=>({compartmentId:c.id,moles:c.cellIds.includes(p.cells[0].id)?100:20}));
 expect(stepCompartmentGas(closed,gas,.25).gas).toEqual(gas);
 s.inner.sealRetraction=.5;const exchanging=nativeExternalAirlockPressure(p,'deck',s,policy).topology;
 const next=stepCompartmentGas(exchanging,gas,.25);expect(next.ventedMoles).toBe(0);expect(next.gas.reduce((n,g)=>n+g.moles,0)).toBeCloseTo(120,10);expect(next.gas).not.toEqual(gas);
 s.inner.sealRetraction=0;s.outer={hingeFraction:1,sealRetraction:1,targetOpen:true,blocked:false};
 const venting=nativeExternalAirlockPressure(p,'deck',s,policy).topology;
 const vent=stepCompartmentGas(venting,gas,.25);expect(vent.ventedMoles).toBeGreaterThan(0);expect(vent.gas.reduce((n,g)=>n+g.moles,0)+vent.ventedMoles).toBeCloseTo(120,10);
 const interiorId=closed.cellCompartment.get(p.cells[0].id);expect(vent.gas.find(g=>g.compartmentId===interiorId)?.moles).toBe(100);
});
test('pump target cannot invent an unaudited port or refill vacuum',()=>{
 const p=planNativeExternalAirlock('empty',audit,sources),s=state();s.pumpTarget='inner';
 const t=nativeExternalAirlockPressure(p,'deck',s,policy).topology;const gas=t.compartments.map(c=>({compartmentId:c.id,moles:0}));expect(t.flows).toHaveLength(0);expect(stepCompartmentGas(t,gas,.25).gas).toEqual(gas);
});
