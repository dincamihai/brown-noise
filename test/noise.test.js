import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBrownNoise, lowPassFilter, equalPowerWeights, equalPowerCrossfade, encodeWav } from '../js/noise.js';

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

test('equalPowerWeights are unit power and correct at endpoints', () => {
  const { fadeIn, fadeOut } = equalPowerWeights(64);
  for (let i = 0; i < 64; i++) {
    const power = fadeIn[i] * fadeIn[i] + fadeOut[i] * fadeOut[i];
    assert.ok(Math.abs(power - 1) < 1e-6, `power not unit: ${power}`);
  }
  assert.ok(fadeIn[0] < 0.1 && fadeOut[0] > 0.9, 'should start mostly on the tail');
  assert.ok(fadeIn[63] > 0.9 && fadeOut[63] < 0.1, 'should end mostly on the head');
});

test('equalPowerCrossfade shortens buffer and copies steady region', () => {
  const L = 1000, f = 100;
  const s = new Float32Array(L);
  for (let i = 0; i < L; i++) s[i] = Math.sin(i * 0.01);
  const out = equalPowerCrossfade(s, f);
  assert.equal(out.length, L - f);
  for (let i = f; i < L - f; i++) assert.equal(out[i], s[i]);
});

test('equalPowerCrossfade reduces loop-boundary discontinuity', () => {
  const L = 1000, f = 100;
  // A sine with non-integer cycles over L => a naive loop has an audible jump.
  const s = new Float32Array(L);
  const freq = 5.5 / L;
  for (let i = 0; i < L; i++) s[i] = Math.sin(2 * Math.PI * freq * i);
  const naiveJump = Math.abs(s[0] - s[L - f - 1]); // loop the first L-f samples
  const out = equalPowerCrossfade(s, f);
  const xfadeJump = Math.abs(out[0] - out[out.length - 1]);
  assert.ok(xfadeJump < naiveJump, `xfade ${xfadeJump} should be < naive ${naiveJump}`);
});

test('equalPowerCrossfade rejects invalid fadeSamples', () => {
  const s = new Float32Array(100);
  assert.throws(() => equalPowerCrossfade(s, 51), RangeError);   // > half the buffer
  assert.throws(() => equalPowerCrossfade(s, -1), RangeError);
  assert.throws(() => equalPowerCrossfade(s, 10.5), RangeError);
  assert.equal(equalPowerCrossfade(s, 50).length, 50);           // exactly half is OK
});

test('encodeWav writes a valid 16-bit PCM mono header', () => {
  const s = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = encodeWav(s, 44100);
  assert.equal(wav.length, 44 + s.length * 2);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint16(20, true), 1);     // PCM format
  assert.equal(view.getUint16(22, true), 1);     // mono
  assert.equal(view.getUint32(24, true), 44100); // sample rate
  assert.equal(view.getUint16(34, true), 16);    // bits per sample
  assert.equal(view.getUint32(40, true), 10);     // data chunk size = 5 samples * 2
  assert.equal(view.getInt16(44, true), 0);       // 0 -> 0
  assert.equal(view.getInt16(50, true), 32767);   // 1 -> int16 max
  assert.equal(view.getInt16(52, true), -32768);  // -1 -> int16 min
});
