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

  it("selects every actual r005 panel mesh from its exact catalog namespace", () => {
    const catalog = JSON.parse(
      readFileSync(
        "assets/runtime/assembly/catalog-shipyard-r005.json",
        "utf8",
      ),
    );
    const assets = catalog.assets.filter(
      (asset: { visual?: { designId: string; revision: number } }) =>
        asset.visual?.designId === "shipyard.hull.side-armor" &&
        asset.visual.revision === 5,
    );
    expect(assets).toHaveLength(18);
    for (const asset of assets) {
      const bytes = readFileSync(
        "assets/runtime/" + asset.visual.url.slice("/assets/".length),
      );
      const gltf = JSON.parse(
        bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
      );
      const meshes = gltf.nodes.filter(
        (node: { mesh?: number }) => node.mesh !== undefined,
      );
      expect(meshes.length).toBeGreaterThan(0);
      for (const mesh of meshes)
        expect(
          nativeMeshInGroup(mesh.name, asset.visual.nodePrefix),
          `${asset.id}: ${mesh.name}`,
        ).toBe(true);
    }
  });
});
