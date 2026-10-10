import test from "node:test";
import assert from "node:assert/strict";
import { canvasUiViolations } from "./check_canvas_ui.mjs";
test("rejects native JSX widgets nested in a component", () =>
  assert.ok(
    canvasUiViolations(
      "export function X(){return <aside><button>Open</button></aside>}",
    ).some((e) => e.includes("<button>")),
  ));
test("rejects imperative native buttons and a React game kit", () => {
  assert.ok(
    canvasUiViolations('const b=document.createElement("button");').length,
  );
  assert.ok(
    canvasUiViolations('import {GameButton} from "@sidereal/ui/game";').length,
  );
});
test("allows only canvas mounts and headless client lifecycle components", () =>
  assert.deepEqual(
    canvasUiViolations(
      'const canvas=document.createElement("canvas");const root=document.createElement("div");root.hidden=true;export function Client(){return <HeadlessPointerLifecycle/>}',
    ),
    [],
  ));
test("canvas kit cannot acquire a React dependency", () =>
  assert.ok(
    canvasUiViolations('import {useState} from "react";', "kit.ts", true)
      .length,
  ));
test("rendering and network adapters remain valid", () =>
  assert.deepEqual(
    canvasUiViolations(
      'import {Engine} from "@babylonjs/core/Engines/engine";import {tables} from "@sidereal/net";',
    ),
    [],
  ));

test("accepts ordinary zero-argument callbacks", () =>
  assert.deepEqual(canvasUiViolations("invalidate();close();"), []));
