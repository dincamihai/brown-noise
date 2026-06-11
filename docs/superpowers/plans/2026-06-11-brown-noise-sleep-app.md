# Brown Noise Sleep App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dark, installable PWA that synthesizes brown noise on-device and plays it in a seamless loop indefinitely for sleep, surviving phone screen-lock.

**Architecture:** Brown noise is synthesized in-browser into a seamlessly-loopable buffer, exported to a WAV blob, and played through a looping `<audio>` element + MediaSession so the OS keeps it alive when the screen locks. Pure synthesis/settings logic lives in Node-testable ES modules (`noise.js`, `settings.js`); browser-only wiring lives in `player.js` and `ui.js`. A service worker caches the app shell for offline launch.

**Tech Stack:** Vanilla HTML/CSS/JS ES modules, Web Audio API (synthesis only), `<audio>` + MediaSession (playback), `node:test` (unit tests), Python stdlib (icon generation). No framework, no build step, no runtime dependencies.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Project metadata, `test` + `serve` scripts, `"type": "module"` |
| `js/noise.js` | Pure brown-noise synthesis: generate → low-pass → seamless loop → WAV bytes |
| `js/settings.js` | Pure settings: defaults, slider↔cutoff mapping, clamping, localStorage I/O |
| `js/player.js` | Owns `<audio>` element + MediaSession; play/pause/volume/source-swap (browser only) |
| `js/ui.js` | Wires controls to engine + player; debounced regenerate; persistence (browser only) |
| `index.html` | App shell: play button, two sliders, audio element, SW registration |
| `styles.css` | Dark, dim, minimal styling |
| `manifest.json` | PWA manifest (standalone, dark, icons) |
| `service-worker.js` | Caches app shell for offline launch |
| `tools/make-icons.py` | Generates `icons/icon-192.png` + `icons/icon-512.png` (Python stdlib only) |
| `test/noise.test.js` | Unit tests for `noise.js` |
| `test/settings.test.js` | Unit tests for `settings.js` |

**Testing note:** `noise.js` and `settings.js` are pure ES modules with no browser globals at the top level, so they run under `node --test`. `player.js`/`ui.js`/`index.html`/`service-worker.js` require a real browser + audio + service-worker context and are verified manually (Task 11). This is an honest split — the synthesis and settings math (the parts most likely to be wrong) are fully unit-tested; the DOM/audio glue is manually verified.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "brown-noise",
  "version": "1.0.0",
  "description": "Brown noise for sleep.",
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8000"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: Verify Node can run the test runner**

Run: `node --test`
Expected: exits 0 with output like "tests 0 ... pass 0" (no test files yet — this just confirms the runner works).

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold brown noise project"
```

---

## Task 2: Brown noise generator

**Files:**
- Create: `js/noise.js`
- Create: `test/noise.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/noise.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/noise.test.js`
Expected: FAIL — cannot import `generateBrownNoise` (module/file not found).

- [ ] **Step 3: Write minimal implementation**

Create `js/noise.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/noise.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add js/noise.js test/noise.test.js
git commit -m "feat: add brown noise generator"
```

---

## Task 3: Low-pass (tone/depth) filter

**Files:**
- Modify: `js/noise.js`
- Modify: `test/noise.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/noise.test.js`:

```js
import { lowPassFilter } from '../js/noise.js';

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
  assert.ok(meanAbsDiff(lp) < meanAbsDiff(white),
    'low-passed signal should vary less between adjacent samples');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/noise.test.js`
Expected: FAIL — `lowPassFilter` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `js/noise.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/noise.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add js/noise.js test/noise.test.js
git commit -m "feat: add low-pass tone filter"
```

---

## Task 4: Seamless loop crossfade

**Files:**
- Modify: `js/noise.js`
- Modify: `test/noise.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/noise.test.js`:

```js
import { equalPowerWeights, equalPowerCrossfade } from '../js/noise.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/noise.test.js`
Expected: FAIL — `equalPowerWeights`/`equalPowerCrossfade` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `js/noise.js`:

