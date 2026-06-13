// js/ui.js — wires controls to the engine + player. Browser only.
import { renderNoiseWav } from './noise.js';
import { Player } from './player.js';
import { loadSettings, saveSettings, sliderToCutoff, cutoffToSlider, clamp, CUTOFF_MIN, CUTOFF_MAX } from './settings.js';

const audioEl = document.getElementById('audio');
const playBtn = document.getElementById('play');
const volumeSlider = document.getElementById('volume');
const toneSlider = document.getElementById('tone');
const freqEl = document.getElementById('freq');

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

function reflectFreq() {
  freqEl.textContent = String(Math.round(settings.cutoffHz));
}

function applyCutoff(hz) {
  settings.cutoffHz = hz;
  toneSlider.value = String(cutoffToSlider(hz));
  reflectFreq();
  saveSettings(settings);
  clearTimeout(toneDebounce);
  toneDebounce = setTimeout(regenerate, 150);
}

// Nudge the cutoff by a whole number of Hz, clamped to the valid range. Steppers
// give exact control with no keyboard (which on phones covers the bottom readout).
function stepFreq(deltaHz) {
  applyCutoff(clamp(Math.round(settings.cutoffHz) + deltaHz, CUTOFF_MIN, CUTOFF_MAX));
}

function init() {
  volumeSlider.value = String(settings.volume);
  toneSlider.value = String(cutoffToSlider(settings.cutoffHz));
  player.setVolume(settings.volume);
  regenerate();
  reflectUi();
  reflectFreq();

  playBtn.addEventListener('click', async () => {
    if (player.isPlaying) player.pause();
    else await player.play().catch(() => {});
    reflectUi();
  });

  volumeSlider.addEventListener('input', () => {
    settings.volume = Number(volumeSlider.value);
    player.setVolume(settings.volume);
    saveSettings(settings);
  });

  toneSlider.addEventListener('input', () => {
    // Commit a whole number of Hz so the stored/audible cutoff always matches the
    // integer readout the user is watching (no sub-Hz float drift).
    settings.cutoffHz = clamp(Math.round(sliderToCutoff(Number(toneSlider.value))), CUTOFF_MIN, CUTOFF_MAX);
    reflectFreq();
    saveSettings(settings);
    clearTimeout(toneDebounce);
    toneDebounce = setTimeout(regenerate, 150);
  });

  toneSlider.addEventListener('change', () => {
    // On release, snap the thumb to the exact position of the committed integer Hz
    // so the final touch sample can't leave it a few Hz off from the readout.
    toneSlider.value = String(cutoffToSlider(settings.cutoffHz));
  });

  document.getElementById('freq-d10').addEventListener('click', () => stepFreq(-10));
  document.getElementById('freq-d1').addEventListener('click', () => stepFreq(-1));
  document.getElementById('freq-u1').addEventListener('click', () => stepFreq(1));
  document.getElementById('freq-u10').addEventListener('click', () => stepFreq(10));

  audioEl.addEventListener('play', reflectUi);
  audioEl.addEventListener('pause', reflectUi);
}

init();
