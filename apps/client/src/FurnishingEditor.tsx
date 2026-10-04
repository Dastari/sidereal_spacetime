import { useRef, useState } from "react";
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
  submit: (request: FurnishingRequest) => Promise<unknown>;
  close: () => void;
}
/** Destructive deletion keeps confirmation; arranging happens directly in the scene. */
export function FurnishingEditor({
  instance,
  placementId,
  name,
  submit,
  close,
}: FurnishingEditorProps) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const previous = useRef<FurnishingRequest | undefined>(undefined);
  const apply = async (retry = false) => {
    if (pending) return;
    const request =
      retry && previous.current
        ? previous.current
        : furnishingRequest(instance, placementId, "delete");
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
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${name}`}
      className="furnishing-editor"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" && !pending) close();
      }}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <header>
        <h2>Delete {name}</h2>
        <button
          aria-label="Close furniture editor"
          disabled={pending}
          onClick={close}
        >
          ×
        </button>
      </header>
      <p>Remove this furnishing from your ship?</p>
      <p className="furnishing-editor__note">
        Occupied seats and storage with items or liquids must be cleared first.
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
      {error && (
        <div className="furnishing-editor__error" role="alert">
          <p>{error}</p>
          <button disabled={pending} onClick={() => void apply(true)}>
            Retry same request
          </button>
          <button
            disabled={pending}
            onClick={() => {
              previous.current = undefined;
              setError("");
            }}
          >
            Use current placement
          </button>
        </div>
      )}
    </section>
  );
}
