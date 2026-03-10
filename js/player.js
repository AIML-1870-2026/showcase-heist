'use strict';
// ── player.js ──────────────────────────────────────────────
// Player movement, physics, third-person camera, and states.
// Exposes: window.Player

window.Player = (function () {

  // ── Constants ──────────────────────────────────────────
  const SPEED_WALK   = 5.5;
  const SPEED_SPRINT = 9.5;
  const SPEED_CROUCH = 3;
  const SPEED_SLIDE  = 8;
  const GRAVITY      = -22;
  const JUMP_FORCE   = 8.5;
  const PLAYER_R     = 0.4;
  const H_NORMAL     = 1.8;
  const H_CROUCH     = 0.85;
  const CAM_DIST     = 7;
  const CAM_H_OFFSET = 4;
  const CAM_LERP     = 0.18;

  // ── State ──────────────────────────────────────────────
  let scene, camera;
  let playerMesh;
  let _leftLeg = null, _rightLeg = null;
  let _leftArm = null, _rightArm = null;

  let pos       = new THREE.Vector3(0, 0, -20);
  let vel       = new THREE.Vector3(0, 0, 0);
  let onGround  = true;
  let jumpCount = 0;

  // 'normal' | 'crouching' | 'sliding' | 'caught'
  let state     = 'normal';
  let slideTimer = 0;

  let yaw   = 0;   // camera/facing angle (radians) — 0 = camera south of player, facing into museum
  let pitch = 0.25;
  let pointerLocked = false;

  let footT = 0;
  let bobT  = 0;   // head-bob accumulator

  // ── Stamina ────────────────────────────────────────────
  let _stamina         = 1.0;
  let _staminaExhausted = false;  // debounce: prevents sprint until recovered to 0.3

  // ── Noise level ────────────────────────────────────────
  let _noiseLevel = 0;   // 0..1, drives noise meter HUD
  let _prevVelSpd = 0;   // previous frame speed to detect wall impacts

  // ── Direction arrow (floor-level, points toward objective) ─
  let _dirArrowCone = null;

  // ── Safe-cracking minigame state ───────────────────────
  let _scActive    = false;
  let _scTumbler   = 0;
  let _scAngle     = 0;
  let _scSpeed     = 1.0;
  let _scZone      = { start: 0, end: 0 };
  let _scDialCtx   = null;
  let _scStealable = null;

  // ── Lockpick minigame state ────────────────────────────
  let _lpActive   = false;
  let _lpDoor     = null;
  let _lpNeedle   = 0;      // 0..1 position of needle
  let _lpDir      = 1;      // needle sweep direction
  let _lpSpeed    = 0.7;    // fractions per second
  let _lpZone     = { start: 0.38, end: 0.58 };
  let _lpAttempts = 3;
  let _lpNeedleEl = null;
  let _lpAttEl    = null;

  function _updateLPAttempts() {
    if (_lpAttEl) _lpAttEl.textContent = '●'.repeat(_lpAttempts) + '○'.repeat(3 - _lpAttempts);
  }

  function _startLockpick(d) {
    _lpActive   = true;
    _lpDoor     = d;
    _lpNeedle   = 0;
    _lpDir      = 1;
    _lpSpeed    = 0.6 + Math.random() * 0.45;
    const sz    = 0.12 + Math.random() * 0.1;
    _lpZone     = { start: 0.18 + Math.random() * 0.52, end: 0 };
    _lpZone.end = Math.min(0.94, _lpZone.start + sz);
    _lpAttempts = 3;

    const overlay = document.getElementById('lockpick-overlay');
    if (overlay) overlay.classList.remove('hidden');
    _lpNeedleEl = document.getElementById('lp-needle');
    _lpAttEl    = document.getElementById('lp-attempts');

    const zoneEl = document.getElementById('lp-zone');
    if (zoneEl) {
      zoneEl.style.left  = (_lpZone.start * 100) + '%';
      zoneEl.style.width = ((_lpZone.end - _lpZone.start) * 100) + '%';
    }
    _updateLPAttempts();
  }

  function _attemptLockpick() {
    if (!_lpActive) return;
    const inZone = _lpNeedle >= _lpZone.start && _lpNeedle <= _lpZone.end;
    if (inZone) {
      _lpActive = false;
      document.getElementById('lockpick-overlay').classList.add('hidden');
      _lpDoor.open    = true;
      _lpDoor.opening = true;
      UI.SFX.door();
      UI.showAlert('Lockpick successful!', 2000);
      if (_lpDoor.keyRequired === 'yellow') UI.completeObjective('gallery');
      if (_lpDoor.keyRequired === 'blue')   UI.completeObjective('vault');
    } else {
      _lpAttempts--;
      UI.SFX.alert();
      Guards.notifyNoise(pos.x, pos.z, 5);
      if (_lpAttempts <= 0) {
        _lpActive = false;
        document.getElementById('lockpick-overlay').classList.add('hidden');
        UI.showAlert('Lockpick failed! Guard heard you.', 2500);
        Guards.notifyNoise(pos.x, pos.z, 8);
        if (window.Guards) Guards.triggerAlarmLevel(1);
      } else {
        _updateLPAttempts();
        // Randomise zone + speed each failed attempt
        _lpSpeed    = 0.65 + Math.random() * 0.55;
        const sz    = 0.10 + Math.random() * 0.09;
        _lpZone.start = 0.14 + Math.random() * 0.55;
        _lpZone.end   = Math.min(0.94, _lpZone.start + sz);
        const zoneEl = document.getElementById('lp-zone');
        if (zoneEl) {
          zoneEl.style.left  = (_lpZone.start * 100) + '%';
          zoneEl.style.width = ((_lpZone.end - _lpZone.start) * 100) + '%';
        }
      }
    }
  }

  function _cancelLockpick() {
    _lpActive = false;
    const overlay = document.getElementById('lockpick-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Safe-cracking helpers ──────────────────────────────
  function _newSCTumbler() {
    const zoneSize = 0.20 + Math.random() * 0.18;
    _scZone.start  = Math.random() * (Math.PI * 2 - zoneSize);
    _scZone.end    = _scZone.start + zoneSize;
    _scSpeed       = 0.85 + Math.random() * 0.7 + _scTumbler * 0.25;
    _scAngle       = 0;
  }

  function _startSafeCrack(st) {
    _scActive    = true;
    _scTumbler   = 0;
    _scStealable = st;
    _newSCTumbler();
    const overlay = document.getElementById('safe-crack-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const canvas = document.getElementById('sc-dial');
    _scDialCtx = canvas ? canvas.getContext('2d') : null;
    _updateSCLabel();
    UI.SFX.interact();
  }

  function _updateSCLabel() {
    const el = document.getElementById('sc-tumbler');
    const total = (window.G && window.G.loadout && window.G.loadout.vault) ? 2 : 3;
    if (el) el.textContent = 'Tumbler ' + (_scTumbler + 1) + ' / ' + total;
  }

  function _cancelSafeCrack() {
    _scActive = false;
    const overlay = document.getElementById('safe-crack-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function _attemptSafeCrack() {
    if (!_scActive) return;
    const a = ((_scAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a >= _scZone.start && a <= _scZone.end) {
      _scTumbler++;
      const neededTumblers = (window.G && window.G.loadout && window.G.loadout.vault) ? 2 : 3;
      if (_scTumbler >= neededTumblers) {
        _scActive = false;
        document.getElementById('safe-crack-overlay').classList.add('hidden');
        if (_scStealable) _scStealable.safeCracked = true;
        UI.showAlert('Safe cracked! Grab the Crown.', 2500);
        UI.SFX.pickup();
        if (window.Achievements) Achievements.unlock('vaultCracker');
      } else {
        _newSCTumbler();
        _updateSCLabel();
        UI.SFX.door();
      }
    } else {
      _scAngle = 0;
      UI.SFX.alert();
      UI.showAlert('Wrong position! Try again.', 1000);
    }
  }

  function tickSafeCrack(dt) {
    if (!_scActive || !_scDialCtx) return;
    _scAngle += _scSpeed * dt;
    const ctx = _scDialCtx;
    const W = 160, H = 160, cx = 80, cy = 80, R = 66;
    ctx.clearRect(0, 0, W, H);
    // Background
    ctx.fillStyle = '#08080e';
    ctx.beginPath(); ctx.arc(cx, cy, R + 8, 0, Math.PI * 2); ctx.fill();
    // Green zone arc
    const za = _scZone.start - Math.PI / 2, zb = _scZone.end - Math.PI / 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, za, zb);
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,190,75,0.4)'; ctx.stroke();
    ctx.lineWidth = 2;  ctx.strokeStyle = '#00c050'; ctx.stroke();
    // Tick marks
    for (let i = 0; i < 24; i++) {
      const ta = (i / 24) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ta) * (R - 7), cy + Math.sin(ta) * (R - 7));
      ctx.lineTo(cx + Math.cos(ta) * R,       cy + Math.sin(ta) * R);
      ctx.lineWidth = 1; ctx.strokeStyle = '#444'; ctx.stroke();
    }
    // Outer ring
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = '#2a2a3a'; ctx.stroke();
    // Needle
    const na = _scAngle - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (R - 5), cy + Math.sin(na) * (R - 5));
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.stroke();
    // Center dot
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a84c'; ctx.fill();
  }

  function tickLockpick(dt) {
    if (!_lpActive) return;
    _lpNeedle += _lpDir * _lpSpeed * dt;
    if (_lpNeedle >= 1) { _lpNeedle = 1; _lpDir = -1; }
    if (_lpNeedle <= 0) { _lpNeedle = 0; _lpDir  =  1; }
    if (_lpNeedleEl) _lpNeedleEl.style.left = (_lpNeedle * 100) + '%';
  }

  const camPos     = new THREE.Vector3(0, 5, -5);
  const _camTarget = new THREE.Vector3();

  // ── Spatial grid for wall collision ────────────────────
  // Divides the map into 10-unit cells so resolveWalls only
  // checks the ~3-8 walls near the player instead of all ~38.
  const GRID_CELL    = 10;
  let   wallGrid     = null;   // Map<string, wall[]>
  let   _gridStamp   = 0;      // frame counter for dedup — avoids Set allocation
  const _gridResult  = [];     // reused result array — zero allocations per query

  function _buildWallGrid(walls) {
    const grid = new Map();
    for (const w of walls) {
      const x0 = Math.floor(w.minX / GRID_CELL);
      const x1 = Math.floor(w.maxX / GRID_CELL);
      const z0 = Math.floor(w.minZ / GRID_CELL);
      const z1 = Math.floor(w.maxZ / GRID_CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = cx + ',' + cz;
          let cell = grid.get(key);
          if (!cell) { cell = []; grid.set(key, cell); }
          cell.push(w);
        }
      }
    }
    return grid;
  }

  function _queryWallGrid(px, pz) {
    // Lazy-build on first call (walls populated by the time player updates)
    if (!wallGrid) wallGrid = _buildWallGrid((window.G && window.G.walls) || []);
    _gridResult.length = 0;
    _gridStamp++;
    const cx = Math.floor(px / GRID_CELL);
    const cz = Math.floor(pz / GRID_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = wallGrid.get((cx + dx) + ',' + (cz + dz));
        if (!cell) continue;
        for (const w of cell) {
          if (w._gs !== _gridStamp) { w._gs = _gridStamp; _gridResult.push(w); }
        }
      }
    }
    return _gridResult;
  }

  // ── Input map ──────────────────────────────────────────
  const keys = {};

  function onKeyDown(e) {
    keys[e.code] = true;

    if (!window.G || window.G.phase !== 'playing') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (state !== 'caught' && state !== 'sliding' && (onGround || jumpCount < 2)) {
        vel.y = JUMP_FORCE;
        onGround = false;
        jumpCount++;
      }
    }

    if (e.code === 'ControlLeft' && onGround && state === 'normal') {
      state      = 'sliding';
      slideTimer = 0.65;
    }

    if (e.code === 'KeyE') {
      if (_lpActive)  { _attemptLockpick();  return; }
      if (_scActive)  { _attemptSafeCrack(); return; }
      handleInteract();
    }

    if (e.code === 'KeyQ') {
      handleDistract();
    }

    if (e.code === 'KeyF') {
      handleSmokeBomb();
    }

    if (e.code === 'KeyG') {
      handleTakedown();
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      if (window.G.mode === 'coop') UI.toggleCompanionMenu();
    }

    if (e.code === 'Escape') {
      if (_lpActive) { _cancelLockpick();  return; }
      if (_scActive) { _cancelSafeCrack(); return; }
      if (UI.companionMenuOpen) {
        UI.closeCompanionMenu();
        return;
      }
      window.G.phase = 'paused';
      UI.showScreen('pause');
      document.exitPointerLock();
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function onMouseMove(e) {
    if (!pointerLocked || !window.G || window.G.phase !== 'playing') return;
    yaw   -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch  = Math.max(-0.35, Math.min(0.55, pitch));
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === document.body;
  }

  function onCanvasClick() {
    if (window.G && window.G.phase === 'playing') {
      document.body.requestPointerLock();
    }
  }

  // ── Themed suit canvas textures ────────────────────────
  function makeSuitTex(theme) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    if (theme === 'galaxy') {
      const grad = ctx.createRadialGradient(S*0.4, S*0.35, 0, S/2, S/2, S*0.75);
      grad.addColorStop(0.0, '#1e0a40'); grad.addColorStop(0.5, '#0a0820'); grad.addColorStop(1.0, '#04030e');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 220; i++) {
        const sx = Math.random() * S, sy = Math.random() * S;
        const r  = Math.random() * 1.4 + 0.3;
        const b  = Math.floor(180 + Math.random() * 75);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.floor(b*0.7)},${Math.floor(b*0.8)},255,${0.55 + Math.random() * 0.45})`; ctx.fill();
      }
      for (let i = 0; i < 5; i++) {
        const ng = ctx.createLinearGradient(Math.random()*S, Math.random()*S, Math.random()*S, Math.random()*S);
        ng.addColorStop(0, 'rgba(80,20,180,0)'); ng.addColorStop(0.5, 'rgba(90,30,210,0.16)'); ng.addColorStop(1, 'rgba(20,80,200,0)');
        ctx.fillStyle = ng; ctx.fillRect(0, 0, S, S);
      }
    } else if (theme === 'rainbow') {
      const grad = ctx.createLinearGradient(0, 0, S, S);
      grad.addColorStop(0.00, '#ff0000');
      grad.addColorStop(0.17, '#ff8800');
      grad.addColorStop(0.33, '#ffff00');
      grad.addColorStop(0.50, '#00ff44');
      grad.addColorStop(0.67, '#0088ff');
      grad.addColorStop(0.83, '#8800ff');
      grad.addColorStop(1.00, '#ff0088');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
      // sparkle overlay
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < 60; i++) {
        ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 2.2 + 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    } else if (theme === 'sparkpink') {
      const grad = ctx.createRadialGradient(S*0.5, S*0.45, 0, S/2, S/2, S*0.75);
      grad.addColorStop(0.0, '#ff80cc'); grad.addColorStop(0.5, '#e8559a'); grad.addColorStop(1.0, '#c0306a');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 280; i++) {
        const sx = Math.random() * S, sy = Math.random() * S;
        const r  = Math.random() * 2.2 + 0.4;
        const a  = 0.5 + Math.random() * 0.5;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
      }
      for (let i = 0; i < 30; i++) {
        const sx = Math.random() * S, sy = Math.random() * S;
        ctx.beginPath(); ctx.arc(sx, sy, Math.random() * 3.5 + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,255,${0.6 + Math.random() * 0.4})`; ctx.fill();
      }
    } else if (theme === 'flower') {
      ctx.fillStyle = '#1a0d2e'; ctx.fillRect(0, 0, S, S);
      const flowerColors = ['#ff69b4','#ff99cc','#ffaadd','#cc44aa','#ff55bb','#ff88cc','#ffdd55','#ff6677'];
      for (let i = 0; i < 18; i++) {
        const fx = Math.random() * S, fy = Math.random() * S;
        const fr = 8 + Math.random() * 10;
        const petals = 5 + Math.floor(Math.random() * 3);
        const col = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        for (let p = 0; p < petals; p++) {
          const angle = (p / petals) * Math.PI * 2;
          const px = fx + Math.cos(angle) * fr, py = fy + Math.sin(angle) * fr;
          ctx.beginPath(); ctx.ellipse(px, py, fr * 0.55, fr * 0.35, angle, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(fx, fy, fr * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#ffee88'; ctx.fill();
      }
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath(); ctx.arc(Math.random()*S, Math.random()*S, Math.random()*1.5+0.3, 0, Math.PI*2);
        ctx.fillStyle = 'white'; ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    } else if (theme === 'snakeskin') {
      ctx.fillStyle = '#0d1a08'; ctx.fillRect(0, 0, S, S);
      const SW = 20, SH = 13;
      for (let row = 0; row * SH < S + SH; row++) {
        for (let col = -1; col * SW < S + SW; col++) {
          const ox = (row % 2) * (SW / 2);
          const ex = col * SW + ox + SW / 2, ey = row * SH + SH / 2;
          const bright = 0.45 + Math.random() * 0.4;
          const g = Math.floor(28 + bright * 65);
          ctx.beginPath();
          ctx.ellipse(ex, ey, SW / 2 - 1, SH / 2 - 1, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${Math.floor(g*0.28)},${g},${Math.floor(g*0.18)})`; ctx.fill();
          ctx.strokeStyle = 'rgba(4,10,2,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 5);
    return tex;
  }

  // ── Mesh ───────────────────────────────────────────────
  function buildMesh(sc) {
    const group = new THREE.Group();

    const custom    = window.G && window.G.playerCustom || {};
    const suitHex   = custom.suitColor !== undefined ? custom.suitColor : 0x1a1a2e;
    const eyeHex    = custom.eyeColor  !== undefined ? custom.eyeColor  : 0x88ccff;
    const suitTheme = custom.suitTheme || null;
    const hairStyle = custom.hairStyle || 'ponytail';
    const hairHex   = custom.hairColor !== undefined ? custom.hairColor : 0x0a0604;
    const skinHex   = custom.skinColor !== undefined ? custom.skinColor : 0xd4a07a;

    const matSuit = suitTheme
      ? new THREE.MeshStandardMaterial({ map: makeSuitTex(suitTheme), roughness: 0.78, metalness: 0.05 })
      : new THREE.MeshStandardMaterial({ color: suitHex, roughness: 0.82, metalness: 0.05 });
    const matVest   = new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 0.80, metalness: 0.06 });
    const matHelmet = new THREE.MeshStandardMaterial({ color: 0x0d0d14, roughness: 0.85, metalness: 0.12 });
    const matSkin   = new THREE.MeshStandardMaterial({ color: skinHex,  roughness: 0.80, metalness: 0.0  });
    const matGogF   = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.45, metalness: 0.70 });
    const matGogL   = new THREE.MeshStandardMaterial({ color: eyeHex, emissive: eyeHex, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
    const matStrap  = new THREE.MeshStandardMaterial({ color: 0x252535, roughness: 0.90, metalness: 0.10 });
    const matBoot   = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.50, metalness: 0.30 });
    const matGold   = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.35, metalness: 0.70, emissive: 0x443310, emissiveIntensity: 0.4 });
    const matMetal  = new THREE.MeshStandardMaterial({ color: 0x667788, roughness: 0.40, metalness: 0.80 });
    const matRope   = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.95, metalness: 0.0  });

    // ── Legs ─────────────────────────────────────────────
    const legPivots = [-0.14, 0.14].map(xOff => {
      const pivot = new THREE.Group();
      pivot.position.set(xOff, 1.0, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.52, 7), matSuit);
      thigh.position.y = -0.26; thigh.castShadow = true;
      pivot.add(thigh);

      // Knee pad (flat box, not a sphere joint)
      const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.10), matVest);
      kneePad.position.set(0, -0.52, -0.02);
      pivot.add(kneePad);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.40, 7), matSuit);
      shin.position.y = -0.73; shin.castShadow = true;
      pivot.add(shin);

      // Tall boot shaft covers lower shin
      const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.22, 7), matBoot);
      bootShaft.position.y = -0.85;
      bootShaft.castShadow = true;
      pivot.add(bootShaft);
      // Boot foot (slightly forward, flat-bottomed)
      const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.10, 0.35), matBoot);
      bootFoot.position.set(0, -0.97, -0.06);
      bootFoot.castShadow = true;
      pivot.add(bootFoot);

      group.add(pivot);
      return pivot;
    });
    group.userData.leftLeg  = legPivots[0];
    group.userData.rightLeg = legPivots[1];

    // ── Torso ─────────────────────────────────────────────
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.245, 0.72, 8), matSuit);
    torso.position.y = 1.32; torso.castShadow = true;
    group.add(torso);

    // Tactical vest front plate
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.07), matVest);
    vest.position.set(0, 1.35, -0.25);
    group.add(vest);

    // Three horizontal vest straps
    [1.52, 1.32, 1.13].forEach(y => {
      const hStrap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.028, 0.09), matStrap);
      hStrap.position.set(0, y, -0.22);
      group.add(hStrap);
    });

    // X-cross diagonal harness
    const dStrap1 = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.50, 0.055), matStrap);
    dStrap1.position.set(0.07, 1.35, -0.27);
    dStrap1.rotation.z = 0.30;
    group.add(dStrap1);
    const dStrap2 = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.50, 0.055), matStrap);
    dStrap2.position.set(-0.07, 1.35, -0.27);
    dStrap2.rotation.z = -0.30;
    group.add(dStrap2);

    // Belt + pouches
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.055, 8), matGold);
    belt.position.y = 0.99;
    group.add(belt);
    [-0.19, 0.19].forEach(xOff => {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.07), matVest);
      pouch.position.set(xOff, 0.99, -0.21);
      group.add(pouch);
    });

    // ── Backpack ─────────────────────────────────────────
    const matPack = new THREE.MeshStandardMaterial({ color: 0x12121c, roughness: 0.88, metalness: 0.05 });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.40, 0.16), matPack);
    pack.position.set(0, 1.37, 0.27);
    pack.castShadow = true;
    group.add(pack);
    const packTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.07), matStrap);
    packTop.position.set(0, 1.62, 0.32);
    group.add(packTop);
    const packPocket = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.13, 0.06), matStrap);
    packPocket.position.set(0, 1.19, 0.34);
    group.add(packPocket);

    // ── Arms ─────────────────────────────────────────────
    const armPivots = [-0.29, 0.29].map(xOff => {
      const pivot = new THREE.Group();
      pivot.position.set(xOff, 1.60, 0);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.077, 0.38, 7), matSuit);
      upper.position.y = -0.19; upper.castShadow = true;
      pivot.add(upper);

      // Elbow pad (box, not a sphere joint)
      const elbowPad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.10), matVest);
      elbowPad.position.set(0, -0.38, 0.01);
      pivot.add(elbowPad);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.065, 0.32, 7), matSuit);
      fore.position.y = -0.55; fore.castShadow = true;
      pivot.add(fore);

      // Box glove (more human than a sphere)
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 0.14), matBoot);
      glove.position.set(0, -0.74, -0.01);
      glove.castShadow = true;
      pivot.add(glove);

      group.add(pivot);
      return pivot;
    });
    group.userData.leftArm  = armPivots[0];
    group.userData.rightArm = armPivots[1];

    // ── Grappling hook on LEFT arm ────────────────────────
    // Barrel extending from left glove
    const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.30, 6), matMetal);
    gBarrel.rotation.z = Math.PI / 2;
    gBarrel.position.set(0.20, -0.74, 0);
    armPivots[0].add(gBarrel);
    // Reel/body on barrel
    const gReel = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.065, 8), matMetal);
    gReel.rotation.z = Math.PI / 2;
    gReel.position.set(0.08, -0.74, 0);
    armPivots[0].add(gReel);
    // Four hook prongs fanning out from tip
    [-0.055, -0.018, 0.018, 0.055].forEach(zOff => {
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.004, 0.20, 4), matMetal);
      prong.position.set(0.40 + Math.abs(zOff) * 1.5, -0.74 + zOff * 0.6, zOff);
      prong.rotation.z = 0.50 + Math.abs(zOff) * 1.5;
      armPivots[0].add(prong);
    });
    // Rope coil near hip
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.022, 5, 10), matRope);
    coil.position.set(-0.20, 1.01, -0.17);
    coil.rotation.x = Math.PI / 3;
    group.add(coil);

    // ── Neck ─────────────────────────────────────────────
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.12, 7), matSuit);
    neck.position.y = 1.69;
    group.add(neck);

    // ── Head — large, low-poly skin-tone face ─────────────
    // Fewer segments = visible low-poly facets like the reference
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 7, 5), matSkin);
    head.position.set(0, 1.88, -0.03);
    head.castShadow = true;
    group.add(head);

    // ── Goggles on the face at actual eye level ───────────
    [-0.097, 0.097].forEach(xOff => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.092, 0.058), matGogF);
      frame.position.set(xOff, 1.86, -0.308);
      group.add(frame);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.070, 0.030), matGogL);
      lens.position.set(xOff, 1.86, -0.326);
      group.add(lens);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.028, 0.045), matGogF);
    bridge.position.set(0, 1.86, -0.311);
    group.add(bridge);

    // ── Hair — parented directly to head (Roblox-style attachment) ───
    // All positions are in head-local space: (0,0,0) = head centre.
    // Head radius = 0.29. Cap shell radius = 0.308 (just outside).
    // thetaLength = PI*0.52 (~94°) covers crown + upper sides only,
    // leaving the face and lower head fully visible like Roblox accessories.
    const matHair = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.92, metalness: 0.0 });
    const matBand = new THREE.MeshStandardMaterial({ color: 0x330033, roughness: 0.8, metalness: 0.1 });

    const _cap = (thetaLen = Math.PI * 0.52) => {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.308, 10, 8, 0, Math.PI * 2, 0, thetaLen),
        matHair
      );
      // Centred on head — position (0,0,0) in local space = head centre
      head.add(cap);
    };

    if (hairStyle === 'ponytail') {
      _cap();
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.082, 0.22, 8), matHair);
      root.position.set(0, 0.06, 0.25); root.rotation.x = 0.45; head.add(root);
      const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.30, 7), matHair);
      mid.position.set(0, -0.07, 0.43); mid.rotation.x = 0.72; head.add(mid);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.016, 0.26, 6), matHair);
      tip.position.set(0, -0.26, 0.60); tip.rotation.x = 0.84; head.add(tip);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.017, 6, 12), matBand);
      band.position.set(0, 0.00, 0.30); band.rotation.x = Math.PI / 2 + 0.45; head.add(band);

    } else if (hairStyle === 'pigtails') {
      _cap();
      [-0.28, 0.28].forEach(x => {
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.20, 7), matHair);
        root.position.set(x * 0.85, 0.04, 0.22);
        root.rotation.x = 0.38; root.rotation.z = x > 0 ? -0.50 : 0.50; head.add(root);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.022, 0.28, 6), matHair);
        tail.position.set(x * 1.10, -0.16, 0.38);
        tail.rotation.x = 0.64; tail.rotation.z = x > 0 ? -0.44 : 0.44; head.add(tail);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.015, 6, 10), matBand);
        band.position.set(x * 0.85, 0.04, 0.27); band.rotation.x = Math.PI / 2 + 0.38; head.add(band);
      });

    } else if (hairStyle === 'spaceBuns') {
      _cap(Math.PI * 0.52);
      [-0.22, 0.22].forEach(x => {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.064, 0.09, 7), matHair);
        stem.position.set(x, 0.28, -0.01); head.add(stem);
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.112, 9, 7), matHair);
        bun.position.set(x, 0.37, -0.01); bun.scale.set(1, 0.90, 1.05); head.add(bun);
      });

    } else if (hairStyle === 'longStraight') {
      _cap(Math.PI * 0.52);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.238, 0.80, 10), matHair);
      back.position.set(0, -0.44, 0.16); back.rotation.x = 0.10; head.add(back);
      [-0.24, 0.24].forEach(x => {
        const side = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.088, 0.70, 8), matHair);
        side.position.set(x, -0.38, -0.01);
        side.rotation.z = x > 0 ? -0.13 : 0.13; head.add(side);
      });
      [-0.10, 0, 0.10].forEach(x => {
        const wisp = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.024, 0.26, 5), matHair);
        wisp.position.set(x, -0.22, -0.20);
        wisp.rotation.x = -0.28; head.add(wisp);
      });

    } else if (hairStyle === 'downCurly') {
      _cap(Math.PI * 0.52);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.282, 0.228, 0.70, 10), matHair);
      back.position.set(0, -0.40, 0.16); back.rotation.x = 0.08; head.add(back);
      [-0.17, 0, 0.17].forEach((x, i) => {
        const curl = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.038, 6, 9, Math.PI * 1.5), matHair);
        curl.position.set(x, -0.64, 0.30 + i * 0.02);
        curl.rotation.x = Math.PI / 2 + 0.30; head.add(curl);
      });
      [-0.24, 0.24].forEach(x => {
        const side = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.084, 0.62, 7), matHair);
        side.position.set(x, -0.34, 0.04);
        side.rotation.z = x > 0 ? -0.16 : 0.16; head.add(side);
        const curl = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.030, 6, 8, Math.PI * 1.35), matHair);
        curl.position.set(x * 1.12, -0.55, 0.10);
        curl.rotation.x = Math.PI / 2 + 0.22; head.add(curl);
      });
    }

    // ── Direction arrow — floor-level, rotates independently toward objective ──
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 1.2,
      roughness: 0.3, metalness: 0.2, depthTest: false,
    });
    // Pivot at player feet — we rotate this pivot's Y independently of the player mesh
    const arrowPivot = new THREE.Group();
    arrowPivot.position.set(0, 0.12, 0);
    const arrowCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 5), arrowMat);
    arrowCone.rotation.x = -Math.PI / 2;  // tip points in local -Z of pivot
    arrowCone.position.set(0, 0, -0.90);
    arrowCone.renderOrder = 999;
    arrowPivot.add(arrowCone);
    // Small stem behind the cone tip
    const arrowStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 5), arrowMat);
    arrowStem.rotation.x = Math.PI / 2;
    arrowStem.position.set(0, 0, -0.56);
    arrowStem.renderOrder = 999;
    arrowPivot.add(arrowStem);
    group.add(arrowPivot);
    _dirArrowCone = arrowPivot;

    sc.add(group);
    return group;
  }

  // ── Collision ──────────────────────────────────────────
  function resolveWalls() {
    const wallList = _queryWallGrid(pos.x, pos.z);
    for (const w of wallList) {
      const pMinX = pos.x - PLAYER_R;
      const pMaxX = pos.x + PLAYER_R;
      const pMinZ = pos.z - PLAYER_R;
      const pMaxZ = pos.z + PLAYER_R;

      if (pMaxX > w.minX && pMinX < w.maxX &&
          pMaxZ > w.minZ && pMinZ < w.maxZ) {
        const overX = Math.min(pMaxX - w.minX, w.maxX - pMinX);
        const overZ = Math.min(pMaxZ - w.minZ, w.maxZ - pMinZ);
        if (overX < overZ) {
          pos.x += pos.x < (w.minX + w.maxX) / 2 ? -overX : overX;
        } else {
          pos.z += pos.z < (w.minZ + w.maxZ) / 2 ? -overZ : overZ;
        }
      }
    }
  }

  // ── Camera wall clamp ──────────────────────────────────
  // Sweeps from player toward desired camera position; stops before any wall AABB.
  function _safeCameraPos(tx, tz) {
    const G = window.G;
    if (!G || !G.walls) return { x: tx, z: tz };
    const dx = tx - pos.x, dz = tz - pos.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return { x: tx, z: tz };
    const nx = dx / len, nz = dz / len;
    let minT = len;
    const R = 0.25; // camera radius padding
    for (const w of G.walls) {
      let t0x, t1x, t0z, t1z;
      if (Math.abs(nx) < 1e-8) {
        if (pos.x + R < w.minX || pos.x - R > w.maxX) continue;
        t0x = -Infinity; t1x = Infinity;
      } else {
        t0x = (w.minX - R - pos.x) / nx;
        t1x = (w.maxX + R - pos.x) / nx;
        if (t0x > t1x) { const tmp = t0x; t0x = t1x; t1x = tmp; }
      }
      if (Math.abs(nz) < 1e-8) {
        if (pos.z + R < w.minZ || pos.z - R > w.maxZ) continue;
        t0z = -Infinity; t1z = Infinity;
      } else {
        t0z = (w.minZ - R - pos.z) / nz;
        t1z = (w.maxZ + R - pos.z) / nz;
        if (t0z > t1z) { const tmp = t0z; t0z = t1z; t1z = tmp; }
      }
      const tenter = Math.max(t0x, t0z);
      const texit  = Math.min(t1x, t1z);
      if (texit > tenter && tenter > 0 && tenter < minT) minT = tenter - 0.1;
    }
    const t = Math.max(0, Math.min(minT, len)) / len;
    return { x: pos.x + dx * t, z: pos.z + dz * t };
  }

  // ── Victory dance ──────────────────────────────────────
  let _danceT = 0;
  function tickDance(dt) {
    if (!playerMesh) return;
    _danceT += dt;
    // Spin
    playerMesh.rotation.y += dt * 3.5;
    // Arms raised and waving
    if (_leftArm)  _leftArm.rotation.x  = -Math.PI / 2 + Math.sin(_danceT * 9) * 0.45;
    if (_rightArm) _rightArm.rotation.x = -Math.PI / 2 + Math.cos(_danceT * 9) * 0.45;
    // Legs kicking alternately
    if (_leftLeg)  _leftLeg.rotation.x  =  Math.sin(_danceT * 9) * 0.6;
    if (_rightLeg) _rightLeg.rotation.x = -Math.sin(_danceT * 9) * 0.6;
    // Hop up and down
    playerMesh.position.set(pos.x, pos.y + Math.abs(Math.sin(_danceT * 7)) * 0.55, pos.z);
  }

  // ── Update ─────────────────────────────────────────────
  function update(dt) {
    const G = window.G;
    if (!G) return;
    if (G.phase === 'escaping') { tickDance(dt); return; }
    if (G.phase !== 'playing') return;
    tickLockpick(dt);
    tickSafeCrack(dt);
    if (state === 'caught') return;

    // Slide timer
    if (state === 'sliding') {
      slideTimer -= dt;
      if (slideTimer <= 0) state = 'normal';
    }

    // State from input (only when not already sliding)
    if (state !== 'sliding') {
      if (keys['ShiftLeft'] || keys['ShiftRight']) state = 'crouching';
      else if (keys['KeyR'] && !_staminaExhausted) state = 'sprinting';
      else                                         state = 'normal';
    }

    // Stamina drain / regen
    if (state === 'sprinting') {
      _stamina = Math.max(0, _stamina - 0.28 * dt);
      if (_stamina <= 0) { _staminaExhausted = true; state = 'normal'; }
    } else {
      _stamina = Math.min(1, _stamina + 0.18 * dt);
      if (_staminaExhausted && _stamina >= 0.3) _staminaExhausted = false;
    }
    if (window.G) window.G._stamina = _stamina;
    UI.updateStamina(_stamina);

    // Movement input
    let mx = 0, mz = 0;
    if (state !== 'sliding') {
      if (keys['KeyW'] || keys['ArrowUp'])    mz += 1;
      if (keys['KeyS'] || keys['ArrowDown'])  mz -= 1;
      if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    } else {
      mz = 1; // slide continues forward
    }

    const spd = state === 'crouching' ? SPEED_CROUCH
              : state === 'sliding'   ? SPEED_SLIDE
              : state === 'sprinting' ? SPEED_SPRINT
              : SPEED_WALK;

    const moving = mx !== 0 || mz !== 0;

    // Noise level — rises when moving (louder when sprinting), decays when still/crouching
    const _noiseTgt = moving
      ? (state === 'sprinting' ? 1.0 : state === 'sliding' ? 0.7 : state === 'crouching' ? 0.05 : 0.45)
      : 0;
    _noiseLevel += (_noiseTgt - _noiseLevel) * Math.min(1, dt * 3.5);
    if (window.G) window.G._noiseLevel = _noiseLevel;

    if (moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len; mz /= len;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      // Three.js lookAt gives camera screen-right = (-cos, 0, sin), so strafe signs are negated
      vel.x = (sin * mz - cos * mx) * spd;
      vel.z = (cos * mz + sin * mx) * spd;

      // Face movement direction
      playerMesh.rotation.y = Math.atan2(vel.x, vel.z) + Math.PI;

      // Footstep SFX + noise
      footT -= dt;
      if (footT <= 0) {
        if (state !== 'crouching') UI.SFX.footstep();
        if (window.G) window.G._dustEvent = { x: pos.x, z: pos.z };
        footT = state === 'crouching' ? 0.55 : state === 'sprinting' ? 0.17 : 0.27;
        // Broadcast noise to nearby guards — crouching is silent
        if (state !== 'crouching' && window.Guards) {
          const r = state === 'sliding' ? 6.0 : state === 'sprinting' ? 7.5 : 3.5;
          Guards.notifyNoise(pos.x, pos.z, r);
        }
      }
    } else {
      const friction = Math.pow(0.65, dt * 60);
      vel.x *= friction;
      vel.z *= friction;
    }

    // Gravity
    vel.y += GRAVITY * dt;

    // Integrate
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    // Ground clamp
    if (pos.y <= 0) {
      pos.y    = 0;
      vel.y    = 0;
      onGround = true;
      jumpCount = 0;
    } else {
      onGround = false;
    }

    // Rooftop floor — blocks player from falling through until skylight hatch is opened
    const _G = window.G;
    if (_G && _G.loadout && _G.loadout.rappel && _G.skylightHatch && !_G.skylightHatch.open) {
      const _roofY = _G.skylightHatch.roofY;
      if (pos.y <= _roofY && vel.y <= 0) {
        pos.y    = _roofY;
        vel.y    = 0;
        onGround = true;
        jumpCount = 0;
      }
    }

    // Wall collision — capture position before resolve to detect impact
    const _preX = pos.x, _preZ = pos.z;
    resolveWalls();
    const _wallCorrDist = Math.sqrt(
      (pos.x - _preX) * (pos.x - _preX) + (pos.z - _preZ) * (pos.z - _preZ)
    );

    // Noise level update
    {
      let noiseTarget = 0;
      if      (state === 'sprinting')                 noiseTarget = 0.85;
      else if (state === 'sliding')                   noiseTarget = 0.55;
      else if (moving && state !== 'crouching')       noiseTarget = 0.28;
      else if (state === 'crouching' && moving)       noiseTarget = 0.05;
      const rate = noiseTarget > _noiseLevel ? 2.5 : 1.4;
      _noiseLevel += (noiseTarget - _noiseLevel) * rate * dt;
      // Wall impact spike — louder the harder you hit
      if (_wallCorrDist > 0.04) {
        _noiseLevel = Math.min(1, _noiseLevel + _wallCorrDist * 3.5);
      }
      _noiseLevel = Math.max(0, Math.min(1, _noiseLevel));
      if (window.G) window.G._noiseLevel = _noiseLevel;
      UI.updateNoise(_noiseLevel);
    }

    // Mesh height scale for crouching/sliding
    const h = (state === 'crouching' || state === 'sliding') ? H_CROUCH : H_NORMAL;
    playerMesh.scale.y = h / H_NORMAL;
    playerMesh.position.set(pos.x, pos.y, pos.z);

    // Head bob — only accumulate when moving on ground
    const bobSpeed  = state === 'crouching' ? 6 : 11;
    const bobAmount = state === 'crouching' ? 0.04 : 0.07;
    if (moving && onGround) {
      bobT += dt * bobSpeed;
    }
    const bobAmp = (moving && onGround) ? bobAmount : 0;
    const currentBob = Math.sin(bobT) * bobAmp;

    // Limb swing — legs and arms counter-swing for natural gait
    const legSwing = (moving && onGround) ? (state === 'crouching' ? 0.32 : state === 'sprinting' ? 0.75 : 0.52) : 0.0;
    const armSwing = legSwing * 0.7;
    const cycle = Math.sin(bobT);
    if (_leftLeg)  _leftLeg.rotation.x  =  cycle * legSwing;
    if (_rightLeg) _rightLeg.rotation.x = -cycle * legSwing;
    if (_leftArm)  _leftArm.rotation.x  = -cycle * armSwing;
    if (_rightArm) _rightArm.rotation.x  =  cycle * armSwing;

    // Frame-rate independent camera lerp: same feel at any fps
    const lerpAlpha = 1 - Math.pow(1 - CAM_LERP, dt * 60);
    const idealX = pos.x - Math.sin(yaw) * CAM_DIST;
    const idealZ = pos.z - Math.cos(yaw) * CAM_DIST;
    const cy = pos.y + CAM_H_OFFSET + pitch * 3 + currentBob;
    const safe = _safeCameraPos(idealX, idealZ);
    _camTarget.set(safe.x, cy, safe.z);
    camPos.lerp(_camTarget, lerpAlpha);
    camera.position.copy(camPos);
    camera.lookAt(pos.x, pos.y + 1.4, pos.z);
  }

  // ── Interact (E key) ───────────────────────────────────
  function handleInteract() {
    const G = window.G;
    if (!G || G.phase !== 'playing') return;
    const REACH2 = 3.2 * 3.2;

    // Check keycards
    for (const kc of G.keycardPickups) {
      if (kc.collected) continue;
      const _dx = kc.x - pos.x, _dz = kc.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        kc.collected    = true;
        kc.mesh.visible = false;
        G.inventory[kc.key] = true;
        G._pickupFlash  = 1.0;
        UI.addItem(kc.key);
        UI.SFX.pickup();
        const name = kc.key.charAt(0).toUpperCase() + kc.key.slice(1);
        UI.showAlert(name + ' keycard secured!', 2500);
        if (kc.key === 'yellow') UI.completeObjective('yellow');
        if (kc.key === 'blue')   UI.completeObjective('blue');
        return;
      }
    }

    // Check stealable items
    for (const st of G.stealables) {
      if (st.taken) continue;
      const _dx = st.x - pos.x, _dz = st.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        // Crown Vault safe must be cracked first
        if (st.needsSafe && !st.safeCracked) {
          _startSafeCrack(st);
          return;
        }
        // Glass case must be smashed first
        if (st.hasCase && !st.caseBroken) {
          st.caseBroken = true;
          if (st.caseMesh) st.caseMesh.visible = false;
          UI.SFX.glassBreak();
          UI.showAlert('Glass smashed! Guards alerted!', 2500);
          Guards.notifyNoise(pos.x, pos.z, 9);
          if (window.Security) Security.triggerAlarmLevel(1);
          return;
        }
        // UV-locked items require the UV key
        if (st.needsUV && !G.inventory.uvKey) {
          UI.showAlert('Need UV key to unlock case.', 2000);
          return;
        }
        st.taken        = true;
        st.mesh.visible = false;
        G._pickupFlash  = 1.0;
        G._moneyStolen  = (G._moneyStolen || 0) + (st.value || 0);
        UI.SFX.pickup();
        if (st.bonus) {
          // Bonus stealable — no objective, no inventory flag needed for win
          UI.showAlert((st.label || st.item) + ' stolen! ALARM!', 3500);
        } else {
          G.inventory[st.item] = true;
          UI.addItem(st.item === 'painting' ? 'painting' : 'crown');
          UI.showAlert((st.item === 'painting' ? 'Painting' : 'Crown') + ' stolen! ALARM!', 3500);
          UI.completeObjective(st.item);
        }
        // Alert guards but do NOT start countdown — only laser trips start the timer
        if (window.Guards) Guards.triggerAlarmLevel(3);
        return;
      }
    }

    // Check coin caches
    for (const cp of (G.coinPickups || [])) {
      if (cp.collected) continue;
      const _dx = cp.x - pos.x, _dz = cp.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        cp.collected    = true;
        cp.mesh.visible = false;
        G.distractCount += cp.amount;
        UI.updateDistractCount(G.distractCount);
        G._pickupFlash  = 0.8;
        UI.SFX.pickup();
        UI.showAlert('Found ' + cp.amount + ' distraction coin' + (cp.amount > 1 ? 's' : '') + '!', 2000);
        return;
      }
    }

    // Check hack terminals
    for (const tm of G.terminals) {
      if (tm.hacked) continue;
      const _dx = tm.x - pos.x, _dz = tm.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        tm.hacked = true;
        if (tm.type === 'breaker') {
          G._powerOut = true;
          G._powerOutTimer = 30;
          if (window.Guards) Guards.setPowerOut && Guards.setPowerOut(true);
          UI.SFX.interact();
          UI.showAlert('Power cut! Guards half-blind for 30s.', 3000);
        } else {
          if (window.Security) Security.hackCameras(20);
          UI.SFX.interact();
          UI.showAlert('Cameras looped for 20 seconds.', 2500);
        }
        return;
      }
    }

    // Check skylight hatch (rappel entry)
    if (G.skylightHatch && !G.skylightHatch.open && !G.skylightHatch.opening && pos.y > 5) {
      const _hx = G.skylightHatch.x - pos.x, _hz = G.skylightHatch.z - pos.z;
      if (_hx * _hx + _hz * _hz < 3.5 * 3.5) {
        G.skylightHatch.opening = true;
        G.skylightHatch._animT  = 0;
        UI.SFX.door();
        UI.showAlert('Skylight pried open!', 2000);
        return;
      }
    }

    // Check vent shafts
    for (const v of (G.vents || [])) {
      const _dx = v.entryX - pos.x, _dz = v.entryZ - pos.z;
      const _ex = v.exitX  - pos.x, _ez = v.exitZ  - pos.z;
      const nearEntry = _dx * _dx + _dz * _dz < 2.8 * 2.8;
      const nearExit  = _ex * _ex + _ez * _ez < 2.8 * 2.8;
      if (nearEntry || nearExit) {
        if (state !== 'crouching') { UI.showAlert('Crouch to use the vent!', 1500); return; }
        let destX, destZ, destY;
        if (nearEntry) {
          destX = v.exitX; destZ = v.exitZ;
          destY = (v.exitY !== undefined) ? v.exitY : 0;
        } else {
          destX = v.entryX; destZ = v.entryZ;
          destY = 0;
        }
        pos.set(destX, destY, destZ);
        vel.set(0, 0, 0);
        wallGrid = null; // rebuild collision grid
        const label = v.label || 'vent';
        UI.showAlert('Entered ' + label + '...', 1800);
        UI.SFX.interact();
        return;
      }
    }

    // Check doors
    for (const d of G.doors) {
      if (d.open) continue;
      const _dx = d.x - pos.x, _dz = d.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        if (!d.keyRequired || G.inventory[d.keyRequired]) {
          d.open    = true;
          d.opening = true;
          // Mesh hide + AABB removal now handled by tickDoors() when animation completes
          UI.SFX.door();
          if (d.keyRequired === 'yellow') UI.completeObjective('gallery');
          if (d.keyRequired === 'blue')   UI.completeObjective('vault');
        } else if (G.loadout && G.loadout.lockpick) {
          // Lockpick kit — auto-open without minigame
          d.open    = true;
          d.opening = true;
          UI.SFX.door();
          UI.showAlert('Lockpick Kit: door auto-opened!', 2000);
          if (d.keyRequired === 'yellow') UI.completeObjective('gallery');
          if (d.keyRequired === 'blue')   UI.completeObjective('vault');
        } else {
          // No keycard — offer lockpicking
          _startLockpick(d);
        }
        return;
      }
    }
  }

  // ── Smoke bomb (F key) ─────────────────────────────────
  function handleSmokeBomb() {
    const G = window.G;
    if (!G || G.phase !== 'playing') return;
    if ((G.smokeCount || 0) <= 0) { UI.showAlert('No smoke bombs!', 1500); return; }
    G.smokeCount--;
    UI.updateSmokeCount(G.smokeCount);
    const sx = pos.x + Math.sin(yaw) * 4;
    const sz = pos.z + Math.cos(yaw) * 4;
    G._smokeClouds.push({ x: sx, z: sz, r: 5.5, t: 0, maxT: 9.0 });
    G._smokeEvent = { x: sx, z: sz };
    UI.SFX.smoke();
    UI.showAlert('Smoke deployed!', 1500);
    if (window.Achievements) Achievements.unlock('smokeMaster');
  }

  // ── Takedown (G key) ───────────────────────────────────
  function handleTakedown() {
    const G = window.G;
    if (!G || G.phase !== 'playing' || !window.Guards) return;
    const facingX = Math.sin(yaw);
    const facingZ = Math.cos(yaw);
    const success = Guards.tryTakedown(pos.x, pos.z, facingX, facingZ);
    if (success) {
      UI.SFX.interact();
      UI.showAlert('Guard subdued! (45s)', 2000);
      G.takedownCount = (G.takedownCount || 0) + 1;
      if (window.Achievements && G.takedownCount >= 2) Achievements.unlock('nightcap');
    }
  }

  // ── Distract (Q key) ───────────────────────────────────
  function handleDistract() {
    if (!window.Guards) return;
    const G = window.G;
    if (!G) return;
    if (G.distractCount <= 0) { UI.showAlert('No coins left!', 1500); return; }
    G.distractCount--;
    G._usedDistract = true;
    UI.updateDistractCount(G.distractCount);

    const noiseX = pos.x + Math.sin(yaw) * 7;
    const noiseZ = pos.z + Math.cos(yaw) * 7;
    G._noiseEvent  = { x: noiseX, z: noiseZ };
    G._throwEvent  = { ox: pos.x, oy: pos.y + 1.4, oz: pos.z,
                       vx: Math.sin(yaw) * 10, vy: 4, vz: Math.cos(yaw) * 10 };
    Guards.notifyNoise(noiseX, noiseZ, 9);
    UI.SFX.interact();
  }

  // ── Proximity prompt (called each frame) ───────────────
  function updatePrompt() {
    const G = window.G;
    if (!G || G.phase !== 'playing') { UI.hidePrompt(); return; }
    const REACH2 = 3.2 * 3.2;
    let found = false;

    for (const kc of G.keycardPickups) {
      if (kc.collected) continue;
      const _dx = kc.x - pos.x, _dz = kc.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        UI.showPrompt('[E] Pick up ' + kc.key + ' keycard');
        found = true; break;
      }
    }
    if (!found) for (const st of G.stealables) {
      if (st.taken) continue;
      const _dx = st.x - pos.x, _dz = st.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        const prompt = (st.needsSafe && !st.safeCracked)
          ? '[E] Crack the vault safe'
          : (st.hasCase && !st.caseBroken)
          ? '[E] Smash case — ' + (st.label || st.item)
          : '[E] Steal the ' + (st.label || st.item);
        UI.showPrompt(prompt);
        found = true; break;
      }
    }
    if (!found) for (const cp of (G.coinPickups || [])) {
      if (cp.collected) continue;
      const _dx = cp.x - pos.x, _dz = cp.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        UI.showPrompt('[E] Grab coins (+' + cp.amount + ')');
        found = true; break;
      }
    }
    if (!found) for (const tm of G.terminals) {
      if (tm.hacked) continue;
      const _dx = tm.x - pos.x, _dz = tm.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        UI.showPrompt(tm.type === 'breaker' ? '[E] Cut the power (30s)' : '[E] Hack terminal');
        found = true; break;
      }
    }
    if (!found && G.skylightHatch && !G.skylightHatch.open && !G.skylightHatch.opening && pos.y > 5) {
      const _hx = G.skylightHatch.x - pos.x, _hz = G.skylightHatch.z - pos.z;
      if (_hx * _hx + _hz * _hz < 3.5 * 3.5) {
        UI.showPrompt('[E] Pry open skylight hatch');
        found = true;
      }
    }
    if (!found) for (const v of (G.vents || [])) {
      const _dx = v.entryX - pos.x, _dz = v.entryZ - pos.z;
      const _ex = v.exitX  - pos.x, _ez = v.exitZ  - pos.z;
      if (_dx * _dx + _dz * _dz < 2.8 * 2.8 || _ex * _ex + _ez * _ez < 2.8 * 2.8) {
        UI.showPrompt(state === 'crouching' ? '[E] Crawl through vent' : '[Shift+E] Crouch to use vent');
        found = true; break;
      }
    }

    // Skylight drop-in prompt — once hatch is open
    if (!found && G.skylightHatch && G.skylightHatch.open && pos.y > 5) {
      const _hx = G.skylightHatch.x - pos.x, _hz = G.skylightHatch.z - pos.z;
      if (_hx * _hx + _hz * _hz < 2.5 * 2.5) {
        UI.showPrompt('[Walk over] Drop through skylight');
        found = true;
      }
    }

    // Takedown prompt — show when player is sneaking behind an eligible guard
    if (!found && window.Guards && Guards.checkTakedownAvailable(pos.x, pos.z)) {
      UI.showPrompt('[G] Takedown guard (non-lethal)');
      found = true;
    }

    if (!found) for (const d of G.doors) {
      if (d.open) continue;
      const _dx = d.x - pos.x, _dz = d.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        const isEntry = d.keyRequired === 'entry';
        const locked  = d.keyRequired && !G.inventory[d.keyRequired];
        UI.showPrompt(isEntry ? '[E] Pick the front lock' : locked ? '[E] Lockpick door (risky)' : '[E] Open door');
        found = true; break;
      }
    }
    // Escape route prompts
    if (!found && G.inventory.painting && G.inventory.crown) {
      // Service exit (west lobby wall, X=-20, Z=15)
      const seDx = pos.x - (-20), seDz = pos.z - 15;
      if (seDx * seDx + seDz * seDz < 3.5 * 3.5) {
        UI.showPrompt('[Walk in] Service Exit — escape now!');
        found = true;
      }
      // Front gate (Z > 155)
      if (!found && pos.z > 155) {
        UI.showPrompt('[Walk through] Front Gate — escape now!');
        found = true;
      }
      // Helipad (rooftop, rappel perk only)
      if (!found && G.loadout && G.loadout.rappel && pos.y > 5) {
        const hDx = pos.x - 0, hDz = pos.z - (-8);
        if (hDx * hDx + hDz * hDz < 4 * 4) {
          UI.showPrompt('[Walk to] Helipad — helicopter extract!');
          found = true;
        }
      }
    }

    if (!found) UI.hidePrompt();
  }

  // ── Init ───────────────────────────────────────────────
  function init(sc, cam) {
    scene  = sc;
    camera = cam;

    playerMesh  = buildMesh(sc);
    _leftLeg    = playerMesh.userData.leftLeg;
    _rightLeg   = playerMesh.userData.rightLeg;
    _leftArm    = playerMesh.userData.leftArm;
    _rightArm   = playerMesh.userData.rightArm;

    document.addEventListener('keydown',          onKeyDown);
    document.addEventListener('keyup',            onKeyUp);
    document.addEventListener('mousemove',        onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('click',            onCanvasClick);
  }

  function reset() {
    pos.set(0, 0, -20);
    vel.set(0, 0, 0);
    state             = 'normal';
    onGround          = true;
    jumpCount         = 0;
    yaw               = 0;
    pitch             = 0.25;
    _stamina          = 1.0;
    _staminaExhausted = false;
    _scActive         = false;
    _cancelSafeCrack();
    // Rebuild mesh so suit/eye colours from customisation screen take effect
    if (playerMesh) scene.remove(playerMesh);
    playerMesh = buildMesh(scene);
    _leftLeg   = playerMesh.userData.leftLeg;
    _rightLeg  = playerMesh.userData.rightLeg;
    _leftArm   = playerMesh.userData.leftArm;
    _rightArm  = playerMesh.userData.rightArm;
  }

  function setCaught() {
    state = 'caught';
    vel.set(0, 0, 0);
  }

  function resume() {
    if (state === 'caught') state = 'normal';
  }

  // ── Door open animations ───────────────────────────────
  function tickDoors(dt) {
    const G = window.G;
    if (!G) return;
    G.doors.forEach(d => {
      if (!d.opening || d.openProgress >= 1) return;
      d.openProgress = Math.min(1, d.openProgress + dt / 0.45);
      const s = 1 - d.openProgress;
      d.mesh.scale.y    = s;
      d.mesh.position.y = 3 + 3 * d.openProgress;  // top stays fixed, bottom rises
      if (d.openProgress >= 1) {
        d.mesh.visible = false;
        const idx = G.walls.findIndex(w =>
          Math.abs((w.minX + w.maxX) / 2 - d.x) < 2 &&
          Math.abs((w.minZ + w.maxZ) / 2 - d.z) < 1
        );
        if (idx >= 0) {
          G.walls.splice(idx, 1);
          wallGrid = _buildWallGrid(G.walls);
        }
      }
    });
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init,
    update,
    updatePrompt,
    reset,
    setCaught,
    resume,
    tickDoors,
    getPosition()    { return pos.clone(); },
    getPositionRef() { return pos; },
    getYaw()         { return yaw; },
    setDirArrowAngle(worldAngle) {
      if (!_dirArrowCone || !playerMesh) return;
      // localY = worldAngle - playerMesh.rotation.y - PI
      // because cone tip (after rotation.x=-PI/2) points in local -Z of pivot,
      // and pivotLocalZ world-direction = pivotY + playerMeshY, with -PI/2 tip: worldAngle = pivotY + playerMeshY + PI
      _dirArrowCone.rotation.y = worldAngle - playerMesh.rotation.y - Math.PI;
    },
    setDirArrowVisible(v) { if (_dirArrowCone) _dirArrowCone.visible = v; },
    getState()       { return state; },
    isCrouching()    { return state === 'crouching'; },
    isSliding()      { return state === 'sliding'; },
    getPlayerY()     { return pos.y; },
    simulateKey(code, down) { keys[code] = down; },
    setPosition(x, y, z) {
      pos.set(x, y, z);
      vel.set(0, 0, 0);
      if (playerMesh) playerMesh.position.set(x, y, z);
    },
    // Build a standalone mesh for the customize screen preview (not added to game scene)
    buildPreviewMesh(suitColor, eyeColor, suitTheme, hairStyle, hairColor, skinColor) {
      const prev = window.G && window.G.playerCustom;
      if (window.G) window.G.playerCustom = {
        suitColor, eyeColor, suitTheme: suitTheme || null,
        hairStyle: hairStyle || 'ponytail',
        hairColor: hairColor !== undefined ? hairColor : 0x0a0604,
        skinColor: skinColor !== undefined ? skinColor : 0xd4a07a,
      };
      const g = buildMesh({ add() {} });
      if (window.G) window.G.playerCustom = prev;
      return g;
    },
  };

}());
