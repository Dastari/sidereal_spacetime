/** Writes packages/content/src/ship-kit-pieces.v1.json from the TypeScript kit catalog. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shipKitPiecesFile } from "../packages/content/src/ship-kit";

const target = fileURLToPath(new URL("../packages/content/src/ship-kit-pieces.v1.json", import.meta.url));
writeFileSync(target, `${JSON.stringify(shipKitPiecesFile(), null, 1)}\n`);
console.log(`wrote ${shipKitPiecesFile().pieces.length} piece specs to ${target}`);
