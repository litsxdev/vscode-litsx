import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { beforeEach, describe, it } from "vitest";
import {
  computeLitsxCompletions,
  computeLitsxHover,
  computeLitsxProjectCompletions,
  computeLitsxProjectDiagnostics,
  computeLitsxProjectHover,
  configureEditorSupport,
  createWorkspaceTypeScriptResolver,
  getParserPlugins,
} from "../src/editor-support.js";

const require = createRequire(import.meta.url);

function createCompletionKinds() {
  return {
    CompletionItemKind: {
      Keyword: 14,
      Variable: 6,
      Property: 10,
      Function: 3,
      Class: 7,
      Interface: 8,
      Module: 9,
      Text: 0,
      Event: 23,
    },
  };
}

describe("vscode-litsx editor support", () => {
  beforeEach(() => {
    configureEditorSupport({
      resolveTypeScript: null,
      logger: null,
      traceEnabled: null,
    });
  });

  it("returns null hover and empty completions when the cursor is outside LitSX syntax", async () => {
    const sourceText = "const value = count + 1;";

    const hover = await computeLitsxHover(sourceText, "litsx", sourceText.indexOf("count"));
    const completions = await computeLitsxCompletions(
      sourceText,
      "litsx",
      sourceText.indexOf("count") + 2,
      {
        CompletionItemKind: {
          Event: 23,
          Property: 10,
        },
      },
    );

    assert.strictEqual(hover, null);
    assert.deepStrictEqual(completions, []);
    assert.deepStrictEqual(getParserPlugins("litsx"), ["typescript"]);
    assert.deepStrictEqual(getParserPlugins("litsx-jsx"), []);
  });

  it("returns property hover and property completions for dot bindings", async () => {
    const sourceText = "const view = <input .val />;";
    const hover = await computeLitsxHover(sourceText, "litsx", sourceText.indexOf(".val") + 1);
    const completions = await computeLitsxCompletions(
      sourceText,
      "litsx",
      sourceText.indexOf(".val") + 4,
      {
        CompletionItemKind: {
          Event: 23,
          Property: 10,
        },
      },
    );

    assert.match(hover.code, /\.val: property/);
    assert.match(hover.documentation, /property binding/);
    assert.ok(completions.some((entry) => entry.label === ".value" && entry.kind === 10));
    const valueCompletion = completions.find((entry) => entry.label === ".value");
    assert.strictEqual(valueCompletion.insertText, "value");
    assert.strictEqual(valueCompletion.filterText, "value");
  });

  it("supports standalone .litsx.jsx diagnostics, hover, and completions without a tsconfig", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-jsx-"));
    const filePath = path.join(tempDir, "component.litsx.jsx");
    const sourceText = [
      "const busy = true;",
      "const view = <button ?dis @cl />;",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx-jsx");
    const boolPosition = sourceText.indexOf("?dis") + 1;
    const hover = await computeLitsxProjectHover(filePath, sourceText, "litsx-jsx", boolPosition);
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx-jsx",
      sourceText.indexOf("?dis") + 4,
      createCompletionKinds(),
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91005));
    assert.match(hover.code, /\?dis|property/);
    assert.ok(completions.some((entry) => entry.label === "?disabled"));
  }, 15000);

  it("uses static hoist hover in project mode and keeps project-backed scope completions", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-hoist-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "class Card { static styles = `button { color: red; }`; }",
      "const view = <button>{count}</button>;",
      "cou",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, sourceText);

    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("styles"),
    );
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("cou") + 3,
      createCompletionKinds(),
    );

    assert.match(hover.code, /styles/);
    assert.ok(completions.some((entry) => entry.label === "count"));
  });

  it("surfaces public @litsx/core auto-import completions inside .litsx bodies", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-public-surface-"));
    const filePath = path.join(tempDir, "component.litsx");
    const litsxPackageDir = path.join(tempDir, "node_modules", "@litsx", "core");
    const installedLitsxPackageDir = path.resolve(require.resolve("@litsx/core"), "..", "..");
    const sourceText = [
      "export const Panel = () => {",
      "  useS",
      "  return <button />;",
      "};",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.mkdirSync(path.dirname(litsxPackageDir), { recursive: true });
    fs.symlinkSync(installedLitsxPackageDir, litsxPackageDir, "dir");
    fs.writeFileSync(filePath, sourceText);

    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("useS") + "useS".length,
      createCompletionKinds(),
    );

    assert.ok(completions.some((entry) => entry.label === "useState"));
    const useStateCompletion = completions.find((entry) => entry.label === "useState");
    assert.ok(useStateCompletion.additionalTextEdits?.some((edit) => (
      edit.newText.includes('import { useState } from "@litsx/core";')
    )));
  }, 15000);

  it("filters virtual TypeScript noise while preserving real project diagnostics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-filter-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { useState } from "@litsx/core";',
      "export const Component = () => {",
      "  const [count] = useState(0);",
      "  return <input .valuee={count} @clcik={() => count.toFixed()} />;",
      "};",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");
    const completionSourceText = sourceText.replace("@clcik", "@cl");
    const completionPosition = completionSourceText.indexOf("@cl") + 3;
    const completions = await computeLitsxProjectCompletions(
      filePath,
      completionSourceText,
      "litsx",
      completionPosition,
      createCompletionKinds(),
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91006));
    assert.ok(
      diagnostics.every((diagnostic) => !String(diagnostic.messageText).includes("__litsx_")),
    );
    assert.ok(completions.every((entry) => !entry.label.startsWith("__litsx_")));
  }, 15000);

  it("resolves extensionless LitSX-family imports transparently but rejects explicit wrong extensions", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-resolve-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { buttonLabel } from "./litsx-button.litsx";',
      'import { buttonCount } from "./button-count";',
      'import { wrongButtonLabel } from "./litsx-button.litsx.jsx";',
      "const summary = `${buttonLabel}:${buttonCount}`;",
      "const extra = wrongButtonLabel;",
      "const broken: number = summary;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
          noUnusedLocals: false,
        },
        include: ["component.litsx", "litsx-button.litsx", "button-count.tsx"],
      }),
    );
    fs.writeFileSync(
      path.join(tempDir, "litsx-button.litsx"),
      [
        'export const buttonLabel = "Primary";',
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(tempDir, "button-count.tsx"),
      [
        "export const buttonCount = 2;",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2322));
    assert.ok(
      diagnostics.some((diagnostic) => (
        diagnostic.code === 2307 &&
        String(diagnostic.messageText).includes("./litsx-button.litsx.jsx")
      )),
    );
  }, 15000);

  it("falls back to project type hover and scope completions when direct language-service data is missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-fallback-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "function FooFn() { return 1; }",
      "class FooClass {}",
      "interface FooInterface { value: number; }",
      "namespace FooModule { export const value = 1; }",
      "const FooValue = 1;",
      "const view = <button>{count}</button>;",
      "type Example = Foo",
      "Foo",
      "",
    ].join("\n");

    fs.writeFileSync(filePath, sourceText);

    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("FooFn") + 1,
    );
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.lastIndexOf("Foo") + 3,
      createCompletionKinds(),
    );
    const typeCompletions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("type Example = Foo") + "type Example = Foo".length,
      createCompletionKinds(),
    );

    assert.ok(hover);
    assert.match(hover.code, /FooFn|function/);
    assert.ok(completions.some((entry) => entry.label === "FooFn" && entry.kind === 3));
    assert.ok(completions.some((entry) => entry.label === "FooClass" && entry.kind === 7));
    assert.ok(completions.some((entry) => entry.label === "FooModule" && entry.kind === 9));
    assert.ok(completions.some((entry) => entry.label === "FooValue" && entry.kind === 6));
    assert.ok(typeCompletions.some((entry) => entry.label === "FooInterface" && entry.kind === 8));
  }, 15000);

  it("supports jsconfig-backed .litsx.jsx projects and non-virtualized project diagnostics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-jsconfig-"));
    const filePath = path.join(tempDir, "component.litsx.jsx");
    const sourceText = [
      "const answer = 42;",
      "const broken = answer();",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "jsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          checkJs: true,
        },
        include: ["component.litsx.jsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx-jsx");
    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx-jsx",
      sourceText.indexOf("answer") + 1,
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2349));
    assert.match(hover.code, /const answer: 42|const answer: number/);
  }, 15000);

  it("preserves nested TypeScript diagnostic message chains for non-virtualized project files", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-message-chain-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "function overload(value: string): void;",
      "function overload(value: number): void;",
      "function overload(value) {}",
      "overload(true);",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");
    const overloadDiagnostic = diagnostics.find((diagnostic) => diagnostic.code === 2769);

    assert.ok(overloadDiagnostic);
    assert.strictEqual(typeof overloadDiagnostic.messageText, "object");
    assert.strictEqual(overloadDiagnostic.messageText.messageText, "No overload matches this call.");
    assert.ok(overloadDiagnostic.messageText.next?.length);
  }, 15000);

  it("supports authored syntax in standard .tsx files through the extension-based project path", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-tsx-project-"));
    const filePath = path.join(tempDir, "component.tsx");
    const sourceText = [
      "const count = 1;",
      "const view = <input .valuee={count} @clcik={() => count.toFixed()} />;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["component.tsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "typescriptreact");

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91006));
  }, 15000);

  it("suppresses customElements.define false positives for imported .litsx story components", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-storybook-"));
    const storyFilePath = path.join(tempDir, "button.stories.litsx");
    const componentFilePath = path.join(tempDir, "button.litsx");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["*.litsx"],
      }),
    );
    const storyLitsxPackageDir = path.join(tempDir, "node_modules", "@litsx", "core");
    const installedStoryLitsxPackageDir = path.resolve(require.resolve("@litsx/core"), "..", "..");
    fs.mkdirSync(path.dirname(storyLitsxPackageDir), { recursive: true });
    fs.symlinkSync(installedStoryLitsxPackageDir, storyLitsxPackageDir, "dir");
    fs.writeFileSync(
      componentFilePath,
      [
        "export const LitsxButton = ({ label = '' } = {}) => {",
        "  return <button>{label}</button>;",
        "};",
        "",
      ].join("\n"),
    );
    const storySource = [
      'import { LitsxButton } from "./button.litsx";',
      "",
      'if (!customElements.get("litsx-button")) {',
      '  customElements.define("litsx-button", LitsxButton);',
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(storyFilePath, storySource);

    const diagnostics = await computeLitsxProjectDiagnostics(storyFilePath, storySource, "litsx");

    assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 2345));
  }, 15000);

  it("prefers workspace TypeScript when a workspace module is available", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-workspace-ts-"));
    const filePath = path.join(tempDir, "component.litsx");
    const workspaceTsDir = path.join(tempDir, "node_modules", "typescript", "lib");
    const workspaceTsFile = path.join(workspaceTsDir, "typescript.js");

    fs.mkdirSync(workspaceTsDir, { recursive: true });
    fs.writeFileSync(workspaceTsFile, "module.exports = { version: 'workspace-ts-test' };");
    fs.writeFileSync(filePath, "const view = <button />;\n");

    const resolver = createWorkspaceTypeScriptResolver({
      Uri: {
        file(fsPath) {
          return { fsPath };
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: tempDir,
            },
          },
        ],
        getConfiguration() {
          return {
            get(_key, fallbackValue) {
              return fallbackValue;
            },
          };
        },
      },
    });

    const resolution = await resolver(filePath);

    assert.strictEqual(resolution.source, "workspace");
    assert.strictEqual(resolution.typescript.version, "workspace-ts-test");
    assert.strictEqual(resolution.bundledLibDir, workspaceTsDir);
  });

  it("falls back to VS Code bundled TypeScript when workspace TypeScript is unavailable", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-builtin-ts-"));
    const filePath = path.join(tempDir, "component.litsx");
    const builtInExtensionPath = path.join(tempDir, "extensions", "typescript-language-features");
    const builtInTsDir = path.join(tempDir, "extensions", "node_modules", "typescript", "lib");
    const builtInTsFile = path.join(builtInTsDir, "typescript.js");

    fs.mkdirSync(builtInExtensionPath, { recursive: true });
    fs.mkdirSync(builtInTsDir, { recursive: true });
    fs.writeFileSync(builtInTsFile, "module.exports = { version: 'builtin-ts-test' };");
    fs.writeFileSync(filePath, "const view = <button />;\n");

    const resolver = createWorkspaceTypeScriptResolver({
      Uri: {
        file(fsPath) {
          return { fsPath };
        },
      },
      extensions: {
        getExtension(id) {
          return id === "vscode.typescript-language-features"
            ? { extensionPath: builtInExtensionPath }
            : null;
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: tempDir,
            },
          },
        ],
        getConfiguration() {
          return {
            get(_key, fallbackValue) {
              return fallbackValue;
            },
          };
        },
      },
    });

    const resolution = await resolver(filePath);

    assert.strictEqual(resolution.source, "vscode-builtin");
    assert.strictEqual(resolution.typescript.version, "builtin-ts-test");
    assert.strictEqual(resolution.bundledLibDir, builtInTsDir);
  });

  it("prefers workspace @litsx/typescript editor-session when available", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-workspace-editor-session-"));
    const filePath = path.join(tempDir, "component.litsx");
    const workspacePackageDir = path.join(tempDir, "node_modules", "@litsx", "typescript");
    const workspaceEditorSessionPath = path.join(workspacePackageDir, "editor-session.cjs");
    const sourceText = "const view = <button />;\n";

    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspacePackageDir, "package.json"),
      JSON.stringify({
        name: "@litsx/typescript",
        exports: {
          "./editor-session": "./editor-session.cjs",
        },
      }),
    );
    fs.writeFileSync(
      workspaceEditorSessionPath,
      [
        "exports.createLitsxEditorSession = function createLitsxEditorSession() {",
        "  return {",
        "    getDiagnostics() { return []; },",
        "    getHover() {",
        "      return {",
        "        start: 0,",
        "        length: 4,",
        "        code: 'workspace-session',",
        "        documentation: 'workspace @litsx/typescript',",
        "      };",
        "    },",
        "    getCompletions() { return []; },",
        "  };",
        "};",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, sourceText);

    const hover = await computeLitsxProjectHover(filePath, sourceText, "litsx", sourceText.indexOf("view"));

    assert.strictEqual(hover.code, "workspace-session");
    assert.strictEqual(hover.documentation, "workspace @litsx/typescript");
  }, 15000);

  it("logs fallback TypeScript resolution when trace is enabled", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-fallback-log-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "const view = <button>{count}</button>;",
      "",
    ].join("\n");
    const outputLines = [];

    fs.writeFileSync(filePath, sourceText);

    configureEditorSupport({
      async resolveTypeScript() {
        return {
          typescript: (await import("typescript")).default,
          source: "fallback",
          modulePath: "fallback:typescript",
          bundledLibDir: null,
        };
      },
      logger: {
        appendLine(line) {
          outputLines.push(line);
        },
      },
      traceEnabled() {
        return true;
      },
    });

    await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");

    assert.ok(outputLines.some((line) => line.includes("source=fallback")));
  }, 15000);
});
