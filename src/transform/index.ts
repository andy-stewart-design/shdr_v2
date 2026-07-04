import { findTransformBoundaries } from "./boundaries.ts";
import {
  collectExplicitNameEdits,
  collectTransformDeclarations,
} from "./declarations.ts";
import { collectFnNameEdits } from "./fn-names.ts";
import { collectShdrImports } from "./imports.ts";
import { parseModule } from "./parse.ts";
import { applyRewriteEdits, type RewriteEdit } from "./rewrite.ts";
import type { AnyNode } from "./walk.ts";

function mightContainShdr(code: string): boolean {
  return (
    code.includes("FragmentFn") ||
    code.includes("compileFragment") ||
    code.includes("createShader") ||
    code.includes("fn(")
  );
}

export function transformShdrSource(code: string, id: string) {
  if (!mightContainShdr(code)) return null;

  const { program } = parseModule(code, id);
  const programNode = program as unknown as AnyNode;
  const imports = collectShdrImports(programNode);
  if (
    imports.fnNames.size === 0 &&
    imports.fragmentFnNames.size === 0 &&
    imports.compileFragmentNames.size === 0 &&
    imports.createShaderNames.size === 0
  ) {
    return null;
  }

  const boundaries = findTransformBoundaries(programNode, imports);
  const edits: RewriteEdit[] = [];

  for (const boundary of boundaries) {
    if (boundary.contextParamEdit) {
      edits.push({ type: "context-param", edit: boundary.contextParamEdit });
    }
    for (const declaration of collectTransformDeclarations(boundary)) {
      edits.push({ type: "wrap", declaration });
    }
    for (const edit of collectExplicitNameEdits(boundary)) {
      edits.push({ type: "explicit-name", edit });
    }
  }

  for (const edit of collectFnNameEdits(programNode, imports)) {
    edits.push({ type: "fn-name", edit });
  }

  return applyRewriteEdits(code, edits, id);
}
