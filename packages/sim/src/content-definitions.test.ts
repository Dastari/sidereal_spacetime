import { describe, expect, test } from "vitest";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import { INVENTORY_PHYSICAL_DEFINITIONS } from "../../content/src/inventory-physical-definitions";
import { LAB_WEAPONS } from "@sidereal/content/weapons";
import {
  CONTENT_DEFINITION_SEED,
  SEEDED_DEFINITION_KINDS,
} from "@sidereal/content/content-definition-seed";
import {
  DEFINITION_KINDS,
  DEFINITION_KIND_SPECS,
  currentRevisionOf,
  definitionOperation,
  definitionRef,
  definitionStatus,
  grantAllows,
  parseDefinitionRef,
  publishBlocker,
  revisionIssues,
  validGrantScope,
  validateDefinition,
} from "./content-definitions";

const pistol = () => ({ ...LAB_WEAPONS.pistol });
const issuesOf = (r: ReturnType<typeof validateDefinition>) =>
  r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);

describe("kind registry", () => {
  test("every roadmap kind has a validator and a template", () => {
    expect(DEFINITION_KINDS).toHaveLength(18);
    for (const kind of DEFINITION_KINDS) {
      const spec = DEFINITION_KIND_SPECS[kind];
      expect(spec.kind).toBe(kind);
      const template = spec.template("example");
      if (kind === "item") template.id = "example";
      expect(issuesOf(validateDefinition(kind, "example", template))).toEqual(
        [],
      );
    }
  });
  test("only seeded kinds publish; planned kinds say when they land", () => {
    expect(publishBlocker("item")).toBeNull();
    expect(publishBlocker("weapon")).toBeNull();
    expect(publishBlocker("market")).toMatch(/S9-2/);
    expect(
      DEFINITION_KINDS.filter(
        (k) => DEFINITION_KIND_SPECS[k].stage === "seeded",
      ),
    ).toEqual([...SEEDED_DEFINITION_KINDS]);
  });
  test("grant scope keeps definition and construction capabilities apart", () => {
    expect(validGrantScope("definitions:item", "definition.publish")).toBe(
      true,
    );
    expect(validGrantScope("definitions:unknown", "definition.publish")).toBe(
      false,
    );
    expect(validGrantScope("shipyard", "definition.write")).toBe(false);
    expect(validGrantScope("definitions:item", "draft.write")).toBe(false);
    expect(validGrantScope("definitions:item", "grant.manage")).toBe(true);
    expect(validGrantScope("shipyard", "draft.write")).toBe(true);
    expect(grantAllows("definition.write", "definition.read")).toBe(true);
    expect(grantAllows("definition.write", "definition.publish")).toBe(false);
    expect(grantAllows("definition.publish", "definition.write")).toBe(false);
  });
  test("references pin id@revision", () => {
    expect(definitionRef("item", "pistol", 3n)).toBe("item:pistol@3");
    expect(parseDefinitionRef("weapon:rail-rifle@12")).toEqual({
      kind: "weapon",
      definitionId: "rail-rifle",
      revision: 12n,
    });
    for (const bad of [
      "item:pistol",
      "item:pistol@0",
      "gizmo:x@1",
      "item:Pistol@1",
    ])
      expect(() => parseDefinitionRef(bad)).toThrow();
  });
});

describe("seed reproduces the code catalogues", () => {
  test("every seeded entry validates and round-trips exactly", () => {
    for (const entry of CONTENT_DEFINITION_SEED) {
      const result = validateDefinition(
        entry.kind,
        entry.definitionId,
        JSON.stringify(entry.payload),
      );
      expect(issuesOf(result), entry.kind + ":" + entry.definitionId).toEqual(
        [],
      );
      if (!result.ok) continue;
      const source =
        entry.kind === "item"
          ? INVENTORY_DEFINITIONS.find((d) => d.id === entry.definitionId)
          : LAB_WEAPONS[entry.definitionId];
      expect(JSON.parse(result.canonical)).toEqual(source);
    }
  });
  test("covers every item and weapon once, with unique keys", () => {
    const items = CONTENT_DEFINITION_SEED.filter((e) => e.kind === "item");
    const weapons = CONTENT_DEFINITION_SEED.filter((e) => e.kind === "weapon");
    expect(items).toHaveLength(INVENTORY_DEFINITIONS.length);
    expect(weapons).toHaveLength(Object.keys(LAB_WEAPONS).length);
    const keys = CONTENT_DEFINITION_SEED.map(
      (e) => e.kind + ":" + e.definitionId,
    );
    expect(new Set(keys).size).toBe(keys.length);
    // Weapons bind to the item with the same ID.
    for (const w of weapons)
      expect(items.some((i) => i.definitionId === w.definitionId)).toBe(true);
  });
  test("item mass agrees with the flight mass snapshot (one physical truth)", () => {
    for (const d of INVENTORY_DEFINITIONS)
      expect(
        INVENTORY_PHYSICAL_DEFINITIONS.find((p) => p.id === "inventory:" + d.id)
          ?.massKg,
      ).toBe(d.massKg);
  });
  test("canonical form and hash are stable regardless of key order", () => {
    const a = validateDefinition("weapon", "pistol", pistol());
    const reversed = Object.fromEntries(Object.entries(pistol()).reverse());
    const b = validateDefinition("weapon", "pistol", JSON.stringify(reversed));
    expect(
      a.ok && b.ok && a.sha256 === b.sha256 && a.canonical === b.canonical,
    ).toBe(true);
  });
});

