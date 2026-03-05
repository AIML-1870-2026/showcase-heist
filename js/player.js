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
  const CAM_LERP     = 0.1;

  // ── State ──────────────────────────────────────────────
  let scene, camera;
  let playerMesh;
  let _leftLeg = null, _rightLeg = null;
  let _leftArm = null, _rightArm = null;

  let pos       = new THREE.Vector3(0, 0, 5);
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
      handleInteract();
    }

    if (e.code === 'KeyQ') {
      handleDistract();
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      if (window.G.mode === 'coop') UI.toggleCompanionMenu();
    }

    if (e.code === 'Escape') {
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

  // ── Mesh ───────────────────────────────────────────────
  function buildMesh(sc) {
    const group = new THREE.Group();

    const matSuit = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.75, metalness: 0.15 });
    const matMask = new THREE.MeshStandardMaterial({ color: 0x0d0d14, roughness: 0.85, metalness: 0.0  });
    const matGold = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.35, metalness: 0.7, emissive: 0x443310, emissiveIntensity: 0.4 });
    const matShoe = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.55, metalness: 0.25 });
    const eyeMat  = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.5, roughness: 0.3 });

    // ── Leg pivots (at hip, y=1.0) ──────────────────────
    const legPivots = [-0.14, 0.14].map(xOff => {
      const pivot = new THREE.Group();
      pivot.position.set(xOff, 1.0, 0);

      // Thigh
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.54, 8), matSuit);
      thigh.position.y = -0.27; thigh.castShadow = true;
      pivot.add(thigh);

      // Knee joint
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), matSuit);
      knee.position.y = -0.54;
      pivot.add(knee);

      // Shin
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.44, 8), matSuit);
      shin.position.y = -0.76; shin.castShadow = true;
      pivot.add(shin);

      // Shoe
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.32), matShoe);
      shoe.position.set(0, -1.0, 0.07);
      pivot.add(shoe);

      group.add(pivot);
      return pivot;
    });
    group.userData.leftLeg  = legPivots[0];
    group.userData.rightLeg = legPivots[1];

    // ── Torso (tapered cylinder) ─────────────────────────
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.65, 10), matSuit);
    torso.position.y = 1.3; torso.castShadow = true;
    group.add(torso);

    // Gold belt ring
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.055, 10), matGold);
    belt.position.y = 1.0;
    group.add(belt);

    // ── Arm pivots (at shoulder, y=1.58) ─────────────────
    const armPivots = [-0.32, 0.32].map(xOff => {
      const pivot = new THREE.Group();
      pivot.position.set(xOff, 1.58, 0);

      // Upper arm
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.07, 0.36, 8), matSuit);
      upper.position.y = -0.18; upper.castShadow = true;
      pivot.add(upper);

      // Elbow joint
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.072, 8, 6), matSuit);
      elbow.position.y = -0.36;
      pivot.add(elbow);

      // Forearm
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.32, 8), matSuit);
      fore.position.y = -0.52; fore.castShadow = true;
      pivot.add(fore);

      // Glove fist
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 6), matShoe);
      fist.position.y = -0.7;
      pivot.add(fist);

      group.add(pivot);
      return pivot;
    });
    group.userData.leftArm  = armPivots[0];
    group.userData.rightArm = armPivots[1];

    // ── Neck ─────────────────────────────────────────────
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), matMask);
    neck.position.y = 1.66;
    group.add(neck);

    // ── Head (sphere balaclava) ───────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9), matMask);
    head.position.y = 1.84; head.castShadow = true;
    group.add(head);

    // Glowing eyes
    [-0.09, 0.09].forEach(xOff => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), eyeMat);
      eye.position.set(xOff, 1.87, -0.21);
      group.add(eye);
    });

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

  // ── Update ─────────────────────────────────────────────
  function update(dt) {
    const G = window.G;
    if (!G || G.phase !== 'playing') return;
    if (state === 'caught') return;

    // Slide timer
    if (state === 'sliding') {
      slideTimer -= dt;
      if (slideTimer <= 0) state = 'normal';
    }

    // State from input (only when not already sliding)
    if (state !== 'sliding') {
      if (keys['ShiftLeft'] || keys['ShiftRight']) state = 'crouching';
      else if (keys['KeyR'])                       state = 'sprinting';
      else                                         state = 'normal';
    }

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

    // Wall collision
    resolveWalls();

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
        st.taken        = true;
        st.mesh.visible = false;
        G.inventory[st.item] = true;
        G._pickupFlash  = 1.0;
        UI.addItem(st.item === 'painting' ? 'painting' : 'crown');
        UI.SFX.pickup();
        UI.showAlert((st.item === 'painting' ? 'Painting' : 'Crown') + ' stolen! ALARM!', 3500);
        UI.completeObjective(st.item);
        if (window.Security) Security.triggerAlarmLevel(3);
        return;
      }
    }

    // Check hack terminals
    for (const tm of G.terminals) {
      if (tm.hacked) continue;
      const _dx = tm.x - pos.x, _dz = tm.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        tm.hacked = true;
        if (window.Security) Security.hackCameras(20);
        UI.SFX.interact();
        UI.showAlert('Cameras looped for 20 seconds.', 2500);
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
        } else {
          const name = d.keyRequired.charAt(0).toUpperCase() + d.keyRequired.slice(1);
          UI.showAlert('Need the ' + name + ' keycard!', 2000);
          UI.SFX.alert();
        }
        return;
      }
    }
  }

  // ── Distract (Q key) ───────────────────────────────────
  function handleDistract() {
    if (!window.Guards) return;
    // Throw coin forward: noise source 5 units ahead
    const noiseX = pos.x + Math.sin(yaw) * 5;
    const noiseZ = pos.z + Math.cos(yaw) * 5;
    if (window.G) window.G._noiseEvent = { x: noiseX, z: noiseZ };
    Guards.notifyNoise(noiseX, noiseZ, 8);
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
        UI.showPrompt('[E] Steal the ' + st.item);
        found = true; break;
      }
    }
    if (!found) for (const tm of G.terminals) {
      if (tm.hacked) continue;
      const _dx = tm.x - pos.x, _dz = tm.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        UI.showPrompt('[E] Hack terminal');
        found = true; break;
      }
    }
    if (!found) for (const d of G.doors) {
      if (d.open) continue;
      const _dx = d.x - pos.x, _dz = d.z - pos.z;
      if (_dx * _dx + _dz * _dz < REACH2) {
        const locked = d.keyRequired && !G.inventory[d.keyRequired];
        UI.showPrompt(locked ? 'Need ' + d.keyRequired + ' keycard' : '[E] Open door');
        found = true; break;
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
    pos.set(0, 0, 5);
    vel.set(0, 0, 0);
    state     = 'normal';
    onGround  = true;
    jumpCount = 0;
    yaw       = Math.PI;
    pitch     = 0.25;
    if (playerMesh) {
      playerMesh.position.set(0, 0, 5);
      playerMesh.scale.y = 1;
    }
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
    getState()       { return state; },
    isCrouching()    { return state === 'crouching'; },
    isSliding()      { return state === 'sliding'; },
    getPlayerY()     { return pos.y; },
    simulateKey(code, down) { keys[code] = down; },
  };

}());
