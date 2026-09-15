import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateAssembly, type PartCatalog } from "@sidereal/content/assembly";
import {
  assemblyMismatches,
  editVisualPart,
} from "@sidereal/content/layout-assembly";
import { bindConstructionLayout } from "@sidereal/sim/construction-layout";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { readLayout } from "@sidereal/sim/layout-validation";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { planLayoutInsetVisuals } from "@sidereal/render/layout-inset-visual-plan";
import {
  createArmorReviewDraft,
  isArmorPaletteAlias,
  hasArmorReviewParts,
  withArmorReviewCatalog,
} from "./armor-review";
import kit from "./armor-kit-r005.json";

const root = new URL("../../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const json = (path: string) => JSON.parse(read(path).toString());
const base = json(
  "assets/runtime/assembly/catalog-shipyard-r005.json",
) as PartCatalog;
const catalog = withArmorReviewCatalog(base);
const draft = () =>
  createArmorReviewDraft("83de89d7-bef8-4226-8d51-8f0c25d365ef");

describe("editor native armor review", () => {
  it("uses every exact native group and the reviewed unmodified GLB", () => {
    const manifest = json(
      "assets/art-library/framed-wayfarer/r005/library-02/models.json",
    );
    expect(kit.assets).toHaveLength(76);
    expect(
      createHash("sha256")
        .update(
          read("assets/art-library/framed-wayfarer/r005/library-02/hull.glb"),
        )
        .digest("hex"),
    ).toBe(kit.librarySha256);
    for (const asset of kit.assets) {
      const model = manifest.models.find(
        (m: { modelId: string }) => m.modelId === asset.id,
      );
      expect(asset.visual.nodePrefix).toBe(model.nodePrefix);
      expect(asset.bounds).toEqual(model.bounds);
    }
  });

  it("reproduces reviewed placements and nine equipment poses, retaining the original floorplan", () => {
    const d = draft();
    const fixture = JSON.parse(
      json(
        "assets/art-library/framed-wayfarer/r005/browser/final-02/document.json",
      ).documentJson,
    ).layout;
    const native = json(
      "assets/art-library/framed-wayfarer/r005/library-02/models.json",
    ).assemblies.wayfarer.placements;
    expect(d.source).toBeNull();
    expect(d.tiles.map((t) => t.vertices)).toEqual(
      fixture.tiles.map((t: { vertices: number[][] }) => t.vertices),
    );
    expect(d.partitions.map((p) => [p.a, p.b])).toEqual(
      fixture.partitions.map((p: { a: number[]; b: number[] }) => [p.a, p.b]),
    );
    expect(d.assembly!.parts).toHaveLength(84);
    const armor = d.assembly!.parts.filter((p) =>
      p.assetId.startsWith("armor-block-"),
    );
    expect(armor).toHaveLength(42);
    armor.forEach((p, i) => {
      expect([p.assetId, p.position, p.rotation, p.flipped]).toEqual([
        native[i].modelId,
        native[i].position,
        native[i].rotationZRad,
        false,
      ]);
    });
    expect(kit.provenance.equipmentMounts).toHaveLength(9);
    for (const m of kit.provenance.equipmentMounts) {
      const p = d.assembly!.parts.find((p) => p.id === m.placementId)!;
      const [x, y, z] = m.reviewRendererPosition;
      expect(p.position).toEqual([x, -z, y]);
      expect(p.assetId).toBe(m.assetId);
    }
    expect(
      d.assembly!.parts.some((p) =>
        kit.provenance.removedPlacementIds.includes(p.id),
      ),
    ).toBe(false);
    expect(assemblyMismatches(d, catalog)).toEqual([]);
    validateAssembly(
      {
        schema: "sidereal.assembly-draft.v1",
        id: d.id,
        name: d.name,
        parts: d.assembly!.parts,
      },
      catalog,
    );
  });

  it("retains the exact native structural identity mapping so interior walls load", () => {
    const document = draft();
    const plan = planLayoutInsetVisuals({
      document,
      compiled: compileLayout(document),
      deckId: document.decks[0].id,
    });
    expect(plan.issues).toEqual([]);
    expect(plan.requests.length).toBeGreaterThan(160);
  });

  it("edits and serializes individual native placements without changing the template or neighbors", () => {
    const d = draft(),
      original = structuredClone(d),
      part = d.assembly!.parts.at(-1)!;
    const moved = {
      ...part,
      position: [
        part.position[0],
        part.position[1],
        part.position[2] + 0.03125,
      ] as [number, number, number],
    };
    editVisualPart(d, moved, catalog);
    const restored = readLayout(JSON.parse(JSON.stringify(d)));
    expect(restored.assembly!.parts.at(-1)!.position[2]).toBe(
      moved.position[2],
    );
    expect(restored.assembly!.parts.slice(0, -1)).toEqual(
      original.assembly!.parts.slice(0, -1),
    );
    expect(draft()).toEqual(original);
    expect(hasArmorReviewParts(d)).toBe(true);
  });

  it("does not overwrite an installed definition or qualify the review for game publication", () => {
    expect(() => withArmorReviewCatalog(catalog)).toThrow("conflicts");
    expect(() =>
      compileConstruction(
        JSON.stringify(bindConstructionLayout(draft()).document),
      ),
    ).toThrow(/not yet qualified/);
    expect(base.assets.some((a) => a.id.startsWith("armor-block-"))).toBe(
      false,
    );
  });
});

describe("native armor palette choices", () => {
  it("collapses equivalent dimensions while retaining every placed asset definition", () => {
    const native = catalog.assets.filter(
      (a) => a.visual?.designId === kit.designId,
    );
    const palette = native.filter((a) => !isArmorPaletteAlias(a.id));
    expect(native).toHaveLength(76);
    expect(palette).toHaveLength(63);
    expect(new Set(palette.map((a) => a.label)).size).toBe(63);
    for (const [alias, canonical] of Object.entries(kit.paletteAliases)) {
      expect(native.find((a) => a.id === alias)).toBeDefined();
      expect(palette.find((a) => a.id === canonical)).toBeDefined();
    }
    expect(isArmorPaletteAlias("unrelated-future-model")).toBe(false);
  });
  it("keeps genuinely different depth and finish options selectable", () => {
    const choices = catalog.assets.filter((a) => !isArmorPaletteAlias(a.id));
    expect(
      choices.filter((a) => a.label === "Armor · 2 × 3 m · plain · 1 m deep"),
    ).toHaveLength(1);
    expect(
      choices.filter((a) => a.label === "Armor · 2 × 3 m · plain · 0.5 m deep"),
    ).toHaveLength(1);
    for (const finish of ["red-service", "utility", "vent"])
      expect(
        choices.filter(
          (a) => a.label === `Armor · 2 × 3 m · ${finish} · 1 m deep`,
        ),
      ).toHaveLength(1);
  });
});
