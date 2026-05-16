import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

import {
  collectLitsxAuthoredDiagnostics,
  getLitsxAttributeCompletionNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxAttributeInfoAtPosition,
  inferLitsxStaticHoistInfoAtPosition,
} from "@litsx/typescript/virtualization";
import { createLitsxEditorSession as createBundledLitsxEditorSession } from "@litsx/typescript/editor-session";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SESSION_CACHE = new Map();
const TYPESCRIPT_MODULE_CACHE = new Map();
const EDITOR_SESSION_MODULE_CACHE = new Map();
const AUTHORED_DIAGNOSTIC_TS = {
  DiagnosticCategory: {
    Warning: 0,
    Error: 1,
  },
};

let runtimeConfig = {
  resolveTypeScript: null,
  logger: null,
  traceEnabled: null,
};

const BINDING_HOVER_BY_PREFIX = {
  "@": {
    kindLabel: "event",
    detail: "LitSX event listener binding",
  },
  ".": {
    kindLabel: "property",
    detail: "LitSX property binding",
  },
  "?": {
    kindLabel: "boolean",
    detail: "LitSX boolean attribute binding",
  },
};

function getBundledTypeScriptLibDir() {
  const candidateDirs = [
    path.resolve(MODULE_DIR, "vendor", "typescript", "lib"),
    path.resolve(MODULE_DIR, "..", "dist", "vendor", "typescript", "lib"),
  ];

  return candidateDirs.find((candidateDir) => fs.existsSync(path.join(candidateDir, "lib.esnext.full.d.ts"))) ?? null;
}

function getDevelopmentTypeScriptLibDir() {
  try {
    return path.dirname(require.resolve("typescript/lib/typescript.js"));
  } catch {
    return getBundledTypeScriptLibDir();
  }
}

function getBuiltInTypeScriptLibDir(vscode) {
  const builtInTypeScriptExtension = vscode?.extensions?.getExtension?.("vscode.typescript-language-features");
  const extensionPath = builtInTypeScriptExtension?.extensionPath;
  if (typeof extensionPath !== "string" || !extensionPath) {
    return null;
  }

  const candidateDirs = [
    path.resolve(extensionPath, "node_modules", "typescript", "lib"),
    path.resolve(extensionPath, "..", "node_modules", "typescript", "lib"),
    path.resolve(extensionPath, "..", "..", "node_modules", "typescript", "lib"),
  ];

  return candidateDirs.find((candidateDir) => fs.existsSync(path.join(candidateDir, "typescript.js"))) ?? null;
}

function getParserPlugins(languageId) {
  return languageId === "litsx" ? ["typescript"] : [];
}

function getBindingHoverInfo(attributeInfo) {
  if (!attributeInfo) {
    return null;
  }

  const bindingInfo = BINDING_HOVER_BY_PREFIX[attributeInfo.prefix] ?? {
    kindLabel: "binding",
    detail: "LitSX binding",
  };

  return {
    name: attributeInfo.name,
    start: attributeInfo.start,
    length: attributeInfo.length,
    kindLabel: bindingInfo.kindLabel,
    detail: `${bindingInfo.detail} for <${attributeInfo.tagName}>.`,
  };
}

function getCompletionKindToken(name) {
  return name.startsWith("@") ? "Event" : "Property";
}

function getContextualCompletionEdit(name, context) {
  const replacementStart = (context?.start ?? 0) + 1;
  const replacementLength = Math.max((context?.length ?? 1) - 1, 0);

  return {
    insertText: name.slice(1),
    filterText: name.slice(1),
    start: replacementStart,
    length: replacementLength,
  };
}

function loadTypeScriptModule(modulePath) {
  if (TYPESCRIPT_MODULE_CACHE.has(modulePath)) {
    return TYPESCRIPT_MODULE_CACHE.get(modulePath);
  }

  const loaded = require(modulePath);
  const typescript = loaded?.default ?? loaded;
  TYPESCRIPT_MODULE_CACHE.set(modulePath, typescript);
  return typescript;
}

function resolveTypeScriptModulePathFromLibDir(libDir) {
  if (typeof libDir !== "string" || !libDir) {
    return null;
  }

  const modulePath = path.join(libDir, "typescript.js");
  return fs.existsSync(modulePath) ? modulePath : null;
}

function loadDevelopmentTypeScript() {
  const modulePath = resolveTypeScriptModulePathFromLibDir(getDevelopmentTypeScriptLibDir());
  if (!modulePath) {
    return null;
  }

  return {
    typescript: loadTypeScriptModule(modulePath),
    source: "development",
    modulePath,
    bundledLibDir: path.dirname(modulePath),
  };
}

