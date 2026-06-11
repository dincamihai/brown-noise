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
