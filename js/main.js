'use strict';
// ── main.js ────────────────────────────────────────────────
// Scene setup, renderer, lighting, game loop, and state machine.
// Initialises all modules and coordinates every frame.

(function () {

  // ── Renderer ───────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled  = true;
  renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputEncoding     = THREE.sRGBEncoding;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // ── Scene & camera ─────────────────────────────────────
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0e14);
  scene.fog        = new THREE.Fog(0x0a0a0e, 20, 75);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.position.set(0, 5, -5);

  // ── Post-processing (bloom + chromatic aberration) ─────
  const composer  = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));

  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45,  // strength — reduced from 0.8 to avoid over-glow on surfaces
    0.4,   // radius
    0.90   // threshold — raised so only emissive lights bloom, not wall surfaces
  );
  composer.addPass(bloomPass);

  // Chromatic aberration pass — RGB channel offset on alert
  const chromaShader = {
    uniforms: {
      tDiffuse: { value: null },
      amount:   { value: 0.0 },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float amount;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec2 off = vec2(amount * 0.008, 0.0);',
      '  float r = texture2D(tDiffuse, vUv + off).r;',
      '  float g = texture2D(tDiffuse, vUv      ).g;',
      '  float b = texture2D(tDiffuse, vUv - off).b;',
      '  gl_FragColor = vec4(r, g, b, 1.0);',
      '}',
    ].join('\n'),
  };
  const chromaPass = new THREE.ShaderPass(chromaShader);
  composer.addPass(chromaPass);

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
    alarm:          { level: 0, active: false },
    inventory:      { yellow: false, blue: false, red: false, painting: false, crown: false },
    playerCaught:   false,
    currentRoom:    'Lobby',
    _alarmLight:    null,
    _pickupFlash:   0,
    _noiseEvent:    null,
    _dustEvent:     null,
    _startMs:       0,
    guardsAlerted:  0,
    closeCalls:     0,
    distractCount:  3,
    _throwEvent:    null,
    _checkpointReached: { Gallery: false, 'Crown Vault': false },
    _checkpointData:    null,
  };

  // ── Lighting ───────────────────────────────────────────
  const flickerLights = [];  // point lights that flicker during alarm
  let sun = null;            // directional light — updated each frame to follow player

  function setupLighting() {
    // Ambient — slightly warm to feel like museum hall lighting
    scene.add(new THREE.AmbientLight(0xffe8d0, 0.4));

    // Directional (museum overhead style) — smaller frustum, higher-res map, follows player
    sun = new THREE.DirectionalLight(0xfff5e0, 0.9);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
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

    // Lobby — warm gold chandelier pools
    [ [-8, 4.5, 10], [8, 4.5, 10], [-8, 4.5, 30], [8, 4.5, 30] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xffd080, 0.6, 22);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Gallery — cool blue-white spotlight feel
    [ [-10, 5, 65], [10, 5, 65], [0, 5, 80], [-10, 5, 95], [10, 5, 95] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xddeeff, 0.55, 20);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });

    // Crown Vault — moody amber with a single blue accent
    [ [-10, 4.5, 125], [10, 4.5, 125], [0, 4.5, 140], [-10, 4.5, 155], [10, 4.5, 155] ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xffaa44, 0.65, 22);
      pt.position.set(x, y, z);
      pt._baseIntensity = pt.intensity;
      scene.add(pt);
      flickerLights.push(pt);
    });
    const vaultAccent = new THREE.PointLight(0x4466ff, 0.4, 18);
    vaultAccent.position.set(0, 3, 140);
    vaultAccent._baseIntensity = vaultAccent.intensity;
    scene.add(vaultAccent);
    flickerLights.push(vaultAccent);

    // Gallery painting spotlights — angled museum track lights
    [
      // [sx, sz,  tx, ty, tz]  — light pos → painting target
      [-20, 92,  -24.9, 3.8, 92],   // famous painting (stealable)
      [-20, 70,  -24.9, 3.5, 70],   // gallery west
      [ 20, 80,   24.9, 3.5, 80],   // gallery east
      [ 20, 60,   24.9, 3.5, 60],   // gallery east 2
    ].forEach(([sx, sz, tx, ty, tz]) => {
      const spot = new THREE.SpotLight(0xfff0cc, 0.85, 14, Math.PI / 8, 0.38);
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
      const spot = new THREE.SpotLight(0xfff0d0, 0.65, 11, Math.PI / 8, 0.38);
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
    if (G.inventory.painting && G.inventory.crown && pos.z >= 160) {
      G.phase = 'won';
      UI.completeObjective('escape');
      const elapsed = Math.floor((Date.now() - G._startMs) / 1000);
      const rating  = calcRating(elapsed, G.guardsAlerted, G.closeCalls);
      UI.showWin({ time: elapsed, guardsAlerted: G.guardsAlerted, closeCalls: G.closeCalls, rating });
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

      // Bloom ramps up with alarm
      bloomPass.strength = 0.45 + Math.abs(Math.sin(alarmPulse * 0.6)) * 0.6;
    } else {
      light.intensity = 0;
      flickerLights.forEach(l => { l.intensity = l._baseIntensity; });
      bloomPass.strength = 0.45;
    }
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
      const t = sparkLife[i] / sparkMaxLife[i];
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

  // ── Pickup flash + chroma control ─────────────────────
  function tickPickupAndChroma(dt) {
    const G = window.G;
    // Pickup flash: brief bloom spike
    if (G._pickupFlash > 0) {
      G._pickupFlash = Math.max(0, G._pickupFlash - dt * 3.5);
      bloomPass.strength += G._pickupFlash * 1.2;
    }

    // Chromatic aberration: scales with alarm level, peaks during alarm
    let targetChroma = 0;
    if (G.alarm.active)        targetChroma = 1.0;
    else if (G.alarm.level >= 2) targetChroma = 0.5;
    else if (G.alarm.level >= 1) targetChroma = 0.2;
    chromaPass.uniforms.amount.value +=
      (targetChroma - chromaPass.uniforms.amount.value) * Math.min(1, dt * 4);
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
    });
    G.stealables.forEach(st => {
      if (st.mesh && st.mesh.userData.floorRing) {
        st.mesh.userData.floorRing.visible = !st.taken;
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
    G.distractCount = 3;
    G._throwEvent   = null;
    G._checkpointReached = { Gallery: false, 'Crown Vault': false };
    G._checkpointData    = null;
    UI.updateDistractCount(3);

    // Apply difficulty
    Guards.setDifficulty(G.difficulty);
    Security.setDifficulty(G.difficulty);

    // Reset modules
    Player.reset();
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

    UI.initObjectives();
    UI.showHUD();
    UI.showAlarm(false);
    UI.hideAlert();
    UI.completeObjective('enter');

    G._startMs = Date.now();
    clock.start();
    Music.start();
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

    function showCustomize(mode) {
      _pendingMode = mode;
      UI.showScreen(null);
      $('customize-screen').classList.remove('hidden');
    }

    function applyCustomization() {
      const suitSw = document.querySelector('#suit-swatches .color-swatch.active');
      const eyeSw  = document.querySelector('#eye-swatches .color-swatch.active');
      const name   = ($('codename-input').value.trim() || 'Ghost').slice(0, 16);
      window.G.playerCustom = {
        suitColor: suitSw ? Number(suitSw.dataset.color) : 0x1a1a2e,
        eyeColor:  eyeSw  ? Number(eyeSw.dataset.color)  : 0x88ccff,
        codename:  name,
      };
      const nameEl = $('codename-display');
      if (nameEl) nameEl.textContent = '// ' + name.toUpperCase();
    }

    // Swatch click handlers
    document.querySelectorAll('#suit-swatches .color-swatch').forEach(sw => {
      sw.onclick = () => {
        document.querySelectorAll('#suit-swatches .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      };
    });
    document.querySelectorAll('#eye-swatches .color-swatch').forEach(sw => {
      sw.onclick = () => {
        document.querySelectorAll('#eye-swatches .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      };
    });

    $('btn-solo').onclick = () => showCustomize('solo');
    $('btn-coop').onclick = () => showCustomize('coop');
    $('btn-start-heist').onclick = () => { applyCustomization(); startGame(_pendingMode); };
    $('btn-back-menu').onclick   = () => { $('customize-screen').classList.add('hidden'); UI.showScreen('start'); };

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
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── Main game loop ─────────────────────────────────────
  function loop() {
    requestAnimationFrame(loop);

    const G = window.G;

    if (G.phase !== 'playing') {
      composer.render();
      return;
    }

    // Cap delta to avoid huge jumps after tab switch
    const dt = Math.min(clock.getDelta(), 0.05);

    const playerPos   = Player.getPositionRef();
    const playerState = Player.getState();

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
    tickAlarmLight(dt);
    tickFloatItems(dt);
    tickDustAndSparks(dt);
    tickDustPuffs(dt);
    tickCoin(dt);
    tickNoiseRing(dt);
    tickPickupAndChroma(dt);
    Player.tickDoors(dt);
    tickScreenShake(dt);
    tickStressVignette(dt, playerPos);

    // HUD minimap — pass a snapshot for the minimap (read-only, safe to use ref)
    UI.drawMinimap(playerPos, Guards.getGuardPositions(), G.currentRoom);

    // Music
    Music.update(G.alarm.level, G.alarm.active);

    // Catch handling
    if (G.playerCaught) {
      Player.setCaught();
      if (G.mode !== 'coop') {
        G.phase = 'gameover';
        Music.stop();
        UI.showGameOver('Caught!', 'A guard caught you.');
      }
      // In co-op, companion.js handles rescue timer & game over
    }

    // Win check
    if (G.phase === 'playing') {
      checkWin(playerPos);
      if (G.phase === 'won') Music.stop();
    }

    composer.render();
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
