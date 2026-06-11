// js/settings.js — pure settings helpers + persistence.

export const SETTINGS_DEFAULTS = {
  volume: 0.6,   // 0..1
  cutoffHz: 500, // tone/depth (Hz)
};

export const CUTOFF_MIN = 100;
export const CUTOFF_MAX = 2000;
const STORAGE_KEY = 'brown-noise-settings';

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Map a 0..1 slider position to a cutoff in Hz on a log scale.
export function sliderToCutoff(slider) {
  const t = clamp(slider, 0, 1);
  const logMin = Math.log(CUTOFF_MIN);
  const logMax = Math.log(CUTOFF_MAX);
  return Math.exp(logMin + t * (logMax - logMin));
}

// Inverse of sliderToCutoff: cutoff in Hz back to a 0..1 slider position.
export function cutoffToSlider(hz) {
  const c = clamp(hz, CUTOFF_MIN, CUTOFF_MAX);
  const logMin = Math.log(CUTOFF_MIN);
  const logMax = Math.log(CUTOFF_MAX);
  return (Math.log(c) - logMin) / (logMax - logMin);
}

// Merge stored partial settings with defaults, clamping to valid ranges.
export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    volume: clamp(Number.isFinite(r.volume) ? r.volume : SETTINGS_DEFAULTS.volume, 0, 1),
    cutoffHz: clamp(
      Number.isFinite(r.cutoffHz) ? r.cutoffHz : SETTINGS_DEFAULTS.cutoffHz,
      CUTOFF_MIN, CUTOFF_MAX,
    ),
  };
}

// Persistence (browser only; guarded so Node/tests + private mode don't throw).
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    /* ignore: storage blocked / private mode */
  }
}

// Format a cutoff for the corner readout, e.g. 447.2 -> "447 HZ".
export function formatHz(hz) {
  return `${Math.round(hz)} HZ`;
}
