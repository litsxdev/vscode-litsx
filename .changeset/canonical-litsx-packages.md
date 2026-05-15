---
"vscode-litsx": patch
---

Use the canonical LitSX package names for the extension runtime integration.

The extension now consumes `@litsx/typescript` and `@litsx/authoring`, tests use `@litsx/core`, and the Marketplace README shows the recommended `jsxImportSource: "@litsx/core"` and `plugins: [{ "name": "@litsx/typescript" }]` setup. Editor support now imports TypeScript virtualization helpers through `@litsx/typescript/virtualization`.
