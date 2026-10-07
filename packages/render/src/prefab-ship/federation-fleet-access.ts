import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import { FEDERATION_FLEET_ACCESS } from "@sidereal/content/prefabs";
import { WAYFARER_ACCESS_DOORS } from "@sidereal/content/wayfarer-access-profile";
import type { ShipAccessDoorPiece } from "@sidereal/content/ship-access-doors";
import type {
  PrefabComponentCatalog,
  ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  loadAuthoredAccessDoors,
  accessDoorPlacements,
} from "./authored-access-doors";
import { createPrefabDoors, prefabDoorSpecs, type DoorUpdate } from "./doors";

export const isFederationFleet = (doc: Pick<ShipPrefabDocumentV1, "id">) =>
  Object.prototype.hasOwnProperty.call(FEDERATION_FLEET_ACCESS, doc.id);

/** Native exact-size outer leaves; pressure isolators keep the ordinary two-metre family. */
export async function createFederationFleetAccessDoors(
  scene: Scene,
  root: TransformNode,
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  fetchBytes: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>,
  options: { exteriorOnly?: boolean } = {},
) {
  if (!isFederationFleet(doc))
    throw Error("Unregistered fleet access document");
  const placements = accessDoorPlacements(prefabDoorSpecs(doc, catalog));
  const authored = await loadAuthoredAccessDoors(scene, root, placements, {
    pack: WAYFARER_ACCESS_DOORS,
    fetchBytes,
    instanceMeshes: options.exteriorOnly,
  });
  const ordinary = options.exteriorOnly
    ? undefined
    : createPrefabDoors(
        scene,
        root,
        doc,
        catalog,
        doc.theme,
        true,
        new Set(placements.map((p) => p.id)),
      );
  // Static navy housing backs follow the room cutaway; front trim, controls and
  // moving leaves retain the exact authored dimensions. Clones isolate siblings.
  const backers: Material[] = [];
  for (const mesh of authored.meshes()) {
    if (
      options.exteriorOnly ||
      mesh.metadata?.authoredAccessDoor?.part !== "frame" ||
      mesh.material?.name !== "access.navy"
    )
      continue;
    const material = mesh.material.clone(
      `${mesh.material.name}:${doc.id}:cutaway`,
    );
    if (!material) continue;
    mesh.material = material;
    backers.push(material);
  }
  let deck = false;
  const updateCutaway = () => {
    const matrix = root.computeWorldMatrix(true);
    const plane = deck
      ? Plane.FromPositionAndNormal(
          Vector3.TransformCoordinates(new Vector3(0, 1.8, 0), matrix),
          Vector3.TransformNormal(Vector3.Up(), matrix).normalize(),
        )
      : null;
    for (const material of backers) material.clipPlane = plane;
  };
  const cutawayObserver = options.exteriorOnly
    ? null
    : scene.onBeforeRenderObservable.add(updateCutaway);
  return {
    setView(view: "deck" | "flight") {
      deck = !options.exteriorOnly && view === "deck";
      updateCutaway();
      ordinary?.setView(view);
      authored.setEnabled(true);
    },
    update(input: DoorUpdate) {
      ordinary?.update(input);
      authored.update(
        input.logic === undefined
          ? undefined
          : new Map([...input.logic].map(([id, open]) => [id, { open }])),
        input.dt,
      );
    },
    doors: () => [
      ...(ordinary?.doors() ?? []),
      ...authored
        .states()
        .map((s) => ({ ...s, airlock: s.id === "personnel-outer" })),
    ],
    meshes: () => authored.meshes(),
    dispose() {
      scene.onBeforeRenderObservable.remove(cutawayObserver);
      ordinary?.dispose();
      authored.dispose();
      backers.forEach((material) => material.dispose());
    },
  };
}
