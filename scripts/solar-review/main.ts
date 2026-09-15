import { createCharacterPreview } from "../../packages/render/src/character-preview";
import {
  createWorld,
  loadEquipmentPoseConfiguration,
  type SceneState,
} from "../../packages/render/src/index";
import { SOLAR_SYSTEM } from "../../packages/content/src/shared-system";
const canvas = document.querySelector("canvas")!;
const bodies = SOLAR_SYSTEM.bodies.map((body) => ({
  ...body,
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
}));
const selector = document.querySelector<HTMLSelectElement>("#body")!;
for (const body of SOLAR_SYSTEM.bodies) {
  const option = document.createElement("option");
  option.value = body.id;
  option.textContent = body.name;
  selector.append(option);
}
let state: SceneState = {
  heading: 0,
  x: 0,
  y: 0,
  localX: 0,
  localY: 0,
  interior: false,
  inspect: false,
  grid: false,
  bodies,
};
const controller = new AbortController();
let portrait: ReturnType<typeof createCharacterPreview> | undefined;
let portraitOpen = false;
const portraitButton = document.querySelector<HTMLButtonElement>("#portrait")!;
portraitButton.addEventListener("click", () => {
  portraitOpen = !portraitOpen;
  if (portraitOpen && !portrait) {
    portrait = createCharacterPreview();
    portrait.canvas.className = "portrait";
    document.body.append(portrait.canvas);
  }
  if (portrait) portrait.canvas.hidden = !portraitOpen;
});
let frames = 0;
let world: Awaited<ReturnType<typeof createWorld>> | undefined;
let latestDiagnostics: ReturnType<NonNullable<typeof world>["getDiagnostics"]>;
let diagnosticsUpdatedFrame = 0;
const status = document.querySelector("#status")!;
Object.assign(window, {
  solarReview: {
    get world() {
      return world;
    },
    get state() {
      return state;
    },
  },
});
loadEquipmentPoseConfiguration()
  .then((equipmentPose) =>
    createWorld(canvas, (text) => (status.textContent = text), {
      equipmentPose,
      signal: controller.signal,
      onScene: (scene) => {
        Object.assign((window as any).solarReview, { scene });
        // Match the production HUD: portrait rendering nests inside onBeforeRender.
        scene.onBeforeRenderObservable.add(() => {
          if (portraitOpen) portrait?.render(performance.now() / 1000);
        });
        scene.onAfterRenderObservable.add(() => {
          frames++;
          if (frames % 10 === 0 && world) {
            const snapshot = world.getDiagnostics(true);
            if (snapshot) {
              latestDiagnostics = snapshot;
              diagnosticsUpdatedFrame = frames;
            }
            const data = {
              frames,
              portrait: {
                open: portraitOpen,
                status: portrait?.presentationStatus,
              },
              floatingOrigin: scene.floatingOriginMode,
              diagnostics: latestDiagnostics,
              diagnosticsUpdatedFrame,
              camera: scene.activeCamera?.position.asArray(),
              target: (scene.activeCamera as any)?.target?.asArray(),
            };
            canvas.dataset.review = JSON.stringify(data);
            document.querySelector("#stats")!.textContent = JSON.stringify(
              data,
              null,
              2,
            );
          }
        });
      },
    }),
  )
  .then((result) => {
    world = result;
    world.update(state);
  })
  .catch((error) => {
    status.textContent = String(error);
    console.error(error);
  });
document
  .querySelector("#observe")!
  .addEventListener("click", () => world?.focusBody(selector.value));
for (const mode of ["deck", "flight"])
  document.querySelector("#" + mode)!.addEventListener("click", () => {
    world?.focusBody();
    state = { ...state, interior: mode === "deck" };
    world?.update(state);
  });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    portrait?.dispose();
    controller.abort();
    world?.dispose();
  });
