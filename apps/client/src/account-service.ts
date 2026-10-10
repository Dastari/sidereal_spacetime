import type { DbConnection } from "@sidereal/net";
import {
  createServiceWindow,
  type ServiceRow,
} from "@sidereal/canvas-ui/service-window";
import { createOperationId } from "./operation-id";
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
export function openAccountService(
  connection: DbConnection,
  options: {
    name: string;
    oidc: boolean;
    close: () => void;
    signOut: () => void;
    invalidate: () => void;
  },
) {
  let target = "",
    pending = false,
    error = "",
    disposed = false;
  const perform = async (action: () => Promise<void>) => {
    if (disposed || pending) return;
    pending = true;
    error = "";
    options.invalidate();
    try {
      await action();
    } catch (e) {
      if (!disposed) error = String(e);
    } finally {
      pending = false;
      if (!disposed) options.invalidate();
    }
  };
  const changeTarget = (value: string) => {
    target = value;
    options.invalidate();
  };
  const display = createServiceWindow(() => {
    const actor = [...connection.db.ownCharacters.iter()][0],
      links = [...connection.db.ownIdentityLinks.iter()];
    const rows: ServiceRow[] = [
      {
        kind: "button",
        id: "account-signout",
        text: "Sign out",
        run: options.signOut,
      },
    ];
    if (error) rows.push({ kind: "text", text: error, tone: "error" });
    if (options.oidc && !actor) {
      rows.push(
        { kind: "text", text: "Bring your existing character", tone: "normal" },
        {
          kind: "text",
          text: "Keep this account open. In the browser with your development character, open Account and paste this code. Then accept the request here.",
        },
        {
          kind: "text",
          text: connection.identity?.toHexString() ?? "Connecting…",
        },
        {
          kind: "button",
          id: "account-copy",
          text: "Copy account code",
          run: () =>
            void perform(async () => {
              const code = connection.identity?.toHexString();
              if (!code || !navigator.clipboard)
                throw Error(
                  "Open the secure game address to copy your account code.",
                );
              await navigator.clipboard.writeText(code);
            }),
        },
        {
          kind: "text",
          text: "To start fresh, close this panel and create a character. An account with a character cannot receive a transfer.",
        },
      );
    }
    if (!options.oidc && actor) {
      rows.push(
        { kind: "text", text: "Link to your Dastari account", tone: "normal" },
        {
          kind: "text",
          text: "Sign in on the secure game address in another window and copy its account code. Your character, inventory and appearance transfer after acceptance.",
        },
        {
          kind: "button",
          id: "account-secure",
          text: "Open secure sign-in",
          run: () =>
            window.open(
              import.meta.env.VITE_AUTH_ORIGIN,
              "_blank",
              "noopener,noreferrer",
            ),
        },
        {
          kind: "input",
          id: "account-target",
          label: "Destination account code",
          value: target,
          change: changeTarget,
          max: 66,
        },
        {
          kind: "button",
          id: "account-request",
          text: "Request character transfer",
          disabled: pending || !/^(0x)?[0-9a-f]{64}$/i.test(target.trim()),
          pending,
          run: () =>
            void perform(async () => {
              const current = [...connection.db.ownCharacters.iter()][0];
              if (!connection.isActive || !current)
                throw Error("Reconnect first.");
              await connection.reducers.requestIdentityLink({
                targetIdentity: target.trim().replace(/^0x/i, ""),
                expectedCharacterId: current.id,
                operationId: createOperationId(),
              });
            }),
        },
      );
    }
    for (const link of links) {
      rows.push({
        kind: "text",
        text: `${link.characterName}: ${link.status}`,
      });
      if (link.side === "target" && link.status === "pending" && !actor)
        rows.push({
          kind: "button",
          id: `account-accept-${link.id}`,
          text: `Accept ${link.characterName}`,
          disabled: pending,
          run: () =>
            void perform(async () => {
              if (!connection.isActive) throw Error("Reconnect first.");
              await connection.reducers.acceptIdentityLink({
                requestId: link.id,
                operationId: createOperationId(),
              });
            }),
        });
    }
    if (options.oidc && actor)
      rows.push({
        kind: "text",
        text: "Your character is saved to this Dastari account.",
      });
    return { title: options.name, rows, pending };
  }, options.close);
  return {
    display,
    dispose() {
      disposed = true;
    },
  };
}
