'use strict';
// ── security.js ────────────────────────────────────────────
// Security cameras, laser grids, alarm countdown.
// Exposes: window.Security

window.Security = (function () {

  // ── Wall occlusion helper (mirrors guards.js, shared logic) ──
  function _hasLOS(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const walls = window.G ? window.G.walls : [];
    for (const w of walls) {
      let tminX, tmaxX;
      if (Math.abs(dx) < 1e-8) {
        if (ax < w.minX || ax > w.maxX) continue;
        tminX = -Infinity; tmaxX = Infinity;
      } else {
        const inv = 1 / dx;
        tminX = (w.minX - ax) * inv; tmaxX = (w.maxX - ax) * inv;
        if (tminX > tmaxX) { const t = tminX; tminX = tmaxX; tmaxX = t; }
      }
      let tminZ, tmaxZ;
      if (Math.abs(dz) < 1e-8) {
        if (az < w.minZ || az > w.maxZ) continue;
        tminZ = -Infinity; tmaxZ = Infinity;
      } else {
        const inv = 1 / dz;
        tminZ = (w.minZ - az) * inv; tmaxZ = (w.maxZ - az) * inv;
        if (tminZ > tmaxZ) { const t = tminZ; tminZ = tmaxZ; tmaxZ = t; }
      }
      const tenter = Math.max(tminX, tminZ), texit = Math.min(tmaxX, tmaxZ);
      if (texit > tenter && tenter < 1 - 1e-4 && texit > 1e-4) return false;
    }
    return true;
  }

  // ── Constants ──────────────────────────────────────────
  const CAM_RANGE     = 10;
  const LOD_FOV_DIST2 = 45 * 45;
  const CAM_ANGLE     = Math.PI / 3;

  // ── Difficulty-scaled values ────────────────────────────
  let CAM_SPEED      = 0.45;   // rad/sec normal sweep
  let DETECT_TIME    = 1.5;    // seconds in cone → alert
  let ALARM_DURATION = 60;     // seconds before game over

  const _SEC_DIFF = {
    easy:    { CAM_SPEED: 0.15, DETECT_TIME: 5.0, ALARM_DURATION: 999 },
    normal:  { CAM_SPEED: 0.45, DETECT_TIME: 1.5, ALARM_DURATION: 360 },
    hard:    { CAM_SPEED: 0.58, DETECT_TIME: 1.1, ALARM_DURATION: 240 },
    noguard: { CAM_SPEED: 0.3,  DETECT_TIME: 999, ALARM_DURATION: 999 },
  };

  let _noGuardMode = false;

  function setDifficulty(d) {
    _noGuardMode = (d === 'noguard');
    const p = _SEC_DIFF[d] || _SEC_DIFF.normal;
    CAM_SPEED      = p.CAM_SPEED;
    DETECT_TIME    = p.DETECT_TIME;
    ALARM_DURATION = p.ALARM_DURATION;
    // Hide all laser meshes in no-guard mode
    if (_noGuardMode) {
      lasers.forEach(l => {
        if (l.mesh)      l.mesh.visible      = false;
        if (l._glowMesh) l._glowMesh.visible = false;
      });
    }
  }

  let cameras      = [];
  let lasers       = [];

  let cameraHacked  = false;
  let hackTimer     = 0;

  let alarmActive    = false;
  let alarmCountdown = 60;

  // ── Materials ──────────────────────────────────────────
  const MAT_CAMERA  = new THREE.MeshLambertMaterial({ color: 0x222222 });
  // Red laser (low — jump over)
  const MAT_LASER_CORE_RED = new THREE.MeshBasicMaterial({
    color: 0xff1800, transparent: true, opacity: 0.98,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const MAT_LASER_GLOW_RED = new THREE.MeshBasicMaterial({
    color: 0xff0800, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  // Blue laser (high — crouch under)
  const MAT_LASER_CORE_BLUE = new THREE.MeshBasicMaterial({
    color: 0x0088ff, transparent: true, opacity: 0.98,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const MAT_LASER_GLOW_BLUE = new THREE.MeshBasicMaterial({
    color: 0x0044ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const MAT_FOV = new THREE.MeshLambertMaterial({
    color: 0x00ffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
  });
  const MAT_FOV_ALERT = new THREE.MeshLambertMaterial({
    color: 0xff4400, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
  });
  const MAT_FOV_HACKED = new THREE.MeshLambertMaterial({
    color: 0x00ff44, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
  });

  // ── Camera FOV fan geometry ────────────────────────────
  function buildFOVMesh(scene) {
    const SEGS  = 10;
    const verts = [0, 0.1, 0];
    for (let i = 0; i <= SEGS; i++) {
      const a = -CAM_ANGLE / 2 + (i / SEGS) * CAM_ANGLE;
      verts.push(Math.sin(a) * CAM_RANGE, 0.1, Math.cos(a) * CAM_RANGE);
    }
    const indices = [];
    for (let i = 0; i < SEGS; i++) indices.push(0, i + 1, i + 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);

    const mesh = new THREE.Mesh(geo, MAT_FOV);
    scene.add(mesh);
    return mesh;
  }

  // ── Security camera class ──────────────────────────────
  class SecurityCamera {
    constructor(data, scene) {
      this.x          = data.x;
      this.y          = data.y;
      this.z          = data.z;
      this.sweepAngle = data.sweepAngle;
      this.baseAngle  = data.facingZ > 0 ? 0 : Math.PI;
      this.angle      = this.baseAngle;
      this.dir        = 1;
      this.detectT    = 0;
      this.alerted    = false;

      // Rotating camera mount — body + lens sweep together with angle
      this._mount = new THREE.Group();
      this._mount.position.set(data.x, data.y, data.z);
      scene.add(this._mount);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.45), MAT_CAMERA);
      this._mount.add(body);

      // Lens at -Z in local space; rotation so local -Z → facing direction = angle + PI
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), MAT_CAMERA);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, -0.05, -0.3);
      this._mount.add(lens);

      this._facing  = new THREE.Vector2(Math.sin(this.angle), Math.cos(this.angle));
      this._mount.rotation.y = this.angle + Math.PI;
      this._lastSaw = false;
      this.fovMesh  = buildFOVMesh(scene);
    }

    canSeePlayer(playerPos, isCrouching) {
      if (cameraHacked || isCrouching) return false;
      const dx = playerPos.x - this.x;
      const dz = playerPos.z - this.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > CAM_RANGE * CAM_RANGE) return false;
      const dist = Math.sqrt(dist2);
      const dot  = this._facing.x * (dx / dist) + this._facing.y * (dz / dist);
      if (dot <= Math.cos(CAM_ANGLE / 2)) return false;
      return _hasLOS(this.x, this.z, playerPos.x, playerPos.z);
    }

    update(dt, playerPos, isCrouching, doVisionCheck) {
      // Sweep — update cached facing whenever angle changes
      const spd = alarmActive ? CAM_SPEED * 1.7 : CAM_SPEED;
      this.angle += this.dir * spd * dt;
      if (this.angle > this.baseAngle + this.sweepAngle / 2)  this.dir = -1;
      if (this.angle < this.baseAngle - this.sweepAngle / 2)  this.dir =  1;
      this._facing.set(Math.sin(this.angle), Math.cos(this.angle));
      this._mount.rotation.y = this.angle + Math.PI;

      // Detection — refresh cached result on this camera's assigned frame
      if (doVisionCheck) this._lastSaw = this.canSeePlayer(playerPos, isCrouching);
      const sees = this._lastSaw;
      if (sees) {
        this.detectT += dt;
        if (this.detectT >= DETECT_TIME && !this.alerted) {
          this.alerted = true;
          Guards.triggerAlarmLevel(2);
          UI.showAlert('CAMERA SPOTTED YOU!', 3000);
          UI.SFX.alert();
        }
      } else {
        this.detectT = Math.max(0, this.detectT - dt * 0.6);
        if (this.detectT === 0) this.alerted = false;
      }

      // Update FOV mesh — cull when player is far (fog covers it anyway)
      const fdx = playerPos.x - this.x;
      const fdz = playerPos.z - this.z;
      if (fdx * fdx + fdz * fdz > LOD_FOV_DIST2) {
        this.fovMesh.visible = false;
      } else {
        this.fovMesh.visible = true;
        this.fovMesh.position.set(this.x, 0.05, this.z);
        this.fovMesh.rotation.y = -this.angle;
        if (cameraHacked) {
          this.fovMesh.material = MAT_FOV_HACKED;
        } else if (this.alerted) {
          this.fovMesh.material = MAT_FOV_ALERT;
        } else {
          this.fovMesh.material = MAT_FOV;
        }
      }
    }
  }

  // ── Laser class ────────────────────────────────────────
  const LASER_REACTIVATE_TIME = 8;   // seconds before a triggered laser comes back

  class Laser {
    constructor(data, scene) {
      this.type = data.type;   // 'low' | 'high'
      this.x1   = data.x1;
      this.x2   = data.x2;
      this.y    = data.y;
      this.z    = data.z;
      this.triggered      = false;
      this.reactivateTimer = 0;    // counts down after being triggered
      this._warned        = false; // prevents duplicate warning

      const w   = Math.abs(data.x2 - data.x1);
      const cx  = (data.x1 + data.x2) / 2;

      // Pick color by type: 'low' = red (jump over), 'high' = blue (crouch under)
      const isHigh = (data.type === 'high');
      const coreMat = isHigh ? MAT_LASER_CORE_BLUE : MAT_LASER_CORE_RED;
      const glowMat = isHigh ? MAT_LASER_GLOW_BLUE : MAT_LASER_GLOW_RED;

      // Thin core beam
      this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.025), coreMat);
      this.mesh.position.set(cx, data.y, data.z);
      scene.add(this.mesh);

      // Wider soft glow halo around the core
      this._glowMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.18), glowMat);
      this._glowMesh.position.set(cx, data.y, data.z);
      scene.add(this._glowMesh);

      // Emitter boxes at each end — match beam color
      const emitColor    = isHigh ? 0x0066dd : 0xff2200;
      const emitEmissive = isHigh ? 0x0033ff : 0xff0800;
      const emitMat = new THREE.MeshStandardMaterial({ color: emitColor, emissive: emitEmissive, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.1 });
      const emitGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
      [data.x1, data.x2].forEach(ex => {
        const e = new THREE.Mesh(emitGeo, emitMat);
        e.position.set(ex, data.y, data.z);
        scene.add(e);
      });
    }

    // Tick reactivation countdown — called each frame
    update(dt) {
      if (!this.triggered || this.reactivateTimer <= 0) return;
      this.reactivateTimer -= dt;
      // Warn player 2 s before beam comes back
      if (!this._warned && this.reactivateTimer <= 2) {
        this._warned = true;
        UI.showAlert('⚠ LASER REACTIVATING!', 1800);
      }
      // Flash the beam mesh in the last 2 s so the player sees it
      if (this.reactivateTimer <= 2) {
        const vis = Math.floor(this.reactivateTimer * 6) % 2 === 0;
        this.mesh.visible      = vis;
        this._glowMesh.visible = vis;
      }
      if (this.reactivateTimer <= 0) {
        this.triggered         = false;
        this._warned           = false;
        this.mesh.visible      = true;
        this._glowMesh.visible = true;
      }
    }

    // Returns true if the player triggers this beam
    checkPlayer(playerPos, playerState) {
      if (this.triggered) return false;

      // Z proximity to the laser plane — reduced for less hair-trigger sensitivity
      if (Math.abs(playerPos.z - this.z) > 0.32) return false;

      // X range
      const minX = Math.min(this.x1, this.x2);
      const maxX = Math.max(this.x1, this.x2);
      if (playerPos.x < minX || playerPos.x > maxX) return false;

      if (this.type === 'low') {
        // Low red laser (Y ≈ 0.5): safe if feet are off the ground (jumping)
        // playerPos.y is the feet position — anything > 0.45 means you've left the ground
        if (playerPos.y > 0.45) return false;
      } else {
        // High blue laser (Y ≈ 2.0): safe if crouching or sliding
        if (playerState === 'crouching' || playerState === 'sliding') return false;
      }

      return true;
    }
  }

  // ── Alarm countdown ────────────────────────────────────
  function startAlarmCountdown() {
    if (alarmActive) return;
    alarmActive    = true;
    alarmCountdown = ALARM_DURATION;
    UI.showAlarm(true);
    UI.SFX.alarm();
    if (window.G) window.G.alarm.active = true;
  }

  function hackCameras(duration) {
    cameraHacked = true;
    hackTimer    = duration;
  }

  function triggerAlarmLevel(level) {
    if (window.Guards) Guards.triggerAlarmLevel(level);
    // countdown NOT started here — only laser trips start the escape timer
  }

  // Called only when a laser is tripped — starts the countdown
  function triggerLaserAlarm() {
    if (window.Guards) Guards.triggerAlarmLevel(3);
    startAlarmCountdown();
  }

  // ── Init ───────────────────────────────────────────────
  function init(scene, laserDataArr, camDataArr) {
    lasers  = laserDataArr.map(d => new Laser(d, scene));
    cameras = camDataArr.map(d => new SecurityCamera(d, scene));
  }

  // ── Update (called each frame) ─────────────────────────
  let _camVisionFrame = 0;
  function update(dt, playerPos, playerState) {
    // Camera hack timer
    if (cameraHacked) {
      hackTimer -= dt;
      if (hackTimer <= 0) { cameraHacked = false; hackTimer = 0; }
    }

    // Stagger camera vision checks across 3 frames (~4 checks/frame instead of 11)
    _camVisionFrame = (_camVisionFrame + 1) % 3;
    const crouching = playerState === 'crouching';
    cameras.forEach((c, i) => c.update(dt, playerPos, crouching, i % 3 === _camVisionFrame));

    // Check laser beams — skipped entirely in no-guard mode
    if (_noGuardMode) return;
    for (const laser of lasers) {
      laser.update(dt);
      if (laser.checkPlayer(playerPos, playerState)) {
        laser.triggered            = true;
        laser.reactivateTimer      = LASER_REACTIVATE_TIME;
        laser.mesh.visible         = false;
        laser._glowMesh.visible    = false;
        triggerLaserAlarm();
        UI.showAlert('LASER TRIGGERED!', 3500);
        UI.showLaserFlash(4000);
        UI.SFX.alarm();
      }
    }

    // Alarm countdown
    if (alarmActive) {
      alarmCountdown -= dt;
      UI.updateAlarmTimer(alarmCountdown);
      if (alarmCountdown <= 0) {
        alarmCountdown = 0;
        if (window.G && window.G.phase === 'playing') {
          window.G.phase = 'gameover';
          UI.showGameOver("Time's Up!", 'The alarm countdown reached zero.');
        }
      }
    }
  }

  // ── Reset ──────────────────────────────────────────────
  function resetAlarm() {
    alarmActive    = false;
    alarmCountdown = ALARM_DURATION;
    cameraHacked   = false;
    hackTimer      = 0;
    UI.showAlarm(false);
    if (window.G) window.G.alarm.active = false;
  }

  function resetLasers() {
    lasers.forEach(l => {
      l.triggered       = false;
      l.reactivateTimer = 0;
      l._warned         = false;
      l.mesh.visible    = true;
    });
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init,
    update,
    hackCameras,
    triggerAlarmLevel,
    startAlarmCountdown,
    resetAlarm,
    resetLasers,
    isAlarmActive() { return alarmActive; },
    setDifficulty,
  };

}());
