import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBrownNoise, lowPassFilter } from '../js/noise.js';

test('generateBrownNoise returns correct length within [-1,1] and not all zero', () => {
  const s = generateBrownNoise(10000);
  assert.equal(s.length, 10000);
  let nonZero = false;
  for (const v of s) {
    assert.ok(v >= -1 && v <= 1, `sample out of range: ${v}`);
    if (v !== 0) nonZero = true;
  }
  assert.ok(nonZero, 'expected some non-zero samples');
});

function meanAbsDiff(s) {
  let sum = 0;
  for (let i = 1; i < s.length; i++) sum += Math.abs(s[i] - s[i - 1]);
  return sum / (s.length - 1);
}

test('lowPassFilter reduces high-frequency content', () => {
  // Deterministic pseudo-white noise (no Math.random, for a stable assertion).
  const white = new Float32Array(20000);
  let seed = 1;
  for (let i = 0; i < white.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    white[i] = seed / 0x3fffffff - 1;
  }
  const lp = lowPassFilter(white, 200, 44100);
  assert.ok(meanAbsDiff(lp) < 0.1 * meanAbsDiff(white),
    'low-passed signal should vary far less between adjacent samples');
  let peak = 0;
  for (const v of lp) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 0.05, 'filter should pass low frequencies, not just attenuate everything');
});
