/** Enforce the owner’s canvas-only player UI boundary; nonvisual lifecycle code is allowed. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
export function canvasUiViolations(text, name = "source.tsx", kit = false) {
  const errors = [];
  const source = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier.text;
      if (
        /^@sidereal\/ui\/(game|gallery|.*\.css)$/.test(spec) ||
        /^(@mui\/|@radix-ui\/|antd$|react-bootstrap$)/.test(spec) ||
        (kit && /^(react|react-dom)(\/|$)/.test(spec))
      )
        errors.push("Game controls must use the canvas kit: " + spec);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^[a-z]/.test(tag))
        errors.push("DOM player UI is forbidden: <" + tag + ">");
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const call = node.expression.getText(source),
        tag = node.arguments[0].text;
      if (
        call === "React.createElement" ||
        call === "createElement" ||
        (/\.createElement$/.test(call) && !["canvas", "div"].includes(tag))
      )
        errors.push("DOM player UI is forbidden: " + tag);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}
export function checkCanvasUi(root = process.cwd()) {
  const errors = [];
  let count = 0;
  function scan(directory, kit) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) scan(path, kit);
      else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !entry.name.includes(".test.")
      ) {
        count++;
        for (const error of canvasUiViolations(
          readFileSync(path, "utf8"),
          entry.name,
          kit,
        ))
          errors.push(relative(root, path) + ": " + error);
      } else if (!kit && entry.name.endsWith(".css"))
        errors.push(
          relative(root, path) + ": Game skins belong to the canvas kit.",
        );
    }
  }
  scan(join(root, "apps/client/src"), false);
  scan(join(root, "packages/canvas-ui/src"), true);
  if (errors.length) throw new Error(errors.join("\n"));
  return count;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Canvas UI boundary: ${checkCanvasUi()} source files checked.`);
}
