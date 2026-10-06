/** Explicit provisional fleet pin generation; does not publish or approve art. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  FEDERATION_FLEET_PINS,
  FEDERATION_FLEET_PIN_SET,
} from "../packages/world/src/faction-fleet-pins";
import { FEDERATION_FLEET } from "../packages/content/src/prefabs";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { compileConstruction } from "../packages/sim/src/construction-transactions";
import { prefabConstructionDocument } from "../packages/sim/src/prefab-construction";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { flightDefinitionCatalogHash } from "../packages/sim/src/flight-definition";
import { prefabCargoSockets } from "../packages/sim/src/prefab-cargo-sockets";

const catalog = defaultPrefabComponentCatalog();
const pins = FEDERATION_FLEET.map((doc) => {
  const locker = prefabCargoSockets(doc, 0, catalog).find(
    (socket) =>
      socket.room === "lock" &&
      socket.designId === "shipyard.equipment.wall-locker",
  );
  if (!locker) throw Error(`EVA locker required for ${doc.id}`);
  return {
    prefabId: doc.id,
    catalogRevision: catalog.revision,
    blueprintSha256: compileConstruction(
      JSON.stringify(prefabConstructionDocument(doc, catalog)),
    ).sha256,
    flightDefinitionSha256: flightDefinitionCatalogHash(
      prefabFlightModel(doc, catalog).catalog,
    ),
    description: `${doc.name} (provisional Federation ${doc.role}, size ${doc.sizeClass}, fleet r${doc.revision})`,
    issueStock: [
      {
        socketKey: locker.key,
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  };
});
const hash = createHash("sha256").update(JSON.stringify(pins)).digest("hex");
const source = `/** Exact provisional fleet pins. Regenerate with scripts/pin-faction-fleet.ts --write; qualification remains separate. */\nimport type { PinnedPrefabShip } from "./prefab-ship-pins";\nexport const FEDERATION_FLEET_PIN_SET = "${hash}";\nexport const FEDERATION_FLEET_PINS: readonly PinnedPrefabShip[] = ${JSON.stringify(pins, null, 2)};\n`;
const target = new URL(
  "../packages/world/src/faction-fleet-pins.ts",
  import.meta.url,
);
if (process.argv.includes("--write")) writeFileSync(target, source);
else if (
  JSON.stringify(FEDERATION_FLEET_PINS) !== JSON.stringify(pins) ||
  FEDERATION_FLEET_PIN_SET !== hash
)
  throw Error(
    "Fleet pins drifted; qualify the revision and regenerate explicitly",
  );
console.log(
  JSON.stringify({ status: "PASS", ships: pins.length, pinSet: hash }),
);
