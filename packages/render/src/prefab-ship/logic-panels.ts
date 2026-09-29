/**
 * Wall button panels of a prefab ship's logic (wiki `Systems/Ship Logic`). Presentation only: the
 * server owns presses, light states and doors; this draws each panel where the logic model puts it
 * and tints its status light from `visible_ship_logic`.
 *
 * Art: `ship-logic/r001/logic.button.wall.glb` when published (panel frame: origin at the back-face
 * centre, +X along the wall, +Y out of the wall, +Z up; the status light is the primitive whose
 * material is `status_light`), else a box stand-in with the same proportions. Every part is a thin
 * instance of one mesh per material; the light is one mesh per light colour.
 * Frame: the view `root` (ship-local game frame: Babylon X = game x, Y up, Z = -game y).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type {
  PrefabComponentCatalog,
  ShipPrefabDocumentV1,
  ShipThemeId,
} from "@sidereal/content/ship-prefab";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import {
  LOGIC_PANEL_HEIGHT_M,
  shipLogicModel,
  type LogicPanel,
} from "@sidereal/sim/ship-logic-model";
import { slotMaterial, slotOfMaterialName } from "./materials";
import { setMeshRole } from "../mesh-roles";
import { loadGlbGeometry, type GlbGeometry } from "./glb-library";
import { DOOR_FLOOR_M } from "./doors";

export const LOGIC_PANEL_GLB = "/assets/ship-logic/r001/logic.button.wall.glb";
export const LIGHT_COLOURS: Readonly<Record<string, [number, number, number]>> =
  {
    off: [0.08, 0.08, 0.09],
    green: [0.25, 1, 0.45],
    amber: [1, 0.62, 0.08],
    red: [1, 0.14, 0.1],
  };
/** A press pushes the button in for this long (ms), presentation feedback. */
const PRESS_FLASH_MS = 350;

type Part = {
  slot: ShipKitSlot | "light";
  /** Stand-in box centre in the panel frame (x along, y out of wall, z up) and size. */
  c: [number, number, number];
  s: [number, number, number];
};
/** Box stand-in (used until the Blender panel GLB is published). */
const STANDIN: readonly Part[] = [
  { slot: "dark", c: [0, 0.02, 0], s: [0.28, 0.04, 0.36] },
  { slot: "trim", c: [0, 0.045, -0.155], s: [0.22, 0.012, 0.025] },
  { slot: "accent", c: [0, 0.055, -0.03], s: [0.14, 0.03, 0.14] },
  { slot: "light", c: [0, 0.047, 0.12], s: [0.09, 0.015, 0.035] },
];

type Mat = number[];
/** Row-major instance matrix: panel frame (x along, y out, z up) into the view root frame. */
export function panelMatrix(panel: LogicPanel, pushIn = 0): Mat {
  const [nx, ny] = panel.normal;
  // Babylon basis (right-handed): X along the wall, Y up, Z = X × Y pointing into the wall.
  const X = [ny, 0, nx];
  const Z = [-nx, 0, ny];
  const t = [
    panel.surface[0] - nx * pushIn,
    DOOR_FLOOR_M + LOGIC_PANEL_HEIGHT_M,
    -(panel.surface[1] - ny * pushIn),
  ];
  // glTF panel art: x along, y up, z into the wall (part +Y out of the wall is glTF -Z).
  return [...X, 0, 0, 1, 0, 0, ...Z, 0, ...t, 1];
}