function resolveWorkspaceModulePath(fileName, specifier) {
  if (typeof fileName !== "string" || !fileName) {
    return null;
  }

  let currentDir = path.dirname(fileName);

  while (currentDir && currentDir !== path.dirname(currentDir)) {
    try {
      return require.resolve(specifier, { paths: [currentDir] });
    } catch {}

    currentDir = path.dirname(currentDir);
  }

  return null;
}

function loadEditorSessionModuleFromPath(modulePath) {
  if (EDITOR_SESSION_MODULE_CACHE.has(modulePath)) {
    return EDITOR_SESSION_MODULE_CACHE.get(modulePath);
  }

  const loaded = require(modulePath);
  const moduleExports = loaded?.default ?? loaded;
  EDITOR_SESSION_MODULE_CACHE.set(modulePath, moduleExports);
  return moduleExports;
}

async function loadEditorSessionModule(fileName) {
  const workspaceModulePath = resolveWorkspaceModulePath(fileName, "@litsx/typescript/editor-session");

  if (workspaceModulePath) {
    try {
      return {
        createLitsxEditorSession: loadEditorSessionModuleFromPath(workspaceModulePath).createLitsxEditorSession,
        source: "workspace",
        modulePath: workspaceModulePath,
      };
    } catch {}
  }

  return {
    createLitsxEditorSession: createBundledLitsxEditorSession,
    source: "extension",
    modulePath: "extension:@litsx/typescript/editor-session",
  };
}

function configureEditorSupport(nextConfig = {}) {
  runtimeConfig = {
    ...runtimeConfig,
    ...nextConfig,
  };
  SESSION_CACHE.clear();
}

function createWorkspaceTypeScriptResolver(vscode) {
  return async (fileName) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder?.(vscode.Uri.file(fileName))
      ?? vscode.workspace.workspaceFolders?.find((candidate) => {
        const folderPath = candidate?.uri?.fsPath;
        return typeof folderPath === "string" && fileName.startsWith(folderPath);
      })
      ?? null;

    const config = workspaceFolder
      ? vscode.workspace.getConfiguration(undefined, workspaceFolder.uri)
      : vscode.workspace.getConfiguration();
    const configuredTsdk =
      config.get("js/ts.tsdk.path")
      ?? config.get("typescript.tsdk")
      ?? null;

    const candidateModulePaths = [];

    if (workspaceFolder?.uri?.fsPath) {
      if (typeof configuredTsdk === "string" && configuredTsdk) {
        const resolvedTsdkPath = path.isAbsolute(configuredTsdk)
          ? configuredTsdk
          : path.resolve(workspaceFolder.uri.fsPath, configuredTsdk);
        candidateModulePaths.push(
          resolvedTsdkPath.endsWith(".js")
            ? resolvedTsdkPath
            : path.join(resolvedTsdkPath, "typescript.js"),
        );
      }

      candidateModulePaths.push(
        path.join(workspaceFolder.uri.fsPath, "node_modules", "typescript", "lib", "typescript.js"),
      );
    }

    for (const candidateModulePath of candidateModulePaths) {
      if (!fs.existsSync(candidateModulePath)) {
        continue;
      }

      try {
        return {
          typescript: loadTypeScriptModule(candidateModulePath),
          source: "workspace",
          modulePath: candidateModulePath,
          bundledLibDir: path.dirname(candidateModulePath),
        };
      } catch {}
    }

    const builtInLibDir = getBuiltInTypeScriptLibDir(vscode);
    const builtInModulePath = resolveTypeScriptModulePathFromLibDir(builtInLibDir);
    if (builtInModulePath) {
      try {
        return {
          typescript: loadTypeScriptModule(builtInModulePath),
          source: "vscode-builtin",
          modulePath: builtInModulePath,
          bundledLibDir: builtInLibDir,
        };
      } catch {}
    }

    return loadDevelopmentTypeScript();
  };
}

function isTraceEnabled() {
  return runtimeConfig.traceEnabled?.() ?? false;
}

function getLogger() {
  return runtimeConfig.logger ?? null;
}

