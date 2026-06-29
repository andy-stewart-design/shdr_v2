import MagicString from "magic-string";
import type { TransformDeclaration } from "./declarations.ts";
import type { FnNameEdit } from "./fn-names.ts";

export type RewriteEdit =
  | { type: "wrap"; declaration: TransformDeclaration }
  | { type: "fn-name"; edit: FnNameEdit };

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function editRange(edit: RewriteEdit): [number, number] {
  if (edit.type === "wrap") return [edit.declaration.initStart, edit.declaration.initEnd];
  return [edit.edit.insertPos, edit.edit.insertPos];
}

export function applyRewriteEdits(code: string, edits: RewriteEdit[], id: string) {
  if (edits.length === 0) return null;

  const sorted = [...edits].sort((a, b) => editRange(a)[0] - editRange(b)[0]);
  const accepted: RewriteEdit[] = [];
  for (const edit of sorted) {
    const [start, end] = editRange(edit);
    const overlaps = accepted.some((other) => {
      const [otherStart, otherEnd] = editRange(other);
      return rangesOverlap(start, end, otherStart, otherEnd);
    });
    if (!overlaps) accepted.push(edit);
  }

  const s = new MagicString(code);
  for (const edit of accepted) {
    if (edit.type === "wrap") {
      const { name, kind, initStart, initEnd } = edit.declaration;
      s.prependLeft(initStart, kind === "const" ? `$.const("${name}", ` : `$.let("${name}", `);
      s.appendRight(initEnd, ")");
    } else {
      s.appendLeft(edit.edit.insertPos, `"${edit.edit.name}", `);
    }
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: id }),
  };
}
