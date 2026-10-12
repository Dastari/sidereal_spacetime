/** Source-bound controller + actual Babylon active-evaluation evidence; not GPU/FPS. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  createOwnedTransformRefresh,
  createShadowCasterTransformCache,
  registerOwnedShadowCasterBank,
} from "../packages/render/src/shadow-transform-refresh";
import {
  summarize,
  relativeDifference,
} from "./prefab-render-harness/performance-probe";
const root = process.cwd(),
  controlRef = process.argv[2] ?? "7d2c4c383ebe8e2265d03e6bafa2f7da762bf9b9";
const path = "packages/render/src/shadow-transform-refresh.ts";
const source = execFileSync("git", ["show", `${controlRef}:${path}`], {
  encoding: "utf8",
});
await mkdir(join(root, ".runtime"), { recursive: true });
const scratch = await mkdtemp(join(root, ".runtime", "shadow-work-"));
const modulePath = join(scratch, "control.mjs");
await writeFile(
  modulePath,
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const control = await import(pathToFileURL(modulePath).href);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function run(candidate: boolean, groups: number, moving: boolean) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 100, -500), scene);
  scene.activeCamera = camera;
  camera.setTarget(Vector3.Zero());
  scene.updateTransformMatrix();
  const parents = Array.from({ length: groups }, (_, i) => {
    const p = new TransformNode(String(i), scene);
    p.position.x = i * 20;
    return p;
  });
  const meshes = parents.flatMap((parent) =>
    Array.from({ length: 139 }, (_, i) => {
      const m = CreateBox(`caster-${i}`, {}, scene);
      m.parent = parent;
      m.position.x = i % 15;
      m.position.z = Math.floor(i / 15);
      if (i % 2 === 0) m.setEnabled(false);
      return m;
    }),
  );
  const crew = CreateBox("crew", {}, scene);
  crew.parent = parents[0];
  crew.skeleton = new Skeleton("crew", "crew", scene);
  meshes.push(crew);
  const sun = new DirectionalLight("sun", new Vector3(-0.6, -1, 0.45), scene);
  sun.position.set(18, 30, -18);
  sun.autoCalcShadowZBounds = true;
  const view = Matrix.LookAtLH(
    sun.position,
    sun.position.add(sun.direction),
    Vector3.Up(),
  );
  const projection = Matrix.Identity();
  const banks = parents.map((p) =>
    registerOwnedShadowCasterBank(
      p,
      meshes.filter((m) => m.parent === p && m !== crew),
    ),
  );
  const cache = createShadowCasterTransformCache();
  const hash = createHash("sha256");
  let rebuilds = 0,
    preparationRebuilds = 0;
  const cpu: number[] = [];
  const warmup = 180,
    frames = 300;
  for (let frame = 0; frame < warmup + frames; frame++) {
    scene.incrementRenderId();
    if (moving)
      parents.forEach((p, i) => {
        p.position.x = i * 20 + frame / 30;
        p.rotation.y = frame / 1000;
      });
    // Same production adapter used by light preparation: noisy parent revisions.
    const lightRefresh = createOwnedTransformRefresh();
    parents.forEach(lightRefresh);
    const before = meshes.map((m) => m._childUpdateId);
    const started = performance.now();
    if (candidate) cache.update(meshes);
    else control.refreshShadowCasterTransforms(meshes);
    const afterPrep = meshes.map((m) => m._childUpdateId);
    for (const mesh of meshes) mesh.getBoundingInfo();
    sun.setShadowProjectionMatrix(projection, view, meshes);
    (
      scene as unknown as { _evaluateActiveMeshes(): void }
    )._evaluateActiveMeshes();
    const duration = performance.now() - started;
    if (frame < warmup) continue;
    cpu.push(duration);
    meshes.forEach((mesh, i) => {
      rebuilds += mesh._childUpdateId - before[i];
      preparationRebuilds += afterPrep[i] - before[i];
    });
    for (const mesh of meshes) {
      const values = [
        ...mesh.worldMatrixFromCache.m,
        ...mesh
          .getBoundingInfo()
          .boundingBox.vectorsWorld.flatMap((v) => v.asArray()),
      ];
      hash.update(new Uint8Array(new Float64Array(values).buffer));
    }
    hash.update(
      new Uint8Array(new Float64Array(Array.from(projection.m)).buffer),
    );
  }
  const result = {
    frames,
    warmup,
    casters: meshes.length,
    disabled: meshes.filter((m) => !m.isEnabled()).length,
    preparationRebuilds,
    rebuildsIncludingActiveEvaluation: rebuilds,
    signature: hash.digest("hex"),
    cpuMs: summarize(cpu),
  };
  cache.dispose();
  banks.forEach((bank) => bank.dispose());
  scene.dispose();
  engine.dispose();
  return result;
}
try {
  const cases = [];
  for (const groups of [1, 7])
    for (const moving of [false, true]) {
      const original = run(false, groups, moving),
        candidate = run(true, groups, moving),
        following = run(false, groups, moving);
      if (
        original.signature !== candidate.signature ||
        candidate.signature !== following.signature
      )
        throw new Error("Shadow matrices/bounds/projection signature changed");
      const controlDrift = relativeDifference(
        original.cpuMs.median!,
        following.cpuMs.median!,
      );
      cases.push({
        groups,
        moving,
        original,
        candidate,
        following,
        controlDrift,
        within3Percent: controlDrift <= 0.03,
      });
    }
  const report = {
    controlRef,
    candidateHead: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    controlSourceSha256: sha(source),
    candidateSourceSha256: sha(await readFile(path, "utf8")),
    node: process.version,
    babylon: "9.25.0",
    method:
      "Original/candidate/following control; same 139-caster groups+one stock skinned caster, lighting-parent preparation, complete directional fit and actual Babylon active evaluation. No scene draw/present or GPU timing. CPU duration includes cache qualification/fingerprints, bounds and active evaluation; signature hashing is outside timing.",
    cases,
  };
  await writeFile(
    process.env.SIDEREAL_SHADOW_BENCH_OUTPUT ?? join(scratch, "result.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      cases.map((c) => ({
        groups: c.groups,
        moving: c.moving,
        rebuilds: [
          c.original.rebuildsIncludingActiveEvaluation,
          c.candidate.rebuildsIncludingActiveEvaluation,
        ],
        preparation: [
          c.original.preparationRebuilds,
          c.candidate.preparationRebuilds,
        ],
        medianMs: [
          c.original.cpuMs.median,
          c.candidate.cpuMs.median,
          c.following.cpuMs.median,
        ],
        within3Percent: c.within3Percent,
      })),
      null,
      2,
    ),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
