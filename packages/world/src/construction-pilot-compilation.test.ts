import { expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ dirty: true, compiles: 0 }));
vi.mock("spacetimedb/server", () => ({
  t: {
    row: () => ({}),
    string: () => ({ primaryKey: () => ({}) }),
    u64: () => ({}),
  },
}));
vi.mock("./auth", () => ({ requireGame: () => {} }));
vi.mock("./input-control", () => ({ consumeInputControl: () => true }));
vi.mock("./combat", () => ({ clearAim: () => {} }));
vi.mock("./construction-doors", () => ({ constructionCollision: () => ({}) }));
vi.mock("./construction-standing-support", () => ({
  createConstructionStandingSupport: () => () => 0,
}));
vi.mock("./construction-flight-dirty", () => ({
  commitFlightCharacter: () => {},
}));
vi.mock("./construction-flight-input", () => ({
  readConstructionFlightInput: () => ({}),
}));
vi.mock("./construction-flight-compilation", () => ({
  compileShipFlight: () => {
    state.compiles++;
    state.dirty = false;
  },
}));
vi.mock("./construction-flight-resolver", () => ({
  resolveShipFlightDefinition: () => ({
    status: state.dirty ? "rejected" : "ready",
    kind: "construction",
    computer: { installed: true, powered: true },
  }),
}));
import { Identity } from "spacetimedb";
import { constructionPilotRepository } from "./construction-pilot-authority";
test("explicit entry resolves pending walking mass; consumption readers never expand the scheduled compilation budget", () => {
  state.dirty = true;
  state.compiles = 0;
  const owner = Identity.fromString("1".repeat(64));
  const ctx: any = {
    sender: owner,
    databaseIdentity: Identity.fromString("2".repeat(64)),
    db: {
      character: { id: { find: () => ({ owner }) } },
      constructionFlightDirty: {
        shipId: { find: () => (state.dirty ? { shipId: "ship" } : undefined) },
      },
    },
  };
  expect(
    constructionPilotRepository(ctx, "actor").hasOperationalFlight("ship"),
  ).toBe(false);
  expect(state.compiles).toBe(0);
  expect(
    constructionPilotRepository(ctx, "actor", true).hasOperationalFlight(
      "ship",
    ),
  ).toBe(true);
  expect(state.compiles).toBe(1);
  expect(
    constructionPilotRepository(ctx, "actor", true).hasOperationalFlight(
      "ship",
    ),
  ).toBe(true);
  expect(state.compiles).toBe(1);
});
