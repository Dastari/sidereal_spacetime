/**
 * Signed-in construction workspace actions for a prefab publication. Same sign-in,
 * connection session, expected-revision and operation-id pattern as the layout
 * editor's ConstructionPanel; reducers validate and commit, the dashboard only asks.
 */
import { useEffect, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import { compileConstruction } from "../../../../../packages/sim/src/construction-transactions";
import { createConnectionSession } from "../../../../../packages/net/src/connection-session";
import { connectConstruction } from "../../../../../packages/net/src/construction";
import type { DbConnection } from "../../../../../packages/net/src/generated";
import { authoringAuth, loadAuthoringAccount } from "../../authoring/auth";
import { uuid } from "../layout/useLayout";
import type { PrefabPublication } from "./publish";

export default function PublishAuthority({ publication, name, revision }: { publication: PrefabPublication; name: string; revision: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [status, setStatus] = useState("signed out");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [busy, setBusy] = useState(false);
  const [serial, setSerial] = useState(0);
  const pending = useRef<{ request: string; operationId: string } | null>(null);
  const authenticated = !!user?.id_token && !user.expired;

  useEffect(() => {
    let live = true;
    const loaded = (u: User) => {
      if (live) setUser(u);
    };
    const removed = () => {
      if (live) setUser(null);
    };
    loadAuthoringAccount()
      .then((u) => live && setUser(u))
      .catch((e) => setError(String(e)));
    authoringAuth().events.addUserLoaded(loaded);
    authoringAuth().events.addUserUnloaded(removed);
    return () => {
      live = false;
      authoringAuth().events.removeUserLoaded(loaded);
      authoringAuth().events.removeUserUnloaded(removed);
    };
  }, []);
  useEffect(() => {
    if (!user?.id_token || user.expired) {
      setConnection(null);
      setStatus("signed out");
      return;
    }
    const session = createConnectionSession(
      connectConstruction,
      setConnection,
      (s, e) => {
        setStatus(s);
        if (e) setError(e);
      },
      () => setSerial((n) => n + 1),
      { kind: "oidc", token: user.id_token },
    );
    return () => session.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  void serial;
  const grants = connection ? [...connection.db.ownConstructionGrants.iter()] : [];
  const drafts = connection ? [...connection.db.ownConstructionDrafts.iter()].filter((d) => d.workspaceId === workspace) : [];
  const blueprints = connection ? [...connection.db.ownConstructionBlueprints.iter()].filter((b) => b.workspaceId === workspace) : [];
  const remote = drafts.find((d) => d.id === publication.draftId);
  const allowed = (cap: string) => status === "ready" && grants.some((g) => g.workspaceId === workspace && g.capability === cap && !g.revoked);
  useEffect(() => {
    if (workspace) return;
    const g = grants.find((x) => !x.revoked);
    if (g) setWorkspace(g.workspaceId);
  }, [serial, workspace, grants]);

  const operation = (request: unknown[]) => {
    const key = JSON.stringify(request, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    if (!pending.current || pending.current.request !== key) pending.current = { request: key, operationId: uuid() };
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
    run(`Saved ${name} revision ${revision} to workspace ${workspace}`, async () => {
      const expectedRevision = remote?.revision ?? 0n;
      const args = { workspaceId: workspace, draftId: publication.draftId, documentJson: publication.documentJson, expectedRevision };
      await connection!.reducers.saveConstructionDraft({ ...args, operationId: operation(["save", args]) });
    });
  const publish = () =>
    run(`Published ${name} revision ${revision} as an immutable blueprint`, async () => {
      const local = compileConstruction(publication.documentJson);
      if (!remote || remote.sha256 !== local.sha256) throw Error("Save this exact document to the workspace before publishing");
      const args = { workspaceId: workspace, draftId: publication.draftId, expectedRevision: remote.revision };
      await connection!.reducers.publishConstructionBlueprint({ ...args, operationId: operation(["publish", args]) });
    });
  const spawn = (blueprintId: string, expectedSha256: string, sourceDeckId: string) =>
    run("Review instance requested", async () => {
      const args = { blueprintId, expectedSha256, sourceDeckId };
      await connection!.reducers.spawnConstructionBlueprint({ ...args, operationId: operation(["spawn", args]) });
    });

  if (!user)
    return (
      <div className="pf-authority">
        <p>Sign in with a Shipyard authoring account. Workspace access is granted by an administrator; ship ownership grants none.</p>
        <button
          onClick={() => {
            if (location.origin !== import.meta.env.VITE_AUTH_ORIGIN) {
              location.href = `${import.meta.env.VITE_AUTH_ORIGIN}/shipyard/prefabs`;
              return;
            }
            void authoringAuth()
              .signinRedirect()
              .catch((e) => setError(String(e)));
          }}
        >
          Sign in to Shipyard
        </button>
        {error && <p className="pf-error">{error}</p>}
      </div>
    );
  return (
    <div className="pf-authority">
      <p>
        {user.profile.preferred_username ?? user.profile.name ?? "Signed-in account"}, connection {status}.
      </p>
      <label className="pf-field">
        <span>Workspace id</span>
        <input value={workspace} onChange={(e) => setWorkspace(e.target.value.trim())} aria-label="Construction workspace" />
      </label>
      <p className="layout-note">
        Draft {publication.draftId}
        {remote ? `, workspace revision ${String(remote.revision)}` : ", not yet in this workspace"}.
      </p>
      <div className="pf-row">
        <button disabled={busy || !workspace || !allowed("draft.write")} onClick={() => void save()}>
          Save workspace draft
        </button>
        <button className="layout-primary" disabled={busy || !remote || !allowed("blueprint.publish") || !allowed("draft.read")} onClick={() => void publish()}>
          Publish immutable blueprint
        </button>
      </div>
      {!grants.some((g) => !g.revoked) && status === "ready" && <p className="layout-note">No workspace grant on this account. An administrator must grant access.</p>}
      {blueprints.map((b) => {
        let label = b.id;
        let deck = "";
        try {
          const c = JSON.parse(b.canonical);
          label = c.layout?.name ?? b.id;
          deck = c.layout?.playableDeckId ?? "";
        } catch {
          /* Show the id when the canonical form is not a layout wrapper. */
        }
        return (
          <div key={b.id} className="pf-blueprint-row">
            <span>
              {label} <small>{b.sha256.slice(0, 12)}</small>
            </span>
            <button disabled={busy || !deck || !allowed("instance.spawn")} onClick={() => void spawn(b.id, b.sha256, deck)}>
              Spawn review instance
            </button>
          </div>
        );
      })}
      {notice && <p className="pf-ok">{notice}</p>}
      {error && <p className="pf-error" role="alert">{error}</p>}
      <button className="pf-link" onClick={() => void authoringAuth().signoutRedirect().catch((e) => setError(String(e)))}>
        Sign out
      </button>
    </div>
  );
}
