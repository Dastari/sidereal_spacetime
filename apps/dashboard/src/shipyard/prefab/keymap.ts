/** One keymap for the prefab editor; the `?` overlay renders this table. */
import type { EdgeTypeId, FaceNormal, QuarterTurn, RoomTypeId, ShapeTileId } from "@sidereal/content/construction-grammar";
import type { MountMode } from "./snapping";

export type ToolId = "select" | "hull" | "erase" | "room" | "edge" | "mount" | "skylight";

export const TOOLS: { id: ToolId; label: string; key: string; hint: string }[] = [
  { id: "select", label: "Select", key: "V", hint: "Click to select. Drag rooms, mounts and skylights to move. Drag empty space to pan." },
  { id: "hull", label: "Hull paint", key: "B", hint: "Drag to paint shape tiles into the active volume. R rotates, F mirrors, [ ] cycles shapes." },
  { id: "erase", label: "Erase tiles", key: "E", hint: "Drag over tiles to remove them from the active volume." },
  { id: "room", label: "Room", key: "M", hint: "Drag a rectangle of cells to add a room of the chosen type." },
  { id: "edge", label: "Edge", key: "D", hint: "Click a cell edge between rooms. Doors take two cells. Clicking the same edge again removes it." },
  { id: "mount", label: "Mount", key: "P", hint: "Pick a component, then click a green anchor. R turns interior modules." },
  { id: "skylight", label: "Skylight", key: "K", hint: "Click the roof to add a skylight. R swaps 2x3 and 3x2." },
];

export const TOOL_BY_KEY: Record<string, ToolId> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

export const SHORTCUTS: { keys: string; action: string }[] = [
  ...TOOLS.map((t) => ({ keys: t.key, action: `${t.label} tool` })),
  { keys: "S", action: "Toggle port/starboard symmetry" },
  { keys: "R", action: "Rotate tile, interior module facing or skylight" },
  { keys: "F", action: "Mirror the hull tile" },
  { keys: "[ ]", action: "Previous / next tile shape, edge type or skylight size" },
  { keys: "Arrows", action: "Nudge the selection 1 m (mounts 0.5 m); Shift for 5 m" },
  { keys: "Delete", action: "Remove the selection" },
  { keys: "Esc", action: "Deselect, cancel the drag" },
  { keys: "Ctrl+Z / Ctrl+Shift+Z", action: "Undo / redo" },
  { keys: "Ctrl+S", action: "Save the draft now" },
  { keys: "Home", action: "Fit the ship in view" },
  { keys: "Wheel, middle or right drag", action: "Zoom, pan" },
  { keys: "?", action: "Show or hide this list" },
];

export interface ToolState {
  tool: ToolId;
  volume: string;
  shape: ShapeTileId;
  rot: QuarterTurn;
  reflected: boolean;
  roomType: RoomTypeId;
  roomLabel: string;
  edgeType: EdgeTypeId;
  component: string | null;
  mountMode: MountMode;
  facing: FaceNormal;
  skylight: [number, number];
  symmetry: boolean;
  centreline: number;
}

export const SKYLIGHT_SIZES: [number, number][] = [
  [2, 2],
  [2, 3],
  [3, 2],
  [3, 3],
];
