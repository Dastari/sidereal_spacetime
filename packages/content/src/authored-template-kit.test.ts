import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shapeTileLocalPolygon } from "./construction-grammar";
import {
  AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
  AUTHORED_TEMPLATE_SHAPES,
  readAuthoredTemplateKit,
} from "./authored-template-kit";

const base = new URL(
  "../../../assets/runtime/ship-study/template-authored-r001/",
  import.meta.url,
);
const bytes = readFileSync(new URL("manifest.json", base));
const raw = JSON.parse(bytes.toString());

describe("complete source-derived authored template kit", () => {
  it("pins every complete native GLB, source material family and triangle", () => {
    const kit = readAuthoredTemplateKit(raw);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
    );
    expect(kit.pieces).toHaveLength(115);
    for (const piece of kit.pieces) {
      const bytes = readFileSync(new URL(piece.file, base));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        piece.sha256,
      );
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      const gltf = JSON.parse(
        bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
      );
      expect(
        new Set(gltf.materials.map((m: { name: string }) => m.name)).size,
      ).toBe(gltf.materials.length);
      const primitives = gltf.meshes.flatMap(
        (m: { primitives: { indices: number }[] }) => m.primitives,
      );
      expect(
        primitives.reduce(
          (sum: number, p: { indices: number }) =>
            sum + gltf.accessors[p.indices].count / 3,
          0,
        ),
      ).toBe(piece.triangles);
      for (const material of gltf.materials) {
        expect(piece.materials).toContain(material.name);
        expect(material.extras.family).toBe(kit.palette[material.name].family);
      }
      expect(piece.source.length).toBeGreaterThan(0);
    }
  });

  it("covers exact grammar polygons and protects existing walking bands", () => {
    const kit = readAuthoredTemplateKit(raw);
    for (const shape of AUTHORED_TEMPLATE_SHAPES) {
      if (shape === "arc1c") continue;
      const expected = shapeTileLocalPolygon(shape);
      for (const finish of ["plate", "grate"])
        expect(
          raw.pieces.find(
            (p: { id: string }) => p.id === `floor.${shape}.${finish}`,
          ).polygon,
        ).toEqual(expected);
    }
    for (const piece of kit.pieces) {
      if (piece.id.startsWith("wall.")) {
        expect(piece.boundsMin[1]).toBeGreaterThanOrEqual(-0.125001);
        expect(piece.boundsMax[1]).toBeLessThanOrEqual(0.125001);
      }
      if (piece.id.startsWith("hull.straight."))
        expect(piece.boundsMin[1]).toBeGreaterThanOrEqual(-0.250001);
      if (piece.normalizedHeight) {
        expect(piece.boundsMin[2]).toBeCloseTo(0, 5);
        expect(piece.boundsMax[2]).toBeCloseTo(1, 5);
      }
    }
    expect(
      raw.pieces.every(
        (p: { qualification: { openBoundaryEdges: number } }) =>
          p.qualification.openBoundaryEdges === 0,
      ),
    ).toBe(true);
  });

  it("pins bounded source-strip lighting to the corresponding final mesh", () => {
    const kit = readAuthoredTemplateKit(raw);
    expect(raw.lighting.schema).toBe("authored-asset-lighting/v1");
    expect(raw.lighting.assets).toHaveLength(kit.pieces.length);
    for (const asset of raw.lighting.assets) {
      expect(kit.pieces.find((p) => p.id === asset.id)?.sha256).toBe(
        asset.sha256,
      );
      expect(asset.sockets.length).toBeLessThanOrEqual(1);
      for (const socket of asset.sockets) {
        expect(socket.intensity).toBeLessThanOrEqual(0.5);
        expect(socket.range).toBeLessThanOrEqual(2);
        expect(socket.position.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("retains dark recesses and native light armor across every roof shape", () => {
    for (const shape of AUTHORED_TEMPLATE_SHAPES) {
      const pieces = ["plate", "light", "accent"].map((finish) =>
        raw.pieces.find(
          (p: { id: string }) => p.id === `roof.${shape}.${finish}`,
        ),
      );
      expect(pieces.map((p) => p.triangles)).toEqual([
        pieces[0].triangles,
        pieces[0].triangles,
        pieces[0].triangles,
      ]);
      expect(pieces[1].boundsMin).toEqual(pieces[0].boundsMin);
      expect(pieces[1].boundsMax).toEqual(pieces[0].boundsMax);
      expect(pieces[1].materials).toContain("primary");
      expect(pieces[1].materials).toContain("dark");
      expect(pieces[2].materials).toContain("accent");
      expect(
        pieces[1].source.some((s: { id: string }) => s.id === "roof.small.box"),
      ).toBe(true);
    }
    for (const [module, height] of [
      ["vent", 0.141],
      ["hatch", 0.185],
      ["fan", 0.225],
      ["box", 0.34],
    ] as const) {
      const piece = raw.pieces.find(
        (p: { id: string }) => p.id === `roof.square.${module}`,
      );
      expect(piece.occupancy).toEqual([1, 1]);
      expect(piece.topDatum).toBe(0);
      expect(piece.boundsMax[2]).toBeCloseTo(height, 5);
      expect(
        piece.source.some(
          (s: { id: string }) => s.id === `roof.small.${module}`,
        ),
      ).toBe(true);
    }
    expect(
      raw.pieces.find((p: { id: string }) => p.id === "roof.square.hatch")
        .materials,
    ).toContain("accent");
  });

  it.each([
    (d: typeof raw) => d.pieces.pop(),
    (d: typeof raw) => (d.pieces[0].file = "../other.glb"),
    (d: typeof raw) => (d.pieces[0].sha256 = "unverified"),
    (d: typeof raw) => (d.pieces[0].boundsMin[0] = NaN),
    (d: typeof raw) => (d.pieces[0].frame = "ship-node-baked"),
    (d: typeof raw) => (d.pieces[0].source = []),
    (d: typeof raw) => (d.pieces[0].id = d.pieces[1].id),
    (d: typeof raw) => (d.palette.primary.family = "unknown"),
  ])("rejects incomplete, ambiguous or invalid asset admission", (mutate) => {
    const altered = structuredClone(raw);
    mutate(altered);
    expect(() => readAuthoredTemplateKit(altered)).toThrow(
      /Invalid authored template kit/,
    );
  });
});
