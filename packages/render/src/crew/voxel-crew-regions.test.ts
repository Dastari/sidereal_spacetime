import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/loaders/glTF";
import {
  createCrewRegionalLayers,
  partitionCrewTriangles,
  crewArmorClothRegions,
} from "./voxel-crew-regions";

const asset = new Uint8Array(
  readFileSync(
    new URL(
      "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
      import.meta.url,
    ),
  ),
);

describe("released body regional cloth", () => {
  it("draw ranges grow and shrink with partial/full coverage and body variant switches", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      asset,
      scene,
      undefined,
      ".glb",
    );
    container.addAllToScene();
    const helper = createCrewRegionalLayers(container.meshes);
    for (const variant of ["male", "female", "male"]) {
      for (const slots of [
        ["shoulders"],
        ["chest", "legs", "boots"],
        ["gloves"],
        ["chest", "legs", "boots"],
      ] as const) {
        helper.refresh(
          variant,
          false,
          crewArmorClothRegions(slots),
          false,
          new Set(),
        );
        for (const mesh of helper.meshes.filter((m) => m.isEnabled())) {
          expect(
            mesh.subMeshes.reduce((n, part) => n + part.indexCount, 0),
            mesh.name,
          ).toBe(mesh.getTotalIndices());
          expect(mesh.name).toContain(`-${variant}`);
        }
        if (slots.length === 3)
          expect(helper.meshes.filter((m) => m.isEnabled())).toHaveLength(7);
      }
    }
    expect(helper.meshes.length).toBeLessThanOrEqual(20);
    helper.dispose();
    container.dispose();
    scene.dispose();
    engine.dispose();
  });
  it("shares immutable derived geometry across cached body instances and releases it after the last wearer", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      asset,
      scene,
      undefined,
      ".glb",
    );
    container.addAllToScene();
    const sources = container.meshes.filter(
      (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
    );
    const copies = sources.map((m) => m.clone(m.name, null, true));
    const a = createCrewRegionalLayers(sources);
    const b = createCrewRegionalLayers(copies);
    const regions = crewArmorClothRegions(["chest"]);
    a.refresh("male", false, regions, false, new Set());
    b.refresh("male", false, regions, false, new Set());
    const ma = a.meshes.find(
      (m) =>
        m.name.includes("suit-male") &&
        m.metadata?.crewClothRegions?.includes("torso"),
    )!;
    const mb = b.meshes.find((m) => m.name === ma.name)!;
    expect(ma.geometry).toBe(mb.geometry);
    expect(ma.geometry).not.toBe(
      sources.find((m) => ma.name.startsWith(m.name))?.geometry,
    );
    const shared = mb.geometry!;
    const source = sources.find((m) => ma.name.startsWith(m.name))!;
    const vertex = source.getVertexBuffer("position")!.getBuffer()!;
    expect(shared.getVertexBuffer("position")!.getBuffer()).toBe(vertex);
    a.dispose();
    expect(shared.isDisposed()).toBe(false);
    expect(mb.getTotalIndices()).toBeGreaterThan(0);
    b.dispose();
    expect(shared.isDisposed()).toBe(true);
    expect(source.getVertexBuffer("position")!.getBuffer()).toBe(vertex);
    for (const m of copies) m.dispose(false, false);
    container.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("an absent or unclassifiable garment primitive retains base/privacy instead of trusting surviving accents", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      asset,
      scene,
      undefined,
      ".glb",
    );
    container.addAllToScene();
    const sources = container.meshes.filter(
      (m) => !m.name.startsWith("GEO-crew-suit-male_primitive0"),
    );
    const helper = createCrewRegionalLayers(sources);
    helper.refresh(
      "male",
      false,
      crewArmorClothRegions(["chest", "legs"]),
      false,
      new Set(),
    );
    expect(
      helper.meshes.filter(
        (m) => m.isEnabled() && m.name.includes("suit-male"),
      ),
    ).toHaveLength(0);
    expect(
      helper.meshes.some(
        (m) =>
          m.isEnabled() &&
          m.name.includes("base-male") &&
          m.metadata?.crewClothRegions.includes("hips"),
      ),
    ).toBe(true);
    helper.refresh("male", true, new Set(), false, new Set());
    expect(
      sources.some(
        (m) => m.name.startsWith("GEO-crew-base-male") && m.isEnabled(),
      ),
    ).toBe(true);
    helper.dispose();
    container.dispose();
    scene.dispose();
    engine.dispose();
  });
  for (const variant of ["male", "female"])
    it(`partitions ${variant} actual triangles losslessly, preserving skin buffers and privacy`, async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const container = await SceneLoader.LoadAssetContainerAsync(
        "",
        asset,
        scene,
        undefined,
        ".glb",
      );
      container.addAllToScene();
      const originals = container.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      const buffers = new Map(
        originals.map((m) => [m, [...(m.getIndices() ?? [])]]),
      );
      const base = originals.filter((m) =>
        m.name.startsWith(`GEO-crew-base-${variant}`),
      );
      for (const source of base) {
        const groups = partitionCrewTriangles(source);
        const triangles = [...groups.values()].flat();
        expect(triangles.length).toBe(source.getTotalIndices());
        expect([...groups.keys()]).not.toContain("unclassified");
      }
      const helper = createCrewRegionalLayers(container.meshes);
      const full = crewArmorClothRegions([
        "chest",
        "shoulders",
        "gloves",
        "belt",
        "legs",
        "boots",
        "back",
      ]);
      helper.refresh(variant, false, full, false, new Set());
      const active = () => helper.meshes.filter((m) => m.isEnabled());
      expect(
        active().filter((m) => m.name.includes("-regional-union")).length,
      ).toBeGreaterThan(5);
      expect(active().every((m) => m.name.includes(`-${variant}`))).toBe(true);
      expect(
        active().some(
          (m) =>
            m.name.includes("base") &&
            (m.metadata?.crewClothRegions ?? []).some((r: string) =>
              [
                "torso",
                "hips",
                "upperArms",
                "forearms",
                "legs",
                "feet",
              ].includes(r),
            ),
        ),
      ).toBe(false);
      expect(
        active()
          .filter((m) => m.name.endsWith("pressure-neck"))
          .every((m) => m.material?.name === "crew.suit_primary.pressure"),
      ).toBe(true);
      helper.refresh(
        variant,
        false,
        crewArmorClothRegions(["shoulders"]),
        false,
        new Set(),
      );
      expect(
        active().some(
          (m) =>
            m.name.includes("base") &&
            m.metadata?.crewClothRegions?.includes("hips"),
        ),
      ).toBe(true);
      expect(
        active().some(
          (m) =>
            m.name.includes("suit") &&
            m.metadata?.crewClothRegions?.includes("legs"),
        ),
      ).toBe(false);
      helper.refresh(variant, false, new Set(), false, new Set());
      expect(active()).toHaveLength(0);
      for (const [source, indices] of buffers)
        expect([...source.getIndices()!]).toEqual(indices);
      helper.dispose();
      expect(originals.every((m) => !m.isDisposed())).toBe(true);
      container.dispose();
      scene.dispose();
      engine.dispose();
    });

  it("EVA uses dedicated pressure hands without modifying face/skin or sibling materials", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const a = await SceneLoader.LoadAssetContainerAsync(
      "",
      asset,
      scene,
      undefined,
      ".glb",
    );
    const b = await SceneLoader.LoadAssetContainerAsync(
      "",
      asset,
      scene,
      undefined,
      ".glb",
    );
    a.addAllToScene();
    b.addAllToScene();
    const skin = a.materials.find((m) => m.name === "crew.skin") as PBRMaterial;
    const skinColor = skin.albedoColor.asArray();
    const helper = createCrewRegionalLayers(a.meshes);
    helper.refresh("female", true, new Set(), true, new Set());
    const hands = helper.meshes.filter(
      (m) => m.isEnabled() && m.name.endsWith("-pressure"),
    );
    expect(hands.length).toBeGreaterThan(0);
    expect(hands.every((m) => m.material !== skin)).toBe(true);
    expect(hands.every((m) => !b.materials.includes(m.material!))).toBe(true);
    expect(skin.albedoColor.asArray()).toEqual(skinColor);
    helper.refresh("female", true, new Set(), true, new Set(["hands"]));
    expect(hands.every((m) => !m.isEnabled())).toBe(true);
    helper.dispose();
    a.dispose();
    b.dispose();
    scene.dispose();
    engine.dispose();
  });
});
