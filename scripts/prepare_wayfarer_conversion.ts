/** Read-only installed-art input; writes a private candidate, never a runtime
 * assembly, catalog, database, deployment or public preview. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { WAYFARER_CONVERSION_PIN as PIN } from "../packages/content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../packages/sim/src/wayfarer-conversion-candidate";

const root = resolve(import.meta.dirname, "..");
const input = Object.fromEntries(
  await Promise.all(
    Object.keys(PIN.sources).map(async (path) => [
      path,
      await readFile(resolve(root, path), "utf8"),
    ]),
  ),
) as WayfarerPinnedInputs;
const candidate = createWayfarerConversionCandidate(input);
const native = new Map<
  string,
  { path: string; sha256: string; placedIds: string[] }
>();
for (const placement of candidate.placements) {
  const visual = placement.visual;
  if (!visual) continue;
  if (!visual.url.startsWith("/assets/assembly/"))
    throw Error("Unexpected native visual root: " + placement.sourcePlacedId);
  const path = resolve(
    root,
    "assets/runtime/assembly",
    visual.url.slice("/assets/assembly/".length),
  );
  if (!path.startsWith(resolve(root, "assets/runtime/assembly") + "/"))
    throw Error("Unsafe native visual path");
  const existing = native.get(path);
  if (existing) {
    if (existing.sha256 !== visual.sha256)
      throw Error("Conflicting native hash");
    existing.placedIds.push(placement.sourcePlacedId);
    continue;
  }
  const sha256 = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (sha256 !== visual.sha256)
    throw Error("Native visual hash mismatch: " + relative(root, path));
  native.set(path, {
    path: relative(root, path),
    sha256,
    placedIds: [placement.sourcePlacedId],
  });
}
const out = resolve(root, ".runtime", PIN.id);
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, "document.json"),
  candidate.snapshot.canonical + "\n",
);
await writeFile(
  resolve(out, "placements.json"),
  JSON.stringify(candidate.placements, null, 2) + "\n",
);
const report = {
  schema: candidate.schema,
  pin: PIN,
  documentSha256: candidate.snapshot.sha256,
  canonicalBytes: Buffer.byteLength(candidate.snapshot.canonical),
  readiness: candidate.readiness,
  compilerReadiness: candidate.snapshot.readiness,
  gaps: candidate.gaps,
  liveMigration: candidate.liveMigration,
  nativeVisuals: [...native.values()],
};
await writeFile(
  resolve(out, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    output: relative(root, out),
    sha256: candidate.snapshot.sha256,
    placements: candidate.placements.length,
    nativeFiles: native.size,
    spawnable: false,
  }),
);
