// Existing debt is pinned, never silently ignored for new or changed code.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ESLint } from "eslint";
import * as prettier from "prettier";

const mode = process.argv[2];
const record = process.argv.includes("--record-baseline");
if (!["lint", "format"].includes(mode))
  throw new Error("Expected lint or format");
const baselinePath = `scripts/quality-${mode}-baseline.json`;
const baseline = record
  ? {}
  : JSON.parse(await fs.readFile(baselinePath, "utf8"));
const current = {};
const failures = [];

if (mode === "lint") {
  const results = await new ESLint().lintFiles([
    "apps/**/*.{ts,tsx}",
    "packages/**/*.{ts,tsx}",
  ]);
  for (const result of results) {
    for (const issue of result.messages) {
      const file = path
        .relative(process.cwd(), result.filePath)
        .replaceAll(path.sep, "/");
      const key = `${file}:${issue.ruleId}:${issue.message}`;
      current[key] = (current[key] ?? 0) + 1;
      if (!record && current[key] > (baseline[key] ?? 0))
        failures.push(`${file}:${issue.line} ${issue.message}`);
    }
  }
} else {
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (["dist", "public", "node_modules", "generated"].includes(entry.name))
        continue;
      if (entry.isDirectory()) await visit(file);
      else if (
        /\.(?:ts|tsx|js|mjs|css|json)$/.test(file) &&
        !file.includes("quality-format-baseline")
      ) {
        const info = await prettier.getFileInfo(file, {
          ignorePath: ".prettierignore",
        });
        if (info.ignored || !info.inferredParser) continue;
        const content = await fs.readFile(file, "utf8");
        if (
          !(await prettier.check(content, {
            ...(await prettier.resolveConfig(file)),
            filepath: file,
          }))
        ) {
          current[file] = crypto
            .createHash("sha256")
            .update(content)
            .digest("hex");
          if (!record && baseline[file] !== current[file]) failures.push(file);
        }
      }
    }
  }
  for (const dir of ["apps", "packages", "scripts"]) await visit(dir);
}

if (record) {
  await fs.writeFile(baselinePath, JSON.stringify(current, null, 2) + "\n");
  console.log(
    `Recorded ${Object.keys(current).length} existing ${mode} debt entries. Review before committing.`,
  );
} else {
  console.log(
    `${mode}: ${Object.keys(current).length} existing debt entries; ${failures.length} new/changed violations.`,
  );
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}
