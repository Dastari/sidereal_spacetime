import {
  Copy,
  FlipHorizontal,
  FlipVertical,
  Focus,
  Hand,
  MousePointer2,
  PanelLeftClose,
  PanelRightClose,
  RotateCw,
  Ruler,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Tool } from "./LayoutCanvas";
type EditAction = "rotate" | "mirror-x" | "mirror-y" | "copy" | "remove";
function Action({
  label,
  icon: Icon,
  onClick,
  disabled,
  active,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <Icon size={17} />
    </button>
  );
}
export function LayoutToolbar({
  tool,
  blocked,
  hasSelection,
  partitionSelected,
  onTool,
  onAction,
  onZoom,
  onToggle,
  onFit,
}: {
  tool: Tool;
  blocked: boolean;
  hasSelection: boolean;
  partitionSelected: boolean;
  onTool: (tool: Tool) => void;
  onAction: (action: EditAction) => void;
  onZoom: (direction: "in" | "out") => void;
  onToggle: (side: "left" | "right") => void;
  onFit: () => void;
}) {
  return (
    <div className="layout-toolbar" role="group" aria-label="Floorplan tools">
      <Action
        label="Toggle palette"
        icon={PanelLeftClose}
        onClick={() => onToggle("left")}
      />
      <Action
        label="Select (click / Shift-click / box)"
        icon={MousePointer2}
        onClick={() => onTool("select")}
        active={tool === "select"}
      />
      <Action
        label="Pan (middle drag or Space)"
        icon={Hand}
        onClick={() => onTool("pan")}
        active={tool === "pan"}
      />
      <span className="layout-toolbar-divider" />
      <Action
        label="Measure vertices"
        icon={Ruler}
        onClick={() => onTool(tool === "measure" ? "select" : "measure")}
        active={tool === "measure"}
      />
      {hasSelection && (
        <>
          <Action
            label="Rotate 90° (R)"
            icon={RotateCw}
            onClick={() => onAction("rotate")}
            disabled={blocked}
          />
          <Action
            label="Mirror X (F)"
            icon={FlipHorizontal}
            onClick={() => onAction("mirror-x")}
            disabled={blocked || !hasSelection}
          />
          <Action
            label="Mirror Y (Shift+F)"
            icon={FlipVertical}
            onClick={() => onAction("mirror-y")}
            disabled={blocked || !hasSelection}
          />
          <Action
            label="Copy (Ctrl+D)"
            icon={Copy}
            onClick={() => onAction("copy")}
            disabled={blocked || !hasSelection}
          />
          <Action
            label={
              partitionSelected
                ? "Delete partition and its openings"
                : "Delete selection"
            }
            icon={Trash2}
            onClick={() => onAction("remove")}
            disabled={blocked || !hasSelection}
          />
        </>
      )}
      <span className="layout-toolbar-divider" />
      <Action label="Fit floorplan" icon={Focus} onClick={onFit} />
      <button aria-label="Zoom out" onClick={() => onZoom("out")}>
        −
      </button>
      <span className="layout-zoom">Zoom</span>
      <button aria-label="Zoom in" onClick={() => onZoom("in")}>
        +
      </button>
      <Action
        label="Toggle inspector"
        icon={PanelRightClose}
        onClick={() => onToggle("right")}
      />
    </div>
  );
}
