/** Apply real Babylon skinning to the focused set, both bases and all shipped clips. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createCrewVisual } from "../../packages/render/src/crew";
import { CHARACTER_COMPONENT_SETS } from "../../packages/content/src/character-components";
const path = process.argv[2];
assert(path, "Pass a staged revision directory");
const engine = new NullEngine(),
  scene = new Scene(engine),
  root = new TransformNode("calibration-root", scene);
scene.activeCamera = new FreeCamera("audit", new Vector3(3, 3, -6), scene);
const crew = await createCrewVisual(
  scene,
  root,
  new Uint8Array(readFileSync(path + "/modular-crew.glb")),
);
const records = [];
for (const bodyType of ["male", "female"] as const)
  for (const mode of ["bare", "sealed", "open", "mixed"])
    for (const hairStyle of ["swept", "crest", "ponytail"] as const) {
      const equippedComponents =
        mode === "bare" ? {} : { ...CHARACTER_COMPONENT_SETS.medic };
      if (mode === "open") {
        delete equippedComponents.helmet;
        delete equippedComponents.visor;
      }
      if (mode === "mixed") {
        equippedComponents.shoulders = "marine-shoulders";
        equippedComponents.belt = "mechanic-belt";
        equippedComponents.boots = "salvage-boots";
      }
      crew.customize({
        bodyType,
        equippedComponents,
        hairStyle,
        weapon: "none",
        weaponFixture: false,
      });
      for (const mesh of crew.root.getChildMeshes())
        if (mesh.name.startsWith("GEO-medic-open-comms"))
          mesh.setEnabled(mode === "open");
      const visible = crew.root
        .getChildMeshes()
        .filter((m) => m.isEnabled() && m.getTotalVertices());
      assert(
        visible.some((m) =>
          m.name.startsWith("GEO-base-" + bodyType + "-modesty"),
        ),
      );
      assert(
        !visible.some((m) =>
          m.name.startsWith(
            "GEO-base-" + (bodyType === "female" ? "male" : "female"),
          ),
        ),
      );
      assert.equal(
        visible.some((m) => m.name.startsWith("GEO-medic-open-comms")),
        mode === "open",
      );
      assert.equal(
        visible.some((m) => m.name.startsWith("GEO-medic-visor")),
        mode === "sealed" || mode === "mixed",
      );
      for (const clip of scene.animationGroups) {
        for (const g of scene.animationGroups) g.stop();
        clip.start(true);
        clip.pause();
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          clip.goToFrame(clip.from + f * (clip.to - clip.from));
          scene.render();
          for (const m of visible) {
            m.computeWorldMatrix(true);
            m.skeleton?.prepare();
            const v = m.getPositionData(true, true);
            assert(v?.length && v.every(Number.isFinite));
          }
          for (const socket of Object.values(crew.sockets))
            assert(
              socket.getAbsolutePosition().asArray().every(Number.isFinite),
            );
        }
        records.push({
          bodyType,
          mode,
          hairStyle,
          clip: clip.name,
          frames: 5,
          visibleMeshes: visible.length,
        });
      }
    }
const result = {
  passed: true,
  states: records.length,
  frames: records.length * 5,
  bodies: 2,
  hairStyles: 3,
  looks: ["bare", "sealed", "open", "mixed"],
  clips: 12,
  limits:
    "Finite skinning/visibility/socket checks are not a visual clipping or reference-fidelity verdict.",
  records,
};
writeFileSync(
  path + "/runtime-fit-validation.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify({ ...result, records: undefined }));
crew.dispose();
scene.dispose();
engine.dispose();
