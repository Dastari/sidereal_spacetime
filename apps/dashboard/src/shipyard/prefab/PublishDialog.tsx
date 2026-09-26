/**
 * "Publish blueprint" dialog: validation gate, revision bump and, separated below, the
 * signed-in workspace actions (save draft, publish immutable blueprint, spawn a review
 * instance). The workspace section only loads when the construction adapter exists.
 */
import type { PrefabComponentCatalog, PrefabIssue, ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { updateMeta } from "./commands";
import { loadPublicationAdapter, publicationGate, type PublicationAdapter } from "./publish";

const PublishAuthority = lazy(() => import("./PublishAuthority"));

type Doc = ShipPrefabDocumentV1;

export function PublishDialog({
  doc,
  catalog,
  commit,
  onClose,
  onPickIssue,
  onExport,
}: {
  doc: Doc;
  catalog: PrefabComponentCatalog;
  commit: (label: string, doc: Doc) => void;
  onClose: () => void;
  onPickIssue: (i: PrefabIssue) => void;
  onExport: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [adapter, setAdapter] = useState<PublicationAdapter | null>(null);
  const gate = useMemo(() => publicationGate(doc, catalog), [doc, catalog]);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => {
    let live = true;
    void loadPublicationAdapter(catalog).then((a) => {
      if (live) setAdapter(a);
    });
    return () => {
      live = false;
    };
  }, [catalog]);
  const build = useMemo(() => {
    if (!adapter?.available || !gate.ok) return null;
    try {
      return { value: adapter.build(doc), error: "" };
    } catch (e) {
      return { value: null, error: String(e instanceof Error ? e.message : e) };
    }
  }, [adapter, doc, gate.ok]);

  return (
    <dialog ref={ref} className="layout-dialog pf-publish" aria-label="Publish blueprint" onCancel={onClose}>
      <header className="pf-dialog-head">
        <h2>Publish blueprint</h2>
        <button aria-label="Close" onClick={onClose}>
          Close
        </button>
      </header>
      <section className="pf-publish-step" data-state={gate.ok ? "pass" : "fail"}>
        <h3>Validation</h3>
        {gate.ok ? (
          <p>
            {doc.name} passes every grammar rule{gate.warnings.length ? ` with ${gate.warnings.length} warning${gate.warnings.length === 1 ? "" : "s"}` : ""}.
          </p>
        ) : (
          <>
            <p>
              Fix {gate.errors.length} error{gate.errors.length === 1 ? "" : "s"} before publishing. Select one to jump to it.
            </p>
            <ul className="layout-validation">
              {gate.errors.slice(0, 6).map((i, n) => (
                <li key={n} data-severity="error">
                  <button
                    onClick={() => {
                      onPickIssue(i);
                      onClose();
                    }}
                  >
                    <strong>{i.code.replace(/[.-]/g, " ")}</strong>
                    <span>{i.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="pf-publish-step" data-state="info">
        <h3>Revision</h3>
        <p>
          Publishing records {doc.id} at revision {doc.revision}. Published blueprints are immutable; publish changes as a new revision.
        </p>
        <button onClick={() => commit("Bump revision", updateMeta(doc, { revision: doc.revision + 1 }))}>Bump to revision {doc.revision + 1}</button>
      </section>
      <section className="pf-publish-step pf-publish-authority" data-state={adapter?.available ? "info" : "fail"}>
        <h3>Workspace</h3>
        {!adapter ? (
          <p role="status">Checking construction authority</p>
        ) : !adapter.available ? (
          <>
            <p>{adapter.reason}</p>
            <button onClick={onExport}>Export JSON</button>
          </>
        ) : !gate.ok ? (
          <p>Workspace actions unlock once validation passes.</p>
        ) : build?.error || !build?.value ? (
          <p className="pf-error">The construction document could not be built: {build?.error}</p>
        ) : (
          <Suspense fallback={<p role="status">Loading workspace connection</p>}>
            <PublishAuthority publication={build.value} name={doc.name} revision={doc.revision} />
          </Suspense>
        )}
      </section>
    </dialog>
  );
}
