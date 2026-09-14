import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, type ViewState } from "./state";
import {
  enterEditorMode,
  enterStructuralTool,
  layoutPreviewPolicy,
} from "./editor-mode-policy";

describe("Shipyard working layers", () => {
  it.each(["Structure", "Systems"] as const)(
    "enters %s on the top working plane",
    (mode) => {
      const before = {
        ...DEFAULT_VIEW,
        mode: "Hull" as const,
        projection: "3D" as const,
      };
      const after = enterEditorMode(before, mode);
      expect(after.projection).toBe("Top");
      expect(after.camera).toBe(before.camera);
      expect(after.layers).toBe(before.layers);
    },
  );
  it("preserves manual layer overrides while staying in a mode", () => {
    const manual = {
      ...DEFAULT_VIEW,
      layers: { ...DEFAULT_VIEW.layers, roof: true, walls: false },
    };
    expect(enterEditorMode(manual, manual.mode)).toBe(manual);
  });
  it("keeps orbit between object and hull work", () => {
    const before = {
      ...DEFAULT_VIEW,
      mode: "Objects" as const,
      projection: "3D" as const,
    };
    expect(enterEditorMode(before, "Hull").projection).toBe("3D");
    expect(enterStructuralTool(before).projection).toBe("Top");
    expect(enterStructuralTool(before).layers).toBe(before.layers);
  });
  it("retains all visibility choices across every mode and enforces the Structure camera lock", () => {
    let view: ViewState = {
      ...DEFAULT_VIEW,
      layers: {
        ...DEFAULT_VIEW.layers,
        roof: true,
        walls: false,
        objects: false,
        routes: false,
        exteriorHull: true,
      },
    };
    const layers = view.layers;
    for (const mode of ["Objects", "Hull", "Systems", "Structure"] as const) {
      view = enterEditorMode(view, mode);
      expect(view.layers).toBe(layers);
      expect(layoutPreviewPolicy(view).layers.walls).toBe(false);
      expect(layoutPreviewPolicy(view).layers.roof).toBe(true);
      expect(layoutPreviewPolicy(view).lockTop).toBe(mode === "Structure");
    }
    expect(
      enterEditorMode({ ...view, projection: "3D" }, "Structure").projection,
    ).toBe("Top");
  });
  it("separates schematic object visibility from native solid meshes", () => {
    const view = enterEditorMode(
      { ...DEFAULT_VIEW, mode: "Objects" },
      "Systems",
    );
    expect(view.layers.objects).toBe(true);
    expect(layoutPreviewPolicy(view).suppressEquipmentSolids).toBe(true);
  });
});
