/**
 * Studio Definitions workspace (roadmap X-1 with the first slice of ST-2/ST-3): browse every
 * definition kind, edit item and weapon definitions in forms generated from the shared
 * validator, save server drafts, publish immutable revisions, retire revisions and inspect
 * where a definition is used. The server authorises every action by per-kind grant.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDot,
  FilePlus2,
  History,
  Lock,
  RefreshCw,
  Search,
  Send,
  Undo2,
  Upload,
} from "lucide-react";
import {
  DEFINITION_KINDS,
  DEFINITION_KIND_SPECS,
  DEFINITION_ID_PATTERN,
  definitionKey,
  definitionStatus,
  definitionWorkspace,
  grantAllows,
  isDefinitionCapability,
  publishBlocker,
  retireBlocker,
  revisionIssues,
  validateDefinition,
  type DefinitionCapability,
  type DefinitionKind,
} from "@sidereal/sim/content-definitions";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import { protectedDefinitionUses } from "@sidereal/content/definition-references";
import { uuid } from "../editor/uuid";
import { DefinitionForm } from "./DefinitionForm";
import { useDefinitionsConnection } from "./useDefinitionsConnection";
import "./definitions.css";

type Payload = Record<string, unknown>;
type Tab = "form" | "json" | "changes" | "history" | "usage";
const EDITS_KEY = "sidereal.definitions.edits.v1";

function readEdits(): Record<string, { base: string; payload: Payload }> {
  try {
    return JSON.parse(localStorage.getItem(EDITS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeEdits(edits: Record<string, { base: string; payload: Payload }>) {
  localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
}
const parse = (json: string): Payload | null => {
  try {
    return json ? (JSON.parse(json) as Payload) : null;
  } catch {
    return null;
  }
};
/** Flat `path -> value` for a readable change list. */
function flatten(value: unknown, prefix = "", out = new Map<string, string>()) {
  if (value && typeof value === "object" && !Array.isArray(value))
    for (const [k, v] of Object.entries(value))
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out.set(prefix, JSON.stringify(value));
  return out;
}
function changes(before: Payload | null, after: Payload) {
  const a = flatten(before ?? {}),
    b = flatten(after);
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .filter((k) => a.get(k) !== b.get(k))
    .map((k) => ({ path: k, before: a.get(k), after: b.get(k) }));
}
function summary(kind: DefinitionKind, p: Payload | null) {
  if (!p) return "";
  if (kind === "item")
    return `${p.width}×${p.height} · ${p.massKg} kg${p.equipSlot ? " · " + p.equipSlot : ""}`;
  if (kind === "weapon")
    return `${p.damage} dmg · ${p.cooldownMs} ms · ${p.rangeMeters} m${p.mode ? " · " + p.mode : ""}`;
  if (kind === "component")
    return `${p.sizeClass} · ${p.family} · ${p.massKg} kg${p.status === "future" ? " · future" : ""}`;
  if (kind === "interaction" && Array.isArray(p.verbs))
    return `${(p.verbs as { label: string }[]).map((v) => v.label).join(" / ")} · ${p.reachM} m`;
  if (kind === "loot_table" && Array.isArray(p.entries))
    return `${p.entries.length} entries · ${p.rolls} roll${p.rolls === 1 ? "" : "s"}`;
  return typeof p.name === "string" ? p.name : "";
}
const when = (micros: bigint) =>
  micros
    ? new Date(Number(micros / 1000n))
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")
    : "";
const initialParams = () => new URLSearchParams(location.search);

