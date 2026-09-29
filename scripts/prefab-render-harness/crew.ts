/**
 * Crew-on-ship review (no database): the real game renderer (`createWorld`) with a prefab ship and
 * the voxel crew, dressed from inventory definition ids exactly as the client derives them from
 * equipped items. Evidence and iteration only; nothing here is authority.
 *
 * Query: ?prefab=<id>&body=male|female&equip=<definition ids, comma separated>
 *        &hand=<definition id>&x=&y=&heading=&cam=alpha,beta,radius[,tx,ty]&moving=1
 * window.__crew.dress(ids[], hand?) re-dresses live; window.__crewReady / __crewError as game.html.
 * &clear=1 hides ship meshes between the review camera and the crew (walls of a small deck would
 * otherwise block full-body views at the game's narrow field of view); the deck stays drawn.
 * Review hooks (crew-capture.mjs): expression(id), play(action), motion(override), walk(m/s, sprint),
 * settled() and footTrace(seconds) (stance-foot slip and sole height from the animated foot bones),
 * visual() (the crew handle), freeze() / advance(ms) / thaw() (even-time frame stepping).
 */
import { createWorld, type SceneState } from "@sidereal/render";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { prefabById, PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { SPRINT_SPEED_MPS, WALK_SPEED_MPS } from "@sidereal/sim";
import { VOXEL_CREW_ANKLE_HEIGHT_M } from "@sidereal/content/crew-voxel-bundle";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  INVENTORY_DEFINITIONS,
  characterEquipmentFromInventory,
} from "@sidereal/content/inventory";

declare global {
  interface Window {
    __crewReady?: boolean;
    __crewError?: string;
    __crew?: {
      dress(ids: string[], hand?: string): void;
      metrics(): unknown;
      state: SceneState;
      expression(id: string | null): void;
      play(action: string): void;
      motion(override: Record<string, unknown> | undefined): void;
      walk(speed: number, sprint?: boolean): void;
      settled(): boolean;
      footTrace(seconds: number): Promise<unknown>;
      visual(): unknown;
      freeze(): void;
      advance(ms: number): void;
      thaw(): void;
    };
  }
}

const q = new URLSearchParams(location.search);
const doc = prefabById(q.get("prefab") ?? "fed.s.wren") ?? PREFAB_SHIPS[0];
const canvas = document.getElementById("view") as HTMLCanvasElement;
const width = Number(q.get("w")) || window.innerWidth;
const height = Number(q.get("h")) || window.innerHeight;
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;

function appearanceFor(
  ids: string[],
  hand?: string,
): Pick<SceneState, "crewAppearance" | "heldItem"> {
  const items = ids.flatMap((id) => {
    const d = INVENTORY_DEFINITIONS.find((x) => x.id === id);
    return d?.equipSlot
      ? [{ definitionId: id, equipmentSlot: d.equipSlot }]
      : [];
  });
  const held = hand
    ? INVENTORY_DEFINITIONS.find((d) => d.id === hand)
    : undefined;
  return {
    crewAppearance: {
      bodyType: (q.get("body") === "female" ? "female" : "male") as
        "male" | "female",
      hairStyle: (q.get("hair") ?? undefined) as never,
      equippedComponents: characterEquipmentFromInventory(items),
      weapon: held?.pose ?? "none",
      backpack: items.some((i) => i.equipmentSlot === "back"),
    },
    heldItem: held?.crewItemId ?? null,
  };
}

