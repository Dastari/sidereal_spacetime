/** Same achieved-output plume work on actual Wren layout; no GPU/FPS measurement. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { prefabById } from "../packages/content/src/prefabs";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import {
  createShipExhaust,
  prefabNozzleLayout,
} from "../packages/render/src/prefab-ship/exhaust";
const root = process.cwd(),
  ref = process.argv[2] ?? "3e8dd12a49ed954c129f85ab25cb89ef212ce00a",
  path = "packages/render/src/prefab-ship/exhaust.ts";
const original = execFileSync("git", ["show", `${ref}:${path}`], {
  encoding: "utf8",
});
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
await mkdir(join(root, ".runtime"), { recursive: true });
const scratch = await mkdtemp(join(root, ".runtime", "exhaust-work-"));
const rewritten = original.replace(
  /from\s*(['"])(\.\.?\/[^'"]+)\1/g,
  (_all, _quote: string, relative: string) =>
    `from "${pathToFileURL(resolve(dirname(join(root, path)), relative + ".ts")).href}"`,
);
const controlPath = join(scratch, "control.mjs");
await writeFile(
  controlPath,
  ts.transpileModule(rewritten, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const control = (await import(pathToFileURL(controlPath).href))
  .createShipExhaust as typeof createShipExhaust;
const layout = prefabNozzleLayout(
  prefabById("fed.s.wren")!,
  defaultPrefabComponentCatalog(),
);
async function run(
  factory: typeof createShipExhaust,
  count: number,
  mixed: boolean,
) {
  const engine = new NullEngine();
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine),
    camera = new FreeCamera("camera", new Vector3(0, 60, -80), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const owners = Array.from({ length: count }, (_, i) => {
    const ship = new TransformNode(`ship-${i}`, scene);
    ship.position.set((i % 5) * 24 - 48, 0, Math.floor(i / 5) * 30);
    return { ship, exhaust: factory(scene, ship, "federation") };
  });
  if (mixed) {
    // Conservative custom transparency comparator: must retain individual draws.
    scene.setRenderingOrder(0, null, null, () => 0);
    const glass = CreateBox("glass", {}, scene),
      mat = new StandardMaterial("glass", scene);
    mat.alpha = 0.5;
    glass.material = mat;
  }
  const jets = layout.map((j) => ({ ...j, throttle: 1 })),
    times: number[] = [];
  for (const o of owners) {
    o.exhaust.update(jets, 0);
    for (const mesh of o.exhaust.glowMeshes?.() ?? o.exhaust.meshes())
      await mesh.material!.forceCompilationAsync(
        mesh as import("@babylonjs/core/Meshes/mesh").Mesh,
        { useInstances: !mesh.isVisible },
      );
  }
  const signature = createHash("sha256");
  for (let frame = 0; frame < 480; frame++) {
    scene.incrementRenderId();
    owners.forEach((o, i) => {
      o.ship.rotation.y = frame / 1000;
      o.ship.position.x = (i % 5) * 24 - 48 + frame / 60;
    });
    scene.updateTransformMatrix();
    const start = performance.now();
    for (const o of owners) o.exhaust.update(jets, frame * 16);
    (
      scene as unknown as { _evaluateActiveMeshes(): void }
    )._evaluateActiveMeshes();
    if (frame >= 180) {
      times.push(performance.now() - start);
      for (const o of owners)
        for (const m of o.exhaust.meshes())
          signature.update(
            new Uint8Array(
              new Float64Array([
                ...m.worldMatrixFromCache.m,
                ...m
                  .getBoundingInfo()
                  .boundingBox.vectorsWorld.flatMap((v) => v.asArray()),
                m.metadata.exhaustPhase,
              ]).buffer,
            ),
          );
    }
  }
  times.sort((a, b) => a - b);
  const meshes = owners.flatMap((o) => o.exhaust.meshes()),
    renderOwners = new Set(
      meshes
        .filter((m) => m.isEnabled())
        .map((m) => (m instanceof InstancedMesh ? m.sourceMesh : m)),
    );
  const result = {
    samples: times.length,
    warmup: 180,
    medianCpuMs: times[150],
    placedPlumes: meshes.length,
    renderOwners: renderOwners.size,
    instancedPlumes: meshes.filter((m) => m instanceof InstancedMesh).length,
    sceneMeshes: scene.meshes.length,
    materials: scene.materials.length,
    signature: signature.digest("hex"),
  };
  owners.forEach((o) => o.ship.dispose());
  if (scene.meshes.some((m) => m.name.startsWith("ship-exhaust")))
    throw Error("Exhaust owner resources survived teardown");
  scene.dispose();
  engine.dispose();
  return result;
}
try {
  const cases = [];
  for (const count of [1, 20, 24])
    for (const mixed of [false, true]) {
      const before = await run(control, count, mixed),
        candidate = await run(
          (scene, root, theme) =>
            createShipExhaust(scene, root, theme, { instances: true }),
          count,
          mixed,
        ),
        following = await run(control, count, mixed);
      if (
        before.signature !== candidate.signature ||
        before.signature !== following.signature
      )
        throw Error("Achieved plume matrices/bounds/phases changed");
      cases.push({
        count,
        mixed,
        before,
        candidate,
        following,
        within3Percent:
          Math.abs(before.medianCpuMs - following.medianCpuMs) /
            Math.max(before.medianCpuMs, following.medianCpuMs) <=
          0.03,
      });
    }
  const report = {
    status: "complete",
    method:
      "Original/candidate/following original; actual Wren all21plumes achieved-output stress fixture, moving ship roots, same300samples/180warmup. Controller+actual active evaluation CPU includes batching guard. Render owners are topology counts, not measured GPU draws or FPS. Conservative custom-sort mixed case retains clones.",
    controlRef: ref,
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sources: {
      original: sha(original),
      candidate: sha(await readFile(path, "utf8")),
      coordinator: sha(
        await readFile(
          "packages/render/src/prefab-ship/exhaust-batching.ts",
          "utf8",
        ),
      ),
    },
    cases,
  };
  if (process.env.SIDEREAL_EXHAUST_RESULT)
    await writeFile(
      process.env.SIDEREAL_EXHAUST_RESULT,
      JSON.stringify(report, null, 2),
    );
  console.log(JSON.stringify(cases));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
