import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sliderToCutoff, cutoffToSlider, clamp, normalizeSettings,
  SETTINGS_DEFAULTS, CUTOFF_MIN, CUTOFF_MAX,
} from '../js/settings.js';

test('sliderToCutoff maps endpoints to the cutoff range', () => {
  assert.ok(Math.abs(sliderToCutoff(0) - CUTOFF_MIN) < 1e-6);
  assert.ok(Math.abs(sliderToCutoff(1) - CUTOFF_MAX) < 1e-6);
});

test('sliderToCutoff is monotonic increasing', () => {
  assert.ok(sliderToCutoff(0.25) < sliderToCutoff(0.75));
});

test('cutoffToSlider inverts sliderToCutoff', () => {
  for (const t of [0, 0.3, 0.5, 0.8, 1]) {
    assert.ok(Math.abs(cutoffToSlider(sliderToCutoff(t)) - t) < 1e-6, `roundtrip ${t}`);
  }
});

test('clamp bounds values', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('normalizeSettings fills defaults and clamps', () => {
  assert.deepEqual(normalizeSettings(null), SETTINGS_DEFAULTS);
  assert.equal(normalizeSettings({ volume: 5 }).volume, 1);
  assert.equal(normalizeSettings({ cutoffHz: 50 }).cutoffHz, CUTOFF_MIN);
  assert.equal(normalizeSettings({ cutoffHz: 9000 }).cutoffHz, CUTOFF_MAX);
});
