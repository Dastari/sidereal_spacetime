import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { composeToxicReference } from "./toxic_reference_composition_r004";
import {
  toxicFogAnchors,
  composeToxicReferenceWeather,
  type ToxicBodyBatch,
} from "./toxic_fog_reference_integration";
import { createToxicReferenceWeatherMaterial } from "./toxic_fog_reference_material";
const load = (folder: string) =>
    JSON.parse(
      readFileSync(
        `output/playwright/planet-reference-20260914/${folder}/kit.json`,
        "utf8",
      ),
    ),
  body = load("toxic-r004"),
  fog = load("toxic-fog-r005");
it("anchors weather to explicit chemical placement ranges consistently through LODs, preserving UVs", () => {
  const a = composeToxicReference(body, 38, 0),
    b = composeToxicReference(body, 38, 2),
    anchors = toxicFogAnchors(a, [8]);
  expect(anchors).toHaveLength(12);
  expect(new Set(anchors.map((a) => a.partId)).size).toBe(12);
  const wa = composeToxicReferenceWeather(fog, 38, 0.5, a, [8]),
    wb = composeToxicReferenceWeather(fog, 38, 0.5, b, [8]);
  expect(wa).toEqual(wb);
  expect(wa!.ranges).toHaveLength(6);
  expect(wa!.uvs.length).toBe((wa!.positions.length / 3) * 2);
  for (const range of wa!.ranges)
    expect(anchors.some((a) => "toxic-fog:" + a.partId === range.partId)).toBe(
      true,
    );
  expect(composeToxicReferenceWeather(fog, 38, 0, a, [8])).toBeUndefined();
  expect(composeToxicReferenceWeather(fog, 38, 1, [], [])).toBeUndefined();
});
it("rejects invalid role/range and excessive anchors instead of falling back to unrelated limb positions", () => {
  const batch: ToxicBodyBatch = {
    positions: [1, 0, 0, 1, 0.1, 0, 1, 0, 0.1],
    indices: [0, 1, 2],
    ranges: [{ partId: "vent", firstTriangle: 0, triangleCount: 1 }],
  };
  expect(() => toxicFogAnchors([batch], [2])).toThrow("Missing");
  expect(() =>
    toxicFogAnchors(
      [
        {
          ...batch,
          ranges: [{ partId: "vent", firstTriangle: 0, triangleCount: 2 }],
        },
      ],
      [0],
    ),
  ).toThrow("range");
  expect(() =>
    toxicFogAnchors(
      [
        {
          ...batch,
          ranges: Array.from({ length: 13 }, (_, i) => ({
            partId: "vent-" + i,
            firstTriangle: 0,
            triangleCount: 1,
          })),
        },
      ],
      [0],
    ),
  ).toThrow("budget");
  expect(toxicFogAnchors([batch], [0])).toEqual(
    toxicFogAnchors([batch], [0, 0]),
  );
});
it("NullEngine preserves native alpha PBR, correct weather texture prefix and shared LOD material", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const calls: unknown[][] = [];
    const texture = new Texture(null, scene);
    texture.hasAlpha = true;
    texture.gammaSpace = true;
    const material = await createToxicReferenceWeatherMaterial(
      scene,
      fog.materials[0],
      async (...args) => {
        calls.push(args);
        return texture;
      },
    );
    expect(calls[0][0]).toBe("toxic-fog-density.png");
    expect(calls[0].slice(2)).toEqual([
      false,
      true,
      "/planet-reference-weather-assets/",
    ]);
    expect(material.needAlphaBlending()).toBe(true);
    expect(material.useAlphaFromAlbedoTexture).toBe(true);
    expect(material.albedoColor.asArray()).toEqual([1, 1, 1]);
    expect(material.subSurface.isTranslucencyEnabled).toBe(false);
    expect(material.directIntensity).toBe(1);
    const geometry = composeToxicReferenceWeather(
      fog,
      38,
      0.1,
      composeToxicReference(body, 38, 0),
      [8],
    )!;
    const meshes = [0, 1].map((lod) => {
      const mesh = new Mesh("fog", scene);
      mesh.metadata = { role: "planet", planetWeather: true, lod };
      const data = new VertexData();
      Object.assign(data, geometry);
      data.applyToMesh(mesh);
      mesh.material = material;
      expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);
      return mesh;
    });
    meshes[0].dispose(false, false);
    expect(meshes[1].material).toBe(material);
    expect(material.albedoTexture).toBe(texture);
    meshes[1].dispose(false, false);
    material.dispose();
    texture.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
