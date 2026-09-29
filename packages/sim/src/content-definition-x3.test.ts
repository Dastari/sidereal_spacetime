import { describe, expect, test } from "vitest";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import { INTERACTION_SEED } from "@sidereal/content/content-definition-seed";
import {
  STARTER_KIT_DEFINITION_IDS,
  protectedDefinitionUses,
} from "@sidereal/content/definition-references";
import { CREW_WARDROBE_DEFINITIONS } from "@sidereal/content/inventory";
import { retireBlocker, validateDefinition } from "./content-definitions";
import { readFileSync } from "node:fs";

const issuesOf = (r: ReturnType<typeof validateDefinition>) =>
  r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
const component = (id: string) =>
  JSON.parse(
    JSON.stringify(
      buildShipComponentCatalog(4).components.find((c) => c.id === id)!,
    ),
  );

describe("component/v1", () => {
  test("every component of every catalogue revision validates", () => {
    for (const revision of [1, 2, 3, 4] as const)
      for (const c of buildShipComponentCatalog(revision).components)
        expect(
          issuesOf(validateDefinition("component", c.id, c)),
          `@${revision} ${c.id}`,
        ).toEqual([]);
  });
  test("field schema and the catalogue's own rules both apply", () => {
    const drive = component("ion-drive.sm");
    expect(
      issuesOf(
        validateDefinition("component", "ion-drive.sm", {
          ...drive,
          power: { ...drive.power, idleKw: 500 },
        }),
      ),
    ).toEqual([": power idle <= active <= peak violated"]);
    expect(
      issuesOf(
        validateDefinition("component", "ion-drive.sm", {
          ...drive,
          propulsion: null,
        }),
      ),
    ).toEqual([": propulsion without stats"]);
    expect(
      issuesOf(
        validateDefinition("component", "ion-drive.sm", {
          ...drive,
          ports: [{ ...drive.ports[0], channel: "steam" }],
        }),
      ),
    ).toEqual(["ports[0].channel: Not one of the allowed values"]);
    expect(
      issuesOf(
        validateDefinition("component", "ion-drive.sm", {
          ...drive,
          mount: { ...drive.mount, cells: [1] },
        }),
      ),
    ).toEqual(["mount.cells: Must have exactly 2 values"]);
    const { weapon: _weapon, ...missing } = drive;
    expect(
      issuesOf(validateDefinition("component", "ion-drive.sm", missing)),
    ).toEqual(["weapon: Required"]);
    expect(
      issuesOf(validateDefinition("component", "other", drive))[0],
    ).toMatch(/Must equal the definition ID/);
  });
});

describe("loot_table/v1", () => {
  const table = {
    name: "Pirate cache",
    rolls: 2,
    emptyWeight: 1,
    entries: [
      { itemId: "medkit", weight: 3, minQuantity: 1, maxQuantity: 2 },
      { itemId: "power-cell", weight: 1, minQuantity: 1, maxQuantity: 1 },
    ],
  };
  test("valid tables pass; quantities and duplicates are checked", () => {
    expect(issuesOf(validateDefinition("loot_table", "cache", table))).toEqual(
      [],
    );
    expect(
      issuesOf(
        validateDefinition("loot_table", "cache", {
          ...table,
          entries: [
            { itemId: "medkit", weight: 1, minQuantity: 3, maxQuantity: 2 },
            { itemId: "medkit", weight: 1, minQuantity: 1, maxQuantity: 1 },
          ],
        }),
      ),
    ).toEqual([
      "entries[0].maxQuantity: Maximum must be at least the minimum",
      "entries[1].itemId: Each item appears once; merge the entries",
    ]);
    expect(
      issuesOf(
        validateDefinition("loot_table", "cache", { ...table, entries: [] }),
      ),
    ).toEqual(["entries: Must have 1 to 64 entries"]);
  });
});

describe("interaction/v1", () => {
  test("seeds validate; verbs are unique; reach is bounded", () => {
    for (const [id, payload] of Object.entries(INTERACTION_SEED))
      expect(issuesOf(validateDefinition("interaction", id, payload))).toEqual(
        [],
      );
    const seat = INTERACTION_SEED.seat;
    expect(
      issuesOf(
        validateDefinition("interaction", "seat", {
          ...seat,
          verbs: [
            { id: "sit", label: "Sit" },
            { id: "sit", label: "Sit again" },
          ],
          reachM: 9,
        }),
      ),
    ).toEqual(["reachM: Must be at least 0.3 and at most 5"]);
    expect(
      issuesOf(
        validateDefinition("interaction", "seat", {
          ...seat,
          verbs: [
            { id: "sit", label: "Sit" },
            { id: "sit", label: "Sit again" },
          ],
        }),
      ),
    ).toEqual(["verbs: Verb IDs must be unique"]);
  });
  test("the seed matches the interaction rules in code (1.8 m reach, the four actions)", () => {
    const sim = readFileSync(
      new URL("./interactions.ts", import.meta.url),
      "utf8",
    );
    expect(sim).toMatch(/distance > 1\.8/);
    const actions = [
      ...sim.matchAll(/"(sit|stand|set-light-on|set-light-off)"/g),
    ].map((m) => m[1]);
    for (const verb of Object.values(INTERACTION_SEED).flatMap((i) =>
      (i.verbs as { id: string }[]).map((v) => v.id),
    ))
      expect(actions).toContain(verb);
  });
});

describe("retire guard", () => {
  const published = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      revision: BigInt(i + 1),
      status: "published",
    }));
  test("the last published revision of a kit item or its weapon is protected", () => {
    expect(retireBlocker("item", "medkit", published(1), 1n)).toMatch(
      /Cannot retire the last published revision of item:medkit: it is used by the starter kit of every new character/,
    );
    expect(retireBlocker("weapon", "compact-pistol", published(1), 1n)).toMatch(
      /starter kit/,
    );
    // Another published revision remains: retiring one is fine.
    expect(retireBlocker("item", "medkit", published(2), 1n)).toBeNull();
    // Not created automatically.
    expect(retireBlocker("item", "plasma-cutter", published(1), 1n)).toBeNull();
    expect(
      retireBlocker("component", "ion-drive.sm", published(1), 1n),
    ).toBeNull();
  });
  test("uniform issue and operator kits are protected too", () => {
    const uniform = CREW_WARDROBE_DEFINITIONS[0].id;
    expect(protectedDefinitionUses("item", uniform)).toContain(
      "uniform and armour tier issue",
    );
    expect(protectedDefinitionUses("item", "rail-rifle")).toEqual([
      'operator kit "weapons-and-tools"',
      'operator kit "weapons"',
    ]);
  });
  test("the protected starter kit is exactly what the world issues", () => {
    for (const file of ["personal-kit.ts", "inventory.ts"]) {
      const source = readFileSync(
        new URL(`../../world/src/${file}`, import.meta.url),
        "utf8",
      );
      const issued = [...source.matchAll(/\bitem\("([a-z0-9-]+)"/g)].map(
        (m) => m[1],
      );
      for (const id of issued.filter(
        (i) => i !== "long-rifle" && i !== "heavy-handgun",
      ))
        expect(STARTER_KIT_DEFINITION_IDS).toContain(id);
      if (file === "personal-kit.ts")
        expect([...new Set(issued)].sort()).toEqual(
          [...STARTER_KIT_DEFINITION_IDS].sort(),
        );
    }
  });
});
