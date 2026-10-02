import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { referenceInstrumentMaterial } from "./reference-instruments";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function base() {
  const engine = new NullEngine();
  engines.push(engine);
  return new PBRMaterial("shared-emitter", new Scene(engine));
}

describe("qualified reference instrument channels", () => {
  it("does not assign display art to unrelated emitters, optics or released revisions", () => {
    const material = base(),
      count = material.getScene().materials.length;
    for (const revision of ["legacy", "r001", "r003"])
      expect(
        referenceInstrumentMaterial(
          material,
          { revision, id: "console.navigation.t1", slot: "emit_a" },
          {},
        ),
      ).toBe(material);
    for (const id of [
      "drive.ion.t1",
      "door.airlock.t1",
      "lamp.room",
      "shipyard.equipment.crew-bunk",
      "shipyard.equipment.workshop-bank-r025.extra",
      "shipyard.equipment.medical-equipment-bank-r026",
    ])
      expect(
        referenceInstrumentMaterial(
          material,
          { revision: "r002", id, slot: "emit_a" },
          {},
        ),
      ).toBe(material);
    expect(
      referenceInstrumentMaterial(
        material,
        { revision: "r002", id: "console.navigation.t1", slot: "emit_b" },
        {},
      ),
    ).toBe(material);
    expect(material.getScene().materials.length).toBe(count);
    expect(material.emissiveTexture).toBeNull();
  });
  it("rejects unsupported display UVs before creating texture or material resources", () => {
    const material = base(),
      scene = material.getScene();
    const count = scene.materials.length,
      textures = scene.textures.length;
    const selection = {
      revision: "r002",
      id: "shipyard.equipment.bridge-bank",
      slot: "emit_a",
    } as const;
    for (const uvs of [
      undefined,
      [0, 1],
      [0, 0, 1, 0, NaN, 1],
      [0, 0, 1, 0, 2, 1],
    ])
      expect(() =>
        referenceInstrumentMaterial(material, selection, { uvs }),
      ).toThrow(/display UVs/);
    expect(() =>
      referenceInstrumentMaterial(material, selection, {
        uvs: [0, 0, 1, 0, 1, 1],
        uvsComplete: false,
      }),
    ).toThrow(/display UVs/);
    expect(scene.materials.length).toBe(count);
    expect(scene.textures.length).toBe(textures);
  });
  it("qualifies only the exact workshop console ID with the existing guarded systems path", () => {
    const material = base(),
      scene = material.getScene();
    const textures = scene.textures.length,
      materials = scene.materials.length;
    expect(() =>
      referenceInstrumentMaterial(
        material,
        {
          revision: "r002",
          id: "pale-studless.console.standard",
          slot: "emit_a",
        },
        { uvs: [0, 0, 1, 0, 2, 1], uvsComplete: true },
      ),
    ).toThrow(/display UVs/);
    for (const id of [
      "pale-studless.console.standard.extra",
      "pale-studless.console.other",
    ])
      expect(
        referenceInstrumentMaterial(
          material,
          { revision: "r002", id, slot: "emit_a" },
          {},
        ),
      ).toBe(material);
    for (const revision of ["legacy", "r001"])
      expect(
        referenceInstrumentMaterial(
          material,
          { revision, id: "pale-studless.console.standard", slot: "emit_a" },
          {},
        ),
      ).toBe(material);
    expect(
      referenceInstrumentMaterial(
        material,
        {
          revision: "r002",
          id: "pale-studless.console.standard",
          slot: "emit_b",
        },
        {},
      ),
    ).toBe(material);
    expect(scene.textures.length).toBe(textures);
    expect(scene.materials.length).toBe(materials);
  });
  it("keeps both R025 room displays behind the existing revision, slot and complete UV guards", () => {
    const material = base(),
      scene = material.getScene(),
      materials = scene.materials.length,
      textures = scene.textures.length;
    for (const id of [
      "shipyard.equipment.workshop-bank-r025",
      "shipyard.equipment.medical-equipment-bank-r025",
    ]) {
      for (const uvs of [
        undefined,
        [0, 1],
        [0, 0, 1, 0, NaN, 1],
        [0, 0, 1, 0, 2, 1],
      ])
        expect(() =>
          referenceInstrumentMaterial(
            material,
            { revision: "r002", id, slot: "emit_a" },
            { uvs },
          ),
        ).toThrow(/display UVs/);
      expect(() =>
        referenceInstrumentMaterial(
          material,
          { revision: "r002", id, slot: "emit_a" },
          { uvs: [0, 0, 1, 0, 1, 1], uvsComplete: false },
        ),
      ).toThrow(/display UVs/);
      for (const revision of ["legacy", "r001"])
        expect(
          referenceInstrumentMaterial(
            material,
            { revision, id, slot: "emit_a" },
            {},
          ),
        ).toBe(material);
      expect(
        referenceInstrumentMaterial(
          material,
          { revision: "r002", id, slot: "emit_b" },
          {},
        ),
      ).toBe(material);
    }
    expect(scene.materials.length).toBe(materials);
    expect(scene.textures.length).toBe(textures);
  });
  it("shares the existing systems atlas and material with the exact workshop ID", () => {
    const material = base(),
      scene = material.getScene();
    const context = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "measureText" ? () => ({ width: 1 }) : () => undefined,
        set: () => true,
      },
    );
    const canvas = {
      width: 1,
      height: 1,
      getContext: () => context,
      remove: () => undefined,
    };
    const spy = vi
      .spyOn(scene.getEngine(), "createCanvas")
      .mockReturnValue(
        canvas as unknown as ReturnType<
          ReturnType<typeof scene.getEngine>["createCanvas"]
        >,
      );
    try {
      const channels = { uvs: [0, 0, 1, 0, 1, 1, 0, 1], uvsComplete: true };
      const systems = referenceInstrumentMaterial(
        material,
        { revision: "r002", id: "console.workshop.t1", slot: "emit_a" },
        channels,
      );
      const textures = scene.textures.length,
        materials = scene.materials.length;
      const workshop = referenceInstrumentMaterial(
        material,
        {
          revision: "r002",
          id: "pale-studless.console.standard",
          slot: "emit_a",
        },
        channels,
      );
      expect(workshop).toBe(systems);
      expect(workshop.emissiveTexture).toBe(systems.emissiveTexture);
      for (const id of [
        "shipyard.equipment.workshop-bank-r025",
        "shipyard.equipment.medical-equipment-bank-r025",
      ]) {
        const room = referenceInstrumentMaterial(
          material,
          { revision: "r002", id, slot: "emit_a" },
          channels,
        );
        expect(room).toBe(systems);
        expect(room.emissiveTexture).toBe(systems.emissiveTexture);
      }
      expect(scene.textures.length).toBe(textures);
      expect(scene.materials.length).toBe(materials);
      expect(workshop.imageProcessingConfiguration).toBe(
        material.imageProcessingConfiguration,
      );
      expect(workshop.reflectionTexture).toBe(material.reflectionTexture);
    } finally {
      spy.mockRestore();
    }
  });
});
