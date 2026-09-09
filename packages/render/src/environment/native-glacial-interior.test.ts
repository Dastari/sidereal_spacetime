import {describe,it,expect} from "vitest";
import {composeNativePlanet,type NativePlanetKit} from "./native-planet-composition";
const form={positions:[-.5,-.5,-.4,.5,-.5,-.4,.5,.5,.4,-.5,.5,.4],indices:[0,1,2,0,2,3],triangleMaterials:[0,0]};
const kit:NativePlanetKit={schema:"sidereal.native-planet-kit.v1",layout:"glacial-interior",materials:[{name:"snow",linearColor:[1,1,1],roughness:.8}],variants:["snow-cluster-a","snow-cluster-b","snow-cluster-c","ice-bluff-a","ice-bluff-b","ice-canyon","sealing-core"].map(name=>({...form,name}))};
describe("native branching glacial interior",()=>{
 it("repeats seeded native volume placement and distributes bounded hero regions",()=>{
  const a=composeNativePlanet(kit,131,.55),b=composeNativePlanet(kit,131,.55),c=composeNativePlanet(kit,9187,.55);
  expect(a).toEqual(b);expect(a.batches[0].positions).not.toEqual(c.batches[0].positions);
  expect(a.tiles).toHaveLength(1536);expect(a.triangles).toBeLessThan(150000);
  const fraction=a.tiles.filter(v=>v>=3).length/a.tiles.length;
  expect(fraction).toBeGreaterThan(.25);expect(fraction).toBeLessThan(.5);
  expect(a.batches[0].positions.every(Number.isFinite)).toBe(true);
 });
 it("coverage changes hero placement without replacing the closed snow-volume population",()=>{
  const quiet=composeNativePlanet(kit,131,0),active=composeNativePlanet(kit,131,1);
  expect(quiet.tiles.every(v=>v<3)).toBe(true);expect(active.tiles.some(v=>v>=3)).toBe(true);
  expect(active.tiles.length).toBe(quiet.tiles.length);
  expect(()=>composeNativePlanet({...kit,variants:kit.variants.slice(0,6)},131)).toThrow("glacial form kit");
 });
});
