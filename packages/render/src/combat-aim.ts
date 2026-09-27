import { setMeshRole } from "./mesh-roles";
import { tracePhysicalBeam } from "./equipment/physical-beam";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export interface CombatAimOptions {
  /** Active walking floor elevation in the ship's renderer-local coordinates. */
  deckHeight?: number;
  /** Physical shoulder/muzzle position in render-world coordinates. */
  origin?: Vector3;
}

/** Positive ship-frame yaw faces renderer -Z; positive pitch aims upwards.
 * This is presentation intent only, never a hit or actor-transform authority.
 */
export function combatTargetDirection(
  target: Vector3,
  origin: Vector3,
  shipWorld: Matrix,
) {
  if (![...target.asArray(), ...origin.asArray()].every(Number.isFinite))
    return;
  const inverse = Matrix.Invert(shipWorld);
  const delta = Vector3.TransformCoordinates(target, inverse).subtract(
    Vector3.TransformCoordinates(origin, inverse),
  );
  const horizontal = Math.hypot(delta.x, delta.z);
  if (delta.lengthSquared() < 1e-10) return;
  return {
    angle: Math.atan2(delta.x, -delta.z),
    pitch: Math.atan2(delta.y, horizontal),
    distance: Vector3.Distance(origin, target),
  };
}

/** The fallback plane follows the actor's actual deck, including ship offsets. */
function deckTarget(ray: Ray, shipWorld: Matrix, deckHeight: number) {
  if (!Number.isFinite(deckHeight)) return;
  const inverse = Matrix.Invert(shipWorld);
  const localOrigin = Vector3.TransformCoordinates(ray.origin, inverse);
  const localDirection = Vector3.TransformNormal(ray.direction, inverse);
  if (Math.abs(localDirection.y) < 1e-6) return;
  const distance = (deckHeight - localOrigin.y) / localDirection.y;
  if (distance < 0) return;
  return ray.origin.add(ray.direction.scale(distance));
}

/** Local aiming and laser feedback, never a damage/hit authority source. */
export function createCombatAim(
  scene: Scene,
  canvas: HTMLCanvasElement,
  ship: TransformNode,
  occluders: AbstractMesh[],
) {
  let pointer: { x: number; y: number } | undefined;
  const blockers = new Set(occluders);
  const beam = CreateBox("rifle-laser-beam", { size: 1 }, scene);
  setMeshRole(beam, "effect");
  const dot = CreateBox("rifle-laser-target", { size: 0.08 }, scene);
  setMeshRole(dot, "effect");
  const material = new StandardMaterial("rifle-laser-light", scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.15, 1, 0.35);
  material.diffuseColor = Color3.Black();
  for (const mesh of [beam, dot]) {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.setEnabled(false);
  }

  function aim(
    localX: number,
    localY: number,
    range = 60,
    options: CombatAimOptions = {},
  ) {
    if (
      !pointer ||
      !scene.activeCamera ||
      !Number.isFinite(range) ||
      range <= 0
    )
      return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const engine = scene.getEngine();
    // Babylon converts picking coordinates by 1 / hardwareScalingLevel itself.
    // First map the displayed CSS rectangle into that input coordinate space;
    // this also handles renderer resolution scaling and CSS-transformed canvases.
    const scaling = engine.getHardwareScalingLevel();
    const x =
      ((pointer.x - rect.left) / rect.width) *
      engine.getRenderWidth() *
      scaling;
    const y =
      ((pointer.y - rect.top) / rect.height) *
      engine.getRenderHeight() *
      scaling;
    const ray = scene.createPickingRay(
      x,
      y,
      Matrix.Identity(),
      scene.activeCamera,
    );
    const hit = scene.pickWithRay(
      ray,
      (mesh) =>
        blockers.has(mesh) &&
        mesh.isEnabled() &&
        mesh.isVisible &&
        mesh.visibility >= 0.995,
    );
    const shipWorld = ship.computeWorldMatrix(true);
    const deckHeight = options.deckHeight ?? 0;
    const surface = !!(hit?.hit && hit.pickedPoint);
    const target = surface
      ? hit!.pickedPoint!.clone()
      : deckTarget(ray, shipWorld, deckHeight);
    if (!target) return;
    const origin =
      options.origin ??
      Vector3.TransformCoordinates(
        new Vector3(localX, deckHeight + 1.3, -localY),
        shipWorld,
      );
    const direction = combatTargetDirection(target, origin, shipWorld);
    if (!direction) return;
    // Do not clamp the target towards the actor: that moves it off the cursor.
    // Weapon range limits the actual physical beam independently below.
    return { ...direction, target, surface };
  }

  return {
    meshes: [beam, dot],
    pointer(x: number, y: number) {
      pointer = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
    },
    aim,
    update(
      active: boolean,
      muzzle: { position: Vector3; direction: Vector3 } | undefined,
      _localX: number,
      _localY: number,
      _dt: number,
      range = 60,
    ) {
      const ray =
        active && muzzle
          ? tracePhysicalBeam(scene, muzzle, range, blockers)
          : undefined;
      beam.setEnabled(!!ray);
      dot.setEnabled(!!ray);
      if (!ray || !muzzle) return;
      beam.position.copyFrom(muzzle.position.add(ray.end).scale(0.5));
      beam.scaling.set(
        0.012,
        0.012,
        Vector3.Distance(muzzle.position, ray.end),
      );
      beam.lookAt(ray.end);
      dot.position.copyFrom(ray.end);
    },
    dispose() {
      beam.dispose();
      dot.dispose();
      material.dispose();
    },
  };
}
