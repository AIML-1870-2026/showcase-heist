'use strict';
// ── ui.js ──────────────────────────────────────────────────
// Manages all DOM: screens, HUD, SFX via Web Audio API.
// Exposes: window.UI

window.UI = (function () {

  // ── DOM refs ───────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const screens = {
    start:    $('start-screen'),
    pause:    $('pause-screen'),
    gameover: $('gameover-screen'),
    win:      $('win-screen'),
  };

  const hud           = $('hud');
  const minimapCanvas = $('minimap-canvas');
  const minimapCtx    = minimapCanvas.getContext('2d');
  const minimapLabel  = $('minimap-label');
  const promptEl      = $('interaction-prompt');
  const promptText    = $('prompt-text');
  const alertFlash    = $('alert-flash');
  const alertTextEl   = $('alert-text');
  const coopStatus    = $('coop-status');
  const coopStateEl   = $('coop-state');
  const alarmOverlay  = $('alarm-overlay');
  const alarmTimerEl  = $('alarm-timer');
  const companionMenu = $('companion-menu');

  const OBJ_ORDER = [
    'enter', 'yellow', 'gallery', 'painting',
    'blue', 'vault', 'crown', 'escape',
  ];

  // ── Screen management ──────────────────────────────────
  function showScreen(name) {
    Object.values(screens).forEach(s => {
      s.classList.add('hidden');
      s.classList.remove('active');
    });
    hud.classList.add('hidden');
    if (name && screens[name]) {
      screens[name].classList.remove('hidden');
      screens[name].classList.add('active');
    }
  }

  function showHUD() {
    Object.values(screens).forEach(s => {
      s.classList.add('hidden');
      s.classList.remove('active');
    });
    hud.classList.remove('hidden');
  }

  // ── Objectives ─────────────────────────────────────────
  function setObjective(id, state) {
    const el = document.querySelector(`[data-obj="${id}"]`);
    if (!el) return;
    el.classList.remove('done', 'current');
    if (state) el.classList.add(state);
  }

  function completeObjective(id) {
    setObjective(id, 'done');
    const idx = OBJ_ORDER.indexOf(id);
    if (idx >= 0 && idx + 1 < OBJ_ORDER.length) {
      setObjective(OBJ_ORDER[idx + 1], 'current');
    }
  }

  function initObjectives() {
    OBJ_ORDER.forEach(id => setObjective(id, ''));
    setObjective('enter', 'current');
  }

  // ── Inventory ──────────────────────────────────────────
  function addItem(slotId) {
    const slot = $('slot-' + slotId);
    if (slot) slot.classList.add('has-item');
  }

  // ── Interaction prompt ─────────────────────────────────
  function showPrompt(text) {
    promptText.textContent = text;
    promptEl.classList.remove('hidden');
  }

  function hidePrompt() {
    promptEl.classList.add('hidden');
  }

  // ── Alert flash ────────────────────────────────────────
  let _alertTimeout = null;

  function showAlert(text, duration) {
    duration = duration || 2000;
    alertTextEl.textContent = text;
    alertFlash.classList.remove('hidden');
    clearTimeout(_alertTimeout);
    _alertTimeout = setTimeout(() => alertFlash.classList.add('hidden'), duration);
  }

  function hideAlert() {
    clearTimeout(_alertTimeout);
    alertFlash.classList.add('hidden');
  }

  // ── Co-op status ───────────────────────────────────────
  const COOP_COLORS = {
    Following:   '#2ecc71',
    Waiting:     '#f0c040',
    Distracting: '#e05050',
    Hacking:     '#4a9eff',
    Rescuing:    '#ff8c00',
    Caught:      '#e02020',
  };

  function updateCoopStatus(state) {
    coopStateEl.textContent  = state;
    coopStateEl.style.color  = COOP_COLORS[state] || '#ccc';
  }

  function showCoopStatus(visible) {
    coopStatus.classList.toggle('hidden', !visible);
  }

  // ── Alarm countdown ────────────────────────────────────
  function updateAlarmTimer(seconds) {
    const s  = Math.max(0, Math.ceil(seconds));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    alarmTimerEl.textContent = mm + ':' + ss;
    alarmOverlay.classList.toggle('urgent', s <= 10);
  }

  function showAlarm(visible) {
    alarmOverlay.classList.toggle('hidden', !visible);
  }

  // ── Companion menu ─────────────────────────────────────
  let _menuOpen = false;

  function toggleCompanionMenu() {
    _menuOpen = !_menuOpen;
    companionMenu.classList.toggle('hidden', !_menuOpen);
    if (_menuOpen) companionMenu.style.display = 'flex';
  }

  function closeCompanionMenu() {
    _menuOpen = false;
    companionMenu.classList.add('hidden');
  }

  // ── Minimap ────────────────────────────────────────────
  // Rooms in minimap pixel space (160×120 canvas)
  const MM_ROOMS = [
    { rx: 55,  ry: 5,  rw: 50,  rh: 28, color: '#222233' }, // Lobby
    { rx: 30,  ry: 43, rw: 100, rh: 28, color: '#1c1c2e' }, // Gallery
    { rx: 30,  ry: 81, rw: 100, rh: 28, color: '#1e1018' }, // Crown Vault
  ];

  function worldToMini(wx, wz) {
    return {
      mx: 80  + wx  * 1.8,
      my: 5   + (wz / 165) * 108,
    };
  }

  function drawMinimap(playerPos, guardPositions, currentRoom) {
    minimapCtx.clearRect(0, 0, 160, 120);
    minimapCtx.fillStyle = '#0a0a0c';
    minimapCtx.fillRect(0, 0, 160, 120);

    MM_ROOMS.forEach(r => {
      minimapCtx.fillStyle = r.color;
      minimapCtx.fillRect(r.rx, r.ry, r.rw, r.rh);
      minimapCtx.strokeStyle = '#444';
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(r.rx, r.ry, r.rw, r.rh);
    });

    // Guards (red dots) — visible when alarm is active
    const showGuards = window.G && window.G.alarm.level > 0;
    if (showGuards && guardPositions) {
      guardPositions.forEach(gp => {
        const { mx, my } = worldToMini(gp.x, gp.z);
        minimapCtx.fillStyle = '#e02020';
        minimapCtx.beginPath();
        minimapCtx.arc(
          Math.max(2, Math.min(158, mx)),
          Math.max(2, Math.min(118, my)),
          2.5, 0, Math.PI * 2
        );
        minimapCtx.fill();
      });
    }

    // Player dot (gold)
    if (playerPos) {
      const { mx, my } = worldToMini(playerPos.x, playerPos.z);
      minimapCtx.fillStyle = '#c9a84c';
      minimapCtx.beginPath();
      minimapCtx.arc(
        Math.max(3, Math.min(157, mx)),
        Math.max(3, Math.min(117, my)),
        3.5, 0, Math.PI * 2
      );
      minimapCtx.fill();
    }

    if (currentRoom) minimapLabel.textContent = 'Area: ' + currentRoom;
  }

  // ── Web Audio SFX ──────────────────────────────────────
  let _actx = null;

  function getACtx() {
    if (!_actx) {
      _actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _actx;
  }

  function _beep(freq, dur, vol, type, delay) {
    vol   = vol   || 0.25;
    type  = type  || 'square';
    delay = delay || 0;
    try {
      const ctx  = getACtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    } catch (e) {}
  }

  const SFX = {
    pickup()   {
      _beep(880,  0.08, 0.2,  'sine');
      _beep(1100, 0.10, 0.2,  'sine', 0.08);
    },
    alert()    {
      _beep(440, 0.25, 0.4, 'square');
      _beep(554, 0.25, 0.4, 'square', 0.25);
    },
    alarm()    {
      for (let i = 0; i < 4; i++) _beep(220, 0.35, 0.5, 'sawtooth', i * 0.45);
    },
    interact() { _beep(660, 0.06, 0.12, 'sine'); },
    door()     {
      _beep(300, 0.10, 0.2, 'triangle');
      _beep(400, 0.10, 0.2, 'triangle', 0.10);
    },
    footstep() { _beep(70 + Math.random() * 25, 0.04, 0.04, 'triangle'); },
    caught()   { _beep(180, 1.0, 0.5, 'sawtooth'); },
    win()      {
      [523, 659, 784, 1047].forEach((f, i) => _beep(f, 0.35, 0.3, 'sine', i * 0.18));
    },
    detected() { _beep(330, 0.15, 0.35, 'square'); },
  };

  // ── Game over / Win helpers ────────────────────────────
  function showGameOver(title, message) {
    $('gameover-title').textContent   = title   || 'Caught!';
    $('gameover-message').textContent = message || 'You were spotted.';
    SFX.caught();
    showScreen('gameover');
  }

  function showWin() {
    SFX.win();
    showScreen('win');
  }

  // ── Public API ─────────────────────────────────────────
  return {
    showScreen,
    showHUD,
    initObjectives,
    setObjective,
    completeObjective,
    addItem,
    showPrompt,
    hidePrompt,
    showAlert,
    hideAlert,
    updateCoopStatus,
    showCoopStatus,
    updateAlarmTimer,
    showAlarm,
    toggleCompanionMenu,
    closeCompanionMenu,
    drawMinimap,
    SFX,
    showGameOver,
    showWin,
    get companionMenuOpen() { return _menuOpen; },
  };

}());
