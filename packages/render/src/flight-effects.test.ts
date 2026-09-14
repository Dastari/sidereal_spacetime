import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Constants } from "@babylonjs/core/Engines/constants";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  achievedThrottle,
  exhaustMount,
  createFlightEffects as createCompiledEffects,
} from "./flight-effects";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
// Legacy layout is only test input; production effects start empty.
const devices = LAB_FLIGHT_ACTUATORS.map((d) => ({
  ...d,
  nozzleX: d.x,
  nozzleY: d.y,
  exhaustX: Math.sin(d.rotation),
  exhaustY: -Math.cos(d.rotation),
  throttle: 0,
}));
function createFlightEffects(scene: Scene, ship: TransformNode) {
  const effects = createCompiledEffects(scene, ship);
  effects.update(devices);
  return {
    ...effects,
    update(
      outputs: readonly { actuatorId: string; throttle: number }[] = [],
      reduced = false,
    ) {
      return effects.update(
        devices.map((d) => ({
          ...d,
          throttle: achievedThrottle(outputs, d.id),
        })),
        reduced,
      );
    },
  };
}

test("exhaust uses physical nozzle mounts and points opposite achieved force", () => {
  for (const device of devices) {
    const mount = exhaustMount(device);
    expect(mount.x).toBe(device.x);
    expect(mount.y).toBe(device.height);
    expect(mount.z).toBe(-device.y);
    // Convert exhaust back to authoritative XY and dot with force XY.
    expect(
      mount.directionX * -Math.sin(device.rotation) -
        mount.directionZ * Math.cos(device.rotation),
    ).toBeCloseTo(-1);
  }
});
test("missing and invalid telemetry cannot light a nozzle", () => {
  expect(achievedThrottle([], "a")).toBe(0);
  expect(achievedThrottle([{ actuatorId: "a", throttle: NaN }], "a")).toBe(0);
  expect(achievedThrottle([{ actuatorId: "a", throttle: Infinity }], "a")).toBe(
    0,
  );
  expect(achievedThrottle([{ actuatorId: "a", throttle: 5 }], "a")).toBe(1);
  expect(achievedThrottle([{ actuatorId: "a", throttle: -1 }], "a")).toBe(0);
});
test("nine effects use only achieved outputs, clear immediately and add no lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ship = new TransformNode("ship", scene);
  const effects = createFlightEffects(scene, ship);
  expect(effects.meshes).toHaveLength(27);
  expect(scene.materials).toHaveLength(3);
  expect(scene.lights).toHaveLength(0);
  expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  effects.update([{ actuatorId: "drives-retro-1", throttle: 0.5 }], true);
  expect(effects.meshes.filter((mesh) => mesh.isEnabled())).toHaveLength(3);
  expect(
    effects.meshes
      .filter((mesh) => mesh.isEnabled())
      .every((mesh) => mesh.name.includes("drives-retro-1")),
  ).toBe(true);
  effects.update([]);
  expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  effects.update([{ actuatorId: "unknown-nozzle", throttle: 1 }]);
  expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  expect(effects.meshes).toHaveLength(27);
  effects.dispose();
  expect(scene.meshes).toHaveLength(0);
  expect(scene.materials).toHaveLength(0);
  expect(scene.transformNodes).toEqual([ship]);
  scene.dispose();
  engine.dispose();
});

