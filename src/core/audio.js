// Procedural audio via the Web Audio API — no sound files.
// Engine note tracks the car's rev, plus short synth SFX and a synthwave music bed.

import { Save } from './SaveManager.js';

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null; // { osc, sub, filter, gain }
    this.musicTimer = null;
    this.musicStep = 0;
    this.ready = false;
  }

  // Created lazily; browsers require a user gesture before audio can play.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.master);

    this.ready = true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- One-shot SFX -------------------------------------------------------
  sfx(name) {
    if (!this.ready || !Save.settings.sfx) return;
    const t = this.t;
    switch (name) {
      case 'click':
        this._blip(660, 0.06, 'square', 0.18, t);
        break;
      case 'select':
        this._blip(420, 0.05, 'square', 0.2, t);
        this._blip(840, 0.08, 'square', 0.16, t + 0.04);
        break;
      case 'back':
        this._blip(300, 0.08, 'square', 0.18, t);
        break;
      case 'cash':
        this._blip(880, 0.05, 'triangle', 0.22, t);
        this._blip(1320, 0.08, 'triangle', 0.2, t + 0.05);
        break;
      case 'fuel':
        this._blip(520, 0.07, 'sine', 0.25, t);
        this._blip(780, 0.1, 'sine', 0.2, t + 0.06);
        break;
      case 'crash':
        this._noise(0.25, 1200, 0.5, t);
        this._blip(110, 0.18, 'sawtooth', 0.3, t);
        break;
      case 'drift':
        this._noise(0.4, 2600, 0.12, t, 'bandpass');
        break;
      case 'combo':
        this._blip(720, 0.05, 'square', 0.18, t);
        this._blip(1080, 0.07, 'square', 0.16, t + 0.04);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          this._blip(f, 0.16, 'triangle', 0.24, t + i * 0.12),
        );
        break;
      case 'lose':
        [400, 320, 240, 160].forEach((f, i) =>
          this._blip(f, 0.2, 'sawtooth', 0.22, t + i * 0.14),
        );
        break;
      case 'purchase':
        this._blip(600, 0.05, 'square', 0.2, t);
        this._blip(900, 0.06, 'square', 0.2, t + 0.05);
        this._blip(1200, 0.1, 'square', 0.2, t + 0.1);
        break;
    }
  }

  _blip(freq, dur, type, vol, when) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  _noise(dur, cutoff, vol, when, filterType = 'lowpass') {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = cutoff;
    filt.Q.value = filterType === 'bandpass' ? 4 : 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  // ---- Engine (continuous) ------------------------------------------------
  startEngine() {
    if (!this.ready || this.engine) return;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    sub.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    gain.gain.value = 0.0;
    osc.frequency.value = 70;
    sub.frequency.value = 35;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    sub.start();
    this.engine = { osc, sub, filter, gain };
  }

  // rev: 0..1 overall engine load; slip: 0..1 wheelspin/drift adds grit.
  updateEngine(rev, slip = 0) {
    if (!this.engine || !Save.settings.sfx) {
      if (this.engine) this.engine.gain.gain.value = 0;
      return;
    }
    const e = this.engine;
    const base = 60 + rev * 240;
    e.osc.frequency.setTargetAtTime(base, this.t, 0.05);
    e.sub.frequency.setTargetAtTime(base * 0.5, this.t, 0.05);
    e.filter.frequency.setTargetAtTime(500 + rev * 1800 + slip * 1200, this.t, 0.05);
    e.gain.gain.setTargetAtTime(0.05 + rev * 0.12 + slip * 0.05, this.t, 0.05);
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    try {
      e.gain.gain.setTargetAtTime(0, this.t, 0.05);
      e.osc.stop(this.t + 0.3);
      e.sub.stop(this.t + 0.3);
    } catch (_) {}
    this.engine = null;
  }

  // ---- Music bed (simple synthwave arpeggio) ------------------------------
  startMusic() {
    if (!this.ready || this.musicTimer) return;
    this.musicGain.gain.setTargetAtTime(Save.settings.music ? 0.16 : 0, this.t, 0.5);
    // A minor-ish synthwave progression, one chord per bar.
    const chords = [
      [220.0, 261.63, 329.63], // Am
      [196.0, 246.94, 293.66], // G
      [174.61, 220.0, 261.63], // F
      [164.81, 207.65, 246.94], // E
    ];
    this.musicStep = 0;
    const stepMs = 220;
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
      const note = chord[this.musicStep % chord.length];
      this._musicNote(note * 2, 0.32);
      if (this.musicStep % 8 === 0) this._musicNote(chord[0] / 2, 1.6, 0.05); // bass
      this.musicStep++;
    }, stepMs);
  }

  _musicNote(freq, dur, vol = 0.09) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.t, 0.4);
  }

  refreshVolumes() {
    if (!this.ready) return;
    this.musicGain.gain.setTargetAtTime(Save.settings.music ? 0.16 : 0, this.t, 0.2);
  }
}

export const Audio = new AudioBus();
