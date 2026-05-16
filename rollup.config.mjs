import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import path from "path";

const TYPESCRIPT_SHIM_ID = path.resolve("src/typescript-shim.js");

const EXTERNAL_IDS = new Set([
  "fs",
  "module",
  "path",
  "url",
  "vscode",
]);

function isExternal(id) {
  return id.startsWith("node:") || EXTERNAL_IDS.has(id);
}

export default {
  input: {
    extension: "src/extension.js",
    "editor-support": "src/editor-support.js",
    detect: "src/detect.js",
  },
  external: isExternal,
  output: {
    dir: "dist",
    format: "cjs",
    exports: "named",
    entryFileNames: "[name].cjs",
    chunkFileNames: "chunks/[name]-[hash].cjs",
  },
  plugins: [
    {
      name: "alias-typescript-shim",
      resolveId(source) {
        if (source === "typescript") {
          return TYPESCRIPT_SHIM_ID;
        }

        return null;
      },
    },
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ["import", "default"],
    }),
    commonjs(),
  ],
};
