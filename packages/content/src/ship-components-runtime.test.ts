import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "./prefabs/index";
import { SHIP_COMPONENT_ART_REVISION, buildShipComponentCatalog, edgeHatchFrameTexels } from "./ship-components-source";
import { CONSTRUCTION_GRAMMAR as G } from "./construction-grammar";
import { componentVisualUrl } from "./ship-prefab-catalog";

const repo = resolve(import.meta.dirname, "../../..");
const runtime = resolve(repo, "assets/runtime/ship-components", SHIP_COMPONENT_ART_REVISION);

describe("published ship component GLBs", () => {
  it("are published for the current art revision and listed for delivery", () => {
    expect(existsSync(resolve(runtime, "manifest.json"))).toBe(true);
    const prepare = readFileSync(resolve(repo, "scripts/prepare_app.py"), "utf8");
    expect(prepare).toContain(`"ship-components/${SHIP_COMPONENT_ART_REVISION}"`);
  });

  it("cover every component a prefab ship mounts (no procedural stand-ins in game)", () => {
    const manifest = JSON.parse(readFileSync(resolve(runtime, "manifest.json"), "utf8")) as {
      components: { id: string }[];
      requiredComponentIds: string[];
    };
    const published = new Set(manifest.components.map((c) => c.id));
    const used = [...new Set(PREFAB_SHIPS.flatMap((p) => p.mounts.map((m) => m.component)))].sort();
    expect(used.filter((id) => !published.has(id))).toEqual([]);
    for (const id of used) {
      expect(existsSync(resolve(runtime, `${id}.glb`)), id).toBe(true);
      expect(componentVisualUrl(id)).toBe(`/assets/ship-components/${SHIP_COMPONENT_ART_REVISION}/${id}.glb`);
    }
    expect(manifest.requiredComponentIds).toEqual(expect.arrayContaining(used));
  });

  it("edge hatches fit the grammar's deck heights: recessed, base on the floor, top at or below the wall top", () => {
    const frame = edgeHatchFrameTexels();
    // Walkable airlock opening (1.2 x 2.2 m) fits under the upper tier top.
    expect(frame.openingHeight / G.texelsPerMeter).toBeGreaterThanOrEqual(2.2);
    expect(frame.top).toBeLessThanOrEqual(G.deck.wallTopTexels);
    const manifest = JSON.parse(readFileSync(resolve(runtime, "manifest.json"), "utf8")) as {
      components: { id: string; boundsM: [number[], number[]] }[];
    };
    const bounds = new Map(manifest.components.map((c) => [c.id, c.boundsM]));
    const edge = buildShipComponentCatalog().components.filter((c) => c.mount.sockets[0] === "edge");
    expect(edge.length).toBeGreaterThan(0);
    for (const c of edge) {
      const [lo, hi] = c.mount.envelopeM;
      // Placement centres edge modules on floor top + height/2, so the base lands on the floor.
      expect((hi[2] - lo[2]) * G.texelsPerMeter, c.id).toBeCloseTo(frame.height, 6);
      expect(lo[1], c.id).toBeGreaterThanOrEqual(-0.375);
      const b = bounds.get(c.id);
      if (!b) continue;
      // Published art matches the grammar-derived envelope (re-export after a grammar change).
      expect(b[1][2] - b[0][2], c.id).toBeCloseTo(hi[2] - lo[2], 3);
      expect(b[0][1], c.id).toBeGreaterThanOrEqual(lo[1] - 1e-6);
    }
  });
});
