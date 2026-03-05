'use strict';
// ── map.js ─────────────────────────────────────────────────
// Builds the 3D Louvre-inspired museum. Returns collision and
// spawn data consumed by guards.js, security.js, and player.js.
// Exposes: window.Map
//
// Museum layout (world units, Y = up, ground at Y = 0):
//   Lobby       X −20→20,  Z   0→40
//   Corridor 1  X  −5→ 5,  Z  40→55
//   Gallery     X −25→25,  Z  55→100
//   Corridor 2  X  −5→ 5,  Z 100→115
//   Crown Vault X −25→25,  Z 115→160
//   Exit zone   X  −5→ 5,  Z 160→165

window.GameMap = (function () {

  const WALL_H = 6;
  const WALL_T = 0.5;
  const FLOOR_T = 0.4;

  // ── Tile texture generator ──────────────────────────────
  function makeTileTex(tileColor, groutColor, tileSize) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = tileColor;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = groutColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(S, 0);
    ctx.moveTo(0, 0); ctx.lineTo(0, S);
    ctx.stroke();
    // Inner tile highlight (subtle bevel)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, S - 12, S - 12);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex._tileSize = tileSize;
    return tex;
  }

  const _tileTex    = makeTileTex('#d8cdb8', '#b0a898', 2);
  const _ceilTex    = makeTileTex('#f4f2ee', '#dedad4', 3);
  const _baseMat    = new THREE.MeshStandardMaterial({ color: 0xddd8cc, roughness: 0.7, metalness: 0.0 });
  const _wainMat    = new THREE.MeshStandardMaterial({ color: 0xc4b89a, roughness: 0.55, metalness: 0.0 });
  const _moldMat    = new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.78, metalness: 0.05 });
  const _frameMat   = new THREE.MeshStandardMaterial({ color: 0x2c1e0e, roughness: 0.6,  metalness: 0.08 });
  const _handleMat  = new THREE.MeshStandardMaterial({ color: 0xb08020, roughness: 0.2,  metalness: 0.9  });
  const _stripeMat  = new THREE.MeshStandardMaterial({ color: 0x1a0800, roughness: 0.95, metalness: 0.05 });
  const _chipMat    = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.25, metalness: 0.85 });

  // ── Materials ──────────────────────────────────────────
  const M = {
    floor:    new THREE.MeshStandardMaterial({ map: _tileTex, roughness: 0.2, metalness: 0.05 }),
    wall:     new THREE.MeshStandardMaterial({ color: 0xf0ebe2, roughness: 0.85, metalness: 0.0  }),
    ceiling:  new THREE.MeshStandardMaterial({ map: _ceilTex, roughness: 0.9,  metalness: 0.0  }),
    desk:     new THREE.MeshStandardMaterial({ color: 0x7a6348, roughness: 0.7,  metalness: 0.0  }),
    glass:    new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 }),
    frame:    new THREE.MeshStandardMaterial({ color: 0x3a2718, roughness: 0.6,  metalness: 0.1  }),
    door:     new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.65, metalness: 0.05 }),
    pillar:   new THREE.MeshStandardMaterial({ color: 0xe0dbd0, roughness: 0.7,  metalness: 0.0  }),
    pedestal: new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.4,  metalness: 0.2  }),
    crown:    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2,  metalness: 0.9  }),
    terminal: new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5,  metalness: 0.4  }),
    exit:     new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.3,  metalness: 0.0, transparent: true, opacity: 0.7 }),
    keycards: {
      yellow: new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.3, metalness: 0.6 }),
      blue:   new THREE.MeshStandardMaterial({ color: 0x4a9eff, roughness: 0.3, metalness: 0.6 }),
      red:    new THREE.MeshStandardMaterial({ color: 0xe05050, roughness: 0.3, metalness: 0.6 }),
    },
    paintings: [
      new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.9, metalness: 0.0 }),
    ],
  };

  // Collected data returned to main.js
  const walls          = [];
  const doors          = [];
  const keycardPickups = [];
  const stealables     = [];
  const terminals      = [];
  const laserData      = [];
  const cameraData     = [];
  const guardData      = [];

  // ── Low-level helpers ──────────────────────────────────
  function box(scene, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function addWallAABB(cx, cz, w, d) {
    walls.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  }

  // Solid wall segment + collision registration
  function wall(scene, cx, cz, w, d) {
    box(scene, w, WALL_H, d, cx, WALL_H / 2, cz, M.wall);
    addWallAABB(cx, cz, w + 0.02, d + 0.02);
    // Baseboard trim
    const bw = w > d ? w : 0.08;
    const bd = w > d ? 0.08 : d;
    box(scene, bw, 0.22, bd, cx, 0.11, cz, _baseMat);
    // Wainscoting panel (lower 1.15 units — darker painted wood tone)
    box(scene, w, 1.15, d, cx, 0.575, cz, _wainMat);
    // Chair rail — thin proud strip capping the wainscoting
    box(scene, w + 0.02, 0.07, d + 0.02, cx, 1.19, cz, _moldMat);
    // Crown molding at ceiling junction
    box(scene, w + 0.02, 0.13, d + 0.02, cx, WALL_H - 0.065, cz, _moldMat);
  }

  function floor(scene, cx, cz, w, d) {
    const mat = M.floor.clone();
    const tex  = _tileTex.clone();
    tex.wrapS  = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / _tileTex._tileSize, d / _tileTex._tileSize);
    mat.map = tex;
    box(scene, w, FLOOR_T, d, cx, -FLOOR_T / 2, cz, mat);
  }

  function ceiling(scene, cx, cz, w, d) {
    const mat = M.ceiling.clone();
    const tex  = _ceilTex.clone();
    tex.wrapS  = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / _ceilTex._tileSize, d / _ceilTex._tileSize);
    mat.map = tex;
    box(scene, w, FLOOR_T, d, cx, WALL_H + FLOOR_T / 2, cz, mat);
    // Recessed ceiling panel strip (thin dark inset frame)
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xe8e4de, roughness: 0.95, metalness: 0.0 });
    box(scene, w - 0.6, 0.05, d - 0.6, cx, WALL_H - 0.02, cz, panelMat);
  }

  // Full room shell: floor + ceiling + 4 walls with opening gap
  // Openings (door slots) are left by NOT drawing that full wall segment —
  // instead two partial segments are drawn, leaving a 3-unit door gap.
  function roomWalls(scene, cx, cz, rw, rd, openings) {
    openings = openings || {};

    // South wall (−Z face)
    if (!openings.south) {
      wall(scene, cx, cz - rd / 2, rw, WALL_T);
    }
    // North wall (+Z face)
    if (!openings.north) {
      wall(scene, cx, cz + rd / 2, rw, WALL_T);
    } else {
      // Two stubs flanking the door gap (3 units wide centered)
      const stub = (rw - 3) / 2;
      wall(scene, cx - (rw / 2 - stub / 2), cz + rd / 2, stub, WALL_T);
      wall(scene, cx + (rw / 2 - stub / 2), cz + rd / 2, stub, WALL_T);
    }
    // East wall (+X face)
    if (!openings.east) {
      wall(scene, cx + rw / 2, cz, WALL_T, rd);
    }
    // West wall (−X face)
    if (!openings.west) {
      wall(scene, cx - rw / 2, cz, WALL_T, rd);
    }

    floor(scene, cx, cz, rw, rd);
    ceiling(scene, cx, cz, rw, rd);
  }

  function pillar(scene, x, z) {
    // Shaft (slightly inset from base/capital)
    box(scene, 1.1, WALL_H - 0.36, 1.1, x, (WALL_H - 0.36) / 2 + 0.18, z, M.pillar);
    addWallAABB(x, z, 1.5, 1.5);
    // Base plinth + torus band
    box(scene, 1.5, 0.2,  1.5, x, 0.10, z, _moldMat);
    box(scene, 1.3, 0.12, 1.3, x, 0.30, z, _baseMat);
    // Capital flange + neck band
    box(scene, 1.5, 0.2,  1.5, x, WALL_H - 0.10, z, _moldMat);
    box(scene, 1.3, 0.12, 1.3, x, WALL_H - 0.30, z, _baseMat);
  }

  function displayCase(scene, x, z) {
    box(scene, 1.2, 0.8, 1.2, x, 0.4, z, M.desk);
    box(scene, 1.0, 1.2, 1.0, x, 1.4, z, M.glass);
    addWallAABB(x, z, 1.2, 1.2);
  }

  // Painting on a wall (frame + canvas)
  function wallPainting(scene, x, y, z, mat, isWestWall) {
    const offset = isWestWall ? 0.15 : -0.15;
    box(scene, Math.abs(offset) + 0.02, 1.6, 2.4, x, y, z, M.frame);
    box(scene, 0.08, 1.4, 2.1, x + offset, y, z, mat);
  }

  function terminal(scene, x, z) {
    box(scene, 1.0, 1.6, 0.5, x, 0.8, z, M.terminal);
    // Screen glow
    box(scene, 0.8, 0.8, 0.05, x, 1.2, z - 0.28,
      new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff44, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 }));
    addWallAABB(x, z, 1.0, 0.5);
    const t = { mesh: null, x, z, hacked: false };
    terminals.push(t);
  }

  function keycard(scene, key, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0.75, z);

    // Card body — proper ID card proportions (86mm × 54mm scaled to game units)
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.02, 0.86), M.keycards[key]);
    card.castShadow = true;
    group.add(card);

    // Magnetic stripe — dark brown band near one short edge
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.024, 0.1), _stripeMat);
    stripe.position.set(0, 0, 0.34);
    group.add(stripe);

    // EMV chip — gold rectangle in upper-left area
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.11), _chipMat);
    chip.position.set(-0.12, 0, 0.18);
    group.add(chip);

    // Holographic strip — thin iridescent bar opposite the stripe
    const holoMat = new THREE.MeshStandardMaterial({
      color: 0xddddff, roughness: 0.08, metalness: 0.9,
      emissive: 0x6644cc, emissiveIntensity: 0.35,
    });
    const holo = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.022, 0.07), holoMat);
    holo.position.set(0, 0, -0.28);
    group.add(holo);

    // Clip hole marker — small dark notch on corner
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.026, 0.07), holeMat);
    hole.position.set(-0.22, 0, -0.36);
    group.add(hole);

    scene.add(group);
    // tickFloatItems will drive group.position.y and group.rotation.y each frame
    keycardPickups.push({ mesh: group, key, x, z, collected: false });
  }

  function door(scene, cx, cz, keyRequired) {
    const doorColor = keyRequired === 'yellow' ? 0x8a6e10
                    : keyRequired === 'blue'   ? 0x1a3870
                    : 0x5a4530;
    const doorMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.62, metalness: 0.08 });
    const panelMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.5, metalness: 0.06 });

    // ── Animated door group (tickDoors animates scale.y + position.y on this) ──
    const doorGroup = new THREE.Group();
    doorGroup.position.set(cx, WALL_H / 2, cz);
    scene.add(doorGroup);

    // Door slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3, WALL_H, WALL_T), doorMat);
    slab.castShadow = true; slab.receiveShadow = true;
    doorGroup.add(slab);

    // Raised upper panel
    const upPanel = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.1, 0.07), panelMat);
    upPanel.position.set(0, 1.15, -(WALL_T / 2 + 0.035));
    doorGroup.add(upPanel);

    // Raised lower panel
    const loPanel = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.4, 0.07), panelMat);
    loPanel.position.set(0, -1.5, -(WALL_T / 2 + 0.035));
    doorGroup.add(loPanel);

    // Mid rail (horizontal divider between panels)
    const railMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, WALL_T + 0.08), panelMat);
    railMesh.position.set(0, -0.12, 0);
    doorGroup.add(railMesh);

    // Brass handle knob
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), _handleMat);
    knob.position.set(1.08, 0, -(WALL_T / 2 + 0.14));
    doorGroup.add(knob);

    // Handle backplate (thin rectangle behind knob)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.05), _handleMat);
    plate.position.set(1.08, 0, -(WALL_T / 2 + 0.06));
    doorGroup.add(plate);

    // ── Static door frame (does not animate) ──
    const FT = 0.22;  // frame thickness
    const FD = WALL_T + 0.14;  // frame depth (proud of wall both sides)
    // Left jamb
    box(scene, FT, WALL_H + 0.12, FD, cx - 1.61, WALL_H / 2, cz, _frameMat);
    // Right jamb
    box(scene, FT, WALL_H + 0.12, FD, cx + 1.61, WALL_H / 2, cz, _frameMat);
    // Header beam
    box(scene, 3 + FT * 2, 0.22, FD, cx, WALL_H + 0.11, cz, _frameMat);

    // Key-type indicator LED panel on left jamb face (glowing dot)
    const indColor = keyRequired === 'yellow' ? 0xf0c040 : 0x4a9eff;
    if (keyRequired) {
      const indMat = new THREE.MeshStandardMaterial({
        color: indColor, emissive: indColor, emissiveIntensity: 1.2, roughness: 0.3,
      });
      box(scene, 0.07, 0.28, 0.07, cx - 1.61, 1.35, cz - FD / 2 + 0.04, indMat);
    }

    addWallAABB(cx, cz, 3, WALL_T + 0.1);
    doors.push({ mesh: doorGroup, x: cx, z: cz, keyRequired, open: false, opening: false, openProgress: 0 });
  }

  // ── Build museum ───────────────────────────────────────
  function init(scene) {

    // ════════════════════════════════
    //  LOBBY  cx=0  cz=20  40×40
    // ════════════════════════════════
    roomWalls(scene, 0, 20, 40, 40, { north: true });

    // Reception desk
    box(scene, 8, 1.2, 2, 0, 0.6, 14, M.desk);
    box(scene, 8, 0.1, 2, 0, 1.25, 14, M.desk);
    addWallAABB(0, 14, 8, 2);

    // Decorative pillars
    pillar(scene, -10,  8);
    pillar(scene,  10,  8);
    pillar(scene, -10, 32);
    pillar(scene,  10, 32);

    // Lobby paintings (on east and west walls)
    wallPainting(scene, -19.9, 3.5,  8, M.paintings[0], true);
    wallPainting(scene, -19.9, 3.5, 28, M.paintings[1], true);
    wallPainting(scene,  19.9, 3.5, 16, M.paintings[2], false);

    // Yellow keycard behind reception desk
    keycard(scene, 'yellow', 0, 16.5);

    // Guard spawns — Lobby (2 guards)
    guardData.push({
      spawnX: -8, spawnZ: 4,
      waypoints: [
        new THREE.Vector3(-8, 0,  4),
        new THREE.Vector3(-8, 0, 36),
        new THREE.Vector3( 8, 0, 36),
        new THREE.Vector3( 8, 0,  4),
      ],
    });
    guardData.push({
      spawnX: 8, spawnZ: 36,
      waypoints: [
        new THREE.Vector3( 8, 0, 36),
        new THREE.Vector3(-8, 0, 36),
        new THREE.Vector3(-8, 0,  4),
        new THREE.Vector3( 8, 0,  4),
      ],
    });

    // Security camera — Lobby
    cameraData.push({
      x: 0, y: WALL_H - 0.3, z: 20,
      sweepAngle: Math.PI / 3, facingZ: -1,
    });

    // Yellow keycard door at corridor entrance
    door(scene, 0, 39.75, 'yellow');

    // ════════════════════════════════
    //  CORRIDOR 1  cx=0  cz=47.5  10×15
    // ════════════════════════════════
    floor(scene, 0, 47.5, 10, 15);
    ceiling(scene, 0, 47.5, 10, 15);
    wall(scene, -5, 47.5, WALL_T, 15);
    wall(scene,  5, 47.5, WALL_T, 15);

    // ════════════════════════════════
    //  GALLERY  cx=0  cz=77.5  50×45
    // ════════════════════════════════
    roomWalls(scene, 0, 77.5, 50, 45, { north: true });

    // Gallery pillars
    [-12, 0, 12].forEach(x => {
      pillar(scene, x, 62);
      pillar(scene, x, 92);
    });

    // Laser data: two low lasers in gallery entrance area
    laserData.push({ type: 'low', x1: -20, x2: -14, y: 0.5, z: 67 });
    laserData.push({ type: 'low', x1:   8, x2:  20, y: 0.5, z: 67 });
    laserData.push({ type: 'low', x1: -20, x2:  20, y: 0.5, z: 74 });

    // Famous painting on west wall of gallery
    wallPainting(scene, -24.9, 3.8, 92, M.paintings[4], true);
    const paintMesh = box(scene, 0.05, 2.0, 2.8, -24.9, 3.8, 92, M.paintings[3]);
    stealables.push({ mesh: paintMesh, item: 'painting', x: -24.9, z: 92, taken: false });

    // Display cases
    displayCase(scene,  14, 70);
    displayCase(scene, -14, 70);
    displayCase(scene,   0, 88);

    // Blue keycard in display case
    keycard(scene, 'blue', 14, 70);

    // Gallery decorative paintings
    wallPainting(scene, -24.9, 3.5, 70, M.paintings[0], true);
    wallPainting(scene,  24.9, 3.5, 80, M.paintings[1], false);
    wallPainting(scene,  24.9, 3.5, 60, M.paintings[2], false);

    // Hack terminal
    terminal(scene, 20, 78);

    // Guard spawns — Gallery (3 guards)
    guardData.push({
      spawnX: -10, spawnZ: 60,
      waypoints: [
        new THREE.Vector3(-10, 0, 60),
        new THREE.Vector3( 10, 0, 60),
        new THREE.Vector3( 10, 0, 78),
        new THREE.Vector3(-10, 0, 78),
      ],
    });
    guardData.push({
      spawnX: 0, spawnZ: 92,
      waypoints: [
        new THREE.Vector3(  0, 0, 92),
        new THREE.Vector3( 16, 0, 92),
        new THREE.Vector3( 16, 0, 98),
        new THREE.Vector3(-16, 0, 98),
        new THREE.Vector3(-16, 0, 92),
      ],
    });
    guardData.push({
      spawnX: -15, spawnZ: 65,
      waypoints: [
        new THREE.Vector3(-15, 0, 65),
        new THREE.Vector3(-15, 0, 75),
        new THREE.Vector3(  5, 0, 75),
        new THREE.Vector3(  5, 0, 65),
      ],
    });

    // Cameras — Gallery
    cameraData.push({ x: -10, y: WALL_H - 0.3, z: 84, sweepAngle: Math.PI / 2.5, facingZ:  1 });
    cameraData.push({ x:  10, y: WALL_H - 0.3, z: 64, sweepAngle: Math.PI / 2.5, facingZ:  1 });

    // Blue keycard door
    door(scene, 0, 99.75, 'blue');

    // ════════════════════════════════
    //  CORRIDOR 2  cx=0  cz=107.5  10×15
    // ════════════════════════════════
    floor(scene, 0, 107.5, 10, 15);
    ceiling(scene, 0, 107.5, 10, 15);
    wall(scene, -5, 107.5, WALL_T, 15);
    wall(scene,  5, 107.5, WALL_T, 15);

    // ════════════════════════════════
    //  CROWN VAULT  cx=0  cz=137.5  50×45
    // ════════════════════════════════
    roomWalls(scene, 0, 137.5, 50, 45, {});

    // Vault lasers: low + high + crossed
    laserData.push({ type: 'low',  x1: -20, x2:  20, y: 0.5, z: 122 });
    laserData.push({ type: 'high', x1: -20, x2:  20, y: 2.0, z: 132 });
    laserData.push({ type: 'low',  x1: -20, x2:   0, y: 0.5, z: 148 });
    laserData.push({ type: 'high', x1:   0, x2:  20, y: 2.0, z: 148 });

    // Red keycard near entrance
    keycard(scene, 'red', 18, 122);

    // Hack terminal
    terminal(scene, -20, 132);

    // Crown on pedestal
    box(scene, 1.4, 1.0, 1.4, 0, 0.5, 140, M.pedestal);
    const crownMesh = box(scene, 0.8, 0.6, 0.8, 0, 1.5, 140, M.crown);
    crownMesh.userData.float = true;
    stealables.push({ mesh: crownMesh, item: 'crown', x: 0, z: 140, taken: false });

    // Guard spawns — Crown Vault (4 guards)
    guardData.push({
      spawnX: -10, spawnZ: 120,
      waypoints: [
        new THREE.Vector3(-10, 0, 120),
        new THREE.Vector3( 10, 0, 120),
        new THREE.Vector3( 10, 0, 138),
        new THREE.Vector3(-10, 0, 138),
      ],
    });
    guardData.push({
      spawnX: 10, spawnZ: 155,
      waypoints: [
        new THREE.Vector3( 10, 0, 155),
        new THREE.Vector3(-10, 0, 155),
        new THREE.Vector3(-10, 0, 160),
        new THREE.Vector3( 10, 0, 160),
      ],
    });
    guardData.push({
      spawnX: -16, spawnZ: 140,
      waypoints: [
        new THREE.Vector3(-16, 0, 140),
        new THREE.Vector3(-16, 0, 158),
        new THREE.Vector3( 16, 0, 158),
        new THREE.Vector3( 16, 0, 140),
      ],
    });
    guardData.push({
      spawnX: 16, spawnZ: 118,
      waypoints: [
        new THREE.Vector3( 16, 0, 118),
        new THREE.Vector3( 16, 0, 130),
        new THREE.Vector3(-16, 0, 130),
        new THREE.Vector3(-16, 0, 118),
      ],
    });

    // Cameras — Crown Vault (4 cameras)
    cameraData.push({ x: -14, y: WALL_H - 0.3, z: 125, sweepAngle: Math.PI / 2.5, facingZ:  1 });
    cameraData.push({ x:  14, y: WALL_H - 0.3, z: 125, sweepAngle: Math.PI / 2.5, facingZ:  1 });
    cameraData.push({ x: -14, y: WALL_H - 0.3, z: 157, sweepAngle: Math.PI / 2.5, facingZ: -1 });
    cameraData.push({ x:  14, y: WALL_H - 0.3, z: 157, sweepAngle: Math.PI / 2.5, facingZ: -1 });

    // ════════════════════════════════
    //  EXIT ZONE  Z 160→165
    // ════════════════════════════════
    floor(scene, 0, 162.5, 10, 5);
    ceiling(scene, 0, 162.5, 10, 5);
    // Exit marker on far north wall
    box(scene, 6, 4, 0.15, 0, 2, 164.9, M.exit);

    return {
      walls,
      doors,
      keycardPickups,
      stealables,
      terminals,
      laserData,
      cameraData,
      guardData,
    };
  }

  return { init };

}());
