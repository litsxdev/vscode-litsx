# LitSX for Visual Studio Code

First-class editor support for LitSX-authored components.

LitSX adds native web-component authoring on top of JSX. This extension makes that syntax feel intentional inside VS Code: `.litsx` files get the right language mode, LitSX bindings are highlighted as authored syntax, and the editor surfaces project-aware diagnostics, hovers, and completions through the shared LitSX TypeScript tooling.

## Features

- Syntax highlighting for `.litsx` and `.litsx.jsx` files.
- Highlighting for LitSX bindings: `@event`, `.property`, and `?boolean`.
- CSS highlighting inside `static styles = \`...\`` hoists.
- Diagnostics for invalid LitSX attributes, properties, and event bindings.
- Hover information for LitSX bindings and static hoists.
- Completions for intrinsic attributes, properties, boolean bindings, and events.
- Component-aware completions for imported LitSX component props and emitted events.
- Auto-import completions for public `@litsx/litsx` APIs such as `useState`.
- TSX/JSX language-mode suggestions when LitSX-authored syntax is detected.
- Workspace defaults that keep VS Code's TypeScript server aligned with LitSX projects.

## Example

```tsx
import { useEmit, useState } from "@litsx/litsx";

type CounterButtonProps = {
  label?: string;
};

export const CounterButton = ({ label = "Count" }: CounterButtonProps) => {
  static styles = `
    button {
      border-radius: 8px;
    }
  `;

  const emit = useEmit();
  const [count, setCount] = useState(0);

  return (
    <button
      .value={count}
      @click={() => {
        setCount(count + 1);
        emit("count-change");
      }}
      ?disabled={count > 10}
    >
      {label}: {count}
    </button>
  );
};
```

In this snippet the extension highlights LitSX-specific bindings, keeps CSS readable inside `static styles`, and offers completions for bindings such as `@click`, `.value`, and `?disabled`.

## Project Setup

For the strongest TypeScript experience, install the LitSX TypeScript plugin in your project and enable the workspace TypeScript version:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/litsx",
    "plugins": [{ "name": "@litsx/typescript-plugin" }]
  }
}
```

If you are starting from scratch, [`create-litsx-app`](https://www.npmjs.com/package/create-litsx-app) can scaffold a LitSX project with the recommended VS Code settings and extension recommendation already in place.

## Commands

- `LitSX: Switch Current File to LitSX Mode`
- `LitSX: Reset Current File to Standard Language Mode`
- `LitSX: Dump Current File Diagnostics`

## Settings

- `litsx.autoSuggestLanguageMode`: suggest LitSX language mode for TSX/JSX files that contain LitSX-authored syntax.
- `litsx.traceDiagnostics`: log LitSX diagnostic refreshes to the `LitSX` output channel.

## Related Packages

- `@litsx/litsx`: runtime primitives and JSX runtime.
- `@litsx/typescript-plugin`: TypeScript virtualization, diagnostics, hover, and completions.
- `@litsx/eslint-plugin`: lint rules for LitSX projects.
- `prettier-plugin-litsx`: formatting support for LitSX-authored files.
