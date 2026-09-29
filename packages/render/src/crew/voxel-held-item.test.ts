import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { crewArmedClipInfo, crewItem } from "@sidereal/content/crew-items";

// The item GLBs and armed clips are served assets; stand-ins record the calls.
const loaded: string[] = [];
const disposed: string[] = [];
const played: string[] = [];
vi.mock("../equipment/voxel-items", async (original) => {
  const actual = await original<typeof import("../equipment/voxel-items")>();
  return {
    ...actual,
    createVoxelItemVisual: async (
      scene: Scene,
      parent: TransformNode,
      id: string,
    ) => {
      loaded.push(id);
      const root = new TransformNode("item:" + id, scene);
      root.parent = parent;
      const supportTarget = new TransformNode("support:" + id, scene);
      supportTarget.parent = root;
      return {
        item: crewItem(id),
        root,
        supportTarget,
        play: (action: string) => played.push(`${id}:${action}`),
        getMuzzleWorld: () => undefined,
        dispose: () => {
          disposed.push(id);
          root.dispose();
        },
      };
    },
  };
});
vi.mock("@babylonjs/core/Loading/sceneLoader", () => ({
  SceneLoader: {
    LoadAssetContainerAsync: async () => ({ dispose: () => undefined }),
  },
}));
import { createVoxelHeldItem, holsterTransform } from "./voxel-held-item";

import { equipVoxelCrewItem } from "./voxel-crew-kit";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  loaded.length = disposed.length = played.length = 0;
});

function fakeCrew(scene: Scene) {
  const socket = (name: string) => new TransformNode(name, scene);
  const socketNodes: Record<string, TransformNode> = {};
  for (const name of [
    "socket.hand.R",
    "socket.hand.L",
    "socket.hip.R",
    "socket.hip.L",
    "socket.back",
    "socket.belt",
  ])
    socketNodes[name] = socket(name);
  const clips: string[] = [];
  let armed: string | null = null;
  let supportTarget: TransformNode | null = null;
  return {
    socketNodes,
    clips,
    activeClips: [] as string[],
    get supportTarget() {
      return supportTarget;
    },
    setSupportTarget(target: TransformNode | null) {
      supportTarget = target;
    },
    get armed() {
      return armed;
    },
    addClips: () => [],
    setArmedClass(cls: string | null) {
      armed = cls;
      this.activeClips = cls ? [`${cls}.idle_armed`] : [];
    },
    play: (clip: string) => clips.push(clip),
  };
}

