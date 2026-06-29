import type { TransformBoundary } from "./boundaries.ts";
import type { AnyNode } from "./walk.ts";

export type DeclarationKind = "let" | "const";

export type TransformDeclaration = {
  name: string;
  kind: DeclarationKind;
  initStart: number;
  initEnd: number;
};

function identifierName(node: unknown): string | null {
  return node && typeof node === "object" && typeof (node as { name?: unknown }).name === "string"
    ? (node as { name: string }).name
    : null;
}

function memberExpressionName(node: unknown): { object: string; property: string } | null {
  if (!node || typeof node !== "object") return null;
  const n = node as AnyNode;
  if (n.type !== "MemberExpression" || n.computed) return null;
  const object = identifierName(n.object);
  const property = identifierName(n.property);
  return object && property ? { object, property } : null;
}

function isAlreadyWrapped(init: AnyNode): boolean {
  if (init.type !== "CallExpression") return false;
  const callee = memberExpressionName(init.callee);
  return callee?.object === "$" && (callee.property === "let" || callee.property === "const");
}

function classifyName(name: string, boundaryKind: TransformBoundary["kind"]): DeclarationKind | null {
  if (name.startsWith("_")) return null;
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return boundaryKind === "fragment" ? "const" : null;
  }
  return "let";
}

export function collectTransformDeclarations(boundary: TransformBoundary): TransformDeclaration[] {
  const body = boundary.node.body as AnyNode | undefined;
  if (body?.type !== "BlockStatement") return [];
  const statements = Array.isArray(body.body) ? body.body : [];
  const declarations: TransformDeclaration[] = [];

  for (const stmt of statements) {
    const node = stmt as AnyNode;
    if (node.type !== "VariableDeclaration") continue;
    const declarators = Array.isArray(node.declarations) ? node.declarations : [];
    if (declarators.length !== 1) continue;
    const declarator = declarators[0] as AnyNode;
    const id = declarator.id as AnyNode | undefined;
    const init = declarator.init as AnyNode | undefined;
    if (id?.type !== "Identifier" || !init) continue;
    if (typeof init.start !== "number" || typeof init.end !== "number") continue;
    if (isAlreadyWrapped(init)) continue;

    const name = id.name;
    if (typeof name !== "string") continue;
    const kind = classifyName(name, boundary.kind);
    if (!kind) continue;

    declarations.push({ name, kind, initStart: init.start, initEnd: init.end });
  }

  return declarations;
}
