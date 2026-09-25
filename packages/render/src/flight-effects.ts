import { setMeshRole } from "./mesh-roles";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  LAB_FLIGHT_ACTUATORS,
  type FlightDevice,
} from "@sidereal/content/flight";

export type ActuatorEffectOutput = { actuatorId: string; throttle: number };

/** Missing/invalid telemetry is dark. Unknown IDs never create effect objects. */
export function achievedThrottle(
  outputs: readonly ActuatorEffectOutput[],
  id: string,
) {
  const value = outputs.find((output) => output.actuatorId === id)?.throttle;
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}
/** Exhaust is opposite the authored +Y force axis; planar XY maps to X/-Z. */
export function exhaustMount(
  device: Pick<FlightDevice, "x" | "y" | "height" | "rotation">,
) {
  return {
    x: device.x,
    y: device.height,
    z: -device.y,
    directionX: Math.sin(device.rotation),
    directionY: 0,
    directionZ: Math.cos(device.rotation),
  };
}

const PLUME_LAYERS = [
  { color: "#246cd4", alpha: 0.18, width: 1, length: 1 },
  { color: "#39c9ff", alpha: 0.28, width: 0.66, length: 0.78 },
  { color: "#b2f6ff", alpha: 0.58, width: 0.34, length: 0.5 },
] as const;
const PLUME_STEPS = [1, 0.9375, 0.8125, 0.6875, 0.5, 0.3125];
type Point = readonly [number, number, number];

// One closed stepped boundary per translucent volume. Adjacent sections share
// shoulders, not overlapping box caps that accumulate bright internal planes.
function steppedVolumeMesh(
  scene: Scene,
  name: string,
  width: number,
  length: number,
) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  const face = (points: readonly Point[], normal: Point, shade: number) => {
    const offset = positions.length / 3;
    for (const point of points) {
      positions.push(...point);
      normals.push(...normal);
      colors.push(shade, shade, shade, 1);
    }
    // Match Babylon's left-handed front-face winding for every face orientation.
    const [a, b, c] = points;
    const ab = b.map((value, axis) => value - a[axis]);
    const ac = c.map((value, axis) => value - a[axis]);
    const facing =
      (ab[1] * ac[2] - ab[2] * ac[1]) * normal[0] +
      (ab[2] * ac[0] - ab[0] * ac[2]) * normal[1] +
      (ab[0] * ac[1] - ab[1] * ac[0]) * normal[2];
    const order = facing < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    indices.push(...order.map((index) => offset + index));
  };
  const ring = (radius: number, z: number): Point[] => [
    [radius, -radius, z],
    [-radius, -radius, z],
    [-radius, radius, z],
    [radius, radius, z],
  ];
  const sideNormals: Point[] = [
    [0, -1, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [1, 0, 0],
  ];
  const sideShades = [0.62, 0.76, 1, 0.86];
  face(ring(width / 2, 0), [0, 0, -1], 0.85);
  for (let section = 0; section < PLUME_STEPS.length; section++) {
    const z0 = (length * section) / PLUME_STEPS.length;
    const z1 = (length * (section + 1)) / PLUME_STEPS.length;
    const radius = (width * PLUME_STEPS[section]) / 2;
    const start = ring(radius, z0);
    const end = ring(radius, z1);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      face(
        [start[side], start[next], end[next], end[side]],
        sideNormals[side],
        sideShades[side],
      );
    }
    if (section === PLUME_STEPS.length - 1) {
      face(end, [0, 0, 1], 1);
    } else {
      const next = ring((width * PLUME_STEPS[section + 1]) / 2, z1);
      for (let side = 0; side < 4; side++) {
        const corner = (side + 1) % 4;
        face([end[side], end[corner], next[corner], next[side]], [0, 0, 1], 1);
      }
    }
  }
  const mesh = new Mesh(name, scene);
  setMeshRole(mesh, "effect");
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.colors = colors;
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.metadata = {
    presentationOnly: true,
    role: "effect",
    effectRole: "achieved-engine-exhaust",
  };
  return mesh;
}

/** Bounded 27 stepped volumes / three shared unlit materials / zero lights.
 * Register `meshes` with the scene's existing GlowLayer if bloom is desired.
 * Feed only this ship's subscribed achieved output, never local key demand.
 */
export function createFlightEffects(scene: Scene, shipRoot: TransformNode) {
  const root = new TransformNode("achieved-flight-effects", scene);
  root.parent = shipRoot;
  const materials = PLUME_LAYERS.map(({ color, alpha }, i) => {
    const material = new StandardMaterial("exhaust-band-" + i, scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(color);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.alpha = alpha;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    // Additive translucency preserves the background and is independent of the
    // sorting order between nested shells or neighboring engines. Opaque hulls
    // still occlude the plume; effects never write depth or add a lighting pass.
    material.alphaMode = Constants.ALPHA_ADD;
    material.disableDepthWrite = true;
    material.backFaceCulling = true;
    return material;
  });
  const engines = LAB_FLIGHT_ACTUATORS.map((device) => {
    const mount = exhaustMount(device);
    const node = new TransformNode("exhaust-" + device.id, scene);
    node.parent = root;
    node.position.set(mount.x, mount.y, mount.z);
    node.rotation.y = device.rotation;
    const main = device.id.startsWith("drives-main"),
      small = device.definitionId === "main-drive-small-v1";
    const width = main
      ? small
        ? 0.8
        : 1.15
      : device.id.startsWith("drives-retro")
        ? 0.42
        : 0.28;
    const length = main
      ? small
        ? 2.6
        : 4
      : device.id.startsWith("drives-retro")
        ? 1.7
        : 1.2;
    const pieces = PLUME_LAYERS.map((layer, i) => {
      const mesh = steppedVolumeMesh(
        scene,
        `exhaust-${device.id}-band-${i}`,
        width * layer.width,
        layer.length,
      );
      mesh.parent = node;
      mesh.material = materials[i];
      return mesh;
    });
    node.setEnabled(false);
    return { id: device.id, node, length, pieces };
  });
  const meshes = engines.flatMap((engine) => engine.pieces);
  return {
    meshes,
    update(
      outputs: readonly ActuatorEffectOutput[] = [],
      _reducedMotion = false,
    ) {
      // No independent flicker or particle time line: reduced motion is inherently
      // respected. Changed server output alone changes these physical cues.
      for (const engine of engines) {
        const throttle = achievedThrottle(outputs, engine.id);
        engine.node.setEnabled(throttle > 0);
        if (throttle <= 0) continue;
        const width = Math.sqrt(throttle);
        engine.node.scaling.set(width, width, engine.length * throttle);
        for (const piece of engine.pieces) piece.visibility = width;
      }
    },
    dispose() {
      root.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
