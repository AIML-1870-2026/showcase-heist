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
    difficulty:     'normal',  // 'easy' | 'normal' | 'hard'
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
    _smokeEvent:    null,
    _smokeClouds:   [],
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
    _checkpointReached: { Gallery: false, 'Crown Vault': false },
    _checkpointData:    null,
    _earnedAchs:    null,
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

    // Lobby — cool blue-white overhead pools
    [ [-8, 4.5, 10], [8, 4.5, 10], [-8, 4.5, 30], [8, 4.5, 30] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0x90b0d8, 0.70, 26);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Gallery — cool blue-gray overhead glow
    [ [-10, 5, 65], [10, 5, 65], [0, 5, 80], [-10, 5, 95], [10, 5, 95] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xa0b8d8, 0.58, 22);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Crown Vault — cool deep blue tactical light
    [ [-10, 4.5, 125], [10, 4.5, 125], [0, 4.5, 140], [-10, 4.5, 155], [10, 4.5, 155] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0x7090c0, 0.72, 26);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });
    // Cool blue accent on crown pedestal
    const vaultAccent = new THREE.PointLight(0x90b0e0, 0.45, 16);
    vaultAccent.position.set(0, 3, 140);
    vaultAccent._baseIntensity = vaultAccent.intensity;
    scene.add(vaultAccent);
    flickerLights.push(vaultAccent);

    // Gallery painting spotlights — cool gallery lighting
    [
      // [sx, sz,  tx, ty, tz]  — light pos → painting target
      [-20, 92,  -24.9, 3.8, 92],   // famous painting (stealable)
      [-20, 70,  -24.9, 3.5, 70],   // gallery west
      [ 20, 80,   24.9, 3.5, 80],   // gallery east
      [ 20, 60,   24.9, 3.5, 60],   // gallery east 2
    ].forEach(([sx, sz, tx, ty, tz]) => {
      const spot = new THREE.SpotLight(0xd0e4ff, 0.85, 14, Math.PI / 8, 0.38);
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
      r === 'Crown Vault',                                         // vault
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

    startGame(cp.mode || 'solo');

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
    }
  }

  // ── Stealth rating ─────────────────────────────────────
  function calcRating(seconds, alerted, closeCalls) {
    const d = window.G.difficulty;
    const sTime = d === 'hard' ? 260 : d === 'easy' ? 160 : 200;
    const aTime = d === 'hard' ? 480 : d === 'easy' ? 300 : 360;
    const bTime = d === 'hard' ? 720 : d === 'easy' ? 480 : 600;
    if (alerted === 0 && closeCalls === 0 && seconds < sTime) return 'S';
    if (alerted === 0 && seconds < aTime)                     return 'A';
    if (alerted <= 1  && seconds < bTime)                     return 'B';
    return 'C';
  }

  // ── Win check ──────────────────────────────────────────
  function checkWin(pos) {
    const G = window.G;

    // Feature 8: Service exit (west Lobby, X=-20, Z=15)
    if (G.inventory.painting && G.inventory.crown) {
      const seDx = pos.x - (-20), seDz = pos.z - 15;
      if (seDx * seDx + seDz * seDz < 1.5 * 1.5) {
        G.phase = 'escaping';
        _escapeTimer   = 0;
        _escapeElapsed = Math.floor((Date.now() - G._startMs) / 1000);
        UI.completeObjective('escape');
        Music.stop();
        document.exitPointerLock();
        return;
      }
    }

    // Feature 8: Helicopter exit (rooftop, rappel perk, X=0 Y>5 Z≈-8)
    if (G.loadout.rappel && G.inventory.painting && G.inventory.crown) {
      if (pos.y > 5) {
        const heDx = pos.x - 0, heDz = pos.z - (-8);
        if (heDx * heDx + heDz * heDz < 3 * 3) {
          G.phase = 'escaping';
          _escapeTimer   = 0;
          _escapeElapsed = Math.floor((Date.now() - G._startMs) / 1000);
          UI.completeObjective('escape');
          Music.stop();
          document.exitPointerLock();
          return;
        }
      }
    }

    if (pos.z < 163) return;
    if (G.inventory.painting && G.inventory.crown) {
      G.phase = 'escaping';
      _escapeTimer = 0;
      _escapeElapsed = Math.floor((Date.now() - G._startMs) / 1000);
      UI.completeObjective('escape');
      Music.stop();
      document.exitPointerLock();
    } else {
      // Escaped without the loot
      const missing = [];
      if (!G.inventory.painting) missing.push('La Joconde');
      if (!G.inventory.crown)    missing.push('the Crown');
      G.phase = 'gameover';
      Music.stop();
      document.exitPointerLock();
      UI.showGameOver('Mission Failed', 'You escaped without ' + missing.join(' or ') + '.');
    }
  }

  // ── Escape cutscene ────────────────────────────────────
  let _escapeTimer   = 0;
  let _escapeElapsed = 0;
  const _CAM_END  = new THREE.Vector3(-18, 32, 174);   // elevated side angle
  const _LOOK_END = new THREE.Vector3(0, 10, 205);     // looking at pyramid apex area
  function tickEscapeCutscene(dt) {
    _escapeTimer += dt;
    const G = window.G;

    // Camera smoothly sweeps to wide shot of the pyramid
    const t = Math.min(1, _escapeTimer / 3.0);
    const ease = t * t * (3 - 2 * t);  // smoothstep
    camera.position.lerp(_CAM_END, ease * dt * 1.8 + dt * 0.3);
    camera.lookAt(_LOOK_END);

    // After 5 seconds show the win screen
    if (_escapeTimer >= 5.0 && G.phase === 'escaping') {
      G.phase = 'won';
      const rating = calcRating(_escapeElapsed, G.guardsAlerted, G.closeCalls);
      checkEndAchievements(_escapeElapsed, G.guardsAlerted, rating);
      UI.stopAmbient();
      UI.showWin({ time: _escapeElapsed, guardsAlerted: G.guardsAlerted, closeCalls: G.closeCalls, rating, money: G._moneyStolen });
    }
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
    const btn = document.getElementById('btn-aerial');
    if (btn) btn.classList.toggle('active', on);
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
    sparkGeo.attributes.position.needsUpdate = true;
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
    G._checkpointReached = { Gallery: false, 'Crown Vault': false };
    G._checkpointData    = null;
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
    // Rappel perk: spawn on rooftop so player drops through skylight
    if (G.loadout.rappel) {
      Player.setPosition(0, 8, 5);
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
        // Re-add AABB only if it was fully removed (animation completed)
        if (wasFullyOpen) {
          G.walls.push({
            minX: d.x - 1.5,
            maxX: d.x + 1.5,
            minZ: d.z - 0.3,
            maxZ: d.z + 0.3,
          });
        }
      }
    });

    if (mode === 'coop') {
      Companion.enable();
      Companion.reset();
    } else {
      Companion.disable();
    }

    pickMissionVariant();
    UI.initObjectives();
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

    // Hair color: slider 0-100 → hex color
    function _hairSliderToHex(val) {
      // 0=black, 25=dark brown, 50=medium brown, 75=blonde, 100=white
      const stops = [
        { v: 0,   r: 0x0a, g: 0x06, b: 0x04 },
        { v: 25,  r: 0x3d, g: 0x1a, b: 0x08 },
        { v: 50,  r: 0x7a, g: 0x3c, b: 0x1a },
        { v: 75,  r: 0xcb, g: 0x9b, b: 0x40 },
        { v: 100, r: 0xe0, g: 0xd0, b: 0xc0 },
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

    function _previewColors() {
      const ss = document.querySelector('#suit-swatches .color-swatch.active');
      const es = document.querySelector('#eye-swatches .color-swatch.active');
      const hs = document.querySelector('#hair-style-btns .hair-btn.active');
      const hairSlider = document.getElementById('hair-color-slider');
      const skinSlider = document.getElementById('skin-tone-slider');
      const hairVal = hairSlider ? Number(hairSlider.value) : 0;
      const skinVal = skinSlider ? Number(skinSlider.value) : 50;
      return {
        suit:       ss && !ss.dataset.suitTheme ? Number(ss.dataset.color) : 0x1a1a2e,
        eye:        es ? Number(es.dataset.color) : 0x88ccff,
        suitTheme:  ss ? (ss.dataset.suitTheme || null) : null,
        hairStyle:  hs ? hs.dataset.style : 'ponytail',
        hairColor:  _hairSliderToHex(hairVal),
        skinColor:  _skinSliderToHex(skinVal),
      };
    }

    function _previewUpdate() {
      if (!_prevScene || !_prevMesh) return;
      const rot = _prevMesh.rotation.y;
      _prevScene.remove(_prevMesh);
      const { suit, eye, suitTheme, hairStyle, hairColor, skinColor } = _previewColors();
      _prevMesh = Player.buildPreviewMesh(suit, eye, suitTheme, hairStyle, hairColor, skinColor);
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
      const { suit, eye, suitTheme, hairStyle, hairColor, skinColor } = _previewColors();
      _prevMesh = Player.buildPreviewMesh(suit, eye, suitTheme, hairStyle, hairColor, skinColor);
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
      const suitSw = document.querySelector('#suit-swatches .color-swatch.active');
      const eyeSw  = document.querySelector('#eye-swatches .color-swatch.active');
      const hairBtn  = document.querySelector('#hair-style-btns .hair-btn.active');
      const hairSlider = document.getElementById('hair-color-slider');
      const skinSlider = document.getElementById('skin-tone-slider');
      const name   = ($('codename-input').value.trim() || 'Ghost').slice(0, 16);
      window.G.playerCustom = {
        suitColor:  suitSw && !suitSw.dataset.suitTheme ? Number(suitSw.dataset.color) : 0x1a1a2e,
        suitTheme:  suitSw ? (suitSw.dataset.suitTheme || null) : null,
        eyeColor:   eyeSw  ? Number(eyeSw.dataset.color)  : 0x88ccff,
        hairStyle:  hairBtn ? hairBtn.dataset.style : 'ponytail',
        hairColor:  _hairSliderToHex(hairSlider ? Number(hairSlider.value) : 0),
        skinColor:  _skinSliderToHex(skinSlider ? Number(skinSlider.value) : 50),
        codename:   name,
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

    document.querySelectorAll('#hair-style-btns .hair-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#hair-style-btns .hair-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _previewUpdate();
      };
    });

    (function () {
      const hairSlider  = document.getElementById('hair-color-slider');
      const hairPreview = document.getElementById('hair-color-preview');
      function updateHairPreview() {
        const hex = _hairSliderToHex(Number(hairSlider.value));
        const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
        hairPreview.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
        _previewUpdate();
      }
      if (hairSlider) hairSlider.addEventListener('input', updateHairPreview);
      updateHairPreview();
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

    $('btn-solo').onclick = () => showCustomize('solo');
    $('btn-coop').onclick = () => showCustomize('coop');
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
      startGame(_pendingMode);
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

    // Companion command buttons
    document.querySelectorAll('.companion-cmd').forEach(btn => {
      btn.onclick = () => {
        Companion.issueCommand(btn.dataset.cmd);
        UI.closeCompanionMenu();
      };
    });
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
        gallery:  'Enter the Grande Galerie',
        painting: 'Steal the Mona Lisa (west wall)',
        blue:     'Find the Blue Keycard (east gallery)',
        vault:    'Enter the Crown Vault',
        crown:    'Steal the Crown Jewel',
        escape:   'Escape the Louvre',
      },
      navTargets: {
        yellow:  { x:  0,    z: 16.5  },
        gallery: { x:  0,    z: 39.75 },
        painting:{ x: -24.9, z: 92    },
        blue:    { x:  14,   z: 70    },
        vault:   { x:  0,    z: 99.75 },
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
        blue:     'Locate Blue Keycard (Salon Antiquités)',
        vault:    'Break into the Crown Vault',
        crown:    'Take the Crown',
        escape:   'Escape via service exit or front gate',
      },
      navTargets: {
        yellow:  { x:  8,    z: 22    },
        gallery: { x:  0,    z: 39.75 },
        painting:{ x: -24.9, z: 92    },
        blue:    { x:  37.5, z: 77    },
        vault:   { x:  0,    z: 99.75 },
        crown:   { x:  0,    z: 140   },
        escape:  { x: -20,   z: 15    },
      },
    },
    {
      name: 'Night Raid',
      objectives: {
        enter:    'Infiltrate after hours',
        yellow:   'Recover Yellow Keycard (west lobby)',
        gallery:  'Move through the Grande Galerie',
        painting: 'Swipe the Mona Lisa',
        blue:     'Find the Blue Keycard',
        vault:    'Access the Crown Vault',
        crown:    'Secure the Crown',
        escape:   'Vanish into the night',
      },
      navTargets: {
        yellow:  { x: -8,   z: 12    },
        gallery: { x:  0,   z: 39.75 },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 70    },
        vault:   { x:  0,   z: 99.75 },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 163   },
      },
    },
    {
      name: 'West Vent Infiltration',
      objectives: {
        enter:    'Slip through the front entrance',
        yellow:   'Reach the west vent grate (x=-14, lobby)',
        gallery:  'Crawl through vent into the Grande Galerie',
        painting: 'Steal the Mona Lisa (west wall)',
        blue:     'Find the Blue Keycard (east gallery)',
        vault:    'Break into the Crown Vault',
        crown:    'Take the Crown Jewel',
        escape:   'Escape out the front',
      },
      navTargets: {
        yellow:  { x: -14,  z: 34    },
        gallery: { x: -14,  z: 60    },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 70    },
        vault:   { x:  0,   z: 99.75 },
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
        blue:     'Use the east vent to bypass the vault corridor',
        vault:    'Drop into the Crown Vault',
        crown:    'Grab the Crown',
        escape:   'Escape via the front gate',
      },
      navTargets: {
        yellow:  { x:  0,   z: 16.5  },
        gallery: { x:  0,   z: 39.75 },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 96    },
        vault:   { x:  14,  z: 118   },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 163   },
      },
    },
    {
      name: 'Ghost Protocol',
      objectives: {
        enter:    'Access via the lobby trapdoor tunnel',
        yellow:   'Crawl the west vent into the gallery',
        gallery:  'Surface inside the Grande Galerie',
        painting: 'Take the Mona Lisa',
        blue:     'Slip through the east vent to the vault',
        vault:    'Surface inside the Crown Vault',
        crown:    'Secure the Crown Jewel',
        escape:   'Drop into the tunnel and exit the Louvre',
      },
      navTargets: {
        yellow:  { x: -14,  z: 34    },
        gallery: { x: -14,  z: 60    },
        painting:{ x: -24.9,z: 92    },
        blue:    { x:  14,  z: 96    },
        vault:   { x:  14,  z: 118   },
        crown:   { x:  0,   z: 140   },
        escape:  { x:  0,   z: 28    },
      },
    },
  ];

  let NAV_TARGETS = MISSION_VARIANTS[0].navTargets;

  function pickMissionVariant() {
    const v = MISSION_VARIANTS[Math.floor(Math.random() * MISSION_VARIANTS.length)];
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

    if (G.phase !== 'playing' && G.phase !== 'escaping') {
      renderer.render(scene, camera);
      return;
    }

    // Cap delta to avoid huge jumps after tab switch
    const dt = Math.min(clock.getDelta(), 0.05);

    const playerPos   = Player.getPositionRef();
    const playerState = Player.getState();

    if (G.phase === 'escaping') {
      Player.update(dt);   // runs tickDance only during 'escaping'
      tickEscapeCutscene(dt);
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
    Companion.update(dt);

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
    tickDustAndSparks(dt);
    tickDustPuffs(dt);
    tickCoin(dt);
    tickSmoke(dt);
    tickNoiseRing(dt);
    tickPickupAndChroma(dt);
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
      if (G.mode !== 'coop') {
        G.phase = 'gameover';
        Music.stop();
        UI.stopAmbient();
        UI.showGameOver('Caught!', 'A guard caught you.');
      }
      // In co-op, companion.js handles rescue timer & game over
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
    Companion.init(scene);
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