```js
// Equal-power crossfade weights of length f.
// fadeIn rises 0->1, fadeOut falls 1->0, with fadeIn^2 + fadeOut^2 === 1.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/noise.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/noise.js test/noise.test.js
git commit -m "feat: add seamless loop crossfade"
```

---

## Task 5: WAV encoder

**Files:**
- Modify: `js/noise.js`
- Modify: `test/noise.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/noise.test.js`:

```js
import { encodeWav } from '../js/noise.js';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/noise.test.js`
Expected: FAIL — `encodeWav` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `js/noise.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/noise.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/noise.js test/noise.test.js
git commit -m "feat: add WAV encoder"
```

---

## Task 6: Render pipeline (compose the engine)

**Files:**
- Modify: `js/noise.js`
- Modify: `test/noise.test.js`

This task also resolves two code-review findings from Tasks 2 and 4 by adding a final `normalizeLoudness` stage: (a) equal-power crossfade of two peak-normalized regions can exceed full scale (measured up to ~1.16), which `encodeWav` would hard-clip into an audible thump at the loop seam; (b) per-render peak normalization makes loudness vary between regenerations and across tone settings. RMS-targeted gain with a peak ceiling fixes both.

- [ ] **Step 1: Write the failing test**

Add to `test/noise.test.js`:

```js
import { renderNoiseWav, normalizeLoudness, DEFAULTS } from '../js/noise.js';

test('normalizeLoudness hits target RMS without exceeding peak ceiling', () => {
  const s = new Float32Array(1000);
  for (let i = 0; i < s.length; i++) s[i] = Math.sin(i * 0.1) * 2; // loud input, peak 2
  const out = normalizeLoudness(s, 0.2, 0.99);
  let sumSq = 0, peak = 0;
  for (const v of out) { sumSq += v * v; peak = Math.max(peak, Math.abs(v)); }
  const rms = Math.sqrt(sumSq / out.length);
  assert.ok(peak <= 0.99 + 1e-6, `peak ${peak} exceeds ceiling`);
  assert.ok(Math.abs(rms - 0.2) < 0.01, `rms ${rms} should be ~0.2`);
});

test('normalizeLoudness returns silence for silent input', () => {
  const out = normalizeLoudness(new Float32Array(100), 0.2, 0.99);
  for (const v of out) assert.equal(v, 0);
});

test('renderNoiseWav returns a WAV of the expected looped length', () => {
  const sampleRate = 8000;
  const wav = renderNoiseWav({ durationSec: 2, fadeSec: 0.5, cutoffHz: 500, sampleRate });
  const loopSamples = Math.round(2 * sampleRate) - Math.round(0.5 * sampleRate);
  assert.equal(wav.length, 44 + loopSamples * 2);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
});

test('renderNoiseWav output never clips (no full-scale samples)', () => {
  const wav = renderNoiseWav({ durationSec: 2, fadeSec: 0.5, cutoffHz: 500, sampleRate: 8000 });
  const view = new DataView(wav.buffer);
  for (let off = 44; off < wav.length; off += 2) {
    const v = view.getInt16(off, true);
    assert.ok(Math.abs(v) <= 32500, `near-full-scale sample ${v} at byte ${off}`);
  }
});

test('DEFAULTS expose the sleep-tuned values', () => {
  assert.equal(DEFAULTS.cutoffHz, 500);
  assert.equal(DEFAULTS.durationSec, 30);
  assert.equal(DEFAULTS.fadeSec, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/noise.test.js`
Expected: FAIL — `renderNoiseWav`/`normalizeLoudness`/`DEFAULTS` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `js/noise.js`:

```js
export const DEFAULTS = {
  sampleRate: 44100,
  durationSec: 30,
  fadeSec: 1,
  cutoffHz: 500,
  targetRms: 0.17, // 0.99/0.17 ≈ 5.8x crest headroom; measured worst-case crest ≈ 5.3
  peakCeiling: 0.99,
};

// Scale to a consistent loudness (target RMS), capped so no sample exceeds
// peakCeiling. Consistent loudness across regenerations/tone settings, and
// guarantees encodeWav never hard-clips (e.g. in the crossfade region).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/noise.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add js/noise.js test/noise.test.js
git commit -m "feat: compose brown noise render pipeline"
```

