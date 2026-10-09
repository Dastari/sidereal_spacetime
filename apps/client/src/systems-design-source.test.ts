import { expect, test } from "vitest";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import { systemsDesignSource } from "./systems-design-source";
test("accepts the current admitted prefab envelope without changing it", () => {
  const json = JSON.stringify({
    prefab: { catalog: "ship-components-v1@4", document: HULL_ACCESS_SOURCE },
  });
  const parsed = systemsDesignSource(json);
  expect(parsed?.doc).toEqual(HULL_ACCESS_SOURCE);
  expect(parsed?.catalogRevision).toBe("ship-components-v1@4");
  expect(json).toBe(
    JSON.stringify({
      prefab: { catalog: "ship-components-v1@4", document: HULL_ACCESS_SOURCE },
    }),
  );
});
test.each([
  undefined,
  "not json",
  "{}",
  JSON.stringify({
    prefab: { catalog: "unknown", document: HULL_ACCESS_SOURCE },
  }),
  JSON.stringify({
    prefab: { catalog: "ship-components-v1@4", document: { id: "unknown" } },
  }),
])("unavailable sources cannot open an invented installation: %s", (input) =>
  expect(systemsDesignSource(input)).toBeUndefined(),
);
