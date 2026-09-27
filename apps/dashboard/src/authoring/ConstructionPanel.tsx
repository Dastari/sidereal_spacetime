import {
  constructionForLayout,
  rememberConstructionSource,
  storedConstructionSource,
} from "./construction-document";
import { CONSTRUCTION_BOUNDARY_FAMILY_PIN } from "@sidereal/content/construction-boundary-family";
import { CONSTRUCTION_BOUNDARY_PIN } from "@sidereal/content/construction-boundary";
import { CONSTRUCTION_ROOF_PIN } from "@sidereal/content/construction-roof";
import { useEffect, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import type { LayoutDocument } from "../../../../packages/content/src/ship-layout";
import { compileConstruction } from "../../../../packages/sim/src/construction-transactions";
import { createConnectionSession } from "@sidereal/net/connection-session";
import { connectConstruction } from "../../../../packages/net/src/construction";
import type { DbConnection } from "@sidereal/net/generated";
import { authoringAuth, loadAuthoringAccount } from "./auth";
import { uuid } from "../shipyard/layout/useLayout";
import { draftOptionsKey, readDraftOptions } from "./draft-options";
export default function ConstructionPanel({
  doc,
  onLoad,
}: {
  doc: LayoutDocument | null;
  onLoad: (doc: LayoutDocument) => void;
}) {
  const [user, setUser] = useState<User | null>(null),
    [connection, setConnection] = useState<DbConnection | null>(null),
    [status, setStatus] = useState("Signed out"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [busy, setBusy] = useState(false),
    [serial, setSerial] = useState(0),
    [base, setBase] = useState<{ id: string; revision: bigint } | null>(null);
  const [boundaries, setBoundaries] = useState(false);
  const [familyBoundaries, setFamilyBoundaries] = useState(false);
  const [roofs, setRoofs] = useState(false);
  const [optionsScope, setOptionsScope] = useState("");
  const scope =
    user && workspace && doc
      ? draftOptionsKey(user.profile.sub, workspace, doc.id)
      : "";
  const optionsReady = !!scope && optionsScope === scope;
  const sessionRef = useRef<ReturnType<
    typeof createConnectionSession<DbConnection>
  > | null>(null);
  const authenticated = !!user?.id_token && !user.expired;
  const pending = useRef<{ request: string; operationId: string } | null>(null);
  useEffect(() => {
    let live = true;
    const loaded = (u: User) => {
        if (live) setUser(u);
      },
      removed = () => {
        if (live) setUser(null);
      };
    loadAuthoringAccount()
      .then((u) => {
        if (live) setUser(u);
      })
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
      setStatus("Signed out");
      return;
    }
    const session = createConnectionSession(
      connectConstruction,
      setConnection,
      (s, e) => {
        setStatus(s);
        if (e) setError(e);
      },
      () => setSerial((s) => s + 1),
      { kind: "oidc", token: user.id_token },
    );
    sessionRef.current = session;
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, [authenticated]);
  useEffect(() => {
    if (user?.id_token && !user.expired)
      sessionRef.current?.authenticate({ kind: "oidc", token: user.id_token });
  }, [user?.id_token]);
  const grants = connection
      ? [...connection.db.ownConstructionGrants.iter()]
      : [],
    drafts = connection
      ? [...connection.db.ownConstructionDrafts.iter()].filter(
          (d) => d.workspaceId === workspace,
        )
      : [],
    blueprints = connection
      ? [...connection.db.ownConstructionBlueprints.iter()].filter(
          (d) => d.workspaceId === workspace,
        )
      : [];
  const allowed = (cap: string) =>
    status === "ready" &&
    grants.some(
      (g) => g.workspaceId === workspace && g.capability === cap && !g.revoked,
    );
  useEffect(() => {
    if (!workspace) {
      const g = grants.find(
        (g) => !g.revoked && g.workspaceId !== "universe-map",
      );
      if (g) setWorkspace(g.workspaceId);
    }
  }, [serial, workspace]);
  useEffect(() => {
    if (!scope || status !== "ready" || optionsScope === scope || !doc) return;
    let cached = null;
    try {
      cached = readDraftOptions(localStorage.getItem(scope));
    } catch {
      /* Storage can be unavailable. */
    }
    const remote = drafts.find((d) => d.id === doc.id);
    const parsed = remote
      ? JSON.parse(remote.documentJson)
      : storedConstructionSource(doc.id);
    setBoundaries(
      cached
        ? cached.boundary === "r001"
        : parsed?.boundaryKit?.revision === "r001",
    );
    setFamilyBoundaries(
      cached
        ? cached.boundary === "r004"
        : parsed?.boundaryKit?.revision === "r004",
    );
    setRoofs(cached ? cached.roofs : !!parsed?.roofKit);
    setBase({
      id: doc.id,
      revision: cached ? BigInt(cached.revision) : (remote?.revision ?? 0n),
    });
    pending.current = null;
    setOptionsScope(scope);
  }, [scope, status, serial, optionsScope]);
  useEffect(() => {
    if (!optionsReady || !doc || base?.id !== doc.id) return;
    try {
      localStorage.setItem(
        scope,
        JSON.stringify({
          boundary: familyBoundaries ? "r004" : boundaries ? "r001" : "none",
          roofs,
          revision: String(base.revision),
        }),
      );
    } catch {
      /* Server saves remain available without browser storage. */
    }
  }, [optionsReady, scope, doc?.id, base, boundaries, familyBoundaries, roofs]);
  async function act(kind: "save" | "publish") {
    if (!doc || !connection || !optionsReady) return;
    setBusy(true);
    setError("");
    try {
      const bound = {
        document: constructionForLayout(doc, storedConstructionSource(doc.id)),
      };
      if (boundaries)
        bound.document.boundaryKit = { ...CONSTRUCTION_BOUNDARY_PIN };
      if (familyBoundaries)
        bound.document.boundaryKit = { ...CONSTRUCTION_BOUNDARY_FAMILY_PIN };
      if (!boundaries && !familyBoundaries) delete bound.document.boundaryKit;
      if (roofs) bound.document.roofKit = { ...CONSTRUCTION_ROOF_PIN };
      else delete bound.document.roofKit;
      const raw = JSON.stringify(bound.document),
        revision = base?.id === doc.id ? base.revision : 0n;
      if (kind === "publish") compileConstruction(raw);
      const args =
        kind === "save"
          ? {
              workspaceId: workspace,
              draftId: doc.id,
              documentJson: raw,
              expectedRevision: revision,
            }
          : {
              workspaceId: workspace,
              draftId: doc.id,
              expectedRevision: revision,
            };
      const request = JSON.stringify([kind, args], (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
      if (!pending.current || pending.current.request !== request)
        pending.current = { request, operationId: uuid() };
      if (kind === "save") {
        await connection.reducers.saveConstructionDraft({
          ...(args as {
            workspaceId: string;
            draftId: string;
            documentJson: string;
            expectedRevision: bigint;
          }),
          operationId: pending.current.operationId,
        });
        setBase({ id: doc.id, revision: revision + 1n });
        setNotice(`Workspace draft saved · revision ${revision + 1n}`);
        try {
          rememberConstructionSource(raw);
        } catch {
          setNotice(
            "Workspace draft saved. Browser metadata storage is unavailable; reload the workspace draft before exporting on another browser.",
          );
        }
      } else {
        const remote = drafts.find((d) => d.id === doc.id);
        const local = compileConstruction(raw);
        if (
          !remote ||
          remote.revision !== revision ||
          remote.sha256 !== local.sha256
        )
          throw Error(
            "Save this exact draft to the workspace before publishing",
          );
        await connection.reducers.publishConstructionBlueprint({
          ...args,
          operationId: pending.current.operationId,
        });
        setNotice("Template revision published. Create a test ship below.");
      }
      pending.current = null;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function spawn(
    blueprintId: string,
    expectedSha256: string,
    sourceDeckId: string,
  ) {
    if (!connection) return;
    setBusy(true);
    setError("");
    try {
      const request = JSON.stringify([
        "spawn",
        blueprintId,
        expectedSha256,
        sourceDeckId,
      ]);
      if (!pending.current || pending.current.request !== request)
        pending.current = { request, operationId: uuid() };
      await connection.reducers.spawnConstructionBlueprint({
        blueprintId,
        expectedSha256,
        sourceDeckId,
        operationId: pending.current.operationId,
      });
      pending.current = null;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const load = (json: string, revision: bigint) => {
    try {
      const parsed = rememberConstructionSource(json);
      setBoundaries(parsed.boundaryKit?.revision === "r001");
      setFamilyBoundaries(parsed.boundaryKit?.revision === "r004");
      setRoofs(!!parsed.roofKit);
      const incoming = parsed.layout as LayoutDocument;
      if (doc)
        localStorage.setItem(
          "sidereal.authoring.recovery:" + user?.profile.sub + ":" + uuid(),
          JSON.stringify(doc),
        );
      onLoad(incoming);
      setBase({ id: incoming.id, revision });
      setOptionsScope(
        draftOptionsKey(user!.profile.sub, workspace, incoming.id),
      );
      pending.current = null;
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="construction-online">
      <p className="layout-note">Workspace · {status}</p>
      {!user ? (
        <button
          className="layout-wide"
          onClick={() => {
            if (location.origin !== import.meta.env.VITE_AUTH_ORIGIN) {
              location.href = import.meta.env.VITE_AUTH_ORIGIN + "/shipyard";
              return;
            }
            void authoringAuth()
              .signinRedirect()
              .catch((e) => setError(String(e)));
          }}
        >
          Sign in to Shipyard
        </button>
      ) : (
        <>
          <p className="layout-note">
            {user.profile.preferred_username ??
              user.profile.name ??
              "Signed-in account"}
          </p>
          <button
            className="layout-wide"
            onClick={() =>
              void authoringAuth()
                .signoutRedirect()
                .catch((e) => setError(String(e)))
            }
          >
            Sign out
          </button>
        </>
      )}
      {user && (
        <>
          <label className="layout-note">
            Workspace
            <select
              aria-label="Construction workspace"
              value={workspace}
              onChange={(e) => {
                setWorkspace(e.target.value);
                setBase(null);
              }}
            >
              <option value="">Select a workspace</option>
              {[
                ...new Set(
                  grants
                    .filter(
                      (g) => !g.revoked && g.workspaceId !== "universe-map",
                    )
                    .map((g) => g.workspaceId),
                ),
              ].map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="layout-note">
            <input
              type="checkbox"
              checked={boundaries}
              disabled={busy || !optionsReady}
              onChange={(e) => {
                setBoundaries(e.target.checked);
                if (e.target.checked) setFamilyBoundaries(false);
              }}
            />{" "}
            Straight walls and hinged doors
          </label>
          <label className="layout-note">
            <input
              type="checkbox"
              checked={familyBoundaries}
              disabled={busy || !optionsReady}
              onChange={(e) => {
                setFamilyBoundaries(e.target.checked);
                if (e.target.checked) setBoundaries(false);
              }}
            />{" "}
            Shaped-room walls
          </label>
          <label className="layout-note">
            <input
              type="checkbox"
              checked={roofs}
              disabled={busy || !optionsReady}
              onChange={(e) => setRoofs(e.target.checked)}
            />{" "}
            Matching roofs
          </label>
          <button
            className="layout-wide"
            disabled={busy || !doc || !optionsReady || !allowed("draft.write")}
            onClick={() => void act("save")}
          >
            Save workspace draft
          </button>
          <button
            className="layout-wide"
            disabled={
              busy ||
              !doc ||
              !optionsReady ||
              !allowed("blueprint.publish") ||
              !allowed("draft.read")
            }
            onClick={() => void act("publish")}
          >
            Publish template revision
          </button>
          {!grants.some((g) => !g.revoked) && (
            <p className="layout-note">
              An administrator must grant access to a workspace. Ship ownership
              does not grant authoring rights.
            </p>
          )}
          <h3>Saved workspace drafts</h3>
          {drafts.length === 0 && (
            <p className="layout-note">
              No workspace drafts yet. Save your current design above.
            </p>
          )}
          {drafts.map((d) => (
            <button
              className="layout-wide"
              key={d.id}
              disabled={busy}
              onClick={() => load(d.documentJson, d.revision)}
            >
              Load {JSON.parse(d.documentJson).layout.name} · r
              {String(d.revision)}
            </button>
          ))}
          <h3>Published templates</h3>
          {blueprints.map((b) => (
            <div key={b.id}>
              <p className="layout-note">
                Published {JSON.parse(b.canonical).layout.name} · revision{" "}
                {String(b.sourceRevision)} · geometry validated.
              </p>
              <button
                className="layout-wide"
                disabled={busy || !allowed("instance.spawn")}
                onClick={() =>
                  void spawn(
                    b.id,
                    b.sha256,
                    JSON.parse(b.canonical).layout.playableDeckId,
                  )
                }
              >
                Create test ship
              </button>
            </div>
          ))}
          {connection &&
            [...connection.db.ownConstructionInstances.iter()].map((i) => (
              <p className="layout-note" key={i.id}>
                Test ship: {i.name}. Open the game with this account, choose
                Test ships, then select this design. Your normal ship and
                inventory are preserved. Flight, pressure and traversal are
                available only for qualified designs.
              </p>
            ))}
        </>
      )}
      {notice && (
        <p role="status" className="layout-note">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="layout-note">
          {error}
        </p>
      )}
    </div>
  );
}
