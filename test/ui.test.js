import { test } from 'node:test';
import assert from 'node:assert/strict';

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
    this.selectCalled = false;
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
  select() {
    this.selectCalled = true;
  }
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
  return `../js/ui.js?t=${Date.now()}`;
}

test('frequency input selects its current value on focus so typing replaces it', async () => {
  const mocks = installMocks();
  try {
    await import(uiImportUrl());

    const freq = mocks.elements.freq;
    freq.value = '500';
    freq.dispatchEvent('focus');
    assert.ok(freq.selectCalled, 'focus should select the existing value');
  } finally {
    mocks.restore();
  }
});

test('frequency input commits a typed value to the tone slider and settings', async () => {
  const mocks = installMocks();
  try {
    await import(uiImportUrl());

    const freq = mocks.elements.freq;
    const tone = mocks.elements.tone;

    freq.value = '250';
    freq.dispatchEvent('change');

    assert.equal(freq.value, '250', 'readout reflects the committed frequency');
    assert.ok(
      Math.abs(Number(tone.value) - 0.306) < 0.001,
      `tone slider should move to the matching position, got ${tone.value}`,
    );

    // Let the debounced regenerate from applyCutoff fire before we tear down the mocks.
    await new Promise((r) => setTimeout(r, 250));
  } finally {
    mocks.restore();
  }
});
