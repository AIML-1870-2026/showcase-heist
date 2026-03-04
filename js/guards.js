'use strict';
// ── guards.js ──────────────────────────────────────────────
// Guard AI: patrol routes, vision cones, state machine, alarm levels.
// Exposes: window.Guards

window.Guards = (function () {

  // ── Constants ──────────────────────────────────────────
  const LOD_CONE_DIST2 = 45 * 45;  // hide vision cone beyond 45 units (fog fully opaque at 75)
  const VISION_ANGLE  = Math.PI / 3;   // 60° total (30° each side)
  const SUSP_TIME     = 3.0;           // seconds suspicious before giving up
  const SEARCH_TIME   = 5.0;           // seconds searching before giving up
  const CATCH_DIST    = 1.0;           // distance to "catch" player

  // ── Difficulty-scaled values (let so setDifficulty can mutate) ──
  let BASE_SPEED   = 3.5;
  let VISION_RANGE = 8;
  let DETECT_TIME  = 1.5;

  const _DIFF = {
    easy:   { BASE_SPEED: 2.8, VISION_RANGE: 6,  DETECT_TIME: 2.5 },
    normal: { BASE_SPEED: 3.5, VISION_RANGE: 8,  DETECT_TIME: 1.5 },
    hard:   { BASE_SPEED: 4.8, VISION_RANGE: 11, DETECT_TIME: 0.8 },
  };

  function setDifficulty(d) {
    const p = _DIFF[d] || _DIFF.normal;
    BASE_SPEED   = p.BASE_SPEED;
    VISION_RANGE = p.VISION_RANGE;
    DETECT_TIME  = p.DETECT_TIME;
  }

  // ── Wall occlusion (2D slab test, XZ plane) ────────────
  function hasLineOfSight(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const walls = window.G ? window.G.walls : [];
    for (const w of walls) {
      let tminX, tmaxX;
      if (Math.abs(dx) < 1e-8) {
        if (ax < w.minX || ax > w.maxX) continue;
        tminX = -Infinity; tmaxX = Infinity;
      } else {
        const inv = 1 / dx;
        tminX = (w.minX - ax) * inv;
        tmaxX = (w.maxX - ax) * inv;
        if (tminX > tmaxX) { const tmp = tminX; tminX = tmaxX; tmaxX = tmp; }
      }
      let tminZ, tmaxZ;
      if (Math.abs(dz) < 1e-8) {
        if (az < w.minZ || az > w.maxZ) continue;
        tminZ = -Infinity; tmaxZ = Infinity;
      } else {
        const inv = 1 / dz;
        tminZ = (w.minZ - az) * inv;
        tmaxZ = (w.maxZ - az) * inv;
        if (tminZ > tmaxZ) { const tmp = tminZ; tminZ = tmaxZ; tmaxZ = tmp; }
      }
      const tenter = Math.max(tminX, tminZ);
      const texit  = Math.min(tmaxX, tmaxZ);
      if (texit > tenter && tenter < 1 - 1e-4 && texit > 1e-4) return false;
    }
    return true;
  }

  // ── Speech bubble phrases ──────────────────────────────
  const BUBBLE_PHRASES = {
    patrol:     ['All clear.', 'Nothing here.', 'Quiet tonight...', 'Hmm...', 'Just another shift.'],
    suspicious: ["Who's there?", 'Did I see something?', 'Hold on...', 'Hey!', 'What was that?'],
    alerted:    ['STOP!', 'INTRUDER!', 'Sound the alarm!', "You can't hide!", 'Got you now!'],
    searching:  ['Come out!', "I know you're here.", 'Show yourself!', "Can't hide forever.", "Where'd they go?"],
  };

  function makeBubbleMaterial(text, state) {
    const W = 256, H = 72;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');

    const bg = state === 'alerted' ? '#cc1100' : state === 'suspicious' ? '#aa5500' : '#1a1a2e';
    const border = state === 'alerted' ? '#ff5500' : state === 'suspicious' ? '#ffaa00' : '#446688';

    // Bubble background (rounded rect)
    c.fillStyle = bg;
    c.beginPath();
    c.roundRect(6, 4, W - 12, 52, 10);
    c.fill();
    c.strokeStyle = border;
    c.lineWidth = 2;
    c.stroke();

    // Tail
    c.fillStyle = bg;
    c.beginPath();
    c.moveTo(W / 2 - 10, 56); c.lineTo(W / 2 + 10, 56); c.lineTo(W / 2, 70);
    c.closePath(); c.fill();

    // Text
    c.fillStyle = '#ffffff';
    c.font = 'bold 20px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, W / 2, 30);

    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  }

  let guards     = [];
  let alertLevel = 0;

  // ── Materials ──────────────────────────────────────────
  const MAT_BODY    = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.85, metalness: 0.05 });
  const MAT_HEAD    = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.9,  metalness: 0.0  });
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
    const matHat  = new THREE.MeshStandardMaterial({ color: 0x1a1a28, roughness: 0.8, metalness: 0.1 });
    const matBelt = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.5, metalness: 0.4 });

    // Legs
    [-0.17, 0.17].forEach(xOff => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.26), MAT_BODY);
      leg.position.set(xOff, 0.325, 0);
      leg.castShadow = true;
      g.add(leg);
    });

    // Torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.72, 0.46), MAT_BODY);
    body.position.y = 1.01;
    body.castShadow = true;
    g.add(body);

    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.48), matBelt);
    belt.position.y = 0.67;
    g.add(belt);

    // Arms
    [-0.46, 0.46].forEach(xOff => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.58, 0.24), MAT_BODY);
      arm.position.set(xOff, 0.96, 0);
      arm.castShadow = true;
      g.add(arm);
    });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), MAT_HEAD);
    head.position.y = 1.6;
    head.castShadow = true;
    g.add(head);

    // Hat (peaked cap)
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.58), matHat);
    hat.position.y = 1.93;
    g.add(hat);
    const hatBrim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.68), matHat);
    hatBrim.position.set(0, 1.83, 0.04);
    g.add(hatBrim);

    g.userData.bodyMesh = body;

    // Blob shadow — flat dark disc on the floor
    const blobShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
    );
    blobShadow.rotation.x = -Math.PI / 2;
    blobShadow.position.y = 0.02;
    g.add(blobShadow);

    // Detection meter — flat horizontal bar above hat, visible from third-person camera
    const barGroup = new THREE.Group();
    barGroup.position.y = 2.18;
    const bgBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.03, 0.13),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false })
    );
    barGroup.add(bgBar);
    const fillBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.04, 0.13),
      new THREE.MeshBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.95, depthWrite: false })
    );
    fillBar.scale.x = 0.001;
    barGroup.add(fillBar);
    barGroup.visible = false;
    g.add(barGroup);
    g.userData.detectBar  = barGroup;
    g.userData.detectFill = fillBar;

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

      this.pos        = new THREE.Vector3(data.spawnX, 0, data.spawnZ);
      this.facing     = new THREE.Vector3(0, 0, 1);
      this.smoothYaw  = 0;   // lerped rotation for smooth turning

      this._lastSaw  = false;   // cached vision result, updated on this guard's vision frame
      this._wasClose = false;   // true once detectT exceeded 45% of DETECT_TIME this pass
      this._walkT    = 0;       // walk animation accumulator

      this.mesh     = buildGuardMesh(scene);
      this.coneMesh = buildConeMesh(scene);
      this.detectBar  = this.mesh.userData.detectBar;
      this.detectFill = this.mesh.userData.detectFill;
      this._body      = this.mesh.userData.bodyMesh;

      this.mesh.position.copy(this.pos);

      // Flashlight — SpotLight at head height pointing in facing direction
      const flash = new THREE.SpotLight(0xfff8e0, 0.65, 14, 0.27, 0.45, 1.5);
      flash.castShadow = false;
      const flashTarget = new THREE.Object3D();
      scene.add(flash);
      scene.add(flashTarget);
      flash.target = flashTarget;
      this._flash       = flash;
      this._flashTarget = flashTarget;

      // Speech bubble sprite
      this._bubbleMat     = null;
      this._bubbleShowT   = 0;
      this._bubbleIdleT   = Math.random() * 4; // stagger first appearance
      this._bubbleVisible = false;
      this._prevState     = 'patrol';
      this._bubblePhrase  = '';
      const initMat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 });
      this.bubble = new THREE.Sprite(initMat);
      this.bubble.scale.set(2.4, 0.75, 1);
      this.bubble.visible = false;
      scene.add(this.bubble);
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
      if (dot <= Math.cos(VISION_ANGLE / 2)) return false;

      // Wall occlusion — blocked if a wall AABB intersects the sight line
      return hasLineOfSight(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
    }

    facingAngle() {
      return Math.atan2(this.facing.x, this.facing.z);
    }

    updateCone(playerPos) {
      const dx = playerPos.x - this.pos.x;
      const dz = playerPos.z - this.pos.z;
      if (dx * dx + dz * dz > LOD_CONE_DIST2) {
        this.coneMesh.visible = false;
        return;
      }
      this.coneMesh.visible    = true;
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

    update(dt, playerPos, isCrouching, doVisionCheck) {
      const G = window.G;
      // Refresh cached vision result on this guard's assigned frame, or whenever chasing
      if (this.state === 'alerted' || doVisionCheck) {
        this._lastSaw = this.canSeePlayer(playerPos, isCrouching);
      }
      const sees = this._lastSaw;

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
            if (this.detectT > DETECT_TIME * 0.45) this._wasClose = true;
            if (this.detectT >= DETECT_TIME) {
              this.state  = 'alerted';
              this.stateT = 0;
              this.lastKnown.copy(playerPos);
              this._wasClose = false;
              if (window.G) window.G.guardsAlerted++;
              triggerAlarmLevel(2);
              UI.showAlert('GUARD SPOTTED YOU!', 3000);
              UI.SFX.alert();
            }
          } else {
            this.detectT = Math.max(0, this.detectT - dt * 0.5);
            if (this.detectT === 0 && this._wasClose) {
              if (window.G) window.G.closeCalls++;
              this._wasClose = false;
            }
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

      // Walk bob animation
      const isMoving = this.state === 'patrol' || this.state === 'alerted' || this.state === 'searching';
      if (isMoving) this._walkT += dt * this.speed() * 0.9;
      if (this._body) {
        const bob = Math.sin(this._walkT * 3.2) * (isMoving ? 0.06 : 0.015);
        this._body.position.y = 0.6 + bob;
        this._body.rotation.z = Math.sin(this._walkT * 3.2 + Math.PI * 0.5) * (isMoving ? 0.05 : 0.01);
      }

      // Sync mesh — smoothly lerp yaw toward target angle
      const targetYaw = -this.facingAngle();
      let delta = targetYaw - this.smoothYaw;
      // Wrap delta to [-π, π] so guards take the short arc
      while (delta >  Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.smoothYaw += delta * Math.min(1, dt * 12);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.smoothYaw;
      this.updateCone(playerPos);
      this.tickBubble(dt);
      this.tickFlashlight();

      // Detection bar: visible when suspicious and detectT > 0
      const fill = this.detectT / DETECT_TIME;
      if (fill > 0.01 && this.state === 'suspicious') {
        this.detectBar.visible  = true;
        this.detectFill.scale.x = fill;
        // Pin left edge: full bar width=0.56, pivot at center, shift by half-missing portion
        this.detectFill.position.x = (fill - 1) * 0.28;
        this.detectFill.material.color.setHex(0xffee00);
      } else {
        this.detectBar.visible = false;
      }
    }

    tickFlashlight() {
      this._flash.position.set(this.pos.x, 1.55, this.pos.z);
      this._flashTarget.position.set(
        this.pos.x + this.facing.x * 11,
        0.7,
        this.pos.z + this.facing.z * 11
      );
      const a = this.state === 'alerted', s = this.state === 'suspicious';
      this._flash.color.setHex(a ? 0xff2200 : s ? 0xffcc44 : 0xfff8e0);
      this._flash.intensity = a ? 1.9 : s ? 1.2 : 0.65;
    }

    _showBubble(text) {
      if (text === this._bubblePhrase) return;
      this._bubblePhrase = text;
      if (this._bubbleMat) { this._bubbleMat.map.dispose(); this._bubbleMat.dispose(); }
      this._bubbleMat = makeBubbleMaterial(text, this.state);
      this.bubble.material = this._bubbleMat;
      this.bubble.visible  = true;
      this._bubbleVisible  = true;
      this._bubbleShowT    = 0;
    }

    tickBubble(dt) {
      const stateChanged = this.state !== this._prevState;
      if (stateChanged && this.state !== 'patrol') {
        const pool = BUBBLE_PHRASES[this.state] || BUBBLE_PHRASES.patrol;
        this._showBubble(pool[Math.floor(Math.random() * pool.length)]);
        this._bubbleIdleT = 0;
      }
      this._prevState = this.state;

      if (this._bubbleVisible) {
        this._bubbleShowT += dt;
        const showDur = this.state === 'alerted' ? 1.6 : 2.4;
        if (this._bubbleShowT > showDur) {
          this._bubbleVisible   = false;
          this.bubble.visible   = false;
          this._bubblePhrase    = ''; // allow repeat
          this._bubbleIdleT     = 0;
        }
      } else {
        this._bubbleIdleT += dt;
        const interval = this.state === 'alerted' ? 2.2 : this.state === 'suspicious' ? 3 : 7;
        if (this._bubbleIdleT > interval) {
          const pool = BUBBLE_PHRASES[this.state] || BUBBLE_PHRASES.patrol;
          this._showBubble(pool[Math.floor(Math.random() * pool.length)]);
        }
      }

      if (this._bubbleVisible) {
        this.bubble.position.set(this.pos.x, 3.0, this.pos.z);
      }
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

  let _visionFrame = 0;
  function update(dt, playerPos, isCrouching) {
    // Stagger vision checks across 3 frames — only ~1/3 of guards check vision per frame.
    // Alerted guards always check (they're chasing) to keep catch logic responsive.
    _visionFrame = (_visionFrame + 1) % 3;
    guards.forEach((g, i) => g.update(dt, playerPos, isCrouching, i % 3 === _visionFrame));
  }

  function getGuardPositions() {
    return guards.map(g => ({ x: g.pos.x, z: g.pos.z }));
  }

  return {
    init,
    update,
    getGuardPositions,
    getAlertLevel()  { return alertLevel; },
    triggerAlarmLevel,
    resetAlarm,
    notifyNoise,
    setDifficulty,
  };

}());
