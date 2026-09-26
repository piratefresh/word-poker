import { Canvas, Fill, Shader, Skia, vec } from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";
import { useDerivedValue, useReducedMotion, useSharedValue } from "react-native-reanimated";

import { useFrameTime } from "@/components/table/mesh-gradiant/useFrameTime";

/**
 * The room's edge, in one pass: a near-black green vignette that only closes in on the outer rim
 * and the corners, a stationary grain over the whole screen, and a slow haze that drifts through
 * the vignette's band and never reaches the table. Colours come out premultiplied, as Skia wants.
 *
 * The distance is measured in the screen's own proportions (each axis runs -1..1), so on a tall
 * phone the dark band hugs all four edges rather than drawing a circular spotlight.
 */
const ATMOSPHERE = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float time;
  uniform float vignette;
  uniform float grain;
  uniform float fog;

  const float3 SHADOW = float3(0.005, 0.025, 0.022);
  const float3 HAZE = float3(0.05, 0.16, 0.13);

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
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  half4 main(float2 pos) {
    float2 uv = pos / resolution;
    float d = length((uv - 0.5) * 2.0);

    float shade = smoothstep(0.78, 1.42, d) * vignette;
    shade += (hash(floor(pos / 2.0)) - 0.5) * grain;
    float shadeA = clamp(shade, 0.0, 0.7);

    float2 drift = uv * float2(2.2, 3.0) + float2(time * 0.015, -time * 0.008);
    float haze = smoothstep(0.48, 0.72, fbm(drift)) * smoothstep(0.7, 1.25, d);
    float hazeA = clamp(haze * fog, 0.0, 1.0);

    float3 rgb = HAZE * hazeA + SHADOW * shadeA * (1.0 - hazeA);
    return half4(rgb, hazeA + shadeA * (1.0 - hazeA));
  }
`);

interface TableAtmosphereProps {
  /** How dark the rim and corners get, 0..1. */
  vignette?: number;
  /** The film grain's strength; a few hundredths is plenty. */
  grain?: number;
  /** The edge haze's opacity — keep it one you only notice when it's gone. */
  fog?: number;
}

/** The atmosphere between the mesh backdrop and the table: vignette, grain and edge haze. */
export function TableAtmosphere({
  vignette = 0.42,
  grain = 0.025,
  fog = 0.12,
}: TableAtmosphereProps) {
  const size = useSharedValue({ width: 1, height: 1 });
  const time = useFrameTime({ animated: !useReducedMotion(), fpsLock: 30, speed: 1 });

  const uniforms = useDerivedValue(() => ({
    resolution: vec(Math.max(1, size.value.width), Math.max(1, size.value.height)),
    time: time.value,
    vignette,
    grain,
    fog,
  }));

  if (!ATMOSPHERE) return null;
  return (
    <Canvas onSize={size} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={ATMOSPHERE} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
