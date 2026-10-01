import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import type { ShipVisualManifest } from "@sidereal/content/ship-visual";
import { SHIP_VISUAL_MACRO_PROFILES_R002 } from "@sidereal/content/ship-visual-r002";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { dressShip } from "@sidereal/sim/ship-dresser";
import { exteriorOnlyDress } from "@sidereal/sim/ship-exterior";
import type { GlbGeometry, GlbPrimitive } from "./glb-library";
import {
  glazingOccurrenceKey,
  referenceGlazingReplacements,
} from "./glazing-replacement";

function fixture() {
  const manifest = JSON.parse(
    readFileSync("assets/runtime/ship-visual/r002/manifest.json", "utf8"),
  ) as ShipVisualManifest;
  const ship = prefabById("fed.s.wren")!;
  const dressed = dressShip(ship, { catalog: defaultPrefabComponentCatalog() });
  const geometry = new Map<string, GlbGeometry>();
  for (const placement of dressed.kit.filter((k) =>
    ["bow.slope1.deck.s2.a0.edge1", "bow.slope1.deck.s2.a1.edge1"].includes(
      k.piece,
    ),
  )) {
    const asset = manifest.assets.find(
      (a) => a.kind === "kit" && a.id === placement.piece,
    )!;
    const bytes = readFileSync(
      `assets/runtime/${asset.url.slice("/assets/".length)}`,
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const document = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    const node = document.nodes.find(
      (n: { name: string }) => n.name === asset.node,
    );
    const primitives = document.meshes[node.mesh].primitives.map(
      (p: { indices: number; material: number }) => {
        const count = document.accessors[p.indices].count;
        return {
          material: document.materials[p.material].name,
          indices: new Uint32Array(count),
          triangles: count / 3,
        } as GlbPrimitive;
      },
    );
    geometry.set(placement.piece, {
      url: asset.url,
      primitives,
    } as GlbGeometry);
  }
  return { manifest, dressed, placements: dressed.kit, geometry };
}

it.each([false, true])(
  "admits the exact verified original panes in actual Wren dressing (exterior=%s)",
  (exterior) => {
    const f = fixture();
    const placements = exterior
      ? exteriorOnlyDress(f.dressed).kit
      : f.placements;
    const replacements = referenceGlazingReplacements(
      f.manifest,
      "federation",
      "fed.s.wren",
      placements,
      f.geometry,
    );
    expect(replacements.size).toBe(2);
    expect(
      placements
        .filter((p) => replacements.has(glazingOccurrenceKey(p)))
        .map((p) => p.piece)
        .sort(),
    ).toEqual(["bow.slope1.deck.s2.a0.edge1", "bow.slope1.deck.s2.a1.edge1"]);
    expect(
      placements.filter((p) => !replacements.has(glazingOccurrenceKey(p)))
        .length,
    ).toBe(placements.length - 2);
  },
);

it.each(["r001", "riftjack", "other-prefab"])(
  "keeps other revisions, factions and prefabs unchanged (%s)",
  (scope) => {
    const f = fixture();
    const manifest =
      scope === "r001" ? { ...f.manifest, revision: "r001" } : f.manifest;
    expect(
      referenceGlazingReplacements(
        manifest,
        scope === "riftjack" ? "riftjack" : "federation",
        scope === "other-prefab" ? "fed.m.crest" : "fed.s.wren",
        f.placements,
        f.geometry,
      ).size,
    ).toBe(0);
  },
);

it.each(["missing", "duplicate", "shifted", "mirror", "view"])(
  "rejects ambiguous or changed exact occurrence (%s)",
  (defect) => {
    const f = fixture();
    const target = f.placements.find(
      (p) => p.piece === "bow.slope1.deck.s2.a1.edge1",
    )!;
    let placements = f.placements.filter((p) => p !== target);
    if (defect === "duplicate")
      placements = [...placements, target, { ...target }];
    if (defect === "shifted") placements.push({ ...target, x: target.x + 1 });
    if (defect === "mirror") placements.push({ ...target, mirror: true });
    if (defect === "view") placements.push({ ...target, view: "deck" });
    expect(() =>
      referenceGlazingReplacements(
        f.manifest,
        "federation",
        "fed.s.wren",
        placements,
        f.geometry,
      ),
    ).toThrow("occurrence mismatch");
  },
);

it.each(["hash", "node", "url", "geometry", "triangles"])(
  "rejects wrong verified source or imported primitive identity (%s)",
  (defect) => {
    const f = fixture();
    const id = "bow.slope1.deck.s2.a1.edge1";
    const asset = f.manifest.assets.find(
      (a) => a.kind === "kit" && a.id === id,
    )!;
    if (defect === "hash") asset.sha256 = "0".repeat(64);
    if (defect === "node") asset.node = "other-node";
    if (defect === "url") asset.url = "/assets/ship-kit/r002/other.glb";
    if (defect === "geometry") f.geometry.delete(id);
    if (defect === "triangles") {
      const primitive = f.geometry
        .get(id)!
        .primitives.find((p) => p.material.includes("glass"))!;
      primitive.indices = primitive.indices.subarray(3);
      primitive.triangles--;
    }
    expect(() =>
      referenceGlazingReplacements(
        f.manifest,
        "federation",
        "fed.s.wren",
        f.placements,
        f.geometry,
      ),
    ).toThrow(/source mismatch|geometry mismatch/);
  },
);

it.each(["missing", "non-optical", "hash", "frame", "glass", "nonfinite"])(
  "rejects the complete candidate when its effective aperture certificate is unavailable (%s)",
  (defect) => {
    const f = fixture();
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const original = profile.opticalInterfaces;
    const id = "bow.slope1.deck.s2.a1.edge1";
    const certificate = {
      ...original[id],
      sourceFrameBounds: original[id].sourceFrameBounds.map(
        (b) => [...b] as typeof b,
      ),
      retainedGlassBounds: original[id].retainedGlassBounds.map(
        (b) => [...b] as typeof b,
      ),
    };
    const table: typeof original = { ...original, [id]: certificate };
    if (defect === "missing") delete table[id];
    if (defect === "non-optical") certificate.kind = "non-optical";
    if (defect === "hash") certificate.assetSha256 = "0".repeat(64);
    if (defect === "frame") certificate.sourceFrameBounds = [];
    if (defect === "glass") certificate.retainedGlassBounds = [];
    if (defect === "nonfinite") certificate.sourceFrameBounds[0][0] = NaN;
    try {
      profile.opticalInterfaces = table;
      expect(() =>
        referenceGlazingReplacements(
          f.manifest,
          "federation",
          "fed.s.wren",
          f.placements,
          f.geometry,
        ),
      ).toThrow("aperture certificate mismatch");
    } finally {
      profile.opticalInterfaces = original;
    }
  },
);
