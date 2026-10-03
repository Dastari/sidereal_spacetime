import { useRef, useState } from "react";
import {
  FURNISHING_DEFAULT,
  readFurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
import {
  furnishingRequest,
  type FurnishingRequest,
} from "./furnishing-command";
import "./furnishing-editor.css";
export interface FurnishingEditorProps {
  instance: {
    id: string;
    furnishingsJson?: string;
    furnishingRevision?: bigint;
  };
  placementId: string;
  name: string;
  mode: "move" | "delete" | "snap";
  submit: (request: FurnishingRequest) => Promise<unknown>;
  close: () => void;
}
/** A reducer proposal editor. An uncertain retry keeps the exact operation and payload. */
export function FurnishingEditor({
  instance,
  placementId,
  name,
  mode,
  submit,
  close,
}: FurnishingEditorProps) {
  const sourceId = placementId.slice("prefab:socket:".length),
    accepted =
      readFurnishingOverrides(instance.furnishingsJson)[sourceId] ??
      FURNISHING_DEFAULT;
  const title =
    mode === "delete" ? "Delete" : mode === "snap" ? "Snapping for" : "Arrange";
  const [dx, setDx] = useState(String(accepted.dx)),
    [dy, setDy] = useState(String(accepted.dy)),
    [yaw, setYaw] = useState(String((accepted.yaw * 180) / Math.PI)),
    [snap, setSnap] = useState(
      mode === "snap" ? !accepted.snap : accepted.snap,
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const previous = useRef<FurnishingRequest | undefined>(undefined);
  const valid =
    [dx, dy, yaw].every((v) => v.trim() !== "" && Number.isFinite(Number(v))) &&
    Math.abs(Number(dx)) <= 32 &&
    Math.abs(Number(dy)) <= 32 &&
    Math.abs(Number(yaw)) <= 360;
  const apply = async (retry = false) => {
    if (pending || (!valid && mode === "move")) return;
    const request =
      retry && previous.current
        ? previous.current
        : furnishingRequest(instance, placementId, mode, {
            dx: mode === "move" ? Number(dx) : accepted.dx,
            dy: mode === "move" ? Number(dy) : accepted.dy,
            yaw: mode === "move" ? (Number(yaw) * Math.PI) / 180 : accepted.yaw,
            snap,
          });
    previous.current = request;
    setPending(true);
    setError("");
    try {
      await submit(request);
      close();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };
  const reset = () => {
    setDx(String(accepted.dx));
    setDy(String(accepted.dy));
    setYaw(String((accepted.yaw * 180) / Math.PI));
    setSnap(accepted.snap);
    previous.current = undefined;
    setError("");
  };
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`${title} ${name}`}
      className="furnishing-editor"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !pending) close();
      }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <header>
        <h2>
          {title} {name}
        </h2>
        <button
          aria-label="Close furniture editor"
          disabled={pending}
          onClick={close}
        >
          ×
        </button>
      </header>
      {mode !== "delete" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          {mode === "move" ? (
            <>
              <p>Position and rotation on the ship’s deck.</p>
              <label>
                Fore / aft offset <span>m</span>
                <input
                  autoFocus
                  type="number"
                  step={snap ? 0.25 : "any"}
                  min={-32}
                  max={32}
                  value={dx}
                  disabled={pending || !!error}
                  onChange={(e) => setDx(e.target.value)}
                />
              </label>
              <label>
                Port / starboard offset <span>m</span>
                <input
                  type="number"
                  step={snap ? 0.25 : "any"}
                  min={-32}
                  max={32}
                  value={dy}
                  disabled={pending || !!error}
                  onChange={(e) => setDy(e.target.value)}
                />
              </label>
              <label>
                Rotation <span>°</span>
                <input
                  type="number"
                  step={snap ? 15 : "any"}
                  min={-360}
                  max={360}
                  value={yaw}
                  disabled={pending || !!error}
                  onChange={(e) => setYaw(e.target.value)}
                />
              </label>
            </>
          ) : (
            <p>Choose how the next placement edit snaps.</p>
          )}
          <label className="furnishing-editor__snap">
            <input
              type="checkbox"
              checked={snap}
              disabled={pending || !!error}
              onChange={(e) => setSnap(e.target.checked)}
            />
            Snapping {snap ? "on" : "off"}
          </label>
          <small>
            {snap
              ? "0.25 m position steps · 15° rotation steps"
              : "Free position and rotation"}
          </small>
          <footer>
            <button type="button" disabled={pending} onClick={close}>
              Cancel
            </button>
            <button type="submit" disabled={pending || !valid || !!error}>
              {pending
                ? "Applying…"
                : mode === "snap"
                  ? "Apply snapping"
                  : "Apply placement"}
            </button>
          </footer>
        </form>
      ) : (
        <>
          <p>Remove this furnishing from your ship?</p>
          <p className="furnishing-editor__note">
            Occupied seats and storage with items or liquids must be cleared
            first.
          </p>
          <footer>
            <button disabled={pending} onClick={close}>
              Cancel
            </button>
            <button
              className="furnishing-editor__delete"
              disabled={pending || !!error}
              onClick={() => void apply()}
            >
              {pending ? "Deleting…" : "Delete furnishing"}
            </button>
          </footer>
        </>
      )}
      {error && (
        <div className="furnishing-editor__error" role="alert">
          <p>{error}</p>
          <button disabled={pending} onClick={() => void apply(true)}>
            Retry same request
          </button>
          <button disabled={pending} onClick={reset}>
            Use current placement
          </button>
        </div>
      )}
    </section>
  );
}
