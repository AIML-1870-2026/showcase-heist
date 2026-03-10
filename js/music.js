'use strict';
// ── music.js ────────────────────────────────────────────────
// Procedural music via Web Audio API.
// Layers: spy theme (stealth) → bass drone → tension pad → heartbeat pulse → alarm siren.
// Exposes: window.Music

window.Music = (function () {

  let ctx        = null;
  let master     = null;
  let droneGain  = null;
  let padGain    = null;
  let padFilter  = null;
  let sirenOsc   = null;
  let sirenGain  = null;

  // ── Spy theme ────────────────────────────────────────────
  let spyGain      = null;
  let _noiseBuffer = null;
  let _spyBassT    = 0;
  let _spyMelT     = 0;
  let _spyHatT     = 0;
  let _bassStep    = 0;
  let _melStep     = 0;

  const _SPY_BPM   = 120;
  const _SPY_BEAT  = 60 / _SPY_BPM;   // 0.5 s per beat
  const _SPY_8TH   = _SPY_BEAT / 2;   // 0.25 s
  const _SPY_AHEAD = 0.18;            // lookahead scheduling window (s)

  // Walking bass — 2 bars of 4/4 in A minor  [freq Hz, beats]
  const _SPY_BASS = [
    [110.0, 1.0], [130.8, 0.5], [123.5, 0.5],   // bar 1 beat 1-2
    [146.8, 0.5], [138.6, 0.5], [164.8, 1.0],   // bar 1 beat 3-4
    [155.6, 0.5], [146.8, 0.5], [138.6, 1.0],   // bar 2 beat 1-2
    [123.5, 0.5], [110.0, 0.5], [164.8, 1.0],   // bar 2 beat 3-4
  ];  // total: 8 beats

  // Spy melody — 4 bars (vibraphone vibe)  [freq Hz, beats], 0 = rest
  const _SPY_MEL = [
    [0, 2], [440, 0.5], [493.9, 0.5], [523.3, 1],           // bar 1
    [440, 0.5], [392, 0.5], [349.2, 1], [329.6, 2],         // bar 2
    [0, 1], [392, 0.5], [440, 0.5], [466.2, 1], [440, 1],  // bar 3
    [0, 0.5], [349.2, 0.5], [392, 0.5], [440, 0.5], [440, 2], // bar 4
  ];  // total: 16 beats

  let _ready     = false;
  let _nextBeat  = 0;
  let _beatInt   = 2.2;   // seconds between heartbeat thumps

  // ── Build audio graph (called once after first user gesture) ──
  function _build() {
    ctx    = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // ── Spy theme bus ──────────────────────────────────────
    spyGain = ctx.createGain();
    spyGain.gain.value = 0.0;
    spyGain.connect(master);

    // Pre-bake a short noise buffer for hi-hats
    const hatSamples = Math.ceil(ctx.sampleRate * 0.06);
    _noiseBuffer = ctx.createBuffer(1, hatSamples, ctx.sampleRate);
    const nd = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < hatSamples; i++) nd[i] = Math.random() * 2 - 1;

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

    // Spy theme: start scheduling half a second from now
    _spyBassT = ctx.currentTime + 0.5;
    _spyMelT  = ctx.currentTime + 0.5;
    _spyHatT  = ctx.currentTime + 0.5;
  }

  // ── Spy bass note (plucked triangle — upright bass feel) ──
  function _playSpyBass(freq, when) {
    if (!ctx || freq === 0) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type            = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.80, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.38);
    osc.connect(env);
    env.connect(spyGain);
    osc.start(when);
    osc.stop(when + 0.42);
  }

  // ── Spy melody note (mellow triangle — vibraphone feel) ──
  function _playSpyMel(freq, when) {
    if (!ctx || freq === 0) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type            = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.38, when + 0.018);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.55);
    osc.connect(env);
    env.connect(spyGain);
    osc.start(when);
    osc.stop(when + 0.60);
  }

  // ── Hi-hat (highpass-filtered noise burst) ────────────────
  function _playSpyHat(when, accent) {
    if (!ctx || !_noiseBuffer) return;
    const src  = ctx.createBufferSource();
    src.buffer = _noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type            = 'highpass';
    filt.frequency.value = 9000;
    const env = ctx.createGain();
    const vol = accent ? 0.14 : 0.07;
    env.gain.setValueAtTime(vol, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.038);
    src.connect(filt);
    filt.connect(env);
    env.connect(spyGain);
    src.start(when);
  }

  // ── Lookahead scheduler for spy theme ────────────────────
  function _scheduleSpyNotes(now) {
    // Bass
    while (_spyBassT < now + _SPY_AHEAD) {
      const [freq, beats] = _SPY_BASS[_bassStep % _SPY_BASS.length];
      _playSpyBass(freq, _spyBassT);
      _spyBassT += beats * _SPY_BEAT;
      _bassStep++;
    }
    // Melody
    while (_spyMelT < now + _SPY_AHEAD) {
      const [freq, beats] = _SPY_MEL[_melStep % _SPY_MEL.length];
      _playSpyMel(freq, _spyMelT);
      _spyMelT += beats * _SPY_BEAT;
      _melStep++;
    }
    // Hi-hat every 8th note; accent on beat (every 2nd 8th)
    while (_spyHatT < now + _SPY_AHEAD) {
      const accent = (Math.round(_spyHatT / _SPY_8TH) % 2 === 0);
      _playSpyHat(_spyHatT, accent);
      _spyHatT += _SPY_8TH;
    }
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

    // ── Spy theme: fade in during stealth, out during alarm ──
    const targetSpy = alarmActive ? 0.0 : alarmLevel >= 2 ? 0.0 : alarmLevel >= 1 ? 0.15 : 0.55;
    spyGain.gain.setTargetAtTime(targetSpy, t, 0.9);
    _scheduleSpyNotes(t);

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
