import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ Range: class {} }));
import { commitFlightCharacter } from "./construction-flight-dirty";
test("physical character writes dirty both ships, preserving queue age; sprint and connection changes are quiet", () => {
  const dirty = new Map<string, any>();
  let actor = {
    id: "crew",
    shipId: "a",
    localX: 1,
    localY: 2,
    connected: true,
    sprinting: false,
  };
  const ctx: any = {
    timestamp: { microsSinceUnixEpoch: 10n },
    db: {
      character: { id: { find: () => actor } },
      constructionFlightBinding: {
        shipId: { find: (shipId: string) => ({ shipId }) },
      },
      constructionFlightDirty: {
        shipId: { find: (id: string) => dirty.get(id) },
        insert: (row: any) => dirty.set(row.shipId, row),
      },
    },
  };
  const write = (row: typeof actor) => {
    actor = row;
  };
  commitFlightCharacter(ctx, { ...actor, sprinting: true }, write);
  expect(dirty.size).toBe(0);
  commitFlightCharacter(ctx, { ...actor, shipId: "b", localX: 3 }, write);
  expect([...dirty.keys()]).toEqual(["a", "b"]);
  ctx.timestamp.microsSinceUnixEpoch = 20n;
  commitFlightCharacter(ctx, { ...actor, localY: 4 }, write);
  expect(dirty.get("b").revision).toBe(10n);
  expect(actor).toMatchObject({ shipId: "b", localX: 3, localY: 4 });
});
