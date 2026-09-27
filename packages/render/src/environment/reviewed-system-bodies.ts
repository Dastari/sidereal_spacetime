import { createDistantStar } from "./distant-star";
import { createReviewedUploadLifetime } from "./reviewed-native/upload-lifetime";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { Plane } from "@babylonjs/core/Maths/math.plane";
import { planetRecipe, planetEffects } from "../../../content/src/environment";
import { reviewedNativePlanet } from "./reviewed-native-planet-catalog";
import {
  createReviewedPlanetRuntime,
  type ReviewedPlanetRuntime,
} from "./reviewed-native/runtime";
import { createYellowStarRuntime } from "./yellow-star-runtime";
import { createPlanetAtmosphere } from "./planet-atmosphere";
import type { createPlanetWorkerClient } from "./planet-worker-client";
import type { createPlanetShadows } from "./planet-shadows";
import { bodyWithinRenderRange } from "./body-visibility";
import type { SpaceBodyState } from "./index";

type Runtime = {
  root: TransformNode;
  update(projected: number, time: number): void;
  ready(): boolean;
  lod(): number;
  error?(): string | undefined;
  dispose(): void;
};
type Candidate = {
  signature: string;
  controller: AbortController;
  runtime?: Runtime;
};
type Entry = {
  body: SpaceBodyState;
  seen: number;
  active?: Candidate;
  pending?: Candidate;
  error?: string;
  retryAt?: number;
  glowMeshCount?: number;
};
const MAX_RETAINED = 3;
const colors = {
  temperate: "#86cfff",
  ocean: "#86cfff",
  desert: "#f5aa62",
  rock: "#a5a2c6",
  ice: "#64d6ff",
  volcanic: "#ff7429",
  toxic: "#b8e943",
  gas: "#a677ff",
  crystal: "#da65ff",
  moon: "#a5a2c6",
};
export const isReviewedSystemBody = (
  body: Pick<SpaceBodyState, "appearance">,
) =>
  body.appearance === "yellow-main-sequence-r013" ||
  !!reviewedNativePlanet(body.appearance);
/** Camera-selected native bodies share the existing worker/shadow scheduler.
 * Three retained bodies bound memory. Each body retains its own ready LOD levels;
 * incomplete replacements never displace its currently visible native node. */
