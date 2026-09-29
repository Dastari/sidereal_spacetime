import React, { useState } from "react";
import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";

/** System menu Account tab summary: status line and whether a transfer flow applies. */
export function accountSummary(
  connection: DbConnection | null,
  characterId: string | undefined,
  oidc: boolean,
) {
  const links = connection ? [...connection.db.ownIdentityLinks.iter()] : [];
  return {
    transfer:
      (oidc && !characterId) || (!oidc && !!characterId) || links.length > 0,
    note: oidc
      ? characterId
        ? "Your character is saved to this Dastari account."
        : "Moving a development character here? Open Character transfer for this account code."
      : characterId
        ? "This character lives on a development identity in this browser. Character transfer links it to a Dastari account."
        : "Development identity in this browser. It is separate from a Dastari account.",
  };
}

/** Character transfer / identity link dialog, opened from the system menu Account tab. */
export function AccountPanel({
  connection,
  characterId,
  name,
  oidc,
  open,
  onClose,
  onSignOut,
}: {
  connection: DbConnection | null;
  characterId?: string;
  name: string;
  oidc: boolean;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [target, setTarget] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!open) return null;
  const links = connection ? [...connection.db.ownIdentityLinks.iter()] : [];
  const identity = connection?.identity?.toHexString();
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-panel" aria-label="Account">
      <h2>{name}</h2>
      <button onClick={onClose}>Close</button>
      <button onClick={onSignOut}>Sign out</button>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {oidc && !characterId && (
        <>
          <h3>Bring your existing character</h3>
          <p>
            Keep this account open. In the browser with your development
            character, open Menu › Account › Character transfer and paste this
            account code. Then accept the request here.
          </p>
          <code>{identity ?? "Connecting…"}</code>
          <p>
            To start fresh, close this panel and create a character instead. An
            account with a character cannot receive a transfer.
          </p>
        </>
      )}
      {!oidc && characterId && (
        <>
          <h3>Link to your Dastari account</h3>
          <p>
            Sign in on the secure game address in another window, open Menu ›
            Account › Character transfer and copy its account code. This
            transfers your existing character, inventory and appearance after
            you accept there.
          </p>
          <a
            href={import.meta.env.VITE_AUTH_ORIGIN}
            target="_blank"
            rel="noreferrer"
          >
            Open secure sign-in
          </a>
          <label>
            Destination account code
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            disabled={busy || !/^(0x)?[0-9a-f]{64}$/i.test(target.trim())}
            onClick={() =>
              void perform(async () => {
                if (!connection) throw new Error("Reconnect first.");
                await connection.reducers.requestIdentityLink({
                  targetIdentity: target.trim().replace(/^0x/i, ""),
                  expectedCharacterId: characterId,
                  operationId: createOperationId(),
                });
              })
            }
          >
            Request character transfer
          </button>
        </>
      )}
      {links.map((link) => (
        <div key={link.id}>
          <p>
            {link.characterName}: {link.status}
          </p>
          {link.side === "target" &&
            link.status === "pending" &&
            !characterId && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (!connection) throw new Error("Reconnect first.");
                    await connection.reducers.acceptIdentityLink({
                      requestId: link.id,
                      operationId: createOperationId(),
                    });
                  })
                }
              >
                Accept {link.characterName}
              </button>
            )}
        </div>
      ))}
      {oidc && characterId && (
        <p>Your character is saved to this Dastari account.</p>
      )}
    </section>
  );
}
