// Shared "visual compression" mapping (spec §4.2). The true cylinder stroke
// (x1≈0.5m .. x3≈3.5m by default) is compressed onto a ~1.6m stage unless
// TRUE_SCALE is enabled. Every module that positions something along the
// cylinder axis (piston, rod, particles, dimension lines) must go through
// this single function so the mapping never drifts.
export const VISUAL_COMPRESSION = 0.35;

export function visualX(xReal, x1Real, trueScale) {
  if (trueScale) return xReal;
  return x1Real + (xReal - x1Real) * VISUAL_COMPRESSION;
}