export function createReviewedSystemBodies(
  scene: Scene,
  root: TransformNode,
  worker: ReturnType<typeof createPlanetWorkerClient>,
  shadows: ReturnType<typeof createPlanetShadows>,
  glow: GlowLayer,
) {
  const entries = new Map<string, Entry>();
  const distantStars = new Map<string, ReturnType<typeof createDistantStar>>();
  let serial = 0,
    disposed = false;
  const stop = (candidate?: Candidate) => {
    candidate?.controller.abort();
    candidate?.runtime?.dispose();
  };
  const release = (entry: Entry) => {
    stop(entry.pending);
    stop(entry.active);
  };
  async function start(entry: Entry, signature: string) {
    stop(entry.pending);
    const pending: Candidate = { signature, controller: new AbortController() };
    entry.pending = pending;
    entry.error = undefined;
    const body = entry.body,
      signal = pending.controller.signal;
    let created: Runtime | undefined;
    const upload = createReviewedUploadLifetime();
    const abortUpload = () => upload.dispose();
    signal.addEventListener("abort", abortUpload, { once: true });
    try {
      if (body.appearance === "yellow-main-sequence-r013") {
        const star = await createYellowStarRuntime(scene, {
          bodyId: body.id,
          radius: body.radius,
          signal,
        });
        created = {
          root: star.root,
          update: (_p, time) => star.update(time),
          ready: () => true,
          lod: () => 2,
          dispose: star.dispose,
        };
      } else {
        const descriptor = reviewedNativePlanet(body.appearance)!;
        const recipe = planetRecipe(descriptor.style, body.seed);
        const planet: ReviewedPlanetRuntime = await createReviewedPlanetRuntime(
          scene,
          {
            bodyId: body.id,
            descriptor,
            recipe,
            worker,
            signal,
            prepareMaterial: (mesh, nextFrame, opaqueRefraction) =>
              shadows.prepare(mesh, nextFrame, { signal, opaqueRefraction }),
          },
        );
        let atmosphere: ReturnType<typeof createPlanetAtmosphere> | undefined;
        created = {
          root: planet.root,
          update: (projected) => planet.update(projected),
          ready: () => planet.stats().active !== undefined,
          lod: () => planet.stats().requestedLOD ?? 2,
          error: () => planet.stats().error,
          dispose: () => {
            for (const mesh of planet.root.getChildMeshes())
              if (mesh instanceof Mesh) glow.removeIncludedOnlyMesh(mesh);
            atmosphere?.material.dispose();
            planet.dispose();
          },
        };
        upload.check();
        atmosphere = createPlanetAtmosphere(
          scene,
          body.id + ":atmosphere",
          1,
          Color3.FromHexString(colors[descriptor.style]),
          planetEffects(recipe).atmosphere,
        );
        atmosphere.mesh.parent = planet.root;
        atmosphere.mesh.metadata = {
          ...atmosphere.mesh.metadata,
          bodyId: body.id,
          partId: body.id + ":atmosphere",
        };
        planet.root.scaling.setAll(body.radius);
        await upload.wait(
          atmosphere.material.forceCompilationAsync(atmosphere.mesh),
        );
      }
      if (disposed || signal.aborted || entry.pending !== pending) {
        created.dispose();
        return;
      }
      created.root.parent = root;
      created.root.setEnabled(false);
      pending.runtime = created;
    } catch (error) {
      created?.dispose();
      if (!signal.aborted && entry.pending === pending) {
        entry.error = String(error);
        entry.retryAt = performance.now() + 5000;
        entry.pending = undefined;
      }
    } finally {
      signal.removeEventListener("abort", abortUpload);
      upload.dispose();
    }
  }
  return {
    update(
      bodies: readonly SpaceBodyState[],
      origin: { x: number; y: number },
      camera: Vector3,
      far: Plane | undefined,
      time: number,
      planetsEnabled: boolean,
    ) {
      const all = new Set(bodies.map((b) => b.id));
      for (const [id, entry] of entries)
        if (!all.has(id)) {
          release(entry);
          entries.delete(id);
        }
      for (const [id, star] of distantStars)
        if (!all.has(id)) {
          star.dispose();
          distantStars.delete(id);
        }
      const admitted = bodies
        .filter(isReviewedSystemBody)
        .map((body) => {
          const position = new Vector3(
            body.x - origin.x,
            body.height,
            -(body.y - origin.y),
          );
          const distance = Math.max(
            body.radius,
            Vector3.Distance(camera, position),
          );
          const projected =
            (body.radius * scene.getEngine().getRenderHeight()) /
            (distance * 2 * Math.tan((scene.activeCamera?.fov ?? 0.5) / 2));
          if (body.kind === "star") {
            let light = distantStars.get(body.id);
            if (!light) {
              light = createDistantStar(scene, body.id);
              distantStars.set(body.id, light);
            }
            light.update(position, camera, projected);
          }
          return { body, position, projected };
        })
        .filter(
          (v) =>
            (v.body.kind === "star" || planetsEnabled) &&
            // Do not fill the shared compilation queue for unresolved subpixel
            // bodies. Observe uses the camera projection, so its target warms
            // normally even when the player's ship is millions of metres away.
            v.projected >= 0.25 &&
            bodyWithinRenderRange(v.position, v.body.radius, v.projected, far),
        )
        .sort((a, b) => b.projected - a.projected)
        .slice(0, MAX_RETAINED);
      const selected = new Set(admitted.map((v) => v.body.id));
      for (const [id, entry] of entries)
        if (!selected.has(id)) entry.active?.runtime?.root.setEnabled(false);
      for (const { body, position, projected } of admitted) {
        let entry = entries.get(body.id);
        if (!entry) {
          if (entries.size >= MAX_RETAINED) {
            const oldest = [...entries]
              .filter(([id]) => !selected.has(id))
              .sort((a, b) => a[1].seen - b[1].seen)[0];
            if (!oldest) continue;
            release(oldest[1]);
            entries.delete(oldest[0]);
          }
          entry = { body, seen: ++serial };
          entries.set(body.id, entry);
        }
        entry.body = body;
        entry.seen = ++serial;
        const signature = `${body.appearance}:${body.seed}:${body.radius}`;
        if (
          !entry.pending &&
          entry.active?.signature !== signature &&
          !entry.error
        )
          void start(entry, signature);
        else if (entry.pending && entry.pending.signature !== signature)
          void start(entry, signature);
        for (const candidate of [entry.active, entry.pending])
          if (candidate?.runtime) {
            candidate.runtime.root.position.copyFrom(position);
            candidate.runtime.update(projected, time);
          }
        const failure =
          entry.pending?.runtime?.error?.() ?? entry.active?.runtime?.error?.();
        if (failure && !entry.error) {
          entry.error = failure;
          entry.retryAt = performance.now() + 5000;
        }
        if (entry.error && performance.now() >= (entry.retryAt ?? Infinity)) {
          stop(entry.pending);
          entry.pending = undefined;
          entry.error = undefined;
          void start(entry, signature);
        }
        if (entry.pending?.runtime?.ready()) {
          const previous = entry.active;
          entry.active = entry.pending;
          entry.pending = undefined;
          entry.active.runtime!.root.setEnabled(true);
          entry.glowMeshCount = undefined;
          stop(previous);
        }
        const active = entry.active?.runtime;
        if (active) {
          active.root.setEnabled(true);
          if (reviewedNativePlanet(body.appearance)?.glow) {
            const meshes = active.root.getChildMeshes();
            if (entry.glowMeshCount !== meshes.length) {
              entry.glowMeshCount = meshes.length;
              for (const mesh of meshes)
                if (
                  mesh instanceof Mesh &&
                  mesh.material instanceof PBRMaterial &&
                  mesh.material.alpha === 1
                ) {
                  glow.addIncludedOnlyMesh(mesh);
                  glow.isEnabled = true;
                }
            }
          }
        }
      }
    },
    shadowCandidates: () =>
      [...entries.values()].flatMap((e) =>
        e.active?.runtime
          ? [
              {
                node: e.active.runtime.root,
                radius: e.body.radius,
                lod: e.active.runtime.lod(),
              },
            ]
          : [],
      ),
    stats: () => ({
      retainedBodies: entries.size,
      pendingBodies: [...entries.values()].filter((e) => !!e.pending).length,
      errors: [...entries.values()]
        .filter((e) => e.error)
        .map((e) => ({ bodyId: e.body.id, error: e.error })),
    }),
    dispose() {
      disposed = true;
      for (const entry of entries.values()) release(entry);
      entries.clear();
      for (const light of distantStars.values()) light.dispose();
      distantStars.clear();
    },
  };
}
