'use strict';
// ── security.js ────────────────────────────────────────────
// Security cameras, laser grids, alarm countdown.
// Exposes: window.Security

window.Security = (function () {

  // ── Constants ──────────────────────────────────────────
  const CAM_RANGE   = 10;
  const CAM_ANGLE   = Math.PI / 3;
  const CAM_SPEED   = 0.45;   // rad/sec normal sweep
  const DETECT_TIME = 1.5;    // seconds in cone → alert

  let cameras      = [];
  let lasers       = [];

  let cameraHacked  = false;
  let hackTimer     = 0;

  let alarmActive    = false;
  let alarmCountdown = 60;

  // ── Materials ──────────────────────────────────────────
  const MAT_CAMERA  = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const MAT_LASER_LOW  = new THREE.MeshLambertMaterial({
    color: 0xff2200, transparent: true, opacity: 0.75,
  });
  const MAT_LASER_HIGH = new THREE.MeshLambertMaterial({
    color: 0x0099ff, transparent: true, opacity: 0.75,
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

      // Physical camera body on the ceiling/wall
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.25, 0.45),
        MAT_CAMERA
      );
      body.position.set(data.x, data.y, data.z);
      scene.add(body);

      // Lens bump
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8),
        MAT_CAMERA
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(data.x, data.y - 0.05, data.z - 0.3);
      scene.add(lens);

      this.fovMesh = buildFOVMesh(scene);
    }

    getFacing() {
      return new THREE.Vector3(Math.sin(this.angle), 0, Math.cos(this.angle));
    }

    canSeePlayer(playerPos, isCrouching) {
      if (cameraHacked || isCrouching) return false;
      const dx = playerPos.x - this.x;
      const dz = playerPos.z - this.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > CAM_RANGE * CAM_RANGE) return false;
      const dist  = Math.sqrt(dist2);
      const facing = this.getFacing();
      const dot    = facing.x * (dx / dist) + facing.z * (dz / dist);
      return dot > Math.cos(CAM_ANGLE / 2);
    }

    update(dt, playerPos, isCrouching) {
      // Sweep
      const spd = alarmActive ? CAM_SPEED * 1.7 : CAM_SPEED;
      this.angle += this.dir * spd * dt;
      if (this.angle > this.baseAngle + this.sweepAngle / 2)  this.dir = -1;
      if (this.angle < this.baseAngle - this.sweepAngle / 2)  this.dir =  1;

      // Detection
      const sees = this.canSeePlayer(playerPos, isCrouching);
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

      // Update FOV mesh
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

  // ── Laser class ────────────────────────────────────────
  class Laser {
    constructor(data, scene) {
      this.type = data.type;   // 'low' | 'high'
      this.x1   = data.x1;
      this.x2   = data.x2;
      this.y    = data.y;
      this.z    = data.z;
      this.triggered = false;

      const w   = Math.abs(data.x2 - data.x1);
      const mat = data.type === 'low' ? MAT_LASER_LOW : MAT_LASER_HIGH;

      this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.07), mat);
      this.mesh.position.set((data.x1 + data.x2) / 2, data.y, data.z);
      scene.add(this.mesh);

      // Emitter boxes at each end
      const emitMat = new THREE.MeshLambertMaterial({ color: data.type === 'low' ? 0xff4400 : 0x0066ff });
      const emitGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
      [data.x1, data.x2].forEach(ex => {
        const e = new THREE.Mesh(emitGeo, emitMat);
        e.position.set(ex, data.y, data.z);
        scene.add(e);
      });
    }

    // Returns true if the player triggers this beam
    checkPlayer(playerPos, playerState) {
      if (this.triggered) return false;

      // Z proximity to the laser plane
      if (Math.abs(playerPos.z - this.z) > 0.55) return false;

      // X range
      const minX = Math.min(this.x1, this.x2);
      const maxX = Math.max(this.x1, this.x2);
      if (playerPos.x < minX || playerPos.x > maxX) return false;

      if (this.type === 'low') {
        // Low laser (Y ≈ 0.5): safe if jumping high enough (Y > 1.5)
        if (playerPos.y > 1.5) return false;
      } else {
        // High laser (Y ≈ 2.0): safe if sliding
        if (playerState === 'sliding') return false;
      }

      return true;
    }
  }

  // ── Alarm countdown ────────────────────────────────────
  function startAlarmCountdown() {
    if (alarmActive) return;
    alarmActive    = true;
    alarmCountdown = 60;
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
    if (level >= 3)    startAlarmCountdown();
  }

  // ── Init ───────────────────────────────────────────────
  function init(scene, laserDataArr, camDataArr) {
    lasers  = laserDataArr.map(d => new Laser(d, scene));
    cameras = camDataArr.map(d => new SecurityCamera(d, scene));
  }

  // ── Update (called each frame) ─────────────────────────
  function update(dt, playerPos, playerState) {
    // Camera hack timer
    if (cameraHacked) {
      hackTimer -= dt;
      if (hackTimer <= 0) { cameraHacked = false; hackTimer = 0; }
    }

    // Update all cameras
    const crouching = playerState === 'crouching';
    cameras.forEach(c => c.update(dt, playerPos, crouching));

    // Check laser beams
    for (const laser of lasers) {
      if (laser.checkPlayer(playerPos, playerState)) {
        laser.triggered       = true;
        laser.mesh.visible    = false;
        triggerAlarmLevel(3);
        UI.showAlert('LASER TRIGGERED!', 3500);
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
    alarmCountdown = 60;
    cameraHacked   = false;
    hackTimer      = 0;
    UI.showAlarm(false);
    if (window.G) window.G.alarm.active = false;
  }

  function resetLasers() {
    lasers.forEach(l => {
      l.triggered      = false;
      l.mesh.visible   = true;
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
  };

}());
