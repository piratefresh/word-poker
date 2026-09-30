import { Canvas, Fill, Shader, Skia, vec } from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";

/**
 * The painted shadow behind the action bar, in one pass: transparent at the top, closing in over
 * `feather` pixels to full strength where the bar's controls begin, darkest at the centre behind
 * the buttons, with a brushed (not ruler-straight) top edge and a fine grain over it. Colours come
 * out premultiplied, as Skia wants.
 */
const ACTION_BAR_SHADE = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float feather;
  uniform float strength;
  uniform float grain;

  const float3 SHADOW = float3(0.005, 0.025, 0.022);

  float hash(float2 p) {
    p = fract(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + float2(1.0, 0.0)), f.x),
      mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      value += noise(p) * amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  half4 main(float2 pos) {
    // A few pixels of low-frequency wobble along x moves where the fade starts.
    float brush = (fbm(float2(pos.x / 90.0, 0.5)) - 0.5) * 10.0;
    float ramp = smoothstep(0.0, feather * 2.2, pos.y - brush);

    // Extra weight in the middle of the bottom edge, where the buttons are.
    float2 fromCentre = float2((pos.x - resolution.x * 0.5) / (resolution.x * 0.65),
                               (pos.y - resolution.y) / resolution.y);
    float centre = 1.0 - smoothstep(0.0, 1.0, length(fromCentre));

    float shade = ramp * (0.7 + 0.3 * centre) * strength;
    shade += (hash(floor(pos / 2.0)) - 0.5) * grain * ramp;
    float a = clamp(shade, 0.0, 0.85);
    return half4(SHADOW * a, a);
  }
`);

export interface ActionBarShadeProps {
  /** Pixels the shadow takes to fade in above the controls. */
  feather?: number;
  /** How dark it gets behind the buttons, 0..1. */
  strength?: number;
  /** The grain's strength; a few hundredths is plenty. */
  grain?: number;
}

export function ActionBarShadeCanvas({
  feather = 28,
  strength = 0.72,
  grain = 0.04,
}: ActionBarShadeProps) {
  const size = useSharedValue({ width: 1, height: 1 });

  const uniforms = useDerivedValue(() => ({
    resolution: vec(Math.max(1, size.value.width), Math.max(1, size.value.height)),
    feather,
    strength,
    grain,
  }));

  if (!ACTION_BAR_SHADE) return null;
  return (
    <Canvas onSize={size} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={ACTION_BAR_SHADE} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