---

## Task 7: Settings module

**Files:**
- Create: `js/settings.js`
- Create: `test/settings.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/settings.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/settings.test.js`
Expected: FAIL — module `../js/settings.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/settings.js`:

```js
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
    volume: clamp(typeof r.volume === 'number' ? r.volume : SETTINGS_DEFAULTS.volume, 0, 1),
    cutoffHz: clamp(
      typeof r.cutoffHz === 'number' ? r.cutoffHz : SETTINGS_DEFAULTS.cutoffHz,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/settings.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS (13 tests across both files).

- [ ] **Step 6: Commit**

```bash
git add js/settings.js test/settings.test.js
git commit -m "feat: add settings module"
```

---

## Task 8: Playback controller

**Files:**
- Create: `js/player.js`

This module owns the `<audio>` element and MediaSession. It is browser-only and verified manually in Task 11 (it needs real audio + `navigator.mediaSession`, which `node:test` cannot provide).

- [ ] **Step 1: Write the implementation**

Create `js/player.js`:

```js
// js/player.js — owns the <audio> element + MediaSession. Browser only.

export class Player {
  constructor(audioEl) {
    this.audio = audioEl;
    this.audio.loop = true;
    this._url = null;
    this._setupMediaSession();
  }

  // Swap the audio source to new WAV bytes, preserving position + play state.
  setSource(wavBytes) {
    const wasPlaying = !this.audio.paused;
    const position = this.audio.currentTime || 0;
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const previous = this._url;
    this.audio.src = url;
    this._url = url;
    this.audio.load();
    const restore = () => {
      const d = this.audio.duration;
      if (Number.isFinite(d) && d > 0) this.audio.currentTime = position % d;
      if (wasPlaying) this.audio.play().catch(() => {});
      if (previous) URL.revokeObjectURL(previous);
      this.audio.removeEventListener('loadedmetadata', restore);
    };
    this.audio.addEventListener('loadedmetadata', restore);
  }

  setVolume(v) {
    this.audio.volume = v;
  }

