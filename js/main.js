'use strict';
// ── main.js ────────────────────────────────────────────────
// Scene setup, renderer, lighting, game loop, and state machine.
// Initialises all modules and coordinates every frame.

(function () {

  // ── Renderer ───────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // ── Scene & camera ─────────────────────────────────────
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0e14);
  scene.fog        = new THREE.Fog(0x0e0e14, 28, 90);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.position.set(0, 5, -5);

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
  };

  // ── Lighting ───────────────────────────────────────────
  function setupLighting() {
    // Ambient
    scene.add(new THREE.AmbientLight(0xfff8f0, 0.55));

    // Directional (museum overhead style)
    const sun = new THREE.DirectionalLight(0xfffae8, 0.75);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 250;
    sun.shadow.camera.left   = -70;
    sun.shadow.camera.right  =  70;
    sun.shadow.camera.top    =  70;
    sun.shadow.camera.bottom = -70;
    scene.add(sun);

    // Point lights throughout each area
    [
      [0, 5, 20],    // Lobby
      [0, 5, 77.5],  // Gallery
      [0, 5, 137.5], // Crown Vault
    ].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xfff8e8, 0.45, 50);
      pt.position.set(x, y, z);
      scene.add(pt);
    });

    // Red alarm light (intensity driven at runtime)
    const alarmLight = new THREE.PointLight(0xff2200, 0, 80);
    alarmLight.position.set(0, 5, 80);
    scene.add(alarmLight);
    window.G._alarmLight = alarmLight;
  }

  // ── Map build ──────────────────────────────────────────
  function buildMap() {
    const data = Map.init(scene);
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

  // ── Win check ──────────────────────────────────────────
  function checkWin(pos) {
    const G = window.G;
    if (G.inventory.painting && G.inventory.crown && pos.z >= 160) {
      G.phase = 'won';
      UI.completeObjective('escape');
      UI.showWin();
    }
  }

  // ── Alarm light pulse ──────────────────────────────────
  let alarmPulse = 0;
  function tickAlarmLight(dt) {
    const light = window.G._alarmLight;
    if (!light) return;
    if (window.G.alarm.active) {
      alarmPulse += dt * 5;
      light.intensity = 0.35 + Math.abs(Math.sin(alarmPulse)) * 0.35;
    } else {
      light.intensity = 0;
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
      if (d.open) {
        d.open         = false;
        d.mesh.visible = true;
        // Re-add AABB (removed when opened)
        G.walls.push({
          minX: d.x - 1.5,
          maxX: d.x + 1.5,
          minZ: d.z - 0.3,
          maxZ: d.z + 0.3,
        });
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── Main game loop ─────────────────────────────────────
  function loop() {
    requestAnimationFrame(loop);

    const G = window.G;

    if (G.phase !== 'playing') {
      renderer.render(scene, camera);
      return;
    }

    // Cap delta to avoid huge jumps after tab switch
    const dt = Math.min(clock.getDelta(), 0.05);

    const playerPos   = Player.getPosition();
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

    // HUD minimap
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
    UI.showScreen('start');
    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());
