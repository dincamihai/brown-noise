// js/noise.js — pure brown-noise synthesis. Runs in Node (tests) and browsers (ESM).

const DEFAULT_SAMPLE_RATE = 44100;

export const DEFAULTS = {
  sampleRate: 44100,
  durationSec: 30,
  fadeSec: 1,
  cutoffHz: 500,
  targetRms: 0.17, // 0.99/0.17 ≈ 5.8x crest headroom; measured worst-case crest ≈ 5.3
  peakCeiling: 0.99,
};

// Generate brown noise normalized to [-1, 1] (leaky-integrated white noise).
export function generateBrownNoise(numSamples) {
  const out = new Float32Array(numSamples);
  let last = 0;
  let max = 0;
  for (let i = 0; i < numSamples; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last;
    const a = Math.abs(last);
    if (a > max) max = a;
  }
  if (max > 0) {
    const gain = 0.99 / max; // normalize peak to just under full scale
    for (let i = 0; i < numSamples; i++) out[i] *= gain;
  }
  return out;
}

// One-pole low-pass filter. Lower cutoff => deeper/darker sound.
export function lowPassFilter(samples, cutoffHz, sampleRate = DEFAULT_SAMPLE_RATE) {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y = y + alpha * (samples[i] - y);
    out[i] = y;
  }
  return out;
}

// Equal-power crossfade weights of length f.
// fadeIn rises ~0->~1, fadeOut falls ~1->~0, with fadeIn^2 + fadeOut^2 === 1.
export function equalPowerWeights(f) {
  const fadeIn = new Float32Array(f);
  const fadeOut = new Float32Array(f);
  for (let i = 0; i < f; i++) {
    const angle = ((i + 0.5) / f) * (Math.PI / 2); // 0 .. pi/2
    fadeIn[i] = Math.sin(angle);
    fadeOut[i] = Math.cos(angle);
  }
  return { fadeIn, fadeOut };
}

// Make `samples` seamlessly loopable by crossfading its tail into its head.
// Returns a new Float32Array of length (samples.length - fadeSamples).
export function equalPowerCrossfade(samples, fadeSamples) {
  if (!Number.isInteger(fadeSamples) || fadeSamples < 0 || fadeSamples > samples.length / 2) {
    throw new RangeError(`fadeSamples must be an integer in [0, ${Math.floor(samples.length / 2)}], got ${fadeSamples}`);
  }
  const L = samples.length;
  const f = fadeSamples;
  const outLen = L - f;
  const out = new Float32Array(outLen);
  const { fadeIn, fadeOut } = equalPowerWeights(f);
  // Crossfade region: head (fading in) blended with the tail (fading out).
  for (let i = 0; i < f; i++) {
    out[i] = fadeIn[i] * samples[i] + fadeOut[i] * samples[outLen + i];
  }
  // Steady region: straight copy.
  for (let i = f; i < outLen; i++) {
    out[i] = samples[i];
  }
  return out;
}

// Scale to a consistent loudness (target RMS), capped so no sample exceeds
// peakCeiling. Consistent loudness across regenerations/tone settings, and
// guarantees encodeWav never hard-clips (e.g. in the crossfade region).
// Note: RMS is energy-consistent, not perceptually (equal-loudness) consistent — accepted for this app.
export function normalizeLoudness(samples, targetRms = DEFAULTS.targetRms, peakCeiling = DEFAULTS.peakCeiling) {
  let sumSq = 0;
  let peak = 0;
  for (const v of samples) {
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  const out = new Float32Array(samples.length);
  if (rms === 0 || peak === 0) return out;
  const gain = Math.min(targetRms / rms, peakCeiling / peak);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

// Full pipeline: generate -> low-pass -> seamless loop -> normalize -> WAV bytes.
export function renderNoiseWav({
  durationSec = DEFAULTS.durationSec,
  fadeSec = DEFAULTS.fadeSec,
  cutoffHz = DEFAULTS.cutoffHz,
  sampleRate = DEFAULTS.sampleRate,
} = {}) {
  const totalSamples = Math.round(durationSec * sampleRate);
  const fadeSamples = Math.round(fadeSec * sampleRate);
  const raw = generateBrownNoise(totalSamples);
  const filtered = lowPassFilter(raw, cutoffHz, sampleRate);
  const looped = equalPowerCrossfade(filtered, fadeSamples);
  const normalized = normalizeLoudness(looped);
  return encodeWav(normalized, sampleRate);
}

// Encode mono Float32 samples in [-1,1] as 16-bit PCM WAV. Returns Uint8Array.
export function encodeWav(samples, sampleRate = DEFAULT_SAMPLE_RATE) {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);   // fmt chunk size
  view.setUint16(20, 1, true);    // PCM
  view.setUint16(22, 1, true);    // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);   // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, s, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
