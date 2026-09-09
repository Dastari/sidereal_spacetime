import {describe,it,expect} from "vitest";
import {createVolcanicField,nativeLavaRadiance,type VolcanicVector} from "./native-volcanic-field";
describe("native volcanic local illumination",()=>{
 it("shares deterministic curved channel geometry and finds nearby molten source",()=>{
  const a=createVolcanicField(89),b=createVolcanicField(89),c=createVolcanicField(90),n:VolcanicVector=[.1,.8,.5916079783];
  expect(a.distance(n)).toBe(b.distance(n));expect(a.distance(n)).not.toBe(c.distance(n));
  const source=a.source(n);expect(Math.hypot(...source)).toBeCloseTo(1);expect(a.distance(source)).toBeLessThan(a.distance(n));
 });
 it("lights source-facing adjacent faces, fades at range and does not emit with a zero recipe",()=>{
  const field=createVolcanicField(89),source=field.source([.1,.8,.5916079783]),p=source.map(v=>v*(field.moltenHeight(source)+.03)) as VolcanicVector,normal=source.map(v=>-v) as VolcanicVector;
  const near=nativeLavaRadiance(p,normal,field,2.4),away=nativeLavaRadiance(p,source,field,2.4),far=nativeLavaRadiance(source.map(v=>v*1.3) as VolcanicVector,normal,field,2.4);
  expect(near[0]).toBeGreaterThan(0);expect(near[0]).toBeLessThanOrEqual(1.5);expect(away).toEqual([0,0,0]);expect(far[0]).toBeLessThan(near[0]);expect(nativeLavaRadiance(p,normal,field,0)).toEqual([0,0,0]);
 });
 it("keeps the common molten surface beneath the authored vent basin floor",()=>{
  for(const seed of [0,89,9187,4294967295]){
   const field=createVolcanicField(seed),length=Math.hypot(...field.vent),direction=field.vent.map(v=>v/length) as VolcanicVector;
   expect(field.moltenHeight(direction)).toBeLessThan(.86);
   expect(length).toBeCloseTo(.960);
  }
 });
});
