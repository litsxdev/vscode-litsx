const DiagnosticCategory = {
  Warning: 0,
  Error: 1,
};

const typescriptShim = new Proxy(
  {
    DiagnosticCategory,
  },
  {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      throw new Error(
        `LitSX accessed TypeScript shim property "${String(property)}" before resolving a runtime TypeScript module.`,
      );
    },
  },
);

export default typescriptShim;
