import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {
  loadAuthoredAccessDoors,
  type AuthoredAccessDoorState,
} from "../../packages/render/src/prefab-ship/authored-access-doors";
import { type ShipAccessDoorVariant } from "@sidereal/content/ship-access-doors";
import SHIP_ACCESS_DOOR_PACK from "../../assets/runtime/hull-access/r001/manifest.json";
import { moldedLightRig } from "../../packages/render/src/molded-plastic";
import { createGlowOccluders } from "../../packages/render/src/glow-occluders";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const review: {
  ready: boolean;
  error?: string;
  state: string;
  triangles?: number;
  meshes?: number;
  setState?: (value: string) => void;
  doors?: unknown;
  scene?: Scene;
} = { ready: false, state: "closed" };
Object.assign(window, { __accessDoors: review });
async function main() {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.012, 0.025, 0.06, 1);
  review.scene = scene;
  const camera = new ArcRotateCamera(
    "access-review-camera",
    -0.9,
    1.1,
    12,
    new Vector3(0, 1.1, 0),
    scene,
  );
  camera.position = new Vector3(4, 4, -10);
  camera.setTarget(new Vector3(0, 1.05, 0));
  camera.attachControl(canvas, true);
  camera.minZ = 0.05;
  const key = new DirectionalLight("key", new Vector3(-0.5, -1, 0.5), scene);
  key.intensity = 2.4;
  const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  fill.intensity = 0.7;
  fill.groundColor = new Color3(0.08, 0.1, 0.18);
  const root = new TransformNode("access-review", scene);
  const q = new URLSearchParams(
    (window as unknown as { __accessDoorQuery?: string }).__accessDoorQuery ??
      location.search,
  );
  const lineup = q.get("lineup") === "1";
  const variants: ShipAccessDoorVariant[] = lineup
    ? ["personnel", "cargo.2m", "cargo.4m", "cargo.6m"]
    : ["personnel", "cargo.4m"];
  let cursor = 0;
  const placements = variants.map((variant) => {
    const row = SHIP_ACCESS_DOOR_PACK.variants.find((v) => v.id === variant)!;
    const reservedWidth = row.spanM + row.requiresPocketReservationM * 2;
    const center = cursor + row.spanM / 2;
    cursor += row.spanM + 1.5;
    return {
      id: variant,
      variant,
      center: [center, 0] as [number, number],
      normal: [0, 1] as [number, number],
      floorM: 0,
    };
  });
  root.position.x = -cursor / 2 + 0.5;
  camera.position = new Vector3(4, 4, -cursor * 1.1);
  if (lineup) {
    camera.position = new Vector3(6, 5, -cursor * 1.15);
    camera.setTarget(new Vector3(0, 1, 0));
  }
  const doors = await loadAuthoredAccessDoors(scene, root, placements, {
    pack: SHIP_ACCESS_DOOR_PACK,
    fetchBytes: async (piece) => {
      const url = "/assets/hull-access/r001/" + piece.file;
      const fixtures = (
        window as unknown as { __accessDoorBytes?: Record<string, string> }
      ).__accessDoorBytes;
      const encoded = fixtures?.[url];
      if (encoded)
        return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const response = await fetch(url);
      if (!response.ok) throw Error(`Review asset unavailable: ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  });
  const rig = moldedLightRig(scene);
  rig.include(doors.meshes());
  const glow = new GlowLayer("access-glow", scene, {
    blurKernelSize: 24,
    mainTextureFixedSize: 512,
  });
  glow.intensity = 0.25;
  const emitters = doors
    .meshes()
    .filter(
      (m) =>
        m.material instanceof PBRMaterial &&
        m.material.emissiveColor.r +
          m.material.emissiveColor.g +
          m.material.emissiveColor.b >
          0.05,
    );
  emitters.forEach((m) => glow.addIncludedOnlyMesh(m));
  const occluders = createGlowOccluders(glow);
  occluders.set(doors.meshes().filter((m) => !emitters.includes(m)));
  let states: Map<string, AuthoredAccessDoorState> | undefined = new Map();
  const render = () => {
    doors.update(states, engine.getDeltaTime() / 1000);
    scene.render();
    review.doors = doors.states();
  };
  review.setState = (value) => {
    review.state = value;
    states =
      value === "missing"
        ? undefined
        : new Map(
            placements.map((p) => [
              p.id,
              {
                open: value === "open" || value === "locked",
                locked: value === "locked",
              },
            ]),
          );
    doors.update(states, 0.7);
    render();
    status.textContent = `${value.toUpperCase()} · ${doors
      .states()
      .map((d) => `${d.id}: ${d.open.toFixed(2)}`)
      .join(" / ")}`;
  };
  for (const id of ["closed", "open", "locked", "missing"])
    document.querySelector<HTMLButtonElement>("#" + id)!.onclick = () =>
      review.setState!(id);
  review.setState(q.get("state") ?? "closed");
  review.triangles = doors
    .meshes()
    .reduce((n, m) => n + m.getTotalIndices() / 3, 0);
  review.meshes = doors.meshes().length;
  await scene.whenReadyAsync();
  render();
  review.ready = true;
  engine.runRenderLoop(render);
  window.addEventListener("resize", () => engine.resize());
  import.meta.hot?.dispose(() => {
    doors.dispose();
    occluders.dispose();
    scene.dispose();
    engine.dispose();
  });
}
main().catch((error) => {
  review.error = String(error);
  status.textContent = review.error;
  console.error(error);
});