  async play() {
    await this.audio.play();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  pause() {
    this.audio.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  get isPlaying() {
    return !this.audio.paused;
  }

  _setupMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Brown Noise',
      artist: 'Sleep',
    });
    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
  }
}
```

- [ ] **Step 2: Sanity-check the file parses**

Run: `node --check js/player.js`
Expected: no output, exit 0 (syntax valid). Full behavior is verified in Task 11.

- [ ] **Step 3: Commit**

```bash
git add js/player.js
git commit -m "feat: add playback controller"
```

---

## Task 9: UI wiring, HTML shell, and styles

**Files:**
- Create: `js/ui.js`
- Create: `index.html`
- Create: `styles.css`
- Create: `fonts/press-start-2p.woff2` (downloaded)

Visual direction (user-requested): retro pixel / warm CRT amber nostalgia, kept dim for a dark bedroom. Pixel font is self-hosted for offline use. No border-radius anywhere; chunky square borders; subtle darkening scanlines.

Accepted trade-off (from Task 6 review): `renderNoiseWav` blocks the main thread ~150–300 ms on a phone per call. It runs once at load and once per tone-slider settle (debounced) — a rare, set-once action — so we accept the brief hitch rather than adding a Web Worker. Volume changes never regenerate.

- [ ] **Step 0: Download the pixel font (OFL-licensed Press Start 2P)**

```bash
mkdir -p fonts
URL=$(curl -s -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Press+Start+2P" | grep -o 'https://[^)]*\.woff2' | head -1)
curl -sL -o fonts/press-start-2p.woff2 "$URL"
file fonts/press-start-2p.woff2
```
Expected: `Web Open Font Format (Version 2)`. If the network is unavailable, skip — the CSS falls back to monospace; report it as a concern.

- [ ] **Step 1: Create `js/ui.js`**

```js
// js/ui.js — wires controls to the engine + player. Browser only.
import { renderNoiseWav } from './noise.js';
import { Player } from './player.js';
import { loadSettings, saveSettings, sliderToCutoff, cutoffToSlider } from './settings.js';

const audioEl = document.getElementById('audio');
const playBtn = document.getElementById('play');
const volumeSlider = document.getElementById('volume');
const toneSlider = document.getElementById('tone');

const player = new Player(audioEl);
let settings = loadSettings();
let toneDebounce = null;

function regenerate() {
  player.setSource(renderNoiseWav({ cutoffHz: settings.cutoffHz }));
}

function reflectUi() {
  const playing = player.isPlaying;
  playBtn.textContent = playing ? 'PAUSE' : 'PLAY'; // text labels render in the pixel font
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function init() {
  volumeSlider.value = String(settings.volume);
  toneSlider.value = String(cutoffToSlider(settings.cutoffHz));
  player.setVolume(settings.volume);
  regenerate();
  reflectUi();

  playBtn.addEventListener('click', async () => {
    if (player.isPlaying) player.pause();
    else await player.play();
    reflectUi();
  });

  volumeSlider.addEventListener('input', () => {
    settings.volume = Number(volumeSlider.value);
    player.setVolume(settings.volume);
    saveSettings(settings);
  });

  toneSlider.addEventListener('input', () => {
    settings.cutoffHz = sliderToCutoff(Number(toneSlider.value));
    saveSettings(settings);
    clearTimeout(toneDebounce);
    toneDebounce = setTimeout(regenerate, 150);
  });

  audioEl.addEventListener('play', reflectUi);
  audioEl.addEventListener('pause', reflectUi);
}

init();
```

- [ ] **Step 2: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0805" />
  <title>Brown Noise</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="apple-touch-icon" href="icons/icon-192.png" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main>
    <h1 class="title">Brown Noise</h1>
    <button id="play" class="play" aria-label="Play">PLAY</button>
    <div class="controls">
      <label class="control">
        <span>Volume</span>
        <input id="volume" type="range" min="0" max="1" step="0.01" />
      </label>
      <label class="control">
        <span>Tone</span>
        <input id="tone" type="range" min="0" max="1" step="0.01" />
      </label>
    </div>
  </main>
  <audio id="audio" loop></audio>
  <script type="module" src="js/ui.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js');
      });
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Create `styles.css`** (retro warm-CRT-amber pixel theme, dim for night use)

```css
@font-face {
  font-family: 'Press Start 2P';
  src: url('fonts/press-start-2p.woff2') format('woff2');
  font-display: swap;
}

:root {
  --bg: #0a0805;
  --amber: #c8862e;
  --amber-dim: #7a5520;
  --bezel: #241809;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--amber);
  font-family: 'Press Start 2P', monospace;
}

/* Subtle CRT scanlines — darkening only, no glow, bedroom-safe. */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0, transparent 3px,
    rgba(0, 0, 0, 0.25) 3px, rgba(0, 0, 0, 0.25) 4px
  );
}

main {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rem;
  padding: 2rem;
  padding-bottom: max(2rem, env(safe-area-inset-bottom));
}

.title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: normal;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--amber-dim);
}

.play {
  min-width: 11rem;
  padding: 2rem 1.5rem;
  border: 4px solid var(--amber-dim);
  border-radius: 0;
  background: var(--bezel);
  color: var(--amber);
  font: inherit;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  box-shadow: 0 0 0 4px var(--bg), 0 0 0 8px var(--bezel);
}

.play:active { transform: translate(2px, 2px); }

.controls {
  width: 100%;
  max-width: 22rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--amber-dim);
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2.5rem;
  background: transparent;
}

input[type="range"]::-webkit-slider-runnable-track {
  height: 8px;
  background: var(--bezel);
  border: 2px solid var(--amber-dim);
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  margin-top: -10px;
  background: var(--amber);
  border: 0;
  border-radius: 0;
}

input[type="range"]::-moz-range-track {
  height: 8px;
  background: var(--bezel);
  border: 2px solid var(--amber-dim);
}

input[type="range"]::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: var(--amber);
  border: 0;
  border-radius: 0;
}
```

- [ ] **Step 4: Sanity-check the JS parses**

Run: `node --check js/ui.js`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js index.html styles.css fonts/press-start-2p.woff2
git commit -m "feat: add UI wiring, HTML shell, and retro CRT styles"
```

---

