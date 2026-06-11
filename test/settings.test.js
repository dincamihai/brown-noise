import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sliderToCutoff, cutoffToSlider, clamp, normalizeSettings, loadSettings, saveSettings,
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

test('normalizeSettings rejects non-finite numbers', () => {
  assert.equal(normalizeSettings({ volume: NaN }).volume, SETTINGS_DEFAULTS.volume);
  assert.equal(normalizeSettings({ cutoffHz: Infinity }).cutoffHz, SETTINGS_DEFAULTS.cutoffHz);
});

test('loadSettings falls back to defaults on corrupted JSON', () => {
  globalThis.localStorage = { getItem: () => '{not json', setItem: () => {} };
  try {
    assert.deepEqual(loadSettings(), SETTINGS_DEFAULTS);
  } finally {
    delete globalThis.localStorage;
  }
});

test('loadSettings merges valid stored settings and saveSettings round-trips', () => {
  let stored = JSON.stringify({ volume: 0.3 });
  globalThis.localStorage = { getItem: () => stored, setItem: (k, v) => { stored = v; } };
  try {
    const s = loadSettings();
    assert.equal(s.volume, 0.3);
    assert.equal(s.cutoffHz, SETTINGS_DEFAULTS.cutoffHz);
    saveSettings({ volume: 2, cutoffHz: 50 });
    const reloaded = loadSettings();
    assert.equal(reloaded.volume, 1);          // clamped on save
    assert.equal(reloaded.cutoffHz, CUTOFF_MIN);
  } finally {
    delete globalThis.localStorage;
  }
});

test('loadSettings and saveSettings survive a throwing storage', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  try {
    assert.deepEqual(loadSettings(), SETTINGS_DEFAULTS);
    saveSettings({ volume: 0.5 }); // must not throw
  } finally {
    delete globalThis.localStorage;
  }
});
