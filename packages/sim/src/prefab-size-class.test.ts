import { expect, test } from "vitest";
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import type { ConstructionDocument } from "@sidereal/content/construction";
import { assertPrefabSizeClass } from "./prefab-size-class";
const wrap = (doc: unknown) =>
  ({ prefab: { document: doc } }) as unknown as ConstructionDocument;

test("registered six fleet templates reject inflated classes even on first admission", () => {
  for (const doc of PREFAB_SHIPS.filter((d) => d.id.endsWith("-fleet"))) {
    expect(() => assertPrefabSizeClass(wrap(doc))).not.toThrow();
    const forged = { ...doc, sizeClass: doc.sizeClass === "S" ? "L" : "S" };
    expect(() => assertPrefabSizeClass(wrap(forged))).toThrow(/fixed/);
    expect(() =>
      assertPrefabSizeClass(
        wrap({ ...forged, id: "renamed" }),
        undefined,
        `prefab.${doc.id}`,
      ),
    ).toThrow(/fixed/);
  }
});
test("saved class survives metadata renames and cannot be discarded via non-prefab replacement", () => {
  const original = { ...prefabById("fed.s.wren-fleet")!, id: "custom" };
  expect(() =>
    assertPrefabSizeClass(wrap({ ...original, id: "renamed" }), wrap(original)),
  ).not.toThrow();
  expect(() =>
    assertPrefabSizeClass(
      wrap({ ...original, id: "renamed", sizeClass: "L" }),
      wrap(original),
    ),
  ).toThrow(/fixed/);
  expect(() =>
    assertPrefabSizeClass({} as ConstructionDocument, wrap(original)),
  ).toThrow(/fixed/);
  expect(() =>
    assertPrefabSizeClass(wrap({ ...original, sizeClass: "L" })),
  ).not.toThrow();
});
