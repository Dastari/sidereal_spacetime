/** Real production renderer/kit, accepted-shaped fixture data; no auth, database or reducers. */
import { createWorld, type SceneState } from "@sidereal/render";
import { createGameUI, type GameUIState } from "@sidereal/canvas-ui";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import type { Scene } from "@babylonjs/core/scene";
import {
  readSteeringStyle,
  saveSteeringStyle,
  type SteeringStyle,
} from "@sidereal/canvas-ui/control-settings";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow-condensed/600.css";
const canvas = document.createElement("canvas");
canvas.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block";
canvas.tabIndex = 0;
document.body.style.margin = "0";
document.body.appendChild(canvas);
const doc = HULL_ACCESS_SOURCE;
const definition = prefabConstructionDocument(
  doc,
  defaultPrefabComponentCatalog(),
);
const shipId = definition.layout.id;
const deckId = definition.layout.decks[0].id;
const construction = {
  instanceId: shipId,
  documentJson: JSON.stringify(definition),
  deckId: deckId,
  visitId: "fixture-visit",
};
const snapshot = {
  epoch: 1,
  shipMotion: [{ shipId: shipId }],
  shipDescription: [
    {
      shipId: shipId,
      publishedExteriorAssetId: "prefab:" + doc.id,
      appearanceRevision: BigInt(doc.revision),
    },
  ],
};
let local: string | undefined = shipId,
  scene: Scene,
  ready = false,
  error = "";
let gui: ReturnType<typeof createGameUI> | undefined;
let revision = 1n,
  yaw = 0;
let state: SceneState = {
  heading: 0,
  x: 0,
  y: 0,
  localX: 0,
  localY: 0,
  interior: true,
  inspect: false,
  grid: false,
  constructionDeckId: deckId,
  constructionSupportElevation: 0.1875,
  furnishings: { instanceId: construction.instanceId, revision, json: "{}" },
  crewAppearance: { outfit: "engineer" },
  bodies: [],
};
let uiState: GameUIState = {
  status: "ready",
  error: "",
  modelStatus: "Offline production-code fixture",
  hasActor: true,
  connected: true,
  actorName: "Illustrative character",
  shipName: "Wayfarer fixture",
  seated: false,
  nearStation: false,
  interior: true,
  receipts: 0,
  pending: false,
  vistaId: "frontier",
  reducedMotion: false,
  destinations: [],
  steeringStyle: readSteeringStyle(localStorage),
};
const world = await createWorld(
  canvas,
  () => {
    ready = true;
  },
  {
    construction,
    authoredFlightEffects: true,
    sharedWorld: {
      bodies: () => undefined,
      ships: {
        localShipId: () => local,
        warmShipId: () => shipId,
        store: {
          getSnapshot: () => snapshot,
          subscribeTable: () => () => {},
          sampleShip: () => ({ x: 0, y: 0, heading: 0 }),
        },
      },
    },
    onScene: (value) => {
      scene = value;
      const nothing = () => {};
      gui = createGameUI(
        canvas,
        scene,
        uiState,
        {
          view: nothing,
          station: nothing,
          enter: nothing,
          rename: nothing,
          vista: nothing,
          motion: nothing,
          camera: () => world.resetCamera(),
          focusDestination: nothing,
          crew: nothing,
          dismiss: nothing,
          retry: nothing,
          steeringStyle: (style: SteeringStyle) => {
            saveSteeringStyle(style, localStorage);
            uiState = { ...uiState, steeringStyle: style };
            gui?.update(uiState);
          },
        },
        [],
      );
    },
    onObjectSelected: (id) => {
      state = { ...state, selectedObject: id };
      world.update(state);
    },
    blocksCameraInput: () => gui?.blocked() ?? false,
    blocksObjectSelection: () => gui?.pointerBlocked() ?? false,
    onLoadError: (value) => (error = value),
  },
);
world.update(state);
const stats = () => ({
  ready,
  error,
  engines: EngineStore.Instances.length,
  meshes: scene.meshes.length,
  materials: scene.materials.length,
  nodes: scene.transformNodes.length,
  observers: scene.onBeforeRenderObservable.observers.length,
  sceneId: scene.uid,
  privateRoots: scene.transformNodes.filter(
    (n) => n.name === "local-vessel" && !n.isDisposed(),
  ).length,
  remote: world.getSharedWorldDiagnostics().remoteShips,
  domWidgets: document.querySelectorAll(
    "button,input,select,form,[role=dialog]",
  ).length,
  steeringStyle: uiState.steeringStyle,
  detachedMaterials: scene.meshes
    .filter((m) => m.material && !scene.materials.includes(m.material))
    .map((m) => ({ mesh: m.name, material: m.material!.name }))
    .slice(0, 8),
  selectedVertices:
    scene.getMeshByName("prefab-object-selected")?.getTotalVertices() ?? 0,
});
Object.assign(window, {
  __evaFixture: {
    stats,
    async exit() {
      local = undefined;
      await world.setVessel({});
      state = {
        ...state,
        interior: false,
        furnishings: undefined,
        selectedObject: undefined,
        constructionDeckId: undefined,
        localX: 7,
        localY: -3,
        eva: {
          phase: "free",
          localHeading: 0,
          elevation: 0.1875,
          forward: 0,
          strafe: 0,
          turn: 0,
          walking: false,
          cycling: false,
        },
      };
      world.update(state);
      uiState = {
        ...uiState,
        interior: false,
        eva: {
          label: "EVA fixture",
          help: "Offline accepted-shaped pose",
          maglock: false,
          stranded: false,
          beacon: false,
        },
      };
      gui?.update(uiState);
      return stats();
    },
    async board() {
      await world.setVessel({ construction, authoredFlightEffects: true });
      local = shipId;
      state = {
        ...state,
        interior: true,
        eva: null,
        localX: 0,
        localY: 0,
        constructionDeckId: deckId,
        furnishings: {
          instanceId: construction.instanceId,
          revision,
          json: "{}",
        },
      };
      world.update(state);
      uiState = { ...uiState, interior: true, eva: undefined };
      gui?.update(uiState);
      return stats();
    },
    rotate() {
      yaw += Math.PI / 12;
      revision++;
      const json = JSON.stringify({
        Cargo_crate_white_blue: {
          dx: 0,
          dy: 0,
          yaw,
          snap: true,
          deleted: false,
        },
      });
      state = {
        ...state,
        furnishings: { instanceId: construction.instanceId, revision, json },
        selectedObject: "prefab:socket:Cargo_crate_white_blue",
      };
      world.update(state);
      return stats();
    },
    menu() {
      canvas.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
      return stats();
    },
    async cancelBoard() {
      const pending = world.setVessel({ construction });
      await world.setVessel({});
      return { applied: await pending, ...stats() };
    },
  },
});
import.meta.hot?.dispose(() => {
  gui?.dispose();
  world.dispose();
  canvas.remove();
});
