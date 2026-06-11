// js/noise.js — pure brown-noise synthesis. Runs in Node (tests) and browsers (ESM).

const DEFAULT_SAMPLE_RATE = 44100;

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
