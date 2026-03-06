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

  // ── Load real painting texture from URL (public domain, Wikimedia Commons) ──
  const _loader = new THREE.TextureLoader();
  function loadPaintingTex(url) {
    const tex = _loader.load(url);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ── Painting placard (canvas-texture label beneath a painting) ──
  function placard(scene, x, y, z, title, artist, isWestWall) {
    const W = 256, H = 72;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1e1206';
    ctx.fillRect(0, 0, W, H);
    // Gold border
    ctx.strokeStyle = '#c8a040';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W-8, H-8);
    ctx.fillStyle = '#e8c870';
    ctx.font = 'bold italic 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, W/2, 28);
    ctx.fillStyle = '#c8a858';
    ctx.font = '14px serif';
    ctx.fillText(artist, W/2, 50);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) });
    const offset = isWestWall ? 0.12 : -0.12;
    const pw = 1.4, ph = 0.4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(offset)*2, ph, pw), mat);
    mesh.position.set(x + offset, y, z);
    scene.add(mesh);
  }

  const _tileTex    = makeMarbleTex();
  const _ceilTex    = makeTileTex('#d8c07a', '#b8942e', 3);   // aged parchment plaster
  const _baseMat    = new THREE.MeshStandardMaterial({ color: 0x9a6828, roughness: 0.72, metalness: 0.0 });   // mahogany baseboard
  const _wainMat    = new THREE.MeshStandardMaterial({ color: 0x5c3010, roughness: 0.62, metalness: 0.0 });   // dark walnut wainscoting
  const _moldMat    = new THREE.MeshStandardMaterial({ color: 0xc8982a, roughness: 0.72, metalness: 0.08 });  // warm gold crown molding
  const _frameMat   = new THREE.MeshStandardMaterial({ color: 0x1e0e04, roughness: 0.65, metalness: 0.06 });  // ebony door frame
  const _handleMat  = new THREE.MeshStandardMaterial({ color: 0xb08020, roughness: 0.2,  metalness: 0.9  });
  const _stripeMat  = new THREE.MeshStandardMaterial({ color: 0x1a0800, roughness: 0.95, metalness: 0.05 });
  const _chipMat    = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.25, metalness: 0.85 });

  // ── Materials ──────────────────────────────────────────
  const M = {
    floor:    new THREE.MeshStandardMaterial({ map: _tileTex, roughness: 0.14, metalness: 0.06 }),
    wall:     new THREE.MeshStandardMaterial({ color: 0xd8c090, roughness: 0.88, metalness: 0.0  }),  // warm honey plaster
    ceiling:  new THREE.MeshStandardMaterial({ map: _ceilTex, roughness: 0.92, metalness: 0.0  }),
    desk:     new THREE.MeshStandardMaterial({ color: 0x4a2808, roughness: 0.72, metalness: 0.0  }),  // deep mahogany
    glass:    new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 }),
    frame:    new THREE.MeshStandardMaterial({ color: 0x2a1606, roughness: 0.65, metalness: 0.08 }),  // dark ebony frame
    door:     new THREE.MeshStandardMaterial({ color: 0x3c2008, roughness: 0.68, metalness: 0.04 }),  // old oak door
    pillar:   new THREE.MeshStandardMaterial({ color: 0xc8a86a, roughness: 0.72, metalness: 0.0  }),  // warm travertine stone
    pedestal: new THREE.MeshStandardMaterial({ color: 0xc0a070, roughness: 0.45, metalness: 0.15 }),  // warm cream marble
    crown:    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2,  metalness: 0.9  }),
    terminal: new THREE.MeshStandardMaterial({ color: 0x2c1606, roughness: 0.78, metalness: 0.08 }),  // dark walnut cabinet
    exit:     new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.3,  metalness: 0.0, transparent: true, opacity: 0.7 }),
    keycards: {
      yellow: new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.3, metalness: 0.6 }),
      blue:   new THREE.MeshStandardMaterial({ color: 0x4a9eff, roughness: 0.3, metalness: 0.6 }),
      red:    new THREE.MeshStandardMaterial({ color: 0xe05050, roughness: 0.3, metalness: 0.6 }),
    },
    paintings: [
      // 0: The Starry Night — Van Gogh, 1889
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/300px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
      // 1: The Great Wave off Kanagawa — Hokusai, 1831
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/300px-Tsunami_by_hokusai_19th_century.jpg',
      // 2: The Birth of Venus — Botticelli, 1485
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg/300px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg',
      // 3: Girl with a Pearl Earring — Vermeer, 1665
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/1665_Girl_with_a_Pearl_Earring.jpg/240px-1665_Girl_with_a_Pearl_Earring.jpg',
      // 4: The Night Watch — Rembrandt, 1642
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/The_Night_Watch_-_HD.jpg/300px-The_Night_Watch_-_HD.jpg',
    ].map(url => new THREE.MeshStandardMaterial({ map: loadPaintingTex(url), roughness: 0.88, metalness: 0.0 })),
    // La Joconde — Leonardo da Vinci, c. 1503
    monaLisa: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/240px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg'),
      roughness: 0.88, metalness: 0.0,
    }),
    // Les Nymphéas — Claude Monet, c. 1906
    monet: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Claude_Monet_-_Water_Lilies_-_1906%2C_Ryerson.jpg/300px-Claude_Monet_-_Water_Lilies_-_1906%2C_Ryerson.jpg'),
      roughness: 0.88, metalness: 0.0,
    }),
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
    // Baseboard trim — protrude slightly past the wall face to avoid z-fighting
    const bw = w > d ? w + 0.04 : 0.08;
    const bd = w > d ? 0.08 : d + 0.04;
    box(scene, bw, 0.22, bd, cx, 0.11, cz, _baseMat);
    // Wainscoting panel — protrude slightly so it doesn't clip into the wall surface
    box(scene, w + 0.04, 1.15, d + 0.04, cx, 0.575, cz, _wainMat);
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

  // ── Flat rug on the floor ──────────────────────────────
  function rug(scene, cx, cz, w, d, mainColor, accentColor) {
    const mainMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.96, metalness: 0.0 });
    box(scene, w, 0.022, d, cx, 0.012, cz, mainMat);
    if (accentColor !== undefined) {
      const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.96, metalness: 0.0 });
      const BW = 0.18;
      box(scene, w, 0.024, BW, cx, 0.013, cz - d / 2 + BW / 2, accentMat);
      box(scene, w, 0.024, BW, cx, 0.013, cz + d / 2 - BW / 2, accentMat);
      box(scene, BW, 0.024, d - BW * 2, cx - w / 2 + BW / 2, 0.013, cz, accentMat);
      box(scene, BW, 0.024, d - BW * 2, cx + w / 2 - BW / 2, 0.013, cz, accentMat);
    }
  }

  // Glowing archway strips around a door (Z-axis door — north/south wall)
  function doorGlow(scene, cx, cz, color) {
    const glowMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.3,
      roughness: 0.2, transparent: true, opacity: 0.92,
    });
    box(scene, 3.8, 0.14, 0.14, cx, WALL_H + 0.16, cz, glowMat);
    box(scene, 0.14, WALL_H + 0.32, 0.14, cx - 1.9, WALL_H / 2, cz, glowMat);
    box(scene, 0.14, WALL_H + 0.32, 0.14, cx + 1.9, WALL_H / 2, cz, glowMat);
  }

  // Painting on a north/south wall (frame + canvas oriented along X)
  function wallPaintingNS(scene, x, y, z, mat, isSouthWall) {
    const offset = isSouthWall ? 0.15 : -0.15;
    box(scene, 2.4, 1.6, Math.abs(offset) + 0.02, x, y, z, M.frame);
    box(scene, 2.1, 1.4, 0.08, x, y, z + offset, mat);
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

  function door(scene, cx, cz, keyRequired, rotY) {
    const doorColor = keyRequired === 'yellow' ? 0x6a4a08
                    : keyRequired === 'blue'   ? 0x182840
                    : 0x3c2408;
    const doorMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.62, metalness: 0.08 });
    const panelMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.5, metalness: 0.06 });

    // ── Animated door group (tickDoors animates scale.y + position.y on this) ──
    const doorGroup = new THREE.Group();
    doorGroup.position.set(cx, WALL_H / 2, cz);
    if (rotY) doorGroup.rotation.y = rotY;
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
    if (!rotY) {
      // North/south wall door — gap runs in X
      box(scene, FT, WALL_H + 0.12, FD, cx - 1.61, WALL_H / 2, cz, _frameMat);
      box(scene, FT, WALL_H + 0.12, FD, cx + 1.61, WALL_H / 2, cz, _frameMat);
      box(scene, 3 + FT * 2, 0.22, FD, cx, WALL_H + 0.11, cz, _frameMat);
    } else {
      // East/west wall door — gap runs in Z
      box(scene, FD, WALL_H + 0.12, FT, cx, WALL_H / 2, cz - 1.61, _frameMat);
      box(scene, FD, WALL_H + 0.12, FT, cx, WALL_H / 2, cz + 1.61, _frameMat);
      box(scene, FD, 0.22, 3 + FT * 2, cx, WALL_H + 0.11, cz, _frameMat);
    }

    // Key-type indicator LED panel on left jamb face (glowing dot)
    const indColor = keyRequired === 'yellow' ? 0xf0c040 : 0x4a9eff;
    if (keyRequired) {
      const indMat = new THREE.MeshStandardMaterial({
        color: indColor, emissive: indColor, emissiveIntensity: 1.2, roughness: 0.3,
      });
      if (!rotY) {
        box(scene, 0.07, 0.28, 0.07, cx - 1.61, 1.35, cz - FD / 2 + 0.04, indMat);
      } else {
        box(scene, 0.07, 0.28, 0.07, cx - FD / 2 + 0.04, 1.35, cz - 1.61, indMat);
      }
    }

    const aabbW = rotY ? WALL_T + 0.1 : 3;
    const aabbD = rotY ? 3 : WALL_T + 0.1;
    addWallAABB(cx, cz, aabbW, aabbD);
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

    // Corner accent pillars at actual lobby corners
    pillar(scene, -18,  3);
    pillar(scene,  18,  3);
    pillar(scene, -18, 37);
    pillar(scene,  18, 37);

    // Lobby central rug (burgundy with gold border)
    rug(scene, 0, 20, 18, 14, 0x6b1a1a, 0xc8a040);

    // Additional paintings — south wall and east wall
    wallPaintingNS(scene, -10, 3.5, 0.10, M.paintings[3], true);
    wallPaintingNS(scene,  10, 3.5, 0.10, M.paintings[4], true);
    wallPainting(scene, 19.9, 3.5,  4, M.paintings[3], false);
    wallPainting(scene, 19.9, 3.5, 28, M.paintings[4], false);
    wallSconce(scene,  19.75, 2.9,  4, -1);
    wallSconce(scene,  19.75, 2.9, 28, -1);

    // Glowing archway at yellow keycard door so the exit is obvious
    doorGlow(scene, 0, 39.75, 0xf0c040);

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
    // Skip south/east/west walls — replace with stubs so corridor + side room openings work
    roomWalls(scene, 0, 77.5, 50, 45, { south: true, north: true, east: true, west: true });

    // Gallery south wall stubs — 10-unit gap at X=0 matching corridor width (Z=55)
    wall(scene, -15, 55, 20, WALL_T);  // west stub: X -25→-5
    wall(scene,  15, 55, 20, WALL_T);  // east stub: X +5→+25

    // Gallery east wall stubs — 3-unit gap at Z=77 leading to the Salon des Antiquités
    // South stub: Z 55→75.5  (length 20.5, centre 65.25)
    wall(scene, 25, 65.25, WALL_T, 20.5);
    // North stub: Z 78.5→100  (length 21.5, centre 89.25)
    wall(scene, 25, 89.25, WALL_T, 21.5);

    // Gallery west wall stubs — 3-unit gap at Z=77 leading to the Galerie des Sculptures
    // South stub: Z 55→75.5  (length 20.5, centre 65.25)
    wall(scene, -25, 65.25, WALL_T, 20.5);
    // North stub: Z 78.5→100  (length 21.5, centre 89.25)
    wall(scene, -25, 89.25, WALL_T, 21.5);

    // Glowing archway at side-room entrance (opening in X-wall, strips run along Z)
    const sideGlowMat = new THREE.MeshStandardMaterial({
      color: 0xe8d060, emissive: 0xe8d060, emissiveIntensity: 1.1,
      roughness: 0.2, transparent: true, opacity: 0.88,
    });
    box(scene, 0.14, 0.14, 3.8, 25, WALL_H + 0.16, 77, sideGlowMat);  // top bar
    box(scene, 0.14, WALL_H + 0.32, 0.14, 25, WALL_H / 2, 75.1, sideGlowMat);  // south strip
    box(scene, 0.14, WALL_H + 0.32, 0.14, 25, WALL_H / 2, 78.9, sideGlowMat);  // north strip

    // Gallery pillars
    [-12, 0, 12].forEach(x => {
      pillar(scene, x, 62);
      pillar(scene, x, 92);
    });

    // Laser data: two low lasers in gallery entrance area
    laserData.push({ type: 'low', x1: -20, x2: -14, y: 0.5, z: 67 });
    laserData.push({ type: 'low', x1:   8, x2:  20, y: 0.5, z: 67 });
    laserData.push({ type: 'low', x1: -20, x2:  20, y: 0.5, z: 74 });

    // La Joconde (Mona Lisa) — main stealable painting on west wall of gallery
    wallPainting(scene, -24.9, 3.8, 92, M.monaLisa, true);
    const paintMesh = box(scene, 0.05, 2.0, 2.8, -24.9, 3.8, 92, M.monaLisa);
    stealables.push({ mesh: paintMesh, item: 'painting', x: -24.9, z: 92, taken: false });
    placard(scene, -24.9, 2.6, 92, 'La Joconde', 'Léonard de Vinci, c. 1503', true);
    // Glowing floor ring — guides player to the stealable painting
    const paintRingMat = new THREE.MeshBasicMaterial({
      color: 0xffe066, emissive: 0xffe066, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const paintRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 32), paintRingMat);
    paintRing.rotation.x = -Math.PI / 2;
    paintRing.position.set(-24.5, 0.02, 92);
    scene.add(paintRing);
    paintMesh.userData.floorRing = paintRing;  // hidden when painting is taken

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
    placard(scene, -24.9, 2.6, 70, 'The Starry Night', 'Vincent van Gogh, 1889', true);
    wallPainting(scene,  24.9, 3.5, 80, M.paintings[1], false);
    placard(scene,  24.9, 2.6, 80, 'The Great Wave', 'Katsushika Hokusai, 1831', false);
    wallPainting(scene,  24.9, 3.5, 60, M.paintings[2], false);
    placard(scene,  24.9, 2.6, 60, 'The Birth of Venus', 'Sandro Botticelli, 1485', false);

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

    // Gallery central rug (deep blue with gold border)
    rug(scene, 0, 77, 22, 28, 0x0a1a4a, 0xc8a040);

    // Gallery south wall paintings (Z≈55)
    wallPaintingNS(scene, -14, 3.5, 55.10, M.paintings[3], true);
    wallPaintingNS(scene,  14, 3.5, 55.10, M.paintings[4], true);
    wallSconce(scene, -14, 2.9, 55.5, 0);
    wallSconce(scene,  14, 2.9, 55.5, 0);

    // Gallery corner accent pillars
    pillar(scene, -22, 58);
    pillar(scene,  22, 58);
    pillar(scene, -22, 98);

    // Glowing archway at blue keycard door
    doorGlow(scene, 0, 99.75, 0x4a9eff);

    // ════════════════════════════════
    //  SALON DES ANTIQUITÉS  (side room off Gallery east wall)
    //  X 25→50  Z 67→87  (centre 37.5, 77)
    // ════════════════════════════════
    const SAX = 37.5, SAZ = 77, SAW = 25, SAD = 20;
    floor(scene,   SAX, SAZ, SAW, SAD);
    ceiling(scene, SAX, SAZ, SAW, SAD);
    // South wall (Z=67) and north wall (Z=87)
    wall(scene, SAX, SAZ - SAD / 2, SAW, WALL_T);
    wall(scene, SAX, SAZ + SAD / 2, SAW, WALL_T);
    // East wall (X=50)
    wall(scene, SAX + SAW / 2, SAZ, WALL_T, SAD);
    // West wall shared with gallery east-wall stubs — no extra wall needed

    // Pillars flanking the entrance (just inside the room)
    pillar(scene, 28.5, 70);
    pillar(scene, 28.5, 84);

    // Paintings on east wall of side room
    wallPainting(scene, 49.9, 3.5, 71, M.paintings[0], false);
    wallPainting(scene, 49.9, 3.5, 83, M.paintings[1], false);
    // Painting on south wall
    wallPaintingNS(scene, 38, 3.5, 67.10, M.paintings[2], true);
    // Painting on north wall
    wallPaintingNS(scene, 38, 3.5, 86.90, M.paintings[3], false);

    // Side-room rug (dark forest green with gold border)
    rug(scene, SAX, SAZ, 18, 14, 0x1a3a1a, 0xc8a040);

    // Display case with coin cache
    displayCase(scene, 42, 77);
    coinCache(scene, 42, 77, 4, 1.55);

    // Ceiling lamps
    ceilingLamp(scene, 32, 72);
    ceilingLamp(scene, 43, 72);
    ceilingLamp(scene, 32, 82);
    ceilingLamp(scene, 43, 82);

    // Wall sconces
    wallSconce(scene, 49.75, 2.9, 72, -1);
    wallSconce(scene, 49.75, 2.9, 82, -1);

    // Guard patrol inside the Salon
    guardData.push({
      spawnX: 40, spawnZ: 72,
      waypoints: [
        new THREE.Vector3(40, 0, 72),
        new THREE.Vector3(40, 0, 83),
        new THREE.Vector3(30, 0, 83),
        new THREE.Vector3(30, 0, 72),
      ],
    });

    // Security camera watching the entrance
    cameraData.push({ x: 43, y: WALL_H - 0.3, z: 80, sweepAngle: Math.PI / 2.2, facingZ: -1 });

    // ════════════════════════════════
    //  GALERIE DES SCULPTURES  (side room off Gallery west wall)
    //  X -50→-25  Z 67→87  (centre -37.5, 77)
    // ════════════════════════════════
    const GWX = -37.5, GWZ = 77, GWW = 25, GWD = 20;
    floor(scene,   GWX, GWZ, GWW, GWD);
    ceiling(scene, GWX, GWZ, GWW, GWD);
    // South wall (Z=67) and north wall (Z=87)
    wall(scene, GWX, GWZ - GWD / 2, GWW, WALL_T);
    wall(scene, GWX, GWZ + GWD / 2, GWW, WALL_T);
    // West wall (X=-50)
    wall(scene, GWX - GWW / 2, GWZ, WALL_T, GWD);
    // East wall shared with gallery west-wall stubs — no extra wall needed

    // Door in the opening connecting Gallery to Galerie des Sculptures
    door(scene, -25, 77, null, Math.PI / 2);

    // Glowing archway at west side-room entrance
    const westGlowMat = new THREE.MeshStandardMaterial({
      color: 0xe8d060, emissive: 0xe8d060, emissiveIntensity: 1.1,
      roughness: 0.2, transparent: true, opacity: 0.88,
    });
    box(scene, 0.14, 0.14, 3.8, -25, WALL_H + 0.16, 77, westGlowMat);   // top bar
    box(scene, 0.14, WALL_H + 0.32, 0.14, -25, WALL_H / 2, 75.1, westGlowMat);  // south strip
    box(scene, 0.14, WALL_H + 0.32, 0.14, -25, WALL_H / 2, 78.9, westGlowMat);  // north strip

    // Pillars flanking the entrance
    pillar(scene, -28.5, 70);
    pillar(scene, -28.5, 84);

    // Sculptures (pedestals with abstract shapes)
    box(scene, 1.0, 1.0, 1.0, -34, 0.5, 72, M.pedestal);
    const sculpt1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4c8b0, roughness: 0.5, metalness: 0.1 }));
    sculpt1.position.set(-34, 1.55, 72); sculpt1.castShadow = true; scene.add(sculpt1);

    box(scene, 1.0, 1.2, 1.0, -42, 0.6, 72, M.pedestal);
    const sculpt2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.45, metalness: 0.15 }));
    sculpt2.position.set(-42, 1.75, 72); sculpt2.castShadow = true; scene.add(sculpt2);

    box(scene, 1.0, 1.0, 1.0, -34, 0.5, 82, M.pedestal);
    const sculpt3 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xb8c8c0, roughness: 0.4, metalness: 0.2 }));
    sculpt3.position.set(-34, 1.55, 82); sculpt3.rotation.x = Math.PI / 4;
    sculpt3.castShadow = true; scene.add(sculpt3);

    box(scene, 1.0, 1.1, 1.0, -42, 0.55, 82, M.pedestal);
    const sculpt4 = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: 0xd0c0a0, roughness: 0.5, metalness: 0.1 }));
    sculpt4.position.set(-42, 1.7, 82); sculpt4.castShadow = true; scene.add(sculpt4);

    // Coin cache on a small table
    box(scene, 1.4, 0.7, 0.9, -46, 0.35, 77, M.desk);
    coinCache(scene, -46, 77, 3, 1.05);

    // Paintings on west wall — Monet as bonus stealable at z=77 (landscape, wider canvas)
    wallPainting(scene, -49.9, 3.5, 72, M.paintings[2], true);
    wallPainting(scene, -49.9, 3.5, 82, M.paintings[3], true);
    // Les Nymphéas — Monet bonus stealable, centred between the two decorative paintings
    wallPainting(scene, -49.9, 3.5, 77, M.monet, true);
    const monetMesh = box(scene, 0.05, 1.4, 2.1, -49.75, 3.5, 77, M.monet);
    stealables.push({ mesh: monetMesh, item: 'monet', x: -49.9, z: 77, taken: false, bonus: true, label: 'Les Nymphéas' });
    placard(scene, -49.9, 2.6, 77, 'Les Nymphéas', 'Claude Monet, c. 1906', true);

    // Rug
    rug(scene, GWX, GWZ, 18, 14, 0x2a1a3a, 0xc8a040);

    // Ceiling lamps
    ceilingLamp(scene, -32, 72);
    ceilingLamp(scene, -43, 72);
    ceilingLamp(scene, -32, 82);
    ceilingLamp(scene, -43, 82);

    // Wall sconces
    wallSconce(scene, -49.75, 2.9, 72, 1);
    wallSconce(scene, -49.75, 2.9, 82, 1);

    // Guard patrol inside the Galerie
    guardData.push({
      spawnX: -40, spawnZ: 72,
      waypoints: [
        new THREE.Vector3(-40, 0, 72),
        new THREE.Vector3(-40, 0, 83),
        new THREE.Vector3(-30, 0, 83),
        new THREE.Vector3(-30, 0, 72),
      ],
    });

    // Security camera watching the entrance
    cameraData.push({ x: -43, y: WALL_H - 0.3, z: 80, sweepAngle: Math.PI / 2.2, facingZ: 1 });

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
    // Skip south and north walls — add stubs manually so corridor/exit connect properly
    roomWalls(scene, 0, 137.5, 50, 45, { south: true, north: true });

    // Vault south wall stubs — 10-unit gap (matches corridor width) at x=0
    const VS = (50 - 10) / 2;  // stub width = 20
    wall(scene, -(25 - VS / 2), 115, VS, WALL_T);   // west stub centred at (-15, 115)
    wall(scene,  (25 - VS / 2), 115, VS, WALL_T);   // east stub centred at ( 15, 115)

    // Vault north wall stubs — 10-unit gap for exit passage
    wall(scene, -(25 - VS / 2), 160, VS, WALL_T);   // west stub
    wall(scene,  (25 - VS / 2), 160, VS, WALL_T);   // east stub

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

    // Crown Vault rug near crown pedestal (royal purple with gold border)
    rug(scene, 0, 140, 14, 10, 0x2a0a4a, 0xc8a040);

    // Vault wall paintings
    wallPainting(scene, -24.9, 3.5, 125, M.paintings[0], true);
    placard(scene, -24.9, 2.6, 125, 'The Starry Night', 'Vincent van Gogh, 1889', true);
    wallPainting(scene, -24.9, 3.5, 150, M.paintings[1], true);
    placard(scene, -24.9, 2.6, 150, 'The Great Wave', 'Katsushika Hokusai, 1831', true);
    wallPainting(scene,  24.9, 3.5, 130, M.paintings[2], false);
    placard(scene,  24.9, 2.6, 130, 'The Birth of Venus', 'Sandro Botticelli, 1485', false);
    wallPainting(scene,  24.9, 3.5, 155, M.paintings[3], false);
    placard(scene,  24.9, 2.6, 155, 'Girl with a Pearl Earring', 'Johannes Vermeer, 1665', false);
    wallSconce(scene, -24.75, 2.9, 125,  1);
    wallSconce(scene, -24.75, 2.9, 150,  1);
    wallSconce(scene,  24.75, 2.9, 130, -1);
    wallSconce(scene,  24.75, 2.9, 155, -1);

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

    // ════════════════════════════════════════════════════════
    //  LOUVRE EXTERIOR — Cour Napoléon  Z 165 → 248
    // ════════════════════════════════════════════════════════
    {
      const PX = 0, PZ = 205;          // pyramid centre
      const PH = 20, PB = 11;          // pyramid height, half-base
      const WING_H  = 18;              // facade wall height (3 floors)
      const MANS_H  = 5;               // mansard roof height
      const WING_T  = 6;               // facade wall thickness
      const COURT_W = 42;              // half-width of courtyard (+/-X)

      // ── Materials ──────────────────────────────────────
      const mLimestone = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.84, metalness: 0.0 });
      const mBase      = new THREE.MeshStandardMaterial({ color: 0xbfae8a, roughness: 0.88, metalness: 0.0 });
      const mSlate     = new THREE.MeshStandardMaterial({ color: 0x3c3830, roughness: 0.92, metalness: 0.0 });
      const mCornice   = new THREE.MeshStandardMaterial({ color: 0xcab060, roughness: 0.55, metalness: 0.12 });
      const mGlass = new THREE.MeshBasicMaterial({
        color: 0x88ccee, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      });
      const mFrame = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.35, metalness: 0.7 });
      const mWin   = new THREE.MeshBasicMaterial({ color: 0x2a3a50 });
      const mCobble = new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.95, metalness: 0.0 });
      const mWater  = new THREE.MeshStandardMaterial({ color: 0x1e4a68, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.75 });
      const mPool   = new THREE.MeshStandardMaterial({ color: 0x8a9090, roughness: 0.8, metalness: 0.05 });

      // ── Courtyard floor ────────────────────────────────
      // Main paving
      box(scene, COURT_W*2, 0.28, 84, 0, -0.14, 206, mCobble);
      // Circular stone ring around pyramid (darker band)
      const ringFloor = new THREE.Mesh(
        new THREE.RingGeometry(13.5, 20, 48),
        new THREE.MeshStandardMaterial({ color: 0xa8a098, roughness: 0.9, metalness: 0.0 })
      );
      ringFloor.rotation.x = -Math.PI / 2; ringFloor.position.set(PX, 0.01, PZ);
      scene.add(ringFloor);

      // ── Wing helper ────────────────────────────────────
      // Builds a full Louvre wing facade with windows, cornices, mansard
      function louvreWing(cx, cz, len, axis) {
        const w = axis === 'Z' ? WING_T : len;
        const d = axis === 'Z' ? len    : WING_T;

        // Main wall body
        box(scene, w, WING_H, d, cx, WING_H/2, cz, mLimestone);
        // Rusticated base band (0→2.5)
        box(scene, w+0.1, 2.5, d+0.1, cx, 1.25, cz, mBase);
        // Floor cornice bands at 6, 11.5, WING_H
        [6, 11.5, WING_H].forEach(h => {
          const cm = h === WING_H ? mCornice : mBase;
          box(scene, w+0.25, 0.35, d+0.25, cx, h+0.175, cz, cm);
        });
        // Mansard roof
        box(scene, w, MANS_H, d, cx, WING_H+MANS_H/2, cz, mSlate);
        // Mansard base band (gold lip at bottom of mansard)
        box(scene, w+0.15, 0.3, d+0.15, cx, WING_H+0.15, cz, mCornice);

        // Windows — every 8 units along the wing (reduced bay count for performance)
        const wStart = axis === 'Z' ? cz - len/2 + 5 : cx - len/2 + 5;
        const wEnd   = axis === 'Z' ? cz + len/2 - 5 : cx + len/2 - 5;
        for (let wp = wStart; wp <= wEnd; wp += 8) {
          // Three floors of windows (window + arch in one pass)
          [[3.0, 2.8], [8.3, 2.8], [13.6, 2.8]].forEach(([wh, wsize]) => {
            const wx = axis === 'Z' ? (cx > 0 ? cx - WING_T*0.5 + 0.22 : cx + WING_T*0.5 - 0.22) : wp;
            const wz = axis === 'Z' ? wp : (cz > 200 ? cz - WING_T*0.5 + 0.22 : cz + WING_T*0.5 - 0.22);
            const wd = axis === 'Z' ? 0.25 : 1.8;
            const wl = axis === 'Z' ? 1.8  : 0.25;
            box(scene, wd, wsize, wl, wx, wh, wz, mWin);
          });
        }

        // Corner pavilion caps (slightly wider/taller at each end)
        [wStart-2, wEnd+2].forEach(ep => {
          const epx = axis === 'Z' ? cx : ep;
          const epz = axis === 'Z' ? ep : cz;
          box(scene, axis === 'Z' ? w+0.6 : 5, WING_H+1, axis === 'Z' ? 5 : d+0.6, epx, (WING_H+1)/2, epz, mLimestone);
          box(scene, axis === 'Z' ? w+0.6 : 5, 0.4, axis === 'Z' ? 5 : d+0.6, epx, WING_H+1.2, epz, mCornice);
          box(scene, axis === 'Z' ? w+0.6 : 5, MANS_H+1, axis === 'Z' ? 5 : d+0.6, epx, WING_H+1+(MANS_H+1)/2, epz, mSlate);
        });
      }

      // ── Build three wings of the U ─────────────────────
      louvreWing(-COURT_W-WING_T/2, 206, 84, 'Z');   // west wing
      louvreWing( COURT_W+WING_T/2, 206, 84, 'Z');   // east wing
      louvreWing(0, 248+WING_T/2, COURT_W*2+WING_T*2, 'X');  // north (rear) wing

      // Ground step / entrance plinth at exit door (south edge)
      box(scene, 12, 0.6, 1.5, 0, 0.3, 166.5, mBase);

      // ── Glass Pyramid (I.M. Pei) ───────────────────────
      // 4 custom triangular glass faces
      const pyrApex = [PX, PH, PZ];
      const pyrBase = [
        [PX-PB, 0, PZ-PB], [PX+PB, 0, PZ-PB],  // south edge corners
        [PX+PB, 0, PZ+PB], [PX-PB, 0, PZ+PB],  // north edge corners
      ];
      // Each face: two adjacent base corners → apex
      [
        [0, 1],  // south face
        [1, 2],  // east face
        [2, 3],  // north face
        [3, 0],  // west face
      ].forEach(([i, j]) => {
        const geo = new THREE.BufferGeometry();
        const b1 = pyrBase[i], b2 = pyrBase[j], ap = pyrApex;
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
          b1[0],b1[1],b1[2], b2[0],b2[1],b2[2], ap[0],ap[1],ap[2],
          b2[0],b2[1],b2[2], b1[0],b1[1],b1[2], ap[0],ap[1],ap[2],  // back face
        ]), 3));
        geo.computeVertexNormals();
        scene.add(new THREE.Mesh(geo, mGlass));
      });

      // Pyramid metal edge beams (4 vertical from base corners to apex)
      pyrBase.forEach(b => {
        const dx = pyrApex[0]-b[0], dy = pyrApex[1]-b[1], dz = pyrApex[2]-b[2];
        const len2 = Math.sqrt(dx*dx+dy*dy+dz*dz);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len2, 5), mFrame);
        beam.position.set((b[0]+pyrApex[0])/2, (b[1]+pyrApex[1])/2, (b[2]+pyrApex[2])/2);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(dx/len2, dy/len2, dz/len2));
        scene.add(beam);
      });
      // Base frame (4 edges of the square base)
      [[0,1],[1,2],[2,3],[3,0]].forEach(([i,j]) => {
        const b1 = pyrBase[i], b2 = pyrBase[j];
        const dx=b2[0]-b1[0], dy=b2[1]-b1[1], dz=b2[2]-b1[2];
        const l2 = Math.sqrt(dx*dx+dz*dz);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, l2, 5), mFrame);
        beam.position.set((b1[0]+b2[0])/2, 0.07, (b1[2]+b2[2])/2);
        beam.rotation.z = Math.PI/2;
        beam.rotation.y = Math.atan2(dz, dx);
        scene.add(beam);
      });
      // Horizontal ring struts at 1/4, 1/2, 3/4 height
      [0.25, 0.5, 0.75].forEach(t => {
        const y = PH * t, s = 1 - t;
        const hb = PB * s;
        [[hb,0],[0,hb],[-hb,0],[0,-hb],[hb,0]].reduce((prev, cur) => {
          if (!prev) return cur;
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, Math.sqrt((cur[0]-prev[0])**2+(cur[1]-prev[1])**2)*1.42, 4), mFrame);
          beam.position.set(PX+(prev[0]+cur[0])/2, y, PZ+(prev[1]+cur[1])/2);
          beam.rotation.z = Math.PI/2;
          beam.rotation.y = Math.atan2(cur[1]-prev[1], cur[0]-prev[0]);
          scene.add(beam);
          return cur;
        }, null);
      });

      // ── Pyramid base / reflecting pools ───────────────
      // Stepped stone base ring
      box(scene, PB*2+5, 0.6, PB*2+5, PX, 0.3, PZ, mPool);
      box(scene, PB*2+3, 0.35, PB*2+3, PX, 0.65, PZ, mPool);
      // Water moat (just inside the outer ring)
      [[0, PB+3.5], [0, -(PB+3.5)], [PB+3.5, 0], [-(PB+3.5), 0]].forEach(([ox, oz]) => {
        const w2 = Math.abs(oz) > 0.1 ? PB*2+7 : 4;
        const d2 = Math.abs(ox) > 0.1 ? PB*2+7 : 4;
        box(scene, w2, 0.15, d2, PX+ox, 0.42, PZ+oz, mWater);
      });

      // ── Lampposts along courtyard (emissive only — no PointLights) ───
      {
        const poleM = new THREE.MeshStandardMaterial({ color: 0x1a1810, roughness: 0.5, metalness: 0.6 });
        const glowM = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffe880, emissiveIntensity: 2.0, roughness: 0.2 });
        function lamppost2(lx, lz) {
          box(scene, 0.15, 6, 0.15, lx, 3, lz, poleM);
          const globe = new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 5), glowM);
          globe.position.set(lx, 6.4, lz); scene.add(globe);
        }
        for (let lz = 170; lz <= 244; lz += 14) {
          lamppost2(-COURT_W+2, lz);
          lamppost2( COURT_W-2, lz);
        }
        [[PX-18,PZ-18],[PX+18,PZ-18],[PX+18,PZ+18],[PX-18,PZ+18]].forEach(([lx,lz]) => lamppost2(lx,lz));
      }

      // ── Night sky ──────────────────────────────────────
      const skyGeo = new THREE.SphereGeometry(500, 12, 8);
      const skyMat = new THREE.MeshBasicMaterial({ color: 0x04060c, side: THREE.BackSide });
      scene.add(new THREE.Mesh(skyGeo, skyMat));
      // Moon
      const moonMat = new THREE.MeshStandardMaterial({ color: 0xeeeedd, emissive: 0xc8c8b0, emissiveIntensity: 0.6, roughness: 0.9 });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8), moonMat);
      moon.position.set(80, 180, 220); scene.add(moon);
      // Stars
      const starGeo = new THREE.BufferGeometry();
      const starPos = [];
      for (let i = 0; i < 800; i++) {
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        starPos.push(Math.sin(phi)*Math.cos(theta)*480, Math.abs(Math.cos(phi))*480+20, Math.sin(phi)*Math.sin(theta)*480);
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: true })));

      // ── Exterior lighting — one DirectionalLight only ──
      // Moonlight (single cheap directional, no shadows)
      const moonLight = new THREE.DirectionalLight(0xc8d8f0, 0.9);
      moonLight.position.set(60, 120, -40);
      moonLight.castShadow = false;
      scene.add(moonLight);
      // Warm ambient fill so facade/pyramid aren't too dark
      const extAmbient = new THREE.AmbientLight(0x3a3020, 0.8);
      scene.add(extAmbient);
    }

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
