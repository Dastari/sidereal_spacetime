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
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      className="layout-dialog design-start-dialog"
      aria-label="Publish design"
    >
      <header>
        <h2>Publish design</h2>
        <button aria-label="Close publication" onClick={onClose}>
          ×
        </button>
      </header>
      <Suspense fallback={<p role="status">Loading publication…</p>}>
        <ConstructionPanel
          doc={editor.doc}
          onLoad={(d) => {
            editor.adoptServer(d);
            onClose();
          }}
        />
      </Suspense>
    </dialog>
  );
}
