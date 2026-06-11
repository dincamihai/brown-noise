// js/player.js — owns the <audio> element + MediaSession. Browser only.

export class Player {
  constructor(audioEl) {
    this.audio = audioEl;
    this.audio.loop = true;
    this._url = null;
    this._setupMediaSession();
    this.audio.addEventListener('play', () => this._syncPlaybackState());
    this.audio.addEventListener('pause', () => this._syncPlaybackState());
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
  }

  pause() {
    this.audio.pause();
  }

  get isPlaying() {
    return !this.audio.paused;
  }

  // Keep the lock-screen state truthful even when Android pauses us
  // externally (audio-focus loss: phone call, another app playing).
  _syncPlaybackState() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing';
    }
  }

  _setupMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Brown Noise',
      artist: 'Sleep',
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.setActionHandler('play', () => this.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
  }
}
