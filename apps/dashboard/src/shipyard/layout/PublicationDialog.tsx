import { lazy, Suspense, useEffect, useRef } from "react";
import type { useLayout } from "./useLayout";
const ConstructionPanel = lazy(
  () => import("../../authoring/ConstructionPanel"),
);
export function PublicationDialog({
  editor,
  onClose,
}: {
  editor: ReturnType<typeof useLayout>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="template-library-dialog"
      onCancel={onClose}
      aria-labelledby="template-library-title"
    >
      <header>
        <div>
          <h2 id="template-library-title">Ship templates</h2>
          <p>
            Save a workspace draft, publish a revision, then create an
            independent test ship.
          </p>
        </div>
        <button onClick={onClose} aria-label="Close ship templates">
          Close
        </button>
      </header>
      <Suspense fallback={<p>Opening template library…</p>}>
        <ConstructionPanel doc={editor.doc} onLoad={editor.adoptServer} />
      </Suspense>
    </dialog>
  );
}
