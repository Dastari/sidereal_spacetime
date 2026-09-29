/**
 * Print the pins (blueprint sha256, flight definition sha256) of a prefab document, for
 * `packages/world/src/prefab-ship-pins.ts`. `npx tsx scripts/prefab-pins.ts fed.s.wren` or
 * `npx tsx scripts/prefab-pins.ts --file packages/world/src/fixtures/fed-s-wren-r4.prefab.json --catalog ship-components-v1@2`.
 */
import { readFileSync } from "node:fs";
import { prefabById } from "../packages/content/src/prefabs";
import { readShipPrefab } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { compileConstruction } from "../packages/sim/src/construction-transactions";
import { prefabConstructionDocument } from "../packages/sim/src/prefab-construction";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { flightDefinitionCatalogHash } from "../packages/sim/src/flight-definition";
import { prefabComponentCatalogFor } from "../packages/sim/src/prefab-catalog";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const file = arg("--file");
const doc = file
  ? readShipPrefab(JSON.parse(readFileSync(file, "utf8")))
  : prefabById(process.argv[2]!)!;
const catalog = arg("--catalog")
  ? prefabComponentCatalogFor(arg("--catalog")!)
  : defaultPrefabComponentCatalog();
console.log(
  JSON.stringify(
    {
      prefabId: doc.id,
      revision: doc.revision,
      catalogRevision: catalog.revision,
      blueprintSha256: compileConstruction(
        JSON.stringify(prefabConstructionDocument(doc, catalog)),
      ).sha256,
      flightDefinitionSha256: flightDefinitionCatalogHash(
        prefabFlightModel(doc, catalog).catalog,
      ),
    },
    null,
    2,
  ),
);
