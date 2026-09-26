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
import { flightDefinitionCatalogHash } from "../../sim/src/flight-definition";
import { prefabShipSpawner, prefabShipSpawners } from "./ship-assign";
import { FED_WREN_PIN, REGISTERED_PREFAB_PINS } from "./prefab-ship-spawners";
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