test("translucent faceted shells share three order-independent materials with a brighter core", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ship = new TransformNode("ship", scene);
  const effects = createFlightEffects(scene, ship);
  try {
    const materials = effects.meshes.slice(0, 3).map((mesh) => {
      expect(mesh.material).toBeInstanceOf(StandardMaterial);
      return mesh.material as StandardMaterial;
    });
    expect(new Set(effects.meshes.map((mesh) => mesh.material)).size).toBe(3);
    for (const material of materials) {
      expect(material.alpha).toBeGreaterThan(0);
      expect(material.alpha).toBeLessThanOrEqual(0.6);
      expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
      expect(material.alphaMode).toBe(Constants.ALPHA_ADD);
      expect(material.disableLighting).toBe(true);
      expect(material.disableDepthWrite).toBe(true);
      expect(material.backFaceCulling).toBe(true);
      expect(material.forceDepthWrite).toBe(false);
      expect(material.needDepthPrePass).toBe(false);
    }
    for (let index = 1; index < materials.length; index++) {
      expect(materials[index].alpha).toBeGreaterThan(
        materials[index - 1].alpha,
      );
      expect(materials[index].emissiveColor.toLuminance()).toBeGreaterThan(
        materials[index - 1].emissiveColor.toLuminance(),
      );
    }
    expect(effects.meshes.every((mesh) => !mesh.isPickable)).toBe(true);
    expect(effects.meshes.every((mesh) => !mesh.receiveShadows)).toBe(true);
    expect(scene.lights).toHaveLength(0);
  } finally {
    effects.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("stepped boundaries are closed and have no duplicate box caps or per-voxel draws", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const effects = createFlightEffects(scene, new TransformNode("ship", scene));
  try {
    for (const mesh of effects.meshes) {
      expect(mesh.subMeshes).toHaveLength(1);
      expect(mesh.getTotalIndices() / 3).toBeLessThanOrEqual(100);
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      const colors = mesh.getVerticesData(VertexBuffer.ColorKind)!;
      const indices = mesh.getIndices()!;
      const point = (index: number) =>
        positions.slice(index * 3, index * 3 + 3);
      const key = (index: number) =>
        point(index)
          .map((value) => Math.round(value * 1e9))
          .join(",");
      const edges = new Map<string, { count: number; winding: number }>();
      for (let index = 0; index < indices.length; index += 3) {
        const face = [indices[index], indices[index + 1], indices[index + 2]];
        const [a, b, c] = face.map((vertex) =>
          Vector3.FromArray(point(vertex)),
        );
        const normal = Vector3.FromArray(normals, face[0] * 3);
        expect(
          Vector3.Dot(Vector3.Cross(b.subtract(a), c.subtract(a)), normal),
        ).toBeLessThan(0);
        for (let side = 0; side < 3; side++) {
          const from = key(face[side]);
          const to = key(face[(side + 1) % 3]);
          expect(from).not.toBe(to);
          const edgeKey = [from, to].sort().join("|");
          const edge = edges.get(edgeKey) ?? { count: 0, winding: 0 };
          edge.count++;
          edge.winding += from < to ? 1 : -1;
          edges.set(edgeKey, edge);
        }
      }
      expect(
        [...edges.values()].every(
          (edge) => edge.count === 2 && edge.winding === 0,
        ),
      ).toBe(true);
      for (let index = 0; index < normals.length; index += 3) {
        expect(
          normals.slice(index, index + 3).filter((value) => value !== 0),
        ).toHaveLength(1);
      }
      const shades = new Set<number>();
      for (let index = 0; index < colors.length; index += 4) {
        expect(colors[index]).toBeGreaterThan(0);
        expect(colors[index]).toBeLessThanOrEqual(1);
        expect(colors[index + 3]).toBe(1);
        shades.add(colors[index]);
      }
      expect(shades.size).toBeGreaterThan(1);
    }
  } finally {
    effects.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("nested volumes retain each physical nozzle and remain inside its outer effect envelope", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const effects = createFlightEffects(scene, new TransformNode("ship", scene));
  try {
    effects.update(
      LAB_FLIGHT_ACTUATORS.map((device) => ({
        actuatorId: device.id,
        throttle: 1,
      })),
    );
    for (const device of devices) {
      const pieces = effects.meshes.filter((mesh) =>
        mesh.name.startsWith(`exhaust-${device.id}-band-`),
      );
      expect(pieces).toHaveLength(3);
      const node = pieces[0].parent as TransformNode;
      const mount = exhaustMount(device);
      expect(node.position.asArray()).toEqual([mount.x, mount.y, mount.z]);
      const axis = Vector3.TransformNormal(
        Vector3.Forward(),
        node.computeWorldMatrix(true),
      ).normalize();
      expect(axis.x).toBeCloseTo(mount.directionX);
      expect(axis.y).toBeCloseTo(mount.directionY);
      expect(axis.z).toBeCloseTo(mount.directionZ);
      for (let index = 0; index < pieces.length; index++) {
        const box = pieces[index].getBoundingInfo().boundingBox;
        expect(box.minimum.z).toBe(0);
        expect(box.maximum.z).toBeGreaterThan(0);
        if (index > 0) {
          const outer = pieces[index - 1].getBoundingInfo().boundingBox;
          expect(box.maximum.x).toBeLessThan(outer.maximum.x);
          expect(box.maximum.y).toBeLessThan(outer.maximum.y);
          expect(box.maximum.z).toBeLessThan(outer.maximum.z);
          expect(box.minimum.x).toBeGreaterThan(outer.minimum.x);
          expect(box.minimum.y).toBeGreaterThan(outer.minimum.y);
        }
      }
    }
  } finally {
    effects.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("achieved throttle increases opacity and size monotonically without independent flicker", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const effects = createFlightEffects(scene, new TransformNode("ship", scene));
  try {
    const device = LAB_FLIGHT_ACTUATORS[0];
    const pieces = effects.meshes.filter((mesh) =>
      mesh.name.startsWith(`exhaust-${device.id}-band-`),
    );
    const node = pieces[0].parent as TransformNode;
    let previousOpacity = 0;
    let previousWidth = 0;
    let previousLength = 0;
    for (const throttle of [0.01, 0.25, 0.5, 1]) {
      const output = [{ actuatorId: device.id, throttle }];
      effects.update(output);
      expect(pieces.every((piece) => piece.isEnabled())).toBe(true);
      expect(pieces[0].visibility).toBeGreaterThan(previousOpacity);
      expect(pieces[0].visibility).toBeLessThanOrEqual(1);
      expect(node.scaling.x).toBeGreaterThan(previousWidth);
      expect(node.scaling.z).toBeGreaterThan(previousLength);
      const snapshot = [
        node.scaling.asArray(),
        pieces.map((piece) => piece.visibility),
      ];
      effects.update(output, true);
      expect([
        node.scaling.asArray(),
        pieces.map((piece) => piece.visibility),
      ]).toEqual(snapshot);
      previousOpacity = pieces[0].visibility;
      previousWidth = node.scaling.x;
      previousLength = node.scaling.z;
    }
    for (const throttle of [0, -1, NaN, Infinity, -Infinity]) {
      effects.update([{ actuatorId: device.id, throttle }]);
      expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
    }
    effects.update([{ actuatorId: device.id, throttle: 1 }]);
    effects.update();
    expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  } finally {
    effects.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("compiled UUID mounts update together and removed or rejected devices dispose their plumes", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ship = new TransformNode("ship", scene);
  const effects = createCompiledEffects(scene, ship);
  try {
    expect(effects.meshes).toHaveLength(0);
    const device = {
      id: "installed-uuid",
      nozzleX: 4.2,
      nozzleY: -7.8,
      height: 2.3,
      exhaustX: -1,
      exhaustY: 0,
      throttle: 0.7,
    };
    expect(effects.update([device])).toBe(true);
    const node = effects.meshes[0].parent as TransformNode;
    expect(node.position.asArray()).toEqual([4.2, 2.3, 7.8]);
    expect(node.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(effects.update([{ ...device, nozzleX: -4.2, exhaustX: 1 }])).toBe(
      false,
    );
    expect(node.position.x).toBe(-4.2);
    expect(node.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(effects.update([])).toBe(true);
    expect(effects.meshes).toHaveLength(0);
    expect(scene.meshes).toHaveLength(0);
    effects.update([device, device]);
    expect(effects.meshes).toHaveLength(0);
    effects.update([{ ...device, exhaustY: NaN }]);
    expect(effects.meshes).toHaveLength(0);
  } finally {
    effects.dispose();
    scene.dispose();
    engine.dispose();
  }
});
