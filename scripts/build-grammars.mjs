import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const litsxSourceRoot = process.env.LITSX_SOURCE_DIR
  ? path.resolve(process.env.LITSX_SOURCE_DIR)
  : path.resolve(repoRoot, "vendor", "litsx");
const sourceModulePath = path.join(litsxSourceRoot, "packages", "shiki-languages", "src", "index.js");
const syntaxesDir = path.resolve(repoRoot, "syntaxes");

const { litsxJsxLanguage, litsxTsxLanguage } = await import(pathToFileURL(sourceModulePath).href);

fs.mkdirSync(syntaxesDir, { recursive: true });
fs.writeFileSync(path.join(syntaxesDir, "litsx-jsx.tmLanguage.json"), `${JSON.stringify(litsxJsxLanguage, null, 2)}\n`);
fs.writeFileSync(path.join(syntaxesDir, "litsx.tmLanguage.json"), `${JSON.stringify(litsxTsxLanguage, null, 2)}\n`);
