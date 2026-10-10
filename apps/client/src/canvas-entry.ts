import React from "react";
import { createRoot } from "react-dom/client";
import type { User } from "oidc-client-ts";
import App, { type GamePresentation } from "./App";
import { authManager, authOrigin, gameAuthentication } from "./auth";
import { restoreGameSession, usableGameSession } from "./auth-session";
import {
  createCanvasEntryUI,
  type EntryState,
  type EntryPortrait,
} from "@sidereal/canvas-ui/entry";
import type { createCharacterPreview } from "@sidereal/render/character-preview";
/** The only React root owns nonvisual world/SDK lifecycles. It renders no player controls. */
export function startCanvasClient(parent: HTMLElement) {
  const game = document.createElement("canvas");
  game.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none";
  game.tabIndex = 0;
  game.inert = true;
  parent.appendChild(game);
  const entry = document.createElement("canvas");
  entry.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;display:block;z-index:9000;touch-action:none";
  entry.tabIndex = 0;
  parent.appendChild(entry);
  const lifecycleHost = document.createElement("div");
  lifecycleHost.hidden = true;
  parent.appendChild(lifecycleHost);
  const root = createRoot(lifecycleHost);
  let user: User | null = null,
    ready = false,
    disposed = false,
    signInPending = false;
  let development =
    import.meta.env.DEV &&
    location.protocol === "http:" &&
    !!localStorage.getItem("sidereal.lab.token") &&
    !new URLSearchParams(location.search).has("login");
  let error = "",
    running = false;
  let state: EntryState = {
    kind: "sign-in",
    ready,
    pending: false,
    error,
    development: import.meta.env.DEV,
  };
  let presentation: GamePresentation | undefined;
  let preview: ReturnType<typeof createCharacterPreview> | undefined,
    previewKey = "",
    previewGeneration = 0;
  let previewLoading = false,
    previewFailed = false;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  const disposePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = undefined;
    previewFailed = false;
    previewGeneration++;
    preview?.dispose();
    preview = undefined;
    previewLoading = false;
    previewKey = "";
  };
  const updatePreview = () => {
    if (state.kind !== "character" || !state.character) {
      if (preview || previewLoading) disposePreview();
      return;
    }
    const character = state.character;
    if (character.id !== previewKey) {
      disposePreview();
      previewKey = character.id;
      previewLoading = true;
      const generation = previewGeneration;
      previewTimer = setTimeout(() => {
        if (!disposed && generation === previewGeneration) {
          previewGeneration++;
          previewFailed = true;
          preview?.dispose();
          preview = undefined;
          previewLoading = false;
          ui.invalidate();
        }
      }, 30_000);
      import("@sidereal/render/character-preview")
        .then((module) => {
          if (disposed || generation !== previewGeneration) return;
          preview = module.createCharacterPreview({
            onInvalidate: () => ui.invalidate(),
          });
          preview.setAppearance(
            character.appearance.outfit ?? "engineer",
            character.appearance,
          );
          previewLoading = false;
          ui.invalidate();
          return preview.ready.then(() => {
            if (!disposed && generation === previewGeneration) ui.invalidate();
          });
        })
        .catch(() => {
          if (!disposed && generation === previewGeneration) {
            previewLoading = false;
            previewFailed = true;
            ui.invalidate();
          }
        });
    } else
      preview?.setAppearance(
        character.appearance.outfit ?? "engineer",
        character.appearance,
      );
  };
  const update = () => {
    if (disposed) return;
    const authenticated = ready && (development || !!user);
    if (!authenticated) {
      state = {
        kind: "sign-in",
        ready,
        pending: signInPending,
        error,
        development: import.meta.env.DEV,
      };
      entry.hidden = false;
      entry.inert = false;
      game.inert = true;
      disposePreview();
    } else if (presentation) {
      state = presentation.state;
      entry.hidden = state.kind === "world";
      entry.inert = entry.hidden;
      game.inert = !entry.hidden;
      updatePreview();
    } else {
      state = {
        kind: "loading",
        stage: "connecting",
        shipName: "",
        error: "",
        awaitingShip: false,
      };
      entry.hidden = false;
      entry.inert = false;
      game.inert = true;
    }
    ui.invalidate();
  };
  const invalidateEntry = () => ui.invalidate();
  const receive = (next: GamePresentation) => {
    if (disposed || !running) return;
    presentation = next;
    update();
  };
  const start = () => {
    if (disposed) return;
    if (ready && (development || user)) {
      running = true;
      root.render(
        React.createElement(App, {
          canvasElement: game,
          onPresentation: receive,
          onCanvasInvalidate: invalidateEntry,
          auth: user ? gameAuthentication(user) : undefined,
          accountName:
            user?.profile.preferred_username ?? "Development character",
          onSignOut: () => void signOut(),
        }),
      );
    } else if (running) {
      running = false;
      presentation = undefined;
      root.render(null);
    }
    update();
  };
  const signIn = async () => {
    if (signInPending || !ready) return;
    signInPending = true;
    error = "";
    update();
    try {
      if (location.origin !== authOrigin) {
        location.assign(authOrigin + location.search);
        return;
      }
      await authManager().signinRedirect({
        state: { returnQuery: location.search },
      });
    } catch {
      if (!disposed) {
        signInPending = false;
        error = "Unable to reach sign-in. Check your connection and try again.";
        update();
      }
    }
  };
  const signOut = async () => {
    if (disposed) return;
    if (development) {
      development = false;
      start();
      return;
    }
    try {
      await authManager().signoutRedirect();
    } catch {
      await authManager().removeUser();
      if (disposed) return;
      user = null;
      error = "Signed out here. The account provider could not be reached.";
      start();
    }
  };
  const ui = createCanvasEntryUI(
    entry,
    () => state,
    {
      account: () => presentation?.account(),
      readService: () => presentation?.service(),
      signIn: () => void signIn(),
      signOut: () => void signOut(),
      development: () => {
        development = true;
        start();
      },
      enter: () => presentation?.enter(),
      create: (name) => void presentation?.create(name),
      retry: () => location.reload(),
      retryPreview: () => {
        disposePreview();
        updatePreview();
        ui.invalidate();
      },
    },
    () => {
      if (preview?.presentationStatus === "ready") {
        clearTimeout(previewTimer);
        previewTimer = undefined;
      }
      return {
        view: preview as EntryPortrait | undefined,
        failed: previewFailed,
      };
    },
  );
  const manager = location.origin === authOrigin ? authManager() : undefined;
  const loaded = (next: User) => {
    if (disposed) return;
    user = usableGameSession(next) ? next : null;
    error = user ? "" : "Your session expired. Sign in to continue.";
    signInPending = false;
    start();
  };
  const expired = () => {
    if (disposed) return;
    user = null;
    error = "Your session expired. Sign in to continue.";
    start();
  };
  manager?.events.addUserLoaded(loaded);
  manager?.events.addUserUnloaded(expired);
  manager?.events.addAccessTokenExpired(expired);
  manager?.events.addSilentRenewError(expired);
  void (async () => {
    try {
      if (manager) {
        const next = await restoreGameSession(
          location.pathname,
          manager,
          (path) => history.replaceState({}, "", path),
        );
        if (!disposed && usableGameSession(next)) user = next;
      }
    } catch {
      if (!disposed) error = "Sign-in could not complete. Please try again.";
    } finally {
      if (!disposed) {
        ready = true;
        start();
      }
    }
  })();
  return {
    snapshot: () => ui.snapshot(),
    dispose() {
      if (disposed) return;
      disposed = true;
      disposePreview();
      root.unmount();
      ui.dispose();
      manager?.events.removeUserLoaded(loaded);
      manager?.events.removeUserUnloaded(expired);
      manager?.events.removeAccessTokenExpired(expired);
      manager?.events.removeSilentRenewError(expired);
      game.remove();
      entry.remove();
      lifecycleHost.remove();
    },
  };
}
