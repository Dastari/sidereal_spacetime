import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  readWayfarerAuthoredStudy,
  WAYFARER_AUTHORED_STUDY_PINS,
  type AuthoredStudyInstance,
} from "@sidereal/content/wayfarer-authored-study";
import {
  applyWayfarerAuthoredPlacementEdits,
  assertWayfarerPrefabContract,
} from "@sidereal/content/wayfarer-authored-gameplay";
import {
  placeMount,
  volumeGeometry,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { moldedLightRig } from "../molded-plastic";
import { registerLocalPbrLight } from "../pbr-light-budget";
import {
  componentMatrix,
  prefabFrameMatrix,
  prefabToShipLocal,
} from "./frames";
import { loadAuthoredStudy } from "./wayfarer-authored-study";
import type { PrefabShipView, PrefabShipViewOptions } from "./ship-view";

const BASE = "/assets/ship-study/wayfarer-authored-r001/";
const RCS = {
  id: "engine.rcs.md.wayfarer-r001",
  file: "rcs.md.glb",
  sha256: "9e7f2d54f90e3d5f0cd0e1900b6d76f9534e33c9552abe21ce6dd7e7b50eda51",
  triangles: 2570,
  frame: "piece-local" as const,
};
const OMITTED = new Set(["Hall_crew_chibi", "Hall_selection_ring"]);
const EXTERIOR = new Set([
  "canopy",
  "engine-pod",
  "hull-bay",
  "hull-corner",
  "livery",
  "nose",
  "structure",
]);
const LOUNGE = new Set([
  ...[-3, -2, -1, 0].flatMap((x) =>
    [-5, -4, -3, -2].map((y) => `FLOOR_lounge_${x}_${y}`),
  ),
  "Lounge_coffee_table",
  "Lounge_plant_tall",
  "Lounge_poster_goodcrew",
  "Lounge_shelf_unit",
  "Lounge_sofa_l",
  "Lounge_walls_hall_post",
  "Lounge_walls_lounge_alcove",
  "PART_lounge_front",
  "POST_lounge_front",
  "POST_lounge_opening",
  ...["05", "06", "07", "08"].flatMap((n) => [
    `WALL_far_${n}`,
    `LINER_far_${n}`,
  ]),
]);

/** Remote prototypes contain only published external geometry, never furniture or room lights. */
export function wayfarerVisiblePlacements(
  instances: readonly AuthoredStudyInstance[],
  exteriorOnly: boolean,
) {
  return instances
    .filter(
      (row) =>
        !OMITTED.has(row.object) && (!exteriorOnly || EXTERIOR.has(row.role)),
    )
    .map((row) => ({
      ...row,
      matrix: applyWayfarerAuthoredPlacementEdits(row.object, row.matrix),
    }));
}

async function bytes(url: string, pin?: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Wayfarer asset unavailable: ${url}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (pin && bytesToHex(sha256(data)) !== pin)
    throw Error(`Changed pinned Wayfarer asset: ${url}`);
  return data;
}

/** The trusted authored prefab's normal game view; no private harness scene or camera is used. */
export async function createWayfarerLiveView(
  scene: Scene,
  doc: ShipPrefabDocumentV1,
  options: PrefabShipViewOptions,
): Promise<PrefabShipView> {
  assertWayfarerPrefabContract(doc);
  const root = new TransformNode(`prefab-ship:${doc.id}`, scene);
  root.parent = options.parent ?? null;
  root.position.y = 0.1875;
  // Remote hull proxies share the same author-to-game projection as detailed geometry.
  const frame = new TransformNode(`prefab-ship:${doc.id}:prefab-frame`, scene);
  frame.parent = root;
  frame.rotationQuaternion = new Quaternion();
  Matrix.FromArray(prefabFrameMatrix([0, 0])).decompose(
    frame.scaling,
    frame.rotationQuaternion,
    frame.position,
  );
  const lights: PointLight[] = [];
  let candidate: Awaited<ReturnType<typeof loadAuthoredStudy>> | undefined;
  try {
    const [manifestBytes, layoutBytes, descriptorBytes] = await Promise.all([
      bytes(
        `${BASE}manifest.json`,
        WAYFARER_AUTHORED_STUDY_PINS.manifestSha256,
      ),
      bytes(`${BASE}layout.json`, WAYFARER_AUTHORED_STUDY_PINS.layoutSha256),
      bytes(`${BASE}descriptor.json`),
    ]);
    const parse = (data: Uint8Array): unknown =>
      JSON.parse(new TextDecoder().decode(data));
    const layout = parse(layoutBytes);
    const study = readWayfarerAuthoredStudy(
      parse(manifestBytes),
      layout,
      parse(descriptorBytes),
    );
    const instances = wayfarerVisiblePlacements(
      study.instances,
      options.exteriorOnly === true,
    );
    const geometries = doc.volumes.map(volumeGeometry);
    for (const mount of doc.mounts.filter((mount) =>
      mount.component.startsWith("rcs."),
    )) {
      const spec = options.catalog.get(mount.component);
      const placement = placeMount(mount, spec, geometries, doc);
      const matrix = componentMatrix(
        placement.anchor,
        placement.anchorZ / 16 - 0.1875,
        placement.quarterTurns,
      );
      instances.push({
        object: `RCS_${mount.id}`,
        piece: RCS.id,
        role: "engine-pod",
        room: null,
        matrix: Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 4 }, (_, c) => matrix[c * 4 + r]),
        ),
        originalMatrix: [],
        frame: "piece-local",
        trueScale: true,
        mirrored: false,
      });
    }
    const used = new Set(instances.map((row) => row.piece));
    const regions = new Map(
      instances.map((row) => [
        row.object,
        `${options.exteriorOnly ? "exterior" : "own"}/${LOUNGE.has(row.object) || row.object === "HULL_far_bay04_cluster" ? "lounge" : "rest"}`,
      ]),
    );
    candidate = await loadAuthoredStudy(
      scene,
      [
        ...study.pieces.filter((piece) => used.has(piece.id)),
        ...(used.has(RCS.id) ? [RCS] : []),
      ],
      instances,
      study.palette,
      [0, 0],
      (piece) => bytes(`${BASE}${piece.file}`),
      { batchRegions: regions },
    );
    if (scene.isDisposed || root.isDisposed())
      throw Error("Wayfarer view load cancelled");
    for (const mesh of candidate.meshes) mesh.parent = root;
    moldedLightRig(scene).include(candidate.meshes);
    // The game creates its construction lights after loading its ship. Configure the
    // owned surfaces when those lights exist, preserving other actors' fill lighting.
    const lightingObserver = scene.onBeforeRenderObservable.addOnce(() => {
      if (root.isDisposed() || options.exteriorOnly) return;
      const fill = scene.getLightByName("construction-fill");
      if (fill) fill.excludedMeshes.push(...candidate!.meshes);
      const shadow = scene
        .getLightByName("construction-star")
        ?.getShadowGenerator();
      if (shadow instanceof ShadowGenerator) {
        shadow.bias = 0.0005;
        shadow.normalBias = 0.01;
        for (const mesh of candidate!.meshes) shadow.addShadowCaster(mesh);
      }
    });
    if (!options.exteriorOnly) {
      const fixtureLimit = Math.max(
        0,
        Math.min(8, Math.floor(options.roomLights ?? 8)),
      );
      const selected = new Set(
        [
          "LT_pool_8",
          "LT_pool_9",
          "LT_pool_15",
          "LT_pool_31",
          "LT_pool_34",
          "LT_pool_14",
          "LT_pool_21",
          "LT_pool_22",
        ].slice(0, fixtureLimit),
      );
      const loungeLights = new Set([
        "LT_pool_14",
        "LT_pool_21",
        "LT_pool_22",
        "LT_pool_34",
      ]);
      const rows = (
        layout as {
          lights: {
            name: string;
            location: [number, number, number];
            colour: [number, number, number];
            watts: number;
            radius: number;
          }[];
        }
      ).lights;
      for (const row of rows.filter((row) => selected.has(row.name))) {
        const light = new PointLight(
          `wayfarer:${root.uniqueId}:${row.name}`,
          Vector3.FromArray(prefabToShipLocal(row.location, [0, 0])),
          scene,
        );
        light.parent = root;
        light.diffuse = Color3.FromArray(row.colour);
        light.specular = Color3.Black();
        light.intensity = row.watts / 10;
        light.intensityMode = Light.INTENSITYMODE_LUMINOUSINTENSITY;
        light.falloffType = Light.FALLOFF_STANDARD;
        light.radius = row.radius;
        light.range = 1.8;
        light.shadowEnabled = false;
        light.includedOnlyMeshes = candidate.meshes.filter((mesh) => {
          const region = mesh.metadata.authoredStudy.receiverRegion;
          return region.endsWith("/lounge")
            ? loungeLights.has(row.name)
            : !loungeLights.has(row.name) || row.name === "LT_pool_34";
        });
        registerLocalPbrLight(light, `wayfarer:${root.uniqueId}:${row.name}`);
        lights.push(light);
      }
    }
    let view = options.exteriorOnly ? "flight" : options.view;
    const setView = (next: "deck" | "flight") => {
      view = options.exteriorOnly ? "flight" : next;
      // This accepted source is an open cutaway without authored roof tiles. Keep
      // the owner's furnished deck visible during flight; remote geometry was
      // filtered before import and never contains that interior.
      for (const mesh of candidate!.meshes) mesh.setEnabled(true);
      for (const light of lights) light.setEnabled(true);
    };
    setView(view);
    return {
      root,
      // Authored geometry is already dressed. No procedural dressing is admitted to this view.
      dressed: {
        id: doc.id,
        theme: doc.theme,
        markings: doc.markings,
        kit: [],
        generated: [],
        decals: [],
        components: [],
        objects: [],
        lights: [],
        labels: [],
        contacts: [],
        bounds: [-11, -6.5, 13, 6.5],
        stats: {
          cassettes: 0,
          roof: 0,
          skins: 0,
          floors: 0,
          walls: 0,
          partitions: 0,
          doors: 0,
          posts: 0,
          sockets: 0,
        },
      },
      setView,
      async update(next) {
        if (JSON.stringify(next) !== JSON.stringify(doc))
          throw Error(
            "Authored Wayfarer requires a new pinned prefab revision for edits",
          );
      },
      setTheme(next) {
        if (next !== doc.theme)
          throw Error("Authored Wayfarer materials are pinned to its faction");
      },
      emissiveMeshes: () =>
        candidate!.meshes.filter(
          (mesh) =>
            mesh.material instanceof PBRMaterial &&
            mesh.material.emissiveColor
              .asArray()
              .some((channel) => channel > 0),
        ),
      metrics() {
        const meshes = candidate!.meshes.filter((mesh) => mesh.isEnabled());
        const triangles = meshes.reduce(
          (n, mesh) => n + mesh.getTotalIndices() / 3,
          0,
        );
        return {
          visualRevision: "wayfarer-authored-r001-live",
          drawCalls: scene.getEngine()._drawCalls?.current ?? 0,
          instances: instances.length,
          triangles,
          pieces: used.size,
          meshes: meshes.length,
          kitTriangles: triangles,
          generatedTriangles: 0,
          glbTriangles: triangles,
          effectTriangles: 0,
          componentGlbs: instances.filter(
            (row) => row.role === "engine-pod" && !row.piece.endsWith(".logos"),
          ).length,
          componentStandins: 0,
        };
      },
      dispose() {
        scene.onBeforeRenderObservable.remove(lightingObserver);
        const owned = new Set<AbstractMesh>(candidate!.meshes);
        const fill = scene.getLightByName("construction-fill");
        if (fill)
          fill.excludedMeshes = fill.excludedMeshes.filter(
            (mesh) => !owned.has(mesh),
          );
        for (const light of lights) light.dispose();
        candidate!.dispose();
        root.dispose();
      },
    };
  } catch (error) {
    for (const light of lights) light.dispose();
    candidate?.dispose();
    root.dispose();
    throw error;
  }
}
