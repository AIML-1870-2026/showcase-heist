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

  // ── Materials ──────────────────────────────────────────
  const M = {
    floor:    new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.15, metalness: 0.05 }),
    wall:     new THREE.MeshStandardMaterial({ color: 0xf0ebe2, roughness: 0.85, metalness: 0.0  }),
    ceiling:  new THREE.MeshStandardMaterial({ color: 0xf8f6f2, roughness: 0.9,  metalness: 0.0  }),
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
  }

  function floor(scene, cx, cz, w, d) {
    box(scene, w, FLOOR_T, d, cx, -FLOOR_T / 2, cz, M.floor);
  }

  function ceiling(scene, cx, cz, w, d) {
    box(scene, w, FLOOR_T, d, cx, WALL_H + FLOOR_T / 2, cz, M.ceiling);
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
    box(scene, 1.2, WALL_H, 1.2, x, WALL_H / 2, z, M.pillar);
    addWallAABB(x, z, 1.2, 1.2);
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
      new THREE.MeshLambertMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 }));
    addWallAABB(x, z, 1.0, 0.5);
    const t = { mesh: null, x, z, hacked: false };
    terminals.push(t);
  }

  function keycard(scene, key, x, z) {
    const mesh = box(scene, 0.3, 0.05, 0.5, x, 0.75, z, M.keycards[key]);
    // Float animation handled in main loop via small userData flag
    mesh.userData.float = true;
    keycardPickups.push({ mesh, key, x, z, collected: false });
  }

  function door(scene, cx, cz, keyRequired) {
    // Doors span Z (NS orientation, 3 units wide on X)
    const mesh = box(scene, 3, WALL_H, WALL_T, cx, WALL_H / 2, cz, M.door);
    // Color tint by key required
    if (keyRequired === 'yellow') mesh.material = new THREE.MeshLambertMaterial({ color: 0xb8960a });
    if (keyRequired === 'blue')   mesh.material = new THREE.MeshLambertMaterial({ color: 0x2255aa });
    addWallAABB(cx, cz, 3, WALL_T + 0.1);
    doors.push({ mesh, x: cx, z: cz, keyRequired, open: false });
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
