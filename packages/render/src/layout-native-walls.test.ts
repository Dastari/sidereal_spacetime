import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { CONSTRUCTION_BOUNDARY_FAMILY_GLB_SHA } from "@sidereal/content/construction-boundary-family";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES as kit } from "@sidereal/content/construction-boundary-family";
import {
  createLayoutNativeWalls,
  planLayoutNativeWalls,
  LAYOUT_NATIVE_WALL_DATUM,
} from "./layout-native-walls";
import type { LayoutStructuralGuide } from "./layout-structural-guides";
function fixture(): LayoutStructuralGuide {
  const d = emptyLayout("preview", "main");
  d.tiles = [
    stampTile("a", "main", "rectangle", [0, 0]),
    stampTile("b", "main", "rectangle", [64, 0]),
  ];
  return {
    walls: compileLayout(d).walls,
    deckId: "main",
    elevationUnits: 128,
    heightUnits: 96,
  };
}
function library(scene: Scene) {
  const container = new AssetContainer(scene);
  for (const part of kit.parts)
    container.meshes.push(
      CreateBox(part.native.nodePrefix, { size: 0.1 }, scene),
    );
  container.removeAllFromScene();
  return container;
}
describe("native authoring wall fit preview", () => {
  it("uses the exact installed native GLB and selectors for the pinned profile family", () => {
    const bytes = readFileSync(
      "assets/runtime/construction/boundary-r004/kit.glb",
    );
    expect(constructionHash(bytes)).toBe(CONSTRUCTION_BOUNDARY_FAMILY_GLB_SHA);
    const length = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
    const names = new Set(gltf.nodes.map((n: { name: string }) => n.name));
    for (const part of kit.parts)
      expect(names.has(part.native.nodePrefix)).toBe(true);
    for (const mesh of gltf.meshes)
      for (const primitive of mesh.primitives) {
        expect(primitive.attributes.NORMAL).toBeDefined();
        expect(primitive.material).toBeDefined();
      }
  });
  it("marks a proper four-way crossing as an unsupported native node", () => {
    const input = fixture();
    input.walls = [
      {
        key: "horizontal",
        anchorId: "h",
        source: "partition",
        deckId: "main",
        a: [0, 64],
        b: [128, 64],
      },
      {
        key: "vertical",
        anchorId: "v",
        source: "partition",
        deckId: "main",
        a: [64, 0],
        b: [64, 128],
      },
    ];
    const plan = planLayoutNativeWalls(input);
    expect(plan.issues.some((i) => i.key === "node:64,64")).toBe(true);
    expect(plan.placements.filter((p) => p.kind === "span")).toHaveLength(4);
    expect(
      plan.placements.some(
        (p) =>
          p.kind === "node" &&
          p.originUnits[0] === 64 &&
          p.originUnits[1] === 64,
      ),
    ).toBe(false);
  });

  it("matches closed generated perimeter using actual kit profiles and diagnoses exterior datum mismatch", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const plan = planLayoutNativeWalls(input);
    expect(plan.placements.filter((p) => p.kind === "node")).toHaveLength(6);
    expect(plan.placements.filter((p) => p.kind === "span")).toHaveLength(6);
    expect(plan.issues.map((i) => i.key)).toEqual(["exterior-alignment"]);
    expect(LAYOUT_NATIVE_WALL_DATUM.coreThicknessM).toBe(0.09375);
    expect(LAYOUT_NATIVE_WALL_DATUM.decorativeEnvelopeM).toBe(0.125);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("retains full native wall height rather than stretching it to the Wayfarer ceiling", () => {
    const plan = planLayoutNativeWalls({ ...fixture(), heightUnits: 82 });
    expect(plan.placements).toHaveLength(12);
    expect(plan.issues.find((i) => i.key === "height")?.message).toContain(
      "2.5625 m",
    );
    expect(plan.fitApproved).toBe(false);
  });
  it("splits a long internal grid wall at exact module seams and emits supported T junctions", () => {
    const input = fixture();
    input.walls = [
      ...input.walls,
      {
        key: "partition",
        anchorId: "partition",
        source: "partition",
        deckId: "main",
        a: [0, 32],
        b: [128, 32],
      },
    ];
    // The end T junctions and resulting one-metre side spans match native profiles.
    const plan = planLayoutNativeWalls(input);
    expect(
      plan.placements.filter((p) => p.partId === "node-b4c788600641"),
    ).toHaveLength(2);
    expect(
      plan.placements.filter(
        (p) =>
          p.kind === "span" && p.originUnits[1] === 32 && p.quarterTurns === 0,
      ),
    ).toHaveLength(2);
    expect(plan.issues.map((i) => i.key)).toEqual(["exterior-alignment"]);
  });
  it("uses native diagonal corner and span profiles for a triangular floor", () => {
    const d = emptyLayout("diagonal", "main");
    d.tiles = [stampTile("tri", "main", "triangle", [0, 0])];
    const plan = planLayoutNativeWalls({
      ...fixture(),
      walls: compileLayout(d).walls,
    });
    expect(plan.placements).toHaveLength(6);
    expect(plan.issues.map((i) => i.key)).toEqual(["exterior-alignment"]);
  });
  it("never bridges a compiled opening or stretches an unsupported length", () => {
    const walls: LayoutStructuralGuide["walls"] = [
      {
        key: "left",
        anchorId: "p",
        source: "partition",
        deckId: "main",
        a: [0, 0],
        b: [32, 0],
      },
      {
        key: "right",
        anchorId: "p",
        source: "partition",
        deckId: "main",
        a: [64, 0],
        b: [80, 0],
      },
    ];
    const plan = planLayoutNativeWalls({ ...fixture(), walls });
    expect(plan.placements.filter((p) => p.kind === "span")).toHaveLength(1);
    expect(plan.placements[0].originUnits).toEqual([0, 0]);
    expect(plan.issues.some((i) => i.key === "span:64,0:80,0")).toBe(true);
  });
  it("loads the library once, reuses clones across camera/layer changes and disposes safely", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    let loads = 0;
    const view = createLayoutNativeWalls(
      scene,
      () => {},
      async (s) => {
        loads++;
        return library(s);
      },
    );
    view.update(fixture(), true);
    await view.ready();
    expect(view.meshes).toHaveLength(12);
    const mesh = view.meshes[0];
    view.update(fixture(), false, [5, 2, -9]);
    expect(view.meshes[0]).toBe(mesh);
    expect(mesh.isEnabled()).toBe(false);
    expect(
      (
        mesh.parent
          ?.parent as import("@babylonjs/core/Meshes/transformNode").TransformNode
      ).position.asArray(),
    ).toEqual([-5, -2, 9]);
    view.update(fixture(), true);
    expect(mesh.isEnabled()).toBe(true);
    expect(loads).toBe(1);
    expect(mesh.isPickable).toBe(false);
    view.update(undefined, true);
    expect(view.meshes).toHaveLength(0);
    expect(mesh.isDisposed()).toBe(true);
    view.dispose();
    view.dispose();
    scene.dispose();
    engine.dispose();
  });
  it("drops an import that completes after viewport disposal", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    let resolve!: (value: AssetContainer) => void;
    const view = createLayoutNativeWalls(
      scene,
      () => {},
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    view.update(fixture(), true);
    const loaded = library(scene),
      source = loaded.meshes[0];
    view.dispose();
    resolve(loaded);
    await view.ready();
    expect(source.isDisposed()).toBe(true);
    expect(view.meshes).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });
});
