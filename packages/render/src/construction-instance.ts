import {
  bindNativeAirlockPlan,
  type NativeAirlockDocument,
} from "@sidereal/sim/construction-airlock-document";
import { compilePublishedNativeExternalAirlock } from "@sidereal/sim/construction-airlock-published";
import { NATIVE_EXTERNAL_AIRLOCK_SOURCES } from "@sidereal/content/construction-airlock-room";
import { loadNativeAirlockScene } from "./native-airlock-scene";
import { loadConstructionAuthoredAssembly } from "./construction-authored-assembly";
import { NATIVE_TRAVERSAL_ROOM_SOURCES } from "@sidereal/content/construction-traversal-room";
import { nativeTraversalRoomInstallation } from "@sidereal/sim/construction-traversal-document";
import { loadConstructionTraversal } from "./construction-traversal";
import { NATIVE_PRESSURE_ROOM_SOURCES } from "@sidereal/content/construction-pressure-room";
import {
  compilePublishedNativePressureRoom,
  NATIVE_PRESSURE_FLOW_POLICY,
} from "@sidereal/sim/construction-native-room-published";
import { loadConstructionPressureRoom } from "./construction-pressure-room";
import { planPinnedBoundaryFamily } from "@sidereal/sim/construction-boundary-family";
import {
  CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES,
  CONSTRUCTION_BOUNDARY_FAMILY_GLB_SHA,
  CONSTRUCTION_BOUNDARY_FAMILY_URL,
} from "@sidereal/content/construction-boundary-family";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { onSegment } from "@sidereal/sim/layout-geometry";
import { transformPoint, type Point } from "@sidereal/content/ship-layout";
import { planNativeBoundaries } from "@sidereal/sim/construction-boundaries";
import { loadConstructionBoundaries } from "./construction-boundaries";
import { planNativeRoofs } from "@sidereal/sim/construction-roofs";
import { loadConstructionRoofs } from "./construction-roofs";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type { PartAsset, PartPlacement } from "@sidereal/content/assembly";
import {
  PINNED_FLOOR_KIT,
  compileConstruction,
} from "@sidereal/sim/construction-transactions";
import { compileDeckCollision } from "@sidereal/sim/construction-collision";
import {
  loadEquipmentPrototypes,
  equipmentPlacement,
} from "./installed-equipment";
import type { ManagedLocalLight } from "./local-light-budget";
export interface ConstructionRenderInput {
  instanceId: string;
  documentJson: string;
  deckId: string;
}
/** Native authored floors use exact server placement IDs. No Wayfarer fallback. */
export async function loadConstructionInstance(
  scene: Scene,
  parent: TransformNode,
  input: ConstructionRenderInput,
) {
  parent.metadata = { ...parent.metadata, instanceId: input.instanceId };
  const document = JSON.parse(
    compileConstruction(input.documentJson).canonical,
  ) as ConstructionDocument;
  if (
    document.layout.id !== input.instanceId ||
    !document.layout.decks.some((d) => d.id === input.deckId)
  )
    throw Error("Construction instance/deck mismatch");
  if (document.airlockRoom) {
    const native = bindNativeAirlockPlan(
      document as NativeAirlockDocument,
      compilePublishedNativeExternalAirlock,
      input.instanceId,
    );
    return loadNativeAirlockScene(scene, parent, {
      instanceId: input.instanceId,
      deckId: input.deckId,
      installation: native.installation,
      doors: native.doors.map((d) => ({
        openingId: d.id,
        originM: d.originM,
        quarterTurns: d.quarterTurns,
      })),
      elevationM: 0,
      sources: NATIVE_EXTERNAL_AIRLOCK_SOURCES,
    });
  }
  if (document.traversalRoom) {
    const native = nativeTraversalRoomInstallation(document, 1n, 1n);
    return loadConstructionTraversal(scene, parent, {
      instanceId: input.instanceId,
      selectedDeckId: input.deckId,
      lowerDeckId: native.lower.deckId,
      upperDeckId: native.upper.deckId,
      installation: native.parts,
      sources: NATIVE_TRAVERSAL_ROOM_SOURCES,
    });
  }
  if (document.pressureRoom) {
    const openingId = document.layout.openings[0].id;
    const native = compilePublishedNativePressureRoom({
      instanceId: input.instanceId,
      deckId: input.deckId,
      openingId,
      apertureFraction: 0,
      sealRetraction: 0,
      flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
    });
    return loadConstructionPressureRoom(scene, parent, {
      instanceId: input.instanceId,
      deckId: input.deckId,
      openingId,
      installation: native.installation,
      elevationM: document.layout.decks[0].elevation / 32,
      sources: NATIVE_PRESSURE_ROOM_SOURCES,
    });
  }
  const response = await fetch("/assets/assembly/floor-manifest.json");
  if (!response.ok) throw Error("Native floor catalog unavailable");
  const catalog = (await response.json()) as {
    entries: { asset: PartAsset }[];
  };
  const requested = document.floors.filter((p) => p.deckId === input.deckId);
  const assets = requested.map((p) => {
    const nominal = PINNED_FLOOR_KIT.parts.find((n) => n.id === p.partId)!;
    const asset = catalog.entries.find(
      (e) => e.asset.id === nominal.native.assetId,
    )?.asset;
    if (
      !asset?.visual ||
      asset.visual.sha256 !== nominal.native.sha256 ||
      asset.visual.nodePrefix !== nominal.native.nodePrefix ||
      `r${String(asset.visual.revision).padStart(3, "0")}` !==
        nominal.native.revision
    )
      throw Error("Pinned native floor visual mismatch");
    const offset = nominal.native.sourceToNominal;
    if (
      offset.translation.some((v) => v !== 0) ||
      offset.quarterTurns !== 0 ||
      offset.reflected
    )
      throw Error(
        "Native floor adapter requires explicit nonidentity transform support",
      );
    return asset;
  });
  const unique = [...new Map(assets.map((a) => [a.id, a])).values()],
    prototypes = await loadEquipmentPrototypes(scene, unique);
  const placements = requested.map((p, i) => {
    const asset = assets[i];
    const placement: PartPlacement = {
      id: p.id,
      assetId: asset.id,
      position: p.origin.map((v) => v / 32) as [number, number, number],
      rotation: (p.quarterTurns * Math.PI) / 2,
      flipped: p.reflected,
      removedCells: [],
    };
    const result = equipmentPlacement(
      scene,
      parent,
      asset,
      placement,
      prototypes.get(asset.id)!,
    );
    result.node.metadata = {
      ...result.node.metadata,
      instanceId: input.instanceId,
      deckId: input.deckId,
    };
    for (const m of result.meshes) {
      // Structural floors block the pick ray but are not selectable equipment.
      m.isPickable = true;
      m.metadata = {
        ...m.metadata,
        ...result.node.metadata,
        category: "floor",
      };
    }
    return result;
  });
  const authored = await loadConstructionAuthoredAssembly(
    scene,
    parent,
    document,
    input.deckId,
  );
  const deck = document.layout.decks.find((d) => d.id === input.deckId)!;
  const vertices = document.layout.tiles
    .filter((t) => t.deckId === input.deckId)
    .flatMap((t) => t.vertices);
  const minX = Math.min(...vertices.map((p) => p[0])) / 32,
    maxX = Math.max(...vertices.map((p) => p[0])) / 32;
  const minY = Math.min(...vertices.map((p) => p[1])) / 32,
    maxY = Math.max(...vertices.map((p) => p[1])) / 32;
  const perimeter = compileLayout(document.layout).walls.filter(
    (w) => w.deckId === input.deckId && w.source === "perimeter",
  );
  const familyPlan =
    document.boundaryKit?.revision === "r004"
      ? planPinnedBoundaryFamily(document.layout, input.deckId)
      : null;
  const boundaries = familyPlan
    ? await loadConstructionBoundaries(
        scene,
        parent,
        familyPlan.placements.map((p) => {
          const point: Point =
            p.aUnits && p.bUnits
              ? [
                  (p.aUnits[0] + p.bUnits[0]) / 2,
                  (p.aUnits[1] + p.bUnits[1]) / 2,
                ]
              : p.originUnits;
          const cutawayNormals = perimeter
            .filter((w) => onSegment(point, w.a, w.b))
            .map((w) => [w.b[1] - w.a[1], w.a[0] - w.b[0]] as Point);
          return {
            ...p,
            origin: [
              p.originUnits[0],
              p.originUnits[1],
              familyPlan.elevationUnits,
            ] as [number, number, number],
            cutawayNormals,
          };
        }),
        {
          sha256: CONSTRUCTION_BOUNDARY_FAMILY_GLB_SHA,
          url: CONSTRUCTION_BOUNDARY_FAMILY_URL,
          revision: "r004",
          parts: CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES.parts,
        },
      )
    : document.boundaryKit
      ? await loadConstructionBoundaries(
          scene,
          parent,
          planNativeBoundaries(document.layout, input.deckId, {
            floorTopUnits: 6,
          }).placements.map((p) => {
            const offset = transformPoint(
                [
                  p.partId === "wall-2m" ? 32 : p.partId === "wall-1m" ? 16 : 0,
                  0,
                ],
                p.quarterTurns,
              ),
              point: Point = [
                p.originUnits[0] + offset[0],
                p.originUnits[1] + offset[1],
              ];
            const cutawayNormals = perimeter
              .filter((w) => onSegment(point, w.a, w.b))
              .map((w) => [w.b[1] - w.a[1], w.a[0] - w.b[0]] as Point);
            return { ...p, origin: p.originUnits, cutawayNormals };
          }),
        )
      : null;
  const roofPlacements = document.roofKit
    ? planNativeRoofs(document, input.deckId)
    : [];
  const roofs = roofPlacements.length
    ? await loadConstructionRoofs(scene, parent, roofPlacements)
    : null;
  // Clearly marked review guides until a native wall interface is installed.
  const collision = compileDeckCollision(document.layout, input.deckId, {
    shipId: input.instanceId,
    perimeterHalfWidthM: 0,
    partitionHalfWidthM: 0,
  });
  for (const wall of boundaries || authored
    ? []
    : [...collision.walls, ...collision.openings]) {
    const height = deck.elevation / 32 + 0.21;
    const line = CreateLines(
      "construction-boundary-guide-" + wall.id,
      {
        points: [
          new Vector3(wall.a[0], height, -wall.a[1]),
          new Vector3(wall.b[0], height, -wall.b[1]),
        ],
      },
      scene,
    );
    line.parent = parent;
    line.color = Color3.FromHexString("#e3b85c");
    line.isPickable = false;
  }
  return {
    cameraFrame: {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      halfExtent: Math.max(maxX - minX, maxY - minY) / 2,
    },
    placements: [
      ...placements,
      ...(authored?.placements ?? []),
      ...(boundaries?.placements ?? []),
      ...(roofs?.placements ?? []),
    ],
    meshes: [
      ...placements.flatMap((p) => p.meshes),
      ...(authored?.meshes ?? []),
      ...(boundaries?.meshes ?? []),
      ...(roofs?.meshes ?? []),
    ],
    setDoors: boundaries?.setDoors ?? (() => {}),
    setView(cameraPosition: Vector3, interior: boolean) {
      boundaries?.setView(cameraPosition, interior);
      roofs?.setVisible(!interior);
      authored?.setView(cameraPosition, interior);
    },
    dispose() {
      authored?.dispose();
    },
    walkingElevation:
      deck.elevation / 32 + PINNED_FLOOR_KIT.datums.floorTop / 32,
  };
}
/** Shared star/fill only. Laboratory room fixtures never appear on authored instances. */
export function createConstructionLighting(
  scene: Scene,
  meshes: AbstractMesh[],
) {
  const fill = new HemisphericLight("construction-fill", Vector3.Up(), scene);
  fill.intensity = 0.35;
  fill.groundColor = new Color3(0.04, 0.06, 0.11);
  const sun = new DirectionalLight(
    "construction-star",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.position.set(18, 30, -18);
  sun.intensity = 2.1;
  const shadow = new ShadowGenerator(1024, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.bias = 0.0035;
  shadow.normalBias = 0.015;
  const addActor = (actors: AbstractMesh[]) => {
    for (const mesh of actors) {
      mesh.receiveShadows = true;
      shadow.addShadowCaster(mesh);
    }
  };
  addActor(meshes);
  return {
    primaryLight: sun,
    addActor,
    setCabinVisible(_visible: boolean) {},
    update(_blend: number, _x: number, _y: number) {},
    getLocalLightSources(_allowed = true): ManagedLocalLight[] {
      return [];
    },
  };
}
