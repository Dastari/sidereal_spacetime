/** Isolated visual calibration harness. Real Babylon crew renderer and GLBs;
 * this page never connects to authority or issues preview equipment to players. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { createCrewVisual } from "../../packages/render/src/crew";
import { createHolographicDisc } from "../../packages/render/src/holographic-disc";
import { CHARACTER_COMPONENT_SETS } from "../../packages/content/src/character-components";
const candidate = new URL(location.href).searchParams.get("revision") ?? "r008";
const folder =
  "/@fs/root/sidereal_spacetime/.runtime/character-reference/" + candidate;
type Pane = {
  id: string; engine: Engine; scene: Scene; camera: ArcRotateCamera;
  pivot: TransformNode; crew: Awaited<ReturnType<typeof createCrewVisual>>;
  disc: ReturnType<typeof createHolographicDisc>; key: DirectionalLight; fill: HemisphericLight;
};
const panes: Pane[] = [];
for (const [id, url] of [
  ["previous", "/@fs/root/sidereal_spacetime/assets/art-library/character-components/publications/r008/rollback-r002/modular-crew.glb"],
  ["candidate", folder + "/modular-crew.glb"],
]) {
  const canvas = document.querySelector<HTMLCanvasElement>("#" + id)!;
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.019, 0.034, 0.066, 1);
  scene.environmentTexture = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    64,
    false,
    true,
    false,
    true,
  );
  scene.environmentIntensity = 0.35;
  const camera = new ArcRotateCamera(
    "calibration-camera",
    -Math.PI / 2 + 0.19,
    1.31,
    5,
    new Vector3(0, 1.01, 0),
    scene,
  );
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.01;
  camera.maxZ = 20;
  camera.orthoTop = 1.17;
  camera.orthoBottom = -1.17;
  camera.orthoLeft = (-1.17 * 400) / 560;
  camera.orthoRight = (1.17 * 400) / 560;
  const key = new DirectionalLight(
    "portrait-soft-key",
    new Vector3(0.4, -0.7, 0.75),
    scene,
  );
  key.diffuse = new Color3(0.84, 0.91, 1);
  key.intensity = 2.8;
  const fill = new HemisphericLight("portrait-fill", Vector3.Up(), scene);
  fill.diffuse = new Color3(0.6, 0.77, 1);
  fill.groundColor = new Color3(0.025, 0.07, 0.13);
  fill.intensity = 0.58;
  const pivot = new TransformNode("portrait-display-pivot", scene);
  pivot.rotation.y = 0.38;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Character review asset: HTTP ${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const crew = await createCrewVisual(scene, pivot, bytes);
  const disc = createHolographicDisc(scene, { radius: 0.64 });
  disc.setSubjects(pivot.getChildMeshes());
  panes.push({ id, engine, scene, camera, pivot, crew, disc, key, fill });
}
let body: "male" | "female" = "female",
  look = "open",
  hair = "ponytail",
  clip = "Idle",
  time = 0,
  azimuth = 0.38,
  lighting = "portrait";
function apply() {
  for (const p of panes) {
    const equippedComponents =
      look === "bare" ? {} : { ...CHARACTER_COMPONENT_SETS.medic };
    if (look === "mixed") Object.assign(equippedComponents, {
      helmet: CHARACTER_COMPONENT_SETS.captain.helmet,
      legs: CHARACTER_COMPONENT_SETS.engineer.legs,
      back: CHARACTER_COMPONENT_SETS.recon.back,
    });
    if (look === "open") {
      delete equippedComponents.helmet;
      delete equippedComponents.visor;
    }
    p.crew.customize({
      outfit: "medic",
      bodyType: body,
      equippedComponents,
      hairStyle: hair as "ponytail",
      skin: "#EBC2AC",
      hair: "#252139",
      weapon: "none",
      weaponFixture: false,
    });
    // Deliberately explicit new staged design; no body-dependent equipment swap.
    for (const mesh of p.crew.root.getChildMeshes())
      if (mesh.name.startsWith("GEO-medic-open-comms"))
        mesh.setEnabled(look === "open" && p.id === "candidate");
    for (const g of p.scene.animationGroups) g.stop();
    p.scene.skeletons[0]?.returnToRest();
    const active = p.scene.animationGroups.find((g) => g.name === (clip === "Reference" ? "Idle" : clip));
    active?.start(true);
    active?.pause();
    active?.goToFrame((active.from + active.to) / 2);
    if (clip === "Reference") {
      // Review-only asymmetric carrying stance; preserved animation clips are
      // untouched. Rotation deltas act around the exact existing local joints.
      for (const [name, angle] of [["upper_arm.L", -.18], ["forearm.L", -1.05], ["upper_arm.R", .10], ["forearm.R", -.12]] as const) {
        const bone = p.scene.skeletons[0]?.bones.find(b => b.name === name);
        const node = bone?.getTransformNode();
        const delta = Quaternion.RotationAxis(Vector3.Right(), angle);
        if (node) node.rotationQuaternion = (node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation)).multiply(delta);
        else if (bone) bone.setRotationQuaternion(bone.getRotationQuaternion().multiply(delta));
      }
    }
    p.key.diffuse = Color3.FromHexString(lighting === "reference" ? "#94A6FF" : "#D6E8FF");
    p.key.intensity = lighting === "reference" ? 3.2 : 2.8;
    p.fill.diffuse = Color3.FromHexString(lighting === "reference" ? "#667AE8" : "#99C4FF");
    p.pivot.rotation.y = azimuth;
    p.disc.update(time, true);
    p.scene.render();
  }
  document
    .querySelector("#reference")!
    .setAttribute(
      "src",
      "/@fs/root/sidereal_spacetime/assets/art-library/assets/characters-weapons-items" +
        (body === "female" ? "-female" : "") +
        "--medic/revisions/r000/reference.png",
    );
  document.querySelector("#status")!.textContent =
    `${candidate}: ${body}, ${look}, ${hair}, ${clip}, ${lighting} lighting. Isolated comparison against the preserved r002 baseline; this page does not publish art.`;
  for (const [id, value] of Object.entries({body,look,hair,clip,lighting})) {
    const input = document.querySelector<HTMLSelectElement>("#"+id); if (input) input.value=value;
  }
}
for (const id of ["body", "look", "hair", "clip", "lighting"])
  document.querySelector("#" + id)!.addEventListener("change", (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (id === "body") body = value as typeof body;
    if (id === "look") look = value;
    if (id === "hair") hair = value;
    if (id === "clip") clip = value;
    if (id === "lighting") lighting = value;
    apply();
  });
document.querySelector("#rotate")!.addEventListener("input", (e) => {
  azimuth = Number((e.target as HTMLInputElement).value);
  apply();
});
document.querySelector("#glow")!.addEventListener("change", (e) => {
  for (const p of panes)
    for (const l of p.scene.effectLayers)
      l.isEnabled = (e.target as HTMLInputElement).checked;
  apply();
});
apply();
for (const p of panes) {
  let last = 0;
  p.engine.runRenderLoop(() => {
    if (performance.now() - last < 180) return;
    last = performance.now();
    p.scene.render();
  });
}
Object.assign(window, {
  __referenceStudy: {
    panes,
    apply,
    set: (s: {
      body?: typeof body;
      look?: string;
      hair?: string;
      clip?: string;
      azimuth?: number;
      lighting?: string;
    }) => {
      body = s.body ?? body;
      look = s.look ?? look;
      hair = s.hair ?? hair;
      clip = s.clip ?? clip;
      azimuth = s.azimuth ?? azimuth;
      lighting = s.lighting ?? lighting;
      apply();
    },
    candidate,
  },
});
