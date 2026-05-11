import fs from "fs";
import path from "path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourceDir = path.resolve(repoRoot, "node_modules", "typescript", "lib");
const targetDir = path.resolve(repoRoot, "dist", "vendor", "typescript", "lib");

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir)) {
  if (!entry.endsWith(".d.ts")) {
    continue;
  }

  fs.copyFileSync(path.join(sourceDir, entry), path.join(targetDir, entry));
}
