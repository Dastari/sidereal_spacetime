/** Actual accepted assets, original/candidate/following control. Resource qualification, not GPU/FPS. */
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF";
import { planetRecipe } from "../packages/content/src/environment";
import { composeReviewedPlanet } from "../packages/render/src/environment/reviewed-native/build-reviewed-planet";
import { validateModernNativePlanetKit } from "../packages/render/src/environment/modern-native-planet-schema";
import { validateReviewedWeather } from "../packages/render/src/environment/reviewed-native/reviewed-weather-validation";
import { createStaticAsteroidInstances } from "../packages/render/src/environment/asteroid-instances";
const root = process.cwd(),
  ref = process.argv[2] ?? "3e8dd12a49ed954c129f85ab25cb89ef212ce00a";
const native = "packages/render/src/environment/reviewed-native/",
  buildPath = native + "build-reviewed-planet.ts",
  composerPath = native + "temperate_reference_composition_r003.ts";
const originalBuild = execFileSync("git", ["show", `${ref}:${buildPath}`], {
    encoding: "utf8",
  }),
  originalComposer = execFileSync("git", ["show", `${ref}:${composerPath}`], {
    encoding: "utf8",
  });
await mkdir(join(root, ".runtime"), { recursive: true });
const scratch = await mkdtemp(join(root, ".runtime", "planet-resources-"));
const sha = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
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
const channel = (values: ArrayLike<number>, indices = false) =>
  indices
    ? new Uint32Array(Array.from(values))
    : new Float32Array(Array.from(values));
function bank(batch: Result["batches"][number]) {
  const buffers = [
    channel(batch.positions),
    channel(batch.normals),
    channel(batch.uvs),
    channel(batch.indices, true),
  ];
  return {
    hashes: buffers.map((b) => sha(new Uint8Array(b.buffer))),
    bytes: buffers.reduce((n, b) => n + b.byteLength, 0),
    triangles: batch.indices.length / 3,
    ranges: batch.ranges,
  };
}
function signature(result: Result) {
  const w = result.weather as unknown as
    Record<string, ArrayLike<number>> | undefined;
  const channels = w
    ? [
        "positions",
        "normals",
        "indices",
        ...("colors" in w ? ["colors"] : []),
      ].map((key) => channel(w[key], key === "indices"))
    : [];
  return {
    banks: result.batches.map(bank),
    shadowRadii: result.shadowRadii,
    weather: {
      hashes: channels.map((b) => sha(new Uint8Array(b.buffer))),
      bytes: channels.reduce((n, b) => n + b.byteLength, 0),
      ranges: result.weather?.ranges,
      shadowRadius: result.weatherShadowRadius,
    },
  };
}
async function asteroids(count: number, instance: boolean, label: string) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    source = new TransformNode("source", scene),
    parent = new TransformNode("contacts", scene);
  try {
    const data = readFileSync(join(root, "assets/runtime/voxels/asteroid.glb"));
    const imported = await SceneLoader.ImportMeshAsync(
      "",
      "",
      "data:model/gltf-binary;base64," + data.toString("base64"),
      scene,
      undefined,
      ".glb",
    );
    for (const m of imported.meshes) if (!m.parent) m.parent = source;
    source.setEnabled(false);
    const factory = instance
      ? createStaticAsteroidInstances(source)
      : undefined;
    if (instance && !factory) throw Error("Pinned asteroid did not qualify");
    const contacts = Array.from({ length: count }, (_, i) => {
      const node =
        factory?.(`contact-${i}`, parent) ??
        source.clone(`contact-${i}`, parent)!;
      node.setEnabled(true);
      node.position.set((i % 14) * 14, -12, 45 + Math.floor(i / 14) * 16);
      node.rotation.y = i * 0.73;
      node.scaling.setAll(1.5 + (i % 3));
      return node;
    });
    const shapes = createHash("sha256"),
      meshes = contacts
        .flatMap((node) => node.getChildMeshes())
        .filter((m) => m.getTotalVertices() > 0);
    for (const m of meshes) {
      shapes.update(
        JSON.stringify([
          Array.from(m.getVerticesData("position") ?? []),
          Array.from(m.getVerticesData("normal") ?? []),
          Array.from(m.getIndices() ?? []),
          Array.from(m.computeWorldMatrix(true).m),
          m.isVisible,
          m.isPickable,
          m.visibility,
          m.receiveShadows,
        ]),
      );
    }
    const result = {
      label,
      count,
      assetSha256: sha(data),
      individualMeshes: meshes.length,
      renderingOwners: new Set(
        meshes.map((m) => (m instanceof InstancedMesh ? m.sourceMesh : m)),
      ).size,
      shapePolicySha256: shapes.digest("hex"),
    };
    parent.dispose(false, false);
    source.dispose(false, true);
    if (scene.meshes.length)
      throw Error("Asteroid resources survived disposal");
    return result;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}
