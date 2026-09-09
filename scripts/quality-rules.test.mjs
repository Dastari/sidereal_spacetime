import { test } from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";

test("package boundary lint covers static, dynamic and type imports", async () => {
  const eslint = new ESLint();
  for (const source of [
    'import {x} from "../../sim/src/x";',
    'export {x} from "../../sim/src/x";',
    'const x = import("../../sim/src/x");',
    'type X = typeof import("../../sim/src/x");',
    'const x = require("../../sim/src/x");',
  ]) {
    const [result] = await eslint.lintText(source, {
      filePath: "packages/render/src/probe.ts",
    });
    assert.equal(result.errorCount, 1, source);
    assert.equal(
      result.messages[0].ruleId,
      "sidereal/no-relative-cross-package",
    );
  }
});

test("package exports and same-package relatives remain valid", async () => {
  const [result] = await new ESLint().lintText(
    'import {x} from "@sidereal/sim"; import {y} from "./y";',
    { filePath: "packages/render/src/probe.ts" },
  );
  assert.equal(result.errorCount, 0);
});
