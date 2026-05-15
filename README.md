# `vscode-litsx`

[![Package](https://img.shields.io/badge/package-vsix-0078d7)](./package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

Official VS Code support for LitSX-authored source.

This extension focuses on the editor layer that TypeScript plugins do not cover well on their own:

- TextMate highlighting for `@event`, `.prop`, `?attr`, and static hoists such as `static styles = ...`
- CSS highlighting inside `static styles = \`...\``
- workspace defaults that keep the TypeScript server aligned with LitSX
- a light italic treatment for LitSX-specific attrs and hoists

It is designed to complement:
- `@litsx/typescript-plugin` for LitSX virtualization and TS-facing semantics
- `@litsx/eslint-plugin` for lint and policy enforcement

## Grammar source contract

The checked-in TextMate grammars in `syntaxes/` are generated from the LitSX source repository.

Canonical layout for local regeneration:
- extension repo root: `vscode-litsx/`
- LitSX source checkout: `vscode-litsx/vendor/litsx`

If `LITSX_SOURCE_DIR` is not set, grammar generation defaults to `vendor/litsx`.

```sh
mkdir -p vendor
git clone https://github.com/litsxdev/litsx.git vendor/litsx
corepack yarn install --immutable
corepack yarn build
```

CI and release builds do not clone `litsx`. They rely on the committed grammar artifacts in `syntaxes/`, and only regenerate them when a local LitSX source checkout is available.

## Release pipeline

- `Validate Extension` installs dependencies, runs tests, builds, and packages the VSIX without cloning the LitSX monorepo.
- `Release` versions the extension from pending changesets, publishes it to the VS Code Marketplace, pushes the `v<version>` tag, and creates a GitHub Release with the packaged VSIX attached.
