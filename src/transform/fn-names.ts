import type { ShdrImportBindings } from "./imports.ts";
import type { AnyNode } from "./walk.ts";

export type FnNameEdit = {
  name: string;
  insertPos: number;
};

function identifierName(node: unknown): string | null {
  return node && typeof node === "object" && typeof (node as { name?: unknown }).name === "string"
    ? (node as { name: string }).name
    : null;
}

function isStringLiteral(node: unknown): boolean {
  return !!node && typeof node === "object" && (node as AnyNode).type === "Literal" && typeof (node as { value?: unknown }).value === "string";
}

export function collectFnNameEdits(program: AnyNode, imports: ShdrImportBindings): FnNameEdit[] {
  const edits: FnNameEdit[] = [];
  const body = Array.isArray(program.body) ? program.body : [];

  for (const rawStmt of body) {
    const stmt = rawStmt as AnyNode;
    const declaration = stmt.type === "ExportNamedDeclaration" && stmt.declaration ? (stmt.declaration as AnyNode) : stmt;
    if (declaration.type !== "VariableDeclaration") continue;
    const declarators = Array.isArray(declaration.declarations) ? declaration.declarations : [];
    if (declarators.length !== 1) continue;
    const declarator = declarators[0] as AnyNode;
    const name = identifierName(declarator.id);
    const init = declarator.init as AnyNode | undefined;
    if (!name || init?.type !== "CallExpression") continue;
    if (!imports.fnNames.has(identifierName(init.callee) ?? "")) continue;
    const args = (init.arguments as unknown[]) ?? [];
    if (isStringLiteral(args[0])) continue;
    if (typeof init.start !== "number") continue;
    edits.push({ name, insertPos: init.start + `${identifierName(init.callee)}(`.length });
  }

  return edits;
}
