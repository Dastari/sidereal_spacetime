import { table, t } from "spacetimedb/server";
export const spaceBody = table(
  {
    name: "space_body",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    key: t.string(),
    kind: t.string(),
    appearance: t.string(),
    x: t.f64(),
    y: t.f64(),
    vx: t.f64(),
    vy: t.f64(),
    heading: t.f64(),
    omega: t.f64(),
    height: t.f64(),
    radius: t.f64(),
    massKg: t.f64(),
    seed: t.u32(),
    tick: t.u64(),
  },
);

// Owner-private lab observable output only: no input/grant/resource internals.
export const actuatorOutput = table(
  {
    name: "actuator_output",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    actuatorId: t.string(),
    throttle: t.f64(),
    tick: t.u64(),
  },
);
