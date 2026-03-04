'use strict';
// ── player.js ──────────────────────────────────────────────
// Player movement, physics, third-person camera, and states.
// Exposes: window.Player

window.Player = (function () {

  // ── Constants ──────────────────────────────────────────
  const SPEED_WALK   = 6;
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

  let pos       = new THREE.Vector3(0, 0, 5);
  let vel       = new THREE.Vector3(0, 0, 0);
  let onGround  = true;
  let jumpCount = 0;

  // 'normal' | 'crouching' | 'sliding' | 'caught'
  let state     = 'normal';
  let slideTimer = 0;

  let yaw   = Math.PI;   // camera/facing angle (radians)
  let pitch = 0.25;
  let pointerLocked = false;

  let footT = 0;
  let bobT  = 0;   // head-bob accumulator

  const camPos = new THREE.Vector3(0, 5, -5);

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

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(PLAYER_R * 2, H_NORMAL * 0.7, PLAYER_R * 2),
      new THREE.MeshLambertMaterial({ color: 0x8b7355 })
    );
    body.position.y = H_NORMAL * 0.35;
    group.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(PLAYER_R * 1.8, PLAYER_R * 1.4, PLAYER_R * 1.8),
      new THREE.MeshLambertMaterial({ color: 0xa08060 })
    );
    head.position.y = H_NORMAL * 0.85;
    group.add(head);

    // Red eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff2200 });
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 4);
    [-0.12, 0.12].forEach(xOff => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(xOff, H_NORMAL * 0.88, -(PLAYER_R + 0.02));
      group.add(eye);
    });

    group.castShadow = true;
    sc.add(group);
    return group;
  }

  // ── Collision ──────────────────────────────────────────
  function resolveWalls() {
    const wallList = (window.G && window.G.walls) || [];
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
      state = (keys['ShiftLeft'] || keys['ShiftRight']) ? 'crouching' : 'normal';
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
              : SPEED_WALK;

    const moving = mx !== 0 || mz !== 0;

    if (moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len; mz /= len;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      vel.x = (cos * mx - sin * mz) * spd;
      vel.z = (sin * mx + cos * mz) * spd;

      // Face movement direction
      playerMesh.rotation.y = Math.atan2(vel.x, vel.z) + Math.PI;

      // Footstep SFX
      footT -= dt;
      if (footT <= 0) {
        UI.SFX.footstep();
        footT = state === 'crouching' ? 0.55 : 0.27;
      }
    } else {
      vel.x *= 0.65;
      vel.z *= 0.65;
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

    // Head bob — only when moving on the ground
    const bobSpeed  = state === 'crouching' ? 6 : 11;
    const bobAmount = state === 'crouching' ? 0.04 : 0.07;
    if (moving && onGround) {
      bobT += dt * bobSpeed;
    } else {
      // Smoothly decay bob back to centre
      bobT += dt * bobSpeed;
      // Decay amplitude instead of stopping abruptly handled below
    }
    const bobAmp = (moving && onGround) ? bobAmount : 0;
    const currentBob = Math.sin(bobT) * bobAmp;

    // Frame-rate independent camera lerp: same feel at any fps
    const lerpAlpha = 1 - Math.pow(1 - CAM_LERP, dt * 60);
    const cx = pos.x - Math.sin(yaw) * CAM_DIST;
    const cy = pos.y + CAM_H_OFFSET + pitch * 3 + currentBob;
    const cz = pos.z - Math.cos(yaw) * CAM_DIST;
    camPos.lerp(new THREE.Vector3(cx, cy, cz), lerpAlpha);
    camera.position.copy(camPos);
    camera.lookAt(pos.x, pos.y + 1.4, pos.z);
  }

  // ── Interact (E key) ───────────────────────────────────
  function handleInteract() {
    const G = window.G;
    if (!G || G.phase !== 'playing') return;
    const REACH = 3.2;

    // Check keycards
    for (const kc of G.keycardPickups) {
      if (kc.collected) continue;
      if (Math.hypot(kc.x - pos.x, kc.z - pos.z) < REACH) {
        kc.collected    = true;
        kc.mesh.visible = false;
        G.inventory[kc.key] = true;
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
      if (Math.hypot(st.x - pos.x, st.z - pos.z) < REACH) {
        st.taken        = true;
        st.mesh.visible = false;
        G.inventory[st.item] = true;
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
      if (Math.hypot(tm.x - pos.x, tm.z - pos.z) < REACH) {
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
      if (Math.hypot(d.x - pos.x, d.z - pos.z) < REACH) {
        if (!d.keyRequired || G.inventory[d.keyRequired]) {
          d.open          = true;
          d.mesh.visible  = false;
          // Remove door AABB from wall list
          const idx = G.walls.findIndex(w =>
            Math.abs((w.minX + w.maxX) / 2 - d.x) < 2 &&
            Math.abs((w.minZ + w.maxZ) / 2 - d.z) < 1
          );
          if (idx >= 0) G.walls.splice(idx, 1);
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
    Guards.notifyNoise(noiseX, noiseZ, 8);
    UI.SFX.interact();
  }

  // ── Proximity prompt (called each frame) ───────────────
  function updatePrompt() {
    const G = window.G;
    if (!G || G.phase !== 'playing') { UI.hidePrompt(); return; }
    const REACH = 3.2;
    let found = false;

    for (const kc of G.keycardPickups) {
      if (kc.collected) continue;
      if (Math.hypot(kc.x - pos.x, kc.z - pos.z) < REACH) {
        UI.showPrompt('[E] Pick up ' + kc.key + ' keycard');
        found = true; break;
      }
    }
    if (!found) for (const st of G.stealables) {
      if (st.taken) continue;
      if (Math.hypot(st.x - pos.x, st.z - pos.z) < REACH) {
        UI.showPrompt('[E] Steal the ' + st.item);
        found = true; break;
      }
    }
    if (!found) for (const tm of G.terminals) {
      if (tm.hacked) continue;
      if (Math.hypot(tm.x - pos.x, tm.z - pos.z) < REACH) {
        UI.showPrompt('[E] Hack terminal');
        found = true; break;
      }
    }
    if (!found) for (const d of G.doors) {
      if (d.open) continue;
      if (Math.hypot(d.x - pos.x, d.z - pos.z) < REACH) {
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

    playerMesh = buildMesh(sc);

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

  // ── Public API ─────────────────────────────────────────
  return {
    init,
    update,
    updatePrompt,
    reset,
    setCaught,
    resume,
    getPosition()    { return pos.clone(); },
    getState()       { return state; },
    isCrouching()    { return state === 'crouching'; },
    isSliding()      { return state === 'sliding'; },
    getPlayerY()     { return pos.y; },
  };

}());
