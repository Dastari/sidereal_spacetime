import { expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { emptyLayout, SHAPE_REVISION } from "../../content/src/ship-layout";
import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  type ConstructionDocument,
  type ConstructionGrant,
} from "../../content/src/construction";
import {
  compileConstruction,
  constructionHash,
  constructionOperation,
  requireConstructionGrant,
  PINNED_FLOOR_KIT,
  FLOOR_KIT_HASH,
} from "./construction-transactions";
import { CONSTRUCTION_ROOF_PIN } from "@sidereal/content/construction-roof";
function fixture(): ConstructionDocument {
  const layout = emptyLayout("test-ship", "lower");
  layout.decks.push({
    ...layout.decks[0],
    id: "upper",
    name: "Upper",
    order: 1,
    elevation: 128,
  });
  layout.tiles = layout.decks.map((d) => ({
    id: `floor-${d.id}`,
    deckId: d.id,
    shape: "rectangle",
    revision: SHAPE_REVISION,
    vertices: [
      [0, 0],
      [64, 0],
      [64, 64],
      [0, 64],
    ],
    material: "mapped-deck",
  }));
  return {
    schema: CONSTRUCTION_SCHEMA,
    compiler: CONSTRUCTION_COMPILER,
    layout,
    floorKit: {
      id: PINNED_FLOOR_KIT.id,
      revision: PINNED_FLOOR_KIT.revision,
      sha256: FLOOR_KIT_HASH,
    },
    floors: layout.decks.map((d) => ({
      id: `floor-${d.id}`,
      partId: "square-2m",
      deckId: d.id,
      origin: [0, 0, d.elevation],
      quarterTurns: 0,
      reflected: false,
    })),
  };
}
test("publishes deterministic multi-deck native/semantic snapshot with honest readiness", () => {
  const d = fixture(),
    a = compileConstruction(JSON.stringify(d));
  d.layout.decks.reverse();
  d.layout.tiles.reverse();
  d.floors.reverse();
  d.layout.tiles[0].vertices.reverse();
  const b = compileConstruction(JSON.stringify(d));
  expect(a).toEqual(b);
  expect(a.sha256).toBe(createHash("sha256").update(a.canonical).digest("hex"));
  expect(JSON.parse(a.canonical).layout.decks).toHaveLength(2);
  expect(a.readiness).toEqual({
    geometry: true,
    nativeFloors: true,
    pressure: false,
    services: false,
    nativeDamage: false,
    flight: false,
  });
});
test("SHA256 is a real digest, independent of compiler cache fingerprint", () => {
  for (const input of ["", "abc", "é艦船".repeat(10000)])
    expect(constructionHash(input)).toBe(
      createHash("sha256").update(input).digest("hex"),
    );
});
test("native and semantic floors cannot diverge or use another revision", () => {
  let d = fixture();
  d.layout.tiles[0].vertices[1][0] = 63;
  expect(() => compileConstruction(JSON.stringify(d))).toThrow("differs");
  d = fixture();
  d.floorKit.sha256 = "a".repeat(64);
  expect(() => compileConstruction(JSON.stringify(d))).toThrow(
    "revision mismatch",
  );
  d = fixture();
  d.floors[0].origin[2] = 6;
  expect(() => compileConstruction(JSON.stringify(d))).toThrow("datum");
  d = fixture();
  d.floors[0].partId = "missing";
  expect(() => compileConstruction(JSON.stringify(d))).toThrow("part-missing");
});
test("rejects malformed, excessive and legacy proposals before publication", () => {
  expect(() => compileConstruction(" ".repeat(262145))).toThrow("budget");
  const d = fixture();
  expect(() =>
    compileConstruction(JSON.stringify({ ...d, trustClientCompilation: true })),
  ).toThrow("contract");
  d.layout.legacy = { sourceRaw: "old", placements: [], unresolved: [] };
  expect(() => compileConstruction(JSON.stringify(d))).toThrow("legacy");
  d.layout.legacy = null;
  d.floors[0].reflected = true;
  expect(() => compileConstruction(JSON.stringify(d))).toThrow(
    "placement-transform",
  );
});
test("scoped expiring grants are required independently of ship ownership or other capabilities", () => {
  const g: ConstructionGrant = {
    id: "g",
    principal: "alice",
    workspaceId: "workspace",
    capability: "blueprint.publish",
    expiresMicros: 100n,
    revoked: false,
  };
  expect(() =>
    requireConstructionGrant(
      [g],
      "alice",
      "workspace",
      "blueprint.publish",
      99n,
    ),
  ).not.toThrow();
  for (const grants of [
    [],
    [{ ...g, revoked: true }],
    [{ ...g, principal: "bob" }],
    [{ ...g, workspaceId: "other" }],
    [{ ...g, capability: "draft.write" as const }],
  ])
    expect(() =>
      requireConstructionGrant(
        grants,
        "alice",
        "workspace",
        "blueprint.publish",
        99n,
      ),
    ).toThrow("grant");
  expect(() =>
    requireConstructionGrant(
      [g],
      "alice",
      "workspace",
      "blueprint.publish",
      100n,
    ),
  ).toThrow("grant");
});
test("CAS and exact-content receipt replay do not silently collide or duplicate edits", () => {
  const a = constructionOperation(
      "op",
      { kind: "save", expected: "4", document: "exact" },
      undefined,
      4n,
      4n,
    ),
    receipt = {
      request: a.request,
      resultId: "immutable-result",
      revision: 5n,
    };
  expect(
    constructionOperation(
      "op",
      { document: "exact", expected: "4", kind: "save" },
      receipt,
      4n,
      9n,
    ).replay,
  ).toEqual(receipt);
  expect(() =>
    constructionOperation(
      "op",
      { kind: "save", expected: "4", document: "changed" },
      receipt,
      4n,
      9n,
    ),
  ).toThrow("different request");
  expect(() => constructionOperation("new", {}, undefined, 4n, 9n)).toThrow(
    "revision conflict",
  );
});

test("publication compiler works in the SpacetimeDB host without structuredClone", () => {
  vi.stubGlobal("structuredClone", undefined);
  try {
    expect(
      compileConstruction(JSON.stringify(fixture())).readiness.geometry,
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("optional roofs pin immutable material geometry without approving pressure or changing old documents", () => {
  const d = fixture(),
    historical = compileConstruction(JSON.stringify(d));
  d.roofKit = { ...CONSTRUCTION_ROOF_PIN };
  const roof = compileConstruction(JSON.stringify(d));
  expect(roof.sha256).not.toBe(historical.sha256);
  expect(roof.readiness.pressure).toBe(false);
  delete d.roofKit;
  expect(compileConstruction(JSON.stringify(d))).toEqual(historical);
  d.roofKit = { ...CONSTRUCTION_ROOF_PIN, sha256: "0".repeat(64) };
  expect(() => compileConstruction(JSON.stringify(d))).toThrow(
    "roof interface revision",
  );
  d.roofKit = { ...CONSTRUCTION_ROOF_PIN };
  d.layout.decks[1].elevation = 100;
  d.floors[1].origin[2] = 100;
  expect(() => compileConstruction(JSON.stringify(d))).toThrow("roof envelope");
});
