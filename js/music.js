'use strict';
// ── music.js ────────────────────────────────────────────────
// Procedural tension music via Web Audio API.
// Layers: bass drone → tension pad → heartbeat pulse → alarm siren.
// Exposes: window.Music

window.Music = (function () {

  let ctx        = null;
  let master     = null;
  let droneGain  = null;
  let padGain    = null;
  let padFilter  = null;
  let sirenOsc   = null;
  let sirenGain  = null;

  let _ready     = false;
  let _nextBeat  = 0;
  let _beatInt   = 2.2;   // seconds between heartbeat thumps

  // ── Build audio graph (called once after first user gesture) ──
  function _build() {
    ctx    = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // ── Bass drone: 3 sine oscillators (A1 / A2 / E3) ─────
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.14;
    droneGain.connect(master);

    const droneFreqs  = [55, 110, 165];
    const droneGains  = [0.55, 0.30, 0.14];
    const droneDetune = [-4, 0, 6];
    droneFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type           = 'sine';
      osc.frequency.value = f;
      osc.detune.value    = droneDetune[i];
      g.gain.value        = droneGains[i];
      osc.connect(g);
      g.connect(droneGain);
      osc.start();
    });

    // ── Tension pad: detuned sawtooths through lowpass ─────
    padFilter = ctx.createBiquadFilter();
    padFilter.type            = 'lowpass';
    padFilter.frequency.value = 380;
    padFilter.Q.value         = 3.5;

    padGain = ctx.createGain();
    padGain.gain.value = 0.0;   // silent until alarm escalates
    padFilter.connect(padGain);
    padGain.connect(master);

    [110, 146.8, 165, 220, 261.6].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type            = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value    = (i % 2 === 0 ? 1 : -1) * (7 + i * 3);
      g.gain.value        = 0.12;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
    });

    // ── Alarm siren: two detuned oscillators crossfading ──
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.0;
    sirenGain.connect(master);

    sirenOsc = ctx.createOscillator();
    sirenOsc.type            = 'sawtooth';
    sirenOsc.frequency.value = 440;
    sirenOsc.connect(sirenGain);
    sirenOsc.start();

    _ready    = true;
    _nextBeat = ctx.currentTime + 0.8;
  }

  // ── Heartbeat thump ────────────────────────────────────
  function _thump() {
    if (!ctx) return;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.65, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + 0.38);
  }

  // ── Public: call once on first interaction ─────────────
  function start() {
    if (!_ready) _build();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // ── Public: call each game frame ──────────────────────
  function update(alarmLevel, alarmActive) {
    if (!_ready || !ctx) return;

    const t = ctx.currentTime;

    // Heartbeat rate scales with alarm
    _beatInt = alarmActive ? 0.48 : alarmLevel >= 2 ? 0.85 : alarmLevel >= 1 ? 1.4 : 2.2;
    if (t >= _nextBeat) {
      _thump();
      _nextBeat = t + _beatInt;
    }

    // Drone volume swells slightly under tension
    const targetDrone = alarmActive ? 0.22 : alarmLevel >= 1 ? 0.17 : 0.14;
    droneGain.gain.setTargetAtTime(targetDrone, t, 0.4);

    // Tension pad fades in as alarm escalates; filter opens up
    const targetPad    = alarmActive ? 0.42 : alarmLevel >= 2 ? 0.24 : alarmLevel >= 1 ? 0.10 : 0.0;
    const targetCutoff = alarmActive ? 900 : alarmLevel >= 2 ? 600 : 380;
    padGain.gain.setTargetAtTime(targetPad, t, 0.6);
    padFilter.frequency.setTargetAtTime(targetCutoff, t, 0.5);

    // Siren only during full alarm
    const targetSiren = alarmActive ? 0.08 : 0.0;
    sirenGain.gain.setTargetAtTime(targetSiren, t, 0.3);
    if (alarmActive) {
      // Oscillate pitch between 420 and 520 Hz at ~2 Hz
      const sweep = 470 + Math.sin(t * Math.PI * 2) * 50;
      sirenOsc.frequency.setTargetAtTime(sweep, t, 0.05);
    }
  }

  // ── Public: fade out (game over / win) ─────────────────
  function stop() {
    if (!_ready || !ctx) return;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
  }

  return { start, update, stop };

}());
