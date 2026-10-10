/** Actual entry kit with clearly illustrative state; no auth, SDK or world changes. */
import {
  createCanvasEntryUI,
  type EntryState,
} from "@sidereal/canvas-ui/entry";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
const canvas = document.createElement("canvas");
canvas.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block";
canvas.tabIndex = 0;
document.body.style.margin = "0";
document.body.appendChild(canvas);
let state: EntryState = {
  kind: "sign-in",
  ready: true,
  pending: false,
  error: "",
  development: false,
};
const actions: string[] = [];
const mount = () =>
  createCanvasEntryUI(
    canvas,
    () => state,
    {
      signIn: () => {
        actions.push("sign-in");
      },
      signOut: () => actions.push("sign-out"),
      development: () => actions.push("development"),
      enter: () => actions.push("enter-world"),
      create: (name) => actions.push(`create:${name}`),
      retry: () => actions.push("retry"),
      retryPreview: () => actions.push("retry-preview"),
    },
    () => ({ failed: true }),
  );
let ui = mount();
Object.assign(window, {
  __entryFixture: {
    snapshot: () => ({
      ui: ui.snapshot(),
      actions: [...actions],
      domWidgets: document.querySelectorAll(
        "button,input,select,form,[role=dialog]",
      ).length,
    }),
    set: (next: EntryState) => {
      state = next;
      ui.dispose();
      ui = mount();
    },
    canvas,
  },
});
