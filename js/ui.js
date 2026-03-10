'use strict';
// ── ui.js ──────────────────────────────────────────────────
// Manages all DOM: screens, HUD, SFX via Web Audio API.
// Exposes: window.UI

window.UI = (function () {

  // ── DOM refs ───────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const screens = {
    start:    $('start-screen'),
    loadout:  $('loadout-screen'),
    intro:    $('intro-screen'),
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

  function getCurrentObjective() {
    for (const id of OBJ_ORDER) {
      const el = document.querySelector(`[data-obj="${id}"]`);
      if (el && el.classList.contains('current')) return id;
    }
    return null;
  }

  // ── Inventory ──────────────────────────────────────────
  function addItem(slotId) {
    const slot = $('slot-' + slotId);
    if (slot) slot.classList.add('has-item');
  }

  // ── Distract count ─────────────────────────────────────
  function updateDistractCount(n) {
    const el = $('distract-num');
    if (el) el.textContent = n;
  }

  // ── Smoke count ────────────────────────────────────────
  function updateSmokeCount(n) {
    const el = $('smoke-num');
    if (el) el.textContent = n;
  }

  // ── Noise meter ────────────────────────────────────────
  function updateNoise(val) {
    const fill = $('noise-fill');
    if (!fill) return;
    const pct = Math.max(0, Math.min(1, val)) * 100;
    fill.style.width = pct + '%';
    fill.style.background = val > 0.7 ? '#ff4422' : val > 0.4 ? '#ffaa22' : '#44bbff';
  }

  // ── Stamina bar ────────────────────────────────────────
  function updateStamina(val) {
    const fill = $('stamina-fill');
    if (!fill) return;
    const pct = Math.max(0, Math.min(1, val)) * 100;
    fill.style.width = pct + '%';
    fill.style.background = val < 0.2 ? '#dd3333' : val < 0.45 ? '#ddaa22' : '#44dd88';
  }

  // ── Achievement toast ──────────────────────────────────
  let _achTimeout = null;
  function showAchievement(name, desc) {
    const toast = $('achievement-toast');
    const nameEl = $('ach-name');
    const descEl = $('ach-desc');
    if (!toast || !nameEl || !descEl) return;
    nameEl.textContent = name;
    descEl.textContent = desc;
    toast.classList.remove('hidden', 'visible');
    void toast.offsetWidth; // reflow to restart animation
    toast.classList.add('visible');
    clearTimeout(_achTimeout);
    _achTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
  }

  // ── Ambient museum audio ───────────────────────────────
  let _ambientNodes = [];
  function startAmbient() {
    stopAmbient();
    try {
      const ctx = getACtx();
      // Low electrical hum
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 54;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.055;
      hum.connect(humGain);
      humGain.connect(ctx.destination);
      hum.start();
      // Brown noise (air conditioning)
      const bufLen = ctx.sampleRate * 3;
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bufLen; i++) {
        const w = Math.random() * 2 - 1;
        d[i] = (last + 0.02 * w) / 1.02;
        last = d[i];
        d[i] *= 3.5;
      }
      const ns = ctx.createBufferSource();
      ns.buffer = noiseBuf;
      ns.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 240;
      const ng = ctx.createGain();
      ng.gain.value = 0.038;
      ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination);
      ns.start();
      _ambientNodes = [hum, ns];
    } catch (e) {}
  }

  function stopAmbient() {
    _ambientNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    _ambientNodes = [];
  }

  // ── Interaction prompt ─────────────────────────────────
  function showPrompt(text) {
    promptText.textContent = text;
    promptEl.classList.remove('hidden');
  }

  function hidePrompt() {
    promptEl.classList.add('hidden');
  }

  // ── Laser alarm flash (red strobe) ─────────────────────
  let _laserFlashInterval = null;
  function showLaserFlash(duration) {
    duration = duration || 4000;
    const el = document.getElementById('laser-flash');
    if (!el) return;
    let strobeCount = 0;
    const maxStrobes = Math.floor(duration / 300);
    el.style.display = 'block';
    clearInterval(_laserFlashInterval);
    _laserFlashInterval = setInterval(() => {
      strobeCount++;
      el.style.opacity = (strobeCount % 2 === 0) ? '1' : '0';
      if (strobeCount >= maxStrobes) {
        clearInterval(_laserFlashInterval);
        el.style.display = 'none';
      }
    }, 150);
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
    { rx: 30,  ry: 2,  rw: 100, rh: 28, color: '#3a1a08', label: 'LOBBY',       lx: 80,  ly: 20 },
    { rx: 68,  ry: 30, rw: 24,  rh: 14, color: '#2a1a30', label: 'CORRIDOR',    lx: 80,  ly: 40 },
    { rx: 20,  ry: 44, rw: 120, rh: 28, color: '#1a1042', label: 'GALLERY',     lx: 80,  ly: 60 },
    { rx: 68,  ry: 72, rw: 24,  rh: 14, color: '#0a2a1a', label: 'CORRIDOR',    lx: 80,  ly: 81 },
    { rx: 20,  ry: 86, rw: 120, rh: 30, color: '#1a0828', label: 'CROWN VAULT', lx: 80,  ly: 103},
  ];

  // Pre-bake static room layout to an offscreen canvas — drawn once, blitted each frame
  const _mmOffscreen = document.createElement('canvas');
  _mmOffscreen.width  = 160;
  _mmOffscreen.height = 120;
  (function bakeMinimapBg() {
    const ctx = _mmOffscreen.getContext('2d');
    ctx.fillStyle = '#080608';
    ctx.fillRect(0, 0, 160, 120);

    const ROOM_LABELS = ['LOBBY', 'GALLERY', 'CROWN VAULT'];
    MM_ROOMS.forEach((r, i) => {
      ctx.fillStyle   = r.color;
      ctx.fillRect(r.rx, r.ry, r.rw, r.rh);
      // Colored border per room
      ctx.strokeStyle = r.label === 'LOBBY' ? '#c8722a'
                      : r.label === 'GALLERY' ? '#4a5eaa'
                      : r.label === 'CROWN VAULT' ? '#c8a030'
                      : '#6a4a8a';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(r.rx, r.ry, r.rw, r.rh);
      // Room label
      ctx.fillStyle   = r.label === 'LOBBY' ? '#e87840'
                      : r.label === 'GALLERY' ? '#7a9aff'
                      : r.label === 'CROWN VAULT' ? '#ffd060'
                      : '#b08ad0';
      ctx.font        = r.label === 'CORRIDOR' ? 'bold 7px monospace' : 'bold 8px monospace';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.label, r.lx, r.ly);
    });

    // Exit markers
    ctx.font = '6px monospace';
    ctx.textBaseline = 'middle';
    // Front gate (Z≈163) → worldToMini(0, 163)
    const fgX = 80, fgY = Math.round(5 + (163 / 165) * 108);
    ctx.fillStyle = '#22ff88';
    ctx.fillRect(fgX - 4, fgY - 3, 8, 6);
    ctx.fillStyle = 'rgba(180,255,200,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('EXIT', fgX + 5, fgY);
    // Service exit (X=-20, Z=15) → worldToMini(-20,15)
    const seX = Math.round(80 + (-20) * 1.8), seY = Math.round(5 + (15 / 165) * 108);
    ctx.fillStyle = '#ffaa22';
    ctx.fillRect(seX - 3, seY - 3, 6, 6);
    ctx.fillStyle = 'rgba(255,200,100,0.8)';
    ctx.textAlign = 'right';
    ctx.fillText('SVC', seX - 4, seY);
  }());

  function worldToMini(wx, wz) {
    return {
      mx: 80  + wx  * 1.5,
      my: 2   + (wz / 165) * 114,
    };
  }

  function drawMinimap(playerPos, guardPositions, currentRoom, playerYaw) {
    // Blit pre-rendered background — no room geometry redrawn each frame
    minimapCtx.drawImage(_mmOffscreen, 0, 0);

    // Guards — always visible; color escalates with alarm level
    if (guardPositions) {
      const lvl = window.G ? window.G.alarm.level : 0;
      const dotColor = lvl >= 2 ? '#ff2200' : lvl >= 1 ? '#ff8800' : '#e05050';
      const dotR     = lvl >= 1 ? 3.0 : 2.2;
      guardPositions.forEach(gp => {
        const { mx, my } = worldToMini(gp.x, gp.z);
        minimapCtx.fillStyle = dotColor;
        minimapCtx.beginPath();
        minimapCtx.arc(
          Math.max(2, Math.min(158, mx)),
          Math.max(2, Math.min(118, my)),
          dotR, 0, Math.PI * 2
        );
        minimapCtx.fill();
      });
    }

    // Player — gold triangle arrow showing facing direction
    if (playerPos) {
      const { mx, my } = worldToMini(playerPos.x, playerPos.z);
      const px = Math.max(5, Math.min(155, mx));
      const py = Math.max(5, Math.min(115, my));

      if (playerYaw !== undefined) {
        // Draw directional arrow triangle in the player's facing direction
        const R = 5.5;   // arrow tip distance
        const W = 3.2;   // arrow half-width at base
        // yaw=0 means player faces +Z in world which maps to +Y in minimap
        const ang = playerYaw + Math.PI; // facing direction in minimap
        const tx = px + Math.sin(ang) * R;
        const ty = py + Math.cos(ang) * R;
        const lx = px + Math.sin(ang + Math.PI * 0.6) * W;
        const ly = py + Math.cos(ang + Math.PI * 0.6) * W;
        const rx = px + Math.sin(ang - Math.PI * 0.6) * W;
        const ry = py + Math.cos(ang - Math.PI * 0.6) * W;
        minimapCtx.fillStyle = '#ffd060';
        minimapCtx.strokeStyle = '#8a5a00';
        minimapCtx.lineWidth = 0.8;
        minimapCtx.beginPath();
        minimapCtx.moveTo(tx, ty);
        minimapCtx.lineTo(lx, ly);
        minimapCtx.lineTo(rx, ry);
        minimapCtx.closePath();
        minimapCtx.fill();
        minimapCtx.stroke();
        // Center dot
        minimapCtx.fillStyle = '#fff';
        minimapCtx.beginPath();
        minimapCtx.arc(px, py, 1.8, 0, Math.PI * 2);
        minimapCtx.fill();
      } else {
        minimapCtx.fillStyle = '#c9a84c';
        minimapCtx.beginPath();
        minimapCtx.arc(px, py, 3.5, 0, Math.PI * 2);
        minimapCtx.fill();
      }
    }

    if (currentRoom) minimapLabel.textContent = 'Area: ' + currentRoom;
  }

  // ── Noise meter ────────────────────────────────────────
  function updateNoise(val) {
    const fill = $('noise-fill');
    const label = $('noise-label-val');
    if (!fill) return;
    const pct = Math.max(0, Math.min(1, val)) * 100;
    fill.style.width = pct + '%';
    const color = val > 0.75 ? '#ff3322'
                : val > 0.45 ? '#ffaa22'
                : val > 0.15 ? '#ffdd44'
                : '#44dd88';
    fill.style.background = color;
    if (label) {
      label.textContent = val > 0.75 ? 'LOUD'
                        : val > 0.45 ? 'NOISY'
                        : val > 0.15 ? 'quiet'
                        : 'silent';
      label.style.color = color;
    }
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
    smoke()    {
      _beep(180, 0.12, 0.28, 'triangle');
      _beep(120, 0.22, 0.18, 'triangle', 0.10);
    },
    door()     {
      _beep(300, 0.10, 0.2, 'triangle');
      _beep(400, 0.10, 0.2, 'triangle', 0.10);
    },
    footstep()   { _beep(70 + Math.random() * 25, 0.04, 0.04, 'triangle'); },
    glassBreak() {
      _beep(1800, 0.06, 0.22, 'sawtooth');
      _beep(1200, 0.09, 0.18, 'sawtooth', 0.04);
      _beep(900,  0.12, 0.14, 'sawtooth', 0.08);
      _beep(600,  0.15, 0.10, 'triangle', 0.14);
    },
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
    const cp  = window.getCheckpoint ? window.getCheckpoint() : null;
    const btn = $('btn-resume-checkpoint');
    if (btn) {
      if (cp) {
        btn.textContent = 'Resume from ' + cp.room;
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    }
  }

  const LB_KEY = 'lvdl_leaderboard';
  const RATING_COLORS = { S: '#ffd700', A: '#00ff88', B: '#4a9eff', C: '#ff8800' };

  function _fmt(n) { return '€' + Math.round(n).toLocaleString('fr-FR'); }

  function showWin(stats) {
    if (stats) {
      const mm = String(Math.floor(stats.time / 60)).padStart(2, '0');
      const ss = String(stats.time % 60).padStart(2, '0');
      const ratingEl = document.getElementById('win-rating');
      ratingEl.textContent = stats.rating;
      ratingEl.style.color = RATING_COLORS[stats.rating] || '#fff';
      document.getElementById('win-time').textContent    = mm + ':' + ss;
      document.getElementById('win-alerted').textContent = stats.guardsAlerted;
      document.getElementById('win-close').textContent   = stats.closeCalls;

      // Title & subtitle reflect partial vs full heist
      const titleEl    = document.getElementById('win-title');
      const subtitleEl = document.getElementById('win-subtitle');
      if (titleEl)    titleEl.textContent    = stats.partial ? 'Partial Heist!' : 'Heist Complete!';
      if (subtitleEl) subtitleEl.textContent = stats.partial
        ? 'You escaped — but not everything was stolen.'
        : 'You stole the painting and the crown — and got away clean.';

      // ── Score breakdown ──────────────────────────────
      const lootVal     = stats.money || 0;
      const timeBonus   = Math.max(0, Math.round(50000000 - stats.time * 80000));
      const alarmBonus  = stats.guardsAlerted === 0 ? 25000000 : 0;
      const fullBonus   = stats.partial ? 0 : 50000000;
      const totalScore  = lootVal + timeBonus + alarmBonus + fullBonus;

      const el = id => document.getElementById(id);
      if (el('score-loot'))        el('score-loot').textContent        = _fmt(lootVal);
      if (el('score-time-bonus'))  el('score-time-bonus').textContent  = timeBonus  > 0 ? '+' + _fmt(timeBonus)  : _fmt(0);
      if (el('score-alarm-bonus')) el('score-alarm-bonus').textContent = alarmBonus > 0 ? '+' + _fmt(alarmBonus) : _fmt(0);
      if (el('score-full-bonus'))  el('score-full-bonus').textContent  = fullBonus  > 0 ? '+' + _fmt(fullBonus)  : '—';

      const moneyEl = document.getElementById('win-money');
      if (moneyEl) moneyEl.textContent = _fmt(totalScore);

      // Leaderboard — persist top 5 by time
      const board = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
      board.push({ time: stats.time, rating: stats.rating, date: new Date().toLocaleDateString() });
      board.sort((a, b) => a.time - b.time);
      board.splice(5);
      localStorage.setItem(LB_KEY, JSON.stringify(board));

      const lbEl = document.getElementById('leaderboard-entries');
      if (lbEl) {
        lbEl.innerHTML = board.map((e, i) => {
          const m = String(Math.floor(e.time / 60)).padStart(2, '0');
          const s = String(e.time % 60).padStart(2, '0');
          const color = RATING_COLORS[e.rating] || '#ccc';
          const isNew = i === 0 && e.time === stats.time;
          const prefix = isNew ? '★ ' : (i + 1) + '. ';
          const style = isNew ? 'color:#ffd700;' : '';
          return `<div style="${style}">${prefix}${m}:${s} &nbsp;<span style="color:${color}">[${e.rating}]</span>&nbsp; ${e.date}</div>`;
        }).join('');
      }

      // Achievements display
      const achEl = document.getElementById('win-ach-list');
      if (achEl) {
        const earned = JSON.parse(localStorage.getItem('lvdl_achievements') || '[]');
        achEl.innerHTML = earned.length
          ? earned.map(a => `<div>★ <span style="color:var(--gold-light)">${a}</span></div>`).join('')
          : '<div style="color:#555">None earned yet</div>';
      }
    }
    SFX.win();
    showScreen('win');
  }

  // ── Public API ─────────────────────────────────────────
  return {
    showScreen,
    showHUD,
    updateDistractCount,
    updateSmokeCount,
    updateStamina,
    updateNoise,
    showAchievement,
    startAmbient,
    stopAmbient,
    initObjectives,
    setObjective,
    completeObjective,
    addItem,
    showPrompt,
    hidePrompt,
    showAlert,
    hideAlert,
    showLaserFlash,
    updateCoopStatus,
    showCoopStatus,
    updateAlarmTimer,
    showAlarm,
    toggleCompanionMenu,
    closeCompanionMenu,
    drawMinimap,
    getCurrentObjective,
    SFX,
    showGameOver,
    showWin,
    get companionMenuOpen() { return _menuOpen; },
  };

}());
