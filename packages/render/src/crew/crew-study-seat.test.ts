import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { createVoxelCrewVisual } from "./voxel-crew";
import { loadAuthoredStudy } from "../prefab-ship/wayfarer-authored-study";
import { readWayfarerAuthoredStudy } from "@sidereal/content/wayfarer-authored-study";
import { authoredTemplateComponents } from "../prefab-ship/authored-template-objects";
import { dressShip } from "@sidereal/sim/ship-dresser";
import { prefabFlightModel } from "@sidereal/sim/prefab-flight";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { CREW_STUDY_PILOT_CHAIR } from "@sidereal/content/crew-study";
import { prefabSeatPresentation } from "./seat-presentation";

const bytes = (file: string) =>
  new Uint8Array(
    readFileSync(
      new URL("../../../../assets/runtime/" + file, import.meta.url),
    ),
  );
const json = (file: string) =>
  JSON.parse(new TextDecoder().decode(bytes(file)));
const props = readWayfarerAuthoredStudy(
  json("ship-study/wayfarer-authored-r001/manifest.json"),
  json("ship-study/wayfarer-authored-r001/layout.json"),
  json("ship-study/wayfarer-authored-r001/descriptor.json"),
);
for (const id of ["fed.s.wren-fleet", "fed.m.wayfarer-fleet"])
  for (const bodyType of ["male", "female"] as const)
    test(`${id} ${bodyType} scaled seated body rests on actual pinned chair cushion and base supports`, async () => {
      const engine = new NullEngine();
      engine.getDeltaTime = () => 16;
      const scene = new Scene(engine);
      scene.useRightHandedSystem = true;
      scene.useConstantAnimationDeltaTime = true;
      new FreeCamera("review", new Vector3(0, 1, -4), scene);
      const doc = prefabById(id)!,
        catalog = defaultPrefabComponentCatalog(),
        station = prefabFlightModel(doc, catalog).station!;
      const piece = props.pieces.find(
        (p) => p.id === CREW_STUDY_PILOT_CHAIR.piece,
      )!;
      expect(piece.sha256).toBe(CREW_STUDY_PILOT_CHAIR.sha256);
      const row = authoredTemplateComponents(
        dressShip(doc, { catalog }),
        new Map(props.pieces.map((p) => [p.id, p])),
      ).find((r) => r.object === "mount:helm")!;
      const chair = await loadAuthoredStudy(
        scene,
        [piece],
        [row],
        props.palette,
        prefabOrigin(doc),
        () =>
          Promise.resolve(
            bytes("ship-study/wayfarer-authored-r001/" + piece.file),
          ),
      );
      const crew = await createVoxelCrewVisual(
        scene,
        new TransformNode("frame", scene),
        bytes("crew/study-v2-r001/crew-body.glb"),
        {
          faceAtlas: false,
          studyAnimation: bytes("crew/study-v2-r001/anim/crew-anims.glb"),
        },
      );
      crew.customize({
        bodyType,
        hairStyle: "none",
        equippedComponents: {},
        weapon: "none",
      });
      const contact = prefabSeatPresentation({ doc, catalog }, ...station)!;
      crew.root.position.set(station[0], 0.1875 + contact.lift, -station[1]);
      crew.setSeatContact(contact);
      crew.update({ moving: false, seated: true });
      let worstGap = 0,
        worstFoot = 0;
      for (let frame = 0; frame < 240; frame++) {
        scene.render();
        if (frame < 30) continue;
        const pelvis = crew.joints.get("pelvis")!.getAbsolutePosition();
        const cushion = scene
          .multiPickWithRay(
            new Ray(
              new Vector3(pelvis.x, 1.1, pelvis.z),
              new Vector3(0, -1, 0),
              2,
            ),
            (m) => chair.meshes.includes(m as never),
          )!
          .filter(
            (h) =>
              h.pickedPoint &&
              h.pickedMesh?.metadata?.authoredStudy?.placementRanges?.some(
                (p: { material: string }) => p.material === "deck_seam",
              ),
          )
          .map((h) => h.pickedPoint!.y)
          .sort((a, b) => b - a)[0];
        expect(cushion).toBeGreaterThan(0.65);
        expect(cushion).toBeLessThan(0.7);
        let underside = Infinity;
        for (const mesh of crew.root.getChildMeshes()) {
          if (
            !mesh.name.startsWith(`GEO-crew-base-${bodyType}_primitive`) ||
            mesh.name.includes("coverage") ||
            !mesh.skeleton
          )
            continue;
          mesh.skeleton.prepare();
          const pos = mesh.getPositionData(true, true),
            ids = mesh.getVerticesData("matricesIndices"),
            weights = mesh.getVerticesData("matricesWeights");
          if (!pos || !ids || !weights) continue;
          const world = mesh.computeWorldMatrix(true);
          for (let i = 0; i < pos.length / 3; i++) {
            let k = 0;
            for (let j = 1; j < 4; j++)
              if (weights[i * 4 + j] > weights[i * 4 + k]) k = j;
            const bone = mesh.skeleton.bones.find(
              (b) => b.getIndex() === ids[i * 4 + k],
            );
            if (bone?.name === "pelvis")
              underside = Math.min(
                underside,
                Vector3.TransformCoordinates(
                  Vector3.FromArray(pos, i * 3),
                  world,
                ).y,
              );
          }
        }
        worstGap = Math.max(worstGap, Math.abs(underside - cushion));
        for (const side of ["L", "R"])
          worstFoot = Math.max(
            worstFoot,
            Math.abs(
              crew.joints.get(`foot.${side}`)!.getAbsolutePosition().y -
                (0.1875 + contact.footSupport + (3 / 32) * 0.9),
            ),
          );
      }
      for (const side of ["L", "R"]) {
        const foot = crew.joints.get(`foot.${side}`)!.getAbsolutePosition();
        const base = scene
          .multiPickWithRay(
            new Ray(
              new Vector3(foot.x, 0.45, foot.z),
              new Vector3(0, -1, 0),
              1,
            ),
            (m) => chair.meshes.includes(m as never),
          )!
          .map((h) => h.pickedPoint?.y)
          .filter((y): y is number => y !== undefined)
          .sort((a, b) => b - a)[0];
        expect(Math.abs(foot.y - (3 / 32) * 0.9 - base)).toBeLessThan(0.006);
      }
      expect(worstGap).toBeLessThan(0.004);
      expect(worstFoot).toBeLessThan(0.006);
      crew.setSeatContact(undefined);
      expect(crew.model.position.z).toBeCloseTo(0, 8);
      crew.dispose();
      chair.dispose();
      scene.dispose();
      engine.dispose();
    });
