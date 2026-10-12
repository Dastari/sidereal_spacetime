/** Controlled CPU/controller evidence. NullEngine numbers are not GPU/FPS results.
 * Run: npm exec tsx -- scripts/babylon-light-work-benchmark.ts [control-ref]
 * Both legs use identical fixture, clock trace, warmup and injected counters. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { summarize } from "./prefab-render-harness/performance-probe";
import type * as Controller from "../packages/render/src/pbr-light-budget";

type Work = { selections: number; membershipChecks: number };
type MeasuredController = typeof Controller & { benchmarkWork: Work };
const root = process.cwd(),
  controlRef = process.argv[2] ?? "3e8dd12a49ed954c129f85ab25cb89ef212ce00a";
const sourcePath = "packages/render/src/pbr-light-budget.ts";
await mkdir(join(root, ".runtime"), { recursive: true });
const scratch = await mkdtemp(join(root, ".runtime", "light-cpu-"));
const control = execFileSync("git", ["show", `${controlRef}:${sourcePath}`], {
  encoding: "utf8",
});
const candidate = await readFile(join(root, sourcePath), "utf8");
let eligibilityCalls = 0;
const originalEligibility = Light.prototype.canAffectMesh;
Light.prototype.canAffectMesh = function (mesh) {
  eligibilityCalls++;
  return originalEligibility.call(this, mesh);
};
async function compile(source: string, name: string) {
  let instrumented =
    "export const benchmarkWork = {selections:0,membershipChecks:0};\n" +
    source;
  instrumented = instrumented.replaceAll(
    "selectLocalLights(",
    "(benchmarkWork.selections++, selectLocalLights)(",
  );
  instrumented = instrumented.replace(
    "const state = membership.get(light)!;",
    "benchmarkWork.membershipChecks++; const state = membership.get(light)!;",
  );
  instrumented = instrumented.replace(
    /from "(\.\/[^\"]+)"/g,
    (_match, relative: string) =>
      `from "${pathToFileURL(resolve(dirname(join(root, sourcePath)), relative + ".ts")).href}"`,
  );
  const output = ts.transpileModule(instrumented, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const file = join(scratch, name + ".mjs");
  await writeFile(file, output);
  return (await import(pathToFileURL(file).href)) as MeasuredController;
}
function fixture(api: MeasuredController, groups: number) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const gl = {
    MAX_VERTEX_UNIFORM_BLOCKS: 1,
    MAX_FRAGMENT_UNIFORM_BLOCKS: 2,
    MAX_UNIFORM_BUFFER_BINDINGS: 3,
    getParameter: () => 24,
  };
  engine.getRenderingCanvas = () =>
    ({ getContext: () => gl }) as unknown as HTMLCanvasElement;
  const material = new PBRMaterial("owned", scene);
  api.setPbrLightBudget(material, 8);
  const parents: TransformNode[] = [];
  const receivers = Array.from({ length: groups * 139 }, (_, i) => {
    const mesh = CreateBox(`receiver-${i}`, {}, scene);
    mesh.material = material;
    return mesh;
  });
  for (let i = 0; i < 3; i++) {
    const light = new HemisphericLight(`global-${i}`, Vector3.Up(), scene);
    api.protectPbrLight(light, i);
  }
  for (let group = 0; group < groups; group++) {
    const parent = new TransformNode(`ship-${group}`, scene);
    parents.push(parent);
    for (let i = 0; i < 13; i++) {
      const id = `group-${group}-lamp-${String(i).padStart(2, "0")}`;
      const light = new PointLight(id, new Vector3(i * 3, 0, 0), scene);
      light.parent = parent;
      light.range = 10;
      light.includedOnlyMeshes = receivers.slice(
        group * 139,
        (group + 1) * 139,
      );
      api.registerLocalPbrLight(light, id);
    }
  }
  const budget = api.createPbrLightBudget(scene);
  return { engine, scene, budget, receivers, parents };
}
function run(
  api: MeasuredController,
  groups: number,
  trace: boolean,
  label: string,
) {
  const { engine, scene, budget, receivers, parents } = fixture(api, groups);
  const focus = new Vector3();
  const step = (frame: number) => {
    focus.x = trace ? 18 + Math.sin(frame / 37) * 18 : 0;
    for (let i = 0; i < parents.length; i++)
      parents[i].position.x = trace ? Math.cos(frame / 53) * 5 + i * 20 : 0;
  };
  try {
    for (let i = 0; i < 300; i++) {
      step(i);
      budget.update(focus);
    }
    api.benchmarkWork.selections =
      api.benchmarkWork.membershipChecks =
      eligibilityCalls =
        0;
    const before = parents.reduce((n, parent) => n + parent._childUpdateId, 0);
    const times: number[] = [],
      changes: boolean[] = [];
    const hash = createHash("sha256");
    const frames = trace ? 600 : 60;
    for (let i = 0; i < frames; i++) {
      step(i);
      const start = performance.now();
      const changed = budget.update(focus);
      times.push(performance.now() - start);
      changes.push(changed);
      for (const mesh of receivers)
        hash.update(
          mesh.lightSources.map((light) => light.name).join("|") + "\n",
        );
    }
    return {
      label,
      groups,
      receivers: receivers.length,
      frames,
      warmup: 300,
      controllerCpuMs: summarize(times),
      rawCpuMs: times,
      work: {
        ...api.benchmarkWork,
        eligibilityCalls,
        parentComputations:
          parents.reduce((n, parent) => n + parent._childUpdateId, 0) - before,
      },
      acceptedArraysSha256: hash.digest("hex"),
      changes,
      resources: {
        meshes: scene.meshes.length,
        materials: scene.materials.length,
        lights: scene.lights.length,
      },
    };
  } finally {
    budget.dispose();
    scene.dispose();
    engine.dispose();
  }
}
try {
  const original = await compile(control, "control"),
    changed = await compile(candidate, "candidate");
  const rows = [];
  for (const groups of [1, 7])
    for (const trace of [false, true]) {
      const legs = [
        run(original, groups, trace, "control"),
        run(changed, groups, trace, "candidate"),
        run(original, groups, trace, "following-control"),
      ];
      if (
        legs.some(
          (leg) =>
            leg.acceptedArraysSha256 !== legs[0].acceptedArraysSha256 ||
            JSON.stringify(leg.changes) !== JSON.stringify(legs[0].changes),
        )
      )
        throw Error("Controller behavior differs from control");
      rows.push({ trace: trace ? "moving" : "stationary", legs });
      console.log(
        JSON.stringify({
          groups,
          trace: trace ? "moving" : "stationary",
          legs: legs.map(({ rawCpuMs, changes, ...row }) => row),
        }),
      );
    }
  const receipt = {
    status: "complete",
    method:
      "Node/NullEngine controller CPU and deterministic work; not GPU/FPS",
    controlRef,
    candidateHead: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    controlSourceSha256: createHash("sha256").update(control).digest("hex"),
    candidateSourceSha256: createHash("sha256").update(candidate).digest("hex"),
    dependencySourceSha256: createHash("sha256")
      .update(
        await readFile(
          join(root, "packages/render/src/shadow-transform-refresh.ts"),
        ),
      )
      .digest("hex"),
    limitation:
      "Fixtures do not link submesh shader effects; shader readiness is covered by correctness tests, not these CPU timings",
    node: process.version,
    rows,
  };
  const output = process.env.SIDEREAL_LIGHT_BENCHMARK_RESULT;
  if (output) {
    await writeFile(output, JSON.stringify(receipt, null, 2));
    console.log(`Saved ${output}`);
  }
} finally {
  Light.prototype.canAffectMesh = originalEligibility;
  await rm(scratch, { recursive: true, force: true });
}
