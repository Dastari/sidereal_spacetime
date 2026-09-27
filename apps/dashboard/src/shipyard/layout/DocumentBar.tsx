import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { Download, Plus, Redo2, Save, Ship, Undo2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { PublicationDialog } from "./PublicationDialog";
import { hasArmorReviewParts } from "./armor-review";
import type { useLayout } from "./useLayout";
export function DocumentBar({
  editor,
  blocked,
  commit,
  onNew,
}: {
  editor: ReturnType<typeof useLayout>;
  blocked: boolean;
  commit: (change: (doc: LayoutDocument) => LayoutDocument) => void;
  onNew: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [publishing, setPublishing] = useState(false);
  return (
    <header className="layout-document-bar">
      <Ship className="document-symbol" size={23} />
      <input
        aria-label="Document name"
        value={editor.doc?.name ?? "Preserved recovery"}
        disabled={blocked}
        onChange={(e) => commit((d) => ({ ...d, name: e.target.value }))}
      />
      <span className="layout-save-status" role="status">
        <i />
        {editor.saved}
      </span>
      <div className="layout-document-actions">
        <button
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={blocked || !editor.history?.past.length}
          onClick={editor.undo}
        >
          <Undo2 size={16} />
          <span>Undo</span>
        </button>
        <button
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={blocked || !editor.history?.future.length}
          onClick={editor.redo}
        >
          <Redo2 size={16} />
          <span>Redo</span>
        </button>
        <button onClick={onNew}>
          <Plus size={16} />
          <span>New</span>
        </button>
        <button onClick={editor.save} disabled={blocked}>
          <Save size={16} />
          Save draft
        </button>
        <button
          className="layout-primary"
          disabled={blocked || hasArmorReviewParts(editor.doc)}
          title={
            hasArmorReviewParts(editor.doc)
              ? "This armor kit is available for editor review. Game installation is not yet qualified."
              : undefined
          }
          onClick={() => setPublishing(true)}
        >
          Publish
        </button>
        <details className="layout-file-menu">
          <summary>File</summary>
          <div>
            <button onClick={() => input.current?.click()}>
              <Upload size={16} /> Import draft
            </button>
            <button onClick={editor.exportDraft}>
              <Download size={16} /> Export draft
            </button>
            {editor.legacy && (
              <button onClick={editor.exportLegacy}>
                Export previous assembly
              </button>
            )}
          </div>
        </details>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void editor.importFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
      {publishing && (
        <PublicationDialog
          editor={editor}
          onClose={() => setPublishing(false)}
        />
      )}
    </header>
  );
}
