import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  LAB_FLIGHT_ACTUATORS,
  type FlightDevice,
} from "../../content/src/flight";

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

// Four stepped rectangular sections are combined per color band, not a draw per
// voxel. Rings contract along the nozzle axis with flat faces.
function bandMesh(
  scene: Scene,
  name: string,
  start: number,
  end: number,
  width: number,
) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (let section = 0; section < 4; section++) {
    const z0 = start + ((end - start) * section) / 4;
    const z1 = start + ((end - start) * (section + 1)) / 4;
    const taper = 1 - z0 * 0.7;
    const block = CreateBoxVertexData({
      width: width * taper,
      height: width * taper,
      depth: z1 - z0 + 0.002,
    });
    const offset = positions.length / 3;
    const points = block.positions!;
    for (let i = 0; i < points.length; i += 3)
      positions.push(points[i], points[i + 1], points[i + 2] + (z0 + z1) / 2);
    normals.push(...block.normals!);
    indices.push(...Array.from(block.indices!, (index) => index + offset));
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.metadata = { presentationOnly: true, role: "achieved-engine-exhaust" };
  return mesh;
}

/** Bounded 27 merged plume bands / three unlit materials / zero lights.
 * Register `meshes` with the scene's existing GlowLayer if bloom is desired.
 * Feed only this ship's subscribed achieved output, never local key demand.
 */
export function createFlightEffects(scene: Scene, shipRoot: TransformNode) {
  const root = new TransformNode("achieved-flight-effects", scene);
  root.parent = shipRoot;
  const materials = ["#e1ffff", "#53d8ff", "#376cc7"].map((color, i) => {
    const material = new StandardMaterial("exhaust-band-" + i, scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(color);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
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
    const pieces = [
      [0, 0.22],
      [0.22, 0.58],
      [0.58, 1],
    ].map(([start, end], i) => {
      const mesh = bandMesh(
        scene,
        `exhaust-${device.id}-band-${i}`,
        start,
        end,
        width,
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
      }
    },
    dispose() {
      root.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
