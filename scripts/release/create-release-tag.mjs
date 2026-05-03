import fs from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const tag = `v${manifest.version}`;

try {
  execFileSync("git", ["rev-parse", "--verify", tag], { stdio: "ignore" });
} catch {
  execFileSync("git", ["tag", tag], { stdio: "inherit" });
}
