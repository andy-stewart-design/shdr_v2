import type { ShdrImportBindings } from "./imports.ts";
import { walk, type AnyNode } from "./walk.ts";

export type TransformBoundary = {
  kind: "fragment" | "fn-body";
  node: AnyNode;
};

function unwrapExport(node: AnyNode): AnyNode {
  return node.type === "ExportNamedDeclaration" && node.declaration
    ? (node.declaration as AnyNode)
    : node;
}

function identifierName(node: unknown): string | null {
  return node && typeof node === "object" && typeof (node as { name?: unknown }).name === "string"
    ? ((node as { name: string }).name)
    : null;
}

function typeReferenceName(typeAnnotation: unknown): string | null {
  let node = typeAnnotation as AnyNode | null;
  if (!node) return null;
  if (node.type === "TSTypeAnnotation") node = node.typeAnnotation as AnyNode;
  if (node?.type !== "TSTypeReference") return null;
  return identifierName(node.typeName);
}

function isCallTo(node: AnyNode, names: Set<string>): boolean {
  if (node.type !== "CallExpression") return false;
  return names.has(identifierName(node.callee) ?? "");
}

function isObjectProperty(node: AnyNode, name: string): boolean {
  return node.type === "Property" && identifierName(node.key) === name;
}

function functionFromExpression(node: unknown): AnyNode | null {
  if (!node || typeof node !== "object") return null;
  const n = node as AnyNode;
  return n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" ? n : null;
}

function findFragmentBoundaries(program: AnyNode, imports: ShdrImportBindings): TransformBoundary[] {
  const boundaries: TransformBoundary[] = [];
  const body = Array.isArray(program.body) ? program.body : [];

  for (const rawStmt of body) {
    if (!rawStmt || typeof rawStmt !== "object") continue;
    const stmt = unwrapExport(rawStmt as AnyNode);
    if (stmt.type !== "VariableDeclaration") continue;
    const declarations = Array.isArray(stmt.declarations) ? stmt.declarations : [];
    for (const decl of declarations) {
      const d = decl as AnyNode;
      const id = d.id as AnyNode | undefined;
      if (id?.type !== "Identifier") continue;
      const typeName = typeReferenceName(id.typeAnnotation);
      if (typeName && imports.fragmentFnNames.has(typeName)) {
        const fn = functionFromExpression(d.init);
        if (fn) boundaries.push({ kind: "fragment", node: fn });
      }
    }
  }

  walk(program, (node) => {
    if (isCallTo(node, imports.compileFragmentNames)) {
      const fn = functionFromExpression((node.arguments as unknown[])?.[0]);
      if (fn) boundaries.push({ kind: "fragment", node: fn });
    }
    if (isCallTo(node, imports.createShaderNames)) {
      const arg = (node.arguments as unknown[])?.[0] as AnyNode | undefined;
      if (arg?.type !== "ObjectExpression") return;
      for (const prop of (arg.properties as unknown[]) ?? []) {
        const p = prop as AnyNode;
        if (isObjectProperty(p, "fragment")) {
          const fn = functionFromExpression(p.value);
          if (fn) boundaries.push({ kind: "fragment", node: fn });
        }
      }
    }
  });

  return boundaries;
}

function findFnBodyBoundaries(program: AnyNode, imports: ShdrImportBindings): TransformBoundary[] {
  const boundaries: TransformBoundary[] = [];
  walk(program, (node) => {
    if (!isCallTo(node, imports.fnNames)) return;
    const args = (node.arguments as unknown[]) ?? [];
    const fn = functionFromExpression(args[args.length - 1]);
    if (fn) boundaries.push({ kind: "fn-body", node: fn });
  });
  return boundaries;
}

export function findTransformBoundaries(program: AnyNode, imports: ShdrImportBindings): TransformBoundary[] {
  const seen = new Set<AnyNode>();
  const boundaries = [...findFragmentBoundaries(program, imports), ...findFnBodyBoundaries(program, imports)];
  return boundaries.filter((b) => {
    if (seen.has(b.node)) return false;
    seen.add(b.node);
    return true;
  });
}
