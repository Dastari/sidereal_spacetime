/** Exact 8cc guarded-wall composition; r002 only, never a second ship recipe.
 * Original layer SHA0a5101d62dfb6422314e74fd439991839fede855238ec35d303f9a9beef68fd3.
 * Original content SHA91ece9b2f045c43f750e192bd16a3747232f5e6038355750101641786c01d40c.
 * Historical whole-room ranking runs before protected-band clipping. */
import { G, type Pt } from "@sidereal/content/construction-grammar";
import { interiorArtQuarterTurns } from "@sidereal/content/ship-furniture";
import {
  type deriveInterior,
  type deckApproachZones,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type {
  ShipVisualLayer,
  ShipVisualProfileId,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import { visualCellKey, type VisualCell } from "./ship-visual-sampler";

type WallKey =
  | "engineering"
  | "bridge"
  | "quarters"
  | "living"
  | "medical"
  | "workshop"
  | "galley"
  | "lounge"
  | "cargo";
interface WallInput {
  course: number;
  corner: number;
  partitionCut: number;
  secondaryWallTask: { width: number; height: number };
  staticWallFittings: typeof RETAINED_STATIC_WALL_FITTINGS;
  wallTasks: Record<
    WallKey,
    {
      width: number;
      height: number;
      bottom: number;
      insert: "vent" | "control" | "access";
      form?:
        | "relay"
        | "instrument"
        | "berth"
        | "workbench"
        | "backsplash"
        | "living"
        | "cargo";
    }
  >;
}
const RETAINED_STATIC_WALL_FITTINGS = {
  "pale-studless.kitchen.standard": {
    assetSha256:
      "2f58dcc42eb02ed6d6f22325faa4a3dc44d1b0d532f576444c578501680364c6",
    bounds: [-0.375, -1.125, 0, 0.375, 1.125, 1] as const,
    clearanceCells: 2,
    artQuarterTurns: 0,
  },
  "pale-studless.table.standard": {
    assetSha256:
      "aa18a048b058a7d28dd34442c85f1aad6bbd365d090968fcdd8d83a40b7392c4",
    bounds: [-0.75, -0.5, 0, 0.75, 0.5, 0.75] as const,
    clearanceCells: 2,
    artQuarterTurns: 0,
  },
};
export const RETAINED_WALL_INPUTS_R002: Record<ShipVisualProfileId, WallInput> =
  {
    federation: {
      course: 32,
      corner: 2,
      partitionCut: 20,
      secondaryWallTask: { width: 32, height: 14 },
      staticWallFittings: RETAINED_STATIC_WALL_FITTINGS,
      wallTasks: {
        medical: {
          width: 40,
          height: 16,
          bottom: 3,
          insert: "control",
          form: "instrument",
        },
        workshop: {
          width: 48,
          height: 17,
          bottom: 3,
          insert: "vent",
          form: "workbench",
        },
        galley: {
          width: 48,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "backsplash",
        },
        lounge: {
          width: 44,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "living",
        },
        cargo: {
          width: 48,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "cargo",
        },
        engineering: {
          width: 48,
          height: 17,
          bottom: 3,
          insert: "vent",
          form: "relay",
        },
        bridge: { width: 40, height: 16, bottom: 5, insert: "control" },
        quarters: { width: 40, height: 15, bottom: 4, insert: "access" },
        living: { width: 40, height: 16, bottom: 4, insert: "access" },
      },
    },
    riftjack: {
      course: 40,
      corner: 2,
      partitionCut: 20,
      secondaryWallTask: { width: 32, height: 14 },
      staticWallFittings: RETAINED_STATIC_WALL_FITTINGS,
      wallTasks: {
        medical: {
          width: 40,
          height: 16,
          bottom: 3,
          insert: "control",
          form: "instrument",
        },
        workshop: {
          width: 48,
          height: 17,
          bottom: 3,
          insert: "vent",
          form: "workbench",
        },
        galley: {
          width: 48,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "backsplash",
        },
        lounge: {
          width: 44,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "living",
        },
        cargo: {
          width: 48,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "cargo",
        },
        engineering: {
          width: 48,
          height: 17,
          bottom: 3,
          insert: "vent",
          form: "relay",
        },
        bridge: { width: 40, height: 16, bottom: 5, insert: "control" },
        quarters: { width: 40, height: 14, bottom: 4, insert: "access" },
        living: { width: 40, height: 16, bottom: 4, insert: "access" },
      },
    },
    aurelian: {
      course: 56,
      corner: 3,
      partitionCut: 20,
      secondaryWallTask: { width: 32, height: 14 },
      staticWallFittings: RETAINED_STATIC_WALL_FITTINGS,
      wallTasks: {
        medical: {
          width: 40,
          height: 16,
          bottom: 3,
          insert: "control",
          form: "instrument",
        },
        workshop: {
          width: 48,
          height: 17,
          bottom: 3,
          insert: "vent",
          form: "workbench",
        },
        galley: {
          width: 48,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "backsplash",
        },
        lounge: {
          width: 44,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "living",
        },
        cargo: {
          width: 48,
          height: 16,
          bottom: 3,
          insert: "access",
          form: "cargo",
        },
        engineering: {
          width: 48,
          height: 17,
          bottom: 3,
          insert: "vent",
          form: "relay",
        },
        bridge: { width: 40, height: 16, bottom: 5, insert: "control" },
        quarters: { width: 40, height: 15, bottom: 4, insert: "access" },
        living: { width: 40, height: 16, bottom: 4, insert: "access" },
      },
    },
  };
function retainedStaticWallFittingBounds(
  socket: ReturnType<typeof deriveInterior>["sockets"][number],
  floorTexels: number,
  certificates = RETAINED_WALL_INPUTS_R002.federation.staticWallFittings,
): number[] | undefined {
  const c = certificates[socket.designId as keyof typeof certificates];
  if (
    !c ||
    socket.control ||
    c.bounds.length !== 6 ||
    !c.bounds.every(Number.isFinite) ||
    !/^[a-f0-9]{64}$/.test(c.assetSha256) ||
    c.bounds.some((v, i) => i < 3 && v >= c.bounds[i + 3]) ||
    c.artQuarterTurns !== interiorArtQuarterTurns(socket.designId) ||
    !Number.isInteger(c.clearanceCells) ||
    c.clearanceCells < 2 ||
    ![...socket.at, ...socket.size, floorTexels].every(Number.isFinite) ||
    socket.size.some((v) => v <= 0)
  )
    return undefined;
  const q = { fore: 0, port: 1, aft: 2, starboard: 3 }[socket.facing];
  if (q === undefined) return undefined;
  const angle = ((q + c.artQuarterTurns) * Math.PI) / 2,
    C = Math.cos(angle),
    S = Math.sin(angle);
  const anchor = [
    socket.at[0] + socket.size[0] / 2,
    socket.at[1] + socket.size[1] / 2,
  ];
  const corners: number[][] = [];
  for (const x of [c.bounds[0], c.bounds[3]])
    for (const y of [c.bounds[1], c.bounds[4]])
      corners.push([anchor[0] + C * x - S * y, anchor[1] + S * x + C * y]);
  const size = [
    Math.max(...corners.map((p) => p[0])) -
      Math.min(...corners.map((p) => p[0])),
    Math.max(...corners.map((p) => p[1])) -
      Math.min(...corners.map((p) => p[1])),
  ];
  if (size.some((v, i) => Math.abs(v - socket.size[i]) > 1e-6))
    return undefined;
  const pad = c.clearanceCells / 16;
  return [
    Math.min(...corners.map((p) => p[0])) - pad,
    Math.min(...corners.map((p) => p[1])) - pad,
    floorTexels / 16 + c.bounds[2] - pad,
    Math.max(...corners.map((p) => p[0])) + pad,
    Math.max(...corners.map((p) => p[1])) + pad,
    floorTexels / 16 + c.bounds[5] + pad,
  ];
}

export function createRetainedWallBoundaryR002(
  doc: ShipPrefabDocumentV1,
  interior: ReturnType<typeof deriveInterior>,
  approaches: ReturnType<typeof deckApproachZones>,
  profileId: ShipVisualProfileId,
  protectedInterface: (p: Pt) => boolean,
) {
  const macro = RETAINED_WALL_INPUTS_R002[profileId];
  const staticFittings = interior.sockets.map((socket) => ({
    socket,
    bounds: retainedStaticWallFittingBounds(
      socket,
      G.deck.floorTopTexels,
      macro.staticWallFittings,
    ),
  }));
  const wallTaskKey = (
    room: ShipPrefabDocumentV1["rooms"][number],
  ): keyof typeof macro.wallTasks => {
    switch (room.type) {
      case "engineering":
        return "engineering";
      case "workshop":
        return "workshop";
      case "bridge":
        return "bridge";
      case "cargo":
        return "cargo";
      case "medbay":
        return "medical";
      case "quarters":
        return "quarters";
      case "galley":
        return "galley";
      case "lounge":
        return "lounge";
      default:
        return "living";
    }
  };
  const wallTaskRuns = (a: Pt, b: Pt, side: Pt) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      span = Math.hypot(dx, dy);
    const ux = dx / span,
      uy = dy / span;
    const roomAt = (q: number) => {
      const face: Pt = [(a[0] + ux * q) / 16, (a[1] + uy * q) / 16];
      const probe: Pt = [face[0] + side[0] * 0.35, face[1] + side[1] * 0.35];
      if (
        protectedInterface(face) ||
        approaches.some(
          (a) =>
            probe[0] >= a.rect[0] &&
            probe[0] <= a.rect[2] &&
            probe[1] >= a.rect[1] &&
            probe[1] <= a.rect[3],
        )
      )
        return undefined;
      let requiredBottom = 0;
      for (const f of staticFittings) {
        const o = f.socket;
        // The whole wall-owned footprint is one course either side of face,
        // not only the room probe used for identifying the adjacent room.
        const touches = f.bounds
          ? face[0] >= f.bounds[0] - 2 / 16 &&
            face[0] <= f.bounds[3] + 2 / 16 &&
            face[1] >= f.bounds[1] - 2 / 16 &&
            face[1] <= f.bounds[4] + 2 / 16
          : probe[0] >= o.at[0] - 1 / 16 &&
            probe[0] <= o.at[0] + o.size[0] + 1 / 16 &&
            probe[1] >= o.at[1] - 1 / 16 &&
            probe[1] <= o.at[1] + o.size[1] + 1 / 16;
        if (!touches) continue;
        if (!f.bounds) return undefined;
        requiredBottom = Math.max(
          requiredBottom,
          Math.ceil(f.bounds[5] * 16) - G.deck.floorTopTexels,
        );
      }
      const room = doc.rooms.find(
        (r) =>
          r.type !== "corridor" &&
          probe[0] >= r.rect[0] &&
          probe[0] < r.rect[2] &&
          probe[1] >= r.rect[1] &&
          probe[1] < r.rect[3],
      );
      return room ? { room, requiredBottom } : undefined;
    };
    const runs: {
      room: ShipPrefabDocumentV1["rooms"][number];
      u: number;
      U: number;
      bottom: number;
    }[] = [];
    for (let q = 4; q < span - 4; q++) {
      const candidate = roomAt(q + 0.5);
      if (!candidate) continue;
      const { room, requiredBottom } = candidate;
      const last = runs[runs.length - 1];
      if (last?.room.id === room.id && last.U === q) {
        last.U++;
        last.bottom = Math.max(last.bottom, requiredBottom);
      } else runs.push({ room, u: q, U: q + 1, bottom: requiredBottom });
    }
    const selected: {
      room: ShipPrefabDocumentV1["rooms"][number];
      key: keyof typeof macro.wallTasks;
      u: number;
      U: number;
      bottom: number;
      runWidth: number;
    }[] = [];
    for (const room of doc.rooms) {
      const options = runs.filter(
        (r) => r.room.id === room.id && r.U - r.u >= 13,
      );
      const centre =
        ((room.rect[0] + room.rect[2]) * 8 - a[0]) * ux +
        ((room.rect[1] + room.rect[3]) * 8 - a[1]) * uy;
      options.sort(
        (A, B) =>
          Math.abs((A.u + A.U) / 2 - centre) -
            Math.abs((B.u + B.U) / 2 - centre) || A.u - B.u,
      );
      if (!options.length) continue;
      const run = options[0],
        key = wallTaskKey(room);
      const width = Math.min(macro.wallTasks[key].width, run.U - run.u);
      const u = Math.max(
        run.u,
        Math.min(run.U - width, Math.round(centre - width / 2)),
      );
      selected.push({
        room,
        key,
        u,
        U: u + width,
        bottom: Math.max(run.bottom, macro.wallTasks[key].bottom),
        runWidth: run.U - run.u,
      });
    }
    return selected;
  };
  const wallTaskCache = new Map<string, ReturnType<typeof wallTaskRuns>>();
  const wallTasksFor = (id: string, a: Pt, b: Pt, side: Pt) => {
    const key = `${id}:${side.join(",")}`;
    if (!wallTaskCache.has(key))
      wallTaskCache.set(key, wallTaskRuns(a, b, side));
    return wallTaskCache.get(key)!;
  };

  // R17 collects complete assemblies independently of envelope emission order.
  // A room receives one main group across ALL perimeter and partition faces.
  // Selection happens after generic walls/posts have their final ownership.
  type PendingWallTask = {
    room: ShipPrefabDocumentV1["rooms"][number];
    key: keyof typeof macro.wallTasks;
    u: number;
    U: number;
    bottom: number;
    runWidth: number;
    face: string;
    support: string;
    layers: ShipVisualLayer[];
  };
  const pendingWallTasks = new Map<string, PendingWallTask>();
  const deferWallTask = (
    chosen: ReturnType<typeof wallTaskRuns>[number],
    face: string,
    support: string,
    taskLayers: ShipVisualLayer[],
  ) => {
    if (!taskLayers.length) return;
    const id = `${chosen.room.id}:${face}`;
    let pending = pendingWallTasks.get(id);
    if (!pending) {
      pending = { ...chosen, face, support, layers: [] };
      pendingWallTasks.set(id, pending);
    }
    pending.layers.push(
      ...taskLayers.map((l) => ({
        ...l,
        id: `${l.id.slice(0, l.id.lastIndexOf(":"))}:room-task:${chosen.room.id}:${l.id.slice(l.id.lastIndexOf(":") + 1)}`,
      })),
    );
  };

  const finish = (
    envelope: ReadonlyMap<string, VisualCell>,
  ): ShipVisualLayer[] => {
    const layers: ShipVisualLayer[] = [];
    if (pendingWallTasks.size) {
      const eligible = new Map<string, PendingWallTask[]>();
      for (const task of pendingWallTasks.values()) {
        // A complete source group cannot repaint a jamb, cap, other wall, aperture
        // or unsupported air. Keep the existing conservative fitting/head guards.
        let safe = true;
        for (const l of task.layers) {
          for (let z = l.bounds[2]; safe && z < l.bounds[5]; z++)
            for (let y = l.bounds[1]; safe && y < l.bounds[4]; y++)
              for (let x = l.bounds[0]; safe && x < l.bounds[3]; x++) {
                const old = envelope.get(visualCellKey(x, y, z));
                if (
                  (!old && l.role !== "void") ||
                  (old &&
                    (old.family !== task.support ||
                      ["frame", "doorframe", "glass"].includes(old.role)))
                )
                  safe = false;
                // Removing or repainting pressure support as decorative hardware is
                // forbidden. The explicit retained backing remains role-core.
                if (old?.role === "core" && l.role !== "core") safe = false;
              }
          if (!safe) break;
        }
        if (!safe) continue;
        const roomTasks = eligible.get(task.room.id) ?? [];
        roomTasks.push(task);
        eligible.set(task.room.id, roomTasks);
      }
      for (const tasks of eligible.values()) {
        // Prefer a useful broad complete run, then its actual hardware area. Stable
        // face identity breaks ties without depending on a presentation camera.
        const contextDistance = (task: PendingWallTask) => {
          const min = [0, 1].map((a) =>
            Math.min(...task.layers.map((l) => l.bounds[a])),
          );
          const max = [0, 1].map((a) =>
            Math.max(...task.layers.map((l) => l.bounds[a + 3])),
          );
          const centre = [(min[0] + max[0]) / 32, (min[1] + max[1]) / 32];
          const context = interior.sockets.filter(
            (o) => o.room === task.room.id,
          );
          const points = context.map((o) => [
            o.at[0] + o.size[0] / 2,
            o.at[1] + o.size[1] / 2,
          ]);
          if (task.room.type === "bridge" && interior.station)
            points.push([...interior.station.at]);
          return points.length
            ? Math.min(
                ...points.map((p) =>
                  Math.hypot(centre[0] - p[0], centre[1] - p[1]),
                ),
              )
            : 0;
        };
        tasks.sort(
          (a, b) =>
            // Broad usable purpose faces remain preferred, then actual existing
            // equipment adjacency determines which face carries the main assembly.
            (b.U - b.u >= 32 ? 1 : 0) - (a.U - a.u >= 32 ? 1 : 0) ||
            b.runWidth - a.runWidth ||
            contextDistance(a) - contextDistance(b) ||
            b.U - b.u - (a.U - a.u) ||
            b.layers
              .filter((l) => l.role === "service")
              .reduce(
                (n, l) =>
                  n +
                  (l.bounds[3] - l.bounds[0]) *
                    (l.bounds[4] - l.bounds[1]) *
                    (l.bounds[5] - l.bounds[2]),
                0,
              ) -
              a.layers
                .filter((l) => l.role === "service")
                .reduce(
                  (n, l) =>
                    n +
                    (l.bounds[3] - l.bounds[0]) *
                      (l.bounds[4] - l.bounds[1]) *
                      (l.bounds[5] - l.bounds[2]),
                  0,
                ) ||
            a.face.localeCompare(b.face),
        );
        const main = tasks[0];
        // Manufacture a complete unequal assembly inside the qualified finish
        // footprint. Core courses stay intact; equipment depth comes from the
        // existing authored modules, never an extra wall volume in the room.
        const roomAssembly = (task: PendingWallTask) => {
          const footprint = new Map<string, ShipVisualLayer>();
          for (const l of task.layers)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              for (let y = l.bounds[1]; y < l.bounds[4]; y++)
                for (let x = l.bounds[0]; x < l.bounds[3]; x++)
                  footprint.set(visualCellKey(x, y, z), l);
          const bounds = [0, 1, 2]
            .map((a) => Math.min(...task.layers.map((l) => l.bounds[a])))
            .concat(
              [0, 1, 2].map((a) =>
                Math.max(...task.layers.map((l) => l.bounds[a + 3])),
              ),
            );
          const axis = bounds[3] - bounds[0] >= bounds[4] - bounds[1] ? 0 : 1;
          const width = bounds[axis + 3] - bounds[axis],
            height = bounds[5] - bounds[2];
          const split = Math.floor(
            width *
              (task.key === "quarters" ||
              task.key === "living" ||
              task.key === "lounge"
                ? 0.7
                : task.key === "galley"
                  ? 0.72
                  : 0.6),
          );
          const result: ShipVisualLayer[] = [];
          for (const [key, template] of footprint) {
            const [x, y, z] = key.split(",").map(Number),
              old = envelope.get(key);
            // The retained source core/backing is not an ornamental face.
            if (!old || old.role === "core") {
              result.push({
                ...template,
                bounds: [x, y, z, x + 1, y + 1, z + 1],
              });
              continue;
            }
            const u = (axis === 0 ? x : y) - bounds[axis],
              v = z - bounds[2];
            const edgeU = Math.min(u, width - 1 - u),
              edgeV = Math.min(v, height - 1 - v);
            const chosen: {
              role: ShipVisualLayer["role"];
              slot: ShipKitSlot;
              part: string;
            } = { role: "plate", slot: "primary", part: "joined-case" };
            const use = (
              name: string,
              r: ShipVisualLayer["role"],
              s: ShipKitSlot,
            ) => {
              chosen.part = name;
              chosen.role = r;
              chosen.slot = s;
            };
            if (edgeU + edgeV < 2) use("corner-seat", "void", "dark");
            else if (v < 2) use("continuous-lower-binding", "frame", "trim");
            else if (u === split || u === split + 1)
              use("overlap-shoulder", "plate", "trim");
            else {
              const well = edgeU >= 3 && v >= 3 && v < height - 3 && u < split;
              if (well) {
                use("well", "void", "dark");
                switch (task.key) {
                  case "engineering":
                    if (v === 5 || v === height - 6)
                      use("protected-cooling-bank", "service", "metal");
                    if (u >= split - 7 && v >= 5 && v < height - 5)
                      use("distribution-module", "plate", "accent");
                    if (u === split - 4 && v >= 6 && v < height - 6)
                      use("distribution-status", "service", "emit_b");
                    break;
                  case "workshop":
                    if (v === 4)
                      use("continuous-tool-bank", "service", "metal");
                    if ([5, 11, 17].includes(u) && v >= 5 && v <= 7)
                      use("protected-tool-dock", "service", "metal");
                    if (u >= split - 7 && v >= 8)
                      use("bench-power-module", "plate", "trim");
                    break;
                  case "medical":
                    if ([5, 9].includes(u) && v >= 5 && v < height - 5)
                      use("supply-manifold", "service", "metal");
                    if (u >= split - 9 && v >= 6 && v < height - 5)
                      use("medical-control-face", "plate", "trim");
                    if (u >= split - 7 && v === height - 6)
                      use("medical-status", "service", "emit_a");
                    break;
                  case "galley":
                    if (v === 4)
                      use("counter-utility-rail", "service", "metal");
                    if (u >= split - 10 && v >= 6 && v < height - 5)
                      use("utility-access-face", "plate", "trim");
                    if (u === split - 5 && v >= 7 && v < height - 6)
                      use("utility-handle", "service", "metal");
                    break;
                  case "cargo":
                    if (v >= 5 && v < height - 4)
                      use("load-storage-face", "plate", "trim");
                    if (
                      (u === 5 || u === split - 4) &&
                      v >= 5 &&
                      v < height - 4
                    )
                      use("load-restraint", "service", "metal");
                    break;
                  case "bridge":
                    if (u >= 5 && u < split - 4 && v >= 6 && v < height - 5)
                      use("bridge-distribution", "plate", "trim");
                    if (u >= 6 && u < split - 5 && v === height - 6)
                      use("bridge-power-status", "service", "emit_a");
                    if (v === 4) use("bridge-key-bank", "service", "metal");
                    break;
                  default:
                    if (v === 4)
                      use("reading-utility-shelf", "service", "metal");
                    if (u >= split - 8 && v >= 6 && v < height - 5)
                      use("berth-utility-face", "plate", "trim");
                    break;
                }
              } else if (
                u > split + 2 &&
                u < width - 3 &&
                v >= 4 &&
                v < height - 3
              ) {
                // The closed field is part of the same casing, rather than another
                // ring-framed postcard. Only its bounded latch seat is recessed.
                use("offset-storage-field", "plate", "primary");
                if (u === width - 5 && v >= 6 && v < height - 6)
                  use("storage-latch", "service", "metal");
                if (
                  task.key === "engineering" &&
                  u === width - 7 &&
                  v >= 6 &&
                  v < height - 6
                )
                  use("protected-task-status", "service", "emit_a");
              }
              if (u >= 3 && u < split - 2 && v === height - 3)
                use(
                  "contained-task-header",
                  "service",
                  task.key === "medical" || task.key === "bridge"
                    ? "emit_a"
                    : "emit_b",
                );
            }
            // A well removes only the one finish course; its complete backing is
            // independently checked on the final sampled assembly.
            const { role, slot, part } = chosen;
            if (
              role === "void" &&
              ![
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ].some(([dx, dy]) =>
                [1, 2].every(
                  (n) =>
                    envelope.get(visualCellKey(x + dx * n, y + dy * n, z))
                      ?.role === "core",
                ),
              )
            ) {
              result.push({
                ...template,
                bounds: [x, y, z, x + 1, y + 1, z + 1],
              });
              continue;
            }
            result.push({
              ...template,
              id: `${task.support}:room-task:${task.room.id}:${part}`,
              role,
              slot,
              bounds: [x, y, z, x + 1, y + 1, z + 1],
            });
          }
          return result;
        };
        main.layers = roomAssembly(main);
        layers.push(...main.layers);
        // A second usable face carries a DIFFERENT task, not a scaled copy of
        // the room's main fixture. Its clipped enclosure stays in the qualified
        // finish footprint; all wells remain backed by the original core.
        const mainKeys = new Set<string>();
        for (const l of main.layers)
          for (let z = l.bounds[2]; z < l.bounds[5]; z++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++)
              for (let x = l.bounds[0]; x < l.bounds[3]; x++)
                mainKeys.add(visualCellKey(x, y, z));
        for (const proposal of tasks.slice(1)) {
          if (proposal.face === main.face) continue;
          const bounds = [0, 1, 2]
            .map((a) => Math.min(...proposal.layers.map((l) => l.bounds[a])))
            .concat(
              [0, 1, 2].map((a) =>
                Math.max(...proposal.layers.map((l) => l.bounds[a + 3])),
              ),
            );
          const axis = bounds[3] - bounds[0] >= bounds[4] - bounds[1] ? 0 : 1;
          const width = Math.min(
            macro.secondaryWallTask.width,
            bounds[axis + 3] - bounds[axis],
          );
          const height = Math.min(
            macro.secondaryWallTask.height,
            bounds[5] - bounds[2],
          );
          if (width < 20 || height < 12) continue;
          const u0 = Math.floor((bounds[axis] + bounds[axis + 3] - width) / 2),
            z0 = bounds[2];
          const footprint = new Map<string, ShipVisualLayer>();
          for (const l of proposal.layers)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              for (let y = l.bounds[1]; y < l.bounds[4]; y++)
                for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
                  const q = axis === 0 ? x : y;
                  if (q >= u0 && q < u0 + width && z >= z0 && z < z0 + height)
                    footprint.set(visualCellKey(x, y, z), l);
                }
          const purpose = (
            {
              engineering: "cooling-distribution",
              workshop: "tool-rail",
              bridge: "power-status",
              medical: "oxygen-supply",
              cargo: "load-securement",
              galley: "utility-duct",
              quarters: "reading-storage",
              lounge: "media-utility",
              living: "reading-storage",
            } as const
          )[proposal.key];
          const companion: ShipVisualLayer[] = [];
          for (const [cellKey, template] of footprint) {
            const [x, y, z] = cellKey.split(",").map(Number);
            const old = envelope.get(cellKey);
            // A companion cannot turn structural backing into decorative fittings.
            if (!old || old.role === "core") continue;
            const u = (axis === 0 ? x : y) - u0,
              v = z - z0;
            if (Math.min(u, width - 1 - u) + Math.min(v, height - 1 - v) < 2)
              continue;
            let role: ShipVisualLayer["role"] = "plate",
              slot: ShipKitSlot = "primary",
              part = "clipped-case";
            const well = u >= 2 && u < width - 2 && v >= 3 && v < height - 3;
            if (well) {
              role = "void";
              slot = "dark";
              part = "well";
            }
            const item = (
              name: string,
              r: ShipVisualLayer["role"],
              s: ShipKitSlot,
            ) => {
              part = name;
              role = r;
              slot = s;
            };
            if (well) {
              const split = Math.floor(width * 0.62);
              switch (proposal.key) {
                case "engineering":
                case "galley":
                  if (u < split && (v === 4 || v === 7))
                    item("broad-duct-louver", "service", "metal");
                  if (u >= split + 1 && v >= 4 && v < height - 4)
                    item("distribution-face", "plate", "accent");
                  if (u === width - 4 && v >= 5 && v < height - 4)
                    item("distribution-latch", "service", "metal");
                  break;
                case "workshop":
                  if (v === 4) item("continuous-tool-rail", "service", "metal");
                  if (u < split && [4, 10, 16].includes(u) && v >= 5 && v <= 7)
                    item("tool-dock", "service", "metal");
                  if (u >= split + 1 && v >= 5)
                    item("tool-power-face", "plate", "trim");
                  break;
                case "medical":
                  if ([4, 8].includes(u) && v >= 4 && v < height - 4)
                    item("supply-manifold", "service", "metal");
                  if (u >= split && v >= 4)
                    item("medical-supply-face", "plate", "trim");
                  break;
                case "cargo":
                  item("load-locker-face", "plate", "accent");
                  if ((u === 4 || u === width - 5) && v >= 4)
                    item("load-retaining-strap", "service", "metal");
                  break;
                default:
                  if (u >= split && v >= 4)
                    item("local-utility-face", "plate", "trim");
                  if (u < split && v === 4)
                    item("lower-reading-shelf", "service", "metal");
                  if (u === width - 5 && v >= 5 && v < height - 4)
                    item("utility-handle", "service", "metal");
                  break;
              }
            }
            if (
              u >= 3 &&
              u <
                (proposal.key === "bridge"
                  ? width - 4
                  : Math.floor(width * 0.58)) &&
              v === height - 3
            )
              item(
                "protected-task-header",
                "service",
                proposal.key === "bridge" || proposal.key === "medical"
                  ? "emit_a"
                  : "emit_b",
              );
            companion.push({
              ...template,
              id: `${proposal.support}:secondary-room-task:${proposal.room.id}:${purpose}:${part}`,
              role,
              slot,
              bounds: [x, y, z, x + 1, y + 1, z + 1],
            });
          }
          // Reject an incomplete or unsupported insert instead of preserving a
          // count by filling air or stealing a pressure course.
          if (
            !companion.some((l) => l.role === "void") ||
            !companion.some((l) => l.role === "service")
          )
            continue;
          let safe = true;
          for (const l of companion) {
            if (l.bounds.some((v, i) => i < 3 && v >= l.bounds[i + 3])) {
              safe = false;
              break;
            }
            for (let z = l.bounds[2]; safe && z < l.bounds[5]; z++)
              for (let y = l.bounds[1]; safe && y < l.bounds[4]; y++)
                for (let x = l.bounds[0]; safe && x < l.bounds[3]; x++) {
                  const key = visualCellKey(x, y, z),
                    old = envelope.get(key);
                  if (
                    mainKeys.has(key) ||
                    (!old && l.role !== "void") ||
                    (old &&
                      (old.family !== proposal.support ||
                        ["frame", "doorframe", "glass"].includes(old.role))) ||
                    (old?.role === "core" && l.role !== "core")
                  )
                    safe = false;
                  if (
                    l.role === "void" &&
                    ![
                      [1, 0],
                      [-1, 0],
                      [0, 1],
                      [0, -1],
                    ].some(([dx, dy]) =>
                      [1, 2].every(
                        (n) =>
                          envelope.get(visualCellKey(x + dx * n, y + dy * n, z))
                            ?.role === "core",
                      ),
                    )
                  )
                    safe = false;
                }
            if (!safe) break;
          }
          if (safe) {
            layers.push(...companion);
            break;
          }
        }
      }
    }
    return layers;
  };
  return {
    inputs: macro,
    forFace: wallTasksFor,
    collect: deferWallTask,
    finish,
    hasTasks: () => pendingWallTasks.size > 0,
  };
}
