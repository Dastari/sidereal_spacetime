/** Promote only the exact derived public stock exterior; no private assembly/state. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  deriveStockWayfarerExterior,
  validateStockExteriorManifest,
} from "../packages/render/src/remote-ships";
import { SHARED_STOCK_EXTERIOR_ID } from "../packages/content/src/shared-system";
const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const expected = deriveStockWayfarerExterior(
  read("assets/runtime/assembly/wayfarer.json"),
  read("assets/runtime/assembly/hull-manifest.json"),
);
validateStockExteriorManifest(expected, SHARED_STOCK_EXTERIOR_ID);
const staged = resolve(root, ".runtime/wayfarer-exterior-r001.json");
if (
  existsSync(staged) &&
  JSON.stringify(JSON.parse(readFileSync(staged, "utf8"))) !==
    JSON.stringify(expected)
)
  throw Error("Staged exterior differs from pinned derivation");
const pins = new Map<string, string>([
  [expected.payload.base.url, expected.payload.base.sha256],
]);
for (const p of expected.payload.placements) {
  if (pins.has(p.url) && pins.get(p.url) !== p.sha256)
    throw Error("Conflicting source pin");
  pins.set(p.url, p.sha256);
}
for (const [url, hash] of pins) {
  if (!url.startsWith("/assets/") || url.includes(".."))
    throw Error("Invalid public artifact path");
  const actual = createHash("sha256")
    .update(readFileSync(resolve(root, "assets/runtime", url.slice(8))))
    .digest("hex");
  if (actual !== hash) throw Error("Pinned native visual changed: " + url);
}
const target = resolve(
  root,
  "assets/runtime/assembly/wayfarer-exterior-r001.json",
);
const bytes = JSON.stringify(expected, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== bytes)
    throw Error("Installed exterior differs");
} else writeFileSync(target, bytes);
console.log(
  JSON.stringify({
    assetId: expected.assetId,
    verifiedGlbs: pins.size,
    placements: expected.payload.placements.length,
    target,
    check: process.argv.includes("--check"),
  }),
);
