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
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, S - 12, S - 12);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex._tileSize = tileSize;
    return tex;
  }

  // ── Marble floor texture (sine-turbulence veining) ──────
  function makeMarbleTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0.0, '#eee8de');
    grad.addColorStop(0.5, '#e8e2d7');
    grad.addColorStop(1.0, '#ede7dc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const t = x * 0.013 + y * 0.007
                + Math.sin(x * 0.041 + y * 0.018) * 3.1
                + Math.sin(y * 0.032 + x * 0.023) * 2.5
                + Math.sin((x + y) * 0.019) * 1.7;
        const vein = Math.abs(Math.sin(t * Math.PI));
        const dark = vein * vein * 52;
        const i = (y * S + x) * 4;
        d[i]   = Math.max(0, d[i]   - dark * 0.58);
        d[i+1] = Math.max(0, d[i+1] - dark * 0.70);
        d[i+2] = Math.max(0, d[i+2] - dark * 0.88);
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(138,128,116,0.40)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= S; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex._tileSize = 4;
    return tex;
  }

  // ── Procedural painting texture (impressionist brushstrokes) ──
  function makePaintingTex(hex) {
    const r0 = (hex >> 16) & 255, g0 = (hex >> 8) & 255, b0 = hex & 255;
    const W = 160, H = 224;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    // Linen ground
    ctx.fillStyle = `rgb(${(220 + r0 * 0.04) | 0},${(214 + g0 * 0.04) | 0},${(205 + b0 * 0.04) | 0})`;
    ctx.fillRect(0, 0, W, H);
    // Main color wash
    ctx.fillStyle = `rgba(${r0},${g0},${b0},0.68)`;
    ctx.fillRect(0, 0, W, H);
    // Brushstrokes
    for (let i = 0; i < 44; i++) {
      const t = i / 44;
      const dr = Math.sin(i * 1.71) * 42 | 0;
      const dg = Math.cos(i * 2.31) * 36 | 0;
      const db = Math.sin(i * 3.13) * 54 | 0;
      ctx.globalAlpha = 0.22 + Math.abs(Math.sin(t * 13)) * 0.28;
      ctx.strokeStyle = `rgb(${Math.min(255,Math.max(0,r0+dr))},${Math.min(255,Math.max(0,g0+dg))},${Math.min(255,Math.max(0,b0+db))})`;
      ctx.lineWidth = 3 + Math.abs(Math.sin(t * 7)) * 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const sx = (W * 0.08 + Math.sin(t * 11.3) * W * 0.46 + t * W * 0.84) % W;
      const sy = (H * 0.06 + Math.cos(t *  9.1) * H * 0.38 + t * H * 0.72) % H;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(
        sx + Math.cos(t * 7.9) * 38, sy + Math.sin(t * 6.3) * 32,
        sx + Math.cos(t * 5.1 + 1) * 52, sy + Math.sin(t * 7.7 + 1) * 44
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return new THREE.CanvasTexture(c);
  }

  const _tileTex    = makeMarbleTex();
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
    floor:    new THREE.MeshStandardMaterial({ map: _tileTex, roughness: 0.12, metalness: 0.08 }),
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
    paintings: [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xe67e22].map(hex =>
      new THREE.MeshStandardMaterial({ map: makePaintingTex(hex), roughness: 0.88, metalness: 0.0 })
    ),
  };

  // Collected data returned to main.js
  const walls          = [];
  const doors          = [];
  const keycardPickups = [];
  const stealables     = [];
  const terminals      = [];
  const coinPickups    = [];
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

  function coinCache(scene, x, z, amount, baseY) {
    const group = new THREE.Group();
    group.position.set(x, baseY || 1.1, z);
    // Cloth bag body
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x2a5018, roughness: 0.85, metalness: 0.0 });
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), bagMat);
    bag.scale.set(1.0, 0.88, 0.82); bag.castShadow = true;
    group.add(bag);
    // Gold drawstring ring
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.2, metalness: 0.85 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.016, 6, 12), ringMat);
    ring.position.y = 0.12;
    group.add(ring);
    // Coin glinting on top
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 10), ringMat);
    coin.position.set(0.07, 0.16, 0.04); coin.rotation.z = 0.4;
    group.add(coin);
    scene.add(group);
    coinPickups.push({ mesh: group, x, z, amount, collected: false, baseY: baseY || 1.1 });
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

  // ── Decorative helpers ─────────────────────────────────
  const _brassM = new THREE.MeshStandardMaterial({ color: 0xb08020, roughness: 0.22, metalness: 0.88 });

  function ceilingLamp(scene, x, z) {
    const glassM = new THREE.MeshStandardMaterial({
      color: 0xfff5e0, roughness: 0.12, metalness: 0.0,
      transparent: true, opacity: 0.60,
      emissive: 0xffe8a0, emissiveIntensity: 0.55,
    });
    // Hanging rod
    box(scene, 0.05, 1.1, 0.05, x, WALL_H - 0.55, z, _brassM);
    // Decorative ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.026, 6, 14), _brassM);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, WALL_H - 1.12, z);
    scene.add(ring);
    // Frosted globe
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glassM);
    globe.position.set(x, WALL_H - 1.38, z);
    scene.add(globe);
  }

  function wallSconce(scene, wx, y, wz, extX) {
    const glowM = new THREE.MeshStandardMaterial({
      color: 0xffe8a0, roughness: 0.12,
      emissive: 0xffc840, emissiveIntensity: 0.88,
      transparent: true, opacity: 0.80,
    });
    box(scene, 0.06, 0.26, 0.06, wx, y, wz, _brassM);
    box(scene, 0.20, 0.04, 0.04, wx + 0.10 * extX, y + 0.07, wz, _brassM);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), glowM);
    globe.position.set(wx + 0.22 * extX, y + 0.07, wz);
    scene.add(globe);
  }

  function plantPot(scene, x, z, scale) {
    scale = scale || 1.0;
    const potM  = new THREE.MeshStandardMaterial({ color: 0x8a6040, roughness: 0.82, metalness: 0.0 });
    const leafM = new THREE.MeshStandardMaterial({
      color: 0x2c5a18, roughness: 0.80, metalness: 0.0,
      emissive: 0x081406, emissiveIntensity: 0.12,
    });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.14 * scale, 0.36 * scale, 10), potM);
    pot.position.set(x, 0.18 * scale, z);
    pot.castShadow = true;
    scene.add(pot);
    // Foliage cluster (5 overlapping spheres)
    const offsets = [[0,0.56,0.18],[-0.11,0.46,0.16],[0.10,0.50,0.15],[0.04,0.64,0.16],[-0.06,0.70,0.13]];
    offsets.forEach(([ox, oy, r]) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 7, 5), leafM);
      leaf.position.set(x + ox * scale, oy * scale, z);
      leaf.castShadow = true;
      scene.add(leaf);
    });
  }

  function galleryBench(scene, x, z, rotY) {
    const woodM  = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.72, metalness: 0.0 });
    const metalM = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.40, metalness: 0.65 });
    const g = new THREE.Group();
    // Three seat slats
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 0.14), woodM);
      slat.position.set(0, 0.46, i * 0.16);
      g.add(slat);
    }
    // Backrest
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.36, 0.07), woodM);
    back.position.set(0, 0.75, 0.24);
    g.add(back);
    // Four metal legs
    [[-0.8, -0.22], [-0.8, 0.22], [0.8, -0.22], [0.8, 0.22]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.44, 6), metalM);
      leg.position.set(lx, 0.22, lz);
      g.add(leg);
    });
    g.position.set(x, 0, z);
    if (rotY) g.rotation.y = rotY;
    scene.add(g);
  }

  function lobbyFountain(scene, x, z) {
    const stoneM = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.58, metalness: 0.06 });
    const waterM = new THREE.MeshStandardMaterial({
      color: 0x4488aa, roughness: 0.04, metalness: 0.22,
      transparent: true, opacity: 0.72,
    });
    // Lower basin
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.36, 22), stoneM);
    outer.position.set(x, 0.18, z);
    outer.castShadow = outer.receiveShadow = true;
    scene.add(outer);
    // Water surface in lower basin
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.14, 2.14, 0.05, 22), waterM);
    water.position.set(x, 0.335, z);
    scene.add(water);
    // Central column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.42, 12), stoneM);
    col.position.set(x, 0.71, z);
    col.castShadow = true;
    scene.add(col);
    // Upper bowl
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.16, 0.24, 18), stoneM);
    bowl.position.set(x, 1.48, z);
    scene.add(bowl);
    // Upper water
    const waterUp = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.04, 18), waterM);
    waterUp.position.set(x, 1.61, z);
    scene.add(waterUp);
    // Finial
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), _brassM);
    finial.position.set(x, 1.87, z);
    scene.add(finial);
    addWallAABB(x, z, 5.0, 5.0);
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

    // Lobby fountain — grand centerpiece
    lobbyFountain(scene, 0, 26);

    // Ceiling lamps above existing point lights
    [[-8, 10], [8, 10], [-8, 30], [8, 30]].forEach(([lx, lz]) => ceilingLamp(scene, lx, lz));

    // Corner plants
    [[-17, 4], [17, 4], [-17, 36], [17, 36]].forEach(([px, pz]) => plantPot(scene, px, pz, 1.4));

    // Wall sconces flanking paintings
    wallSconce(scene, -19.75, 2.9,  4,  1);  // west wall, near z=8 painting
    wallSconce(scene, -19.75, 2.9, 18,  1);  // west wall, between paintings
    wallSconce(scene,  19.75, 2.9,  8, -1);  // east wall
    wallSconce(scene,  19.75, 2.9, 28, -1);  // east wall beside painting

    // ════════════════════════════════
    //  CORRIDOR 1  cx=0  cz=47.5  10×15
    //  Guard checkpoint / break room
    // ════════════════════════════════
    floor(scene, 0, 47.5, 10, 15);
    ceiling(scene, 0, 47.5, 10, 15);
    wall(scene, -5, 47.5, WALL_T, 15);
    wall(scene,  5, 47.5, WALL_T, 15);

    // Guard break table + chair against east wall
    box(scene, 2.0, 0.75, 1.3, 3.5, 0.375, 47.5, M.desk);
    box(scene, 0.65, 0.5,  0.65, 3.5, 0.25, 45.8, M.desk);    // seat
    box(scene, 0.65, 0.75, 0.1,  3.5, 0.375, 45.5, M.desk);   // backrest
    // Wall locker on west side (guard equipment)
    box(scene, 1.1, 2.3, 0.45, -4.6, 1.15, 43.5, _frameMat);
    box(scene, 0.5, 2.2, 0.06, -4.6, 1.1,  43.27, _moldMat);  // locker door panel
    // Security schedule board
    box(scene, 2.2, 1.5, 0.08, -4.6, 2.8, 49.5, M.terminal);
    box(scene, 1.9, 1.2, 0.05, -4.6, 2.8, 49.45,
      new THREE.MeshStandardMaterial({ color: 0x001a33, emissive: 0x000d1a, emissiveIntensity: 0.4 }));
    // Coin cache — guards left their distraction coin stash on the table
    coinCache(scene, 3.5, 47.5, 3, 1.1);

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

    // Jade figurine — bonus stealable inside display case at (0, 88)
    const jadeMat = new THREE.MeshStandardMaterial({
      color: 0x2d8a50, roughness: 0.32, metalness: 0.22,
      emissive: 0x0a3018, emissiveIntensity: 0.18,
    });
    const jadeFig = new THREE.Group();
    const jadeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 8), jadeMat);
    jadeFig.add(jadeBase);
    const jadeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.11, 0.21, 8), jadeMat);
    jadeBody.position.y = 0.14; jadeFig.add(jadeBody);
    const jadeHead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), jadeMat);
    jadeHead.position.y = 0.29; jadeFig.add(jadeHead);
    jadeFig.position.set(0, 1.45, 88);
    scene.add(jadeFig);
    stealables.push({ mesh: jadeFig, item: 'jade', x: 0, z: 88, taken: false, bonus: true, label: 'Jade Figurine' });

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

    // Gallery ceiling lamps above point lights
    [[-10, 65], [10, 65], [0, 80], [-10, 95], [10, 95]].forEach(([lx, lz]) => ceilingLamp(scene, lx, lz));

    // Museum benches (center of gallery)
    galleryBench(scene, -6, 82, 0);
    galleryBench(scene,  6, 82, 0);
    galleryBench(scene,  5, 68, Math.PI / 2);

    // Corner plants
    [[-22, 58], [22, 58], [-22, 98], [22, 98]].forEach(([px, pz]) => plantPot(scene, px, pz, 1.1));

    // Wall sconces between paintings
    wallSconce(scene, -24.75, 2.9, 82,  1);  // west wall between paintings
    wallSconce(scene,  24.75, 2.9, 70, -1);  // east wall
    wallSconce(scene,  24.75, 2.9, 88, -1);  // east wall

    // ════════════════════════════════
    //  CORRIDOR 2  cx=0  cz=107.5  10×15
    //  Maintenance / service passage
    // ════════════════════════════════
    floor(scene, 0, 107.5, 10, 15);
    ceiling(scene, 0, 107.5, 10, 15);
    wall(scene, -5, 107.5, WALL_T, 15);
    wall(scene,  5, 107.5, WALL_T, 15);

    // Shelving unit + boxes against west wall
    box(scene, 2.4, 2.6, 0.45, -4.65, 1.3, 107.5, M.desk);
    box(scene, 0.65, 0.3, 0.38, -4.65, 2.65, 108.2, M.terminal); // small crate on top
    box(scene, 0.55, 0.28, 0.38, -4.65, 2.65, 106.8, M.terminal);
    // Utility table on east side
    box(scene, 1.8, 0.75, 1.0, 3.5, 0.375, 109, M.desk);
    box(scene, 0.55, 0.22, 0.35, 3.5, 0.86, 109, M.terminal);    // item on table
    // Coin cache — maintenance crew left spare coins
    coinCache(scene, 3.5, 109, 2, 1.1);

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

    // Royal Scepter — bonus stealable on its own pedestal
    box(scene, 0.9, 1.1, 0.9, -9, 0.55, 135, M.pedestal);
    const sceptMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, roughness: 0.15, metalness: 0.95,
      emissive: 0x332200, emissiveIntensity: 0.35,
    });
    const scepter = new THREE.Group();
    const sceptRod = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.62, 8), sceptMat);
    scepter.add(sceptRod);
    const sceptOrb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), sceptMat);
    sceptOrb.position.y = 0.38; scepter.add(sceptOrb);
    const sceptCross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.038, 0.038), sceptMat);
    sceptCross.position.y = 0.26; scepter.add(sceptCross);
    scepter.position.set(-9, 1.5, 135);
    scene.add(scepter);
    stealables.push({ mesh: scepter, item: 'scepter', x: -9, z: 135, taken: false, bonus: true, label: 'Royal Scepter' });

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

    // Crown Vault pillars (architectural grandeur)
    [-12, 12].forEach(px => {
      pillar(scene, px, 127);
      pillar(scene, px, 152);
    });

    // Crown Vault ceiling lamps above point lights
    [[-10, 125], [10, 125], [0, 140], [-10, 155], [10, 155]].forEach(([lx, lz]) => ceilingLamp(scene, lx, lz));

    // Vault corner plants (smaller scale)
    [[-22, 118], [22, 118], [-22, 158], [22, 158]].forEach(([px, pz]) => plantPot(scene, px, pz, 0.9));

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
      coinPickups,
      terminals,
      laserData,
      cameraData,
      guardData,
    };
  }

  return { init };

}());
