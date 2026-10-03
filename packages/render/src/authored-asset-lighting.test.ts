import { Light } from "@babylonjs/core/Lights/light";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { createLocalLightBudget } from "./local-light-budget";
import { readAuthoredGlb } from "./prefab-ship/wayfarer-authored-study";
import {
  authoredHaloColor,
  createAuthoredAssetLighting,
  getAuthoredAssetLightSources,
  readAuthoredAssetLighting,
  type AuthoredAssetLighting,
} from "./authored-asset-lighting";

const base = new URL("../../../assets/runtime/ship-study/", import.meta.url);
const descriptor = JSON.parse(
  readFileSync(
    new URL("wayfarer-object-lighting-r002/descriptor.json", base),
    "utf8",
  ),
);

test("all reusable descriptor emission factors/strengths and source pins equal immutable GLB bytes", () => {
  const assets = readAuthoredAssetLighting(descriptor);
  expect(assets.size).toBe(54);
  const manifest = JSON.parse(
    readFileSync(new URL("wayfarer-authored-r001/manifest.json", base), "utf8"),
  );
  for (const asset of assets.values()) {
    const piece = manifest.pieces.find(
      (p: { sha256: string }) => p.sha256 === asset.sha256,
    );
    expect(piece).toBeDefined();
    const source = readAuthoredGlb(
      new Uint8Array(
        readFileSync(new URL(`wayfarer-authored-r001/${piece.file}`, base)),
      ),
      asset.sha256,
    ).json;
    const materials = source.materials as {
      name: string;
      emissiveFactor?: number[];
      extensions?: {
        KHR_materials_emissive_strength?: { emissiveStrength: number };
      };
    }[];
    for (const [name, emission] of Object.entries(asset.emissions)) {
      const material = materials.find((m) => m.name === name)!;
      expect(emission.factor).toEqual(material.emissiveFactor);
      expect(emission.strength).toBe(
        material.extensions?.KHR_materials_emissive_strength
          ?.emissiveStrength ?? 1,
      );
    }
  }
  expect([...assets.values()].filter((a) => a.sockets.length)).toHaveLength(5);
});

test("common HDR rolloff preserves hue, continuity and finite bounded radiance independent of object names", () => {
  const color = { r: 0.05, g: 0.48, b: 1 };
  let previous = 0;
  for (const strength of [0.1, 0.5, 1, 1 / 0.85, 2, 3, 5, 6, 1000]) {
    const value = authoredHaloColor(color, strength);
    expect(value[2]).toBeGreaterThan(previous);
    expect(value[2]).toBeLessThan(4);
    expect(value[0] / value[2]).toBeCloseTo(0.05);
    expect(value[1] / value[2]).toBeCloseTo(0.48);
    previous = value[2];
  }
  expect(authoredHaloColor(color, 1 / 0.85)[2]).toBeCloseTo(1);
});

test("generic standalone object sockets follow accepted transforms, retain stable budget sinks and dispose cleanly", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const parent = new TransformNode("standalone-object-world", scene);
  parent.position.set(100, 200, 300);
  const near = new Mesh("near-room-receiver", scene),
    otherRoom = new Mesh("other-room-receiver", scene);
  const asset: AuthoredAssetLighting = {
    id: "arbitrary-asset",
    sha256: "a".repeat(64),
    emissions: {},
    sockets: [
      {
        id: "own-socket",
        position: [1, 2, 3],
        color: [0.05, 0.48, 1],
        intensity: 0.35,
        range: 1.6,
      },
    ],
  };
  // Independent 90-degree Y rotation + translation: (x,y,z)->(10+z,20+y,30-x).
  const matrix = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 20, 30, 1];
  const rig = createAuthoredAssetLighting(scene, parent, [
    { id: "placed-fixture", matrix, asset, receivers: [near] },
  ]);
  const budget = createLocalLightBudget();
  const sources = getAuthoredAssetLightSources(scene);
  expect(sources).toHaveLength(1);
  expect(sources[0].position).toMatchObject({ x: 113, y: 222, z: 329 });
  expect(getAuthoredAssetLightSources(scene)[0].apply).toBe(sources[0].apply);
  expect(rig.lights[0].includedOnlyMeshes).toHaveLength(1);
  expect(rig.lights[0].includedOnlyMeshes[0]).toBe(near);
  expect(rig.lights[0].includedOnlyMeshes).not.toContain(otherRoom);
  budget.update(sources, { focus: { x: 113, y: 222, z: 329 } });
  expect(rig.lights[0].isEnabled()).toBe(true);
  expect(rig.lights[0].shadowEnabled).toBe(false);
  expect(rig.lights[0].falloffType).toBe(Light.FALLOFF_STANDARD);
  parent.position.x += 10;
  expect(getAuthoredAssetLightSources(scene)[0].position.x).toBe(123);
  rig.setEnabled(false);
  expect(getAuthoredAssetLightSources(scene)[0].eligible).toBe(false);
  expect(rig.lights[0].isEnabled()).toBe(false);
  rig.dispose();
  expect(getAuthoredAssetLightSources(scene)).toEqual([]);
  expect(rig.lights[0].isDisposed()).toBe(true);
  // A tombstoned placement list registers neither a socket nor an object node.
  const empty = createAuthoredAssetLighting(scene, parent, []);
  expect(empty.lights).toEqual([]);
  expect(getAuthoredAssetLightSources(scene)).toEqual([]);
  empty.dispose();
  budget.dispose();
  scene.dispose();
  engine.dispose();
});

test("fixture cones rotate with the asset and exclude the opposite wall hemisphere", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const parent = new TransformNode("arbitrary-fixture-context", scene);
  const fixture = [...readAuthoredAssetLighting(descriptor).values()].find(
    (asset) => asset.sockets.some((socket) => socket.direction),
  )!;
  const matrix = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 20, 30, 1];
  const rig = createAuthoredAssetLighting(scene, parent, [
    { id: "rotated-fixture", matrix, asset: fixture, receivers: [] },
  ]);
  parent.computeWorldMatrix(true);
  rig.lights[0].parent!.computeWorldMatrix(true);
  const light = rig.lights[0] as SpotLight;
  expect(light).toBeInstanceOf(SpotLight);
  light.computeTransformedInformation();
  // Source outward -Z rotated 90 degrees about Y is world -X.
  expect(light.transformedDirection.x).toBeCloseTo(-1);
  expect(light.transformedDirection.y).toBeCloseTo(0);
  expect(light.transformedDirection.z).toBeCloseTo(0);
  expect(light.angle).toBeCloseTo(Math.PI * 0.8);
  expect(Math.cos(light.angle / 2)).toBeGreaterThan(0);
  expect(light.falloffType).toBe(Light.FALLOFF_STANDARD);
  // The parent owns disposal, including registry removal.
  parent.dispose();
  expect(getAuthoredAssetLightSources(scene)).toEqual([]);
  expect(light.isDisposed()).toBe(true);
  scene.dispose();
  engine.dispose();
});
