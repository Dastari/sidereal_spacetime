import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  SHIP_COMPONENT_CATALOG_ID,
  SHIP_COMPONENT_CATALOG_REVISION,
} from "@sidereal/content/ship-components-source";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
} from "@sidereal/sim/prefab-construction";
import { prefabFlightModel } from "@sidereal/sim/prefab-flight";
import { flightDefinitionCatalogHash } from "@sidereal/sim/flight-definition";
import { prefabShipSpawner, prefabShipSpawners } from "./ship-assign";
import { FED_WREN_PIN, REGISTERED_PREFAB_PINS } from "./prefab-ship-spawners";
import {
  FED_WREN_R2_PIN,
  FED_WREN_R3_PIN,
  FED_WREN_R4_PIN,
  FED_WREN_R5_PIN,
} from "./prefab-ship-pins";
import { readFileSync } from "node:fs";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { trustedPrefabTemplate } from "./prefab-ship-authority";

const HEAVY = { timeout: 60_000 };

test(
  "only fed.s.wren is registered as a non-legacy prefab spawner",
  HEAVY,
  () => {
    expect(REGISTERED_PREFAB_PINS.map((p) => p.prefabId)).toEqual([
      "fed.s.wren",
    ]);
    const nonLegacy = prefabShipSpawners().filter((s) => !s.legacy);
    expect(nonLegacy.map((s) => s.prefabId)).toEqual(["fed.s.wren"]);
    expect(prefabShipSpawner("fed.s.wren")).toMatchObject({
      catalogRevision: FED_WREN_PIN.catalogRevision,
      blueprintSha256: FED_WREN_PIN.blueprintSha256,
      legacy: false,
    });
  },
);

test(
  "fed.s.wren pins equal the current grammar/catalog derivation (golden)",
  HEAVY,
  () => {
    const prefab = prefabById("fed.s.wren")!;
    const catalog = defaultPrefabComponentCatalog();
    expect(FED_WREN_PIN.catalogRevision).toBe(
      `${SHIP_COMPONENT_CATALOG_ID}@${SHIP_COMPONENT_CATALOG_REVISION}`,
    );
    expect(catalog.revision).toBe(FED_WREN_PIN.catalogRevision);
    const snapshot = compileConstruction(
      JSON.stringify(prefabConstructionDocument(prefab, catalog)),
    );
    expect(snapshot.sha256).toBe(FED_WREN_PIN.blueprintSha256);
    expect(trustedPrefabTemplate("fed.s.wren").snapshot.sha256).toBe(
      FED_WREN_PIN.blueprintSha256,
    );
    expect(
      flightDefinitionCatalogHash(prefabFlightModel(prefab, catalog).catalog),
    ).toBe(FED_WREN_PIN.flightDefinitionSha256);
  },
);

