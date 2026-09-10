import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { applyCutawayVisibility, prepareCutawayMeshes } from "./cutaway";

test("retained cutaway walls leave alpha sorting and resume opaque depth rendering", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const wall = CreateBox("GEO-cutaway-port", {}, scene);
  const material = new PBRMaterial("wall",scene);wall.material=material;
  // Reproduce the previous state: fully visible geometry still classified transparent.
  material.transparencyMode=Material.MATERIAL_ALPHABLEND;
  expect(material.needAlphaBlendingForMesh(wall)).toBe(true);
  prepareCutawayMeshes([wall]);
  applyCutawayVisibility(wall,1);
  expect(material.needAlphaBlendingForMesh(wall)).toBe(false);
  applyCutawayVisibility(wall,.5);
  expect(material.needAlphaBlendingForMesh(wall)).toBe(true);
  expect(wall.isEnabled()).toBe(true);
  applyCutawayVisibility(wall,.001);
  expect(wall.isEnabled()).toBe(false);
  applyCutawayVisibility(wall,.999);
  expect(wall.visibility).toBe(1);
  expect(wall.isEnabled()).toBe(true);
  expect(material.needAlphaBlendingForMesh(wall)).toBe(false);
  scene.dispose();engine.dispose();
});


test("roof paint retains its alpha mask through flight, fade and deck cutaway", () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  const paint=CreateBox('GEO-roof-hull-name',{},scene);
  paint.metadata={hullDecal:true};paint.material=new PBRMaterial('paint',scene);
  paint.material.transparencyMode=Material.MATERIAL_ALPHABLEND;
  for (const visibility of [1,.5,0,1]) {
    applyCutawayVisibility(paint,visibility);
    expect(paint.material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
    expect(paint.isEnabled()).toBe(visibility>0);
    expect(paint.visibility).toBe(visibility);
  }
  scene.dispose();engine.dispose();
});


test("two roofs share authored surfaces while only one fades", () => {
 const engine=new NullEngine(),scene=new Scene(engine);
 const a=CreateBox("roof-a",{},scene),b=CreateBox("roof-b",{},scene),mat=new PBRMaterial("shared",scene);
 a.material=b.material=mat; mat.transparencyMode=Material.MATERIAL_OPAQUE;
 prepareCutawayMeshes([a,b]);
 applyCutawayVisibility(a,.5);applyCutawayVisibility(b,1);
 expect(a.material).toBe(b.material);
 expect(mat.needAlphaBlendingForMesh(a)).toBe(true);
 expect(mat.needAlphaBlendingForMesh(b)).toBe(false);
 expect(mat.transparencyMode).toBe(null);
 expect(a.metadata.role).toBe("roof");
 scene.dispose();engine.dispose();
});
