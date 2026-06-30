import { visitorKeys } from "oxc-parser";

export type AnyNode = {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

export function isNode(value: unknown): value is AnyNode {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as AnyNode).type === "string"
  );
}

export function walk(
  node: unknown,
  visit: (node: AnyNode, parent: AnyNode | null) => void,
  parent: AnyNode | null = null,
): void {
  if (!isNode(node)) return;
  visit(node, parent);
  const keys = visitorKeys[node.type] ?? [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit, node);
    } else {
      walk(child, visit, node);
    }
  }
}
