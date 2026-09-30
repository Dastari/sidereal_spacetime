import { afterEach, describe, expect, it } from "vitest";
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
});