async function resolveTypeScriptForFile(fileName) {
  const resolved = runtimeConfig.resolveTypeScript
    ? await runtimeConfig.resolveTypeScript(fileName)
    : null;

  if (resolved?.typescript) {
    return {
      typescript: resolved.typescript,
      source: resolved.source ?? "workspace",
      modulePath: resolved.modulePath ?? `${resolved.source ?? "workspace"}:${resolved.typescript.version ?? "unknown"}`,
      bundledLibDir: resolved.bundledLibDir ?? null,
    };
  }

  const developmentTypeScript = loadDevelopmentTypeScript();
  if (developmentTypeScript) {
    return developmentTypeScript;
  }

  throw new Error(
    "LitSX could not resolve a TypeScript runtime. Install TypeScript in the workspace or use the VS Code bundled TypeScript extension.",
  );
}

async function getProjectSession(fileName) {
  const editorSessionModule = await loadEditorSessionModule(fileName);
  const resolution = await resolveTypeScriptForFile(fileName);
  const sessionKey = `${editorSessionModule.modulePath}:${resolution.modulePath}:${resolution.bundledLibDir ?? ""}`;
  let session = SESSION_CACHE.get(sessionKey);

  if (!session) {
    session = editorSessionModule.createLitsxEditorSession({
      typescript: resolution.typescript,
      bundledLibDir: resolution.bundledLibDir,
      trace: isTraceEnabled(),
      logger: getLogger(),
    });
    SESSION_CACHE.set(sessionKey, session);
    if (isTraceEnabled()) {
      if (editorSessionModule.source !== "workspace") {
        getLogger()?.appendLine?.(
          `editorSupportLitsxTypeScript source=${editorSessionModule.source} module=${editorSessionModule.modulePath}`,
        );
      }
      if (resolution.source !== "workspace") {
        getLogger()?.appendLine?.(
          `editorSupportTypeScript source=${resolution.source} module=${resolution.modulePath}`,
        );
      }
    }
  }

  return session;
}

async function computeLitsxDiagnostics(sourceText, languageId) {
  return collectLitsxAuthoredDiagnostics(sourceText, AUTHORED_DIAGNOSTIC_TS, {
    plugins: getParserPlugins(languageId),
  });
}

async function computeLitsxHover(sourceText, languageId, position) {
  const hoistInfo = inferLitsxStaticHoistInfoAtPosition(sourceText, position);
  if (hoistInfo) {
    return {
      start: hoistInfo.start,
      length: hoistInfo.length,
      code: `${hoistInfo.name}(...): static hoist`,
      documentation: hoistInfo.documentation,
    };
  }

  const attributeInfo = inferLitsxAttributeInfoAtPosition(sourceText, position);
  const bindingHoverInfo = getBindingHoverInfo(attributeInfo);
  if (!bindingHoverInfo) {
    return null;
  }

  return {
    start: bindingHoverInfo.start,
    length: bindingHoverInfo.length,
    code: `${bindingHoverInfo.name}: ${bindingHoverInfo.kindLabel}`,
    documentation: bindingHoverInfo.detail,
  };
}

async function computeLitsxCompletions(sourceText, languageId, position, vscode) {
  const context = inferLitsxAttributeCompletionContext(sourceText, position);
  if (!context) {
    return [];
  }

  return getLitsxAttributeCompletionNames(context).map((name) => ({
    ...getContextualCompletionEdit(name, context),
    label: name,
    kind: vscode.CompletionItemKind[getCompletionKindToken(name)],
    detail: "LitSX binding",
    documentation: `LitSX binding for <${context.tagName}>.`,
  }));
}

async function computeLitsxProjectDiagnostics(fileName, sourceText, languageId) {
  const session = await getProjectSession(fileName);
  return session.getDiagnostics(fileName, sourceText, languageId);
}

async function computeLitsxProjectHover(fileName, sourceText, languageId, position) {
  const session = await getProjectSession(fileName);
  return session.getHover(fileName, sourceText, languageId, position);
}

async function computeLitsxProjectCompletions(fileName, sourceText, languageId, position, vscode) {
  const session = await getProjectSession(fileName);
  return session.getCompletions(
    fileName,
    sourceText,
    languageId,
    position,
    (kind) => vscode.CompletionItemKind[kind] ?? vscode.CompletionItemKind.Text,
  );
}

export {
  computeLitsxCompletions,
  computeLitsxDiagnostics,
  computeLitsxHover,
  computeLitsxProjectCompletions,
  computeLitsxProjectDiagnostics,
  computeLitsxProjectHover,
  configureEditorSupport,
  createWorkspaceTypeScriptResolver,
  getBundledTypeScriptLibDir,
  getParserPlugins,
};
