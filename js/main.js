'use strict';
// ── main.js ────────────────────────────────────────────────
// Scene setup, renderer, lighting, game loop, and state machine.
// Initialises all modules and coordinates every frame.

(function () {

  // ── Renderer ───────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled  = true;
  renderer.shadowMap.type     = THREE.PCFShadowMap;
  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputEncoding     = THREE.sRGBEncoding;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // ── Scene & camera ─────────────────────────────────────
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1018);
  scene.fog        = new THREE.Fog(0x0c1220, 18, 72);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 200);
  camera.position.set(0, 5, -5);

  // No post-processing — use plain renderer for crisp output

  const clock = new THREE.Clock();

  // ── Shared game state (window.G) ───────────────────────
  window.G = {
    phase:          'start',   // 'start' | 'playing' | 'paused' | 'gameover' | 'won'
    mode:           'solo',    // 'solo'  | 'coop'
    difficulty:     'easy',    // 'easy' | 'normal' | 'hard'
    walls:          [],
    doors:          [],
    keycardPickups: [],
    stealables:     [],
    coinPickups:    [],
    terminals:      [],
    vents:          [],
    alarm:          { level: 0, active: false },
    inventory:      { yellow: false, blue: false, red: false, painting: false, crown: false },
    playerCaught:   false,
    currentRoom:    'Lobby',
    _alarmLight:    null,
    _pickupFlash:   0,
    _moneyStolen:   0,
    _noiseEvent:    null,
    _dustEvent:     null,
    _smokeEvent:        null,
    _smokeClouds:       [],
    _glassShatterEvent: null,
    _stamina:       1.0,
    smokeCount:     1,
    _startMs:       0,
    guardsAlerted:  0,
    closeCalls:     0,
    distractCount:  3,
    _usedDistract:  false,
    takedownCount:  0,
    loadout:        { smoke: false, lockpick: false, coins: false, vault: false, rappel: false },
    _throwEvent:    null,
    _powerOut:      false,
    _powerOutTimer: 0,
    _checkpointReached:     { Gallery: false, 'Crown Vault': false },
    _checkpointData:        null,
    _earnedAchs:            null,
    _vaultCinematicDone:    false,
    _vaultCinematicActive:  false,
  };

  // ── Achievement system ─────────────────────────────────
  const ACH_DEFS = {
    ghost:        { name: 'Ghost',         desc: 'Won with zero guards alerted' },
    speedDemon:   { name: 'Speed Demon',   desc: 'Escaped in under 3 minutes' },
    pacifist:     { name: 'Pacifist',      desc: 'Escaped without using distractions' },
    masterThief:  { name: 'Master Thief',  desc: 'Achieved S rating' },
    smokeMaster:  { name: 'Smoke Screen',  desc: 'Used a smoke bomb' },
    vaultCracker: { name: 'Vault Cracker', desc: 'Cracked the Crown Vault safe' },
    nightcap:     { name: 'Nightcap',      desc: 'Subdued 2 guards without being caught' },
  };
  window.Achievements = {
    unlock(id) {
      const G = window.G;
      if (!G._earnedAchs) G._earnedAchs = new Set();
      if (G._earnedAchs.has(id)) return;
      G._earnedAchs.add(id);
      const def = ACH_DEFS[id];
      if (def) UI.showAchievement(def.name, def.desc);
      const stored = new Set(JSON.parse(localStorage.getItem('lvdl_achievements') || '[]'));
      stored.add(def ? def.name : id);
      localStorage.setItem('lvdl_achievements', JSON.stringify([...stored]));
    },
  };

  function checkEndAchievements(elapsed, alerted, rating) {
    const G = window.G;
    if (alerted === 0)        Achievements.unlock('ghost');
    if (elapsed < 180)        Achievements.unlock('speedDemon');
    if (!G._usedDistract)     Achievements.unlock('pacifist');
    if (rating === 'S')       Achievements.unlock('masterThief');
  }

  // ── Hit-flash state ────────────────────────────────────
  let _prevCaught    = false;
  const caughtFlashEl = document.getElementById('caught-flash');

  // ── Lighting ───────────────────────────────────────────
  const flickerLights = [];  // point lights that flicker during alarm
  let sun = null;            // directional light — updated each frame to follow player

  function setupLighting() {
    // Ambient — cool moonlit glow throughout
    scene.add(new THREE.AmbientLight(0x8cb8d8, 0.58));

    // Directional (museum overhead style) — smaller frustum, higher-res map, follows player
    sun = new THREE.DirectionalLight(0xd0e0f8, 0.65);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 120;
    sun.shadow.camera.left   = -28;
    sun.shadow.camera.right  =  28;
    sun.shadow.camera.top    =  28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.bias = -0.0015;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    scene.add(sun.target);

    // Lobby — warm golden chandelier glow
    [ [-8, 4.5, 10], [8, 4.5, 10], [-8, 4.5, 30], [8, 4.5, 30] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xe8b460, 0.82, 28);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Corridor 1 — eerie security-room teal
    [ [0, 4.5, 44], [0, 4.5, 51] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0x40d8a0, 0.60, 18);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Gallery — warm amber dramatic art-gallery glow
    [ [-10, 5, 65], [10, 5, 65], [0, 5, 80], [-10, 5, 95], [10, 5, 95] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xff8833, 0.70, 24);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Corridor 2 — deep violet mystery
    [ [0, 4.5, 104], [0, 4.5, 111] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0x9050d8, 0.60, 18);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Crown Vault — deep crimson dramatic light
    [ [-10, 4.5, 125], [10, 4.5, 125], [0, 4.5, 140], [-10, 4.5, 155], [10, 4.5, 155] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xc02828, 0.80, 28);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });
    // Gold accent on crown pedestal
    const vaultAccent = new THREE.PointLight(0xffd060, 0.60, 14);
    vaultAccent.position.set(0, 3, 140);
    vaultAccent._baseIntensity = vaultAccent.intensity;
    scene.add(vaultAccent);
    flickerLights.push(vaultAccent);

    // Egyptian Catacomb — warm torch-orange, deliberately dim and flickery
    [ [33, 3.2, 128], [49, 3.2, 128], [33, 3.2, 147], [49, 3.2, 147] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xff6600, 0.70, 13);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });
    // Altar glow — deep amber centre light
    const egyptAltarLight = new THREE.PointLight(0xff8833, 0.38, 15);
    egyptAltarLight.position.set(41, 2.8, 137.5);
    egyptAltarLight._baseIntensity = egyptAltarLight.intensity;
    scene.add(egyptAltarLight);
    flickerLights.push(egyptAltarLight);

    // Gallery painting spotlights — warm amber gallery lighting
    [
      // [sx, sz,  tx, ty, tz]  — light pos → painting target
      [-20, 92,  -24.9, 3.8, 92],   // famous painting (stealable)
      [-20, 70,  -24.9, 3.5, 70],   // gallery west
      [ 20, 80,   24.9, 3.5, 80],   // gallery east
      [ 20, 60,   24.9, 3.5, 60],   // gallery east 2
    ].forEach(([sx, sz, tx, ty, tz]) => {
      const spot = new THREE.SpotLight(0xffcc88, 0.90, 14, Math.PI / 8, 0.38);
      spot.position.set(sx, 5.5, sz);
      spot.target.position.set(tx, ty, tz);
      spot.castShadow = false;
      spot._baseIntensity = spot.intensity;
      scene.add(spot);
      scene.add(spot.target);
      flickerLights.push(spot);
    });

    // Lobby painting spotlights
    [
      [-16,  8,  -19.9, 3.5,  8],
      [-16, 28,  -19.9, 3.5, 28],
      [ 16, 16,   19.9, 3.5, 16],
    ].forEach(([sx, sz, tx, ty, tz]) => {
      const spot = new THREE.SpotLight(0xc8d8f8, 0.65, 11, Math.PI / 8, 0.38);
      spot.position.set(sx, 5.5, sz);
      spot.target.position.set(tx, ty, tz);
      spot.castShadow = false;
      spot._baseIntensity = spot.intensity;
      scene.add(spot);
      scene.add(spot.target);
      flickerLights.push(spot);
    });

    // Red alarm light (intensity driven at runtime)
    const alarmLight = new THREE.PointLight(0xff2200, 0, 80);
    alarmLight.position.set(0, 5, 80);
    scene.add(alarmLight);
    window.G._alarmLight = alarmLight;
  }

  // ── Map build ──────────────────────────────────────────
  function buildMap() {
    const data = GameMap.init(scene);
    window.G.walls          = data.walls;
    window.G.doors          = data.doors;
    window.G.keycardPickups = data.keycardPickups;
    window.G.stealables     = data.stealables;
    window.G.coinPickups    = data.coinPickups;
    window.G.terminals      = data.terminals;
    window.G.vents          = data.vents || [];
    window.G.skylightHatch  = data.skylightHatch || null;
    Guards.init(scene, data.guardData);
    Security.init(scene, data.laserData, data.cameraData);
  }

  // ── Checkpoint system ──────────────────────────────────
  const CP_KEY = 'showcase-heist-checkpoint';
  const CP_SPAWN = { 'Gallery': 57, 'Crown Vault': 117 };

  function _buildObjectivesArray() {
    const G = window.G;
    const r = G.currentRoom;
    return [
      true,                                                        // enter
      G.inventory.yellow,                                          // yellow keycard
      r === 'Gallery' || r === 'Crown Vault',                      // gallery
      G.inventory.painting,                                        // painting
      G.inventory.blue,                                            // blue keycard
      G.inventory.crown,                                           // crown
      false,                                                       // escape (never at checkpoint)
    ];
  }

  function saveCheckpoint(room) {
    const G = window.G;
    const cp = {
      version:             1,
      room,
      spawnX:              0,
      spawnZ:              CP_SPAWN[room],
      inventory:           Object.assign({}, G.inventory),
      difficulty:          G.difficulty,
      mode:                G.mode,
      distractCount:       G.distractCount,
      objectivesCompleted: _buildObjectivesArray(),
      timestamp:           Date.now(),
    };
    G._checkpointData = cp;
    localStorage.setItem(CP_KEY, JSON.stringify(cp));
  }

  function getCheckpoint() {
    const raw = localStorage.getItem(CP_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  window.getCheckpoint = getCheckpoint;

  function resumeFromCheckpoint() {
    const cp = getCheckpoint();
    if (!cp || cp.version !== 1) return;

    // Suppress rooftop spawn during checkpoint resume — position is restored below
    const savedRappel = window.G.loadout.rappel;
    window.G.loadout.rappel = false;
    startGame(cp.mode || 'solo');
    window.G.loadout.rappel = savedRappel;

    const G = window.G;
    G.difficulty    = cp.difficulty;
    G.distractCount = cp.distractCount;
    Object.assign(G.inventory, cp.inventory);
    UI.updateDistractCount(cp.distractCount);

    // Restore inventory HUD slots
    Object.entries(cp.inventory).forEach(([key, val]) => {
      if (val) UI.addItem(key);
    });

    // Restore objectives HUD
    const OBJ_ORDER = ['enter','yellow','gallery','painting','blue','vault','crown','escape'];
    cp.objectivesCompleted.forEach((done, i) => {
      if (done) UI.completeObjective(OBJ_ORDER[i]);
    });

    Player.setPosition(cp.spawnX, 0, cp.spawnZ);

    G._checkpointReached['Gallery']     = true;
    G._checkpointReached['Crown Vault'] = cp.room === 'Crown Vault';

    Guards.setDifficulty(cp.difficulty);
    Security.setDifficulty(cp.difficulty);
  }
  window.resumeFromCheckpoint = resumeFromCheckpoint;

  // ── Room detection ─────────────────────────────────────
  function updateRoom(z) {
    const G = window.G;
    const prevRoom = G.currentRoom;
    if      (z < 40)  G.currentRoom = 'Lobby';
    else if (z < 55)  G.currentRoom = 'Corridor';
    else if (z < 100) G.currentRoom = 'Gallery';
    else if (z < 115) G.currentRoom = 'Corridor';
    else              G.currentRoom = 'Crown Vault';

    if (G.phase === 'playing') {
      const r = G.currentRoom;
      if (CP_SPAWN[r] && r !== prevRoom && !G._checkpointReached[r]) {
        G._checkpointReached[r] = true;
        saveCheckpoint(r);
      }
      if (r === 'Crown Vault' && r !== prevRoom && !G._vaultCinematicDone) {
        startVaultCinematic();
      }
    }
  }

  // ── Stealth rating ─────────────────────────────────────
  function calcRating(seconds, alerted, closeCalls) {
    const d = window.G.difficulty;
    const sTime = d === 'hard' ? 260 : d === 'easy' ? 600 : 200;
    const aTime = d === 'hard' ? 480 : d === 'easy' ? 900 : 360;
    const bTime = d === 'hard' ? 720 : d === 'easy' ? 1500 : 600;
    if (alerted === 0 && closeCalls === 0 && seconds < sTime) return 'S';
    if (alerted === 0 && seconds < aTime)                     return 'A';
    if (alerted <= 1  && seconds < bTime)                     return 'B';
    return 'C';
  }

  // ── Win check ──────────────────────────────────────────
  let _escapePartial = false;  // true when escaping with partial loot

  function _triggerEscape(partial) {
    const G = window.G;
    _escapePartial = partial || false;
    G.phase = 'escaping';
    _escapeTimer   = 0;
    _escapeElapsed = Math.floor((Date.now() - G._startMs) / 1000);
    UI.completeObjective('escape');
    Music.stop();
    document.exitPointerLock();
  }

  function checkWin(pos) {
    const G = window.G;
    const hasAnyLoot = G.inventory.painting || G.inventory.crown;
    const hasFullLoot = G.inventory.painting && G.inventory.crown;

    // Feature 8: Service exit (west Lobby, X=-20, Z=15)
    if (hasAnyLoot) {
      const seDx = pos.x - (-20), seDz = pos.z - 15;
      if (seDx * seDx + seDz * seDz < 1.5 * 1.5) {
        _triggerEscape(!hasFullLoot);
        return;
      }
    }

    // Feature 8: Helicopter exit (rooftop, rappel perk, X=0 Y>5 Z≈-8)
    if (G.loadout.rappel && hasAnyLoot && pos.y > 5) {
      const heDx = pos.x - 0, heDz = pos.z - (-8);
      if (heDx * heDx + heDz * heDz < 3 * 3) {
        _triggerEscape(!hasFullLoot);
        return;
      }
    }

    if (pos.z < 163) return;
    if (hasAnyLoot) {
      _triggerEscape(!hasFullLoot);
    } else {
      // Escaped with nothing — mission failed
      G.phase = 'gameover';
      Music.stop();
      document.exitPointerLock();
      UI.showGameOver('Mission Failed', 'You escaped empty-handed.');
    }
  }

  // ── Escape cutscene ────────────────────────────────────
  let _escapeTimer   = 0;
  let _escapeElapsed = 0;
  const _CAM_END  = new THREE.Vector3(-18, 32, 174);
  const _LOOK_END = new THREE.Vector3(0, 10, 205);

  function tickEscapeCutscene(dt) {
    _escapeTimer += dt;
    const G = window.G;

    // Camera smoothly sweeps to wide shot of the pyramid
    const t = Math.min(1, _escapeTimer / 3.0);
    const ease = t * t * (3 - 2 * t);
    camera.position.lerp(_CAM_END, ease * dt * 1.8 + dt * 0.3);
    camera.lookAt(_LOOK_END);

    // After 5 seconds trigger celebration overlay then win screen
    if (_escapeTimer >= 5.0 && G.phase === 'escaping') {
      G.phase = 'celebrating';
      const rating = calcRating(_escapeElapsed, G.guardsAlerted, G.closeCalls);
      checkEndAchievements(_escapeElapsed, G.guardsAlerted, rating);
      UI.stopAmbient();
      _showCelebration({ time: _escapeElapsed, guardsAlerted: G.guardsAlerted, closeCalls: G.closeCalls, rating, money: G._moneyStolen, partial: _escapePartial });
    }
  }

  // ── Celebration overlay ────────────────────────────────
  let _celebRaf = null;
  function _showCelebration(stats) {
    const overlay  = document.getElementById('celebration-screen');
    const canvas   = document.getElementById('celebration-canvas');
    if (!overlay || !canvas) {
      // Fallback: go straight to win
      window.G.phase = 'won';
      UI.showWin(stats);
      return;
    }
    overlay.style.display = 'block';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    // Build a small Three.js scene for the celebration
    const celRdr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    celRdr.setSize(canvas.width, canvas.height, false);
    celRdr.outputEncoding = THREE.sRGBEncoding;
    const celScene = new THREE.Scene();
    celScene.background = null;
    celScene.add(new THREE.AmbientLight(0x8ab0e0, 0.6));
    const keyL = new THREE.DirectionalLight(0xd0e8ff, 1.1);
    keyL.position.set(3, 6, 3); celScene.add(keyL);
    const rimL = new THREE.DirectionalLight(0x4488ff, 0.6);
    rimL.position.set(-3, 1, -2); celScene.add(rimL);

    const celCam = new THREE.PerspectiveCamera(55, canvas.width / canvas.height, 0.1, 60);
    celCam.position.set(0, 1.6, 4.2);
    celCam.lookAt(0, 1.4, 0);

    // Character mesh using player customisation
    const custom = window.G.playerCustom || {};
    const charMesh = Player.buildPreviewMesh(
      custom.suitColor, custom.eyeColor, custom.suitTheme,
      custom.hairStyle, custom.hairColor, custom.skinColor,
      custom.shoeColor, custom.shoeTheme, custom.sparkleIntensity, custom.jewelryColor
    );
    charMesh.position.set(0, 0, 0);
    celScene.add(charMesh);

    // Raise arms for celebration: rotate arm groups up
    const lArm = charMesh.userData.leftArm;
    const rArm = charMesh.userData.rightArm;
    if (lArm) lArm.rotation.z =  1.2;
    if (rArm) rArm.rotation.z = -1.2;

    // Floating painting (coloured rectangle)
    const paintGeo = new THREE.BoxGeometry(0.55, 0.42, 0.04);
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xc9a030, emissive: 0x443300, emissiveIntensity: 0.3 });
    const paintMesh = new THREE.Mesh(paintGeo, paintMat);
    paintMesh.position.set(-1.1, 2.0, 0.5);
    celScene.add(paintMesh);
    // Canvas face on painting
    const faceGeo = new THREE.PlaneGeometry(0.46, 0.34);
    const faceC   = document.createElement('canvas'); faceC.width = faceC.height = 128;
    const fCtx    = faceC.getContext('2d');
    const grad    = fCtx.createLinearGradient(0,0,128,128);
    grad.addColorStop(0,'#8b6914'); grad.addColorStop(1,'#d4a850');
    fCtx.fillStyle = grad; fCtx.fillRect(0,0,128,128);
    fCtx.fillStyle = '#6a4510'; fCtx.beginPath(); fCtx.ellipse(64,64,22,28,0,0,Math.PI*2); fCtx.fill();
    const faceTex = new THREE.CanvasTexture(faceC);
    paintMesh.add(new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTex })));
    paintMesh.children[0].position.z = 0.025;

    // Floating crown
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x665500, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.9 });
    const crownGroup = new THREE.Group();
    crownGroup.position.set(1.0, 2.3, 0.4);
    celScene.add(crownGroup);
    const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.10, 8), crownMat);
    crownGroup.add(crownBase);
    [0, 1, 2, 3, 4].forEach(i => {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 5), crownMat);
      const ang = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(ang) * 0.13, 0.14, Math.sin(ang) * 0.13);
      crownGroup.add(spike);
    });

    // Confetti particles — burst launch from bottom with gravity
    const confettiColors = [0xff69b4, 0xffdd00, 0x44ddff, 0x88ff44, 0xffa500, 0xcc44ff, 0xff4444, 0xffffff];
    const confetti = [];
    const CONFETTI_COUNT = 140;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const isBig = i < 20;
      const w = isBig ? (0.10 + Math.random() * 0.06) : (0.04 + Math.random() * 0.05);
      const h = isBig ? (0.10 + Math.random() * 0.06) : (0.02 + Math.random() * 0.04);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.005),
        new THREE.MeshBasicMaterial({ color: confettiColors[i % confettiColors.length] })
      );
      // Burst from near-bottom centre, with upward velocity
      m.position.set((Math.random() - 0.5) * 2.5, -0.5 + Math.random() * 1.0, (Math.random() - 0.5) * 1.5);
      m.userData.vy   = 1.8 + Math.random() * 3.5;   // initial upward burst
      m.userData.vx   = (Math.random() - 0.5) * 2.2;
      m.userData.vz   = (Math.random() - 0.5) * 1.0;
      m.userData.spin = (Math.random() - 0.5) * 8;
      m.userData.spinY = (Math.random() - 0.5) * 5;
      celScene.add(m);
      confetti.push(m);
    }

    let celT = 0;
    let lastNow = performance.now();
    function celLoop() {
      _celebRaf = requestAnimationFrame(celLoop);
      const now = performance.now();
      const dt2 = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;
      celT += dt2;

      charMesh.rotation.y = Math.PI + Math.sin(celT * 1.5) * 0.35;
      paintMesh.position.y = 2.0 + Math.sin(celT * 2.0) * 0.12;
      paintMesh.rotation.z = Math.sin(celT * 1.3) * 0.12;
      crownGroup.position.y = 2.3 + Math.cos(celT * 2.2) * 0.12;

      confetti.forEach(c => {
        c.userData.vy -= 3.5 * dt2;  // gravity
        c.position.y  += c.userData.vy  * dt2;
        c.position.x  += c.userData.vx  * dt2;
        c.position.z  += c.userData.vz  * dt2;
        c.rotation.z  += c.userData.spin  * dt2;
        c.rotation.y  += c.userData.spinY * dt2;
        if (c.position.y < -1.5) {
          // Respawn at bottom with new burst
          c.position.set((Math.random() - 0.5) * 3, -1, (Math.random() - 0.5) * 1.5);
          c.userData.vy = 1.2 + Math.random() * 2.5;
        }
      });

      celRdr.render(celScene, celCam);

      if (celT >= 4.0) {
        cancelAnimationFrame(_celebRaf);
        _celebRaf = null;
        celRdr.dispose();
        overlay.style.display = 'none';
        window.G.phase = 'won';
        UI.showWin(stats);
      }
    }
    celLoop();
  }

  // ── Alarm light pulse + flicker ────────────────────────
  let alarmPulse = 0;
  let flickerT   = 0;
  function tickAlarmLight(dt) {
    const G     = window.G;
    const light = G._alarmLight;
    if (!light) return;
    if (G.alarm.active) {
      alarmPulse += dt * 5;
      light.intensity = 0.35 + Math.abs(Math.sin(alarmPulse)) * 0.35;

      // Flicker static room lights
      flickerT += dt * 18;
      const flicker = 0.6 + Math.sin(flickerT) * 0.28 + Math.sin(flickerT * 2.73) * 0.12;
      flickerLights.forEach(l => { l.intensity = l._baseIntensity * flicker; });

    } else {
      light.intensity = 0;
      flickerLights.forEach(l => { l.intensity = l._baseIntensity; });
    }
  }

  // ── Aerial view ────────────────────────────────────────
  let _aerialActive    = false;
  const _aerialCamPos  = new THREE.Vector3();
  const _aerialCamSave = new THREE.Vector3();

  function _setAerial(on) {
    _aerialActive = on;
    if (window.G) window.G.aerialView = on;
    const btn = document.getElementById('btn-aerial');
    if (btn) btn.classList.toggle('active', on);
    // Hide/show ceiling slabs so aerial view shows the floor plan
    if (scene) {
      scene.traverse(obj => {
        if (obj.isMesh && obj.userData.aerialhide) obj.visible = !on;
      });
    }
    // Clear fog in aerial view for a bright, readable overhead map
    if (scene.fog) {
      if (on) {
        scene.fog.near = 300;
        scene.fog.far  = 500;
      } else {
        scene.fog.near = 18;
        scene.fog.far  = 72;
      }
    }
    if (!on) {
      // Snap camera back (player.js will lerp it naturally next frame)
      _aerialCamSave.copy(camera.position);
    }
  }

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyV' && window.G && window.G.phase === 'playing') {
      e.preventDefault();
      _setAerial(!_aerialActive);
    }
  });
  const _aerialBtn = document.getElementById('btn-aerial');
  if (_aerialBtn) {
    _aerialBtn.addEventListener('mousedown',  () => _setAerial(true));
    _aerialBtn.addEventListener('mouseup',    () => _setAerial(false));
    _aerialBtn.addEventListener('mouseleave', () => _setAerial(false));
    _aerialBtn.addEventListener('touchstart', e => { e.preventDefault(); _setAerial(true); }, { passive: false });
    _aerialBtn.addEventListener('touchend',   e => { e.preventDefault(); _setAerial(false); }, { passive: false });
  }

  function tickAerialView(playerPos) {
    if (!_aerialActive) return;
    // Smooth camera to bird's-eye position above player
    const targetX = playerPos.x;
    const targetY = 70;
    const targetZ = playerPos.z;
    _aerialCamPos.set(targetX, targetY, targetZ);
    camera.position.lerp(_aerialCamPos, 0.14);
    camera.lookAt(playerPos.x, 0, playerPos.z);
  }

  // ── Screen shake ───────────────────────────────────────
  let shakeDecay       = 0;  // one-shot shake amplitude, decays to 0
  let prevAlarmActive  = false;
  function tickScreenShake(dt) {
    const alarm = window.G.alarm;
    // One-shot burst when alarm first activates
    if (alarm.active && !prevAlarmActive) {
      shakeDecay = 0.32;
      const pp = Player.getPositionRef();
      spawnSparks(pp.x, pp.y + 1.5, pp.z);
    }
    prevAlarmActive = alarm.active;

    if (shakeDecay > 0) shakeDecay = Math.max(0, shakeDecay - dt * 1.1);

    const intensity = alarm.active ? 0.04 + shakeDecay : shakeDecay;
    if (intensity > 0.001) {
      camera.position.x += (Math.random() - 0.5) * intensity;
      camera.position.y += (Math.random() - 0.5) * intensity * 0.5;
    }
  }

  // ── Dust mote particles ────────────────────────────────
  const DUST_COUNT = 180;
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustVelocities = new Float32Array(DUST_COUNT);  // y-drift speed per particle
  (function initDust() {
    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3]     = (Math.random() - 0.5) * 44;         // x: -22 to 22
      dustPositions[i * 3 + 1] = Math.random() * 5;                  // y: 0-5
      dustPositions[i * 3 + 2] = Math.random() * 160 + 2;            // z: 2-162
      dustVelocities[i]        = 0.04 + Math.random() * 0.08;        // drift speed
    }
  }());
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMesh = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffe8cc, size: 0.06, transparent: true, opacity: 0.35, sizeAttenuation: true,
  }));
  scene.add(dustMesh);

  // ── Alarm sparks ───────────────────────────────────────
  const SPARK_COUNT  = 50;
  const sparkPos     = new Float32Array(SPARK_COUNT * 3);
  const sparkVel     = new Float32Array(SPARK_COUNT * 3);
  const sparkLife    = new Float32Array(SPARK_COUNT);
  const sparkMaxLife = new Float32Array(SPARK_COUNT);
  let   sparksActive = false;

  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMesh = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xff6600, size: 0.12, transparent: true, opacity: 1.0, sizeAttenuation: true,
  }));
  sparkMesh.visible = false;
  scene.add(sparkMesh);

  function spawnSparks(ox, oy, oz) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      sparkPos[i * 3]     = ox + (Math.random() - 0.5) * 0.5;
      sparkPos[i * 3 + 1] = oy;
      sparkPos[i * 3 + 2] = oz + (Math.random() - 0.5) * 0.5;
      sparkVel[i * 3]     = Math.cos(angle) * speed;
      sparkVel[i * 3 + 1] = 2 + Math.random() * 4;
      sparkVel[i * 3 + 2] = Math.sin(angle) * speed;
      sparkLife[i]         = 0;
      sparkMaxLife[i]      = 0.8 + Math.random() * 0.8;
    }
    sparksActive = true;
    sparkMesh.visible = true;
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function tickDustAndSparks(dt) {
    // Drift dust motes upward, wrap at top
    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3 + 1] += dustVelocities[i] * dt;
      if (dustPositions[i * 3 + 1] > 5.2) dustPositions[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;

    if (!sparksActive) return;
    let anyAlive = false;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (sparkLife[i] >= sparkMaxLife[i]) continue;
      sparkLife[i] += dt;
      sparkPos[i * 3]     += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += (sparkVel[i * 3 + 1] - 9.8 * sparkLife[i]) * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      anyAlive = true;
    }
    if (anyAlive) sparkGeo.attributes.position.needsUpdate = true;
    sparkMesh.material.opacity = Math.max(0, 1 - (sparksActive ? 0 : 1));
    if (!anyAlive) { sparksActive = false; sparkMesh.visible = false; }
  }

  // ── Footstep dust puffs ────────────────────────────────
  const PUFF_COUNT = 10;
  const puffPos    = new Float32Array(PUFF_COUNT * 3);
  const puffVel    = new Float32Array(PUFF_COUNT * 3);
  const puffLife   = new Float32Array(PUFF_COUNT);
  let   puffActive = false;

  const puffGeo  = new THREE.BufferGeometry();
  puffGeo.setAttribute('position', new THREE.BufferAttribute(puffPos, 3));
  const puffMesh = new THREE.Points(puffGeo, new THREE.PointsMaterial({
    color: 0xd8cdb8, size: 0.18, transparent: true, opacity: 0.55, sizeAttenuation: true,
  }));
  puffMesh.visible = false;
  scene.add(puffMesh);

  function spawnDustPuff(ox, oz) {
    for (let i = 0; i < PUFF_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 0.4 + Math.random() * 0.8;
      puffPos[i * 3]     = ox + (Math.random() - 0.5) * 0.3;
      puffPos[i * 3 + 1] = 0.05;
      puffPos[i * 3 + 2] = oz + (Math.random() - 0.5) * 0.3;
      puffVel[i * 3]     = Math.cos(angle) * spd;
      puffVel[i * 3 + 1] = 0.5 + Math.random() * 0.6;
      puffVel[i * 3 + 2] = Math.sin(angle) * spd;
      puffLife[i]        = 0;
    }
    puffActive = true;
    puffMesh.visible = true;
    puffGeo.attributes.position.needsUpdate = true;
  }

  const PUFF_DUR = 0.45;
  function tickDustPuffs(dt) {
    const G = window.G;
    if (G && G._dustEvent) {
      spawnDustPuff(G._dustEvent.x, G._dustEvent.z);
      G._dustEvent = null;
    }
    if (!puffActive) return;
    let anyAlive = false;
    for (let i = 0; i < PUFF_COUNT; i++) {
      if (puffLife[i] >= PUFF_DUR) continue;
      puffLife[i] += dt;
      puffPos[i * 3]     += puffVel[i * 3]     * dt;
      puffPos[i * 3 + 1] += puffVel[i * 3 + 1] * dt;
      puffPos[i * 3 + 2] += puffVel[i * 3 + 2] * dt;
      puffVel[i * 3 + 1] -= 2.5 * dt;  // light gravity
      anyAlive = true;
    }
    puffGeo.attributes.position.needsUpdate = true;
    puffMesh.material.opacity = 0.55 * Math.max(0, 1 - (puffLife[0] / PUFF_DUR));
    if (!anyAlive) { puffActive = false; puffMesh.visible = false; }
  }

  // ── Thrown coin arc ───────────────────────────────────
  const _coinMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.022, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.85, roughness: 0.18 })
  );
  _coinMesh.visible = false;
  scene.add(_coinMesh);
  let _coinState = null;

  function tickCoin(dt) {
    const G = window.G;
    if (G._throwEvent) {
      const e = G._throwEvent;
      _coinState = { x: e.ox, y: e.oy, z: e.oz, vx: e.vx, vy: e.vy, vz: e.vz };
      _coinMesh.visible = true;
      G._throwEvent = null;
    }
    if (!_coinState) return;
    _coinState.vy -= 18 * dt;
    _coinState.x  += _coinState.vx * dt;
    _coinState.y  += _coinState.vy * dt;
    _coinState.z  += _coinState.vz * dt;
    _coinMesh.position.set(_coinState.x, Math.max(0.1, _coinState.y), _coinState.z);
    _coinMesh.rotation.x += dt * 9;
    _coinMesh.rotation.z += dt * 6;
    if (_coinState.y <= 0.1) { _coinState = null; _coinMesh.visible = false; }
  }

  // ── Smoke bomb cloud ──────────────────────────────────
  const SMOKE_COUNT = 80;
  const smokePos  = new Float32Array(SMOKE_COUNT * 3);
  const smokeVel  = new Float32Array(SMOKE_COUNT * 3);
  const smokeLife = new Float32Array(SMOKE_COUNT).fill(999);
  const SMOKE_DUR = 9.0;
  let   _smokeT   = SMOKE_DUR; // starts "spent"

  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeMesh = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    color: 0xd8d8c0, size: 0.55, transparent: true, opacity: 0,
    sizeAttenuation: true, depthWrite: false,
  }));
  scene.add(smokeMesh);

  function _spawnSmoke(ox, oz) {
    _smokeT = 0;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 0.2 + Math.random() * 0.8;
      smokePos[i * 3]     = ox + (Math.random() - 0.5) * 0.8;
      smokePos[i * 3 + 1] = 0.15 + Math.random() * 2.2;
      smokePos[i * 3 + 2] = oz + (Math.random() - 0.5) * 0.8;
      smokeVel[i * 3]     = Math.cos(angle) * spd;
      smokeVel[i * 3 + 1] = 0.06 + Math.random() * 0.14;
      smokeVel[i * 3 + 2] = Math.sin(angle) * spd;
      smokeLife[i]         = 0;
    }
    smokeGeo.attributes.position.needsUpdate = true;
  }

  function tickSmoke(dt) {
    const G = window.G;
    if (G._smokeEvent) {
      _spawnSmoke(G._smokeEvent.x, G._smokeEvent.z);
      G._smokeEvent = null;
    }
    // Age clouds
    for (let i = G._smokeClouds.length - 1; i >= 0; i--) {
      G._smokeClouds[i].t += dt;
      if (G._smokeClouds[i].t >= G._smokeClouds[i].maxT) G._smokeClouds.splice(i, 1);
    }
    // Particles
    if (_smokeT >= SMOKE_DUR) { smokeMesh.material.opacity = 0; return; }
    _smokeT += dt;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      if (smokeLife[i] >= SMOKE_DUR) continue;
      smokeLife[i]        += dt;
      smokePos[i * 3]     += smokeVel[i * 3]     * dt;
      smokePos[i * 3 + 1] += smokeVel[i * 3 + 1] * dt;
      smokePos[i * 3 + 2] += smokeVel[i * 3 + 2] * dt;
      smokeVel[i * 3]     *= Math.pow(0.88, dt * 60);
      smokeVel[i * 3 + 2] *= Math.pow(0.88, dt * 60);
    }
    smokeGeo.attributes.position.needsUpdate = true;
    smokeMesh.material.opacity = 0.48 * Math.max(0, 1 - _smokeT / SMOKE_DUR);
  }

  // ── Noise distraction ring ─────────────────────────────
  const noiseRingGeo = new THREE.RingGeometry(0.05, 0.28, 40);
  const noiseRingMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44, transparent: true, opacity: 0.7,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const noiseRingMesh = new THREE.Mesh(noiseRingGeo, noiseRingMat);
  noiseRingMesh.rotation.x = -Math.PI / 2;
  noiseRingMesh.visible = false;
  scene.add(noiseRingMesh);

  let noiseRingState = null;

  function tickNoiseRing(dt) {
    const G = window.G;
    if (G._noiseEvent) {
      noiseRingState    = { x: G._noiseEvent.x, z: G._noiseEvent.z, t: 0 };
      G._noiseEvent     = null;
      noiseRingMesh.visible = true;
    }
    if (!noiseRingState) return;
    noiseRingState.t += dt;
    const progress = noiseRingState.t / 0.65;
    if (progress >= 1) {
      noiseRingState = null;
      noiseRingMesh.visible = false;
      return;
    }
    const s = progress * 8;   // expand to 8-unit noise radius
    noiseRingMesh.scale.set(s, s, s);
    noiseRingMesh.position.set(noiseRingState.x, 0.05, noiseRingState.z);
    noiseRingMat.opacity = 0.7 * (1 - progress);
  }

  // ── Pickup flash (decay only, no bloom) ───────────────
  function tickPickupAndChroma(dt) {
    const G = window.G;
    if (G._pickupFlash > 0) {
      G._pickupFlash = Math.max(0, G._pickupFlash - dt * 3.5);
    }
  }

  // ── Glass shatter ──────────────────────────────────────
  const SHARD_COUNT = 18;
  const _shards = [];
  (function initShards() {
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xaaddff, roughness: 0.05, metalness: 0.15,
      transparent: true, opacity: 0.75, side: THREE.DoubleSide,
    });
    for (let i = 0; i < SHARD_COUNT; i++) {
      const w = 0.06 + Math.random() * 0.16;
      const h = 0.05 + Math.random() * 0.14;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.007), glassMat.clone());
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      _shards.push({ mesh: m, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, life: 1, dead: true });
    }
  }());

  function _spawnGlassShatter(ox, oz) {
    _shards.forEach((s, i) => {
      const angle  = (i / SHARD_COUNT) * Math.PI * 2 + Math.random() * 0.6;
      const speed  = 0.8 + Math.random() * 1.8;
      s.mesh.position.set(
        ox + (Math.random() - 0.5) * 0.6,
        1.4 + Math.random() * 0.5,
        oz + (Math.random() - 0.5) * 0.6
      );
      s.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      s.vx   = Math.cos(angle) * speed;
      s.vy   = 1.5 + Math.random() * 2.5;
      s.vz   = Math.sin(angle) * speed;
      s.rx   = (Math.random() - 0.5) * 14;
      s.rz   = (Math.random() - 0.5) * 14;
      s.life = 1;
      s.dead = false;
      s.mesh.material.opacity = 0.75;
      s.mesh.visible = true;
    });
  }

  function tickGlassShards(dt) {
    const G = window.G;
    if (G && G._glassShatterEvent) {
      _spawnGlassShatter(G._glassShatterEvent.x, G._glassShatterEvent.z);
      G._glassShatterEvent = null;
    }
    _shards.forEach(s => {
      if (s.dead) return;
      s.vy   -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += s.rx * dt;
      s.mesh.rotation.z += s.rz * dt;
      // Friction on XZ once near floor
      if (s.mesh.position.y <= 0.04) {
        s.mesh.position.y = 0.04;
        s.vy = 0; s.vx *= 0.88; s.vz *= 0.88; s.rx *= 0.85; s.rz *= 0.85;
      }
      s.life -= dt * 0.55;
      s.mesh.material.opacity = Math.max(0, s.life * 0.75);
      if (s.life <= 0) { s.dead = true; s.mesh.visible = false; }
    });
  }

  // ── Skylight hatch slide-open animation ────────────────
  function tickSkylightHatch(dt) {
    const G = window.G;
    if (!G || !G.skylightHatch || !G.skylightHatch.opening) return;
    const h = G.skylightHatch;
    h._animT += dt;
    const t = Math.min(h._animT / 0.8, 1.0);
    // Ease-out: slide in +X direction and tilt up slightly
    const ease = 1 - (1 - t) * (1 - t);
    h.mesh.position.x = h.origX + ease * 5.5;
    h.mesh.position.y = h.origY + ease * 0.6;
    h.mesh.rotation.z = ease * 0.55;
    if (h.rimMesh) {
      h.rimMesh.position.x = h.origX + ease * 5.5;
      h.rimMesh.position.y = (h.origY - 0.04) + ease * 0.6;
      h.rimMesh.rotation.z = ease * 0.55;
    }
    if (t >= 1.0) {
      h.opening = false;
      h.open    = true;
    }
  }

  // ── Vault intro cinematic ──────────────────────────────
  let _vaultCinT       = 0;
  const _vaultCinDur   = 3.8;   // total cinematic length in seconds
  // Saved camera for lerp-back
  const _vaultCinCamSave = new THREE.Vector3();
  // Target shots
  const _vcShotPos  = new THREE.Vector3(0, 4.5, 123);
  const _vcShotLook = new THREE.Vector3(0, 1.6, 140);

  function startVaultCinematic() {
    const G = window.G;
    if (!G || G._vaultCinematicDone) return;
    G._vaultCinematicDone   = true;
    G._vaultCinematicActive = true;
    _vaultCinT = 0;
    _vaultCinCamSave.copy(camera.position);
    UI.showAlert('CROWN VAULT', 3000);
  }

  function tickVaultCinematic(dt) {
    const G = window.G;
    if (!G || !G._vaultCinematicActive) return;

    _vaultCinT += dt;
    const progress = _vaultCinT / _vaultCinDur;

    // Phase 0-0.25 (0→1s): push camera toward crown
    // Phase 0.25-0.72 (1→2.75s): held shot
    // Phase 0.72-1.0 (2.75→3.8s): lerp back behind player
    if (progress <= 0.25) {
      const t = Math.min(1, progress / 0.25);
      const ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(_vaultCinCamSave, _vcShotPos, ease);
      const lookTarget = new THREE.Vector3().lerpVectors(_vaultCinCamSave, _vcShotLook, ease);
      camera.lookAt(lookTarget);

    } else if (progress <= 0.72) {
      camera.position.copy(_vcShotPos);
      camera.lookAt(_vcShotLook);
      // Subtle slow push-in during hold
      const holdT = (progress - 0.25) / 0.47;
      camera.position.z += holdT * 2.5;

    } else {
      // Return to behind player
      const t = Math.min(1, (progress - 0.72) / 0.28);
      const ease = t * t * (3 - 2 * t);
      const pp = Player.getPositionRef();
      const returnPos = new THREE.Vector3(pp.x, pp.y + 4.5, pp.z - 7);
      camera.position.lerpVectors(_vcShotPos, returnPos, ease);
      camera.lookAt(new THREE.Vector3(pp.x, pp.y + 1.5, pp.z));
    }

    // Pulse the vault gold accent light
    if (flickerLights.length > 0) {
      const pulse = 1 + Math.sin(_vaultCinT * 3.5) * 0.4;
      const accent = flickerLights[flickerLights.length - 1]; // gold accent is last
      accent.intensity = accent._baseIntensity * Math.max(1, pulse * 2.2);
    }

    if (_vaultCinT >= _vaultCinDur) {
      G._vaultCinematicActive = false;
      // Restore accent light
      if (flickerLights.length > 0) {
        const accent = flickerLights[flickerLights.length - 1];
        accent.intensity = accent._baseIntensity;
      }
    }
  }

  // ── Floating animation for pickups ─────────────────────
  let floatT = 0;
  function tickFloatItems(dt) {
    floatT += dt;
    const G = window.G;
    if (!G) return;
    G.keycardPickups.forEach(kc => {
      if (!kc.collected && kc.mesh) {
        kc.mesh.position.y = 0.75 + Math.sin(floatT * 2 + kc.x) * 0.08;
        kc.mesh.rotation.y += dt * 1.2;
      }
      if (kc.floorRing) {
        kc.floorRing.visible = !kc.collected;
        if (!kc.collected) {
          kc.floorRing.material.opacity = 0.20 + Math.sin(floatT * 3.2 + kc.x) * 0.13;
          const s = 0.93 + Math.sin(floatT * 2.4 + kc.z) * 0.07;
          kc.floorRing.scale.set(s, 1, s);
        }
      }
    });
    G.stealables.forEach(st => {
      if (st.mesh && st.mesh.userData.floorRing) {
        const ring = st.mesh.userData.floorRing;
        ring.visible = !st.taken;
        if (!st.taken) {
          ring.material.opacity = 0.24 + Math.sin(floatT * 2.6 + st.z) * 0.14;
          const s = 0.94 + Math.sin(floatT * 1.8 + st.x) * 0.06;
          ring.scale.set(s, 1, s);
        }
      }
      if (!st.taken && st.mesh) {
        st.mesh.position.y = 1.5 + Math.sin(floatT * 1.5 + st.z) * 0.1;
        st.mesh.rotation.y += dt * 0.8;
      }
    });
    (G.coinPickups || []).forEach(cp => {
      if (!cp.collected && cp.mesh) {
        cp.mesh.position.y = (cp.baseY || 1.1) + Math.sin(floatT * 2.5 + cp.x) * 0.07;
        cp.mesh.rotation.y += dt * 1.5;
      }
    });
  }

  // ── Proximity vignette ─────────────────────────────────
  const stressVignette = document.getElementById('stress-vignette');
  let   _vignetteOpacity = 0;

  function tickStressVignette(dt, playerPos) {
    const guardPositions = Guards.getGuardPositions();
    let minDist = Infinity;
    for (const gp of guardPositions) {
      const dx = gp.x - playerPos.x;
      const dz = gp.z - playerPos.z;
      const d  = dx * dx + dz * dz;
      if (d < minDist) minDist = d;
    }
    minDist = Math.sqrt(minDist);
    // Full vignette at dist ≤ 4, zero at dist ≥ 14
    const target = Math.max(0, Math.min(1, 1 - (minDist - 4) / 10)) * 0.8;
    _vignetteOpacity += (target - _vignetteOpacity) * Math.min(1, dt * 5);
    stressVignette.style.opacity = _vignetteOpacity;
  }

  // ── Game start / restart ───────────────────────────────
  function startGame(mode) {
    const G    = window.G;
    G.mode     = mode;
    G.phase    = 'playing';
    G.playerCaught = false;
    G.inventory    = { yellow: false, blue: false, red: false, painting: false, crown: false };
    G.alarm        = { level: 0, active: false };
    G.guardsAlerted = 0;
    G.closeCalls    = 0;
    G.distractCount = G.loadout.coins  ? 6 : 3;
    G._usedDistract = false;
    G.smokeCount    = G.loadout.smoke  ? 2 : 1;
    G.takedownCount = 0;
    G._smokeClouds  = [];
    G._smokeEvent   = null;
    G._stamina      = 1.0;
    G._moneyStolen  = 0;
    G._earnedAchs   = new Set();
    G._throwEvent   = null;
    G.takedownCount = 0;
    G._checkpointReached    = { Gallery: false, 'Crown Vault': false };
    G._checkpointData       = null;
    G._vaultCinematicDone   = false;
    G._vaultCinematicActive = false;
    _prevCaught = false;
    _smokeT     = SMOKE_DUR;
    UI.updateDistractCount(G.distractCount);
    UI.updateSmokeCount(G.smokeCount);

    // Apply difficulty
    // Reset power state before applying difficulty so VISION_RANGE is correct
    G._powerOut      = false;
    G._powerOutTimer = 0;
    if (window.Guards) Guards.setPowerOut && Guards.setPowerOut(false);

    Guards.setDifficulty(G.difficulty);
    Security.setDifficulty(G.difficulty);

    // Reset modules
    Player.reset();
    // Rappel perk: spawn on rooftop above the skylight hatch
    if (G.loadout.rappel) {
      const h = G.skylightHatch;
      if (h) {
        // Reset hatch to closed state
        h.open    = false;
        h.opening = false;
        h._animT  = 0;
        h.mesh.position.set(h.origX, h.origY, h.origZ);
        h.mesh.visible = true;
        if (h.rimMesh) { h.rimMesh.position.set(h.origX, h.origY - 0.04, h.origZ); h.rimMesh.visible = true; }
      }
      Player.setPosition(0, (h ? h.roofY + 1.2 : 8), 20);
    }
    Guards.resetAlarm();
    Security.resetAlarm();
    Security.resetLasers();

    // Restore keycards and stealables
    G.keycardPickups.forEach(kc => {
      kc.collected   = false;
      kc.mesh.visible = true;
    });
    G.stealables.forEach(st => {
      st.taken        = false;
      st.mesh.visible = true;
      if (st.needsSafe) st.safeCracked = false;
    });
    G.coinPickups.forEach(cp => {
      cp.collected    = false;
      cp.mesh.visible = true;
    });
    G.terminals.forEach(tm => { tm.hacked = false; });

    // Restore doors
    G.doors.forEach(d => {
      if (d.open || d.opening) {
        const wasFullyOpen = d.open;
        d.open            = false;
        d.opening         = false;
        d.openProgress    = 0;
        d.mesh.visible    = true;
        d.mesh.scale.y    = 1;
        d.mesh.position.y = 3;
        if (d.vaultDoor) d.mesh.position.x = d.origX || 0;
        // Re-add AABB only if it was fully removed (animation completed)
        if (wasFullyOpen) {
          const hw = d.aabbHalfW || 1.5;
          const hd = d.aabbHalfD || 0.3;
          G.walls.push({
            minX: d.x - hw,
            maxX: d.x + hw,
            minZ: d.z - hd,
            maxZ: d.z + hd,
          });
        }
      }
    });

    UI.initObjectives();
    pickMissionVariant();
    UI.showHUD();
    UI.showAlarm(false);
    UI.hideAlert();
    UI.completeObjective('enter');

    G._startMs = Date.now();
    clock.start();
    Music.start();
    UI.startAmbient();
    document.body.requestPointerLock();
  }

  // ── Resume from pause ──────────────────────────────────
  function resumeGame() {
    window.G.phase = 'playing';
    UI.showHUD();
    document.body.requestPointerLock();
  }
  window.resumeGame = resumeGame;

  // ── Button wiring ──────────────────────────────────────
  function wireButtons() {
    const $ = id => document.getElementById(id);

    // Difficulty selector
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.G.difficulty = btn.dataset.diff;
      };
    });

    // Customization screen helpers
    let _pendingMode = 'solo';

    // Hair color: slider 0-100 → hex color (black → all browns → white)
    function _hairSliderToHex(val) {
      const stops = [
        { v: 0,   r: 0x0a, g: 0x06, b: 0x04 },  // jet black
        { v: 8,   r: 0x1a, g: 0x0a, b: 0x05 },  // espresso / near black
        { v: 18,  r: 0x3d, g: 0x1a, b: 0x08 },  // dark chocolate brown
        { v: 28,  r: 0x5a, g: 0x22, b: 0x10 },  // dark brown
        { v: 38,  r: 0x7a, g: 0x38, b: 0x18 },  // medium dark brown
        { v: 48,  r: 0x8b, g: 0x45, b: 0x13 },  // chestnut / saddle brown
        { v: 57,  r: 0xa0, g: 0x5c, b: 0x28 },  // warm medium brown
        { v: 65,  r: 0xb8, g: 0x78, b: 0x3c },  // light warm brown
        { v: 73,  r: 0xc8, g: 0x98, b: 0x50 },  // caramel / honey brown
        { v: 81,  r: 0xd4, g: 0xb4, b: 0x70 },  // sandy / tawny brown
        { v: 90,  r: 0xe0, g: 0xcc, b: 0xa8 },  // very light brown / ash
        { v: 100, r: 0xf0, g: 0xec, b: 0xe6 },  // white
      ];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (val >= a.v && val <= b.v) {
          const t = (val - a.v) / (b.v - a.v);
          const r = Math.round(a.r + (b.r - a.r) * t);
          const g = Math.round(a.g + (b.g - a.g) * t);
          const bl = Math.round(a.b + (b.b - a.b) * t);
          return (r << 16) | (g << 8) | bl;
        }
      }
      return 0x0a0604;
    }

    // ── Character preview (mini Three.js scene) ────────────
    let _prevRdr = null, _prevScene = null, _prevCam = null, _prevMesh = null, _prevRaf = null;

    // Skin tone: slider 0-100 → hex color (deep to light)
    function _skinSliderToHex(val) {
      const stops = [
        { v: 0,   r: 0x3b, g: 0x1f, b: 0x0f },
        { v: 25,  r: 0x7a, g: 0x4a, b: 0x2a },
        { v: 50,  r: 0xc4, g: 0x80, b: 0x50 },
        { v: 75,  r: 0xd4, g: 0xa0, b: 0x7a },
        { v: 100, r: 0xf5, g: 0xd8, b: 0xc0 },
      ];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (val >= a.v && val <= b.v) {
          const t = (val - a.v) / (b.v - a.v);
          const r = Math.round(a.r + (b.r - a.r) * t);
          const g = Math.round(a.g + (b.g - a.g) * t);
          const bl = Math.round(a.b + (b.b - a.b) * t);
          return (r << 16) | (g << 8) | bl;
        }
      }
      return 0xc48050;
    }


    function _previewColors() {
      const ss = document.querySelector('#suit-swatches .color-swatch.active');
      const es = document.querySelector('#eye-swatches .color-swatch.active');
      const hs = document.querySelector('#hair-style-btns .hair-btn.active');
      const sh = document.querySelector('#shoe-swatches .color-swatch.active');
      const hairSlider    = document.getElementById('hair-color-slider');
      const skinSlider    = document.getElementById('skin-tone-slider');
      const sparkleSlider = document.getElementById('sparkle-slider');
      const hairVal    = hairSlider    ? Number(hairSlider.value)    : 0;
      const skinVal    = skinSlider    ? Number(skinSlider.value)    : 50;
      const sparkleVal = sparkleSlider ? Number(sparkleSlider.value) : 0;
      return {
        suit:             ss && !ss.dataset.suitTheme ? Number(ss.dataset.color) : 0xff69b4,
        eye:              es ? Number(es.dataset.color) : 0x88ccff,
        suitTheme:        ss ? (ss.dataset.suitTheme || null) : null,
        hairStyle:        hs ? hs.dataset.style : 'ponytail',
        hairColor:        window._gingerActive ? 0xc04818 : _hairSliderToHex(hairVal),
        skinColor:        _skinSliderToHex(skinVal),
        shoeColor:        sh && !sh.dataset.shoeTheme ? Number(sh.dataset.color) : 0x111111,
        shoeTheme:        sh ? (sh.dataset.shoeTheme || null) : null,
        sparkleIntensity: sparkleVal,
        jewelryColor:     window._jewelryColor !== undefined ? window._jewelryColor : 0xffd700,
      };
    }

    function _previewUpdate() {
      if (!_prevScene || !_prevMesh) return;
      const rot = _prevMesh.rotation.y;
      _prevScene.remove(_prevMesh);
      const { suit, eye, suitTheme, hairStyle, hairColor, skinColor, shoeColor, shoeTheme, sparkleIntensity, jewelryColor } = _previewColors();
      _prevMesh = Player.buildPreviewMesh(suit, eye, suitTheme, hairStyle, hairColor, skinColor, shoeColor, shoeTheme, sparkleIntensity, jewelryColor);
      _prevMesh.rotation.y = rot;
      _prevScene.add(_prevMesh);
    }

    function _previewInit() {
      const canvas = $('preview-canvas');
      if (!canvas || _prevRdr) return;
      _prevRdr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      _prevRdr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      _prevRdr.setSize(canvas.width, canvas.height, false);
      _prevRdr.outputEncoding = THREE.sRGBEncoding;
      _prevScene = new THREE.Scene();
      _prevScene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(1.5, 3, 2);
      _prevScene.add(key);
      const rim = new THREE.DirectionalLight(0xaabbff, 0.35);
      rim.position.set(-2, 0.5, -2);
      _prevScene.add(rim);
      _prevCam = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 50);
      _prevCam.position.set(0, 1.2, 4.0);
      _prevCam.lookAt(0, 1.0, 0);
      const { suit, eye, suitTheme, hairStyle, hairColor, skinColor, shoeColor, shoeTheme, sparkleIntensity, jewelryColor } = _previewColors();
      _prevMesh = Player.buildPreviewMesh(suit, eye, suitTheme, hairStyle, hairColor, skinColor, shoeColor, shoeTheme, sparkleIntensity, jewelryColor);
      _prevScene.add(_prevMesh);
      (function loop() {
        _prevRaf = requestAnimationFrame(loop);
        _prevMesh.rotation.y += 0.008;
        _prevRdr.render(_prevScene, _prevCam);
      }());
    }

    function _previewDestroy() {
      if (_prevRaf) { cancelAnimationFrame(_prevRaf); _prevRaf = null; }
      if (_prevRdr) { _prevRdr.dispose(); _prevRdr = null; }
      _prevScene = null; _prevMesh = null; _prevCam = null;
    }
    // ───────────────────────────────────────────────────────

    function showCustomize(mode) {
      _pendingMode = mode;
      UI.showScreen(null);
      $('customize-screen').classList.remove('hidden');
      _previewInit();
    }

    function applyCustomization() {
      const suitSw        = document.querySelector('#suit-swatches .color-swatch.active');
      const eyeSw         = document.querySelector('#eye-swatches .color-swatch.active');
      const hairBtn       = document.querySelector('#hair-style-btns .hair-btn.active');
      const hairSlider    = document.getElementById('hair-color-slider');
      const skinSlider    = document.getElementById('skin-tone-slider');
      const sparkleSlider = document.getElementById('sparkle-slider');

      const shoeSw        = document.querySelector('#shoe-swatches .color-swatch.active');
      const name          = ($('codename-input').value.trim() || 'Ghost').slice(0, 16);
      window.G.playerCustom = {
        suitColor:        suitSw && !suitSw.dataset.suitTheme ? Number(suitSw.dataset.color) : 0xff69b4,
        suitTheme:        suitSw ? (suitSw.dataset.suitTheme || null) : null,
        eyeColor:         eyeSw  ? Number(eyeSw.dataset.color)  : 0x88ccff,
        hairStyle:        hairBtn  ? hairBtn.dataset.style : 'ponytail',
        hairColor:        window._gingerActive ? 0xc04818 : _hairSliderToHex(hairSlider ? Number(hairSlider.value) : 0),
        skinColor:        _skinSliderToHex(skinSlider    ? Number(skinSlider.value)    : 50),
        sparkleIntensity: sparkleSlider ? Number(sparkleSlider.value) : 0,
        shoeColor:        shoeSw && !shoeSw.dataset.shoeTheme ? Number(shoeSw.dataset.color) : 0x111111,
        shoeTheme:        shoeSw ? (shoeSw.dataset.shoeTheme || null) : null,
        jewelryColor:     window._jewelryColor !== undefined ? window._jewelryColor : 0xffd700,

        codename:         name,
      };
      const nameEl = $('codename-display');
      if (nameEl) nameEl.textContent = '// ' + name.toUpperCase();
    }

    // Swatch click handlers
    document.querySelectorAll('#suit-swatches .color-swatch').forEach(sw => {
      sw.onclick = () => {
        document.querySelectorAll('#suit-swatches .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        _previewUpdate();
      };
    });
    document.querySelectorAll('#eye-swatches .color-swatch').forEach(sw => {
      sw.onclick = () => {
        document.querySelectorAll('#eye-swatches .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        _previewUpdate();
      };
    });

    document.querySelectorAll('#shoe-swatches .color-swatch').forEach(sw => {
      sw.onclick = () => {
        document.querySelectorAll('#shoe-swatches .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        _previewUpdate();
      };
    });

    (function () {
      const sparkleSlider = document.getElementById('sparkle-slider');
      if (sparkleSlider) sparkleSlider.addEventListener('input', _previewUpdate);
    }());

    (function () {
      const skinSlider  = document.getElementById('skin-tone-slider');
      const skinPreview = document.getElementById('skin-tone-preview');
      function updateSkinPreview() {
        const hex = _skinSliderToHex(Number(skinSlider.value));
        const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
        skinPreview.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
        _previewUpdate();
      }
      if (skinSlider) skinSlider.addEventListener('input', updateSkinPreview);
      updateSkinPreview();
    }());


    // ── Hair style buttons ──────────────────────────────────
    document.querySelectorAll('#hair-style-btns .hair-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#hair-style-btns .hair-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _previewUpdate();
      };
    });

    // ── Hair color slider + ginger toggle ──────────────────
    (function () {
      const hairSlider  = document.getElementById('hair-color-slider');
      const hairPreview = document.getElementById('hair-color-preview');
      const gingerBtn   = document.getElementById('ginger-btn');
      let _gingerActive = false;
      window._gingerActive = false;

      function updateHairPreview() {
        const hex = _gingerActive ? 0xc04818 : _hairSliderToHex(Number(hairSlider.value));
        const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
        hairPreview.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
        _previewUpdate();
      }

      if (gingerBtn) {
        gingerBtn.addEventListener('click', () => {
          _gingerActive = !_gingerActive;
          window._gingerActive = _gingerActive;
          gingerBtn.style.border = _gingerActive ? '2px solid #fff' : '2px solid transparent';
          updateHairPreview();
        });
      }
      if (hairSlider) {
        hairSlider.addEventListener('input', () => {
          _gingerActive = false;
          window._gingerActive = false;
          if (gingerBtn) gingerBtn.style.border = '2px solid transparent';
          updateHairPreview();
        });
      }
      if (hairSlider) updateHairPreview();
    }());

    // ── Jewelry buttons ────────────────────────────────────
    window._jewelryColor = 0xffd700; // default gold
    document.querySelectorAll('.jewelry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.jewelry-btn').forEach(b => b.style.border = '2px solid transparent');
        btn.style.border = '2px solid #fff';
        window._jewelryColor = btn.dataset.jewelry === 'silver' ? 0xc0c0c0 : 0xffd700;
        _previewUpdate();
      });
    });

    // ── Intro cutscene / mission briefing ──────────────────
    const INTRO_LINES = [
      'OPERATIVE: ' + ((window.G.playerCustom && window.G.playerCustom.codename) || 'GHOST'),
      'MISSION:   Le Vol du Louvre',
      '',
      'PRIMARY TARGETS',
      '  La Joconde (Mona Lisa)  ........  Gallery West Wing',
      '  The Crown of Saint-Louis  .....  Crown Vault B',
      '',
      'SECONDARY TARGETS',
      '  Bonus stealables scattered throughout — take what you can.',
      '  Glass-cased items trigger a local alarm on smash.',
      '  Hidden gems in dark corners — worth finding.',
      '',
      'INTEL',
      '  Security: laser grid, cameras, 6 active guards.',
      '  Alarm response: 3-minute lockdown on full alert.',
      '  Partial escape is possible — but ratings suffer.',
      '',
      'GOOD LUCK.  DON\'T GET CAUGHT.',
    ];
    const INTRO_CHAR_MS  = 22;     // ms per character

    function _showIntro(mode) {
      const screen = $('intro-screen');
      if (!screen) { startGame(mode); return; }

      // Refresh codename in case customization ran before this call
      INTRO_LINES[0] = 'OPERATIVE: ' + ((window.G.playerCustom && window.G.playerCustom.codename) || 'GHOST');

      screen.classList.remove('hidden');
      screen.classList.add('active');

      const textEl  = $('intro-text');
      const barEl   = $('intro-bar');
      const contEl  = $('intro-continue');

      // Split INTRO_LINES into sections separated by blank lines
      const INTRO_SECTIONS = [];
      let buf = [];
      for (const line of INTRO_LINES) {
        if (line === '') { if (buf.length) { INTRO_SECTIONS.push(buf.join('\n')); buf = []; } }
        else { buf.push(line); }
      }
      if (buf.length) INTRO_SECTIONS.push(buf.join('\n'));

      let sectionIdx   = 0;
      let completedText = '';   // all text shown so far (fully typed sections)
      let typing       = false;
      let done         = false;
      let _raf         = null;
      let _charTimer   = 0;
      let _lastT       = performance.now();
      let _typingTarget = '';
      let _typingIdx   = 0;

      textEl.textContent = '';
      if (barEl)   barEl.style.width = '0%';
      if (contEl)  contEl.style.opacity = '0';

      function finish() {
        if (done) return;
        done = true;
        cleanup();
        if (contEl) contEl.style.opacity = '0';
        setTimeout(() => {
          screen.classList.add('hidden');
          screen.classList.remove('active');
          startGame(mode);
        }, 400);
      }

      function cleanup() {
        if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
        document.removeEventListener('keydown', onKey);
      }

      function showContinueHint() {
        if (!contEl) return;
        const isLast = sectionIdx >= INTRO_SECTIONS.length - 1;
        contEl.textContent = isLast ? '[ Press E to begin ]' : '[ Press E to continue ]';
        contEl.style.opacity = '1';
      }

      function completeCurrentSection() {
        if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
        _typingIdx = _typingTarget.length;
        textEl.textContent = _typingTarget;
        completedText = _typingTarget;
        typing = false;
        if (barEl) barEl.style.width = ((sectionIdx + 1) / INTRO_SECTIONS.length * 100) + '%';
        showContinueHint();
      }

      function startSection(idx) {
        typing = true;
        if (contEl) contEl.style.opacity = '0';
        const sec = INTRO_SECTIONS[idx];
        _typingTarget = completedText ? completedText + '\n\n' + sec : sec;
        _typingIdx    = completedText.length + (completedText ? 2 : 0);
        _charTimer    = 0;
        _lastT        = performance.now();

        function tick(now) {
          const dt = now - _lastT;
          _lastT = now;
          _charTimer += dt;
          while (_charTimer >= INTRO_CHAR_MS && _typingIdx < _typingTarget.length) {
            _charTimer -= INTRO_CHAR_MS;
            _typingIdx++;
            textEl.textContent = _typingTarget.slice(0, _typingIdx);
          }
          if (_typingIdx >= _typingTarget.length) { completeCurrentSection(); return; }
          _raf = requestAnimationFrame(tick);
        }
        _raf = requestAnimationFrame(tick);
      }

      function onKey(e) {
        if (e.code !== 'KeyE') return;
        if (typing) {
          completeCurrentSection();
        } else {
          sectionIdx++;
          if (sectionIdx >= INTRO_SECTIONS.length) { finish(); }
          else { startSection(sectionIdx); }
        }
      }

      document.addEventListener('keydown', onKey);
      startSection(0);

      $('btn-skip-intro').onclick = () => { cleanup(); finish(); };
    }

    $('btn-solo').onclick = () => showCustomize('solo');
    // How to Play manual
    const _howBtn   = document.getElementById('btn-howtoplay');
    const _howPanel = document.getElementById('howtoplay-overlay');
    const _howClose = document.getElementById('btn-closemanual');
    if (_howBtn   && _howPanel) _howBtn.onclick   = () => { _howPanel.style.display = 'block'; };
    if (_howClose && _howPanel) _howClose.onclick  = () => { _howPanel.style.display = 'none';  };
    // After customization → go to loadout screen
    $('btn-start-heist').onclick = () => {
      applyCustomization();
      _previewDestroy();
      $('customize-screen').classList.add('hidden');
      _openLoadout();
    };
    $('btn-back-menu').onclick   = () => { _previewDestroy(); $('customize-screen').classList.add('hidden'); UI.showScreen('start'); };

    // ── Loadout screen ──────────────────────────────────────
    const MAX_LOADOUT = 2;
    let _selectedLoadout = new Set();

    function _openLoadout() {
      _selectedLoadout = new Set();
      document.querySelectorAll('.loadout-item').forEach(el => el.classList.remove('selected'));
      _updateLoadoutCount();
      UI.showScreen('loadout');
    }

    function _updateLoadoutCount() {
      const el = $('loadout-count');
      if (el) el.textContent = 'Selected: ' + _selectedLoadout.size + ' / ' + MAX_LOADOUT;
    }

    document.querySelectorAll('.loadout-item').forEach(el => {
      el.onclick = () => {
        const item = el.dataset.item;
        if (_selectedLoadout.has(item)) {
          _selectedLoadout.delete(item);
          el.classList.remove('selected');
        } else if (_selectedLoadout.size < MAX_LOADOUT) {
          _selectedLoadout.add(item);
          el.classList.add('selected');
        }
        _updateLoadoutCount();
      };
    });

    $('btn-begin-heist').onclick = () => {
      const G = window.G;
      G.loadout = {
        smoke:    _selectedLoadout.has('smoke'),
        lockpick: _selectedLoadout.has('lockpick'),
        coins:    _selectedLoadout.has('coins'),
        vault:    _selectedLoadout.has('vault'),
        rappel:   _selectedLoadout.has('rappel'),
      };
      UI.showScreen(null);
      _showIntro(_pendingMode);
    };

    $('btn-loadout-back').onclick = () => {
      UI.showScreen(null);
      $('customize-screen').classList.remove('hidden');
      _previewInit();
    };

    $('btn-resume').onclick     = resumeGame;
    $('btn-restart').onclick    = () => startGame(window.G.mode);
    $('btn-main-menu').onclick  = () => { window.G.phase = 'start'; UI.showScreen('start'); document.exitPointerLock(); };
    $('btn-retry').onclick               = () => startGame(window.G.mode);
    $('btn-continue').onclick            = resumeFromCheckpoint;
    $('btn-resume-checkpoint').onclick   = resumeFromCheckpoint;
    $('btn-go-menu').onclick    = () => { window.G.phase = 'start'; UI.showScreen('start'); document.exitPointerLock(); };
    $('btn-play-again').onclick = () => startGame(window.G.mode);
    $('btn-win-menu').onclick   = () => { window.G.phase = 'start'; UI.showScreen('start'); document.exitPointerLock(); };

  }

  // ── Resize ─────────────────────────────────────────────
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── Mission variants — randomised each run ─────────────
  const MISSION_VARIANTS = [
    {
      name: 'Classic Heist',
      objectives: {
        enter:    'Break into the Louvre',
        yellow:   'Find the Yellow Keycard (lobby desk)',
        gallery:  'Reach the Grande Galerie',
        painting: 'Steal the Mona Lisa (west wall)',
        blue:     'Find the Blue Keycard (east gallery)',
        crown:    'Steal the Crown Jewel',
        escape:   'Escape the Louvre',
      },
      navTargets: {
        yellow:  { x:  0,    z: 16.5  },
        gallery: { x: -14,   z: 60    },
        painting:{ x: -24.9, z: 92    },
        blue:    { x:  14,   z: 70    },
        crown:   { x:  0,    z: 140   },
        escape:  { x:  0,    z: 163   },
      },
    },
    {
      name: 'East Wing Approach',
      objectives: {
        enter:    'Slip in through the lobby',
        yellow:   'Locate Yellow Keycard (north lobby)',
        gallery:  'Sneak into the Grande Galerie',
        painting: 'Grab the Mona Lisa (far west wall)',
        blue:     'Find the Blue Keycard (east gallery)',
        crown:    'Take the Crown',
        escape:   'Escape via service exit',
      },
      navTargets: {
        yellow:  { x:  8,    z: 22    },
        gallery: { x:  0,    z: 39.75 },
        painting:{ x: -24.9, z: 92    },
        blue:    { x:  14,   z: 96    },
        crown:   { x:  0,    z: 140   },
        escape:  { x: -20,   z: 15    },
      },
    },
    {
      name: 'Night Raid',
      objectives: {
        enter:    'Infiltrate after hours',
        yellow:   'Recover Yellow Keycard (west lobby)',
        gallery:  'Sneak into the Grande Galerie',
        painting: 'Swipe the Mona Lisa',
        blue:     'Find the Blue Keycard',
        crown:    'Secure the Crown',
        escape:   'Vanish into the night',
      },
      navTargets: {
        yellow:  { x: -8,   z: 12    },
        gallery: { x: -14,  z: 60    },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 70    },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 163   },
      },
    },
    {
      name: 'West Vent Infiltration',
      objectives: {
        enter:    'Slip through the front entrance',
        yellow:   'Find the Yellow Keycard',
        gallery:  'Enter the Grande Galerie',
        painting: 'Steal the Mona Lisa (west wall)',
        blue:     'Find the Blue Keycard',
        crown:    'Take the Crown Jewel',
        escape:   'Escape out the front',
      },
      navTargets: {
        yellow:  { x: -14,  z: 34    },
        gallery: { x: -14,  z: 60    },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 96    },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 163   },
      },
    },
    {
      name: 'East Vent Shortcut',
      objectives: {
        enter:    'Enter through the lobby',
        yellow:   'Find Yellow Keycard (north lobby)',
        gallery:  'Enter the Grande Galerie',
        painting: 'Steal the Mona Lisa',
        blue:     'Find the Blue Keycard (east gallery)',
        crown:    'Grab the Crown',
        escape:   'Escape via the front gate',
      },
      navTargets: {
        yellow:  { x:  0,   z: 16.5  },
        gallery: { x:  0,   z: 39.75 },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 96    },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 163   },
      },
    },
    {
      name: 'Ghost Protocol',
      objectives: {
        enter:    'Access via the lobby',
        yellow:   'Find the Yellow Keycard',
        gallery:  'Enter the Grande Galerie',
        painting: 'Take the Mona Lisa',
        blue:     'Find the Blue Keycard',
        crown:    'Secure the Crown Jewel',
        escape:   'Exit through the lobby tunnel',
      },
      navTargets: {
        yellow:  { x: -14,  z: 34    },
        gallery: { x: -14,  z: 60    },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 96    },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 28    },
      },
    },
  ];

  let NAV_TARGETS = MISSION_VARIANTS[0].navTargets;
  let _lastVariantIdx = -1;

  function pickMissionVariant() {
    let idx;
    do { idx = Math.floor(Math.random() * MISSION_VARIANTS.length); }
    while (idx === _lastVariantIdx && MISSION_VARIANTS.length > 1);
    _lastVariantIdx = idx;
    const v = MISSION_VARIANTS[idx];
    NAV_TARGETS = v.navTargets;
    // Update objective text in HUD
    Object.entries(v.objectives).forEach(([id, text]) => {
      const el = document.querySelector('[data-obj="' + id + '"]');
      if (el) el.textContent = text;
    });
    // Show mission name briefly
    UI.showAlert('Mission: ' + v.name, 3000);
  }

  function tickNavArrow(playerPos) {
    const obj = UI.getCurrentObjective();
    const target = obj && NAV_TARGETS[obj];
    if (!target) { Player.setDirArrowVisible(false); return; }
    const dx = target.x - playerPos.x;
    const dz = target.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 2) { Player.setDirArrowVisible(false); return; }
    Player.setDirArrowVisible(true);
    Player.setDirArrowAngle(Math.atan2(dx, dz));
  }

  // ── Main game loop ─────────────────────────────────────
  function loop() {
    requestAnimationFrame(loop);

    const G = window.G;

    if (G.phase !== 'playing' && G.phase !== 'escaping' && G.phase !== 'celebrating') {
      renderer.render(scene, camera);
      return;
    }

    // Cap delta to avoid huge jumps after tab switch
    const dt = Math.min(clock.getDelta(), 0.05);

    const playerPos   = Player.getPositionRef();
    const playerState = Player.getState();

    if (G.phase === 'escaping' || G.phase === 'celebrating') {
      if (G.phase === 'escaping') {
        Player.update(dt);
        tickEscapeCutscene(dt);
      }
      renderer.render(scene, camera);
      return;
    }

    // Shadow camera follows player for consistent resolution across the full map
    if (sun) {
      sun.position.set(playerPos.x + 15, 25, playerPos.z + 10);
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.target.updateMatrixWorld();
    }

    // Core updates
    Player.update(dt);
    Player.updatePrompt();
    Guards.update(dt, playerPos, playerState === 'crouching');
    Security.update(dt, playerPos, playerState);

    // World
    updateRoom(playerPos.z);
    tickNavArrow(playerPos);
    tickAlarmLight(dt);

    // Power breaker timer — runs after tickAlarmLight so it overrides alarm flicker
    if (G._powerOut) {
      G._powerOutTimer -= dt;
      if (G._powerOutTimer <= 0) {
        G._powerOut = false;
        G._powerOutTimer = 0;
        Guards.setPowerOut && Guards.setPowerOut(false);
        flickerLights.forEach(l => { l.intensity = l._baseIntensity; });
      } else {
        // Dim all flicker lights to 40% while power is out (overrides alarm flicker)
        flickerLights.forEach(l => { l.intensity = l._baseIntensity * 0.4; });
      }
    }
    tickFloatItems(dt);
    tickSkylightHatch(dt);
    tickDustAndSparks(dt);
    tickDustPuffs(dt);
    tickCoin(dt);
    tickSmoke(dt);
    tickNoiseRing(dt);
    tickPickupAndChroma(dt);
    tickGlassShards(dt);
    tickVaultCinematic(dt);
    Player.tickDoors(dt);
    tickScreenShake(dt);
    tickStressVignette(dt, playerPos);
    tickAerialView(playerPos);

    // HUD minimap — pass a snapshot for the minimap (read-only, safe to use ref)
    UI.drawMinimap(playerPos, Guards.getGuardPositions(), G.currentRoom, Player.getYaw());

    // Music
    Music.update(G.alarm.level, G.alarm.active);

    // Catch handling
    if (G.playerCaught) {
      // Hit-flash on first frame of catch
      if (!_prevCaught && caughtFlashEl) {
        caughtFlashEl.classList.remove('active');
        void caughtFlashEl.offsetWidth; // reflow to restart animation
        caughtFlashEl.classList.add('active');
        shakeDecay = 0.45;
      }
      _prevCaught = true;
      Player.setCaught();
      G.phase = 'gameover';
      Music.stop();
      UI.stopAmbient();
      UI.showGameOver('Caught!', 'A guard caught you.');
    } else {
      _prevCaught = false;
    }

    // Win check
    if (G.phase === 'playing') {
      checkWin(playerPos);
    }

    renderer.render(scene, camera);
  }

  // ── Boot ───────────────────────────────────────────────
  function boot() {
    onResize();
    window.addEventListener('resize', onResize);
    wireButtons();           // wire first — before anything that could throw
    setupLighting();
    buildMap();
    Player.init(scene, camera);
    Touch.init();
    UI.showScreen('start');
    const _initCp = getCheckpoint();
    const _btnContinue = document.getElementById('btn-continue');
    if (_btnContinue) {
      _btnContinue.classList.toggle('hidden', !_initCp);
      if (_initCp) _btnContinue.textContent = 'Continue from ' + _initCp.room;
    }
    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());
