// Shared color language (spec §8). One temperature->color function used by
// gas haze, particles, thermometer and the graphs alike.

const TEMP_STOPS = [
  { t: 300, hex: 0x2E86DE },
  { t: 375, hex: 0x5AA9E6 },
  { t: 450, hex: 0xF5D547 },
  { t: 525, hex: 0xF28C38 },
  { t: 600, hex: 0xFF4B2B },
];

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function rgbToHexStr([r, g, b]) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Returns [r,g,b] 0-255 for arbitrary T, clamped & remapped onto the stop range. */
export function tempToRgb(T, THmin = 300, THmax = 600) {
  const stops = TEMP_STOPS;
  const lo = stops[0].t, hi = stops[stops.length - 1].t;
  const tt = Math.max(lo, Math.min(hi, lo + (T - THmin) / (THmax - THmin) * (hi - lo)));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (tt >= a.t && tt <= b.t) {
      const f = (tt - a.t) / (b.t - a.t);
      return lerpRgb(hexToRgb(a.hex), hexToRgb(b.hex), f);
    }
  }
  return hexToRgb(stops[stops.length - 1].hex);
}

export function tempToCss(T, THmin, THmax) {
  return rgbToHexStr(tempToRgb(T, THmin, THmax));
}

export function tempToHexInt(T, THmin, THmax) {
  const [r, g, b] = tempToRgb(T, THmin, THmax).map(v => Math.round(v));
  return (r << 16) | (g << 8) | b;
}

export const PROCESS_COLOR = {
  A: '#FF4B2B', B: '#8E44AD', C: '#2E86DE', D: '#16A085',
};
export const PROCESS_COLOR_BY_INDEX = ['A', 'B', 'C', 'D'].map(k => PROCESS_COLOR[k]);
export const PROCESS_NAME = ['Isothermal expansion (A)', 'Adiabatic expansion (B)', 'Isothermal compression (C)', 'Adiabatic compression (D)'];

export const COLORBLIND_PROCESS_COLOR_BY_INDEX = ['#D55E00', '#CC79A7', '#0072B2', '#009E73'];

export const GOLD = '#F5D547';
