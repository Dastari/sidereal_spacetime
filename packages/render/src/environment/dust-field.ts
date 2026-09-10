import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { setMeshRole } from "../mesh-roles";
import {
  dustCell,
  dustDepthLayers,
  dustLayout,
  dustMotion,
  DUST_COUNT,
} from "./dust";
import "@babylonjs/core/Meshes/thinInstanceMesh";

const names = [
  "dustOffset0",
  "dustOffset1",
  "dustOffset2",
  "dustCamera",
  "dustForward",
  "dustStreak",
];
/** The original unlit StandardMaterial remains responsible for colour. */
class DustMotionPlugin extends MaterialPluginBase {
  values = names.map(() => [0, 0, 0, 0]);
  constructor(material: StandardMaterial) {
    super(material, "DustMotion", 200, {}, true, true);
  }
  override getAttributes(attributes: string[]) {
    attributes.push("dustGrain");
  }
  override getUniforms() {
    return {
      ubo: names.map((name) => ({ name, size: 4, type: "vec4" })),
      vertex: names.map((name) => `uniform vec4 ${name};`).join("\n"),
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    names.forEach((name, i) => {
      const v = this.values[i];
      buffer.updateFloat4(name, v[0], v[1], v[2], v[3]);
    });
  }
  override getCustomCode(type: string) {
    return type === "vertex"
      ? {
          CUSTOM_VERTEX_DEFINITIONS: "attribute vec4 dustGrain;",
          CUSTOM_VERTEX_UPDATE_WORLDPOS: `
vec3 dustOffset = dustGrain.y < 0.5 ? dustOffset0.xyz : (dustGrain.y < 1.5 ? dustOffset1.xyz : dustOffset2.xyz);
vec3 dustCenter = finalWorld[3].xyz + dustOffset;
float dustSize = dustGrain.z;
if (dustCamera.w > 0.0) dustSize = min(dustSize, max(0.0, dot(dustCenter - dustCamera.xyz, dustForward.xyz)) * dustCamera.w);
vec3 dustVertex = positionUpdated * dustSize;
dustVertex.z *= 1.0 + (dustStreak.z - 1.0) * dustGrain.x;
dustVertex.xz = vec2(dustStreak.x * dustVertex.x + dustStreak.y * dustVertex.z, -dustStreak.y * dustVertex.x + dustStreak.x * dustVertex.z);
worldPos = finalWorld * vec4(dustVertex, 1.0);
worldPos.xyz += dustOffset;
`,
        }
      : null;
  }
}
export interface DustFieldOptions {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  reducedMotion: boolean;
  dustParallax?: boolean;
  aspect?: number;
  viewHalfExtent?: number;
}
/** Rebuild seeded cells only when the world cell or quantized layout changes.
 * Fractional origin motion and streak response remain live in shader uniforms. */
export function createDustField(scene: Scene, root: TransformNode) {
  const mesh = CreateBox("volumetric-dust", { size: 1 }, scene);
  setMeshRole(mesh, "environment");
  mesh.parent = root;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  const material = new StandardMaterial("dust-grains", scene);
  material.disableLighting = true;
  mesh.material = material;
  const plugin = new DustMotionPlugin(material);
  const matrices = new Float32Array(DUST_COUNT * 16),
    grains = new Float32Array(DUST_COUNT * 4);
  const previous: number[] = [],
    current: number[] = [];
  const anchors: { x: number; y: number; centerX: number; centerZ: number }[] =
    [];
  const forward = Vector3.Zero();
  let rebuilds = 0;
  return {
    mesh,
    get rebuilds() {
      return rebuilds;
    },
    // Read-only copy for numerical regression comparisons against the CPU path.
    snapshot: () => ({
      matrices: matrices.slice(),
      grains: grains.slice(),
      uniforms: plugin.values.map((v) => [...v]),
    }),
    update(camera: Vector3, target: Vector3, options: DustFieldOptions) {
      const aspect =
        options.aspect ??
        (scene.activeCamera
          ? scene.getEngine().getAspectRatio(scene.activeCamera)
          : 1);
      const depthLayers = options.dustParallax
        ? dustDepthLayers(
            camera,
            target,
            scene.activeCamera?.fov ?? 0.5,
            aspect,
          )
        : [];
      const layers = depthLayers.length
        ? depthLayers
        : [
            {
              height: null,
              center: { x: target.x, z: target.z },
              halfX: (options.viewHalfExtent ?? 55) * aspect,
              halfZ: options.viewHalfExtent ?? 55,
              thickness: 0,
              sizeScale: 1,
              depthDistance: 0,
            },
          ];
      if (depthLayers.length && scene.activeCamera)
        scene.activeCamera.maxZ = Math.max(
          scene.activeCamera.maxZ,
          depthLayers[2].depthDistance * 1.5,
        );
      const layouts = layers.map((layer) =>
        dustLayout(
          layer.halfZ,
          layer.halfX / Math.max(1, layer.halfZ),
          Math.floor(DUST_COUNT / layers.length),
        ),
      );
      current.length = 0;
      current.push(layers.length);
      layers.forEach((layer, i) => {
        const layout = layouts[i];
        current.push(
          Math.floor((options.x + layer.center.x) / layout.spacing),
          Math.floor((options.y - layer.center.z) / layout.spacing),
          layout.spacing,
          layout.columns,
          layout.rows,
          layer.height ?? Infinity,
          layer.thickness,
          layer.sizeScale,
        );
      });
      const rebuild =
        previous.length !== current.length ||
        current.some((v, i) => v !== previous[i]);
      let count = 0;
      if (rebuild) {
        previous.length = current.length;
        for (let i = 0; i < current.length; i++) previous[i] = current[i];
        layers.forEach((layer, layerIndex) => {
          const layout = layouts[layerIndex];
          const anchor = {
            x: options.x + layer.center.x,
            y: options.y - layer.center.z,
            centerX: layer.center.x,
            centerZ: layer.center.z,
          };
          anchors[layerIndex] = anchor;
          for (let i = 0; i < layout.count; i++) {
            const cell = dustCell(
              i,
              anchor.x,
              anchor.y,
              layout.spacing,
              layout.columns,
              layout.rows,
            );
            const m = count * 16,
              g = count * 4;
            matrices[m] =
              matrices[m + 5] =
              matrices[m + 10] =
              matrices[m + 15] =
                1;
            matrices[m + 12] = cell.x + layer.center.x;
            matrices[m + 13] =
              layer.height === null
                ? cell.height
                : layer.height + ((cell.height + 33) / 42) * layer.thickness;
            matrices[m + 14] = -cell.y + layer.center.z;
            grains[g] = cell.lengthVariation;
            grains[g + 1] = layerIndex;
            grains[g + 2] = cell.size * layer.sizeScale;
            count++;
          }
        });
        mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
        mesh.thinInstanceSetBuffer("dustGrain", grains, 4, true);
        mesh.thinInstanceCount = count;
        rebuilds++;
        mesh.metadata.depthLayers = layers.map((layer, i) => ({
          height: layer.height,
          distance: layer.depthDistance,
          instances: layouts[i].count,
          spacing: layouts[i].spacing,
        }));
      }
      layers.forEach((layer, i) => {
        const a = anchors[i],
          v = plugin.values[i];
        v[0] = a.x - (options.x + layer.center.x) + layer.center.x - a.centerX;
        v[2] = -a.y + (options.y - layer.center.z) + layer.center.z - a.centerZ;
      });
      const motion = dustMotion(
        options.vx ?? 0,
        options.vy ?? 0,
        options.reducedMotion,
      );
      material.emissiveColor.set(
        0.36 * motion.intensity,
        0.57 * motion.intensity,
        0.82 * motion.intensity,
      );
      target.subtractToRef(camera, forward).normalize();
      const c = plugin.values[3],
        f = plugin.values[4],
        s = plugin.values[5];
      c[0] = camera.x;
      c[1] = camera.y;
      c[2] = camera.z;
      c[3] = depthLayers.length
        ? (6 * Math.tan((scene.activeCamera?.fov ?? 0.5) / 2)) /
          Math.max(1, scene.getEngine().getRenderHeight())
        : 0;
      f[0] = forward.x;
      f[1] = forward.y;
      f[2] = forward.z;
      s[0] = Math.cos(motion.heading);
      s[1] = Math.sin(motion.heading);
      s[2] = motion.streakRatio;
      Object.assign(mesh.metadata, {
        worldAnchoredDust: true,
        instances: mesh.thinInstanceCount,
        streakRatio: motion.streakRatio,
        warpBlend: motion.warpBlend,
        speed: motion.speed,
        streakLength: motion.length,
      });
    },
  };
}
