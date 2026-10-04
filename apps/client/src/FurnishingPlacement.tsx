import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  FURNISHING_DEFAULT,
  furnishingMountKind,
  readFurnishingOverrides,
  type FurnishingOverride,
} from "@sidereal/content/wayfarer-furnishings";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabWalkFrame } from "@sidereal/sim/prefab-construction";
import { planFurnishingEdit } from "@sidereal/sim/ship-furnishings";
import {
  floorPreviewIssue,
  furnishingPlanePoint,
  wallDragPose,
  type FurnishingRay,
} from "./furnishing-drag";
import {
  furnishingRequest,
  type FurnishingRequest,
} from "./furnishing-command";
import type { ObjectPlacementState } from "@sidereal/canvas-ui";
export interface FurnishingPlacementView {
  previewFurnishing(
    id: string,
    pose: FurnishingOverride,
    valid?: boolean,
  ): boolean;
  clearFurnishingPreview(): void;
  pickFurnishingPreview(x: number, y: number): boolean;
  furnishingRay(x: number, y: number): FurnishingRay | undefined;
}
interface Props {
  instance: {
    id: string;
    documentJson: string;
    furnishingsJson?: string;
    furnishingRevision?: bigint;
  };
  placementId: string;
  canvas: HTMLCanvasElement | null;
  renderer: () => FurnishingPlacementView | undefined;
  submit: (request: FurnishingRequest) => Promise<unknown>;
  close: () => void;
  cancelRef: RefObject<(() => void) | undefined>;
  actionRef: RefObject<((action: string) => void) | undefined>;
  onState: (state: ObjectPlacementState) => void;
}
/** Pointer samples are transient presentation; only an intentional drop sends a revisioned intent. */
export function FurnishingPlacement({
  instance,
  placementId,
  canvas,
  renderer,
  submit,
  close,
  cancelRef,
  actionRef,
  onState,
}: Props) {
  const id = placementId.slice("prefab:socket:".length);
  const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!;
  const wall = furnishingMountKind(id) === "wall";
  const overrides = useMemo(
    () => readFurnishingOverrides(instance.furnishingsJson),
    [instance.furnishingsJson],
  );
  const accepted = overrides[id] ?? FURNISHING_DEFAULT;
  const binding = useMemo(() => {
    const p = JSON.parse(instance.documentJson).prefab;
    return {
      doc: readShipPrefab(p.document),
      catalog: prefabComponentCatalogFor(p.catalog),
    };
  }, [instance.documentJson]);
  const frame = useMemo(
    () => prefabWalkFrame(binding.doc, binding.catalog, overrides),
    [binding, overrides],
  );
  const [pose, setPose] = useState<FurnishingOverride>(() => ({ ...accepted }));
  const [pending, setPending] = useState(false),
    [issue, setIssue] = useState(""),
    [error, setError] = useState("");
  const current = useRef({ pose, pending, issue, error });
  current.current = { pose, pending, issue, error };
  const previous = useRef<FurnishingRequest | undefined>(undefined);
  const draftBase = useRef(instance);
  const grab = useRef<
    | {
        pointer: number;
        offset: [number, number];
        moved: boolean;
        start: [number, number];
      }
    | undefined
  >(undefined);
  const release = () => {
    const pointer = grab.current?.pointer;
    grab.current = undefined;
    if (pointer !== undefined && canvas?.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
  };
  const preview = (next: FurnishingOverride, message = "") => {
    current.current.pose = next;
    current.current.issue = message;
    setPose(next);
    setIssue(message);
    renderer()?.previewFurnishing(id, next, !message);
  };
  const apply = async (retry = false) => {
    if (
      current.current.pending ||
      (!retry && (current.current.issue || current.current.error))
    )
      return;
    const request =
      retry && previous.current
        ? previous.current
        : furnishingRequest(
            draftBase.current,
            placementId,
            "move",
            current.current.pose,
          );
    previous.current = request;
    current.current.pending = true;
    setPending(true);
    setError("");
    try {
      await submit(request);
      close();
    } catch (e) {
      const message = String(e);
      current.current.error = message;
      setError(message);
    } finally {
      current.current.pending = false;
      setPending(false);
    }
  };
  const reset = () => {
    release();
    if (accepted.deleted) {
      close();
      return;
    }
    previous.current = undefined;
    draftBase.current = instance;
    current.current.error = "";
    setError("");
    preview({ ...accepted });
  };
  useEffect(() => {
    const cancel = () => {
      if (!current.current.pending) close();
    };
    cancelRef.current = cancel;
    return () => {
      if (cancelRef.current === cancel) cancelRef.current = undefined;
    };
  }, [cancelRef, close]);
  useEffect(() => {
    if (!canvas) return;
    if (!current.current.pending && !previous.current) {
      if (overrides[id]?.deleted) {
        close();
        return;
      }
      if (
        draftBase.current.furnishingRevision !== instance.furnishingRevision
      ) {
        release();
        draftBase.current = instance;
        current.current.pose = { ...accepted };
        current.current.issue = "";
        setPose({ ...accepted });
        setIssue("");
      }
    }
    const view = renderer();
    if (!view) return;
    if (
      !view.previewFurnishing(id, current.current.pose, !current.current.issue)
    ) {
      current.current.issue =
        "This object is no longer available. Cancel and select its current placement.";
      setIssue(current.current.issue);
      return;
    }
    const down = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        current.current.pending ||
        current.current.error ||
        !view.pickFurnishingPreview(e.clientX, e.clientY)
      )
        return;
      const point = furnishingPlanePoint(
        view.furnishingRay(e.clientX, e.clientY),
        (source.min[2] + source.max[2]) / 2,
      );
      if (!point) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      canvas.focus({ preventScroll: true });
      const p = current.current.pose;
      grab.current = {
        pointer: e.pointerId,
        offset: [
          point[0] - (source.min[0] + source.max[0]) / 2 - p.dx,
          point[1] - (source.min[1] + source.max[1]) / 2 - p.dy,
        ],
        moved: false,
        start: [e.clientX, e.clientY],
      };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const drag = grab.current;
      if (!drag || drag.pointer !== e.pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (
        Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 3 &&
        !drag.moved
      )
        return;
      drag.moved = true;
      const ray = view.furnishingRay(e.clientX, e.clientY),
        old = current.current.pose;
      let next: FurnishingOverride | undefined;
      if (wall) next = wallDragPose(binding.doc, id, ray, old.snap);
      else {
        const point = furnishingPlanePoint(
          ray,
          (source.min[2] + source.max[2]) / 2,
        );
        if (point) {
          try {
            next = planFurnishingEdit(
              binding.doc,
              {},
              {
                sourceObjectId: id,
                action: "move",
                dx:
                  point[0] -
                  drag.offset[0] -
                  (source.min[0] + source.max[0]) / 2,
                dy:
                  point[1] -
                  drag.offset[1] -
                  (source.min[1] + source.max[1]) / 2,
                yaw: old.yaw,
                snap: old.snap,
              },
            )[id];
          } catch {
            /* Out-of-bounds proposal is not committed. */
          }
        }
      }
      if (!next) {
        preview(
          old,
          wall
            ? "Drag onto a wall with enough room for this object."
            : "Keep the object inside the ship.",
        );
        return;
      }
      preview(next, wall ? "" : floorPreviewIssue(source, next, frame));
    };
    const up = (e: PointerEvent) => {
      if (grab.current?.pointer !== e.pointerId) return;
      const moved = grab.current.moved;
      release();
      e.preventDefault();
      e.stopImmediatePropagation();
      if (moved) void apply();
    };
    const cancel = () => {
      if (!grab.current) return;
      release();
      if (!current.current.pending && !previous.current)
        preview({ ...accepted });
    };
    const blur = () => {
      release();
      if (!current.current.pending && !previous.current)
        preview({ ...accepted });
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!current.current.pending) close();
      }
      if (
        e.code === "KeyR" &&
        !wall &&
        !e.repeat &&
        !current.current.pending &&
        !current.current.error
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        rotate(e.shiftKey ? -1 : 1);
      }
    };
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointermove", move, true);
    canvas.addEventListener("pointerup", up, true);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", key, true);
    return () => {
      release();
      view.clearFurnishingPreview();
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", up, true);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", key, true);
    };
  }, [
    canvas,
    instance.documentJson,
    instance.furnishingRevision,
    id,
    renderer(),
  ]);
  const rotate = (direction: number) => {
    const old = current.current.pose;
    const yaw = Math.atan2(
      Math.sin(old.yaw + (direction * Math.PI) / 12),
      Math.cos(old.yaw + (direction * Math.PI) / 12),
    );
    const next = { ...old, yaw };
    preview(next, floorPreviewIssue(source, next, frame));
  };
  useEffect(() => {
    onState({ pending, snap: pose.snap, wall, issue, error });
  }, [pending, pose.snap, wall, issue, error, onState]);
  useEffect(() => {
    const action = (id: string) => {
      if (current.current.pending) return;
      if (id === "placement-cancel") close();
      else if (id === "placement-retry") void apply(true);
      else if (id === "placement-reset") reset();
      else if (!current.current.error) {
        if (id === "placement-place") void apply();
        else if (id === "placement-snap")
          preview(
            { ...current.current.pose, snap: !current.current.pose.snap },
            current.current.issue,
          );
        else if (!wall && id === "placement-left") rotate(-1);
        else if (!wall && id === "placement-right") rotate(1);
      }
    };
    actionRef.current = action;
    return () => {
      if (actionRef.current === action) actionRef.current = undefined;
    };
  });
  return null;
}