## Task 10: PWA manifest, icons, and service worker

**Files:**
- Create: `tools/make-icons.py`
- Create: `icons/icon-192.png` (generated)
- Create: `icons/icon-512.png` (generated)
- Create: `manifest.json`
- Create: `service-worker.js`

- [ ] **Step 1: Create `tools/make-icons.py`**

```python
#!/usr/bin/env python3
"""Generate PWA icons (dark square with a warm circle) using only the stdlib."""
import zlib
import struct
import os


def make_png(path, size, bg, fg):
    cx = cy = size / 2
    r = size * 0.28
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter type 0 (None) per scanline
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            inside = (dx * dx + dy * dy) <= r * r
            raw += bytes(fg if inside else bg)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    os.makedirs("icons", exist_ok=True)
    bg = (10, 8, 5)       # near-black warm
    fg = (200, 134, 46)   # CRT amber
    make_png("icons/icon-192.png", 192, bg, fg)
    make_png("icons/icon-512.png", 512, bg, fg)
    print("icons written")
```

- [ ] **Step 2: Generate the icons**

Run: `python3 tools/make-icons.py`
Expected: prints `icons written`; creates `icons/icon-192.png` and `icons/icon-512.png`.

- [ ] **Step 3: Verify the icons are valid PNGs**

Run: `file icons/icon-192.png icons/icon-512.png`
Expected: both reported as `PNG image data`, 192x192 and 512x512 respectively.

- [ ] **Step 4: Create `manifest.json`**

```json
{
  "name": "Brown Noise",
  "short_name": "Brown Noise",
  "description": "Brown noise for sleep.",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0a0805",
  "theme_color": "#0a0805",
  "orientation": "portrait",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 5: Create `service-worker.js`**

```js
const CACHE = 'brown-noise-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/ui.js',
  './js/noise.js',
  './js/player.js',
  './js/settings.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/press-start-2p.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
```

- [ ] **Step 6: Commit**

```bash
git add tools/make-icons.py icons/icon-192.png icons/icon-512.png manifest.json service-worker.js
git commit -m "feat: add PWA manifest, icons, and service worker"
```

---

## Task 11: End-to-end manual verification

**Files:** none (verification only)

These steps cover the browser-only behavior that unit tests cannot reach. Use a phone on the same network (or Chrome DevTools device mode) for the lock-screen checks.

- [ ] **Step 1: Serve the app**

Run: `npm run serve`
Expected: `Serving HTTP on 0.0.0.0 port 8000`. Open `http://localhost:8000`.

- [ ] **Step 2: Basic playback**

Tap the play button. Expected: brown noise starts within ~1s; button shows the pause glyph. Tap again: audio stops; button shows the play glyph.

- [ ] **Step 3: Volume + tone**

Drag Volume: loudness changes immediately with no audio gap. Drag Tone toward the low end: sound gets deeper/rumblier; toward the high end: brighter/hissier. Changing tone briefly re-renders (~150ms after release) and resumes without a restart.

- [ ] **Step 4: Seamless loop**

Leave it playing for at least 60s (longer than the 30s buffer). Expected: no audible click, pop, or repeating seam at the loop boundary.

- [ ] **Step 5: Persistence**

Set a distinct volume + tone, reload the page. Expected: sliders restore to the chosen values; the app loads in the paused state.

- [ ] **Step 6: PWA install + offline**

In Chrome, confirm the install prompt/icon appears (DevTools → Application → Manifest shows no errors and the icons render). Install it. Then in DevTools → Network, set "Offline" and reload the installed app. Expected: it still loads and plays (app shell served from cache; audio is generated on-device).

- [ ] **Step 7: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "chore: manual verification pass"
```

Note: the phone-only checks (PWA install on device, lock-screen playback) happen in Task 12 after deployment — the phone needs an HTTPS URL.

---

## Task 12: Deploy to GitHub Pages + on-device verification

**Files:** none new (deployment + verification)

PWA install and service workers require HTTPS; the target device is the user's Android phone, so the app must be hosted. GitHub Pages serves the repo as static files over HTTPS — no build step needed. All asset paths in the app are already relative, so subpath hosting (`<user>.github.io/brown-noise/`) works.

- [ ] **Step 1: Create the GitHub repo and push**

Run:
```bash
gh repo create brown-noise --public --source . --push
```
Expected: repo created and `main` pushed. (If `gh` is not authenticated, run `gh auth login` first — this needs the user.)

- [ ] **Step 2: Enable GitHub Pages from the main branch root**

Run:
```bash
gh api repos/{owner}/brown-noise/pages -X POST \
  -f "source[branch]=main" -f "source[path]=/"
