import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import { ZoneBudgetError } from "@sidereal/sim/zones";
import { describe, expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import { joinSharedSystem, ensureCanonicalSystem } from "./shared-world";
import {
  stepSharedWorld as stepCompiledSharedWorld,
  type SharedPhysicsContext,
} from "./shared-world-physics";
import { fixture, other, owner } from "./shared-world-test-fixture";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import { LAB_FLIGHT_ACTUATORS, LAB_FLIGHT_COMPUTER, LAB_FLIGHT_MASS, LAB_FLIGHT_PROFILE, LAB_FLIGHT_SPEED } from "../../content/src/flight";
import { LAB_HULL } from "../../content/src/space";
import { deriveEnvelope } from "../../sim/src/ifcs";
// Explicit test-only hook preserves this adapter suite's independent baseline.
// Production must supply the authoritative compiled reader and dirty queue.
function stepSharedWorld(ctx: SharedPhysicsContext) {
  return stepCompiledSharedWorld(ctx, undefined, {
    compileDirty: () => {}, canPilot: () => true,
    definitionForShip: () => ({
      status: "ready", reason: "", kind: "construction", stationId: "", deckId: "",
      mass: LAB_FLIGHT_MASS, profile: LAB_FLIGHT_PROFILE, speed: LAB_FLIGHT_SPEED,
      hull: {...LAB_HULL, id:"test-hull",revision:1,lateralOffset:0,authoredMidpointX:0,authoredMidpointY:LAB_HULL.longitudinalOffset},
      computer: LAB_FLIGHT_COMPUTER,
      envelope: deriveEnvelope(LAB_FLIGHT_ACTUATORS, LAB_FLIGHT_MASS),
      actuators: LAB_FLIGHT_ACTUATORS.map(a=>({...a,sourceDeviceId:a.id,placedObjectId:a.id,definitionRevision:1,nozzleX:a.x,nozzleY:a.y,height:0,exhaustX:Math.sin(a.rotation),exhaustY:-Math.cos(a.rotation)})),
    }),
  });
}
function setup() {
  const f = fixture();
  joinSharedSystem(f.ctx(), f.args());
  joinSharedSystem(f.ctx(2, other), f.args(2));
  const physics = () =>
    ({
      ...f.ctx(),
      timestamp: { microsSinceUnixEpoch: 100000n },
    }) as unknown as SharedPhysicsContext;
  return { ...f, physics };
}
function rest(f: ReturnType<typeof setup>) {
  for (const row of f.db.shipWorldMotion.rows.values())
    f.db.shipWorldMotion.shipId.update({ ...row, vx: 0, vy: 0, omega: 0 });
}
function pilot(f: ReturnType<typeof setup>, n = 1) {
  const identity = n === 1 ? owner : other;
  f.db.station.insert({
    id: `seat${n}`,
    shipId: `ship${n}`,
    occupantId: `actor${n}`,
    operational: true,
  });
  f.db.inputControl.insert({
    characterId: `actor${n}`,
    owner: identity,
    connectionId: `c${n}`,
    sequence: 0n,
  });
  f.db.input.characterId.update({
    ...f.db.input.characterId.find(`actor${n}`),
    throttle: 1,
    updatedMicros: 100n,
  });
}
describe("authoritative once-per-system adapter", () => {
  it("two ships advance one shared rock exactly once and leave legacy rows untouched", () => {
    const f = setup(),
      id = SHARED_SYSTEM_SEED.bodies[0].id;
    const rock = f.db.bodyWorldMotion.bodyId.find(id);
    f.db.bodyWorldMotion.bodyId.update({ ...rock, vx: 10 });
    const old = f.db.spaceBody.writes,
      shipWrites = f.db.ship.writes;
    const result = stepSharedWorld(f.physics());
    expect(f.db.bodyWorldMotion.bodyId.find(id).x - rock.x).toBeCloseTo(
      0.5,
      10,
    );
    expect(f.db.bodyWorldMotion.bodyId.find(id).serverTick).toBe(2n);
    expect(result.changedMotions).toBe(3);
    expect(f.db.spaceBody.writes).toBe(old);
    expect(f.db.ship.writes).toBe(shipWrites);
  });
  it("initializes the complete engine telemetry once then keeps resting samples write-free", () => {
    const f = setup();
    rest(f);
    expect(stepSharedWorld(f.physics())).toMatchObject({
      changedMotions: 0,
      changedOutputs: 18,
    });
    expect(f.db.actuatorOutput.rows.size).toBe(18);
    expect(
      [...f.db.actuatorOutput.rows.values()].every(
        (row: any) => row.throttle === 0,
      ),
    ).toBe(true);
    const before = f.writes();
    for (let i = 1; i <= 100; i++) {
      expect(
        stepSharedWorld({
          ...f.physics(),
          timestamp: { microsSinceUnixEpoch: 100_000n + BigInt(i) * 50_000n },
        }),
      ).toMatchObject({
        status: "idle",
        changedMotions: 0,
        changedOutputs: 0,
      });
    }
    expect(f.writes()).toBe(before);
    expect(f.db.actuatorOutput.rows.size).toBe(18);
  });
  it("only the occupied operational station and current admitted input-holder connection supply thrust", () => {
    const f = setup();
    rest(f);
    pilot(f);
    const result = stepSharedWorld(f.physics());
    expect(result.changedMotions).toBe(1);
    expect(result.changedOutputs).toBeGreaterThan(0);
    expect(f.db.shipWorldMotion.shipId.find("ship1").vy).toBeGreaterThan(0);
    expect(f.db.shipWorldMotion.shipId.find("ship2").vy).toBe(0);
    f.db.authSession.connectionId.update({
      ...f.db.authSession.connectionId.find("c1"),
      expiresMicros: 99n,
    });
    const before = f.db.shipWorldMotion.shipId.find("ship1").vy;
    f.physics = () =>
      ({
        ...f.ctx(),
        timestamp: { microsSinceUnixEpoch: 150000n },
      }) as unknown as SharedPhysicsContext;
    stepSharedWorld(f.physics());
    expect(f.db.shipWorldMotion.shipId.find("ship1").vy).toBeCloseTo(
      before,
      12,
    );
    expect(f.db.inputControl.characterId.find("actor1")).toBeUndefined();
    expect(
      [...f.db.actuatorOutput.rows.values()].every(
        (o: any) => o.throttle === 0,
      ),
    ).toBe(true);
  });
  it("future/stale intent and operational or membership loss cannot actuate", () => {
    for (const reason of ["future", "stale", "station", "admission"] as const) {
      const f = setup();
      rest(f);
      pilot(f);
      if (reason === "future" || reason === "stale")
        f.db.input.characterId.update({
          ...f.db.input.characterId.find("actor1"),
          updatedMicros: reason === "future" ? 100001n : 0n,
        });
      if (reason === "stale")
        f.physics = () =>
          ({
            ...f.ctx(),
            timestamp: { microsSinceUnixEpoch: 400000n },
          }) as unknown as SharedPhysicsContext;
      if (reason === "station")
        f.db.station.shipId.update({
          ...f.db.station.shipId.find("ship1"),
          operational: false,
        });
      if (reason === "admission")
        f.db.worldAdmission.characterId.delete("actor1");
      expect(stepSharedWorld(f.physics()).changedMotions).toBe(0);
    }
  });
  it("updates negative cell keys only when motion crosses their floor boundary", () => {
    const f = setup();
    rest(f);
    const ship = f.db.shipWorldMotion.shipId.find("ship1");
    f.db.shipWorldMotion.shipId.update({
      ...ship,
      x: -399.9,
      y: -200,
      vx: -10,
      cellX: -1n,
      cellY: -1n,
    });
    stepSharedWorld(f.physics());
    expect(f.db.shipWorldMotion.shipId.find("ship1")).toMatchObject({
      cellX: -2n,
      cellY: -1n,
      serverTick: 2n,
    });
  });
  it("halts the whole island on capacity overflow instead of stepping a subset", () => {
    const f = setup();
    rest(f);
    const model = f.db.shipWorldMotion.shipId.find("ship1");
    for (let i = 0; i < 59; i++)
      f.db.shipWorldMotion.insert({
        ...model,
        shipId: `crowd${i}`,
        x: 1000 + i * 50,
      });
    const before = f.db.shipWorldMotion.writes;
    expect(stepSharedWorld(f.physics())).toMatchObject({
      status: "exhausted",
      reason: "island-admission-budget",
    });
    expect(f.db.shipWorldMotion.writes).toBe(before);
  });
  it("uses one active-system clock write and skips repeated samples without confusing a new admission stamp", () => {
    const f = setup();
    const ship = f.db.shipWorldMotion.shipId.find("ship1");
    f.db.shipWorldMotion.shipId.update({ ...ship, serverTick: 2n });
    const clockBefore = f.db.worldSystem.writes;
    expect(stepSharedWorld(f.physics()).changedMotions).toBeGreaterThan(0);
    expect(f.db.worldSystem.writes - clockBefore).toBe(1);
    ensureCanonicalSystem(f.db);
    expect(f.db.worldSystem.writes - clockBefore).toBe(1);
    const after = f.writes();
    expect(stepSharedWorld(f.physics())).toMatchObject({
      status: "idle",
      reason: "sample-already-applied",
    });
    expect(f.writes()).toBe(after);
    expect(
      stepSharedWorld({
        ...f.physics(),
        timestamp: { microsSinceUnixEpoch: 50000n },
      }),
    ).toMatchObject({ status: "exhausted", reason: "sample-regressed" });
  });
});

it("real stock flight brakes to exact rest and then emits no motion, actuator or clock writes", () => {
  const f = setup();
  rest(f);
  pilot(f);
  f.db.authSession.connectionId.update({
    ...f.db.authSession.connectionId.find("c1"),
    expiresMicros: 1_000_000_000_000n,
  });
  let now = 100_000n;
  const step = (throttle: number, turn: number) => {
    now += 50_000n;
    f.db.input.characterId.update({
      ...f.db.input.characterId.find("actor1"),
      throttle,
      turn,
      updatedMicros: now,
    });
    return stepSharedWorld({
      ...f.physics(),
      timestamp: { microsSinceUnixEpoch: now },
    });
  };
  for (let i = 0; i < 15; i++) step(1, 0.3);
  expect(
    Math.hypot(
      f.db.shipWorldMotion.shipId.find("ship1").vx,
      f.db.shipWorldMotion.shipId.find("ship1").vy,
    ),
  ).toBeGreaterThan(0.1);
  for (let i = 0; i < 500; i++) step(0, 0);
  expect(f.db.shipWorldMotion.shipId.find("ship1")).toMatchObject({
    vx: 0,
    vy: 0,
    omega: 0,
  });
  expect(
    [...f.db.actuatorOutput.rows.values()].every(
      (row: any) => row.throttle === 0,
    ),
  ).toBe(true);
  const writes = () =>
    f.db.shipWorldMotion.writes +
    f.db.bodyWorldMotion.writes +
    f.db.actuatorOutput.writes +
    f.db.worldSystem.writes;
  const before = writes(),
    motion = f.db.shipWorldMotion.shipId.find("ship1");
  for (let i = 0; i < 100; i++)
    expect(step(0, 0)).toMatchObject({
      status: "idle",
      changedMotions: 0,
      changedOutputs: 0,
    });
  expect(writes()).toBe(before);
  expect(f.db.shipWorldMotion.shipId.find("ship1")).toEqual(motion);
  expect(step(1, 0).changedMotions).toBeGreaterThan(0);
});

import { compileFlightDefinition } from "../../sim/src/flight-definition";
import { toCenterOfMassMotion } from "../../sim/src/flight-frame";
import { WAYFARER_FLIGHT_PROFILE, WAYFARER_FLIGHT_SPEED } from "../../content/src/physical-definitions";
function asymmetricDefinition(cargoX: number) {
  const compiled=compileFlightDefinition({
    catalog:{id:"adapter-test-physical",revision:1,definitions:[{id:"hull",revision:1,kind:"hull",massKg:1000,centroid:[0,0],inertiaKgM2:2000}]},
    parts:[{id:"installed-hull",definitionId:"hull",revision:1,position:[0,0,0],rotation:0,flipped:false}],
    fittings:[],cargo:[{containerId:"cargo",massKg:200,position:[cargoX,2]}],crew:[{characterId:"walking-passenger",massKg:80,position:[-1,1]}],
    hull:{id:"authored-hull",revision:1,radius:1,halfLength:2,center:[0,0]},
  });
  if(compiled.status!=="ready")throw Error(compiled.reason);
  return {status:"ready" as const,kind:"construction" as const,reason:"",stationId:"",deckId:"",mass:compiled.mass,hull:compiled.hull,actuators:[],envelope:compiled.envelope,computer:{id:"absent",definitionId:"absent",installed:false,powered:false},profile:WAYFARER_FLIGHT_PROFILE,speed:WAYFARER_FLIGHT_SPEED};
}
it("compiled asymmetric engine-less ships coast about COM and persist the authored origin",()=>{
  const f=setup();rest(f);pilot(f);
  const definition=asymmetricDefinition(3),row=f.db.shipWorldMotion.shipId.find("ship1");
  f.db.shipWorldMotion.shipId.update({...row,vx:3,vy:-2,omega:0.2,heading:0.3});
  const before=f.db.shipWorldMotion.shipId.find("ship1"),com=toCenterOfMassMotion(before,definition.mass);
  const result=stepCompiledSharedWorld(f.physics(),undefined,{compileDirty:()=>{},canPilot:()=>true,definitionForShip:()=>definition});
  expect(result.reason).toBeUndefined();
  const after=f.db.shipWorldMotion.shipId.find("ship1"),nextCom=toCenterOfMassMotion(after,definition.mass);
  expect(nextCom.x).toBeCloseTo(com.x+com.vx*0.05,10);
  expect(nextCom.y).toBeCloseTo(com.y+com.vy*0.05,10);
  expect(nextCom.vx).toBeCloseTo(com.vx,12);expect(nextCom.vy).toBeCloseTo(com.vy,12);
  expect(after.omega).toBeCloseTo(0.2,12);
  expect(f.db.actuatorOutput.rows.size).toBe(0);
});
it("cargo recompilation does not translate resting ship or passenger authored coordinates",()=>{
  const f=setup();rest(f);
  const before={...f.db.shipWorldMotion.shipId.find("ship1")},actor={...f.db.character.id.find("actor1")};
  let definition=asymmetricDefinition(-3),compiled=false;
  const oldCenter=definition.mass.centerX;
  stepCompiledSharedWorld(f.physics(),undefined,{compileDirty:()=>{definition=asymmetricDefinition(3);compiled=true;},canPilot:()=>false,definitionForShip:()=>definition});
  expect(compiled).toBe(true);expect(definition.mass.centerX).not.toBe(oldCenter);
  expect(f.db.shipWorldMotion.shipId.find("ship1")).toEqual(before);
  expect(f.db.character.id.find("actor1")).toEqual(actor);
});
it("initial invalid definitions reject the island and erase stale burn telemetry",()=>{
  const f=setup();rest(f);
  f.db.actuatorOutput.insert({id:"old-output",shipId:"ship2",actuatorId:"removed",throttle:1,tick:1n});
  const before={...f.db.shipWorldMotion.shipId.find("ship1")};
  const result=stepCompiledSharedWorld(f.physics(),undefined,{compileDirty:()=>{},canPilot:()=>true,definitionForShip:()=>({status:"invalid",reason:"missing-physical-definition"})});
  expect(result).toMatchObject({status:"exhausted",reason:"missing-physical-definition",changedOutputs:1,changedMotions:0});
  expect(f.db.actuatorOutput.rows.size).toBe(0);
  expect(f.db.shipWorldMotion.shipId.find("ship1")).toEqual(before);
});

it("zone-only commits stamp the sample and cannot replay at the same tick", () => {
  const f = setup();
  rest(f);
  stepSharedWorld(f.physics());
  const zones = vi.fn(() => true),
    ctx = { ...f.physics(), timestamp: { microsSinceUnixEpoch: 150000n } },
    hooks = {
      definitionForShip: () => asymmetricDefinition(0),
      compileDirty: () => {},
      canPilot: () => false,
      zones,
    };
  expect(stepCompiledSharedWorld(ctx, undefined, hooks).changedMotions).toBe(0);
  expect(zones).toHaveBeenCalledOnce();
  expect(stepCompiledSharedWorld(ctx, undefined, hooks).reason).toBe(
    "sample-already-applied",
  );
  expect(zones).toHaveBeenCalledOnce();
});

it("zone work exhaustion preserves pre-step motions", () => {
  const f = setup(),
    before = [...f.db.shipWorldMotion.rows.values()].map((r) => ({ ...r })),
    report = stepCompiledSharedWorld(f.physics(), undefined, {
      definitionForShip: () => asymmetricDefinition(0),
      compileDirty: () => {},
      canPilot: () => false,
      zones: () => {
        throw new ZoneBudgetError();
      },
    });
  expect(report.reason).toBe("zone-work-budget");
  expect(report.status).toBe("exhausted");
  expect([...f.db.shipWorldMotion.rows.values()]).toEqual(before);
});

it("zone traces follow the authored ship origin through asymmetric COM motion", () => {
  const f = setup(); rest(f);
  const definition = asymmetricDefinition(3);
  const row = f.db.shipWorldMotion.shipId.find("ship1");
  f.db.shipWorldMotion.shipId.update({...row, vx: 3, vy: -2, omega: 0.2, heading: 0.3});
  const before = {...f.db.shipWorldMotion.shipId.find("ship1")};
  const zones = vi.fn(() => false);
  const result = stepCompiledSharedWorld(f.physics(), undefined, {
    compileDirty: () => {}, canPilot: () => false, definitionForShip: () => definition, zones,
  });
  expect(result.reason).toBeUndefined();
  const trace = (zones.mock.calls[0] as unknown as [string, unknown[], {bodyId:string;from:{x:number;y:number};to:{x:number;y:number}}[]])[2].filter(s => s.bodyId === "ship1");
  expect(trace.length).toBeGreaterThan(0);
  expect(trace[0].from.x).toBeCloseTo(before.x, 10);
  expect(trace[0].from.y).toBeCloseTo(before.y, 10);
  const after = f.db.shipWorldMotion.shipId.find("ship1");
  expect(trace.at(-1)!.to.x).toBeCloseTo(after.x, 10);
  expect(trace.at(-1)!.to.y).toBeCloseTo(after.y, 10);
});
