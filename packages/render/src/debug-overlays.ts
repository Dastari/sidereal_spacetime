import { setMeshRole } from "./mesh-roles";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  collisionDebugGeometry,
  type DebugCollisionFrame,
} from "./debug-collision-geometry";
import { lightDebugGeometry } from "./debug-light-geometry";

export interface DebugOverlaySources {
  characterRoots?: () => readonly TransformNode[];
  collisionFrames?: () => readonly DebugCollisionFrame[];
  /** Also explains unsupported/partial sources when no frames are supplied. */
  collisionScope?: () => string;
}
export interface DebugOverlayFlags {
  skeleton: boolean;
  lightBounds: boolean;
  collision: boolean;
}
export interface DebugOverlaySnapshot {
  skeletons: number;
  lights: number;
  collisionFrames: number;
  collisionScopes: string[];
}

/** Diagnostic lines use actual rig transforms, actual light settings and supplied
 * simulation footprints. No diagnostic light, mesh pick or authority mutation.
 */
export function createDebugOverlays(
  scene: Scene,
  sources: DebugOverlaySources = {},
) {
  const meshes = new Map<string, { mesh: LinesMesh; topology: string }>();
  let flags: DebugOverlayFlags = {
    skeleton: false,
    lightBounds: false,
    collision: false,
  };
  let stats: DebugOverlaySnapshot = {
    skeletons: 0,
    lights: 0,
    collisionFrames: 0,
    collisionScopes: [],
  };
  let disposed = false;
  function update() {
    if (disposed) return;
    const retained = new Set<string>();
    stats = {
      skeletons: 0,
      lights: 0,
      collisionFrames: 0,
      collisionScopes: [],
    };
    function lines(
      id: string,
      points: Vector3[][],
      color: Color3,
      metadata: object,
    ) {
      if (!points.length) return;
      retained.add(id);
      const topology = points.map((line) => line.length).join(",");
      let current = meshes.get(id);
      if (current && current.topology !== topology) {
        current.mesh.dispose(false, true);
        meshes.delete(id);
        current = undefined;
      }
      const mesh = CreateLineSystem(
        "debug-overlay:" + id,
        {
          lines: points,
          updatable: true,
          instance: current?.mesh,
          useVertexAlpha: false,
        },
        scene,
      );
      setMeshRole(mesh, "effect");
      if (!current) {
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.renderingGroupId = 3;
        if (mesh.material) {
          mesh.material.disableDepthWrite = true;
          mesh.material.depthFunction = Constants.ALWAYS;
        }
        meshes.set(id, { mesh, topology });
      }
      mesh.color.copyFrom(color);
      mesh.metadata = { debugOverlay: true, ...metadata, role: "effect" };
    }
    if (flags.skeleton) {
      const roots = sources.characterRoots?.() ?? [];
      const seen = new Set<number>();
      for (const root of roots) {
        if (root.isDisposed() || !root.isEnabled()) continue;
        for (const mesh of root.getChildMeshes()) {
          const skeleton = mesh.skeleton;
          if (!skeleton || seen.has(skeleton.uniqueId) || !mesh.isEnabled())
            continue;
          seen.add(skeleton.uniqueId);
          skeleton.computeAbsoluteMatrices(true);
          const position = (bone: (typeof skeleton.bones)[number]) => {
            const linked = bone.getTransformNode();
            if (!linked) return bone.getAbsolutePosition(mesh);
            linked.computeWorldMatrix(true);
            return linked.getAbsolutePosition().clone();
          };
          const bones: Vector3[][] = [];
          for (const bone of skeleton.bones) {
            const point = position(bone),
              parent = bone.getParent();
            if (parent) bones.push([position(parent), point]);
            for (const offset of [
              new Vector3(0.025, 0, 0),
              new Vector3(0, 0.025, 0),
              new Vector3(0, 0, 0.025),
            ])
              bones.push([point.subtract(offset), point.add(offset)]);
          }
          lines(
            "skeleton:" + skeleton.uniqueId,
            bones,
            Color3.FromHexString("#46ffd5"),
            { kind: "character-rig", skeleton: skeleton.name },
          );
          stats.skeletons++;
        }
      }
    }
    if (flags.lightBounds) {
      for (const light of scene.lights) {
        if (light.isDisposed() || light.metadata?.debugOverlay) continue;
        const geometry = lightDebugGeometry(light);
        lines(
          "light:" + light.uniqueId,
          geometry.lines,
          light.isEnabled() && light.intensity > 0
            ? Color3.FromHexString("#ffcf62")
            : Color3.FromHexString("#6e7895"),
          {
            kind: "light-source",
            source: light.name,
            bounded: geometry.bounded,
            range: geometry.range,
            coneAngle: geometry.angle,
          },
        );
        stats.lights++;
      }
    }
    if (flags.collision) {
      const scope = sources.collisionScope?.();
      if (scope) stats.collisionScopes.push(scope);
      for (const source of sources.collisionFrames?.() ?? []) {
        const geometry = collisionDebugGeometry(source);
        lines(
          "collision-floor:" + source.id,
          geometry.floors,
          Color3.FromHexString("#459fdb"),
          { kind: "simulation-floor", scope: source.scope },
        );
        lines(
          "collision-blockers:" + source.id,
          geometry.blockers,
          Color3.FromHexString("#ff657b"),
          { kind: "simulation-blockers", scope: source.scope },
        );
        stats.collisionFrames++;
        if (source.scope && !stats.collisionScopes.includes(source.scope))
          stats.collisionScopes.push(source.scope);
      }
    }
    for (const [id, current] of meshes)
      if (!retained.has(id)) {
        current.mesh.dispose(false, true);
        meshes.delete(id);
      }
  }
  // This runs after the character animation/IK observers, so the rig lines show
  // the final rendered joints rather than the preceding animation baseline.
  const observer = scene.onBeforeRenderObservable.add(update);
  return {
    setFlags(next: DebugOverlayFlags) {
      const changed =
        flags.skeleton !== next.skeleton ||
        flags.lightBounds !== next.lightBounds ||
        flags.collision !== next.collision;
      flags = { ...next };
      if (changed) update();
    },
    snapshot: () => ({ ...stats, collisionScopes: [...stats.collisionScopes] }),
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(observer);
      for (const current of meshes.values()) current.mesh.dispose(false, true);
      meshes.clear();
    },
  };
}
