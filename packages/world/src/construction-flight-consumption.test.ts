import { expect, test } from "vitest";
import { recordFlightConsumption } from "./construction-flight-consumption";

function fixture() {
  const rows = new Map<string, any>();
  let writes = 0;
  const ctx = {
    db: {
      constructionFlightCompiled: {
        shipId: {
          find: () => ({
            status: "ready",
            revision: 7n,
            inputHash: "physical-input",
          }),
        },
      },
      constructionFlightConsumption: {
        shipId: {
          find: (id: string) => rows.get(id),
          update: (r: any) => {
            rows.set(r.shipId, r);
            writes++;
          },
        },
        insert: (r: any) => {
          rows.set(r.shipId, r);
          writes++;
        },
      },
    },
  };
  const usage = [
    {
      bodyId: "ship",
      actuators: [
        { id: "port", newtonSeconds: 10 },
        { id: "starboard", newtonSeconds: 0 },
      ],
    },
  ];
  return { ctx: ctx as never, rows, usage, writes: () => writes };
}
test("latest accepted sample binds to compiled inputs, replays exactly and stays quiet when idle", () => {
  const f = fixture();
  recordFlightConsumption(f.ctx, 10n, f.usage);
  expect(f.rows.get("ship")).toEqual({
    shipId: "ship",
    sampleTick: 10n,
    compiledRevision: 7n,
    inputHash: "physical-input",
    actuatorsJson: JSON.stringify(f.usage[0].actuators),
  });
  recordFlightConsumption(f.ctx, 10n, f.usage);
  recordFlightConsumption(f.ctx, 11n, [
    { bodyId: "ship", actuators: [{ id: "port", newtonSeconds: 0 }] },
  ]);
  expect(f.writes()).toBe(1);
  expect(f.rows.get("ship").sampleTick).toBe(10n);
  expect(() => recordFlightConsumption(f.ctx, 9n, f.usage)).toThrow("conflict");
});
test("invalid later samples reject before any records are written", () => {
  const f = fixture();
  expect(() =>
    recordFlightConsumption(f.ctx, 1n, [
      ...f.usage,
      { bodyId: "other", actuators: [{ id: "bad", newtonSeconds: NaN }] },
    ]),
  ).toThrow("Invalid flight consumption");
  expect(f.writes()).toBe(0);
  expect(() =>
    recordFlightConsumption(f.ctx, 1n, [...f.usage, ...f.usage]),
  ).toThrow("Invalid flight consumption");
});
