'use strict';
// ── companion.js ───────────────────────────────────────────
// AI co-op partner: follow, wait, distract guard, hack terminal,
// rescue player if caught. Only active in co-op mode.
// Exposes: window.Companion

window.Companion = (function () {

  // ── Constants ──────────────────────────────────────────
  const SPEED       = 5.8;
  const FOLLOW_DIST = 2.8;   // desired gap from player
  const RESCUE_DIST = 1.2;   // close enough to free player
  const RESCUE_TIME = 30;    // seconds before rescue fails

  // ── State ──────────────────────────────────────────────
  let mesh;
  let pos     = new THREE.Vector3(-1, 0, 3);
  let facing  = new THREE.Vector3(0, 0, 1);

  // 'follow' | 'wait' | 'distract' | 'hack' | 'rescue'
  let mode    = 'follow';
  let enabled = false;

  let rescueTimer    = 0;
  let distractTarget = null;
  let hackTarget     = null;

  // ── Mesh ───────────────────────────────────────────────
  function buildMesh(scene) {
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.1, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x445566 })
    );
    body.position.y = 0.55;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshLambertMaterial({ color: 0xd4b896 })
    );
    head.position.y = 1.3;
    g.add(head);

    // Beret (distinguishes companion from guards)
    const beret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.26, 0.12, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    beret.position.y = 1.62;
    beret.rotation.z = 0.25;
    g.add(beret);

    g.castShadow = true;
    scene.add(g);
    return g;
  }

  // ── Movement helper ────────────────────────────────────
  // Moves toward target, returns true when within stopDist
  function moveTo(target, dt, stopDist) {
    stopDist = stopDist || 0.25;
    const dx   = target.x - pos.x;
    const dz   = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < stopDist) return true;

    const step = Math.min(SPEED * dt, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    facing.set(dx / dist, 0, dz / dist);

    if (mesh) {
      mesh.position.set(pos.x, 0, pos.z);
      mesh.rotation.y = -Math.atan2(facing.x, facing.z);
    }
    return false;
  }

  // ── Commands ───────────────────────────────────────────
  function issueCommand(cmd) {
    if (!enabled) return;
    const G = window.G;

    switch (cmd) {

      case 'distract': {
        // Walk toward a guard's position to lure them away
        const positions = Guards.getGuardPositions();
        if (positions.length === 0) break;
        // Pick the guard nearest to the companion
        let nearest = positions[0], nearDist = Infinity;
        positions.forEach(gp => {
          const d = Math.hypot(gp.x - pos.x, gp.z - pos.z);
          if (d < nearDist) { nearDist = d; nearest = gp; }
        });
        // Offset target slightly so companion walks into cone area
        distractTarget = new THREE.Vector3(
          nearest.x + (Math.random() - 0.5) * 3,
          0,
          nearest.z + (Math.random() - 0.5) * 3
        );
        mode = 'distract';
        UI.updateCoopStatus('Distracting');
        break;
      }

      case 'hack': {
        if (!G || !G.terminals) break;
        const playerPos = Player.getPosition();
        let nearestT = null, nearDist = Infinity;
        G.terminals.forEach(t => {
          if (t.hacked) return;
          const d = Math.hypot(t.x - playerPos.x, t.z - playerPos.z);
          if (d < nearDist) { nearDist = d; nearestT = t; }
        });
        if (!nearestT) {
          UI.showAlert('No terminals available.', 1500);
          break;
        }
        hackTarget = new THREE.Vector3(nearestT.x, 0, nearestT.z);
        mode = 'hack';
        UI.updateCoopStatus('Hacking');
        break;
      }

      case 'wait':
        mode = 'wait';
        UI.updateCoopStatus('Waiting');
        break;

      case 'follow':
        mode = 'follow';
        UI.updateCoopStatus('Following');
        break;
    }
  }

  // ── Update ─────────────────────────────────────────────
  function update(dt) {
    if (!enabled || !mesh) return;
    const G = window.G;
    if (!G || G.phase !== 'playing') return;

    const playerPos = Player.getPosition();

    // If player got caught and we're not already rescuing, start rescue mode
    if (G.playerCaught && mode !== 'rescue') {
      mode        = 'rescue';
      rescueTimer = RESCUE_TIME;
      UI.updateCoopStatus('Rescuing');
      UI.showAlert('Partner is coming to rescue you! (' + RESCUE_TIME + 's)', 3500);
    }

    switch (mode) {

      case 'follow': {
        const dx   = playerPos.x - pos.x;
        const dz   = playerPos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Only move if too far away
        if (dist > FOLLOW_DIST + 0.5) {
          // Target a point behind the player, not on top of them
          const behind = new THREE.Vector3(
            playerPos.x - (dx / dist) * FOLLOW_DIST,
            0,
            playerPos.z - (dz / dist) * FOLLOW_DIST
          );
          moveTo(behind, dt);
        }
        break;
      }

      case 'wait':
        // Stand still, do nothing
        break;

      case 'distract': {
        if (!distractTarget) { mode = 'follow'; UI.updateCoopStatus('Following'); break; }
        const reached = moveTo(distractTarget, dt, 0.8);
        if (reached) {
          // Make noise at companion's current position to attract guards
          if (window.Guards) Guards.notifyNoise(pos.x, pos.z, 7);
          // Run back toward player
          distractTarget = null;
          mode = 'follow';
          UI.updateCoopStatus('Following');
          UI.showAlert('Partner distracted the guard!', 2000);
        }
        break;
      }

      case 'hack': {
        if (!hackTarget) { mode = 'follow'; UI.updateCoopStatus('Following'); break; }
        const reached = moveTo(hackTarget, dt, 1.2);
        if (reached) {
          // Find the terminal at this location and hack it
          if (G.terminals) {
            const t = G.terminals.find(tm =>
              !tm.hacked && Math.hypot(tm.x - pos.x, tm.z - pos.z) < 2.5
            );
            if (t) {
              t.hacked = true;
              Security.hackCameras(20);
              UI.showAlert('Partner hacked cameras — 20 second window!', 3000);
              UI.SFX.interact();
            }
          }
          hackTarget = null;
          mode = 'follow';
          UI.updateCoopStatus('Following');
        }
        break;
      }

      case 'rescue': {
        rescueTimer -= dt;

        if (rescueTimer <= 0 && G.playerCaught) {
          // Rescue failed — game over
          G.phase = 'gameover';
          UI.showGameOver('No Rescue', "Your partner couldn't reach you in time.");
          break;
        }

        // Rush to player
        const reached = moveTo(playerPos, dt, RESCUE_DIST);
        if (reached && G.playerCaught) {
          // Freed!
          G.playerCaught = false;
          Player.resume();
          mode = 'follow';
          UI.updateCoopStatus('Following');
          UI.showAlert('Rescued! Keep moving!', 2500);
        }
        break;
      }
    }
  }

  // ── Init / Enable / Disable ────────────────────────────
  function init(scene) {
    mesh = buildMesh(scene);
    mesh.visible = false;
  }

  function enable() {
    enabled = true;
    mesh.visible = true;
    pos.set(-1, 0, 3);
    mode        = 'follow';
    rescueTimer = 0;
    distractTarget = null;
    hackTarget     = null;
    UI.showCoopStatus(true);
    UI.updateCoopStatus('Following');
  }

  function disable() {
    enabled = false;
    if (mesh) mesh.visible = false;
    UI.showCoopStatus(false);
  }

  function reset() {
    pos.set(-1, 0, 3);
    mode        = 'follow';
    rescueTimer = 0;
    distractTarget = null;
    hackTarget     = null;
    if (mesh) {
      mesh.position.set(-1, 0, 3);
      mesh.visible = enabled;
    }
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init,
    enable,
    disable,
    update,
    issueCommand,
    reset,
    getMode()     { return mode; },
    getPosition() { return pos.clone(); },
    isEnabled()   { return enabled; },
  };

}());
