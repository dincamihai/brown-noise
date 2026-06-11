# Brown Noise Sleep App — Design

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning

## Purpose

A web app that generates brown noise to help the user fall asleep. Used nightly on
a phone. Audio plays continuously until the user manually stops it — there is no
timer or auto-stop. The user can tune the sound from a deep rumble to a brighter
hiss. The app is an installable, offline-capable PWA.

## Core decisions

- **Use case:** sleep. Continuous playback, dark/dim UI, set-and-forget.
- **Generation:** brown noise is synthesized in-browser with the Web Audio API.
  No audio files are shipped — the sound is generated on the user's device.
- **Playback model:** plays indefinitely until manually stopped. No timer, no fade.
- **Customization:** play/pause, volume slider, and a tone/depth slider, with good
  defaults so it works well untouched.
- **Distribution:** installable PWA, offline-capable. Hosted on GitHub Pages —
  PWA install and service workers require HTTPS, and the nightly device is the
  user's phone (Android), which cannot use the localhost exemption. All asset
  paths are relative so subpath hosting (`user.github.io/repo/`) works.

## Key architectural decision: background playback

The app must keep playing after the phone screen locks. Pure real-time Web Audio
synthesis (an AudioWorklet generating samples continuously) is **suspended by the
OS when the screen locks or the app is backgrounded** — unacceptable for overnight
phone use. The OS only keeps audio alive in the background when it is treated as
**media playback**: an `<audio>` element with a `MediaSession`.

Therefore the app uses a **hybrid approach**:

1. **Synthesize** a brown-noise buffer in-browser with Web Audio (still zero shipped
   audio files — generated on-device).
2. Make the buffer **seamlessly loopable** by crossfading its tail into its head.
3. Export the buffer to a WAV `Blob` and play it through a **looping `<audio>`
   element + `MediaSession`**, which the OS keeps alive when the screen is locked
   and which provides lock-screen play/pause controls.

The tone/depth slider regenerates the buffer when changed (an occasional action);
volume adjusts the `<audio>` element directly. This keeps the "synthesize, no files"
property while guaranteeing reliable overnight background playback.

## Components

A small vanilla HTML/CSS/JS app — no framework, no build step — keeping the PWA
trivial and dependency-free. Four focused modules:

### `noise.js` — Noise engine
- Generates brown noise (white noise passed through a leaky integrator).
- Applies the tone/depth low-pass filter at a given cutoff.
- Crossfades the buffer's tail into its head (equal-power) for a seamless loop.
- Exports the result as a WAV `Blob`.
- Pure functions: parameters in, `Blob` out. No knowledge of the UI or playback.

### `player.js` — Playback controller
- Owns the `<audio>` element.
- Takes a blob URL; handles play / pause / loop and volume.
- Wires up `MediaSession` metadata and lock-screen play/pause action handlers.
- The only module that touches actual playback.

### `ui.js` — Controls + state
- Renders and handles the play/pause button, volume slider, tone/depth slider.
- Reads/writes settings to `localStorage`.
- On tone change, calls the engine to regenerate and tells the player to swap source.
- Owns visual state.

### PWA shell
- `manifest.json`: standalone display, dark theme color, app icons.
- `service-worker.js`: caches the app shell (HTML/CSS/JS/icons) for offline launch.
  No audio is cached — it is generated on-device.

## Data flow & behavior

- **On load:** read saved settings from `localStorage` (or defaults) → engine
  generates buffer → blob URL handed to player → UI renders **paused**, showing the
  saved tone/volume. Nothing plays until the first tap.
- **Tap play:** player starts the looping `<audio>`; MediaSession goes "playing";
  lock-screen controls appear. Plays indefinitely. The first tap also satisfies the
  browser's audio-autoplay gesture requirement.
- **Volume slider:** sets `audio.volume` directly — instant, no regeneration.
  (Target device is Android, where `audio.volume` is settable. On iOS Safari it
  is read-only; supporting iOS would require baking gain into the rendered
  buffer — explicitly out of scope.)
- **Tone/depth slider:** debounced (~150 ms after the user stops dragging) → engine
  regenerates the buffer at the new cutoff → player swaps the source and resumes at
  the same position and volume (smooth change, not a restart).
- **Tap pause** (or lock-screen pause): stops playback; settings are already persisted.

## Defaults & values

- **Tone/depth:** default to the deep, warm end — low-pass cutoff ~**500 Hz**.
  Slider range ~100 Hz → ~2 kHz.
- **Volume:** default ~**60%**.
- **Buffer length:** ~**30 s** with a ~**1 s** equal-power crossfade at the loop seam
  — long enough that the loop is imperceptible, short enough to regenerate quickly.
- Tone, volume, and last-used state are persisted to `localStorage`.

## Visual design

Dark, dim, minimal — built for a dark bedroom. Near-black background; one large
central play/pause button; two understated sliders (volume + tone) below it; no
chrome or clutter. Large touch targets. That is the entire screen.

## Testing & error handling

- **Engine** is pure functions and is unit-tested:
  - brown noise samples stay within [-1, 1],
  - the low-pass filter shifts spectral balance as cutoff changes,
  - the loop seam is continuous (no discontinuity across the crossfade).
- **Error handling:**
  - if the Web Audio API is unavailable, show a plain message,
  - if `localStorage` is blocked, fall back to in-memory defaults,
  - the first tap satisfies the autoplay gesture requirement.

## Out of scope (YAGNI)

- Sleep timer / auto-stop / fade-out.
- Multiple noise colors (white/pink), presets, mixing in other sounds.
- Accounts, sync, analytics.
