/** Build an atomic review asset tree. This never activates an app or changes its published defaults. */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { readShipVisualManifest } from "@sidereal/content/ship-visual";
import { SHIP_REFERENCE_VISUAL } from "@sidereal/content/ship-visual-revision";

const root = resolve(import.meta.dirname, "../..");
const destination = process.argv[2] && resolve(process.argv[2]);
const expected = process.argv[3];
if (
  !destination ||
  expected !== SHIP_REFERENCE_VISUAL.sha256 ||
  !relative(root, destination).startsWith(`..${sep}`) ||
  existsSync(destination)
)
  throw Error(
    "Pass a new review directory outside the repository and the exact candidate manifest SHA256",
  );
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const source = resolve(root, "assets/runtime/ship-visual/r001/manifest.json");
const bytes = readFileSync(source);
if (hash(bytes) !== expected) throw Error("Candidate manifest SHA256 mismatch");
const manifest = readShipVisualManifest(JSON.parse(bytes.toString("utf8")));
if (manifest.compilerSha256 !== SHIP_REFERENCE_VISUAL.compilerSha256)
  throw Error("Candidate compiler selection mismatch");
const staged = `${destination}.staging-${process.pid}`;
mkdirSync(staged, { recursive: true });
try {
  const files = new Map<string, string>();
  const sizes = new Map<string, number>();
  for (const asset of manifest.assets) {
    const path = asset.url.slice("/assets/".length);
    const prior = files.get(path);
    if (prior) {
      if (prior !== asset.sha256 || sizes.get(path) !== asset.bytes)
        throw Error(`Conflicting candidate artifact: ${path}`);
      continue;
    }
    const data = readFileSync(resolve(root, "assets/runtime", path));
    if (data.length !== asset.bytes || hash(data) !== asset.sha256)
      throw Error(`Candidate asset hash/size mismatch: ${path}`);
    const target = resolve(staged, "assets", path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    files.set(path, asset.sha256);
    sizes.set(path, asset.bytes);
  }
  const target = resolve(staged, "assets/ship-visual/r001/manifest.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  writeFileSync(
    resolve(staged, "candidate.json"),
    JSON.stringify(
      {
        status: "proposal",
        selection: SHIP_REFERENCE_VISUAL,
        files: Object.fromEntries(files),
        defaultActivation: false,
      },
      null,
      2,
    ) + "\n",
  );
  renameSync(staged, destination);
  console.log(
    JSON.stringify({
      destination,
      sha256: expected,
      files: files.size,
      activated: false,
    }),
  );
} catch (error) {
  rmSync(staged, { recursive: true, force: true });
  throw error;
}
