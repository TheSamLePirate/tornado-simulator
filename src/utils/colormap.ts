import { Fn, float, mix, vec3 } from "three/tsl";

/**
 * Polynomial fits of matplotlib colormaps (Matt Zucker).
 * t is expected in [0, 1]; clamp before passing.
 *
 * https://www.shadertoy.com/view/WlfXRN
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export const viridisTSL = Fn(([t]: [any]) => {
  const c0 = vec3(0.2777273, 0.005407344, 0.3340998);
  const c1 = vec3(0.105093, 1.404613, 1.38459);
  const c2 = vec3(-0.3308618, 0.21484756, 0.0950951);
  const c3 = vec3(-4.6342306, -5.799101, -19.332441);
  const c4 = vec3(6.2282699, 14.179933, 56.690553);
  const c5 = vec3(4.776385, -13.745145, -65.353033);
  const c6 = vec3(-5.4354558, 4.6458526, 26.312435);
  return c0.add(
    t.mul(
      c1.add(
        t.mul(c2.add(t.mul(c3.add(t.mul(c4.add(t.mul(c5.add(t.mul(c6))))))))),
      ),
    ),
  );
});

export const plasmaTSL = Fn(([t]: [any]) => {
  const c0 = vec3(0.0588872, 0.0263456, 0.5333455);
  const c1 = vec3(2.176514, 0.236088, 0.835293);
  const c2 = vec3(-2.6894833, -7.4555314, 3.1108485);
  const c3 = vec3(6.130348, 42.34563, -28.51885);
  const c4 = vec3(-11.107826, -82.66631, 60.139274);
  const c5 = vec3(10.022586, 71.41384, -54.07514);
  const c6 = vec3(-3.6587897, -22.93153, 18.190716);
  return c0.add(
    t.mul(
      c1.add(
        t.mul(c2.add(t.mul(c3.add(t.mul(c4.add(t.mul(c5.add(t.mul(c6))))))))),
      ),
    ),
  );
});

export const magmaTSL = Fn(([t]: [any]) => {
  const c0 = vec3(-0.002136485, -0.0007799, -0.014083891);
  const c1 = vec3(0.2516605, 0.6775566, 2.494026);
  const c2 = vec3(8.353717, -3.5778247, 0.302864);
  const c3 = vec3(-27.66873, 14.264125, -13.649537);
  const c4 = vec3(52.17613, -27.943604, 12.943557);
  const c5 = vec3(-50.769798, 29.045943, 4.118758);
  const c6 = vec3(18.65571, -11.488186, -5.601961);
  return c0.add(
    t.mul(
      c1.add(
        t.mul(c2.add(t.mul(c3.add(t.mul(c4.add(t.mul(c5.add(t.mul(c6))))))))),
      ),
    ),
  );
});

/** Diverging colormap (RdBu reversed) for signed scalars in [-1, 1]. */
export const RdBuTSL = Fn(([t]: [any]) => {
  // remap [-1, 1] → [0, 1] then a manual blue-white-red ramp
  const u = t.mul(0.5).add(0.5).clamp(float(0), float(1));
  const blue = vec3(0.23, 0.299, 0.754);
  const white = vec3(0.95, 0.95, 0.95);
  const red = vec3(0.706, 0.016, 0.15);
  // Below 0.5: blue→white; above 0.5: white→red
  const t2 = u.sub(0.5).mul(2.0).abs();
  const sign = u.sub(0.5).sign();
  const target = sign.greaterThan(float(0)).select(red, blue);
  return mix(white, target, t2);
});
