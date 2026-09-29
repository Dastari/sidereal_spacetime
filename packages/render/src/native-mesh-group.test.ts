import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nativeMeshInGroup } from "./native-mesh-group";

describe("native mesh namespaces", () => {
  it("keeps existing groups separate from adjacent names", () => {
    for (const name of ["Panel", "Panel_01", "Panel.001"])
      expect(nativeMeshInGroup(name, "Panel")).toBe(true);
    for (const name of ["Panels", "PanelOther", "OtherPanel"])
      expect(nativeMeshInGroup(name, "Panel")).toBe(false);
    expect(nativeMeshInGroup("GEO-part-1234--plate", "GEO-part-123--")).toBe(
      false,
    );
  });
});
