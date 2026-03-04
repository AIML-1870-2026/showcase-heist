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

  // Ambient occlusion — darkens corners/crevices before bloom
  const ssaoPass = new THREE.SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 16;
  ssaoPass.minDistance  = 0.001;
  ssaoPass.maxDistance  = 0.12;
  composer.addPass(ssaoPass);

  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8,   // strength
    0.4,   // radius
    0.82   // threshold — surfaces need to exceed this luminance to glow
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
    walls:          [],
    doors:          [],
    keycardPickups: [],
    stealables:     [],
    terminals:      [],
    alarm:          { level: 0, active: false },
    inventory:      { yellow: false, blue: false, red: false, painting: false, crown: false },
    playerCaught:   false,
    currentRoom:    'Lobby',
    _alarmLight:    null,
    _pickupFlash:   0,
    _noiseEvent:    null,
    _startMs:       0,
    guardsAlerted:  0,
    closeCalls:     0,
  };

  // ── Lighting ───────────────────────────────────────────
  const flickerLights = [];  // point lights that flicker during alarm

  function setupLighting() {
    // Ambient — slightly warm to feel like museum hall lighting
    scene.add(new THREE.AmbientLight(0xffe8d0, 0.4));

    // Directional (museum overhead style)
    const sun = new THREE.DirectionalLight(0xfff5e0, 0.9);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 250;
    sun.shadow.camera.left   = -70;
    sun.shadow.camera.right  =  70;
    sun.shadow.camera.top    =  70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.001;
    scene.add(sun);

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
    window.G.terminals      = data.terminals;
    Guards.init(scene, data.guardData);
    Security.init(scene, data.laserData, data.cameraData);
  }

  // ── Room detection ─────────────────────────────────────
  function updateRoom(z) {
    const G = window.G;
    if      (z < 40)  G.currentRoom = 'Lobby';
    else if (z < 55)  G.currentRoom = 'Corridor';
    else if (z < 100) G.currentRoom = 'Gallery';
    else if (z < 115) G.currentRoom = 'Corridor';
    else              G.currentRoom = 'Crown Vault';
  }

  // ── Stealth rating ─────────────────────────────────────
  function calcRating(seconds, alerted, closeCalls) {
    if (alerted === 0 && closeCalls === 0 && seconds < 200) return 'S';
    if (alerted === 0 && seconds < 360)                     return 'A';
    if (alerted <= 1  && seconds < 600)                     return 'B';
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
      bloomPass.strength = 0.8 + Math.abs(Math.sin(alarmPulse * 0.6)) * 0.7;
    } else {
      light.intensity = 0;
      flickerLights.forEach(l => { l.intensity = l._baseIntensity; });
      bloomPass.strength = 0.8;
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
      bloomPass.strength += G._pickupFlash * 1.8;
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
      if (!st.taken && st.mesh) {
        st.mesh.position.y = 1.5 + Math.sin(floatT * 1.5 + st.z) * 0.1;
        st.mesh.rotation.y += dt * 0.8;
      }
    });
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

    $('btn-solo').onclick       = () => startGame('solo');
    $('btn-coop').onclick       = () => startGame('coop');
    $('btn-resume').onclick     = resumeGame;
    $('btn-restart').onclick    = () => startGame(window.G.mode);
    $('btn-main-menu').onclick  = () => { window.G.phase = 'start'; UI.showScreen('start'); document.exitPointerLock(); };
    $('btn-retry').onclick      = () => startGame(window.G.mode);
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
    ssaoPass.setSize(w, h);
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
    tickNoiseRing(dt);
    tickPickupAndChroma(dt);
    Player.tickDoors(dt);
    tickScreenShake(dt);

    // HUD minimap — pass a snapshot for the minimap (read-only, safe to use ref)
    UI.drawMinimap(playerPos, Guards.getGuardPositions(), G.currentRoom);

    // Catch handling
    if (G.playerCaught) {
      Player.setCaught();
      if (G.mode !== 'coop') {
        G.phase = 'gameover';
        UI.showGameOver('Caught!', 'A guard caught you.');
      }
      // In co-op, companion.js handles rescue timer & game over
    }

    // Win check
    if (G.phase === 'playing') checkWin(playerPos);

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
    UI.showScreen('start');
    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());
