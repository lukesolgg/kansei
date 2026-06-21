// Procedural audio via the Web Audio API — no sound files.
// A reactive JDM engine model (gear bands, turbo spool, blow-off, tire squeal),
// short synth SFX, and a layered synthwave music bed with a reactive lead.

import { Save } from './SaveManager.js';

// Five short, climbing gear ratios. A gear's note rises across its rev span,
// then snaps back down on the next gear (an upshift) — classic acceleration feel.
const GEAR_BANDS = [
  { lo: 0.0, hi: 0.22, fLo: 55, fHi: 150 },
  { lo: 0.22, hi: 0.42, fLo: 95, fHi: 185 },
  { lo: 0.42, hi: 0.62, fLo: 120, fHi: 210 },
  { lo: 0.62, hi: 0.82, fLo: 145, fHi: 230 },
  { lo: 0.82, hi: 1.01, fLo: 165, fHi: 260 },
];

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engineGain = null; // sub-bus the whole engine + tires route through
    this.engine = null; // engine voice graph (see startEngine)
    this.music = null; // { padGain, leadGain, ... } reactive music graph
    this.noiseBuffer = null; // shared looping white-noise buffer
    this.musicTimer = null;
    this.musicStep = 0;
    this.ready = false;

    // Reactive engine state (smoothed/tracked across frames).
    this._gearIndex = 0;
    this._prevRev = 0;
    this._intensity = 0;

    // Stored volumes (0..1) for a future settings menu. Defaults to 1.
    this._vMaster = 1;
    this._vSfx = 1;
    this._vMusic = 1;
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

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.9;
    this.engineGain.connect(this.master);

    this.noiseBuffer = this._makeNoiseBuffer(2.0);

    this.ready = true;
    this._applyStoredVolumes();
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // Looping white-noise buffer, reused for the engine grit and tire squeal voices.
  _makeNoiseBuffer(seconds) {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    return buf;
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
        this._duckMusic(); // briefly dip + lowpass the music for impact
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
    if (!this.ctx) return;
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
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer || this._makeNoiseBuffer(dur + 0.1);
    src.loop = true;
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

  // ---- Engine (continuous, reactive) --------------------------------------
  startEngine() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const t = this.t;

    // --- Tone stack: 3 detuned oscillators + a sub-octave through a lowpass.
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc3.type = 'square';
    sub.type = 'square';
    osc2.detune.value = 8; // slight detune = thickness / beating
    osc3.detune.value = -12;

    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.5;
    osc1.connect(toneGain);
    osc2.connect(toneGain);
    osc3.connect(toneGain);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    sub.connect(subGain);

    // --- Grit: a touch of looping filtered noise to roughen the idle.
    const gritSrc = ctx.createBufferSource();
    gritSrc.buffer = this.noiseBuffer;
    gritSrc.loop = true;
    const gritFilter = ctx.createBiquadFilter();
    gritFilter.type = 'bandpass';
    gritFilter.frequency.value = 220;
    gritFilter.Q.value = 0.7;
    const gritGain = ctx.createGain();
    gritGain.gain.value = 0.04;
    gritSrc.connect(gritFilter);
    gritFilter.connect(gritGain);

    // --- Shared lowpass that opens up with revs.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.8;
    toneGain.connect(filter);
    subGain.connect(filter);
    gritGain.connect(filter);

    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    filter.connect(gain);
    gain.connect(this.engineGain);

    // --- Turbo spool: a quiet high whistle that builds under sustained load.
    const turboOsc = ctx.createOscillator();
    turboOsc.type = 'triangle';
    turboOsc.frequency.value = 2200;
    const turboFilter = ctx.createBiquadFilter();
    turboFilter.type = 'bandpass';
    turboFilter.frequency.value = 2200;
    turboFilter.Q.value = 6;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0.0;
    turboOsc.connect(turboFilter);
    turboFilter.connect(turboGain);
    turboGain.connect(this.engineGain);

    // --- Tire squeal: continuous bandpassed noise driven by the slip param.
    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = this.noiseBuffer;
    tireSrc.loop = true;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 2600;
    tireFilter.Q.value = 7;
    const tireGain = ctx.createGain();
    tireGain.gain.value = 0.0;
    tireSrc.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(this.engineGain);

    osc1.start(t);
    osc2.start(t);
    osc3.start(t);
    sub.start(t);
    gritSrc.start(t);
    turboOsc.start(t);
    tireSrc.start(t);

    this.engine = {
      osc1, osc2, osc3, sub,
      filter, gain, gritGain,
      turboOsc, turboFilter, turboGain,
      tireFilter, tireGain,
      turboSpool: 0, // smoothed spool amount, tracked for the blow-off trigger
    };
    this._gearIndex = 0;
    this._prevRev = 0;
  }

  // rev: 0..1 overall engine load; slip: 0..1 wheelspin/drift intensity.
  updateEngine(rev, slip = 0) {
    if (!this.engine || !this.ctx) return;
    const e = this.engine;
    const t = this.t;
    const tc = 0.06; // smoothing time constant — kills zipper noise

    if (!Save.settings.sfx) {
      // Muted: fade the whole engine bus down but keep oscillators alive cheaply.
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      e.turboGain.gain.setTargetAtTime(0, t, 0.05);
      e.tireGain.gain.setTargetAtTime(0, t, 0.05);
      this._prevRev = rev;
      return;
    }

    rev = clamp01(rev);
    slip = clamp01(slip);

    // --- Gear model: find the band this rev falls in; detect shifts.
    let gi = this._gearIndex;
    let band = GEAR_BANDS[gi];
    while (gi < GEAR_BANDS.length - 1 && rev >= GEAR_BANDS[gi].hi) gi++;
    while (gi > 0 && rev < GEAR_BANDS[gi].lo) gi--;
    if (gi !== this._gearIndex) {
      this._shiftTransient(gi > this._gearIndex); // true = upshift
      this._gearIndex = gi;
    }
    band = GEAR_BANDS[gi];

    // Note rises across the band (revs climbing), snaps down on the next gear.
    const span = Math.max(0.001, band.hi - band.lo);
    const within = clamp01((rev - band.lo) / span);
    const baseFreq = band.fLo + (band.fHi - band.fLo) * within;

    e.osc1.frequency.setTargetAtTime(baseFreq, t, tc);
    e.osc2.frequency.setTargetAtTime(baseFreq * 1.005, t, tc);
    e.osc3.frequency.setTargetAtTime(baseFreq * 0.995, t, tc);
    e.sub.frequency.setTargetAtTime(baseFreq * 0.5, t, tc);

    // Filter and gain open up with revs; slip adds grit/brightness.
    e.filter.frequency.setTargetAtTime(500 + rev * 2200 + slip * 1400, t, tc);
    e.gain.gain.setTargetAtTime(0.05 + rev * 0.13 + slip * 0.04, t, tc);
    e.gritGain.gain.setTargetAtTime(0.03 + slip * 0.06, t, tc);

    // --- Turbo spool: builds with sustained high rev, leaks away otherwise.
    const targetSpool = rev > 0.55 ? clamp01((rev - 0.55) / 0.45) : 0;
    e.turboSpool += (targetSpool - e.turboSpool) * 0.08; // slow lag = spool inertia
    const spool = e.turboSpool;
    e.turboFilter.frequency.setTargetAtTime(1800 + spool * 2600, t, tc);
    e.turboOsc.frequency.setTargetAtTime(1800 + spool * 2600, t, tc);
    e.turboGain.gain.setTargetAtTime(spool * 0.05, t, tc);

    // --- Blow-off valve: rev dropped sharply after being high → "pshhh".
    if (this._prevRev > 0.7 && rev < this._prevRev - 0.22) {
      this._blowOff();
      e.turboSpool *= 0.2; // dump the boost
    }

    // --- Tire squeal: continuous, tracks slip. Silent at slip~0.
    const squeal = slip * slip; // bias toward only screaming at high slip
    e.tireFilter.frequency.setTargetAtTime(1800 + slip * 2600, t, tc);
    e.tireGain.gain.setTargetAtTime(squeal * 0.16, t, tc);

    this._prevRev = rev;
  }

  // Short, subtle clutch/shift transient on gear change.
  _shiftTransient(isUpshift) {
    if (!this.ctx) return;
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = isUpshift ? 900 : 600;
    filt.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.engineGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  // Turbo blow-off valve flutter — a short filtered noise burst.
  _blowOff() {
    if (!this.ctx) return;
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(3200, t);
    filt.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    filt.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.engineGain);
    src.start(t);
    src.stop(t + 0.28);
  }

  stopEngine() {
    if (!this.engine || !this.ctx) {
      this.engine = null;
      return;
    }
    const e = this.engine;
    const t = this.t;
    try {
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      e.turboGain.gain.setTargetAtTime(0, t, 0.05);
      e.tireGain.gain.setTargetAtTime(0, t, 0.05);
      const stopAt = t + 0.3;
      e.osc1.stop(stopAt);
      e.osc2.stop(stopAt);
      e.osc3.stop(stopAt);
      e.sub.stop(stopAt);
      e.turboOsc.stop(stopAt);
    } catch (_) {}
    this.engine = null;
  }

  // ---- Music bed (layered synthwave + reactive lead) ----------------------
  startMusic() {
    if (!this.ready || this.musicTimer) return;
    const ctx = this.ctx;
    const t = this.t;

    this.musicGain.gain.setTargetAtTime(Save.settings.music ? 0.16 : 0, t, 0.5);

    // A duck-able lowpass on the whole music bus (used by sfx('crash')).
    const duck = ctx.createBiquadFilter();
    duck.type = 'lowpass';
    duck.frequency.value = 20000;
    duck.Q.value = 0.5;
    duck.connect(this.musicGain);

    // Pad/chord layer (always present) and a reactive lead layer (fades in).
    const padGain = ctx.createGain();
    padGain.gain.value = 1.0;
    padGain.connect(duck);

    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.0; // setIntensity() fades this in
    leadGain.connect(duck);

    this.music = { duck, padGain, leadGain };

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
      if (!this.ctx || !this.music) return;
      const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
      const note = chord[this.musicStep % chord.length];
      this._musicNote(note * 2, 0.32);
      if (this.musicStep % 8 === 0) this._musicNote(chord[0] / 2, 1.6, 0.05); // bass
      // Reactive lead: a brighter arp that only matters when intensity is up.
      if (this.musicStep % 2 === 0) {
        this._leadNote(chord[(this.musicStep / 2) % chord.length] * 4, 0.22);
      }
      this.musicStep++;
    }, stepMs);
  }

  _musicNote(freq, dur, vol = 0.09) {
    if (!this.ctx || !this.music) return;
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
    g.connect(this.music.padGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Brighter lead voice routed through the intensity-controlled leadGain.
  _leadNote(freq, dur, vol = 0.07) {
    if (!this.ctx || !this.music) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o2.type = 'sawtooth';
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.005;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.music.leadGain);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // 0..1 — fades the reactive lead layer in. Optional; defaults to silent.
  setIntensity(x) {
    this._intensity = clamp01(x || 0);
    if (!this.music || !this.ctx) return;
    this.music.leadGain.gain.setTargetAtTime(this._intensity * 0.9, this.t, 0.25);
  }

  // Briefly duck + lowpass the music for crash impact.
  _duckMusic() {
    if (!this.music || !this.ctx) return;
    const t = this.t;
    const { duck, padGain, leadGain } = this.music;
    try {
      duck.frequency.cancelScheduledValues(t);
      duck.frequency.setValueAtTime(700, t);
      duck.frequency.setTargetAtTime(20000, t + 0.25, 0.4);
      padGain.gain.cancelScheduledValues(t);
      padGain.gain.setValueAtTime(0.35, t);
      padGain.gain.setTargetAtTime(1.0, t + 0.25, 0.4);
      const leadTarget = this._intensity * 0.9;
      leadGain.gain.setValueAtTime(leadTarget * 0.2, t);
      leadGain.gain.setTargetAtTime(leadTarget, t + 0.25, 0.4);
    } catch (_) {}
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.t, 0.4);
    this.music = null;
  }

  // ---- Volume control -----------------------------------------------------
  // Reads Save.settings (sfx/music booleans + optional masterVolume/sfxVolume/
  // musicVolume numbers) and applies them. Robust if any key is absent.
  refreshVolumes() {
    if (!this.ready) return;
    const s = Save.settings || {};
    if (typeof s.masterVolume === 'number') this._vMaster = clamp01(s.masterVolume);
    if (typeof s.sfxVolume === 'number') this._vSfx = clamp01(s.sfxVolume);
    if (typeof s.musicVolume === 'number') this._vMusic = clamp01(s.musicVolume);
    this._applyStoredVolumes();
  }

  // Pushes the stored volume scalars + on/off booleans into the gain nodes.
  _applyStoredVolumes() {
    if (!this.ready || !this.ctx) return;
    const s = Save.settings || {};
    const t = this.t;
    const musicOn = s.music !== false;
    const sfxOn = s.sfx !== false;
    this.master.gain.setTargetAtTime(0.9 * this._vMaster, t, 0.2);
    this.musicGain.gain.setTargetAtTime(musicOn ? 0.16 * this._vMusic : 0, t, 0.2);
    this.sfxGain.gain.setTargetAtTime(sfxOn ? 0.6 * this._vSfx : 0, t, 0.2);
    if (this.engineGain) {
      this.engineGain.gain.setTargetAtTime(sfxOn ? 0.9 * this._vSfx : 0, t, 0.2);
    }
  }

  setMasterVolume(v) {
    this._vMaster = clamp01(v);
    this._applyStoredVolumes();
  }

  setSfxVolume(v) {
    this._vSfx = clamp01(v);
    this._applyStoredVolumes();
  }

  setMusicVolume(v) {
    this._vMusic = clamp01(v);
    this._applyStoredVolumes();
  }
}

export const Audio = new AudioBus();
