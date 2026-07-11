import { refProxy } from "../ast";
import { texture, vec2 } from "../builtins";
import type {
  Expr,
  GlslType,
  ShaderContext,
  TextureUniformExpr,
} from "../types";
import type { UniformSchema, UniformType } from "./schema";

export function uniformTypeToGlslType(type: UniformType): GlslType {
  return type === "texture2D" ? "sampler2D" : type;
}

function textureUniformProxy(name: string): TextureUniformExpr {
  const sampler = refProxy([`u_${name}`], "sampler2D");
  return new Proxy(sampler, {
    get(target, prop, receiver) {
      if (prop === "resolution")
        return refProxy([`u_${name}_resolution`], "vec2");
      if (prop === "sample") {
        return (
          ...args:
            | [Expr<"vec2">]
            | [Expr<"float"> | number, Expr<"float"> | number]
        ) => {
          const uv = args.length === 1 ? args[0] : vec2(args[0], args[1]);
          return texture(sampler, uv);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as TextureUniformExpr;
}

export function createUniformExprs<U extends UniformSchema>(
  uniforms: UniformSchema,
): ShaderContext<U>["u"] {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        const uniform = uniforms[prop];
        if (uniform) {
          const type = uniform.type;
          return type === "texture2D"
            ? textureUniformProxy(prop)
            : refProxy([`u_${prop}`], uniformTypeToGlslType(type));
        }
        if (prop.endsWith("Resolution")) {
          const base = prop.slice(0, -"Resolution".length);
          const textureUniform = uniforms[base];
          if (textureUniform && textureUniform.type === "texture2D") {
            return refProxy([`u_${base}_resolution`], "vec2");
          }
        }
        throw new Error(`Unknown custom uniform "${prop}".`);
      },
    },
  ) as ShaderContext<U>["u"];
}

export function emitUniformDeclarations(uniforms: UniformSchema): string[] {
  return Object.entries(uniforms).flatMap(([name, uniform]) => {
    const type = uniform.type;
    return type === "texture2D"
      ? [`uniform sampler2D u_${name};`, `uniform vec2 u_${name}_resolution;`]
      : [`uniform ${uniformTypeToGlslType(type)} u_${name};`];
  });
}
