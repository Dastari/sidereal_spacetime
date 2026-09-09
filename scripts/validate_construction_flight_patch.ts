import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const overrides: Record<string, string> = JSON.parse(
  readFileSync(".runtime/construction-flight-shared-preview.json", "utf8"),
);
const source = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(source.config, ts.sys, ".");
const host = ts.createCompilerHost(config.options),
  read = host.readFile.bind(host);
host.readFile = (path) => overrides[resolve(path)] ?? read(path);
const program = ts.createProgram(config.fileNames, config.options, host);
const errors = ts.getPreEmitDiagnostics(program);
if (errors.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    "Construction flight registration typechecks in memory; shared runtime files untouched.",
  );
