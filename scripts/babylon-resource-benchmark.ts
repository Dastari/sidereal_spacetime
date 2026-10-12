/** Same authored assets, burst trace and clone policy; controlled allocation counts, not GPU/FPS. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { prefabById } from "@sidereal/content/prefabs";
import {
  loadRemoteExteriorPrototype,
  resolvePublishedExterior,
} from "../packages/render/src/prefab-ship/remote-exteriors";
import {
  loadDeferredExterior,
  exteriorAdmissionKey,
} from "../packages/render/src/prefab-ship/deferred-exteriors";
import type { createVoxelFxPlayer as Factory } from "../packages/render/src/equipment/voxel-item-fx";
const root = process.cwd(),
  controlRef = process.argv[2] ?? "3e8dd12a49ed954c129f85ab25cb89ef212ce00a",
  path = "packages/render/src/equipment/voxel-item-fx.ts";
await mkdir(join(root, ".runtime"), { recursive: true });
const scratch = await mkdtemp(join(root, ".runtime", "fx-resources-"));
const before = execFileSync("git", ["show", `${controlRef}:${path}`], {
    encoding: "utf8",
  }),
  after = await readFile(join(root, path), "utf8");
async function compile(source: string, name: string) {
  const rewritten = source.replace(
    /from "(\.\.?\/[^\"]+)"/g,
    (_all, relative: string) =>
      `from "${pathToFileURL(resolve(dirname(join(root, path)), relative + ".ts")).href}"`,
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
  return (await import(pathToFileURL(file).href))
    .createVoxelFxPlayer as typeof Factory;
}
const originalLoader = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader),
  originalClone = AssetContainer.prototype.instantiateModelsToScene;
let parses = 0,
  clones = 0;
SceneLoader.LoadAssetContainerAsync = (_base, file, scene) => {
  parses++;
  return originalLoader(
    "",
    "data:model/gltf-binary;base64," +
      readFileSync(
        join(root, "assets/runtime/crew/items/r001", String(file)),
      ).toString("base64"),
    scene,
    undefined,
    ".glb",
  );
};
AssetContainer.prototype.instantiateModelsToScene = function (...args) {
  clones++;
  return originalClone.apply(this, args);
};
async function run(factory: typeof Factory, label: string) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    parent = new TransformNode("owner", scene);
  engine.getDeltaTime = () => 100;
  const player = factory(scene, parent, { maxLive: 96 });
  parses = clones = 0;
  let ended = 0,
    peakMeshes = 0;
  const shape = createHash("sha256"),
    materialState = createHash("sha256");
  const loops = 20,
    waveSize = 60;
  try {
    for (let wave = 0; wave < loops; wave++) {
      for (let i = 0; i < waveSize; i++)
        await player.spawn("muzzle-flash", {
          at: new Vector3(i, 0, wave),
          direction: Vector3.Forward(),
          tint: wave % 2 ? Color3.Red() : Color3.Blue(),
          scale: 1 + (i % 3) * 0.1,
          onEnd: () => {
            ended++;
          },
        });
      for (const mesh of player.meshes()) {
        shape.update(
          JSON.stringify([
            mesh.getTotalVertices(),
            mesh.getTotalIndices(),
            mesh.computeWorldMatrix(true).asArray(),
          ]),
        );
        if (mesh.material instanceof PBRMaterial)
          materialState.update(
            JSON.stringify([
              mesh.material.alpha,
              mesh.material.emissiveIntensity,
              mesh.material.emissiveColor.asArray(),
            ]),
          );
      }
      peakMeshes = Math.max(peakMeshes, scene.meshes.length);
      scene.onBeforeRenderObservable.notifyObservers(scene);
      if (player.count !== waveSize) throw Error("Flash lost its first frame");
      scene.onBeforeRenderObservable.notifyObservers(scene);
      if (Number(player.count) !== 0) throw Error("Burst did not end");
    }
    const idleMeshes = scene.meshes.length,
      idleMaterials = scene.materials.length;
    player.dispose();
    await Promise.resolve();
    await Promise.resolve();
    const result = {
      label,
      loops,
      waveSize,
      events: loops * waveSize,
      parses,
      cloneBundles: clones,
      ended,
      peakMeshes,
      idleMeshes,
      idleMaterials,
      afterDispose: {
        meshes: scene.meshes.length,
        materials: scene.materials.length,
      },
      shapeSha256: shape.digest("hex"),
      materialStateSha256: materialState.digest("hex"),
    };
    if (
      ended !== loops * waveSize ||
      result.afterDispose.meshes ||
      result.afterDispose.materials
    )
      throw Error("Effect resource/callback leak");
    return result;
  } finally {
    player.dispose();
    scene.dispose();
    engine.dispose();
  }
}
async function fleetResources(
  count: number,
  deferred: boolean,
  label: string,
  prefab = "fed.s.wren-fleet",
) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    parent = new TransformNode("contacts", scene);
  scene.useRightHandedSystem = true;
  const fetchBefore = globalThis.fetch,
    canvasBefore = globalThis.OffscreenCanvas;
  let assetRequests = 0,
    assetBytes = 0;
  globalThis.fetch = (async (url: unknown) => {
    const name = String(url),
      file = join(root, "assets/runtime", name.slice(8));
    if (!name.startsWith("/assets/") || !existsSync(file))
      return new Response("", { status: 404 });
    const data = readFileSync(file);
    assetRequests++;
    assetBytes += data.byteLength;
    return new Response(data);
  }) as typeof fetch;
  const context: object = new Proxy(() => context, {
    get: (_, key) =>
      key === "then"
        ? undefined
        : key === Symbol.toPrimitive
          ? () => 0
          : context,
    apply: () => context,
  });
  globalThis.OffscreenCanvas = class {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return context;
    }
  } as unknown as typeof OffscreenCanvas;
  const snapshot = () => ({
    assetRequests,
    assetBytes,
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    geometryBuffers: scene.geometries.reduce(
      (sum, g) =>
        sum +
        g
          .getVerticesDataKinds()
          .reduce((n, k) => n + (g.getVerticesData(k)?.length ?? 0) * 4, 0) +
        (g.getIndices()?.length ?? 0) * 4,
      0,
    ),
  });
  try {
    const doc = prefabById(prefab)!,
      resolved = resolvePublishedExterior(
        `prefab:${doc.id}`,
        BigInt(doc.revision),
      )!;
    const bank = await (
      deferred ? loadDeferredExterior : loadRemoteExteriorPrototype
    )(scene, resolved);
    const consumers = Array.from({ length: count }, (_, i) =>
      bank.instantiate(parent, `contact-${i}`),
    );
    for (const c of consumers) {
      c.full.setEnabled(false);
      c.proxy.setEnabled(true);
    }
    const far = snapshot();
    await bank.ensureFull?.();
    for (const c of consumers) {
      c.prepareFull?.();
      c.full.setEnabled(true);
      c.proxy.setEnabled(false);
    }
    const near = snapshot();
    const geometry = createHash("sha256");
    for (const mesh of consumers[0].full.getChildMeshes()) {
      geometry.update(
        JSON.stringify(Array.from(mesh.getVerticesData("position") ?? [])),
      );
      geometry.update(JSON.stringify(Array.from(mesh.getIndices() ?? [])));
      geometry.update(
        JSON.stringify(Array.from(mesh.computeWorldMatrix(true).m)),
      );
    }
    const nativeSha256 = geometry.digest("hex");
    parent.dispose(false, false);
    bank.dispose();
    return {
      label,
      count,
      prefab,
      admissionKey: exteriorAdmissionKey(resolved),
      radius: bank.radius,
      far,
      near,
      nativeSha256,
      afterDispose: snapshot(),
    };
  } finally {
    globalThis.fetch = fetchBefore;
    globalThis.OffscreenCanvas = canvasBefore;
    scene.dispose();
    engine.dispose();
  }
}

try {
  if (process.argv.includes("--radii")) {
    const metadata = [];
    for (const id of [
      "fed.s.wren-fleet",
      "fed.s.petrel-fleet",
      "fed.m.wayfarer-fleet",
      "fed.m.heron-fleet",
      "fed.l.kestrel-fleet",
      "fed.l.albatross-fleet",
    ])
      metadata.push(await fleetResources(1, false, "envelope", id));
    await writeFile(
      "/tmp/babylon-exterior-admission.json",
      JSON.stringify(metadata, null, 2),
    );
    process.exitCode = 0;
  } else {
    const original = await compile(before, "control"),
      candidate = await compile(after, "candidate");
    const legs = [
      await run(original, "control"),
      await run(candidate, "candidate"),
      await run(original, "following-control"),
    ];
    if (
      legs.some(
        (row) =>
          row.shapeSha256 !== legs[0].shapeSha256 ||
          row.materialStateSha256 !== legs[0].materialStateSha256,
      )
    )
      throw Error("Authored effect shape/material trace differs");
    SceneLoader.LoadAssetContainerAsync = (base, file, scene, ...extra) => {
      if (
        typeof file === "string" &&
        (String(base) + file).startsWith("/assets/")
      )
        return originalLoader(
          "",
          "data:model/gltf-binary;base64," +
            readFileSync(
              join(root, "assets/runtime", (String(base) + file).slice(8)),
            ).toString("base64"),
          scene,
          undefined,
          ".glb",
        );
      return originalLoader(base, file, scene, ...extra);
    };
    const fleets = [];
    for (const count of [20, 140]) {
      const trio = [
        await fleetResources(count, false, "control"),
        await fleetResources(count, true, "candidate"),
        await fleetResources(count, false, "following-control"),
      ];
      if (trio.some((row) => row.nativeSha256 !== trio[0].nativeSha256))
        throw Error("Promoted native fleet geometry/pose differs");
      fleets.push({ count, legs: trio });
    }
    const result = {
      fleets,
      fleetSources: Object.fromEntries(
        [
          "packages/render/src/prefab-ship/remote-exteriors.ts",
          "packages/render/src/prefab-ship/deferred-exteriors.ts",
        ].map((p) => [
          p,
          createHash("sha256")
            .update(readFileSync(join(root, p)))
            .digest("hex"),
        ]),
      ),
      status: "complete",
      method:
        "Real authored GLBs; identical20×60-event trace; allocation and behavior counts, not GPU/FPS",
      controlRef,
      controlSourceSha256: createHash("sha256").update(before).digest("hex"),
      candidateSourceSha256: createHash("sha256").update(after).digest("hex"),
      node: process.version,
      legs,
    };
    const output = process.env.SIDEREAL_RESOURCE_BENCHMARK_RESULT;
    if (output) await writeFile(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
} finally {
  SceneLoader.LoadAssetContainerAsync = originalLoader;
  AssetContainer.prototype.instantiateModelsToScene = originalClone;
  await rm(scratch, { recursive: true, force: true });
}