```
Expected: HTTP 201. Then get the URL:
```bash
gh api repos/{owner}/brown-noise/pages --jq .html_url
```
Expected: `https://<user>.github.io/brown-noise/`. The first deploy can take a minute or two; poll the URL until it returns the app.

- [ ] **Step 3: Verify over HTTPS in a desktop browser**

Open the Pages URL. Expected: app loads, plays, manifest shows no errors in DevTools → Application (icons render, no console errors about the service worker).

- [ ] **Step 4: Install on the Android phone**

Open the Pages URL in Chrome on the phone. Expected: "Add to Home screen" / install prompt available. Install; the app launches standalone (no browser chrome) with the dark theme.

- [ ] **Step 5: Lock-screen playback (the critical check)**

In the installed app: start playback, then lock the screen. Expected: audio keeps playing; the lock screen shows media controls titled "Brown Noise" with a working pause button. This is the core requirement — if audio stops on lock, the playback architecture needs revisiting before shipping.

- [ ] **Step 6: Volume slider on device**

While playing on the phone, drag the Volume slider. Expected: loudness changes (Android Chrome supports programmatic `audio.volume`; this is why the target platform mattered).

- [ ] **Step 7: Offline launch on device**

Enable airplane mode, relaunch the installed app. Expected: it loads and plays — the shell comes from the service worker cache and the audio is generated on-device.

---

## Self-Review

**Spec coverage:**
- Sleep use case, plays indefinitely (no timer) → Task 8/9 (no timer code anywhere); manual Step 2/7. ✓
- Web Audio synthesis, no shipped files → Task 2–6 generate on-device; Task 10 service worker caches no audio. ✓
- Hybrid background playback (`<audio>` + MediaSession) → Task 8; verified Task 11 Step 7. ✓
- Seamless loop crossfade → Task 4; verified Task 11 Step 4. ✓
- Volume + tone slider with good defaults (cutoff 500Hz, volume 0.6) → Task 6 `DEFAULTS`, Task 7 `SETTINGS_DEFAULTS`, Task 9 UI. ✓
- Debounced regenerate on tone change, instant volume → Task 9 `ui.js`. ✓
- localStorage persistence + fallbacks → Task 7; verified Task 11 Step 5. ✓
- Dark minimal UI → Task 9 `styles.css`. ✓
- Installable, offline PWA → Task 10; verified Task 11 Step 6 (desktop) and Task 12 Steps 4/7 (on device). ✓
- HTTPS hosting on GitHub Pages → Task 12. ✓
- Error handling (no Web Audio / blocked storage / autoplay gesture) → settings fallback in Task 7; first-tap gesture in Task 9 (`play()` on click). ✓
- Engine unit tests (range, filter, loop seam) → Task 2–6. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete content. ✓

**Type consistency:** `renderNoiseWav`, `DEFAULTS`, `generateBrownNoise`, `lowPassFilter`, `equalPowerWeights`, `equalPowerCrossfade`, `encodeWav` exported by `noise.js` and consumed consistently. `Player` class methods (`setSource`, `setVolume`, `play`, `pause`, `isPlaying`) match `ui.js` usage. `settings.js` exports (`loadSettings`, `saveSettings`, `sliderToCutoff`, `cutoffToSlider`, `normalizeSettings`, `clamp`, `SETTINGS_DEFAULTS`, `CUTOFF_MIN`, `CUTOFF_MAX`) match consumers. ✓

**Note on Web Audio:** the engine never instantiates an `AudioContext` — synthesis is plain math over `Float32Array`, played via `<audio>`. This is intentional (the design's background-playback decision) and means no `AudioContext` resume handling is needed.
