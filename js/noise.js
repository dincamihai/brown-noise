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
