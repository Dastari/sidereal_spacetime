import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import "@babylonjs/core/Meshes/instancedMesh";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { meshesByRole, setMeshRole } from "./mesh-roles";

test("role inventory includes disabled prototypes and counts evaluated instances without losing identity", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const source = CreateBox("arbitrary source name", {}, scene);
    source.metadata = { partId: "source", socket: "retained" };
    setMeshRole(source, "floor");
    source.setEnabled(false);
    const instance = source.createInstance("arbitrary instance name");
    instance.metadata = { partId: "placed" };
    setMeshRole(instance, "floor");
    scene.getActiveMeshes().push(instance);
    CreateBox("GEO-roof-is-not-a-role", {}, scene);
    expect(meshesByRole(scene).floor).toEqual({ active: 1, total: 2 });
    expect(meshesByRole(scene).unclassified).toEqual({ active: 0, total: 1 });
    expect(source.metadata).toEqual({
      partId: "source",
      socket: "retained",
      role: "floor",
    });
    expect(instance.metadata.partId).toBe("placed");
    instance.dispose();
    scene.getActiveMeshes().reset();
    expect(meshesByRole(scene).floor).toEqual({ active: 0, total: 1 });
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
