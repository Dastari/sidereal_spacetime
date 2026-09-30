import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { referenceSurfaceMaterial } from "./reference-finish";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function fixture() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const base = new PBRMaterial("released-plastic", scene);
  base.albedoColor = new Color3(0.6, 0.6, 0.63);
  base.roughness = 0.32;
  base.metallic = 0;
  base.indexOfRefraction = 1.46;
  base.environmentIntensity = 0.55;
  base.clearCoat.isEnabled = true;
  base.clearCoat.intensity = 0.08;
  base.imageProcessingConfiguration = new ImageProcessingConfiguration();
  base.metadata = { moldedFinish: "plastic-light" };
  return { scene, base };
}

describe("reference candidate pigment isolation", () => {
  it("keeps released revisions, faction pigments and optics/emission identical", () => {
    const { scene, base } = fixture();
    const count = scene.materials.length;
    for (const revision of ["legacy", "r001", "r003"])
      expect(
        referenceSurfaceMaterial(base, {
          revision,
          profile: "federation",
          role: "hull",
          slot: "primary",
        }),
      ).toBe(base);
    for (const slot of ["glass", "emit_a", "emit_b", "metal", "dark"] as const)
      expect(
        referenceSurfaceMaterial(base, {
          revision: "r002",
          profile: "federation",
          role: "hull",
          slot,
        }),
      ).toBe(base);
    expect(scene.materials.length).toBe(count);
    for (const profile of ["riftjack", "aurelian"] as const) {
      const candidate = referenceSurfaceMaterial(base, {
        revision: "r002",
        profile,
        role: "hull",
        slot: "primary",
      });
      expect(candidate).not.toBe(base);
      expect(candidate.albedoColor.asArray()).toEqual(
        base.albedoColor.asArray(),
      );
      expect(candidate.metadata.shipReferenceFinish.profile).toBe(profile);
    }
  });

  it("pools candidate pigments without changing the borrowed plastic material or its response", () => {
    const { scene, base } = fixture();
    const selection = {
      revision: "r002",
      profile: "federation",
      role: "hull",
      slot: "primary",
    } as const;
    const candidate = referenceSurfaceMaterial(base, selection);
    expect(candidate).not.toBe(base);
    expect(referenceSurfaceMaterial(base, selection)).toBe(candidate);
    for (const role of ["equipment", "roof", "object"]) {
      expect(referenceSurfaceMaterial(base, { ...selection, role })).toBe(
        candidate,
      );
    }
    const wall = referenceSurfaceMaterial(base, { ...selection, role: "wall" });
    expect(wall).not.toBe(candidate);
    expect(wall.albedoColor.asArray()).not.toEqual(
      candidate.albedoColor.asArray(),
    );
    expect(base.albedoColor.asArray()).toEqual([0.6, 0.6, 0.63]);
    expect(candidate.albedoColor.asArray()).not.toEqual(
      base.albedoColor.asArray(),
    );
    expect(candidate.roughness).toBe(base.roughness);
    expect(candidate.metallic).toBe(base.metallic);
    expect(candidate.indexOfRefraction).toBe(base.indexOfRefraction);
    expect(candidate.environmentIntensity).toBe(base.environmentIntensity);
    expect(candidate.clearCoat.intensity).toBe(base.clearCoat.intensity);
    expect(candidate.imageProcessingConfiguration).toBe(
      base.imageProcessingConfiguration,
    );
    expect(candidate.metadata.moldedFinish).toBe("plastic-light");
    const floor = referenceSurfaceMaterial(base, {
      ...selection,
      role: "floor",
    });
    expect(floor).not.toBe(candidate);
    expect(floor.albedoColor.r).toBeLessThan(candidate.albedoColor.r);
    let disposed = false;
    candidate.onDisposeObservable.addOnce(() => {
      disposed = true;
    });
    scene.dispose();
    expect(disposed).toBe(true);
    expect(scene.materials).not.toContain(candidate);
  });

  it("separates explicitly authored textiles from the same slot's plastic housing", () => {
    const { base } = fixture();
    const selection = {
      revision: "r002",
      profile: "federation",
      role: "equipment",
      slot: "primary",
    } as const;
    const housing = referenceSurfaceMaterial(base, selection);
    const cushion = referenceSurfaceMaterial(base, {
      ...selection,
      materialName: "slot0_primary.fabric.001",
    });
    expect(cushion).not.toBe(housing);
    // Ship batching groups by material name; textile and housing must never share that key.
    expect(cushion.name).not.toBe(housing.name);
    expect(cushion.metadata.moldedFinish).toBe("fabric");
    expect(cushion.roughness ?? 0).toBeGreaterThan(housing.roughness ?? 0);
    expect(cushion.clearCoat.isEnabled).toBe(false);
    expect(housing.clearCoat.isEnabled).toBe(true);
    expect(base.metadata.moldedFinish).toBe("plastic-light");
    expect(
      referenceSurfaceMaterial(base, {
        ...selection,
        revision: "r001",
        materialName: "slot0_primary.fabric",
      }),
    ).toBe(base);
    expect(
      referenceSurfaceMaterial(base, {
        ...selection,
        profile: "aurelian",
        materialName: "slot0_primary.fabric",
      }).metadata.moldedFinish,
    ).toBe("fabric");
  });
});
