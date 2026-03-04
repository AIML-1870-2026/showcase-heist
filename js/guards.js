'use strict';
// ── guards.js ──────────────────────────────────────────────
// Guard AI: patrol routes, vision cones, state machine, alarm levels.
// Exposes: window.Guards

window.Guards = (function () {

  // ── Constants ──────────────────────────────────────────
  const BASE_SPEED    = 3.5;
  const VISION_RANGE  = 8;
  const VISION_ANGLE  = Math.PI / 3;   // 60° total (30° each side)
  const DETECT_TIME   = 1.5;           // seconds looking before alerted
  const SUSP_TIME     = 3.0;           // seconds suspicious before giving up
  const SEARCH_TIME   = 5.0;           // seconds searching before giving up
  const CATCH_DIST    = 1.0;           // distance to "catch" player

  let guards     = [];
  let alertLevel = 0;

  // ── Materials ──────────────────────────────────────────
  const MAT_BODY    = new THREE.MeshLambertMaterial({ color: 0x334455 });
  const MAT_HEAD    = new THREE.MeshLambertMaterial({ color: 0xf0c8a0 });
  const MAT_CONE    = {
    patrol:    new THREE.MeshLambertMaterial({ color: 0xffee00, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    suspicious:new THREE.MeshLambertMaterial({ color: 0xff8800, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    alerted:   new THREE.MeshLambertMaterial({ color: 0xff2200, transparent: true, opacity: 0.30, side: THREE.DoubleSide }),
    searching: new THREE.MeshLambertMaterial({ color: 0xff8800, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  };

  // ── Vision-cone geometry ───────────────────────────────
  function buildConeMesh(scene) {
    const SEGS   = 14;
    const verts  = [0, 0.05, 0];
    for (let i = 0; i <= SEGS; i++) {
      const a = -VISION_ANGLE / 2 + (i / SEGS) * VISION_ANGLE;
      verts.push(
        Math.sin(a) * VISION_RANGE,
        0.05,
        Math.cos(a) * VISION_RANGE
      );
    }
    const indices = [];
    for (let i = 0; i < SEGS; i++) indices.push(0, i + 1, i + 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);

    const mesh = new THREE.Mesh(geo, MAT_CONE.patrol);
    scene.add(mesh);
    return mesh;
  }

  // ── Guard body mesh ────────────────────────────────────
  function buildGuardMesh(scene) {
    const g = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), MAT_BODY);
    body.position.y = 0.6;
    g.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), MAT_HEAD);
    head.position.y = 1.45;
    g.add(head);

    // Hat
    const hat = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x222233 })
    );
    hat.position.y = 1.8;
    g.add(hat);

    g.castShadow = true;
    scene.add(g);
    return g;
  }

  // ── Guard class ────────────────────────────────────────
  class Guard {
    constructor(data, scene) {
      this.waypoints  = data.waypoints;
      this.wpIdx      = 0;
      this.state      = 'patrol';
      this.detectT    = 0;
      this.stateT     = 0;
      this.lastKnown  = new THREE.Vector3();
      this.noiseTarget = null;

      this.pos    = new THREE.Vector3(data.spawnX, 0, data.spawnZ);
      this.facing = new THREE.Vector3(0, 0, 1);

      this.mesh     = buildGuardMesh(scene);
      this.coneMesh = buildConeMesh(scene);

      this.mesh.position.copy(this.pos);
    }

    speed() {
      let s = BASE_SPEED;
      if (alertLevel >= 3) s *= 1.9;
      else if (alertLevel >= 2) s *= 1.5;
      else if (alertLevel >= 1) s *= 1.2;
      if (this.state === 'alerted' || this.state === 'searching') s *= 1.1;
      return s;
    }

    // Move toward target, returns true when within 0.3 units
    moveTo(target, dt) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.3) return true;

      const step = Math.min(this.speed() * dt, dist);
      this.pos.x += (dx / dist) * step;
      this.pos.z += (dz / dist) * step;
      this.facing.set(dx / dist, 0, dz / dist);
      return false;
    }

    canSeePlayer(playerPos, isCrouching) {
      const range = isCrouching ? VISION_RANGE * 0.5 : VISION_RANGE;
      const dx = playerPos.x - this.pos.x;
      const dz = playerPos.z - this.pos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > range * range) return false;

      // Dot-product angle check
      const dist = Math.sqrt(dist2);
      const dot  = this.facing.x * (dx / dist) + this.facing.z * (dz / dist);
      return dot > Math.cos(VISION_ANGLE / 2);
    }

    facingAngle() {
      return Math.atan2(this.facing.x, this.facing.z);
    }

    updateCone() {
      this.coneMesh.position.copy(this.pos);
      this.coneMesh.position.y = 0;
      this.coneMesh.rotation.y = -this.facingAngle();
      this.coneMesh.material   = MAT_CONE[this.state] || MAT_CONE.patrol;
    }

    lookAt(target) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.01) this.facing.set(dx / dist, 0, dz / dist);
    }

    update(dt, playerPos, isCrouching) {
      const G    = window.G;
      const sees = this.canSeePlayer(playerPos, isCrouching);

      switch (this.state) {

        case 'patrol': {
          // Walk waypoint circuit
          const wp = this.waypoints[this.wpIdx];
          if (this.moveTo(wp, dt)) {
            this.wpIdx = (this.wpIdx + 1) % this.waypoints.length;
          }
          // Noise target overrides patrol
          if (this.noiseTarget) {
            this.state       = 'searching';
            this.stateT      = 0;
            this.lastKnown.copy(this.noiseTarget);
            this.noiseTarget = null;
            break;
          }
          if (sees) {
            this.state   = 'suspicious';
            this.stateT  = 0;
            this.detectT = 0;
            triggerAlarmLevel(1);
          }
          break;
        }

        case 'suspicious': {
          this.stateT += dt;
          if (sees) {
            this.detectT += dt;
            this.lookAt(playerPos);
            if (this.detectT >= DETECT_TIME) {
              this.state  = 'alerted';
              this.stateT = 0;
              this.lastKnown.copy(playerPos);
              triggerAlarmLevel(2);
              UI.showAlert('GUARD SPOTTED YOU!', 3000);
              UI.SFX.alert();
            }
          } else {
            this.detectT = Math.max(0, this.detectT - dt * 0.5);
            if (this.stateT > SUSP_TIME) {
              this.state   = 'patrol';
              this.detectT = 0;
            }
          }
          break;
        }

        case 'alerted': {
          // Chase player
          this.lastKnown.copy(playerPos);
          this.moveTo(playerPos, dt);

          // Catch check
          const dx   = playerPos.x - this.pos.x;
          const dz   = playerPos.z - this.pos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < CATCH_DIST && G) {
            G.playerCaught = true;
          }

          if (!sees) {
            this.state  = 'searching';
            this.stateT = 0;
          }
          break;
        }

        case 'searching': {
          this.stateT += dt;
          this.moveTo(this.lastKnown, dt);

          if (sees) {
            this.state  = 'alerted';
            this.stateT = 0;
          } else if (this.stateT > SEARCH_TIME) {
            this.state  = 'patrol';
            this.stateT = 0;
          }
          break;
        }
      }

      // Sync mesh
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = -this.facingAngle();
      this.updateCone();
    }

    getPosition() { return this.pos.clone(); }
    getState()    { return this.state; }
  }

  // ── Alarm levels ───────────────────────────────────────
  function triggerAlarmLevel(level) {
    if (level <= alertLevel) return;
    alertLevel = level;
    if (window.G) window.G.alarm.level = level;
    if (level >= 3 && window.Security) {
      Security.startAlarmCountdown();
    }
  }

  function resetAlarm() {
    alertLevel = 0;
    if (window.G) window.G.alarm.level = 0;
    guards.forEach(g => {
      g.state   = 'patrol';
      g.detectT = 0;
      g.stateT  = 0;
    });
  }

  // ── Noise notification (Q key distraction) ─────────────
  function notifyNoise(x, z, radius) {
    guards.forEach(g => {
      if (g.state !== 'patrol') return;
      const dist = Math.hypot(x - g.pos.x, z - g.pos.z);
      if (dist < radius) {
        g.noiseTarget = new THREE.Vector3(x, 0, z);
      }
    });
  }

  // ── Public API ─────────────────────────────────────────
  function init(scene, spawnData) {
    guards = spawnData.map(d => new Guard(d, scene));
  }

  function update(dt, playerPos, isCrouching) {
    guards.forEach(g => g.update(dt, playerPos, isCrouching));
  }

  function getGuardPositions() {
    return guards.map(g => g.getPosition());
  }

  return {
    init,
    update,
    getGuardPositions,
    getAlertLevel()  { return alertLevel; },
    triggerAlarmLevel,
    resetAlarm,
    notifyNoise,
  };

}());
