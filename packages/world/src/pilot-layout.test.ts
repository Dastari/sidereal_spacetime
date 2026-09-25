import { describe, expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class SenderError extends Error {} }));
import { alignPilotLayout } from "./pilot-layout";
import { constrainLabDeck } from "../../content/src/pilot-layout";
import { walk } from "../../sim/src/index";
function fixture(occupied = true) {
  const owner = { isEqual: (other: unknown) => other === owner };
  let actor = { id: "crew", owner, shipId: "ship", localX: 0, localY: 6, sprinting: true };
  let station = { id: "helm", shipId: "ship", localX: 0, localY: 6, occupantId: occupied ? "crew" : undefined, operational: true };
  let input = { characterId: "crew", sequence: 25n, throttle: 1, turn: 1, dx: 1, dy: 1, sprint: true };
  let receipt: unknown;
  const ctx = { sender: owner, timestamp: { microsSinceUnixEpoch: 100n }, db: {
    ship: { id: { find: () => ({ id: "ship", owner }) } },
    station: { shipId: { find: () => station }, id: { update: (v: typeof station) => { station = v; } } },
    character: { by_owner: { filter: () => [actor] }, id: { find: () => actor, update: (v: typeof actor) => { actor = v; } } },
    input: { characterId: { find: () => input, update: (v: typeof input) => { input = v; } } },
    pilotLayoutReceipt: { shipId: { find: () => receipt, update: (v: unknown) => { receipt = v; } }, insert: (v: unknown) => { receipt = v; } },
  } };
  return { ctx: ctx as unknown as Parameters<typeof alignPilotLayout>[0], get: () => ({ actor, station, input, receipt }) };
}
describe("pilot fixture migration", () => {
  it("preserves identities, occupancy and operational state, clears commands, records once", () => {
    const f = fixture(); alignPilotLayout(f.ctx, "ship");
    const first = f.get();
    expect(first.actor).toMatchObject({ id: "crew", localY: 10.25, sprinting: false });
    expect(first.station).toMatchObject({ id: "helm", occupantId: "crew", operational: true, localY: 10.25 });
    expect(first.input).toMatchObject({ sequence: 25n, throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false });
    expect(first.receipt).toMatchObject({ shipId: "ship", revision: 3, previousY: 6 });
    alignPilotLayout(f.ctx, "ship"); expect(f.get()).toEqual(first);
  });
  it("upgrades the recorded revision-one seat without replacing its identity or grant", () => {
    const f = fixture();
    f.get().station.localY = 10;
    f.get().actor.localY = 10;
    f.ctx.db.pilotLayoutReceipt.insert({ shipId: "ship", revision: 1, stationId: "helm", previousX: 0, previousY: 6, appliedMicros: 1n });
    const insert = vi.spyOn(f.ctx.db.pilotLayoutReceipt, "insert");
    alignPilotLayout(f.ctx, "ship");
    expect(insert).not.toHaveBeenCalled();
    expect(f.get().station).toMatchObject({ id: "helm", occupantId: "crew", operational: true, localY: 10.25 });
    expect(f.get().actor.localY).toBe(10.25);
    expect(f.get().receipt).toMatchObject({ revision: 3, stationId: "helm", previousY: 10 });
    const after = f.get(); alignPilotLayout(f.ctx, "ship"); expect(f.get()).toEqual(after);
  });
  it("repairs revision-two crew outside the new canopy and retains the station UUID", () => {
    const f = fixture(false); f.get().station.localY = 10.25;
    f.get().actor.localX = 4; f.get().actor.localY = 10;
    f.ctx.db.pilotLayoutReceipt.insert({ shipId: "ship", revision: 2, stationId: "helm", previousX: 0, previousY: 10, appliedMicros: 1n });
    alignPilotLayout(f.ctx, "ship");
    expect(f.get().actor).toMatchObject({localX:1.968,localY:10});
    expect(f.get().station).toMatchObject({id:"helm",localY:10.25,occupantId:undefined});
    expect(f.get().receipt).toMatchObject({revision:3});
  });
  it("does not teleport unseated crew or grant occupancy", () => {
    const f = fixture(false); alignPilotLayout(f.ctx, "ship");
    expect(f.get().actor.localY).toBe(6); expect(f.get().station.occupantId).toBeUndefined();
  });
  it("rejects an unauthorized caller before mutation", () => {
    const f = fixture(); Object.assign(f.ctx, { sender: {} });
    expect(() => alignPilotLayout(f.ctx, "ship")).toThrow(); expect(f.get().station.localY).toBe(6);
  });
  it("rejects unrelated station edits and invalid occupancy without granting access", () => {
    const changed = fixture(); changed.get().station.localY = 7;
    expect(() => alignPilotLayout(changed.ctx, "ship")).toThrow("explicit migration review");
    expect(changed.get().receipt).toBeUndefined();
    const invalid = fixture(); invalid.get().actor.shipId = "other";
    expect(() => alignPilotLayout(invalid.ctx, "ship")).toThrow("Invalid station occupant");
    expect(invalid.get().station.localY).toBe(6);
  });
  it("only repairs an unseated actor position when outside the supported footprint", () => {
    const f = fixture(false); f.get().actor.localY = 50;
    alignPilotLayout(f.ctx, "ship");
    expect(f.get().actor.localY).toBe(11.968);
    expect(f.get().station.occupantId).toBeUndefined();
  });
  it("permits walking from the old deck to the relocated station and keeps crew inside diagonal walls", () => {
    let p = { x: 0, y: 6 };
    for (let i = 0; i < 100; i++) p = walk(p.x, p.y, 0, 1, [], false, constrainLabDeck);
    expect(p.y).toBeGreaterThan(10);
    for (let i = 0; i < 500; i++) p = walk(p.x, p.y, 1, 1, [], true, constrainLabDeck);
    expect(p.y).toBeLessThanOrEqual(11.968);
    expect(p.x + p.y).toBeLessThanOrEqual(14 - Math.SQRT2 * 1.032 + 1e-9);
  });
});
