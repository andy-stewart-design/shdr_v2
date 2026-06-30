import type { ShdrImportBindings } from "./imports.ts";
import { walk, type AnyNode } from "./walk.ts";

export type FnNameEdit = {
  name: string;
  insertPos: number;
};

function identifierName(node: unknown): string | null {
  return node &&
    typeof node === "object" &&
    typeof (node as { name?: unknown }).name === "string"
    ? (node as { name: string }).name
    : null;
}

function isStringLiteral(node: unknown): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    (node as AnyNode).type === "Literal" &&
    typeof (node as { value?: unknown }).value === "string"
  );
}

export function collectFnNameEdits(
  program: AnyNode,
  imports: ShdrImportBindings,
): FnNameEdit[] {
  const edits: FnNameEdit[] = [];

  // Walk the full tree rather than just top-level statements so fn()
  // definitions nested inside blocks or re-exported via barrels are caught.
  // VariableDeclarator has both id (the binding name) and init (the fn() call)
  // in one place, making it the right node to match against.
  walk(program, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const name = identifierName(node.id);
    const init = node.init as AnyNode | undefined;
    if (!name || init?.type !== "CallExpression") return;
    if (!imports.fnNames.has(identifierName(init.callee) ?? "")) return;
    const args = (init.arguments as unknown[]) ?? [];
    if (isStringLiteral(args[0])) return;
    if (typeof init.start !== "number") return;
    edits.push({
      name,
      insertPos: init.start + `${identifierName(init.callee)}(`.length,
    });
  });

  return edits;
}
