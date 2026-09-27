/** Browser review fixture: production character/inventory UI, real private DB
 * projections and reducers; empty background scene avoids ship shader contention. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { DbConnection, tables } from "../../packages/net/src/generated";
import { createGameUI, type GameUIState } from "../../packages/canvas-ui/src";
import { inventoryView } from "../../apps/client/src/inventory";
const canvas = document.querySelector("canvas")!;
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.012, 0.027, 0.06, 1);
scene.activeCamera = new FreeCamera(
  "review-background",
  new Vector3(0, 1, -5),
  scene,
);
const database = "sidereal-character-components-review-20260909";
const tokenKey = "sidereal.components.review.token";
const connection = await new Promise<DbConnection>((resolve, reject) =>
  DbConnection.builder()
    .withUri(location.origin)
    .withDatabaseName(database)
    .withToken(localStorage.getItem(tokenKey) ?? undefined)
    .onConnect((c, _, token) => {
      if (token) localStorage.setItem(tokenKey, token);
      c.subscriptionBuilder()
        .onApplied(() => resolve(c))
        .subscribe([
          tables.ownCharacters,
          tables.ownStations,
          tables.ownAppearance,
          tables.ownInventoryItems,
          tables.ownInventoryContainers,
          tables.ownInventoryState,
          tables.ownInventoryHotbar,
        ]);
    })
    .onConnectError((_, e) => reject(e))
    .build(),
);
await connection.reducers.enterLab({ name: "Component Review" });
await connection.reducers.claimStarterKit({});
let pending = false,
  error = "";
const state = (): GameUIState => {
  const actor = [...connection.db.ownCharacters.iter()][0],
    appearance = [...connection.db.ownAppearance.iter()][0];
  return {
    status: "ready",
    modelStatus: "Modular crew r002",
    hasActor: !!actor,
    connected: !!actor?.connected,
    actorName: actor?.name ?? "",
    shipName: "Wayfarer",
    characterAppearance: appearance
      ? JSON.parse(appearance.appearanceJson)
      : {},
    inventory: inventoryView(connection, true),
    seated: !![...connection.db.ownStations.iter()][0]?.occupantId,
    nearStation: false,
    interior: true,
    receipts: 0,
    pending,
    error,
    vistaId: "",
    reducedMotion: true,
    destinations: [],
  };
};
const command = () => ({
  expectedRevision: [...connection.db.ownInventoryState.iter()][0].revision,
  operationId: crypto.randomUUID(),
});
const perform = async (run: () => Promise<unknown>) => {
  if (pending) return;
  pending = true;
  try {
    await run();
    error = "";
  } catch (e) {
    error = String(e);
  } finally {
    pending = false;
    gui.update(state());
  }
};
const gui = createGameUI(
  canvas,
  scene,
  state(),
  {
    inventory: {
      claimKit: () =>
        void perform(() => connection.reducers.claimStarterKit({})),
      moveItem: (p) =>
        void perform(() =>
          connection.reducers.moveInventoryItem({ ...p, ...command() }),
        ),
      equipItem: (itemId) =>
        void perform(() =>
          connection.reducers.equipInventoryItem({ itemId, ...command() }),
        ),
      assignHotbar: (slot, itemId) =>
        void perform(() =>
          connection.reducers.assignInventoryHotbar({
            slot,
            itemId,
            ...command(),
          }),
        ),
      activateHotbar: (slot) =>
        void perform(() =>
          connection.reducers.activateInventoryHotbar({ slot, ...command() }),
        ),
    },
    crew: (patch) =>
      void perform(() => {
        const old = [...connection.db.ownAppearance.iter()][0];
        return connection.reducers.setCharacterAppearance({
          appearanceJson: JSON.stringify({
            ...JSON.parse(old.appearanceJson),
            ...patch,
          }),
          expectedRevision: old.revision,
          operationId: crypto.randomUUID(),
        });
      }),
    view: () => {},
    station: () => {},
    enter: () => {},
    rename: () => {},
    vista: () => {},
    motion: () => {},
    camera: () => {},
    focusDestination: () => {},
    dismiss: () => {
      error = "";
    },
    retry: () => {},
  },
  [],
);
for (const table of [
  connection.db.ownCharacters,
  connection.db.ownAppearance,
  connection.db.ownInventoryItems,
  connection.db.ownInventoryContainers,
  connection.db.ownInventoryState,
  connection.db.ownInventoryHotbar,
])
  for (const method of ["onInsert", "onDelete", "onUpdate"] as const)
    (table[method] as Function)(() => gui.update(state()));
engine.resize();
let last = 0;
engine.runRenderLoop(() => {
  if (performance.now() - last < 160) return;
  last = performance.now();
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
Object.assign(window, {
  __componentReview: { connection, gui, scene, state, engine },
});
