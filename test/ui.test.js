import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliderToCutoff, cutoffToSlider } from '../js/settings.js';

// A minimal DOM/Navigator stub so the browser-only ui.js module can load under Node.
class MockEventTarget {
  constructor() {
    this._listeners = {};
  }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  dispatchEvent(type, event) {
    for (const fn of this._listeners[type] || []) fn(event);
  }
}

class MockElement extends MockEventTarget {
  constructor(tag, attrs = {}) {
    super();
    this.tagName = tag;
    this.id = attrs.id;
    this._value = '';
    this.textContent = '';
    this.ariaLabel = '';
    this.paused = true;
    this.currentTime = 0;
    this.volume = 1;
    this.loop = false;
    this.src = '';
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
  }
  load() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  blur() {}
  getAttribute() {
    return null;
  }
  setAttribute(k, v) {
    if (k === 'aria-label') this.ariaLabel = v;
  }
}

function installMocks() {
  const elements = {};
  const getElementById = (id) => {
    if (!elements[id]) elements[id] = new MockElement('input', { id });
    return elements[id];
  };

  const document = { getElementById };
  const navigator = {
    mediaSession: {
      metadata: null,
      playbackState: '',
      setActionHandler() {},
    },
  };
  const localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };

  const saved = {};
  const define = (name, value) => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, name);
    saved[name] = desc;
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  };

  define('document', document);
  define('navigator', navigator);
  define('localStorage', localStorage);
  define('MediaMetadata', function (o) {
    return o;
  });

  return {
    elements,
    restore() {
      for (const [name, desc] of Object.entries(saved)) {
        if (desc) Object.defineProperty(globalThis, name, desc);
        else delete globalThis[name];
      }
      if (!('MediaMetadata' in saved)) delete globalThis.MediaMetadata;
    },
  };
}

// A fresh import URL so each test gets its own ui.js instance against its own mock DOM.
function uiImportUrl() {
  return `../js/ui.js?t=${Date.now()}-${Math.random()}`;
}

// Default cutoff is 500 Hz (SETTINGS_DEFAULTS) when localStorage is empty.
test('+1 / +10 buttons raise the frequency by exactly that many Hz (no keyboard)', async () => {
  const mocks = installMocks();
  try {
    await import(uiImportUrl());
    const freq = mocks.elements.freq;
    const tone = mocks.elements.tone;

    assert.equal(freq.textContent, '500', 'readout starts at the 500 Hz default');

    mocks.elements['freq-u1'].dispatchEvent('click');
    assert.equal(freq.textContent, '501', '+1 raises by 1 Hz');

    mocks.elements['freq-u10'].dispatchEvent('click');
    assert.equal(freq.textContent, '511', '+10 raises by 10 Hz');

    // Slider thumb tracks the exact integer Hz.
    assert.ok(
      Math.abs(Number(tone.value) - cutoffToSlider(511)) < 1e-9,
      'tone slider repositions to the committed integer Hz',
    );
  } finally {
    mocks.restore();
  }
});

test('-1 / -10 buttons lower the frequency by exactly that many Hz', async () => {
  const mocks = installMocks();
  try {
    await import(uiImportUrl());
    const freq = mocks.elements.freq;

    mocks.elements['freq-d1'].dispatchEvent('click');
    assert.equal(freq.textContent, '499', '-1 lowers by 1 Hz');

    mocks.elements['freq-d10'].dispatchEvent('click');
    assert.equal(freq.textContent, '489', '-10 lowers by 10 Hz');
  } finally {
    mocks.restore();
  }
});

test('stepping is clamped to the 100-2000 Hz range', async () => {
  const mocks = installMocks();
  try {
    await import(uiImportUrl());
    const freq = mocks.elements.freq;
    const tone = mocks.elements.tone;

    // Drive to the top via the slider, then try to overshoot.
    tone.value = '1';
    tone.dispatchEvent('input');
    assert.equal(freq.textContent, '2000', 'slider max maps to 2000 Hz');
    mocks.elements['freq-u10'].dispatchEvent('click');
    assert.equal(freq.textContent, '2000', '+10 cannot exceed the 2000 Hz ceiling');

    // Drive to the bottom, then try to undershoot.
    tone.value = '0';
    tone.dispatchEvent('input');
    assert.equal(freq.textContent, '100', 'slider min maps to 100 Hz');
    mocks.elements['freq-d10'].dispatchEvent('click');
    assert.equal(freq.textContent, '100', '-10 cannot go below the 100 Hz floor');
  } finally {
    mocks.restore();
  }
});

test('tone slider commits an integer Hz and snaps the thumb on release (no few-Hz jump)', async () => {
  const mocks = installMocks();
  try {
    await import(uiImportUrl());
    const freq = mocks.elements.freq;
    const tone = mocks.elements.tone;

    // Mid-drag: a raw slider position commits as a rounded integer Hz.
    const raw = 0.5123456;
    tone.value = String(raw);
    tone.dispatchEvent('input');
    const committed = Number(freq.textContent);
    assert.ok(Number.isInteger(committed), 'readout is a whole number of Hz');
    assert.equal(committed, Math.round(sliderToCutoff(raw)), 'commits the rounded cutoff');

    // Release: thumb snaps to the exact position of the committed integer Hz, so
    // lifting the finger cannot leave the value a few Hz off from the readout.
    tone.dispatchEvent('change');
    assert.ok(
      Math.abs(Number(tone.value) - cutoffToSlider(committed)) < 1e-9,
      'on release the thumb is repositioned to the committed integer Hz',
    );
  } finally {
    mocks.restore();
  }
});