describe("held r001 item with draw and holster", () => {
  it("dashboard equipment previews use the same ready/aim grip and release reload/seated poses", async () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const crew = fakeCrew(scene);
    const visual = await equipVoxelCrewItem(scene, crew as never, "rifle");
    expect(crew.supportTarget).toBe(visual.supportTarget);
    for (const clips of [
      ["rifle.aim:upper"],
      ["rifle.run_armed:upper", "run:lower"],
    ]) {
      crew.activeClips = clips;
      scene.onBeforeAnimationsObservable.notifyObservers(scene);
      expect(crew.supportTarget).toBe(visual.supportTarget);
    }
    for (const clips of [["rifle.reload:upper"], ["sit_idle"]]) {
      crew.activeClips = clips;
      scene.onBeforeAnimationsObservable.notifyObservers(scene);
      expect(crew.supportTarget).toBeNull();
    }
    visual.dispose();
    expect(crew.supportTarget).toBeNull();
    crew.activeClips = ["rifle.aim:upper"];
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    expect(crew.supportTarget).toBeNull();
  });

  it("converts the authored back-holster offset and rotation from Blender to glTF", () => {
    const result = holsterTransform(crewItem("rifle").holster!);
    expect(result.position.asArray()).toEqual([0, -0.04, 0.08]);
    const [x, y, z, w] = result.rotation.asArray();
    expect(x).toBeCloseTo(0.683012, 5);
    expect(y).toBeCloseTo(0.183017, 5);
    expect(z).toBeCloseTo(0.183017, 5);
    expect(w).toBeCloseTo(0.683012, 5);
  });

  it("pins a held two-handed item's support grip and releases it for reload, holster and disposal", async () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const crew = fakeCrew(scene);
    const held = createVoxelHeldItem(scene, crew as never, {
      instant: () => true,
    });
    held.set("rifle");
    await vi.waitFor(() => expect(held.phase).toBe("held"));
    expect(crew.supportTarget).toBe(held.visual!.supportTarget);
    crew.activeClips = ["sit_idle"];
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    expect(crew.supportTarget).toBeNull();
    crew.activeClips = ["rifle.reload:upper"];
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    expect(crew.supportTarget).toBeNull();
    crew.activeClips = ["rifle.walk_armed:upper", "walk:lower"];
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    expect(crew.supportTarget).toBe(held.visual!.supportTarget);
    held.set(null);
    expect(crew.supportTarget).toBeNull();
    held.dispose();
    expect(crew.supportTarget).toBeNull();
    scene.dispose();
  });

  it("draws from the holster, holsters at the grab frame, then draws the next item", async () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const crew = fakeCrew(scene);
    let t = 0;
    const held = createVoxelHeldItem(scene, crew as never, { now: () => t });
    held.set("pistol");
    await vi.waitFor(() => expect(held.phase).toBe("drawing"));
    const draw = crewArmedClipInfo(crewItem("pistol"), "draw")!;
    expect(crew.clips).toEqual(["pistol.draw"]);
    expect(crew.armed).toBe("pistol");
    const root = held.visual!.root;
    // Rides the hip holster until the hand closes on it at the grab frame.
    expect(root.parent?.name).toBe("socket.hip.R");
    expect(root.rotationQuaternion?.asArray()).toEqual(
      holsterTransform(crewItem("pistol").holster!).rotation.asArray(),
    );
    t = ((draw.grabFrame! + 0.5) / 24) * 1000;
    held.step();
    expect(root.parent?.name).toBe("socket.hand.R");
    t = (draw.frames / 24) * 1000 + 1;
    held.step();
    expect(held.phase).toBe("held");
    expect(held.itemId).toBe("pistol");

    // Switch to a rifle: holster the pistol first (hand -> hip at the grab frame), then draw.
    const holster = crewArmedClipInfo(crewItem("pistol"), "holster")!;
    const t0 = t;
    held.set("rifle");
    expect(held.phase).toBe("holstering");
    expect(crew.clips.at(-1)).toBe("pistol.holster");
    expect(held.itemId).toBeNull();
    t = t0 + ((holster.grabFrame! + 0.5) / 24) * 1000;
    held.step();
    expect(root.parent?.name).toBe("socket.hip.R");
    t = t0 + (holster.frames / 24) * 1000 + 1;
    held.step();
    expect(disposed).toEqual(["pistol"]);
    await vi.waitFor(() => expect(held.phase).toBe("drawing"));
    expect(crew.clips.at(-1)).toBe("rifle.draw");
    expect(held.visual!.root.parent?.name).toBe("socket.back");
    expect(loaded).toEqual(["pistol", "rifle"]);
    held.dispose();
    expect(crew.armed).toBeNull();
    scene.dispose();
  });

  it("swaps at once for the first item, reduced motion and items without armed clips", async () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const crew = fakeCrew(scene);
    let instant = true;
    const held = createVoxelHeldItem(scene, crew as never, {
      instant: () => instant,
    });
    held.set("compact-carbine");
    await vi.waitFor(() => expect(held.phase).toBe("held"));
    expect(crew.clips).toEqual([]);
    expect(held.visual!.root.parent?.name).toBe("socket.hand.R");
    instant = false;
    // A grenade has no armed class: no draw clip, straight into the hand.
    held.set("grenade");
    // the carbine still holsters (it has clips)
    expect(held.phase).toBe("holstering");
    held.dispose();
    scene.dispose();
  });

  it("reloads with the class clip and the item's reload part clip", async () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const crew = fakeCrew(scene);
    const held = createVoxelHeldItem(scene, crew as never, {
      instant: () => true,
    });
    held.set("shotgun");
    await vi.waitFor(() => expect(held.phase).toBe("held"));
    expect(held.reload()).toBe(true);
    expect(crew.clips).toEqual(["shotgun.reload"]);
    expect(played).toEqual(["shotgun:reload"]);
    held.playItem("fire");
    expect(played).toContain("shotgun:fire");
    held.dispose();
    scene.dispose();
  });
});
