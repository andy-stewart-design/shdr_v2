import { uniform, type FragmentFn } from "../../shdr/index.ts";

const DEFAULT_PIXELATION_CSS_PX = 40;

export const uniforms = {
  texture: uniform.texture2D("https://shdr.andystew.art/abstract.jpg"),
  // Shader uniform is in physical pixels; GUI displays CSS pixels.
  pixelation: uniform.float(DEFAULT_PIXELATION_CSS_PX * devicePixelRatio),
};

export const fragment: FragmentFn<typeof uniforms> = ({
  $,
  vec2,
  floor,
  step,
  mix,
  div,
  texture,
}) => {
  const textureAR = $.let(
    "textureAR",
    $.u.textureResolution.x.div($.u.textureResolution.y),
  );
  const canvasAR = $.let("canvasAR", $.resolution.x.div($.resolution.y));

  // Branchless object-fit: cover UV adjustment.
  const useXScale = $.let("useXScale", step(canvasAR, textureAR));
  const uvScale = $.let(
    "uvScale",
    mix(
      vec2(1.0, textureAR.div(canvasAR)),
      vec2(canvasAR.div(textureAR), 1.0),
      useXScale,
    ),
  );
  const adjustedUV = $.let("adjustedUV", $.uv.sub(0.5).mul(uvScale).add(0.5));

  // Calculate square pixel grid in texture UV space.
  const numPixelsY = $.let(
    "numPixelsY",
    floor($.resolution.y.div($.u.pixelation)),
  );
  const pixelSize = $.let("pixelSize", div(1.0, numPixelsY));
  const dx = $.let("dx", pixelSize.div(textureAR));
  const dy = $.let("dy", pixelSize);

  const x = $.let("x", dx.mul(floor(adjustedUV.x.div(dx)).add(0.5)));
  const y = $.let("y", dy.mul(floor(adjustedUV.y.div(dy)).add(0.5)));

  $.output(texture($.u.texture, vec2(x, y)));
};
