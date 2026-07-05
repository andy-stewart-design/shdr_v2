import {
  compileFragment,
  defineUniforms,
  type FragmentFn,
} from "../../shdr/index.ts";

const DEFAULT_PIXELATION_CSS_PX = 40;

export const uniforms = defineUniforms((u) => ({
  texture: u.texture2D("https://shdr.andystew.art/abstract.jpg", {
    label: "Texture",
    accept: ["png", "jpeg", "webp", "gif"],
  }),
  pixelation: u.float(DEFAULT_PIXELATION_CSS_PX * devicePixelRatio, {
    label: "Pixelation",
    min: 1,
    max: 160,
    step: 1,
  }),
}));

const _fragment: FragmentFn<typeof uniforms> = ({
  $,
  vec2,
  floor,
  step,
  mix,
  div,
}) => {
  const textureAR = $.u.texture.resolution.x.div($.u.texture.resolution.y);
  const canvasAR = $.resolution.x.div($.resolution.y);

  // Branchless object-fit: cover UV adjustment.
  const useXScale = step(canvasAR, textureAR);
  const uvScale = mix(
    vec2(1.0, textureAR.div(canvasAR)),
    vec2(canvasAR.div(textureAR), 1.0),
    useXScale,
  );
  const adjustedUV = $.uv.sub(0.5).mul(uvScale).add(0.5);

  // Calculate square pixel grid in texture UV space.
  const numPixelsY = floor($.resolution.y.div($.u.pixelation));
  const pixelSize = div(1.0, numPixelsY);
  const dx = pixelSize.div(textureAR);
  const dy = pixelSize;

  const x = dx.mul(floor(adjustedUV.x.div(dx)).add(0.5));
  const y = dy.mul(floor(adjustedUV.y.div(dy)).add(0.5));

  $.output($.u.texture.sample(vec2(x, y)));
};

export const fragment = compileFragment(_fragment, { uniforms });
console.log(fragment);