export function createLogicPanels(
  scene: Scene,
  parent: TransformNode,
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  theme: ShipThemeId = doc.theme,
  options: { url?: string | null } = {},
) {
  const model = shipLogicModel(doc, catalog);
  const panels = model?.panels ?? [];
  let view: "deck" | "flight" = "deck";
  let lights = new Map<string, { light: string; pressedMicros: number }>();
  /** Meshes: body parts (drawn per panel) and one light mesh per colour. */
  const bodies: { mesh: Mesh; part?: Part; button: boolean }[] = [];
  const lightMeshes = new Map<string, Mesh>();
  let lightPart: Part | GlbGeometry["primitives"][number] | undefined;
  let disposed = false;

  const lightMaterial = (key: string) => {
    const m = new StandardMaterial(`logic-light:${doc.id}:${key}`, scene);
    const c = LIGHT_COLOURS[key] ?? LIGHT_COLOURS.off;
    m.diffuseColor = new Color3(0.05, 0.05, 0.05);
    m.emissiveColor = new Color3(...c);
    m.disableLighting = true;
    return m;
  };
  const geometryMesh = (
    name: string,
    g: {
      positions: ArrayLike<number>;
      normals: ArrayLike<number>;
      indices: ArrayLike<number>;
    },
  ) => {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = Float32Array.from(g.positions);
    vd.normals = Float32Array.from(g.normals);
    vd.indices = Uint32Array.from(g.indices);
    vd.applyToMesh(mesh, false);
    mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
    return mesh;
  };
  const boxMesh = (name: string, p: Part) => {
    const mesh = CreateBox(
      name,
      { width: p.s[0], height: p.s[2], depth: p.s[1] },
      scene,
    );
    // Box in the panel frame: x along, y up (z of the part), z into the wall (-y of the part).
    mesh.bakeTransformIntoVertices(Matrix.Translation(p.c[0], p.c[2], -p.c[1]));
    return mesh;
  };
  const finish = (mesh: Mesh) => {
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    setMeshRole(mesh, "equipment");
    mesh.thinInstanceCount = 0;
  };

  function build(geom: GlbGeometry | null) {
    if (disposed) return;
    if (geom) {
      geom.primitives.forEach((p, i) => {
        if (/status_light/i.test(p.material)) {
          lightPart = p;
          return;
        }
        const mesh = geometryMesh(
          `logic-panel:${doc.id}:${p.material || i}`,
          p,
        );
        mesh.material = slotMaterial(
          scene,
          theme,
          slotOfMaterialName(p.material) ?? "primary",
        );
        finish(mesh);
        bodies.push({ mesh, button: /accent/.test(p.material) });
      });
    } else
      for (const p of STANDIN) {
        if (p.slot === "light") {
          lightPart = p;
          continue;
        }
        const mesh = boxMesh(`logic-panel:${doc.id}:${p.slot}`, p);
        mesh.material = slotMaterial(scene, theme, p.slot);
        finish(mesh);
        bodies.push({ mesh, part: p, button: p.slot === "accent" });
      }
    for (const key of Object.keys(LIGHT_COLOURS)) {
      if (!lightPart) break;
      const mesh =
        "positions" in lightPart
          ? geometryMesh(`logic-light:${doc.id}:${key}`, lightPart)
          : boxMesh(`logic-light:${doc.id}:${key}`, lightPart);
      mesh.material = lightMaterial(key);
      finish(mesh);
      lightMeshes.set(key, mesh);
    }
    rebuild(Date.now());
  }

  function rebuild(nowMs: number) {
    const shown = panels.filter(
      (p) => view === "deck" || p.side === "exterior",
    );
    const body: number[] = [];
    const pressedBody: number[] = [];
    const byLight = new Map<string, number[]>();
    for (const p of shown) {
      const state = lights.get(p.deviceId);
      const pressed =
        !!state?.pressedMicros &&
        nowMs - state.pressedMicros / 1000 < PRESS_FLASH_MS;
      body.push(...panelMatrix(p));
      pressedBody.push(...panelMatrix(p, pressed ? 0.012 : 0));
      const key = state && LIGHT_COLOURS[state.light] ? state.light : "off";
      const list = byLight.get(key) ?? [];
      list.push(...panelMatrix(p));
      byLight.set(key, list);
    }
    for (const b of bodies) {
      const m = b.button ? pressedBody : body;
      b.mesh.thinInstanceSetBuffer(
        "matrix",
        m.length ? new Float32Array(m) : null,
        16,
        false,
      );
      b.mesh.setEnabled(m.length > 0);
    }
    for (const [key, mesh] of lightMeshes) {
      const m = byLight.get(key) ?? [];
      mesh.thinInstanceSetBuffer(
        "matrix",
        m.length ? new Float32Array(m) : null,
        16,
        false,
      );
      mesh.setEnabled(m.length > 0);
    }
  }

  if (panels.length) {
    const url = options.url === undefined ? LOGIC_PANEL_GLB : options.url;
    if (url) void loadGlbGeometry(scene, url).then(build);
    else build(null);
  }

  let lastKey = "";
  return {
    panels: () => panels,
    setView(next: "deck" | "flight") {
      if (next === view) return;
      view = next;
      rebuild(Date.now());
    },
    /** Light and press state by button device id (from `visible_ship_logic`). */
    update(
      next:
        | ReadonlyMap<string, { light: string; pressedMicros: number }>
        | undefined,
      nowMs: number,
    ) {
      lights = new Map(next ?? []);
      const flashing = [...lights.values()].some(
        (s) =>
          s.pressedMicros &&
          nowMs - s.pressedMicros / 1000 < PRESS_FLASH_MS + 50,
      );
      const key =
        JSON.stringify([...lights]) + (flashing ? Math.floor(nowMs / 50) : "");
      if (key === lastKey) return;
      lastKey = key;
      rebuild(nowMs);
    },
    meshes: () => [...bodies.map((b) => b.mesh), ...lightMeshes.values()],
    dispose() {
      disposed = true;
      for (const b of bodies) b.mesh.dispose();
      for (const m of lightMeshes.values()) {
        m.material?.dispose();
        m.dispose();
      }
      bodies.length = 0;
      lightMeshes.clear();
    },
  };
}
export type LogicPanels = ReturnType<typeof createLogicPanels>;