test(
  "the spawned fed.s.wren instance document stays under the 1 MiB budget",
  HEAVY,
  () => {
    const template = trustedPrefabTemplate("fed.s.wren");
    let n = 0;
    const plan = planConstructionInstance(
      template.snapshot,
      {
        blueprintRevisionId: template.blueprintRevisionId,
        expectedBlueprintSha256: template.snapshot.sha256,
        sourceDeckId: PREFAB_DECK_ID,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: [],
      },
      () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`,
    );
    const documentBytes = JSON.stringify(plan.document).length;
    const idMapBytes = JSON.stringify(plan.mappings).length;
    expect(documentBytes).toBeLessThan(1_048_576);
    expect(idMapBytes).toBeLessThan(1_048_576);
  },
);

test(
  "live Wren r2 instances keep their pins: catalog revision 1 stays buildable and unchanged",
  HEAVY,
  () => {
    // The first release assigned Wren r2 against ship-components-v1@1. Its stored construction
    // document names that catalog; admission re-derives the layout and the flight resolver
    // compares the compiled definition with the stored pin, so both must still derive exactly.
    const legacy = readShipPrefab(
      JSON.parse(
        readFileSync(
          new URL("./fixtures/fed-s-wren-r2.prefab.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    const catalog = prefabComponentCatalogFor(FED_WREN_R2_PIN.catalogRevision);
    expect(catalog.revision).toBe(FED_WREN_R2_PIN.catalogRevision);
    const snapshot = compileConstruction(
      JSON.stringify(prefabConstructionDocument(legacy, catalog)),
    );
    expect(snapshot.sha256).toBe(FED_WREN_R2_PIN.blueprintSha256);
    expect(
      flightDefinitionCatalogHash(prefabFlightModel(legacy, catalog).catalog),
    ).toBe(FED_WREN_R2_PIN.flightDefinitionSha256);
    // New assignments use the current catalog; the legacy pin is not a registered spawner.
    expect(FED_WREN_PIN.catalogRevision).not.toBe(
      FED_WREN_R2_PIN.catalogRevision,
    );
    expect(prefabShipSpawner("fed.s.wren")?.blueprintSha256).toBe(
      FED_WREN_PIN.blueprintSha256,
    );
    expect(() => prefabComponentCatalogFor("ship-components-v1@0")).toThrow();
  },
);

test(
  "live Wren r3 instances keep their pins until an operator upgrades them to r4",
  HEAVY,
  () => {
    // Wren r3 (2026-09-28) was assigned against ship-components-v1@2, the same catalog as r4, so
    // only the grammar document differs. Its frozen document must still derive the r3 pins.
    const legacy = readShipPrefab(
      JSON.parse(
        readFileSync(
          new URL("./fixtures/fed-s-wren-r3.prefab.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    expect(legacy.revision).toBe(3);
    const catalog = prefabComponentCatalogFor(FED_WREN_R3_PIN.catalogRevision);
    expect(catalog.revision).toBe(FED_WREN_R4_PIN.catalogRevision);
    const snapshot = compileConstruction(
      JSON.stringify(prefabConstructionDocument(legacy, catalog)),
    );
    expect(snapshot.sha256).toBe(FED_WREN_R3_PIN.blueprintSha256);
    expect(
      flightDefinitionCatalogHash(prefabFlightModel(legacy, catalog).catalog),
    ).toBe(FED_WREN_R3_PIN.flightDefinitionSha256);
    // The registered spawner is r5; r3 is only an upgrade source.
    expect(FED_WREN_PIN.blueprintSha256).not.toBe(
      FED_WREN_R3_PIN.blueprintSha256,
    );
    expect(prefabById("fed.s.wren")!.revision).toBe(6);
    expect(prefabShipSpawner("fed.s.wren")?.blueprintSha256).toBe(
      FED_WREN_PIN.blueprintSha256,
    );
  },
);

test(
  "live Wren r3 instances keep their pins until an operator upgrades them to r4",
  HEAVY,
  () => {
    // Wren r4 (2026-09-28) was assigned against ship-components-v1@2 without roof mount tiles.
    // Its frozen document must still derive the r4 pins under the legacy catalog.
    const legacy = readShipPrefab(
      JSON.parse(
        readFileSync(
          new URL("./fixtures/fed-s-wren-r4.prefab.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    expect(legacy.revision).toBe(4);
    const catalog = prefabComponentCatalogFor(FED_WREN_R4_PIN.catalogRevision);
    expect(catalog.revision).not.toBe(FED_WREN_PIN.catalogRevision);
    const snapshot = compileConstruction(
      JSON.stringify(prefabConstructionDocument(legacy, catalog)),
    );
    expect(snapshot.sha256).toBe(FED_WREN_R4_PIN.blueprintSha256);
    expect(
      flightDefinitionCatalogHash(prefabFlightModel(legacy, catalog).catalog),
    ).toBe(FED_WREN_R4_PIN.flightDefinitionSha256);
    // The registered spawner is r6; r4 is only an upgrade source.
    expect(FED_WREN_PIN.blueprintSha256).not.toBe(
      FED_WREN_R4_PIN.blueprintSha256,
    );
    expect(prefabById("fed.s.wren")!.revision).toBe(6);
    expect(prefabShipSpawner("fed.s.wren")?.blueprintSha256).toBe(
      FED_WREN_PIN.blueprintSha256,
    );
  },
);

test(
  "live Wren r5 instances keep their pins until an operator upgrades them to r6",
  HEAVY,
  () => {
    // Wren r5 (2026-09-29) was assigned against ship-components-v1@3 (four-way RCS nozzles at the
    // cluster anchor). Catalogue revision 4 changes only newly pinned documents: the frozen r5
    // document still derives the r5 blueprint and flight definition pins.
    const legacy = readShipPrefab(
      JSON.parse(
        readFileSync(
          new URL("./fixtures/fed-s-wren-r5.prefab.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    expect(legacy.revision).toBe(5);
    const catalog = prefabComponentCatalogFor(FED_WREN_R5_PIN.catalogRevision);
    expect(catalog.revision).not.toBe(FED_WREN_PIN.catalogRevision);
    expect(
      compileConstruction(
        JSON.stringify(prefabConstructionDocument(legacy, catalog)),
      ).sha256,
    ).toBe(FED_WREN_R5_PIN.blueprintSha256);
    expect(
      flightDefinitionCatalogHash(prefabFlightModel(legacy, catalog).catalog),
    ).toBe(FED_WREN_R5_PIN.flightDefinitionSha256);
    expect(FED_WREN_PIN.blueprintSha256).not.toBe(
      FED_WREN_R5_PIN.blueprintSha256,
    );
  },
);
