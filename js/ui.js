// js/ui.js — wires controls to the engine + player. Browser only.
import { renderNoiseWav } from './noise.js';
import { Player } from './player.js';
import { loadSettings, saveSettings, sliderToCutoff, cutoffToSlider, parseHz } from './settings.js';

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
  freqEl.value = String(Math.round(settings.cutoffHz));
}

function applyCutoff(hz) {
  settings.cutoffHz = hz;
  toneSlider.value = String(cutoffToSlider(hz));
  reflectFreq();
  saveSettings(settings);
  clearTimeout(toneDebounce);
  toneDebounce = setTimeout(regenerate, 150);
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
    settings.cutoffHz = sliderToCutoff(Number(toneSlider.value));
    reflectFreq();
    saveSettings(settings);
    clearTimeout(toneDebounce);
    toneDebounce = setTimeout(regenerate, 150);
  });

  freqEl.addEventListener('change', () => {
    const hz = parseHz(freqEl.value);
    if (hz === null) {
      reflectFreq(); // restore the current value on invalid input
      return;
    }
    applyCutoff(hz);
    freqEl.blur(); // dismiss the phone keyboard
  });

  freqEl.addEventListener('focus', () => {
    freqEl.select(); // select the current value so typing replaces it
  });

  audioEl.addEventListener('play', reflectUi);
  audioEl.addEventListener('pause', reflectUi);
}

init();
