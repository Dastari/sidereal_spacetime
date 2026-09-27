import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { withMaterialSetup } from "./material-setup";

test("bulk material setup coalesces dirty propagation, nests safely and restores tracking on failure", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new StandardMaterial("existing", scene);
  const dirty = vi.spyOn(material, "markAsDirty");
  const result = withMaterialSetup(scene, () => {
    scene.markAllMaterialsAsDirty(Material.LightDirtyFlag);
    withMaterialSetup(scene, () =>
      scene.markAllMaterialsAsDirty(Material.TextureDirtyFlag),
    );
    expect(scene.blockMaterialDirtyMechanism).toBe(true);
    expect(dirty).not.toHaveBeenCalled();
    return "ready";
  });
  expect(result).toBe("ready");
  expect(scene.blockMaterialDirtyMechanism).toBe(false);
  expect(dirty).toHaveBeenCalledTimes(1);
  expect(dirty).toHaveBeenCalledWith(Material.AllDirtyFlag);
  dirty.mockClear();
  expect(() =>
    withMaterialSetup(scene, () => {
      throw Error("assembly failed");
    }),
  ).toThrow("assembly failed");
  expect(scene.blockMaterialDirtyMechanism).toBe(false);
  expect(dirty).toHaveBeenCalledTimes(1);
  scene.dispose();
  engine.dispose();
});
