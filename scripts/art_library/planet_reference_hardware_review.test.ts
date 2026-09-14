import { expect, it } from "vitest";
import {
  referenceDirectPaths,
  referenceRevisionPath,
  referenceAssetPath,
} from "./planet_reference_direct_paths";
import { createReferenceLODRecorder } from "./planet_reference_lod_recorder";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
it("accepts only fixed-root supported revision folders and keeps CLI defaults unchanged", () => {
  const defaults = referenceDirectPaths(new URLSearchParams());
  expect(defaults.kit).toBe("/planet-reference-kit.json");
  expect(defaults.hdr).toBe("/assets/materials/frontier-workshop.hdr");
  const direct = referenceDirectPaths(
    new URLSearchParams("kit=ice-r025&weatherKit=cloud-r002"),
  );
  expect(direct.kit).toBe(
    "/@fs/root/sidereal_spacetime/scripts/art_library/review-staging/ice-r025/kit.json",
  );
  expect(direct.weatherKit).toContain("/cloud-r002/kit.json");
  expect(direct.hdr).toBe(
    "/@fs/root/sidereal_spacetime/scripts/art_library/review-staging/ice-r025/frontier-workshop.hdr",
  );
  for (const good of [
    "volcanic-r023",
    "rocky-moon-2-r001",
    "desert-moon-1-r001",
    "gas-giant-moon-3-r001",
    "temperate-moon-2-r001",
  ])
    expect(referenceRevisionPath(good)).toContain("/" + good + "/");
  for (const bad of [
    "gas-giant-moon-4-r001",
    "desert-moon-3-r001",
    "",
    "../ice-r025",
    "ice-r025/../gas-r001",
    "/etc/passwd",
    "https://example.com",
    "ice-r025%2f..",
    "ice-r025\\..",
    "ice-r025?x=1",
    "ice-r025#x",
    "ice-r025\0",
    "unreviewed-r025",
    "ice-r0025",
  ])
    expect(() => referenceRevisionPath(bad)).toThrow();
  expect(() =>
    referenceDirectPaths(new URLSearchParams("kit=ice-r025&kit=gas-r005")),
  ).toThrow("Duplicate");
  expect(() =>
    referenceDirectPaths(new URLSearchParams("kit=%2e%2e%2fice-r025")),
  ).toThrow();
  expect(referenceAssetPath(direct.kitAssets, "ice-0-albedo.png")).toContain(
    "/ice-r025/ice-0-albedo.png",
  );
  for (const bad of [
    "../secret.png",
    "/secret.png",
    "https://x/a.png",
    "a.png?x",
    "a.svg",
    "sub/a.png",
  ])
    expect(() => referenceAssetPath(direct.kitAssets, bad)).toThrow();
});
it("NullEngine camera route records visible LOD and shared material identity without baseline or simulation", () => {
  const engine = new NullEngine({
      renderWidth: 1574,
      renderHeight: 907,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    }),
    scene = new Scene(engine),
    camera = new ArcRotateCamera("review", 0, 1, 4, Vector3.Zero(), scene),
    root = new TransformNode("body", scene),
    material = new PBRMaterial("native", scene),
    levels = [0, 1, 2].map((lod) => {
      const n = new TransformNode("lod", scene);
      n.parent = root;
      n.metadata = { role: "planet", lod };
      n.setEnabled(lod === 2);
      const mesh = new Mesh("native", scene);
      mesh.parent = n;
      mesh.material = material;
      mesh.metadata = {
        role: "planet",
        trianglePlacementRanges: [{ partId: "ground" }],
      };
      return n;
    });
  let active = 2;
  const recorder = createReferenceLODRecorder(scene, engine, camera, () => ({
    root,
    stats: () => ({ active, pendingBuilds: 0, retained: [0, 1, 2] }),
  }));
  try {
    recorder.start({
      now: 0,
      steps: [
        { projected: 24, durationMs: 100 },
        { projected: 280, durationMs: 100 },
        { projected: 24, durationMs: 100 },
      ],
    });
    recorder.beforeFrame(0);
    recorder.afterFrame(2);
    expect(recorder.snapshot().frames[0].projected).toBeCloseTo(24);
    levels[2].setEnabled(false);
    levels[0].setEnabled(true);
    active = 0;
    recorder.beforeFrame(150);
    recorder.afterFrame(153);
    expect(recorder.snapshot().frames[1].projected).toBeCloseTo(280);
    levels[0].setEnabled(false);
    levels[2].setEnabled(true);
    active = 2;
    recorder.beforeFrame(301);
    recorder.afterFrame(303);
    const report = recorder.snapshot();
    expect(report.running).toBe(false);
    expect(report.summary.blankFrames).toBe(0);
    expect(report.summary.multipleVisibleLODFrames).toBe(0);
    expect(report.frames[0].materialIds).toEqual(report.frames[2].materialIds);
    expect(
      report.frames[1].materialsByLOD.every(
        (v) => v.ids[0] === material.uniqueId,
      ),
    ).toBe(true);
    expect(report.frames[1].renderSubmissionMs).toBe(3);
    expect(() =>
      recorder.start({ steps: [{ projected: 0, durationMs: 1 }] }),
    ).toThrow("route");
    expect(() =>
      recorder.start({ viewport: { width: 99999, height: 907 } }),
    ).toThrow("viewport");
  } finally {
    recorder.dispose();
    scene.dispose();
    engine.dispose();
  }
});
