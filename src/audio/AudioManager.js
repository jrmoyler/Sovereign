// ============================================================================
// AudioManager — a Web Audio soundscape. All SFX are synthesized in real time
// (classic DSP, not sampled/AI content) so the game ships with zero audio
// dependencies and works fully offline. If real .ogg/.wav files are dropped
// into assets/sounds/<name>.ogg they are loaded and used instead — see load().
//
// Under it all runs a quiet, slowly evolving cinematic pad + sparse arpeggio.
// ============================================================================

const OPTIONAL_FILES = {
  // name -> file. Absent by default; drop real CC0 assets here to override.
  // shoot: 'assets/sounds/shoot.ogg', ...
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.buffers = {};
    this.master = null; this.sfxGain = null; this.musicGain = null;
    this._lastPlay = {};   // throttle spammy sounds
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.6; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.0; this.musicGain.connect(this.master);
    // try optional real samples
    for (const name in OPTIONAL_FILES) {
      try {
        const r = await fetch(OPTIONAL_FILES[name]); if (!r.ok) continue;
        this.buffers[name] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* ignore, fall back to synth */ }
    }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setSfx(v) { if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusic(v) { this._musicTarget = v; if (this.musicGain) this.musicGain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 1.5); }

  _env(dur, peak = 1, attack = 0.005) {
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  _osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource(); src.buffer = buf; return src;
  }
  _tone(freq, dur, type = 'sine', peak = 0.5, dest = this.sfxGain) {
    const o = this._osc(type, freq), g = this._env(dur, peak);
    o.connect(g); g.connect(dest); o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }
  _slide(f0, f1, dur, type = 'sawtooth', peak = 0.4) {
    const o = this._osc(type, f0), g = this._env(dur, peak);
    o.frequency.exponentialRampToValueAtTime(f1, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }

  play(type, payload) {
    if (!this.ctx || !this.enabled) return;
    // throttle high-frequency combat sounds
    const now = this.ctx.currentTime;
    const throttleMap = { shoot: 0.05, melee: 0.06, move: 0.04, click: 0.02 };
    if (throttleMap[type]) { if ((this._lastPlay[type] || 0) + throttleMap[type] > now) return; this._lastPlay[type] = now; }

    if (this.buffers[type]) { const s = this.ctx.createBufferSource(); s.buffer = this.buffers[type]; s.connect(this.sfxGain); s.start(); return; }

    switch (type) {
      case 'click': this._tone(880, 0.05, 'square', 0.18); break;
      case 'select': this._tone(660, 0.06, 'triangle', 0.25); this._tone(990, 0.08, 'triangle', 0.18); break;
      case 'move': this._tone(520, 0.07, 'sine', 0.22); break;
      case 'attack_order': this._slide(300, 520, 0.12, 'square', 0.25); break;
      case 'build_place': this._tone(160, 0.18, 'sine', 0.4); this._tone(120, 0.22, 'triangle', 0.3); break;
      case 'build_start': this._slide(140, 220, 0.25, 'sine', 0.3); break;
      case 'build_complete': [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.2, 'triangle', 0.3), i * 70)); break;
      case 'train': this._tone(440, 0.08, 'square', 0.22); this._tone(587, 0.1, 'square', 0.18); break;
      case 'trained': this._tone(700, 0.09, 'triangle', 0.22); break;
      case 'research_start': this._slide(600, 1200, 0.3, 'sine', 0.22); break;
      case 'research': [784, 988, 1319].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, 'sine', 0.24), i * 60)); break;
      case 'shoot': { const s = this._noise(0.08), g = this._env(0.08, 0.28), f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(); break; }
      case 'melee': { const s = this._noise(0.12), g = this._env(0.12, 0.4), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(); this._tone(90, 0.14, 'sine', 0.3); break; }
      case 'explosion': { const s = this._noise(0.5), g = this._env(0.5, 0.6), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1200, now); f.frequency.exponentialRampToValueAtTime(80, now + 0.5); s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(); this._tone(60, 0.5, 'sine', 0.5); break; }
      case 'death': this._slide(400, 80, 0.4, 'sawtooth', 0.3); break;
      case 'sabotage': this._slide(220, 60, 0.5, 'square', 0.35); { const s = this._noise(0.3), g = this._env(0.3, 0.25); s.connect(g); g.connect(this.sfxGain); s.start(); } break;
      case 'alert': this._tone(880, 0.12, 'square', 0.25); setTimeout(() => this._tone(880, 0.12, 'square', 0.22), 150); break;
      case 'alert_bad': this._tone(220, 0.18, 'sawtooth', 0.3); setTimeout(() => this._tone(180, 0.22, 'sawtooth', 0.3), 160); break;
      case 'alert_good': this._tone(659, 0.14, 'triangle', 0.28); setTimeout(() => this._tone(988, 0.18, 'triangle', 0.24), 120); break;
      case 'stage': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.4, 'triangle', 0.3), i * 110)); break;
      case 'action': this._slide(500, 900, 0.2, 'sine', 0.25); break;
      case 'deny': this._tone(140, 0.14, 'square', 0.28); break;
      case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this._tone(f, 0.6, 'triangle', 0.35), i * 160)); break;
      case 'defeat': this._slide(330, 82, 1.2, 'sawtooth', 0.35); break;
      default: break;
    }
  }

  // ---- ambient cinematic music --------------------------------------------
  startMusic() {
    if (!this.ctx || this._musicOn) return;
    this._musicOn = true;
    this.setMusic(0.32);
    const root = 55; // A1
    const chordSteps = [0, 3, 7, 10, 12];
    // slow evolving pad: three detuned saws through a moving lowpass
    const pad = this.ctx.createGain(); pad.gain.value = 0.16; pad.connect(this.musicGain);
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500; filt.Q.value = 4; filt.connect(pad);
    const lfo = this._osc('sine', 0.03); const lfoG = this.ctx.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
    for (const d of [0, 7, 12]) {
      const f = root * Math.pow(2, d / 12);
      for (const det of [-4, 4]) { const o = this._osc('sawtooth', f); o.detune.value = det; o.connect(filt); o.start(); }
    }
    // sparse arpeggio bells
    this._arp = setInterval(() => {
      if (!this.ctx || this.musicGain.gain.value < 0.01) return;
      const semi = chordSteps[Math.floor(Math.random() * chordSteps.length)];
      const f = root * 4 * Math.pow(2, semi / 12);
      const o = this._osc('triangle', f), g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, this.ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 2.2);
      o.connect(g); g.connect(this.musicGain); o.start(); o.stop(this.ctx.currentTime + 2.3);
    }, 2400);
  }
  duckMusic(v = 0.12) { this.setMusic(v); }
}
