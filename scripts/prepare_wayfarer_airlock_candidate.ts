/** Exact isolated source compiler artifact; does not publish/refit or install gas. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createWayfarerAirlockCandidate } from "../packages/sim/src/wayfarer-airlock-candidate";
const root = resolve(import.meta.dirname, "..");
const kit = resolve(
  root,
  "assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003",
);
const candidate = createWayfarerAirlockCandidate({
  original: await readFile(
    resolve(root, "packages/content/src/wayfarer-starter-r001.json"),
    "utf8",
  ),
  mapping: await readFile(resolve(kit, "replacement-mapping.json"), "utf8"),
  walking: await readFile(
    resolve(kit, "native-walking-projection-v2.json"),
    "utf8",
  ),
  motion: await readFile(
    resolve(kit, "native-motion-neighbor-qualification.json"),
    "utf8",
  ),
});
const out = resolve(root, ".runtime/wayfarer-airlock-candidate-r001");
await mkdir(out, { recursive: true });
for (const [name, value] of Object.entries({
  "document.json": candidate.snapshot.canonical + "\n",
  "bindings.json": JSON.stringify(candidate.bindings, null, 2) + "\n",
  "native-visuals.json":
    JSON.stringify(candidate.nativeVisuals, null, 2) + "\n",
  "contract.json":
    JSON.stringify(
      {
        sha256: candidate.snapshot.sha256,
        floors: candidate.document.floors.length,
        objects: candidate.document.layout.assembly?.parts.length,
        roofIds: candidate.roofIds,
        exteriorFloorIds: candidate.exteriorFloorIds,
        dynamicDoorPartIds: candidate.dynamicDoorPartIds,
        pressureNeighbor: candidate.pressureNeighbor,
        registered: candidate.registered,
      },
      null,
      2,
    ) + "\n",
})) {
  const path = resolve(out, name);
  let existing: string | undefined;
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing !== undefined && existing !== value)
    throw Error("Preserve prior candidate artifact: " + name);
  if (existing === undefined) await writeFile(path, value);
}
console.log(
  JSON.stringify({
    out,
    sha256: candidate.snapshot.sha256,
    floors: candidate.document.floors.length,
    objects: candidate.document.layout.assembly?.parts.length,
    colliderBindings: candidate.bindings.length,
    registered: false,
  }),
);
