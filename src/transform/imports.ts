import type { AnyNode } from "./walk.ts";

export type ShdrImportBindings = {
  fnNames: Set<string>;
  fragmentFnNames: Set<string>;
  compileFragmentNames: Set<string>;
  createShaderNames: Set<string>;
};

function isShdrImport(source: string): boolean {
  return (
    source === "@shdr/index" ||
    source === "@shdr/index.ts" ||
    /(^|\/)shdr(\/index)?(\.ts)?$/.test(source)
  );
}

function emptyBindings(): ShdrImportBindings {
  return {
    fnNames: new Set(),
    fragmentFnNames: new Set(),
    compileFragmentNames: new Set(),
    createShaderNames: new Set(),
  };
}

function addBinding(
  bindings: ShdrImportBindings,
  imported: string,
  local: string,
) {
  switch (imported) {
    case "fn":
      bindings.fnNames.add(local);
      break;
    case "FragmentFn":
      bindings.fragmentFnNames.add(local);
      break;
    case "compileFragment":
      bindings.compileFragmentNames.add(local);
      break;
    case "createShader":
      bindings.createShaderNames.add(local);
      break;
  }
}

export function collectShdrImports(program: AnyNode): ShdrImportBindings {
  const bindings = emptyBindings();
  const body = Array.isArray(program.body) ? program.body : [];

  for (const stmt of body) {
    if (!stmt || typeof stmt !== "object") continue;
    const node = stmt as AnyNode;
    if (node.type !== "ImportDeclaration") continue;
    const source = node.source as { value?: unknown } | undefined;
    if (typeof source?.value !== "string" || !isShdrImport(source.value))
      continue;

    const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
    for (const specifier of specifiers) {
      if (!specifier || typeof specifier !== "object") continue;
      const spec = specifier as AnyNode;
      if (spec.type !== "ImportSpecifier") continue;
      const imported = spec.imported as { name?: unknown } | undefined;
      const local = spec.local as { name?: unknown } | undefined;
      if (typeof imported?.name !== "string" || typeof local?.name !== "string")
        continue;
      addBinding(bindings, imported.name, local.name);
    }
  }

  return bindings;
}
