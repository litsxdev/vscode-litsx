import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const litsxSourceRoot = process.env.LITSX_SOURCE_DIR
  ? path.resolve(process.env.LITSX_SOURCE_DIR)
  : path.resolve(repoRoot, "vendor", "litsx");
const sourceModulePath = path.join(litsxSourceRoot, "packages", "shiki-languages", "src", "index.js");
const syntaxesDir = path.resolve(repoRoot, "syntaxes");

function stripLegacyHoistSyntax(grammar) {
  const nextGrammar = structuredClone(grammar);
  const hoistPatterns = nextGrammar.repository?.["litsx-hoists"]?.patterns;
  if (Array.isArray(hoistPatterns)) {
    nextGrammar.repository["litsx-hoists"].patterns = hoistPatterns.filter(
      (pattern) => !pattern?.match?.includes("(\\^)"),
    );
  }

  const stylePatterns = nextGrammar.repository?.["litsx-styles-css"]?.patterns;
  if (Array.isArray(stylePatterns)) {
    nextGrammar.repository["litsx-styles-css"].patterns = stylePatterns.filter(
      (pattern) => !pattern?.begin?.includes("(\\^)"),
    );
  }

  return nextGrammar;
}

const committedGrammarPaths = [
  path.join(syntaxesDir, "litsx-jsx.tmLanguage.json"),
  path.join(syntaxesDir, "litsx.tmLanguage.json"),
];

if (!fs.existsSync(sourceModulePath)) {
  const hasCommittedGrammars = committedGrammarPaths.every((filePath) => fs.existsSync(filePath));

  if (hasCommittedGrammars) {
    console.log(
      `Skipping grammar regeneration because ${sourceModulePath} is unavailable; using committed syntaxes.`,
    );
    process.exit(0);
  }

  throw new Error(
    `Cannot regenerate grammars because ${sourceModulePath} is unavailable and no committed syntaxes were found.`,
  );
}

const { litsxJsxLanguage, litsxTsxLanguage } = await import(pathToFileURL(sourceModulePath).href);

fs.mkdirSync(syntaxesDir, { recursive: true });
fs.writeFileSync(
  path.join(syntaxesDir, "litsx-jsx.tmLanguage.json"),
  `${JSON.stringify(stripLegacyHoistSyntax(litsxJsxLanguage), null, 2)}\n`,
);
fs.writeFileSync(
  path.join(syntaxesDir, "litsx.tmLanguage.json"),
  `${JSON.stringify(stripLegacyHoistSyntax(litsxTsxLanguage), null, 2)}\n`,
);
