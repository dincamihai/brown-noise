import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBrownNoise } from '../js/noise.js';

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
