/** Exact geometry/resource evidence and worker-build CPU; never a frame/FPS probe. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { planetRecipe } from "../packages/content/src/environment";
import { composeReviewedPlanet } from "../packages/render/src/environment/reviewed-native/build-reviewed-planet";
import { validateModernNativePlanetKit } from "../packages/render/src/environment/modern-native-planet-schema";
import { validateReviewedWeather } from "../packages/render/src/environment/reviewed-native/reviewed-weather-validation";
const root = process.cwd(),
  ref = process.argv[2] ?? "02e4101887bcfcad38a0754b04c0900c21bde518";
const directory = "packages/render/src/environment/reviewed-native/",
  buildPath = directory + "build-reviewed-planet.ts",
  composerPath = directory + "temperate_reference_composition_r003.ts",
  indexPath = directory + "exact-vertex-indexing.ts";
const originalBuild = execFileSync("git", ["show", `${ref}:${buildPath}`], {
    encoding: "utf8",
  }),
  originalComposer = execFileSync("git", ["show", `${ref}:${composerPath}`], {
    encoding: "utf8",
  });
const sha = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
await mkdir(join(root, ".runtime"), { recursive: true });
const scratch = await mkdtemp(join(root, ".runtime", "planet-index-"));
async function compile(
  source: string,
  path: string,
  name: string,
  override?: string,
) {
  const rewritten = source.replace(
    /from\s*(['"])(\.\.?\/[^'"]+)\1/g,
    (_all, _quote: string, relative: string) =>
      `from "${relative === "./temperate_reference_composition_r003" && override ? override : pathToFileURL(resolve(dirname(join(root, path)), relative + ".ts")).href}"`,
  );
  const file = join(scratch, name + ".mjs");
  await writeFile(
    file,
    ts.transpileModule(rewritten, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
  return pathToFileURL(file).href;
}
const assets = join(root, "assets/reviewed-celestials/reviewed-planets"),
  raw = readFileSync(join(assets, "temperate-r003/kit.json")),
  cloudRaw = readFileSync(join(assets, "cloud-r002/kit.json"));
const kit = validateModernNativePlanetKit(
    JSON.parse(raw.toString()),
    raw.length,
  ),
  weather = validateReviewedWeather(
    JSON.parse(cloudRaw.toString()),
    cloudRaw.length,
  );
type Result = ReturnType<typeof composeReviewedPlanet>;
function signature(result: Result) {
  return {
    banks: result.batches.map((bank) => {
      const channels = [
        bank.positions,
        bank.normals,
        bank.uvs,
      ] as Float32Array[];
      const bits = channels.map(
        (v) => new Uint32Array(v.buffer, v.byteOffset, v.length),
      );
      const expanded = new Uint32Array(bank.indices.length * 8);
      let at = 0;
      for (const i of bank.indices) {
        for (let c = 0; c < 3; c++)
          for (let k = 0; k < (c === 2 ? 2 : 3); k++)
            expanded[at++] = bits[c][i * (c === 2 ? 2 : 3) + k];
      }
      return {
        expandedSha256: sha(new Uint8Array(expanded.buffer)),
        triangles: bank.indices.length / 3,
        ranges: bank.ranges,
        vertices: bank.positions.length / 3,
        bytes: channels.reduce(
          (n, v) => n + v.byteLength,
          bank.indices.byteLength,
        ),
      };
    }),
    shadowRadii: result.shadowRadii,
    weather:
      result.weather &&
      Object.fromEntries(
        Object.entries(result.weather).map(([k, v]) => [
          k,
          ArrayBuffer.isView(v)
            ? sha(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
            : v,
        ]),
      ),
    weatherShadowRadius: result.weatherShadowRadius,
  };
}
const shape = (row: ReturnType<typeof signature>) => ({
  ...row,
  banks: row.banks.map(({ vertices: _v, bytes: _b, ...bank }) => bank),
});
function measure(build: typeof composeReviewedPlanet, lod: 0 | 1 | 2) {
  const input = {
    bodyId: "pelagic",
    seed: 117,
    lod,
    recipe: planetRecipe("temperate", 117),
  };
  for (let i = 0; i < 2; i++) build(kit, weather, input);
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    build(kit, weather, input);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { samples: times, medianMs: times[2] };
}
try {
  const controlComposer = await compile(
      originalComposer,
      composerPath,
      "control-composer",
    ),
    controlURL = await compile(
      originalBuild,
      buildPath,
      "control-build",
      controlComposer,
    );
  const control = (await import(controlURL))
    .composeReviewedPlanet as typeof composeReviewedPlanet;
  const cases = [];
  for (const seed of [117, 0, 4294967295])
    for (const lod of [0, 1, 2] as const) {
      const input = {
        bodyId: "pelagic",
        seed,
        lod,
        recipe: planetRecipe("temperate", seed),
      };
      const before = signature(control(kit, weather, input)),
        candidate = signature(composeReviewedPlanet(kit, weather, input)),
        following = signature(control(kit, weather, input));
      if (
        JSON.stringify(shape(before)) !== JSON.stringify(shape(candidate)) ||
        JSON.stringify(shape(before)) !== JSON.stringify(shape(following))
      )
        throw Error(
          "Ordered corner bits, triangle ranges, weather or radii changed",
        );
      cases.push({ seed, lod, before, candidate, following });
    }
  const builds = ([0, 1, 2] as const).map((lod) => {
    const original = measure(control, lod),
      candidate = measure(composeReviewedPlanet, lod),
      following = measure(control, lod);
    return {
      lod,
      original,
      candidate,
      following,
      within3Percent:
        Math.abs(original.medianMs - following.medianMs) /
          Math.max(original.medianMs, following.medianMs) <=
        0.03,
    };
  });
  const report = {
    status: "complete",
    method:
      "Original/candidate/following original, accepted Pelagic117/0/4294967295 all LODs; exact ordered Float32 corner bits/ranges/weather/radii. Build CPU includes composition, indexing and packing (2warmup/5samples). No frame/GPU/FPS claim.",
    controlRef: ref,
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    assets: { body: sha(raw), cloud: sha(cloudRaw) },
    sources: {
      controlComposer: sha(originalComposer),
      candidateComposer: sha(await readFile(composerPath, "utf8")),
      indexer: sha(await readFile(indexPath, "utf8")),
    },
    cases,
    builds,
  };
  const output = process.env.SIDEREAL_PLANET_INDEX_RESULT;
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      cases: cases.map((row) => ({
        seed: row.seed,
        lod: row.lod,
        beforeVertices: row.before.banks.reduce((n, b) => n + b.vertices, 0),
        afterVertices: row.candidate.banks.reduce((n, b) => n + b.vertices, 0),
        beforeBytes: row.before.banks.reduce((n, b) => n + b.bytes, 0),
        afterBytes: row.candidate.banks.reduce((n, b) => n + b.bytes, 0),
      })),
      builds,
    }),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