async function main() {
  const construction = prefabConstructionDocument(
    doc,
    defaultPrefabComponentCatalog(),
  );
  let scene: Scene | undefined;
  const world = await createWorld(
    canvas,
    (text) => (document.getElementById("hud")!.textContent = text),
    {
      construction: {
        instanceId: construction.layout.id,
        documentJson: JSON.stringify(construction),
        deckId: "deck-0",
      },
      onScene: (s) => {
        scene = s;
        (window as unknown as { __crewScene?: Scene }).__crewScene = s;
      },
      onLoadError: (m) => (window.__crewError = m),
    },
  );
  const equip = (q.get("equip") ?? "").split(",").filter(Boolean);
  const state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: Number(q.get("x") ?? 0),
    localY: Number(q.get("y") ?? 0),
    interior: q.get("interior") !== "0",
    inspect: false,
    grid: false,
    sprinting: false,
    ...appearanceFor(equip, q.get("hand") ?? undefined),
  };
  world.update(state);
  // Review camera override (alpha,beta,radius[,tx,ty] in ship metres); window.__crewCam changes it live.
  const holder = window as unknown as { __crewCam?: number[] };
  holder.__crewCam = q.get("cam")?.split(",").map(Number);
  scene!.onBeforeRenderObservable.add(() => {
    const cam = holder.__crewCam;
    if (!cam || cam.length < 3 || !cam.every(Number.isFinite)) return;
    const c = scene!.activeCamera as unknown as {
      alpha: number;
      beta: number;
      radius: number;
      target: Vector3;
    } | null;
    if (!c || !("alpha" in c)) return;
    if (cam.length >= 5) c.target = new Vector3(cam[3], cam[5] ?? 1.0, -cam[4]);
    [c.alpha, c.beta, c.radius] = cam as [number, number, number];
  });
  if (q.get("clear") === "stage") {
    // Presentation review only: retain the original deck's floor index ranges and materials,
    // while hiding every fixture, label and wall. No simulation or collision state is changed.
    const prepared = new Set<AbstractMesh>();
    const floors = new Set<AbstractMesh>();
    document.getElementById("labels")!.style.display = "none";
    scene!.onBeforeRenderObservable.add(() => {
      const body = world.getCrewVisual()?.root;
      if (!body) return;
      for (const m of scene!.meshes) {
        if (m.isDescendantOf(body)) continue;
        if (!prepared.has(m)) {
          prepared.add(m);
          const ranges = (m.metadata?.roleRanges ?? []) as {
            role: string;
            first: number;
            count: number;
          }[];
          const floorRanges = ranges.filter((r) => r.role === "floor");
          if (floorRanges.length && m instanceof Mesh) {
            const indices = m.getIndices();
            if (indices) {
              m.setIndices(
                floorRanges.flatMap((r) =>
                  Array.from(indices.slice(r.first, r.first + r.count)),
                ),
              );
              floors.add(m);
            }
          } else if (m.metadata?.role === "floor") floors.add(m);
        }
        if (!floors.has(m)) m.isVisible = false;
      }
    });
  } else if (q.get("clear") === "1") {
    // World-AABB segment test (ship structure is merged / thin-instanced, so ray picking misses it);
    // meshes that stay below the crew's shins (the deck) are never hidden.
    const hidden = new Set<AbstractMesh>();
    const crosses = (a: Vector3, b: Vector3, min: Vector3, max: Vector3) => {
      let t0 = 0,
        t1 = 1;
      for (const k of ["x", "y", "z"] as const) {
        const d = b[k] - a[k];
        if (Math.abs(d) < 1e-9) {
          if (a[k] < min[k] || a[k] > max[k]) return false;
          continue;
        }
        let u = (min[k] - a[k]) / d,
          v = (max[k] - a[k]) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
        if (t0 > t1) return false;
      }
      return true;
    };
    scene!.onBeforeRenderObservable.add(() => {
      const camera = scene!.activeCamera;
      const body = scene!.getTransformNodeByName("crew-placement");
      if (!camera || !body) return;
      for (const m of hidden) m.isVisible = true;
      hidden.clear();
      const from = camera.globalPosition;
      const base = body.getAbsolutePosition();
      const toward = base.subtract(from);
      toward.y = 0;
      // stop 0.45 m short of the body axis so nothing touching the crew is hidden
      const stop = toward.normalize().scale(-0.45);
      for (const m of scene!.meshes) {
        if (!m.isVisible || !m.isEnabled() || m.isDescendantOf(body)) continue;
        const box = m.getBoundingInfo().boundingBox;
        if (box.maximumWorld.y < base.y + 0.3) continue;
        for (const h of [0.35, 0.9, 1.5])
          if (
            crosses(
              from,
              base.add(stop).addInPlaceFromFloats(0, h, 0),
              box.minimumWorld,
              box.maximumWorld,
            )
          ) {
            hidden.add(m);
            break;
          }
      }
      for (const m of hidden) m.isVisible = false;
    });
  }
  const crew = () =>
    world.getCrewVisual() as
      | (NonNullable<ReturnType<typeof world.getCrewVisual>> & {
          face: { setExpression(id: string | null): void };
          play(action: string): void;
          setMotionOverride(o: unknown): void;
          joints: Map<string, TransformNode>;
        })
      | undefined;
  // Harness walk: the target position runs ahead along +Y (ship fore) at `speed` m/s between
  // y = -range and +range, then snaps back; the game derives walking from displayed movement.
  let walkSpeed = 0;
  const walkStart = state.localY;
  scene!.onBeforeRenderObservable.add(() => {
    if (!walkSpeed || frozen) return;
    const dt = scene!.getEngine().getDeltaTime() / 1000;
    state.localY += walkSpeed * Math.min(dt, 0.1);
    if (state.localY > walkStart + 3) state.localY = walkStart - 3;
    world.update({ ...state });
  });
  let lastMeshes = -1;
  let stableSince = 0;
  // Frame stepping for evidence strips: stop the game loop, then render with a constant 16 ms
  // animation step so strips sample the clips at even times whatever the SwiftShader frame rate.
  const engine = scene!.getEngine() as unknown as {
    _activeRenderLoops: (() => void)[];
    stopRenderLoop(): void;
    runRenderLoop(f: () => void): void;
    getDeltaTime(): number;
  };
  let frozen: (() => void)[] | undefined;
  const deltaTime = engine.getDeltaTime.bind(engine);
  window.__crew = {
    state,
    visual: crew,
    freeze() {
      if (frozen) return;
      frozen = [...engine._activeRenderLoops];
      engine.stopRenderLoop();
      scene!.useConstantAnimationDeltaTime = true;
      engine.getDeltaTime = () => 16;
    },
    advance(ms: number) {
      // While walking, keep the body (and the review camera) moving forward at the walk speed so
      // planted feet stay planted as in game; the frozen game loop no longer moves it.
      const body = crew()?.root;
      const cam = holder.__crewCam;
      for (let i = 0; i < Math.max(1, Math.round(ms / 16)); i++) {
        crew()?.update({
          moving: walkSpeed !== 0,
          seated: false,
          sprinting: !!state.sprinting,
          speed:
            walkSpeed / (state.sprinting ? SPRINT_SPEED_MPS : WALK_SPEED_MPS),
        });
        if (walkSpeed && body) {
          body.position.z -= walkSpeed * 0.016;
          if (cam && cam.length >= 5) cam[4] += walkSpeed * 0.016;
        }
        scene!.render();
      }
    },
    thaw() {
      scene!.useConstantAnimationDeltaTime = false;
      engine.getDeltaTime = deltaTime;
      for (const f of frozen ?? []) engine.runRenderLoop(f);
      frozen = undefined;
    },
    expression: (id) => crew()?.face.setExpression(id),
    play: (action) => crew()?.play(action),
    motion: (o) => crew()?.setMotionOverride(o),
    walk(speed, sprint = false) {
      walkSpeed = speed;
      state.sprinting = sprint;
      if (!speed) {
        state.localY = walkStart;
        world.update({ ...state });
      }
    },
    settled() {
      const n = (this.metrics() as { crewMeshes: number }).crewMeshes;
      const now = performance.now();
      if (n !== lastMeshes) [lastMeshes, stableSince] = [n, now];
      return now - stableSince > 1500;
    },
    footTrace(seconds) {
      // Fixed-time rendered frames, measured in the ship frame. Count only consecutive contact
      // samples of the same foot: flight, contact switches and teleports are not stance slip.
      if (!frozen) throw Error("Freeze the review before measuring motion");
      const joints = crew()?.joints;
      const feet = ["foot.L", "foot.R"].map((n) => joints?.get(n));
      if (!feet[0] || !feet[1]) return Promise.resolve(null);
      const body = crew()!.root;
      const frameInv = (body.parent as TransformNode)
        .computeWorldMatrix(true)
        .clone()
        .invert();
      const samples: Vector3[][] = [];
      let supportErrorMax = 0;
      let footErrorMax = 0;
      for (let i = 0; i < Math.ceil(seconds / 0.016); i++) {
        this.advance(16);
        supportErrorMax = Math.max(supportErrorMax, crew()!.supportError);
        footErrorMax = Math.max(footErrorMax, crew()!.footError);
        samples.push(
          feet.map((f) =>
            Vector3.TransformCoordinates(
              f!.computeWorldMatrix(true).getTranslation(),
              frameInv,
            ),
          ),
        );
      }
      const ground = body.position.y + VOXEL_CREW_ANKLE_HEIGHT_M;
      const slips: number[] = [];
      const heights = samples.flatMap((p) => p.map((v) => v.y));
      for (let i = 1; i < samples.length; i++) {
        const [a, b] = [samples[i - 1], samples[i]];
        for (let k = 0; k < 2; k++) {
          if (Math.max(a[k].y, b[k].y) > ground + 0.012) continue;
          slips.push(Math.hypot(b[k].x - a[k].x, b[k].z - a[k].z) / 0.016);
        }
      }
      slips.sort((a, b) => a - b);
      return Promise.resolve({
        frames: samples.length,
        stepMs: 16,
        stanceSamples: slips.length,
        stanceSlipMedian: slips.length
          ? slips[Math.floor(slips.length / 2)]
          : null,
        lowestFootMin: Math.min(...heights) - body.position.y,
        lowestFootMax: Math.max(...heights) - body.position.y,
        supportErrorMax,
        footErrorMax,
        heldItem: state.heldItem,
        supportActive: crew()!.supportActive,
        layers: crew()!.layers,
      });
    },
    dress(ids, hand) {
      Object.assign(state, appearanceFor(ids, hand));
      world.update({ ...state });
    },
    metrics() {
      const crewRoot = scene!.getTransformNodeByName("crew-placement");
      const meshes =
        crewRoot
          ?.getChildMeshes()
          .filter((m) => m.isEnabled() && m.isVisible) ?? [];
      return {
        crewMeshes: meshes.length,
        crewMaterials: new Set(meshes.map((m) => m.material?.uniqueId)).size,
        crewTriangles: meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
        names: meshes.map((m) => m.name),
        drawCalls: (
          scene!.getEngine() as unknown as { _drawCalls?: { current: number } }
        )._drawCalls?.current,
      };
    },
  };
  for (let i = 0; i < 40; i++)
    await new Promise((r) =>
      scene!.getEngine().onEndFrameObservable.addOnce(r),
    );
  window.__crewReady = true;
}

main().catch((e) => {
  console.error(e);
  window.__crewError = String(e?.stack ?? e);
  window.__crewReady = true;
});
