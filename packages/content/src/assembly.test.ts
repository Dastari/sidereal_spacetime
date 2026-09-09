import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { validateAssembly, fittingPlacement, type PartCatalog, type PartPlacement } from "./assembly";
const catalog: PartCatalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
);
const document = () =>
  JSON.parse(readFileSync("assets/runtime/assembly/wayfarer.json", "utf8"));
test('native floor visual origin preserves its separate fitting frame through rotation and mirror',()=>{
 const visual:PartPlacement={id:'floor',assetId:'native',position:[10,20,0],rotation:Math.PI/2,flipped:false,removedCells:[],fittingProxy:{assetId:'legacy',offset:[1,1,-.375]}};
 const fitting=fittingPlacement(visual);
 expect(fitting.assetId).toBe('legacy');expect(fitting.position).toEqual([9,21,-.375]);
 expect(fittingPlacement({...visual,flipped:true}).position).toEqual([9,19,-.375]);
 expect(visual.position).toEqual([10,20,0]);expect(visual.assetId).toBe('native');
});
test("compiled assembly preserves independent prop identities while sharing immutable assets", () => {
  const d = validateAssembly(document(), catalog);
  expect(new Set(d.parts.map((p) => p.id)).size).toBe(d.parts.length);
  const cargo = d.parts.filter(
    (p) => catalog.assets.find((a) => a.id === p.assetId)?.category === "cargo",
  );
  expect(cargo.length).toBe(4);
  expect(new Set(cargo.map((p) => p.assetId)).size).toBeLessThan(cargo.length);
  expect(cargo.every((p) => p.removedCells.length === 0)).toBe(true);
});
test("draft rejects ambiguous identity, unavailable assets, nonfinite transforms and oversized damage", () => {
  for (const mutate of [
    (d: ReturnType<typeof document>) => d.parts.push({ ...d.parts[0] }),
    (d: ReturnType<typeof document>) => (d.parts[0].assetId = "missing"),
    (d: ReturnType<typeof document>) => (d.parts[0].position[0] = Infinity),
    (d: ReturnType<typeof document>) =>
      (d.parts[0].removedCells = [[0, 0.5, 0]]),
    (d: ReturnType<typeof document>) =>
      (d.parts[0].removedCells = Array(16385).fill([0, 0, 0])),
  ]) {
    const d = document();
    mutate(d);
    expect(() => validateAssembly(d, catalog)).toThrow();
  }
});

test("placement permits touching and hollow interlocks, rejects solid overlap after rotation and flip", async () => {
  const { placementError, snapPlacement } = await import("./assembly");
  const { encodeVoxels } = await import("../../sim/src/voxels");
  const cells = new Uint8Array(32768); cells[0] = 1; cells[2] = 1;
  const library = { volumes: { test: { cellMeters: 1, layers: [{chunks: [{origin: [0,0,0], runs: encodeVoxels(cells)}]}] } } };
  const c: PartCatalog = { schema: "sidereal.part-catalog.v1", assets: [{id:"test", label:"frame", category:"cargo", nodes:[], bounds:{min:[0,0,0],max:[3,1,1]}}] };
  const first = { id:"first", assetId:"test", position:[0,0,0] as [number,number,number], rotation:0, flipped:false, removedCells:[] };
  const d = {schema:"sidereal.assembly-draft.v1" as const,id:"d",name:"d",parts:[first]};
  const placed = {...first,id:"second",position:[1,0,0] as [number,number,number]};
  expect(placementError(placed,d,c,library)).toBeUndefined();
  expect(placementError({...placed,position:[0,0,0]},d,c,library)).toContain("overlaps");
  expect(placementError({...placed,position:[1,0,0],flipped:true},d,c,library)).toContain("overlaps");
  expect(placementError({...placed,position:[1,0,0],rotation:Math.PI/2},d,c,library)).toContain("overlaps");
  expect(placementError({...placed,position:[0,0,1]},d,c,library)).toBeUndefined();
  expect(snapPlacement({...placed,position:[.034,.999,1.03]}).position).toEqual([.03125,1,1.03125]);
});

test("compiled default assembly has no occupied overlap despite intersecting part bounds", async () => {
  const { placementError } = await import("./assembly");
  const library = JSON.parse(readFileSync("assets/runtime/assembly/catalog.voxels.json","utf8"));
  const d = document();
  for (const part of d.parts) expect(placementError(part,d,catalog,library),part.id).toBeUndefined();
},30000);

test("palette cargo snaps onto deck support, preserving touching without overlap", async () => {
  const { placementError, snapPlacementToSupport } = await import("./assembly");
  const library = JSON.parse(readFileSync("assets/runtime/assembly/catalog.voxels.json","utf8"));
  const d = document();
  const cargo = d.parts.find((p: {assetId:string}) => catalog.assets.find(a => a.id===p.assetId)?.category==='cargo');
  const candidate = snapPlacementToSupport({...cargo,id:"new-cargo",position:[0,0,0]},d,catalog,library);
  expect(candidate.position[2]).toBeGreaterThan(0);
  expect(candidate.position[2]).toBeLessThanOrEqual(.5);
  expect(placementError(candidate,d,catalog,library)).toBeUndefined();
});

test("replacement deck fitting clips the old top without mutating its occupancy",async()=>{
  const {placementError,snapPlacementToSupport}=await import('./assembly');
  const {encodeVoxels}=await import('../../sim/src/voxels');
  const cells=new Uint8Array(32768);cells[0]=1;cells[1024]=1;
  const source={cellMeters:1,layers:[{chunks:[{origin:[0,0,0],runs:encodeVoxels(cells)}]}]};
  const library={volumes:{old:source}};
  const c:PartCatalog={schema:'sidereal.part-catalog.v1',assets:[{id:'old',label:'deck',category:'floor',nodes:[],bounds:{min:[0,0,0],max:[1,1,2]}}]};
  const deck={id:'deck',assetId:'old',position:[0,0,0]as[number,number,number],rotation:0,flipped:false,removedCells:[],fittingProxy:{assetId:'old',offset:[0,0,0]as[number,number,number],maxZ:1.5}};
  const d={schema:'sidereal.assembly-draft.v1'as const,id:'d',name:'d',parts:[deck]};
  const cargo={...deck,id:'cargo',fittingProxy:undefined,position:[0,0,1.5]as[number,number,number]};
  const before=JSON.stringify(source);
  expect(placementError(cargo,d,c,library)).toBeUndefined();
  expect(placementError({...cargo,position:[0,0,1.49]},d,c,library)).toContain('overlaps');
  expect(snapPlacementToSupport({...cargo,position:[0,0,1.1]},d,c,library).position[2]).toBe(1.5);
  expect(JSON.stringify(source)).toBe(before);
});
