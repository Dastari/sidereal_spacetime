import path from "node:path";
import tseslint from "typescript-eslint";

function owner(filename) {
  const relative = path.relative(process.cwd(), filename).split(path.sep);
  return ["apps", "packages"].includes(relative[0]) && relative.length > 2
    ? relative.slice(0, 2).join("/")
    : null;
}

export default [
  { ignores: ["**/dist/**", "**/public/**", "packages/net/src/generated/**"] },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: {
      sidereal: {
        rules: {
          "no-relative-cross-package": {
            meta: {
              type: "problem",
              schema: [],
              messages: {
                boundary:
                  "Use a declared package export instead of '{{specifier}}'.",
              },
            },
            create(context) {
              const sourceOwner = owner(context.filename);
              function check(node) {
                const specifier = node?.value;
                if (typeof specifier !== "string" || !specifier.startsWith("."))
                  return;
                const targetOwner = owner(
                  path.resolve(path.dirname(context.filename), specifier),
                );
                if (sourceOwner && targetOwner && sourceOwner !== targetOwner) {
                  context.report({
                    node,
                    messageId: "boundary",
                    data: { specifier },
                  });
                }
              }
              return {
                ImportDeclaration: (node) => check(node.source),
                ExportNamedDeclaration: (node) => check(node.source),
                ExportAllDeclaration: (node) => check(node.source),
                ImportExpression: (node) => check(node.source),
                TSImportType: (node) =>
                  check(node.argument?.literal ?? node.argument),
                CallExpression: (node) => {
                  if (node.callee.name === "require") check(node.arguments[0]);
                },
              };
            },
          },
        },
      },
    },
    rules: { "sidereal/no-relative-cross-package": "error" },
  },
];