export default function DefinitionsWorkspace() {
  const {
    connection,
    status,
    error: connectionError,
    serial,
  } = useDefinitionsConnection();
  const [kind, setKind] = useState<DefinitionKind>(() => {
    const k = initialParams().get("kind");
    return (DEFINITION_KINDS as readonly string[]).includes(k ?? "")
      ? (k as DefinitionKind)
      : "weapon";
  });
  const [selected, setSelected] = useState<string>(
    () => initialParams().get("id") ?? "",
  );
  const [tab, setTab] = useState<Tab>(
    () => (initialParams().get("tab") as Tab) ?? "form",
  );
  const [query, setQuery] = useState("");
  const [newId, setNewId] = useState("");
  const [edits, setEdits] = useState(readEdits);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const pending = useRef<{ request: string; operationId: string } | null>(null);
  void serial;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set("kind", kind);
    if (selected) params.set("id", selected);
    else params.delete("id");
    params.set("tab", tab);
    history.replaceState(null, "", `/definitions?${params}`);
  }, [kind, selected, tab]);

  const grants = connection
    ? [...connection.db.ownConstructionGrants.iter()]
    : [];
  const capsFor = (k: DefinitionKind) =>
    new Set(
      grants
        .filter(
          (g) =>
            g.workspaceId === definitionWorkspace(k) &&
            !g.revoked &&
            isDefinitionCapability(g.capability),
        )
        .map((g) => g.capability as DefinitionCapability),
    );
  const can = (k: DefinitionKind, needed: DefinitionCapability) =>
    [...capsFor(k)].some((c) => grantAllows(c, needed));
  const heads = connection
    ? [...connection.db.adminContentDefinitionHeads.iter()]
    : [];
  const revisions = connection
    ? [...connection.db.adminContentDefinitions.iter()]
    : [];
  const usageRows = connection
    ? [...connection.db.adminContentDefinitionUsage.iter()]
    : [];
  const spec = DEFINITION_KIND_SPECS[kind];
  const kindHeads = heads
    .filter((h) => h.kind === kind)
    .sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  const key = selected ? definitionKey(kind, selected) : "";
  const head = kindHeads.find((h) => h.definitionId === selected);
  const history_ = revisions
    .filter((r) => r.definitionKey === key)
    .sort((a, b) => Number(b.revision - a.revision));
  const current = history_.find((r) => r.revision === head?.currentRevision);
  const latest = history_.find((r) => r.revision === head?.latestRevision);
  const baseline: Payload | null = selected
    ? (parse(head?.draftJson ?? "") ??
      parse(current?.payloadJson ?? "") ??
      parse(latest?.payloadJson ?? "") ??
      (head ? null : spec.template(selected)))
    : null;
  const baseTag = `${head?.revision ?? 0}`;
  const localEdit = key ? edits[key] : undefined;
  const payload: Payload | null =
    localEdit && localEdit.base === baseTag ? localEdit.payload : baseline;
  const staleEdit = !!localEdit && localEdit.base !== baseTag;
  const validation = useMemo(
    () =>
      payload && selected ? validateDefinition(kind, selected, payload) : null,
    [kind, selected, payload && stableStringify(payload)],
  );
  const ruleIssues =
    validation?.ok && latest
      ? revisionIssues(kind, latest.payloadJson, validation.canonical)
      : [];
  const dirty =
    !!payload &&
    !!baseline &&
    stableStringify(payload) !== stableStringify(baseline);
  const usage = usageRows.find((u) => u.definitionKey === key);
  const readable = DEFINITION_KINDS.filter((k) => can(k, "definition.read"));
  const canWrite = can(kind, "definition.write");
  const canPublish = can(kind, "definition.publish");
  const blocker = publishBlocker(kind);
  const protectedUses = selected ? protectedDefinitionUses(kind, selected) : [];

  useEffect(() => {
    if (tab === "json" && payload)
      setJsonText(JSON.stringify(payload, null, 2));
    setJsonError("");
  }, [tab, key, payload && stableStringify(payload)]);

  const setPayload = (next: Payload) => {
    if (!key) return;
    const all = { ...readEdits(), [key]: { base: baseTag, payload: next } };
    writeEdits(all);
    setEdits(all);
  };
  const dropEdit = () => {
    if (!key) return;
    const all = readEdits();
    delete all[key];
    writeEdits(all);
    setEdits(all);
  };
  const operation = (request: unknown) => {
    const text = JSON.stringify(request, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    if (!pending.current || pending.current.request !== text)
      pending.current = { request: text, operationId: uuid() };
    return pending.current.operationId;
  };
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      pending.current = null;
      setNotice(label);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(`Saved draft of ${key}`, async () => {
      if (!validation?.ok) throw Error("Fix the highlighted fields first");
      const args = {
        kind,
        definitionId: selected,
        payloadJson: validation.canonical,
        expectedRevision: head?.revision ?? 0n,
      };
      await connection!.reducers.saveDefinitionDraft({
        ...args,
        operationId: operation(["save", args]),
      });
      dropEdit();
    });
  const publish = () =>
    run(
      `Published ${key} revision ${(head?.latestRevision ?? 0n) + 1n}`,
      async () => {
        if (!head?.draftJson) throw Error("Save a draft first");
        const args = {
          kind,
          definitionId: selected,
          expectedRevision: head.revision,
          expectedDraftSha256: head.draftSha256,
        };
        await connection!.reducers.publishDefinition({
          ...args,
          operationId: operation(["publish", args]),
        });
      },
    );
  const discard = () =>
    run(`Discarded the draft of ${key}`, async () => {
      const args = {
        kind,
        definitionId: selected,
        expectedRevision: head?.revision ?? 0n,
      };
      await connection!.reducers.discardDefinitionDraft({
        ...args,
        operationId: operation(["discard", args]),
      });
      dropEdit();
    });
  const retire = (revision: bigint) =>
    run(`Retired ${key}@${revision}`, async () => {
      const args = {
        kind,
        definitionId: selected,
        revision,
        expectedRevision: head?.revision ?? 0n,
      };
      await connection!.reducers.retireDefinition({
        ...args,
        operationId: operation(["retire", args]),
      });
    });
  const refreshUsage = () =>
    run(`Counted where ${kind} definitions are used`, async () => {
      await connection!.reducers.refreshDefinitionUsage({ kind });
    });

  const filtered = kindHeads.filter((h) =>
    (
      h.definitionId +
      " " +
      summary(
        kind,
        parse(h.draftJson) ??
          parse(
            revisions.find(
              (r) =>
                r.definitionKey === h.definitionKey &&
                r.revision === h.currentRevision,
            )?.payloadJson ?? "",
          ),
      )
    )
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const choose = (k: DefinitionKind) => {
    setKind(k);
    setSelected("");
    setError("");
    setNotice("");
  };
  const createNew = () => {
    const id = newId.trim();
    if (!DEFINITION_ID_PATTERN.test(id)) {
      setError(
        "Use 1-80 lowercase letters, digits, '.', '_' or '-' for the ID",
      );
      return;
    }
    setSelected(id);
    setNewId("");
    setTab("form");
    if (!kindHeads.some((h) => h.definitionId === id))
      setNotice(`New ${kind} ${id}: edit, then save a draft`);
  };

  const statusChip = (h: (typeof kindHeads)[number]) => {
    const s = definitionStatus(h);
    return (
      <span className={"defs-chip " + s}>
        {s === "published" ? `r${h.currentRevision}` : s}
      </span>
    );
  };

  return (
    <main className="defs" aria-label="Content definitions">
      <header className="defs-header">
        <div>
          <span className="muted">Definitions · roadmap X-1 to X-3</span>
          <h1>Content definitions</h1>
        </div>
        <div className="defs-connection" role="status">
          <span className={"defs-dot " + (status === "ready" ? "good" : "")} />
          {status === "ready"
            ? `Registry connected · ${readable.length} kind${readable.length === 1 ? "" : "s"} readable`
            : status}
          {connectionError && (
            <span className="defs-error-inline">{connectionError}</span>
          )}
        </div>
      </header>
      <p className="defs-runtime-note">
        <AlertTriangle size={16} />
        Publishing records an immutable revision. Items and weapons created
        after it use the new revision in game; existing instances keep the
        revision they pin until an operator resync.
      </p>
      <div className="defs-body">
        <nav className="defs-kinds" aria-label="Definition kinds">
          {(["seeded", "validated", "planned"] as const).map((stage) => (
            <section key={stage}>
              <h2>
                {stage === "seeded"
                  ? "Editable now"
                  : stage === "validated"
                    ? "Drafts · publish opens with runtime"
                    : "Planned kinds"}
              </h2>
              {DEFINITION_KINDS.filter(
                (k) => DEFINITION_KIND_SPECS[k].stage === stage,
              ).map((k) => {
                const s = DEFINITION_KIND_SPECS[k];
                const caps = capsFor(k);
                const count = heads.filter((h) => h.kind === k).length;
                return (
                  <button
                    key={k}
                    className={"defs-kind" + (k === kind ? " active" : "")}
                    aria-current={k === kind ? "page" : undefined}
                    onClick={() => choose(k)}
                  >
                    <span className="defs-kind-label">{s.label}</span>
                    <span className="defs-kind-meta">
                      {caps.size
                        ? [
                            can(k, "definition.read") && "read",
                            caps.has("definition.write") && "write",
                            caps.has("definition.publish") && "publish",
                          ]
                            .filter(Boolean)
                            .join(" · ") + (count ? ` · ${count}` : "")
                        : stage === "seeded"
                          ? "no access"
                          : `publish: ${s.landsIn.split(" (")[0]}`}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <section className="defs-list" aria-label={`${spec.label} definitions`}>
          <div className="defs-list-head">
            <h2>{spec.label}</h2>
            <p>{spec.description}</p>
            <dl className="defs-facts">
              <dt>Validator</dt>
              <dd>{spec.validator}</dd>
              <dt>Seeded from</dt>
              <dd>{spec.seededFrom}</dd>
              <dt>Runtime</dt>
              <dd>{spec.runtimeConsumer}</dd>
              <dt>Editor</dt>
              <dd>{spec.studioEditor}</dd>
            </dl>
          </div>
          {!can(kind, "definition.read") ? (
            <div className="defs-empty">
              <p>
                No <code>definition.read</code>, <code>write</code> or{" "}
                <code>publish</code> grant on{" "}
                <code>{definitionWorkspace(kind)}</code>.
              </p>
              <p className="muted">
                An operator grants these per kind (
                <code>operator_set_definition_grant</code>) or an administrator
                through <code>set_construction_grant</code>.
              </p>
            </div>
          ) : (
            <>
              <label className="defs-search">
                <Search size={15} />
                <input
                  type="search"
                  placeholder={`Filter ${kindHeads.length} definitions`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {canWrite && (
                <div className="defs-new">
                  <input
                    type="text"
                    placeholder="new-definition-id"
                    value={newId}
                    spellCheck={false}
                    onChange={(e) => setNewId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createNew()}
                  />
                  <button
                    onClick={createNew}
                    disabled={!newId.trim()}
                    title="New definition"
                  >
                    <FilePlus2 size={16} /> New
                  </button>
                </div>
              )}
              <ul className="defs-items">
                {filtered.map((h) => {
                  const p =
                    parse(
                      revisions.find(
                        (r) =>
                          r.definitionKey === h.definitionKey &&
                          r.revision ===
                            (h.currentRevision || h.latestRevision),
                      )?.payloadJson ?? "",
                    ) ?? parse(h.draftJson);
                  return (
                    <li key={h.definitionKey}>
                      <button
                        className={
                          "defs-item" +
                          (h.definitionId === selected ? " active" : "")
                        }
                        onClick={() => {
                          setSelected(h.definitionId);
                          setError("");
                          setNotice("");
                        }}
                      >
                        <span className="defs-item-id">
                          {h.definitionId}
                          {h.draftJson && (
                            <CircleDot
                              size={12}
                              className="defs-draft-dot"
                              aria-label="has draft"
                            />
                          )}
                        </span>
                        <span className="defs-item-sub">
                          {kind === "item" && typeof p?.name === "string"
                            ? p.name + " · "
                            : ""}
                          {summary(kind, p)}
                        </span>
                        {statusChip(h)}
                      </button>
                    </li>
                  );
                })}
                {!filtered.length && (
                  <li className="defs-empty small">
                    {kindHeads.length
                      ? "Nothing matches the filter."
                      : spec.seededFrom.startsWith("Nothing") ||
                          spec.stage === "planned"
                        ? "No drafts yet."
                        : "Registry empty for this kind: the operator seed import has not run."}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        <section className="defs-detail" aria-label="Definition editor">
          {!selected || !payload ? (
            <div className="defs-empty">
              <p>
                Select a definition{canWrite ? " or create a new one" : ""}.
              </p>
            </div>
          ) : (
            <>
              <div className="defs-detail-head">
                <div>
                  <h2>
                    <code>{key}</code>
                  </h2>
                  <p className="defs-state">
                    {head ? (
                      <>
                        {head.currentRevision
                          ? `Current r${head.currentRevision}`
                          : head.latestRevision
                            ? "All revisions retired"
                            : "Never published"}
                        {head.draftJson &&
                          ` · server draft (based on r${head.draftBaseRevision})`}
                        {` · edit revision ${head.revision}`}
                      </>
                    ) : (
                      "New definition (not saved)"
                    )}
                    {dirty && <strong> · unsaved changes</strong>}
                  </p>
                </div>
                <div className="defs-actions">
                  {dirty && (
                    <button
                      onClick={dropEdit}
                      disabled={busy}
                      title="Revert unsaved changes"
                    >
                      <Undo2 size={16} /> Revert
                    </button>
                  )}
                  <button
                    onClick={save}
                    disabled={busy || !canWrite || !dirty || !validation?.ok}
                    title={
                      canWrite
                        ? "Save a server draft"
                        : "definition.write required"
                    }
                  >
                    <Upload size={16} /> Save draft
                  </button>
                  {head?.draftJson && (
                    <button
                      onClick={discard}
                      disabled={busy || !canWrite || dirty}
                    >
                      <Archive size={16} /> Discard draft
                    </button>
                  )}
                  <button
                    className="primary"
                    onClick={publish}
                    disabled={
                      busy ||
                      !canPublish ||
                      !!blocker ||
                      dirty ||
                      !head?.draftJson ||
                      ruleIssues.length > 0 ||
                      !validation?.ok
                    }
                    title={
                      blocker ??
                      (!canPublish
                        ? "definition.publish required"
                        : dirty
                          ? "Save the draft first; publish takes the saved draft"
                          : "Publish the saved draft as a new immutable revision")
                    }
                  >
                    <Send size={16} /> Publish
                  </button>
                </div>
              </div>
              {staleEdit && (
                <p className="defs-warning">
                  Your unsaved edit was based on edit revision {localEdit!.base}
                  ; the server is now at {baseTag}. Revert to load the server
                  state.
                </p>
              )}
              {blocker && <p className="defs-warning">{blocker}.</p>}
              {(error || notice) && (
                <p
                  className={error ? "defs-error" : "defs-notice"}
                  role={error ? "alert" : "status"}
                >
                  {error || notice}
                </p>
              )}
              {validation && !validation.ok && (
                <ul className="defs-issues" aria-label="Validation issues">
                  {validation.issues.map((i) => (
                    <li key={i.path + i.message}>
                      <code>{i.path || "payload"}</code> {i.message}
                    </li>
                  ))}
                </ul>
              )}
              {ruleIssues.length > 0 && (
                <ul className="defs-issues" aria-label="Revision rule issues">
                  {ruleIssues.map((i) => (
                    <li key={i.path + i.message}>
                      <code>{i.path}</code> {i.message}
                    </li>
                  ))}
                </ul>
              )}
              {validation?.ok && !ruleIssues.length && (
                <p className="defs-valid">
                  <CheckCircle2 size={15} /> Valid for {validation.validator} ·
                  sha256 <code>{validation.sha256.slice(0, 12)}</code>
                </p>
              )}
              <div className="defs-tabs" role="tablist">
                {(
                  [
                    ["form", "Form"],
                    ["json", "JSON"],
                    ["changes", "Changes"],
                    ["history", `History (${history_.length})`],
                    ["usage", "Where used"],
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="defs-tab-body">
                {tab === "form" && (
                  <DefinitionForm
                    fields={spec.fields}
                    value={payload}
                    issues={
                      validation && !validation.ok
                        ? validation.issues
                        : ruleIssues
                    }
                    disabled={!canWrite || busy}
                    onChange={setPayload}
                  />
                )}
                {tab === "json" && (
                  <div className="defs-json">
                    <textarea
                      value={jsonText}
                      spellCheck={false}
                      disabled={!canWrite || busy}
                      onChange={(e) => {
                        setJsonText(e.target.value);
                        try {
                          const v = JSON.parse(e.target.value);
                          if (!v || typeof v !== "object" || Array.isArray(v))
                            throw Error("Payload must be a JSON object");
                          setPayload(v);
                          setJsonError("");
                        } catch (err) {
                          setJsonError(
                            String(err instanceof Error ? err.message : err),
                          );
                        }
                      }}
                    />
                    {jsonError && <p className="defs-error">{jsonError}</p>}
                  </div>
                )}
                {tab === "changes" && (
                  <div className="defs-changes">
                    <p className="muted">
                      Compared with{" "}
                      {current
                        ? `current revision r${current.revision}`
                        : "nothing published"}
                      .
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>{current ? `r${current.revision}` : "Before"}</th>
                          <th>Editing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes(
                          parse(current?.payloadJson ?? ""),
                          payload,
                        ).map((c) => (
                          <tr key={c.path}>
                            <td>
                              <code>{c.path}</code>
                            </td>
                            <td className="before">{c.before ?? "—"}</td>
                            <td className="after">{c.after ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!changes(parse(current?.payloadJson ?? ""), payload)
                      .length && <p className="muted">No differences.</p>}
                  </div>
                )}
                {tab === "history" && (
                  <>
                    <table className="defs-history">
                      <thead>
                        <tr>
                          <th>Revision</th>
                          <th>Status</th>
                          <th>Source</th>
                          <th>Published (UTC)</th>
                          <th>sha256</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {history_.map((r) => (
                          <tr key={r.definitionRef}>
                            <td>
                              <code>{r.definitionRef}</code>
                              {r.revision === head?.currentRevision && (
                                <span className="defs-chip published">
                                  current
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={"defs-chip " + r.status}>
                                {r.status}
                              </span>
                            </td>
                            <td>{r.source}</td>
                            <td>{when(r.publishedMicros)}</td>
                            <td>
                              <code>{r.sha256.slice(0, 10)}</code>
                            </td>
                            <td>
                              {r.status === "published" &&
                                (() => {
                                  const guard = retireBlocker(
                                    kind,
                                    selected,
                                    history_,
                                    r.revision,
                                  );
                                  return (
                                    <button
                                      onClick={() => retire(r.revision)}
                                      disabled={busy || !canPublish || !!guard}
                                      title={
                                        guard ??
                                        "Retire: no new pins; existing pins stay valid"
                                      }
                                    >
                                      {guard ? (
                                        <Lock size={14} />
                                      ) : (
                                        <History size={14} />
                                      )}{" "}
                                      {guard ? "Protected" : "Retire"}
                                    </button>
                                  );
                                })()}
                            </td>
                          </tr>
                        ))}
                        {!history_.length && (
                          <tr>
                            <td colSpan={6} className="muted">
                              Nothing published yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {protectedUses.length > 0 && (
                      <p className="defs-protected">
                        <Lock size={14} /> Protected: {key} is used by{" "}
                        {protectedUses.join(", ")}. Its last published revision
                        cannot be retired; publish a replacement first.
                      </p>
                    )}
                  </>
                )}
                {tab === "usage" && (
                  <div className="defs-usage">
                    <div className="defs-usage-head">
                      <p className="muted">
                        {usage
                          ? `Counted ${when(usage.computedMicros)} UTC.`
                          : "Not counted yet."}{" "}
                        Instances created before X-2 have no explicit pin and
                        use revision 1 (the seed).
                      </p>
                      <button
                        onClick={refreshUsage}
                        disabled={busy || !can(kind, "definition.read")}
                      >
                        <RefreshCw size={15} /> Recount{" "}
                        {spec.label.toLowerCase()}
                      </button>
                    </div>
                    {usage && (
                      <dl className="defs-facts wide">
                        <dt>Instances</dt>
                        <dd>{usage.instanceCount.toString()}</dd>
                        <dt>By pinned revision</dt>
                        <dd>
                          {Object.entries(
                            JSON.parse(usage.pinsJson) as Record<
                              string,
                              number
                            >,
                          )
                            .map(([rev, n]) => `r${rev}: ${n}`)
                            .join(", ") || "—"}
                        </dd>
                        <dt>Referenced by</dt>
                        <dd>
                          {(JSON.parse(usage.referencedByJson) as string[]).map(
                            (ref) => (
                              <code key={ref}>{ref}</code>
                            ),
                          )}
                          {!(JSON.parse(usage.referencedByJson) as string[])
                            .length && "—"}
                        </dd>
                      </dl>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
