import ts from "typescript";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
const overrides: Record<string, string> = JSON.parse(
  readFileSync(".runtime/airlock-shared-preview.json", "utf8"),
);
const c = ts.readConfigFile("tsconfig.json", ts.sys.readFile),
  config = ts.parseJsonConfigFileContent(c.config, ts.sys, ".");
const host = ts.createCompilerHost(config.options),
  read = host.readFile.bind(host),
  exists = host.fileExists.bind(host);
const canonical = (name: string) => {
  try {
    return realpathSync(resolve(name));
  } catch {
    return resolve(name);
  }
};
host.readFile = (name) => overrides[canonical(name)] ?? read(name);
host.fileExists = (name) => canonical(name) in overrides || exists(name);
const program = ts.createProgram(config.fileNames, config.options, host),
  diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    "Airlock shared registration typechecks in memory; source remains untouched.",
  );
