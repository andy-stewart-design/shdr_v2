// const NODE = Symbol("node");

// function makeExpr(node) {
//   return { [NODE]: node };
// }

// function num(value) {
//   return makeExpr({ kind: "number", value });
// }

// function ref(...path) {
//   return makeExpr({ kind: "ref", path });
// }

// function call(name, ...args) {
//   return makeExpr({
//     kind: "call",
//     name,
//     args: args.map(toNode),
//   });
// }

// function toNode(value) {
//   if (value && typeof value === "object" && value[NODE]) {
//     return value[NODE];
//   }

//   if (typeof value === "number") {
//     return { kind: "number", value };
//   }

//   throw new Error(
//     `Unsupported shader value: ${Object.prototype.toString.call(value)}`,
//   );
// }

// function formatNumber(n) {
//   return Number.isInteger(n) ? `${n.toFixed(1)}` : `${n}`;
// }

// function compileExpr(node) {
//   switch (node.kind) {
//     case "number":
//       return formatNumber(node.value);

//     case "ref":
//       return node.path.join(".");

//     case "call":
//       return `${node.name}(${node.args.map(compileExpr).join(", ")})`;
//   }
// }

// function inferType(node) {
//   if (node.kind === "call" && /^vec[234]$/.test(node.name)) {
//     return node.name;
//   }

//   return "float";
// }

// function exprProxy(path = []) {
//   const expr = makeExpr({ kind: "ref", path });

//   return new Proxy(expr, {
//     get(target, prop) {
//       if (prop === NODE) return target[NODE];
//       if (prop === Symbol.toPrimitive) return () => path.join(".");
//       if (prop === "toString") return () => path.join(".");
//       if (prop === "valueOf") return () => path.join(".");

//       if (typeof prop === "string") {
//         return exprProxy([...path, prop]);
//       }

//       return undefined;
//     },
//   });
// }

// function createShader(fn) {
//   const statements = [];

//   const $ = new Proxy(
//     {},
//     {
//       get(_, prop) {
//         if (prop === "let") {
//           return (name, value) => {
//             const node = toNode(value);
//             statements.push({
//               type: "let",
//               name,
//               value: node,
//               varType: inferType(node),
//             });
//             return exprProxy([name]);
//           };
//         }

//         if (prop === "uv") return exprProxy(["uv"]);

//         return undefined;
//       },

//       set(_, prop, value) {
//         statements.push({
//           type: "assign",
//           target: String(prop),
//           value: toNode(value),
//         });
//         return true;
//       },
//     },
//   );

//   const vec2 = (...args) => call("vec2", ...args);
//   const vec3 = (...args) => call("vec3", ...args);
//   const vec4 = (...args) => call("vec4", ...args);
//   const sin = (...args) => call("sin", ...args);
//   const cos = (...args) => call("cos", ...args);

//   fn({ $, vec2, vec3, vec4, sin, cos, num, ref });

//   const lines = [
//     "precision mediump float;",
//     "uniform vec2 u_resolution;",
//     "",
//     "void main() {",
//     "  vec2 uv = gl_FragCoord.xy / u_resolution.xy;",
//     ...statements.map((stmt) => {
//       if (stmt.type === "let") {
//         return `  ${stmt.varType} ${stmt.name} = ${compileExpr(stmt.value)};`;
//       }

//       if (stmt.type === "assign") {
//         const target =
//           stmt.target === "fragColor" ? "gl_FragColor" : stmt.target;
//         return `  ${target} = ${compileExpr(stmt.value)};`;
//       }

//       throw new Error(`Unknown statement type: ${stmt.type}`);
//     }),
//     "}",
//   ];

//   return lines.join("\n");
// }

// const shader = createShader(({ $, vec4 }) => {
//   const color = $.let("color", vec4(1, 1, $.uv.y, 1));
//   $.fragColor = color;
// });

// console.log(shader);
