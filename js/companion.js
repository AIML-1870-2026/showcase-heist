'use strict';
// ── companion.js ───────────────────────────────────────────
// AI co-op partner: follow, wait, distract guard, hack terminal,
// carry loot, rescue player if caught. Only active in co-op mode.
// Exposes: window.Companion

window.Companion = (function () {

  // ── Constants ──────────────────────────────────────────
  const SPEED        = 5.8;
  const FOLLOW_DIST  = 2.8;
  const RESCUE_DIST  = 1.2;
  const RESCUE_TIME  = 30;
  const REPATH_RATE  = 0.5;   // seconds between A* recomputes while following
  const LOOT_REACH   = 1.5;   // distance at which companion "picks up" loot

  // ── State ──────────────────────────────────────────────
  let mesh;
  let pos     = new THREE.Vector3(-1, 0, 3);
  let facing  = new THREE.Vector3(0, 0, 1);

  // 'follow' | 'wait' | 'distract' | 'hack' | 'loot' | 'rescue'
  let mode    = 'follow';
  let enabled = false;

  let rescueTimer    = 0;
  let distractTarget = null;
  let hackTarget     = null;
  let lootTarget     = null;   // THREE.Vector3 — destination for loot grab
  let lootItem       = null;   // stealable object being retrieved

  // ── A* path state ──────────────────────────────────────
  let _path      = [];
  let _pathIdx   = 0;
  let _pathTimer = 0;

  // ── Auto-distract tracking ─────────────────────────────
  let _prevAlarmLevel = 0;

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

  // ── A* pathfinding helpers ─────────────────────────────
  function requestPath(tx, tz) {
    if (!Guards || !Guards.astar) return;
    const result = Guards.astar(pos.x, pos.z, tx, tz);
    _path    = result || [];
    _pathIdx = 0;
  }

  // Advance along the current A* path. Returns true when fully arrived.
  function followPath(dt) {
    if (_path.length === 0 || _pathIdx >= _path.length) return true;
    const wp   = _path[_pathIdx];
    const dx   = wp.x - pos.x;
    const dz   = wp.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.3) {
      _pathIdx++;
      return _pathIdx >= _path.length;
    }
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

  // Navigate toward (tx, tz), repathing every `rethinkEvery` seconds.
  // Returns true when within `stopDist` of the target.
  function navigateTo(tx, tz, dt, stopDist, rethinkEvery) {
    stopDist   = stopDist   || 0.5;
    rethinkEvery = rethinkEvery || REPATH_RATE;

    const directDist = Math.hypot(tx - pos.x, tz - pos.z);
    if (directDist < stopDist) return true;

    _pathTimer -= dt;
    if (_pathTimer <= 0) {
      requestPath(tx, tz);
      _pathTimer = rethinkEvery;
    }

    if (_path.length > 0) {
      followPath(dt);
    } else {
      // Fallback: direct movement when A* has no path
      const dx = tx - pos.x, dz = tz - pos.z;
      const step = Math.min(SPEED * dt, directDist);
      pos.x += (dx / directDist) * step;
      pos.z += (dz / directDist) * step;
      facing.set(dx / directDist, 0, dz / directDist);
      if (mesh) {
        mesh.position.set(pos.x, 0, pos.z);
        mesh.rotation.y = -Math.atan2(facing.x, facing.z);
      }
    }
    return Math.hypot(tx - pos.x, tz - pos.z) < stopDist;
  }

  // ── Commands ───────────────────────────────────────────
  function issueCommand(cmd) {
    if (!enabled) return;
    const G = window.G;

    switch (cmd) {

      case 'distract': {
        const positions = Guards.getGuardPositions();
        if (positions.length === 0) break;
        let nearest = positions[0], nearDist = Infinity;
        positions.forEach(gp => {
          const d = Math.hypot(gp.x - pos.x, gp.z - pos.z);
          if (d < nearDist) { nearDist = d; nearest = gp; }
        });
        distractTarget = new THREE.Vector3(
          nearest.x + (Math.random() - 0.5) * 3,
          0,
          nearest.z + (Math.random() - 0.5) * 3
        );
        _path = []; _pathTimer = 0;
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
        _path = []; _pathTimer = 0;
        mode = 'hack';
        UI.updateCoopStatus('Hacking');
        break;
      }

      case 'loot': {
        if (!G || !G.stealables) break;
        // Find the nearest uncollected stealable, prefer ones the player doesn't have yet
        let nearestS = null, nearDist = Infinity;
        G.stealables.forEach(st => {
          if (st.taken) return;
          // Skip bonus items — only main objectives
          if (st.bonus) return;
          const d = Math.hypot(st.x - pos.x, st.z - pos.z);
          if (d < nearDist) { nearDist = d; nearestS = st; }
        });
        if (!nearestS) {
          UI.showAlert('Nothing left to grab!', 1500);
          break;
        }
        lootTarget = new THREE.Vector3(nearestS.x, 0, nearestS.z);
        lootItem   = nearestS;
        _path = []; _pathTimer = 0;
        mode = 'loot';
        UI.updateCoopStatus('Grabbing ' + nearestS.item);
        UI.showAlert('Partner going for the ' + nearestS.item + '!', 2000);
        break;
      }

      case 'wait':
        mode = 'wait';
        UI.updateCoopStatus('Waiting');
        break;

      case 'follow':
        mode = 'follow';
        _path = []; _pathTimer = 0;
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

    // ── Auto-distract when player just got spotted ──────
    const curAlarmLevel = G.alarm.level;
    if (curAlarmLevel > _prevAlarmLevel && curAlarmLevel <= 2 && mode === 'follow') {
      const alertedPositions = Guards.getAlertedGuardPositions();
      if (alertedPositions.length > 0) {
        // Target the alerted guard nearest to the companion
        let nearest = alertedPositions[0], nearDist = Infinity;
        alertedPositions.forEach(gp => {
          const d = Math.hypot(gp.x - pos.x, gp.z - pos.z);
          if (d < nearDist) { nearDist = d; nearest = gp; }
        });
        distractTarget = new THREE.Vector3(
          nearest.x + (Math.random() - 0.5) * 4,
          0,
          nearest.z + (Math.random() - 0.5) * 4
        );
        _path = []; _pathTimer = 0;
        mode = 'distract';
        UI.updateCoopStatus('Auto-distracting!');
        UI.showAlert('Partner is distracting the guard!', 2500);
      }
    }
    _prevAlarmLevel = curAlarmLevel;

    // ── Rescue override ────────────────────────────────
    if (G.playerCaught && mode !== 'rescue') {
      mode        = 'rescue';
      rescueTimer = RESCUE_TIME;
      _path = []; _pathTimer = 0;
      UI.updateCoopStatus('Rescuing!');
      UI.showAlert('Partner is coming to rescue you! (' + RESCUE_TIME + 's)', 3500);
    }

    switch (mode) {

      case 'follow': {
        const dx   = playerPos.x - pos.x;
        const dz   = playerPos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > FOLLOW_DIST + 0.5) {
          // Navigate to a point behind the player using A*
          const behind = {
            x: playerPos.x - (dx / dist) * FOLLOW_DIST,
            z: playerPos.z - (dz / dist) * FOLLOW_DIST,
          };
          navigateTo(behind.x, behind.z, dt, 0.4, REPATH_RATE);
        }
        break;
      }

      case 'wait':
        break;

      case 'distract': {
        if (!distractTarget) { mode = 'follow'; UI.updateCoopStatus('Following'); break; }
        const reached = navigateTo(distractTarget.x, distractTarget.z, dt, 0.8, REPATH_RATE);
        if (reached) {
          Guards.notifyNoise(pos.x, pos.z, 9);  // larger radius than manual distract
          distractTarget = null;
          _path = [];
          mode = 'follow';
          UI.updateCoopStatus('Following');
          UI.showAlert('Guard distracted!', 2000);
        }
        break;
      }

      case 'hack': {
        if (!hackTarget) { mode = 'follow'; UI.updateCoopStatus('Following'); break; }
        const reached = navigateTo(hackTarget.x, hackTarget.z, dt, 1.2, REPATH_RATE);
        if (reached) {
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
          _path = [];
          mode = 'follow';
          UI.updateCoopStatus('Following');
        }
        break;
      }

      case 'loot': {
        if (!lootTarget || !lootItem) { mode = 'follow'; UI.updateCoopStatus('Following'); break; }
        if (lootItem.taken) { mode = 'follow'; UI.updateCoopStatus('Following'); break; }

        const reached = navigateTo(lootItem.x, lootItem.z, dt, LOOT_REACH, REPATH_RATE);
        if (reached) {
          // Pick it up — goes straight into the player's inventory
          lootItem.taken       = true;
          lootItem.mesh.visible = false;
          G.inventory[lootItem.item] = true;
          UI.addItem(lootItem.item);
          if (lootItem.item === 'painting') UI.completeObjective('painting');
          if (lootItem.item === 'crown')    UI.completeObjective('crown');
          UI.showAlert('Partner grabbed the ' + (lootItem.label || lootItem.item) + '!', 2500);
          UI.SFX.interact();
          G._pickupFlash = 1.0;
          lootTarget = null;
          lootItem   = null;
          _path      = [];
          mode = 'follow';
          UI.updateCoopStatus('Following');
        }
        break;
      }

      case 'rescue': {
        rescueTimer -= dt;
        if (rescueTimer <= 0 && G.playerCaught) {
          G.phase = 'gameover';
          UI.showGameOver('No Rescue', "Your partner couldn't reach you in time.");
          break;
        }
        const reached = navigateTo(playerPos.x, playerPos.z, dt, RESCUE_DIST, 0.3);
        if (reached && G.playerCaught) {
          G.playerCaught = false;
          Player.resume();
          _path = [];
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
    mode             = 'follow';
    rescueTimer      = 0;
    distractTarget   = null;
    hackTarget       = null;
    lootTarget       = null;
    lootItem         = null;
    _path            = [];
    _pathIdx         = 0;
    _pathTimer       = 0;
    _prevAlarmLevel  = 0;
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
    mode             = 'follow';
    rescueTimer      = 0;
    distractTarget   = null;
    hackTarget       = null;
    lootTarget       = null;
    lootItem         = null;
    _path            = [];
    _pathIdx         = 0;
    _pathTimer       = 0;
    _prevAlarmLevel  = 0;
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
