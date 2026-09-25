import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compileConstruction, readConstructionDraft } from "./construction-transactions";
import { compileLayout } from "./layout-compiler";
import { prefabConstructionDocument, prefabLayout } from "./prefab-construction";

const catalog = defaultPrefabComponentCatalog();

describe("prefab construction documents", () => {
  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id} publishes through the construction compiler`, () => {
      const doc = prefabConstructionDocument(prefab, catalog);
      const layout = compileLayout(doc.layout);
      const errors = layout.diagnostics.filter((d) => d.severity === "error");
      expect(errors.map((d) => `${d.code}:${d.ids?.join?.(",") ?? ""}`)).toEqual([]);
      expect(doc.layout.openings.length).toBeGreaterThan(0);
      const snapshot = compileConstruction(JSON.stringify(doc));
      expect(snapshot.readiness.geometry).toBe(true);
      // Deterministic derivation.
      expect(readConstructionDraft(JSON.stringify(prefabConstructionDocument(prefab, catalog))).sha256).toBe(snapshot.sha256);
    });

  it("rejects a layout that drifts from the grammar derivation", () => {
    const doc = prefabConstructionDocument(PREFAB_SHIPS[0], catalog);
    doc.layout.partitions.pop();
    expect(() => readConstructionDraft(JSON.stringify(doc))).toThrow(/derivation/);
  });

  it("rejects an invalid prefab and an unknown catalog revision", () => {
    const doc = prefabConstructionDocument(PREFAB_SHIPS[0], catalog);
    const bad = structuredClone(doc);
    bad.prefab.catalog = "ship-components-v0@0";
    expect(() => readConstructionDraft(JSON.stringify(bad))).toThrow(/catalog/);
    const broken = structuredClone(doc);
    broken.prefab.document.rooms = [];
    expect(() => readConstructionDraft(JSON.stringify(broken))).toThrow();
  });

  it("maps the prefab frame onto the layout frame (bow toward +y, port toward -x)", () => {
    const prefab = PREFAB_SHIPS[0];
    const layout = prefabLayout(prefab, catalog);
    const ys = layout.tiles.flatMap((t) => t.vertices.map((v) => v[1]));
    const xs = layout.tiles.flatMap((t) => t.vertices.map((v) => v[0]));
    // The bridge (fore) is at larger layout y than the engine room (aft).
    const bridge = layout.rooms.find((r) => r.type === "bridge")!;
    const engine = layout.rooms.find((r) => r.type === "engineering")!;
    expect(bridge.seed[1]).toBeGreaterThan(engine.seed[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });
});