describe("validators reject with reasons", () => {
  test("weapon rules", () => {
    expect(
      issuesOf(
        validateDefinition("weapon", "pistol", { ...pistol(), damage: -1 }),
      ),
    ).toEqual(["damage: Must be at least 0 and at most 10000"]);
    expect(
      issuesOf(
        validateDefinition("weapon", "pistol", { ...pistol(), shotCost: 500 }),
      ),
    ).toEqual(["shotCost: A shot cannot cost more than the capacity"]);
    expect(
      issuesOf(
        validateDefinition("weapon", "pistol", {
          ...pistol(),
          mode: "pellets",
        }),
      ),
    ).toEqual([
      "pellets: Required for pellets mode",
      "spreadRad: Required for pellets mode",
    ]);
    expect(
      issuesOf(
        validateDefinition("weapon", "pistol", { ...pistol(), fuseMs: 5 }),
      ),
    ).toEqual(["fuseMs: Only used by thrown mode"]);
    expect(
      issuesOf(
        validateDefinition("weapon", "pistol", { ...pistol(), laser: true }),
      ),
    ).toEqual(["laser: Unknown field"]);
    expect(
      issuesOf(
        validateDefinition("weapon", "pistol", {
          ...pistol(),
          cooldownMs: 1.5,
        }),
      ),
    ).toEqual(["cooldownMs: Must be a whole number"]);
  });
  test("item rules", () => {
    const base = INVENTORY_DEFINITIONS.find((d) => d.id === "field-pack")!;
    expect(
      issuesOf(validateDefinition("item", "other-id", { ...base })),
    ).toEqual(["id: Must equal the definition ID"]);
    expect(
      issuesOf(
        validateDefinition("item", "field-pack", {
          ...base,
          storage: { width: 0, height: 6, maxMassKg: 24 },
        }),
      ),
    ).toEqual(["storage.width: Must be at least 1 and at most 32"]);
    expect(
      issuesOf(
        validateDefinition("item", "field-pack", {
          ...base,
          equipSlot: "tail",
        }),
      ),
    ).toEqual(["equipSlot: Not one of the allowed values"]);
    expect(
      issuesOf(
        validateDefinition("item", "field-pack", {
          ...base,
          iconUrl: "javascript:alert(1)",
        }),
      ),
    ).toEqual(["iconUrl: Must be a /assets/... path"]);
    expect(
      issuesOf(validateDefinition("item", "BAD ID", { ...base })),
    ).toHaveLength(1);
    expect(issuesOf(validateDefinition("item", "x", "{not json"))).toEqual([
      ": Payload is not valid JSON",
    ]);
    expect(issuesOf(validateDefinition("item", "x", "[1]"))).toEqual([
      ": Payload must be a JSON object",
    ]);
  });
  test("legacy items never grow between revisions", () => {
    const legacy = INVENTORY_DEFINITIONS.find((d) => d.legacy)!;
    const prev = validateDefinition("item", legacy.id, { ...legacy });
    const grown = validateDefinition("item", legacy.id, {
      ...legacy,
      massKg: legacy.massKg + 1,
    });
    expect(prev.ok && grown.ok).toBe(true);
    if (!prev.ok || !grown.ok) return;
    expect(
      revisionIssues("item", prev.canonical, grown.canonical).map(
        (i) => i.path,
      ),
    ).toEqual(["massKg"]);
    expect(revisionIssues("item", null, grown.canonical)).toEqual([]);
    expect(revisionIssues("item", prev.canonical, prev.canonical)).toEqual([]);
  });
  test("planned kinds accept an envelope only", () => {
    expect(
      issuesOf(
        validateDefinition("market", "outpost", {
          name: "Outpost market",
          data: { sells: ["ore"] },
        }),
      ),
    ).toEqual([]);
    expect(
      issuesOf(validateDefinition("market", "outpost", { price: 3 })),
    ).toEqual(["price: Unknown field", "name: Required"]);
  });
  test("oversized payloads are refused", () => {
    const r = validateDefinition("market", "big", {
      name: "Big",
      data: { blob: "x".repeat(20000) },
    });
    expect(issuesOf(r)[0]).toMatch(/exceeds 16384 bytes/);
  });
});

describe("operation discipline", () => {
  test("stale revision, replay and reuse", () => {
    expect(definitionOperation("op-1", { a: 1 }, null, 0n, 0n)).toEqual({
      request: '{"a":1}',
      replay: false,
    });
    expect(() => definitionOperation("op-1", { a: 1 }, null, 1n, 2n)).toThrow(
      /revision conflict/,
    );
    expect(
      definitionOperation("op-1", { a: 1 }, { request: '{"a":1}' }, 1n, 5n)
        .replay,
    ).toBe(true);
    expect(() =>
      definitionOperation("op-1", { a: 2 }, { request: '{"a":1}' }, 0n, 0n),
    ).toThrow(/different request/);
    expect(() => definitionOperation("bad id!", {}, null, 0n, 0n)).toThrow(
      /operation ID/,
    );
  });
  test("status and current revision", () => {
    expect(definitionStatus({ latestRevision: 0n, currentRevision: 0n })).toBe(
      "draft",
    );
    expect(definitionStatus({ latestRevision: 2n, currentRevision: 1n })).toBe(
      "published",
    );
    expect(definitionStatus({ latestRevision: 2n, currentRevision: 0n })).toBe(
      "retired",
    );
    expect(
      currentRevisionOf([
        { revision: 1n, status: "published" },
        { revision: 3n, status: "retired" },
        { revision: 2n, status: "published" },
      ]),
    ).toBe(2n);
  });
});
