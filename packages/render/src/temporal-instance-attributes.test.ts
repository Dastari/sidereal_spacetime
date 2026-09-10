import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createTemporalInstanceAttributes, prepareTemporalInstanceAttributes } from "./temporal-instance-attributes";

test("linear temporal velocity binds all previous instance columns on original PBR and standard materials", () => {
  const engine=new NullEngine(),scene=new Scene(engine),mesh=CreateBox("part",{},scene);
  mesh.metadata={role:"equipment",partId:"part"};
  const materials=[new StandardMaterial("standard",scene),new PBRMaterial("authored",scene)];
  prepareTemporalInstanceAttributes(scene);
  for(const material of materials) {
    mesh.material=material;
    const plugin=material.pluginManager!.getPlugin("TemporalInstanceAttributes")!;
    const attributes=["position","world0","world1","world2","world3"];
    plugin.getAttributes(attributes,scene,mesh);expect(attributes).toHaveLength(5);
    scene.needsPreviousWorldMatrices=true;
    plugin.getAttributes(attributes,scene,mesh);
    expect(attributes.slice(5)).toEqual(["previousWorld0","previousWorld1","previousWorld2","previousWorld3"]);
    plugin.getAttributes(attributes,scene,mesh);expect(attributes).toHaveLength(9);
    const regular=["position"];plugin.getAttributes(regular,scene,mesh);expect(regular).toEqual(["position"]);
    prepareTemporalInstanceAttributes(scene);expect(material.pluginManager!.getPlugin("TemporalInstanceAttributes")).toBe(plugin);
    expect(mesh.material).toBe(material);
    scene.needsPreviousWorldMatrices=false;
  }
  const registry=createTemporalInstanceAttributes(scene);
  const late=new PBRMaterial("late-authored",scene);
  expect(late.pluginManager?.getPlugin("TemporalInstanceAttributes")).toBeTruthy();
  registry.dispose();
  scene.dispose();engine.dispose();
});
