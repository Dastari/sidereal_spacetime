import { afterEach, describe, expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Meshes/instancedMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { createExteriorShadowCache } from "./exterior-shadow-cache";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 4, -8), scene);
  camera.setTarget(Vector3.Zero());
  const root = new TransformNode("ship", scene);
  const mesh = CreateBox("caster", {}, scene);
  mesh.parent = root;
  const material = new StandardMaterial("opaque", scene);
  mesh.material = material;
  const light = new DirectionalLight("sun", new Vector3(-0.6, -1, 0.45), scene);
  light.position.set(18, 30, -18);
  light.autoCalcShadowZBounds = true;
  const shadow = new ShadowGenerator(1024, light);
  shadow.usePercentageCloserFiltering = true;
  shadow.addShadowCaster(mesh);
  const map = shadow.getShadowMap()!;
  const cache = createExteriorShadowCache(scene, light, shadow);
  const frame = () => {
    scene.incrementRenderId();
    cache.update();
    // Use Babylon's actual scheduling decision, including its shader retry state.
    return map._shouldRender();
  };
  cleanups.push(() => {
    scene.dispose();
    engine.dispose();
  });
  expect(frame()).toBe(true);
  expect(frame()).toBe(false);
  return {
    engine,
    scene,
    camera,
    root,
    mesh,
    material,
    light,
    shadow,
    map,
    cache,
    frame,
  };
}

test("stationary ship shadows reuse depth while unrelated actors move", () => {
  const { scene, frame } = fixture();
  const actor = CreateBox("local-crew", {}, scene);
  for (let i = 0; i < 100; i++) {
    actor.position.x = i;
    expect(frame()).toBe(false);
  }
});

describe("changes affecting depth invalidate before the next pass", () => {
  for (const [name, mutate] of Object.entries({
    "ship translation": (f: ReturnType<typeof fixture>): void => {
      f.root.position.x += 10;
    },
    "ship yaw": (f: ReturnType<typeof fixture>): void => {
      f.root.rotation.y += 0.3;
    },
    "caster placement": (f: ReturnType<typeof fixture>): void => {
      f.mesh.position.z += 1;
    },
    "caster visibility": (f: ReturnType<typeof fixture>): void => {
      f.mesh.isVisible = false;
    },
    "ancestor enabled": (f: ReturnType<typeof fixture>): void => {
      f.root.setEnabled(false);
    },
    "camera clipping": (f: ReturnType<typeof fixture>): void => {
      f.camera.maxZ *= 0.9;
    },
    "light direction": (f: ReturnType<typeof fixture>): void => {
      f.light.direction.x += 0.1;
    },
    "light parent": (f: ReturnType<typeof fixture>): void => {
      f.light.parent = f.root;
      f.root.rotation.y = 0.4;
    },
    "shadow bias": (f: ReturnType<typeof fixture>): void => {
      f.shadow.bias += 0.001;
    },
    "material culling": (f: ReturnType<typeof fixture>): void => {
      f.material.backFaceCulling = false;
    },
    "transparent classification": (f: ReturnType<typeof fixture>): void => {
      f.material.alpha = 0.5;
    },
    "same-count topology": (f: ReturnType<typeof fixture>): void => {
      f.mesh.geometry!.setIndices([...f.mesh.getIndices()!].reverse());
    },
    "same-bounds vertex edit": (f: ReturnType<typeof fixture>): void => {
      const values = [...f.mesh.getVerticesData(VertexBuffer.PositionKind)!];
      values[0] *= 0.5;
      f.mesh.setVerticesData(VertexBuffer.PositionKind, values);
    },
    "list removal": (f: ReturnType<typeof fixture>): void => {
      f.map.renderList = [];
    },
    "caster disposal": (f: ReturnType<typeof fixture>): void => {
      f.mesh.dispose();
    },
    "context restoration": (f: ReturnType<typeof fixture>): void => {
      f.engine.onContextRestoredObservable.notifyObservers(f.engine);
    },
    "shadow reactivation": (f: ReturnType<typeof fixture>): void => {
      f.light.shadowEnabled = false;
    },
  }))
    test(name, () => {
      const f = fixture();
      mutate(f);
      expect(f.frame()).toBe(true);
      expect(f.frame()).toBe(false);
    });
});

test("new caster, geometry replacement and parent reparenting refresh", () => {
  const f = fixture();
  const other = CreateBox("replacement", { size: 0.75 }, f.scene);
  other.material = f.material;
  f.map.renderList!.push(other);
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
  other.geometry!.applyToMesh(f.mesh);
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
  other.position.x = 2;
  f.mesh.parent = other;
  expect(f.frame()).toBe(true);
});

test("updatable geometry and alpha testing fall back, then become cacheable again", () => {
  const f = fixture();
  const positions = [...f.mesh.getVerticesData(VertexBuffer.PositionKind)!];
  f.mesh.setVerticesData(VertexBuffer.PositionKind, positions, true);
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
  f.mesh.setVerticesData(VertexBuffer.PositionKind, positions, false);
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
  const texture = new Texture(null, f.scene);
  texture.hasAlpha = true;
  f.material.diffuseTexture = texture;
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
  f.material.diffuseTexture = null;
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
});

test("custom rendering, instancing and multiple cameras never freeze", () => {
  const f = fixture();
  f.shadow.customAllowRendering = () => true;
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
  f.shadow.customAllowRendering = undefined!;
  f.mesh.createInstance("instance");
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
  f.mesh.instances[0].dispose();
  f.scene.activeCameras = [f.camera];
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
});

test("explicit native instances cache with their own placement and shared source geometry", () => {
  const f = fixture();
  const instance = f.mesh.createInstance("native-cargo");
  f.map.renderList = [instance];
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
  instance.position.x += 1;
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
  f.mesh.geometry!.setIndices([...f.mesh.getIndices()!].reverse());
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
});

test("camera orbit and zoom conservatively refresh native instance activation", () => {
  const f = fixture();
  f.camera.position.x += 2;
  f.camera.setTarget(Vector3.Zero());
  f.camera.fov *= 0.9;
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
});

test("shader readiness retries and cache disposal preserve Babylon scheduling", () => {
  const f = fixture();
  f.map.resetRefreshCounter(); // ShadowGenerator does this if an effect is unready.
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(false);
  f.cache.dispose();
  expect(f.map.refreshRate).toBe(1);
  expect(f.map._shouldRender()).toBe(true);
  expect(f.map._shouldRender()).toBe(true);
});

test("skinned and morphing casters keep updating every frame", () => {
  const f = fixture();
  f.mesh.skeleton = new Skeleton("crew", "crew", f.scene);
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
  f.mesh.skeleton = null;
  f.mesh.morphTargetManager = new MorphTargetManager(f.scene);
  expect(f.frame()).toBe(true);
  expect(f.frame()).toBe(true);
});

test("geometry subscriptions release on list removal and disposal", () => {
  const f = fixture();
  const geometry = f.mesh.geometry!;
  expect(geometry.onGeometryUpdated).toBeTypeOf("function");
  f.map.renderList = [];
  f.frame();
  expect(geometry.onGeometryUpdated).toBeUndefined();
  f.map.renderList = [f.mesh];
  f.frame();
  expect(geometry.onGeometryUpdated).toBeTypeOf("function");
  f.cache.dispose();
  expect(geometry.onGeometryUpdated).toBeUndefined();
});
