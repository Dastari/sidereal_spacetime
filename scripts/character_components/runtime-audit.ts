import { readFileSync, writeFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createCrewVisual } from "../../packages/render/src/crew";
import {
  CHARACTER_COMPONENT_SETS,
  CHARACTER_COMPONENTS,
} from "../../packages/content/src/character-components";
import assert from "node:assert/strict";
const engine = new NullEngine(),
  scene = new Scene(engine),
  parent = new TransformNode("ship", scene);
scene.activeCamera = new FreeCamera(
  "audit-camera",
  new Vector3(3, 3, -6),
  scene,
);
const crew = await createCrewVisual(
  scene,
  parent,
  new Uint8Array(
    readFileSync("assets/runtime/crew/components/modular-crew.glb"),
  ),
);
const records = [];
for (const bodyType of ["male", "female"] as const) {
  for (const [look, set] of [
    ["base", {}],
    ...Object.entries(CHARACTER_COMPONENT_SETS),
  ] as const) {
    crew.customize({ bodyType, equippedComponents: set, weaponFixture: false });
    const visible = crew.root
      .getChildMeshes()
      .filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
    assert(
      visible.some((m) =>
        m.name.startsWith("GEO-base-" + bodyType + "-modesty"),
      ),
    );
    assert(
      !visible.some((m) =>
        m.name.startsWith(
          "GEO-base-" + (bodyType === "male" ? "female" : "male"),
        ),
      ),
    );
    for (const c of CHARACTER_COMPONENTS) {
      const found = visible.some(
        (m) =>
          m.name === "GEO-" + c.id ||
          m.name.startsWith("GEO-" + c.id + "_primitive"),
      );
      if (found !== (set[c.slot] === c.id))
        console.log({
          bodyType,
          look,
          component: c.id,
          expected: set[c.slot],
          matches: crew.root
            .getChildMeshes()
            .filter((m) => m.name.includes(c.id))
            .map((m) => ({
              name: m.name,
              enabled: m.isEnabled(),
              vertices: m.getTotalVertices(),
              parent: m.parent?.name,
            })),
        });
      assert.equal(found, set[c.slot] === c.id, c.id);
    }
    for (const clip of scene.animationGroups) {
      for (const g of scene.animationGroups) g.stop();
      clip.start(true);
      clip.pause();
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        clip.goToFrame(clip.from + (clip.to - clip.from) * fraction);
        scene.render();
        for (const mesh of visible) {
          mesh.computeWorldMatrix(true);
          mesh.skeleton?.prepare();
          const positions = mesh.getPositionData(true, true);
          assert(positions?.length && positions.every(Number.isFinite));
        }
        for (const socket of Object.values(crew.sockets))
          assert(socket.getAbsolutePosition().asArray().every(Number.isFinite));
      }
      records.push({
        bodyType,
        look,
        clip: clip.name,
        frames: 5,
        visibleMeshes: visible.length,
      });
    }
  }
}
crew.dispose();
scene.dispose();
engine.dispose();
writeFileSync(
  ".runtime/character-components/runtime-animation-audit.json",
  JSON.stringify(
    {
      passed: true,
      states: records.length,
      frames: records.length * 5,
      records,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    passed: true,
    states: records.length,
    frames: records.length * 5,
  }),
);