try {
  const composerURL = await compile(
      originalComposer,
      composerPath,
      "control-composer",
    ),
    buildURL = await compile(
      originalBuild,
      buildPath,
      "control-builder",
      composerURL,
    );
  const control = (await import(buildURL))
    .composeReviewedPlanet as typeof composeReviewedPlanet;
  const input = {
    bodyId: "pelagic",
    seed: 117,
    recipe: planetRecipe("temperate", 117),
  };
  const before = ([0, 1, 2] as const).map((lod) =>
    signature(control(kit, weather, { ...input, lod })),
  );
  const common = signature(
    composeReviewedPlanet(kit, weather, {
      ...input,
      lod: 0,
      partition: "temperate-common-banks",
    }),
  );
  const own = ([0, 1, 2] as const).map((lod) =>
    signature(
      composeReviewedPlanet(kit, weather, {
        ...input,
        lod,
        partition: "temperate-lod-banks",
      }),
    ),
  );
  const following = ([0, 1, 2] as const).map((lod) =>
    signature(control(kit, weather, { ...input, lod })),
  );
  for (let lod = 0; lod < 3; lod++) {
    if (JSON.stringify(before[lod]) !== JSON.stringify(following[lod]))
      throw Error("Control resource output drifted");
    for (let i = 0; i < before[lod].banks.length; i++)
      if (
        JSON.stringify(before[lod].banks[i]) !==
        JSON.stringify(i === 0 ? own[lod].banks[i] : common.banks[i])
      )
        throw Error("LOD bank geometry/provenance differs");
    if (JSON.stringify(before[lod].weather) !== JSON.stringify(common.weather))
      throw Error("Weather output differs");
  }
  const summarize = (levels: ReturnType<typeof signature>[]) => ({
    retainedVertexIndexBytes: levels.reduce(
      (n, v) => n + v.banks.reduce((s, b) => s + b.bytes, 0) + v.weather.bytes,
      0,
    ),
    retainedMeshes: levels.reduce(
      (n, v) =>
        n +
        v.banks.filter((b) => b.triangles > 0).length +
        (v.weather.bytes ? 1 : 0),
      0,
    ),
    activeMeshes: levels.map(
      (v) =>
        v.banks.filter((b) => b.triangles > 0).length +
        (v.weather.bytes ? 1 : 0),
    ),
  });
  const beforeSummary = summarize(before),
    candidate = summarize([common, ...own]);
  candidate.activeMeshes = own.map(
    (v) =>
      v.banks.filter((b) => b.triangles > 0).length +
      common.banks.filter((b) => b.triangles > 0).length +
      (common.weather.bytes ? 1 : 0),
  );
  const gasRaw = readFileSync(join(assets, "gas-r005/kit.json")),
    gasKit = validateModernNativePlanetKit(
      JSON.parse(gasRaw.toString()),
      gasRaw.length,
    ),
    gasInput = {
      bodyId: "unqualified",
      seed: 117,
      lod: 0 as const,
      recipe: planetRecipe("gas", 117),
    };
  if (
    JSON.stringify(signature(control(gasKit, weather, gasInput))) !==
    JSON.stringify(signature(composeReviewedPlanet(gasKit, weather, gasInput)))
  )
    throw Error("Unqualified complete weather path differs");
  const fleets = [];
  for (const count of [20, 140]) {
    const legs = [
      await asteroids(count, false, "control"),
      await asteroids(count, true, "candidate"),
      await asteroids(count, false, "following-control"),
    ];
    if (legs.some((row) => row.shapePolicySha256 !== legs[0].shapePolicySha256))
      throw Error("Asteroid contact policy/geometry differs");
    fleets.push({ count, legs });
  }
  const result = {
    status: "complete",
    method:
      "Original/candidate/following control, actual pinned Pelagic and asteroid assets, exact canonical buffer and contact-policy checks; no FPS/GPU timing",
    controlRef: ref,
    node: process.version,
    assets: { bodySha256: sha(raw), cloudSha256: sha(cloudRaw) },
    sources: {
      controlBuilder: sha(originalBuild),
      controlComposer: sha(originalComposer),
      candidateBuilder: sha(await readFile(join(root, buildPath), "utf8")),
      candidateComposer: sha(await readFile(join(root, composerPath), "utf8")),
      candidateRuntime: sha(
        await readFile(join(root, native + "runtime.ts"), "utf8"),
      ),
      asteroidInstances: sha(
        await readFile(
          join(root, "packages/render/src/environment/asteroid-instances.ts"),
          "utf8",
        ),
      ),
    },
    planet: {
      before: beforeSummary,
      candidate,
      followingControl: summarize(following),
      allBanksWeatherAndProvenanceIdentical: true,
      unqualifiedCompleteWeatherIdentical: true,
    },
    asteroids: fleets,
  };
  const output = process.env.SIDEREAL_PLANET_RESOURCE_RESULT;
  if (output) await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
