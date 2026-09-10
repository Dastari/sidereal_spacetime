import type { PartAsset, PartCatalog } from "@sidereal/content/assembly";
import {
  type LayoutDocument,
  type Point,
  type ServiceChannel,
  type Shape,
} from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
import type { Tool } from "./LayoutCanvas";
import type { ViewState } from "./state";
import { useLayout } from "./useLayout";
export interface LayoutPanelContext {
  editor: ReturnType<typeof useLayout>;
  doc: LayoutDocument | null;
  result: CompiledLayout | undefined;
  view: ViewState;
  blocked: boolean;
  showLeft: boolean;
  showRight: boolean;
  selection: string[];
  select: (ids: string[]) => void;
  updateView: (value: Partial<ViewState>) => void;
  commit: (change: (doc: LayoutDocument) => LayoutDocument) => void;
  search: string;
  setSearch: (value: string) => void;
  shape: Shape;
  setShape: (value: Shape) => void;
  tool: Tool;
  setTool: (value: Tool) => void;
  roomType: string;
  setRoomType: (value: string) => void;
  channel: ServiceChannel;
  setChannel: (value: ServiceChannel) => void;
  reuseNodes: boolean;
  setReuseNodes: (value: boolean) => void;
  catalog: PartCatalog | undefined;
  catalogError: string;
  asset: PartAsset | undefined;
  setAsset: (asset: PartAsset) => void;
  inspector: "Inspector" | "Layers" | "Validation";
  setInspector: (value: "Inspector" | "Layers" | "Validation") => void;
  selectedTile: LayoutDocument["tiles"][number] | undefined;
  selectedWallKey?: string;
  selectedRoom: LayoutDocument["rooms"][number] | undefined;
  selectedPartition: LayoutDocument["partitions"][number] | undefined;
  selectedOpening: LayoutDocument["openings"][number] | undefined;
  selectedFitting: LayoutDocument["fittings"][number] | undefined;
  selectedRoute: LayoutDocument["routes"][number] | undefined;
  changeSelected: (
    key: "rooms" | "partitions" | "openings" | "fittings" | "routes",
    change: Record<string, unknown>,
  ) => void;
  turns: number;
  setTurns: (value: number) => void;
  mirrorX: boolean;
  setMirrorX: (value: boolean) => void;
  mirrorY: boolean;
  setMirrorY: (value: boolean) => void;
  metrics: { length: number; width: number } | null;
  errors: number;
  transform: (
    action: "rotate" | "mirror-x" | "mirror-y" | "copy" | "move",
    delta?: Point,
  ) => void;
}
