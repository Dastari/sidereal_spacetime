import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/loaders/glTF";
import { loadInstalledEquipment } from "./installed-equipment";
import { loadInstalledHull } from "./installed-hull";
import { loadInstalledModules } from "./installed-modules";
import { createShipLighting } from "./ship-lighting";
import { setMeshRole } from "./mesh-roles";
import { legacyMeshRole } from "./legacy-mesh-role";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Real published geometry and loaders; only HTTP transport is substituted.
 * No fake box prototypes: extra GLB primitives/materials must fail this budget.
 * This is the installed ship budget, excluding crew, planets, UI and remote ships.
 * Browser counts (including draw calls) remain a separate hardware gate.
 */
test("installed ship loader resource budget", async () => {
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      width = 512;
      height = 256;
      getContext() {
        return {
          clearRect() {},
          fillText() {},
          beginPath() {},
          arc() {},
          fill() {},
          ellipse() {},
          stroke() {},
        };
      }
    },
  );
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const ship = new TransformNode("ship", scene);
  const bytes = (url: string) =>
    new Uint8Array(
      readFileSync("assets/runtime/" + url.replace("/assets/", "")),
    );
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => JSON.parse(new TextDecoder().decode(bytes(url))),
  }));
  const importMesh = SceneLoader.ImportMeshAsync.bind(SceneLoader);
  vi.spyOn(SceneLoader, "ImportMeshAsync").mockImplementation(
    (names, root, file, target, progress) => {
      if (typeof file !== "string") throw Error("Unexpected loader transport");
      return importMesh(
        names,
        "",
        bytes(root + file),
        target,
        progress,
        ".glb",
      );
    },
  );
  try {
    const base = await SceneLoader.ImportMeshAsync(
      "",
      "/assets/voxels/",
      "wayfarer.glb",
      scene,
    );
    for (const mesh of base.meshes) setMeshRole(mesh, legacyMeshRole(mesh));
    const equipment = await loadInstalledEquipment(scene, ship, base.meshes);
    const cargo = await loadInstalledModules(scene, ship, "cargo");
    const floor = await loadInstalledModules(scene, ship, "floor");
    const hull = await loadInstalledHull(scene, ship);
    const meshes = [
      ...equipment.meshes,
      ...cargo.meshes,
      ...floor.meshes,
      ...hull.meshes,
    ];
    createShipLighting(scene, ship, meshes);
    const counts = {
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      lights: scene.lights.length,
      shadowGenerators: scene.lights.filter((l) => l.getShadowGenerator())
        .length,
    };
    // R0 inventory: 1,303 meshes, 182 materials, 45 lights, 8 generators.
    expect(counts.meshes).toBeLessThanOrEqual(1360);
    expect(counts.materials).toBeLessThanOrEqual(190);
    expect(counts.lights).toBeLessThanOrEqual(48);
    expect(counts.shadowGenerators).toBeLessThanOrEqual(8);
    expect(equipment.placements.length).toBeGreaterThan(0);
    expect(hull.placements.length).toBeGreaterThan(0);
    expect(floor.placements.length).toBeGreaterThan(0);
    for (const p of [
      ...equipment.placements,
      ...cargo.placements,
      ...floor.placements,
      ...hull.placements,
    ])
      for (const m of p.meshes) {
        expect(m.metadata.role).toBeTruthy();
        expect(m.metadata.partId).toBe(p.node.metadata.partId);
      }
  } finally {
    scene.dispose();
    engine.dispose();
  }
}, 120000);

import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../../sim/src/wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "../../sim/src/wayfarer-walking-bindings";
import { planConstructionInstance } from "../../sim/src/construction-instance";
import {
  loadConstructionInstance,
  createConstructionLighting,
} from "./construction-instance";
import { meshesByRole } from "./mesh-roles";

test("current semantic Wayfarer loader resource budget and complete role attribution", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const root = new TransformNode("ship", scene);
  const bytes = (url: string) =>
    new Uint8Array(
      readFileSync("assets/runtime/" + url.replace("/assets/", "")),
    );
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => JSON.parse(new TextDecoder().decode(bytes(url))),
    text: async () => new TextDecoder().decode(bytes(url)),
    arrayBuffer: async () => bytes(url).buffer,
  }));
  const original = SceneLoader.ImportMeshAsync.bind(SceneLoader);
  vi.spyOn(SceneLoader, "ImportMeshAsync").mockImplementation(
    (names, folder, file, scene, progress) =>
      original(names, "", bytes(folder + file), scene, progress, ".glb"),
  );
  try {
    const candidate = createWayfarerConversionCandidate(
      Object.fromEntries(
        Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
      ) as WayfarerPinnedInputs,
    );
    let n = 0;
    const plan = planConstructionInstance(
      candidate.snapshot,
      {
        blueprintRevisionId: "render-budget",
        expectedBlueprintSha256: candidate.snapshot.sha256,
        sourceDeckId: PIN.deckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0.05,
        partitionHalfWidthM: 0.05,
        objectCollisionBindings: qualifiedWayfarerWalkingBindings(
          candidate.snapshot,
          0.3,
          1.8,
        ),
      },
      () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`,
    );
    const ship = await loadConstructionInstance(scene, root, {
      instanceId: plan.document.layout.id,
      deckId: plan.spawn.deckId,
      documentJson: JSON.stringify(plan.document),
    });
    createConstructionLighting(scene, ship.meshes);
    expect(scene.meshes.length).toBeLessThanOrEqual(1630);
    expect(scene.materials.length).toBeLessThanOrEqual(181);
    expect(scene.lights.length).toBeLessThanOrEqual(2);
    expect(
      scene.lights.filter((l) => l.getShadowGenerator()).length,
    ).toBeLessThanOrEqual(1);
    expect(meshesByRole(scene).unclassified.total).toBe(0);
    for (const placement of ship.placements)
      for (const mesh of placement.meshes)
        expect(mesh.metadata.partId).toBe(placement.node.metadata.partId);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}, 120000);
