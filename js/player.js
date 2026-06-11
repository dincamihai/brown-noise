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
