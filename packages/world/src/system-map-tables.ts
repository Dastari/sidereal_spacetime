import { table, t } from "spacetimedb/server";
export const systemMapDefinition = table(
  { name: "system_map_definition" },
  { id: t.string().primaryKey(), revision: t.u64(), documentJson: t.string() },
);
export const fieldAsteroid = table(
  {
    name: "field_asteroid",
    indexes: [
      { accessor: "by_system", algorithm: "btree", columns: ["systemId"] },
      {
        accessor: "by_cell",
        algorithm: "btree",
        columns: ["systemId", "cellX", "cellY"],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    systemId: t.string(),
    fieldId: t.string(),
    x: t.f64(),
    y: t.f64(),
    height: t.f64(),
    radius: t.f64(),
    seed: t.u32(),
    resourcesJson: t.string(),
    cellX: t.i64(),
    cellY: t.i64(),
  },
);

export const systemMapEdit = table(
  {
    name: "system_map_edit",
    indexes: [
      { accessor: "by_system", algorithm: "btree", columns: ["systemId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    systemId: t.string(),
    principal: t.identity(),
    revision: t.u64(),
    beforeJson: t.string(),
    afterJson: t.string(),
    createdMicros: t.u64(),
  },
);
