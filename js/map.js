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

  // ── Stone floor texture (cool gray limestone slabs) ──────
  function makeMarbleTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0.0, '#8a9098');
    grad.addColorStop(0.5, '#828890');
    grad.addColorStop(1.0, '#8c929a');
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
        const dark = vein * vein * 28;
        const i = (y * S + x) * 4;
        d[i]   = Math.max(0, d[i]   - dark * 0.55);
        d[i+1] = Math.max(0, d[i+1] - dark * 0.50);
        d[i+2] = Math.max(0, d[i+2] - dark * 0.42);
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(60,70,90,0.35)';
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

  // ── Crown Vault floor — dark obsidian with gold veining ─────────────────────
  function makeVaultFloorTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0e0c0a';
    ctx.fillRect(0, 0, S, S);
    // Gold vein streaks
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = 'rgba(190,148,32,' + (0.18 + Math.random() * 0.28) + ')';
      ctx.lineWidth = 0.8 + Math.random() * 1.2;
      ctx.beginPath();
      const sx = Math.random() * S, sy = Math.random() * S;
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(
        sx + (Math.random() - 0.5) * S * 0.5, sy + (Math.random() - 0.5) * S * 0.5,
        sx + (Math.random() - 0.5) * S * 0.5, sy + (Math.random() - 0.5) * S * 0.5,
        sx + (Math.random() - 0.5) * S * 0.9, sy + (Math.random() - 0.5) * S * 0.9
      );
      ctx.stroke();
    }
    // Gold tile grid
    ctx.strokeStyle = 'rgba(165,122,18,0.62)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= S; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    // Faint inner highlight lines
    ctx.strokeStyle = 'rgba(220,175,45,0.20)';
    ctx.lineWidth = 0.7;
    for (let i = 7; i < S; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ── Crown Vault ceiling mural — dark gold arabesque pattern ─────────────────
  function makeVaultMuralTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#090705';
    ctx.fillRect(0, 0, S, S);
    const gold = 'rgba(200,158,36,';
    // Outer border frame
    ctx.strokeStyle = gold + '0.72)'; ctx.lineWidth = 3.5;
    ctx.strokeRect(14, 14, S - 28, S - 28);
    ctx.strokeStyle = gold + '0.38)'; ctx.lineWidth = 1;
    ctx.strokeRect(22, 22, S - 44, S - 44);
    // Corner rosettes
    [[22, 22], [S-22, 22], [22, S-22], [S-22, S-22]].forEach(([cx, cy]) => {
      for (let r = 5; r <= 14; r += 5) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = gold + (r === 5 ? '0.70)' : '0.38)');
        ctx.lineWidth = r === 5 ? 2 : 1; ctx.stroke();
      }
    });
    // Central medallion rings
    [[80, '0.55)'], [60, '0.42)'], [36, '0.58)'], [18, '0.48)']].forEach(([r, a]) => {
      ctx.beginPath(); ctx.arc(S/2, S/2, r, 0, Math.PI * 2);
      ctx.strokeStyle = gold + a; ctx.lineWidth = r > 50 ? 2 : 1.5; ctx.stroke();
    });
    // 8-pointed star
    ctx.strokeStyle = gold + '0.48)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(S/2 + Math.cos(a)*18,               S/2 + Math.sin(a)*18);
      ctx.lineTo(S/2 + Math.cos(a+Math.PI/8)*60,     S/2 + Math.sin(a+Math.PI/8)*60);
      ctx.lineTo(S/2 + Math.cos(a+Math.PI/4)*18,     S/2 + Math.sin(a+Math.PI/4)*18);
      ctx.stroke();
    }
    // Radial spokes
    ctx.strokeStyle = gold + '0.22)'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      ctx.beginPath();
      ctx.moveTo(S/2 + Math.cos(a)*80, S/2 + Math.sin(a)*80);
      ctx.lineTo(S/2 + Math.cos(a)*S*0.68, S/2 + Math.sin(a)*S*0.68);
      ctx.stroke();
    }
    // Diamond grid
    ctx.strokeStyle = gold + '0.15)'; ctx.lineWidth = 0.5;
    for (let i = -S; i < S*2; i += 72) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i+S, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i-S, S); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
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
  const _ceilTex    = makeTileTex('#4a5260', '#35404e', 3);   // cool dark stone ceiling
  const _baseMat    = new THREE.MeshStandardMaterial({ color: 0x505868, roughness: 0.82, metalness: 0.0 });   // cool gray stone baseboard
  const _wainMat    = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.72, metalness: 0.0 });   // dark blue-gray stone wainscoting
  const _moldMat    = new THREE.MeshStandardMaterial({ color: 0x6a7888, roughness: 0.78, metalness: 0.05 });  // cool gray stone molding
  const _frameMat   = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.72, metalness: 0.06 });  // dark slate door frame
  const _handleMat  = new THREE.MeshStandardMaterial({ color: 0x7890a8, roughness: 0.3,  metalness: 0.8  });
  const _stripeMat  = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.95, metalness: 0.05 });
  const _chipMat    = new THREE.MeshStandardMaterial({ color: 0x8a9ab0, roughness: 0.35, metalness: 0.75 });

  // ── Materials ──────────────────────────────────────────
  const M = {
    floor:    new THREE.MeshStandardMaterial({ map: _tileTex, roughness: 0.22, metalness: 0.04 }),
    wall:     new THREE.MeshStandardMaterial({ color: 0x546070, roughness: 0.90, metalness: 0.0  }),  // cool blue-gray stone
    ceiling:  new THREE.MeshStandardMaterial({ map: _ceilTex, roughness: 0.94, metalness: 0.0  }),
    desk:     new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.75, metalness: 0.0  }),  // dark slate
    glass:    new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 }),
    frame:    new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.70, metalness: 0.08 }),  // dark slate frame
    door:     new THREE.MeshStandardMaterial({ color: 0x253040, roughness: 0.72, metalness: 0.06 }),  // dark gunmetal door
    pillar:   new THREE.MeshStandardMaterial({ color: 0x6a7888, roughness: 0.76, metalness: 0.0  }),  // cool gray stone pillar
    pedestal: new THREE.MeshStandardMaterial({ color: 0x7080a0, roughness: 0.50, metalness: 0.12 }),  // cool slate marble
    crown:    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2,  metalness: 0.9  }),
    terminal: new THREE.MeshStandardMaterial({ color: 0x1e2838, roughness: 0.80, metalness: 0.10 }),  // dark gunmetal cabinet
    exit:     new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.3,  metalness: 0.0, transparent: true, opacity: 0.7 }),
    keycards: {
      yellow: new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.3, metalness: 0.6 }),
      blue:   new THREE.MeshStandardMaterial({ color: 0x4a9eff, roughness: 0.3, metalness: 0.6 }),
      red:    new THREE.MeshStandardMaterial({ color: 0xe05050, roughness: 0.3, metalness: 0.6 }),
    },
    paintings: [
      // 0: Liberty Leading the People — Eugène Delacroix, 1830 (Louvre)
      'assets/paintings/liberty.jpg',
      // 1: The Raft of the Medusa — Théodore Géricault, 1818 (Louvre)
      'assets/paintings/medusa.jpg',
      // 2: The Coronation of Napoleon — Jacques-Louis David, 1807 (Louvre)
      'assets/paintings/napoleon.jpg',
      // 3: Oath of the Horatii — Jacques-Louis David, 1784 (Louvre)
      'assets/paintings/horatii.jpg',
      // 4: The Death of Socrates — Jacques-Louis David, 1787 (Met)
      'assets/paintings/cana.jpg',
    ].map(url => new THREE.MeshStandardMaterial({ map: loadPaintingTex(url), roughness: 0.88, metalness: 0.0 })),
    // La Joconde — Leonardo da Vinci, c. 1503 (Louvre)
    monaLisa: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('assets/paintings/monalisa.jpg'),
      roughness: 0.88, metalness: 0.0,
    }),
    // Les Nymphéas — Claude Monet, c. 1906
    monet: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('assets/paintings/waterlilies.jpg'),
      roughness: 0.88, metalness: 0.0,
    }),
    // Dr. Harnoor Dhaliwal, PhD — Executive Director, Scott Scholars, UNO
    harnoor: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('assets/paintings/harnoor.jpg'),
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
  const vents          = [];

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
    // Shaft — octagonal column (much less blocky than a box)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.55, WALL_H - 0.36, 8), M.pillar);
    shaft.position.set(x, (WALL_H - 0.36) / 2 + 0.18, z);
    shaft.castShadow = shaft.receiveShadow = true;
    scene.add(shaft);
    addWallAABB(x, z, 1.5, 1.5);
    // Base plinth + astragal band
    box(scene, 1.55, 0.22, 1.55, x, 0.11, z, _moldMat);
    box(scene, 1.35, 0.13, 1.35, x, 0.31, z, _baseMat);
    // Decorative torus ring at mid-shaft
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.042, 6, 12), _moldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, (WALL_H - 0.36) / 2 + 0.18, z);
    scene.add(ring);
    // Capital flange + neck band
    box(scene, 1.55, 0.22, 1.55, x, WALL_H - 0.11, z, _moldMat);
    box(scene, 1.35, 0.13, 1.35, x, WALL_H - 0.31, z, _baseMat);
  }

  function displayCase(scene, x, z) {
    // Base cabinet with stepped plinth
    box(scene, 1.35, 0.14, 1.35, x, 0.07, z, _baseMat);   // plinth lip
    box(scene, 1.2,  0.80, 1.2,  x, 0.54, z, M.desk);     // main cabinet body
    // Glass vitrine
    box(scene, 1.0,  1.20, 1.0,  x, 1.40, z, M.glass);
    // Slim metal corner posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6a7888, roughness: 0.30, metalness: 0.70 });
    [[-0.50, -0.50], [-0.50, 0.50], [0.50, -0.50], [0.50, 0.50]].forEach(([ox, oz]) => {
      box(scene, 0.065, 1.28, 0.065, x + ox, 1.44, z + oz, postMat);
    });
    // Lid cap
    box(scene, 1.08, 0.048, 1.08, x, 2.064, z, postMat);
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

    // Floor glow ring — colour matches key type, pulsed by tickFloatItems
    const _ringColor = key === 'yellow' ? 0xffe040 : key === 'blue' ? 0x44aaff : 0xff5544;
    const _ringMat = new THREE.MeshBasicMaterial({
      color: _ringColor, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const floorRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.58, 28), _ringMat);
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.set(x, 0.015, z);
    scene.add(floorRing);

    // tickFloatItems will drive group.position.y and group.rotation.y each frame
    keycardPickups.push({ mesh: group, key, x, z, collected: false, floorRing });
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
  const _brassM = new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.30, metalness: 0.80 });

  function ceilingLamp(scene, x, z) {
    const glassM = new THREE.MeshStandardMaterial({
      color: 0xe0ecff, roughness: 0.12, metalness: 0.0,
      transparent: true, opacity: 0.55,
      emissive: 0xa0c0ff, emissiveIntensity: 0.45,
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
      color: 0xc0d8ff, roughness: 0.12,
      emissive: 0x80a8ff, emissiveIntensity: 0.75,
      transparent: true, opacity: 0.75,
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
    const woodM  = new THREE.MeshStandardMaterial({ color: 0x2a3848, roughness: 0.75, metalness: 0.0 });
    const metalM = new THREE.MeshStandardMaterial({ color: 0x607080, roughness: 0.40, metalness: 0.70 });
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
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x788090, roughness: 0.62, metalness: 0.06 });
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

  // ── Grand lobby chandelier ───────────────────────────────────────────────────
  function lobbyChandelier(scene, x, z) {
    const goldM   = new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.18, metalness: 0.88 });
    const darkM   = new THREE.MeshStandardMaterial({ color: 0xa07820, roughness: 0.28, metalness: 0.82 });
    const crystalM = new THREE.MeshStandardMaterial({
      color: 0xe8f0ff, roughness: 0.04, metalness: 0.05,
      emissive: 0xb0c8ff, emissiveIntensity: 0.72,
      transparent: true, opacity: 0.80,
    });

    const Y_TOP    = WALL_H;           // 6.0 — ceiling bottom
    const Y_HUB    = Y_TOP  - 1.22;   // 4.78 — main assembly hub
    const Y_R1     = Y_HUB  - 0.08;   // 4.70 — outer ring
    const Y_R2     = Y_HUB  - 0.50;   // 4.28 — mid ring
    const Y_R3     = Y_HUB  - 0.88;   // 3.90 — inner ring
    const Y_FINIAL = Y_HUB  - 1.24;   // 3.54 — bottom finial

    // Ceiling mount cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.16, 10), goldM);
    cap.position.set(x, Y_TOP - 0.08, z);
    scene.add(cap);
    // Central hanging rod
    box(scene, 0.046, 1.10, 0.046, x, Y_TOP - 0.63, z, goldM);
    // Hub sphere
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), goldM);
    hub.position.set(x, Y_HUB, z);
    scene.add(hub);

    // ── Ring 1 — outer (r = 1.52) ──────────────────────────────
    const R1 = 1.52;
    const t1 = new THREE.Mesh(new THREE.TorusGeometry(R1, 0.038, 7, 40), goldM);
    t1.rotation.x = Math.PI / 2; t1.position.set(x, Y_R1, z); scene.add(t1);
    // 4 horizontal spokes from hub to ring
    for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 2 + Math.PI / 4;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(R1, 0.015, 0.015), darkM);
      spoke.position.set(x + Math.cos(a) * R1 / 2, Y_R1, z + Math.sin(a) * R1 / 2);
      spoke.rotation.y = -a;
      scene.add(spoke);
    }
    // 14 crystal drops
    for (let c = 0; c < 14; c++) {
      const a = (c / 14) * Math.PI * 2;
      const cx = x + Math.cos(a) * R1, cz = z + Math.sin(a) * R1;
      box(scene, 0.012, 0.21, 0.012, cx, Y_R1 - 0.105, cz, darkM);
      const cr = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 4), crystalM);
      cr.position.set(cx, Y_R1 - 0.26, cz); scene.add(cr);
    }

    // ── Ring 2 — mid (r = 1.06) ──────────────────────────────
    const R2 = 1.06;
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(R2, 0.030, 7, 30), goldM);
    t2.rotation.x = Math.PI / 2; t2.position.set(x, Y_R2, z); scene.add(t2);
    // 4 spokes
    for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(R2, 0.013, 0.013), darkM);
      spoke.position.set(x + Math.cos(a) * R2 / 2, Y_R2, z + Math.sin(a) * R2 / 2);
      spoke.rotation.y = -a;
      scene.add(spoke);
    }
    // 10 crystal drops
    for (let c = 0; c < 10; c++) {
      const a = (c / 10) * Math.PI * 2;
      const cx = x + Math.cos(a) * R2, cz = z + Math.sin(a) * R2;
      box(scene, 0.011, 0.17, 0.011, cx, Y_R2 - 0.085, cz, darkM);
      const cr = new THREE.Mesh(new THREE.SphereGeometry(0.046, 6, 4), crystalM);
      cr.position.set(cx, Y_R2 - 0.21, cz); scene.add(cr);
    }

    // ── Ring 3 — inner (r = 0.60) ──────────────────────────────
    const R3 = 0.60;
    const t3 = new THREE.Mesh(new THREE.TorusGeometry(R3, 0.024, 7, 22), goldM);
    t3.rotation.x = Math.PI / 2; t3.position.set(x, Y_R3, z); scene.add(t3);
    // 6 crystal drops
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2;
      const cx = x + Math.cos(a) * R3, cz = z + Math.sin(a) * R3;
      box(scene, 0.010, 0.13, 0.010, cx, Y_R3 - 0.065, cz, darkM);
      const cr = new THREE.Mesh(new THREE.SphereGeometry(0.040, 6, 4), crystalM);
      cr.position.set(cx, Y_R3 - 0.175, cz); scene.add(cr);
    }

    // ── Bottom finial ──────────────────────────────────────────
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), goldM);
    fin.position.set(x, Y_FINIAL, z); scene.add(fin);
    const finTip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.07, 0.22, 6), goldM);
    finTip.position.set(x, Y_FINIAL - 0.22, z); scene.add(finTip);
    // Centre crystal cluster
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const cr = new THREE.Mesh(new THREE.SphereGeometry(0.044, 6, 4), crystalM);
      cr.position.set(x + Math.cos(a) * 0.11, Y_FINIAL - 0.22, z + Math.sin(a) * 0.11);
      scene.add(cr);
    }
    const centre = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 5), crystalM);
    centre.position.set(x, Y_FINIAL - 0.38, z); scene.add(centre);
  }

  // ── Gilded pillar (Crown Vault) — warm stone shaft + gold accents ───────────
  function gildedPillar(scene, x, z) {
    const shaftM  = new THREE.MeshStandardMaterial({ color: 0x786050, roughness: 0.70, metalness: 0.06 });
    const goldM   = new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.20, metalness: 0.88 });
    const dkGoldM = new THREE.MeshStandardMaterial({ color: 0xa07820, roughness: 0.28, metalness: 0.82 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.55, WALL_H - 0.36, 8), shaftM);
    shaft.position.set(x, (WALL_H - 0.36) / 2 + 0.18, z);
    shaft.castShadow = shaft.receiveShadow = true;
    scene.add(shaft);
    addWallAABB(x, z, 1.5, 1.5);

    // Gold base plinth + astragal band
    box(scene, 1.55, 0.22, 1.55, x, 0.11, z, goldM);
    box(scene, 1.35, 0.13, 1.35, x, 0.31, z, dkGoldM);

    // Three gold torus rings up the shaft
    [[0, 0], [0.6, 1], [-0.6, 1]].forEach(([offset, w]) => {
      const y = (WALL_H - 0.36) / 2 + 0.18 + offset;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, w ? 0.026 : 0.042, 6, 16), w ? dkGoldM : goldM);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      scene.add(ring);
    });

    // Gold capital flange + neck band
    box(scene, 1.55, 0.22, 1.55, x, WALL_H - 0.11, z, goldM);
    box(scene, 1.35, 0.13, 1.35, x, WALL_H - 0.31, z, dkGoldM);
  }

  // ── Velvet rope barrier around a display case ───────────────────────────────
  function displayCaseRopes(scene, x, z) {
    const R = 1.42;
    stanchion(scene, x - R, z - R);
    stanchion(scene, x + R, z - R);
    stanchion(scene, x - R, z + R);
    stanchion(scene, x + R, z + R);
    velvetRope(scene, x - R, z - R, x + R, z - R);
    velvetRope(scene, x - R, z + R, x + R, z + R);
    velvetRope(scene, x - R, z - R, x - R, z + R);
    velvetRope(scene, x + R, z - R, x + R, z + R);
  }

  // ── Painting spotlight: small ceiling track light + visible cone ────────────
  // wallDir: 'west' | 'east' | 'south' | 'north'
  function paintingSpotlight(scene, px, py, pz, wallDir) {
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.30, metalness: 0.80 });
    const warmMat  = new THREE.MeshStandardMaterial({
      color: 0xffe8b0, emissive: 0xffe8b0, emissiveIntensity: 1.15, roughness: 0.25,
    });
    const coneMat  = new THREE.MeshBasicMaterial({
      color: 0xffe8c8, transparent: true, opacity: 0.062,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });

    const ceilY = WALL_H - 0.22;
    let lx = px, lz = pz;
    if      (wallDir === 'west')  lx = px + 2.5;
    else if (wallDir === 'east')  lx = px - 2.5;
    else if (wallDir === 'south') lz = pz + 2.5;
    else if (wallDir === 'north') lz = pz - 2.5;

    // Track rail (thin ceiling strip)
    box(scene, 0.06, 0.06, 0.55, lx, ceilY, lz, trackMat);
    // Light head (small angled box housing)
    box(scene, 0.19, 0.14, 0.14, lx, ceilY - 0.13, lz, trackMat);
    // Warm emissive bulb
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.058, 6, 4), warmMat);
    bulb.position.set(lx, ceilY - 0.23, lz);
    scene.add(bulb);

    // Cone: tip at light head, base spread toward painting
    // Horizontal offset and vertical drop from light to painting
    const hDist = (wallDir === 'west' || wallDir === 'east') ? Math.abs(px - lx) : Math.abs(pz - lz);
    const vDist = ceilY - py;
    const coneH = Math.sqrt(hDist * hDist + vDist * vDist) * 0.88;
    const coneR  = coneH * 0.30;
    const tilt   = Math.atan2(hDist, vDist);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 12, 1, true), coneMat);
    // ConeGeometry tip at +Y/2, base at -Y/2. Rotate so tip points toward room centre.
    if      (wallDir === 'west')  cone.rotation.z = -tilt;
    else if (wallDir === 'east')  cone.rotation.z =  tilt;
    else if (wallDir === 'south') cone.rotation.x = -tilt;
    else if (wallDir === 'north') cone.rotation.x =  tilt;

    // Position at midpoint between light and painting
    cone.position.set(
      (lx + px) / 2,
      (ceilY + py) / 2 - 0.08,
      (lz + pz) / 2
    );
    scene.add(cone);
  }

  // ── Velvet rope stanchion (gold post + weighted base) ────────────────────
  function stanchion(scene, x, z) {
    const goldM = new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.22, metalness: 0.88 });
    const baseM = new THREE.MeshStandardMaterial({ color: 0xa88020, roughness: 0.30, metalness: 0.80 });
    // Heavy base weight
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.148, 0.065, 12), baseM);
    base.position.set(x, 0.032, z);
    scene.add(base);
    // Post shaft
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.92, 8), goldM);
    post.position.set(x, 0.49, z);
    scene.add(post);
    // Decorative finial cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), goldM);
    cap.position.set(x, 0.965, z);
    scene.add(cap);
    // Tiny neck band just below cap
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.035, 8), baseM);
    neck.position.set(x, 0.90, z);
    scene.add(neck);
  }

  // ── Velvet rope connecting two stanchion tops ────────────────────────────
  function velvetRope(scene, x1, z1, x2, z2) {
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x7a0018, roughness: 0.88, metalness: 0.0 });
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const rope = new THREE.Mesh(new THREE.BoxGeometry(len, 0.032, 0.032), ropeMat);
    rope.position.set((x1 + x2) / 2, 0.84, (z1 + z2) / 2);
    rope.rotation.y = Math.atan2(-dz, dx);
    scene.add(rope);
  }

  // ── Display case interior contents ───────────────────────────────────────
  // type: 'ring' | 'coins' | 'gems'
  function displayCaseContents(scene, x, z, type) {
    const goldM    = new THREE.MeshStandardMaterial({ color: 0xd4a030, roughness: 0.18, metalness: 0.92, emissive: 0x221500, emissiveIntensity: 0.28 });
    const rubyM    = new THREE.MeshStandardMaterial({ color: 0xcc2020, roughness: 0.04, metalness: 0.08, emissive: 0x440000, emissiveIntensity: 0.40, transparent: true, opacity: 0.88 });
    const sapphM   = new THREE.MeshStandardMaterial({ color: 0x1a44cc, roughness: 0.04, metalness: 0.08, emissive: 0x050a44, emissiveIntensity: 0.38, transparent: true, opacity: 0.88 });
    const emeraldM = new THREE.MeshStandardMaterial({ color: 0x14aa44, roughness: 0.04, metalness: 0.08, emissive: 0x032211, emissiveIntensity: 0.38, transparent: true, opacity: 0.88 });
    const pearlM   = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.22, metalness: 0.12 });
    const cushM    = new THREE.MeshStandardMaterial({ color: 0x600020, roughness: 0.92, metalness: 0.0 });
    const coinM    = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.32, metalness: 0.78 });
    const Y = 1.44;  // inside glass case — glass runs y≈0.94→2.14

    if (type === 'ring') {
      // Velvet display cushion
      box(scene, 0.52, 0.055, 0.32, x, Y - 0.08, z, cushM);
      // Gold ring with ruby
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.020, 8, 16), goldM);
      ring.position.set(x - 0.10, Y + 0.03, z);
      ring.rotation.x = Math.PI / 2.8;
      scene.add(ring);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 5), rubyM);
      gem.position.set(x - 0.10, Y + 0.115, z);
      scene.add(gem);
      // Pearl necklace draped flat
      const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.011, 6, 20), pearlM);
      necklace.position.set(x + 0.13, Y + 0.005, z);
      necklace.rotation.x = Math.PI / 2.2;
      scene.add(necklace);
    }

    if (type === 'coins') {
      // Velvet tray
      box(scene, 0.55, 0.042, 0.55, x, Y - 0.09, z, cushM);
      // Scattered ancient coins (some upright, some flat)
      const coinDefs = [
        [-0.17, 0,     -0.14, 0.30,  0.0 ],
        [ 0.06, 0,      0.16, -0.25, 0.0 ],
        [ 0.18, 0,     -0.06, 0.15,  0.35],
        [-0.05, 0.012,  0.0,  0.55,  0.0 ],
        [ 0.12, 0,      0.20, -0.40, 0.2 ],
      ];
      coinDefs.forEach(([ox, oy, oz, rx, rz]) => {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.011, 10), coinM);
        coin.position.set(x + ox, Y + oy, z + oz);
        coin.rotation.set(rx, 0, rz);
        scene.add(coin);
      });
      // Small gold reliquary box at back
      box(scene, 0.13, 0.075, 0.09, x - 0.15, Y - 0.02, z - 0.18, goldM);
    }

    if (type === 'gems') {
      // Velvet display cushion
      box(scene, 0.52, 0.048, 0.52, x, Y - 0.09, z, cushM);
      // Gem cluster
      [
        [x - 0.14, Y + 0.04, z - 0.10, rubyM,    0.058],
        [x + 0.08, Y + 0.048, z + 0.09, sapphM,  0.052],
        [x - 0.04, Y + 0.03, z + 0.19, emeraldM, 0.048],
        [x + 0.19, Y + 0.025, z - 0.07, goldM,   0.038],
        [x + 0.01, Y + 0.055, z - 0.04, rubyM,   0.032],
      ].forEach(([cx, cy, cz, m, r]) => {
        const gem = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), m);
        gem.position.set(cx, cy, cz);
        scene.add(gem);
      });
      // Small gold clasp box
      box(scene, 0.11, 0.065, 0.08, x + 0.08, Y - 0.03, z - 0.19, goldM);
    }
  }

  // ── Build museum ───────────────────────────────────────
  function init(scene) {

    // ════════════════════════════════
    //  LOBBY  cx=0  cz=20  40×40
    // ════════════════════════════════
    roomWalls(scene, 0, 20, 40, 40, { north: true, south: true });

    // South wall stubs flanking the 3-unit front entrance gap
    const _enStub = (40 - 3) / 2;  // 18.5
    wall(scene, -(20 - _enStub / 2), 0, _enStub, WALL_T);  // west stub  centred at (-10.75, 0)
    wall(scene,  (20 - _enStub / 2), 0, _enStub, WALL_T);  // east stub  centred at ( 10.75, 0)

    // Front entrance door — always requires lock-picking (no key in inventory)
    door(scene, 0, 0, 'entry');
    doorGlow(scene, 0, 0, 0x90b0e0);  // cool blue archway

    // Reception desk — layered museum counter
    {
      const _topMat  = new THREE.MeshStandardMaterial({ color: 0xd2cdc2, roughness: 0.14, metalness: 0.06 }); // polished marble top
      const _fascMat = new THREE.MeshStandardMaterial({ color: 0x1c2535, roughness: 0.80, metalness: 0.04 }); // dark stone fascia
      const _trimMat = new THREE.MeshStandardMaterial({ color: 0x7a8a9c, roughness: 0.28, metalness: 0.72 }); // brushed steel trim
      const _scrMat  = new THREE.MeshStandardMaterial({ color: 0x081828, emissive: 0x183858, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.1 });

      // Main cabinet body (dark stone fascia)
      box(scene, 8.0,  1.05, 1.85, 0,    0.525, 14.0,  _fascMat);
      // Polished marble countertop — slight overhang all round
      box(scene, 8.28, 0.10, 2.12, 0,    1.15,  14.0,  _topMat);
      // Brushed-steel base trim strip along front face
      box(scene, 8.0,  0.06, 0.05, 0,    0.03,  13.08, _trimMat);
      // Raised privacy panel on back edge (staff side)
      box(scene, 7.8,  0.42, 0.08, 0,    1.41,  14.93, _fascMat);
      // Front fascia — two recessed lighter insets (left + right)
      box(scene, 3.5,  0.76, 0.04, -1.9, 0.56,  13.08, _topMat);
      box(scene, 3.5,  0.76, 0.04,  1.9, 0.56,  13.08, _topMat);
      // Thin steel divider strip between insets
      box(scene, 0.06, 0.76, 0.05, 0,    0.56,  13.07, _trimMat);
      // Flat monitor (screen face + stand arm)
      box(scene, 0.70, 0.46, 0.04, -1.6, 1.46,  14.62, _scrMat);
      box(scene, 0.06, 0.06, 0.20, -1.6, 1.18,  14.68, _trimMat);
      // Thin keyboard slab on counter
      box(scene, 0.52, 0.02, 0.22, -1.6, 1.16,  14.38, _trimMat);
    }
    addWallAABB(0, 14, 8, 2);

    // Decorative pillars
    pillar(scene, -10,  8);
    pillar(scene,  10,  8);
    pillar(scene, -10, 32);
    pillar(scene,  10, 32);

    // Lobby paintings (on east and west walls)
    wallPainting(scene, -19.9, 3.5,  8, M.paintings[0], true);
    paintingSpotlight(scene, -19.9, 3.5,  8, 'west');
    wallPainting(scene, -19.9, 3.5, 28, M.paintings[1], true);
    paintingSpotlight(scene, -19.9, 3.5, 28, 'west');
    wallPainting(scene,  19.9, 3.5, 16, M.paintings[2], false);
    paintingSpotlight(scene,  19.9, 3.5, 16, 'east');

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
    lobbyChandelier(scene, 0, 26);

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

    // Diamond Tiara — optional stealable on lobby pedestal (east side)
    { const tiaraMat = new THREE.MeshStandardMaterial({ color: 0xe0e8ff, emissive: 0x6688ff, emissiveIntensity: 0.22, roughness: 0.08, metalness: 0.95 });
      const gemMat   = new THREE.MeshStandardMaterial({ color: 0xaaddff, emissive: 0x4488ff, emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.7 });
      const tiara = new THREE.Group();
      const tiaraArc = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 8, 24, Math.PI), tiaraMat);
      tiaraArc.rotation.z = Math.PI; tiara.add(tiaraArc);
      [-0.09, 0, 0.09].forEach((ox, i) => {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(i === 1 ? 0.038 : 0.026), gemMat);
        gem.position.set(ox, i === 1 ? 0.12 : 0.09, 0); tiara.add(gem);
      });
      box(scene, 0.22, 0.85, 0.22, 12, 0.425, 14, M.pedestal);
      tiara.position.set(12, 1.04, 14);
      tiara.userData.float = true;
      scene.add(tiara);
      stealables.push({ mesh: tiara, item: 'tiara', x: 12, z: 14, taken: false, bonus: true, label: 'Diamond Tiara', value: 3500000 });
      const tRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
        new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      tRing.rotation.x = -Math.PI / 2; tRing.position.set(12, 0.02, 14); scene.add(tRing);
      tiara.userData.floorRing = tRing; }

    // Additional paintings — south wall and east wall
    wallPaintingNS(scene, -10, 3.5, 0.10, M.paintings[3], true);
    paintingSpotlight(scene, -10, 3.5, 0.10, 'south');
    wallPaintingNS(scene,  10, 3.5, 0.10, M.paintings[4], true);
    paintingSpotlight(scene,  10, 3.5, 0.10, 'south');
    wallPainting(scene, 19.9, 3.5,  4, M.paintings[3], false);
    paintingSpotlight(scene,  19.9, 3.5,  4, 'east');
    wallPainting(scene, 19.9, 3.5, 28, M.paintings[4], false);
    paintingSpotlight(scene,  19.9, 3.5, 28, 'east');
    wallSconce(scene,  19.75, 2.9,  4, -1);
    wallSconce(scene,  19.75, 2.9, 28, -1);

    // Glowing archway at yellow keycard door so the exit is obvious
    doorGlow(scene, 0, 39.75, 0xf0c040);

    // ════════════════════════════════
    //  EXTERIOR ENTRANCE PLAZA  Z=-22→0  X=-20→20
    //  Player spawns here and must pick the front lock.
    // ════════════════════════════════
    {
      // ── Materials ──────────────────────────────────────
      const extFloorMat = new THREE.MeshStandardMaterial({ color: 0xb0aaa0, roughness: 0.94, metalness: 0.0 });
      const mFacade     = new THREE.MeshStandardMaterial({ color: 0xd0c4a0, roughness: 0.85, metalness: 0.0 });
      const mCorniceExt = new THREE.MeshStandardMaterial({ color: 0xb8a870, roughness: 0.55, metalness: 0.12 });
      const mWinExt     = new THREE.MeshBasicMaterial({ color: 0x1a2a3a });
      const mWalkExt    = new THREE.MeshStandardMaterial({ color: 0xd0c8b4, roughness: 0.84, metalness: 0.0 });
      const mStoneDec   = new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.75, metalness: 0.0 });
      const mStep       = new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.80, metalness: 0.0 });
      const mFence      = new THREE.MeshStandardMaterial({ color: 0x181814, roughness: 0.40, metalness: 0.80 });
      const mLion       = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.72, metalness: 0.0  });
      const mLanternM   = new THREE.MeshStandardMaterial({ color: 0x1a1810, roughness: 0.40, metalness: 0.75 });
      const mLanternG   = new THREE.MeshStandardMaterial({ color: 0xffcc55, emissive: 0xffaa22, emissiveIntensity: 2.0, transparent: true, opacity: 0.85 });
      const mGoldPole   = new THREE.MeshStandardMaterial({ color: 0xc0a840, roughness: 0.30, metalness: 0.70 });
      const mSlate      = new THREE.MeshStandardMaterial({ color: 0x3c3830, roughness: 0.92, metalness: 0.0 });

      // ── Floor ──────────────────────────────────────────
      box(scene, 40, 0.28, 22, 0, -0.14, -11, extFloorMat);
      box(scene, 14, 0.29, 22, 0, -0.135, -11, mWalkExt);  // central stone walkway

      // ── Lobby side walls ───────────────────────────────
      box(scene, WALL_T, WALL_H, 22, -20, WALL_H / 2, -11, M.wall);
      addWallAABB(-20, -11, WALL_T + 0.02, 22.02);
      box(scene, WALL_T, WALL_H, 22,  20, WALL_H / 2, -11, M.wall);
      addWallAABB( 20, -11, WALL_T + 0.02, 22.02);

      // ── South boundary — iron fence (visual) + collision AABB ──
      addWallAABB(0, -22, 40.02, WALL_T + 0.02);
      const mFenceFinial = new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.28, metalness: 0.75 });
      for (let fx = -19; fx <= 19; fx += 2) {
        if (Math.abs(fx) < 3) continue;  // leave gate gap at centre
        box(scene, 0.16, 2.0, 0.16, fx, 1.0, -22, mFence);  // post
        const spear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), mFenceFinial);
        spear.position.set(fx, 2.18, -22); scene.add(spear);
      }
      // Horizontal rails (west half + east half, skipping gate)
      box(scene, 16, 0.07, 0.07, -11, 1.5, -22, mFence);
      box(scene, 16, 0.07, 0.07, -11, 0.8, -22, mFence);
      box(scene, 16, 0.07, 0.07,  11, 1.5, -22, mFence);
      box(scene, 16, 0.07, 0.07,  11, 0.8, -22, mFence);
      // Gate posts + sphere caps
      box(scene, 0.24, 2.4, 0.24, -3, 1.2, -22, mFence);
      box(scene, 0.24, 2.4, 0.24,  3, 1.2, -22, mFence);
      [-3, 3].forEach(gx => {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 6, 5), mFenceFinial);
        cap.position.set(gx, 2.55, -22); scene.add(cap);
      });

      // ── Museum south facade ────────────────────────────
      // Rusticated base — split around door gap
      box(scene, 18.5, 2.4, 0.32, -10.75, 1.2, -0.42, mFacade);
      box(scene, 18.5, 2.4, 0.32,  10.75, 1.2, -0.42, mFacade);
      // Upper panels
      box(scene, 18.5, WALL_H - 2.4, 0.26, -10.75, 2.4 + (WALL_H - 2.4) / 2, -0.39, mFacade);
      box(scene, 18.5, WALL_H - 2.4, 0.26,  10.75, 2.4 + (WALL_H - 2.4) / 2, -0.39, mFacade);
      // Cornice bands — split
      [2.5, 4.5, WALL_H].forEach(h => {
        const cm = h === WALL_H ? mCorniceExt : mFacade;
        box(scene, 18.5, 0.32, 0.50, -10.75, h + 0.16, -0.45, cm);
        box(scene, 18.5, 0.32, 0.50,  10.75, h + 0.16, -0.45, cm);
      });
      // Window panels
      [-16.5, -10.75, -5].forEach(wx => box(scene, 2.6, 2.4, 0.08, wx, 4.0, -0.52, mWinExt));
      [   5,  10.75,  16.5].forEach(wx => box(scene, 2.6, 2.4, 0.08, wx, 4.0, -0.52, mWinExt));
      // Pilasters
      [-18.5, -13.5, -7.5, 7.5, 13.5, 18.5].forEach(px => {
        box(scene, 0.45, WALL_H, 0.38, px, WALL_H / 2, -0.44, mFacade);
      });

      // ── Wing extensions — WNG=12, corner pavilion towers ──
      const WNG = 12, WNG_H = WALL_H + 2, PAVH = WALL_H + 5;
      // West wing
      box(scene, WNG, WNG_H, WALL_T, -(20 + WNG / 2), WNG_H / 2, -0.36, mFacade);
      box(scene, WALL_T, WNG_H, 22,  -(20 + WNG), WNG_H / 2, -11, mFacade);
      box(scene, WNG + 0.3, 0.32, WALL_T + 0.4, -(20 + WNG / 2), WNG_H + 0.16, -0.46, mCorniceExt);
      // West corner pavilion
      box(scene, 4.5, PAVH, WALL_T + 2.5, -(20 + WNG), PAVH / 2, -0.36, mFacade);
      box(scene, 4.9, 0.38, WALL_T + 2.9, -(20 + WNG), PAVH + 0.19, -0.36, mCorniceExt);
      box(scene, 4.5, 3.5,  WALL_T + 2.5, -(20 + WNG), PAVH + 1.75, -0.36, mSlate);
      // East wing (mirror)
      box(scene, WNG, WNG_H, WALL_T,  (20 + WNG / 2), WNG_H / 2, -0.36, mFacade);
      box(scene, WALL_T, WNG_H, 22,   (20 + WNG), WNG_H / 2, -11, mFacade);
      box(scene, WNG + 0.3, 0.32, WALL_T + 0.4, (20 + WNG / 2), WNG_H + 0.16, -0.46, mCorniceExt);
      box(scene, 4.5, PAVH, WALL_T + 2.5,  (20 + WNG), PAVH / 2, -0.36, mFacade);
      box(scene, 4.9, 0.38, WALL_T + 2.9,  (20 + WNG), PAVH + 0.19, -0.36, mCorniceExt);
      box(scene, 4.5, 3.5,  WALL_T + 2.5,  (20 + WNG), PAVH + 1.75, -0.36, mSlate);

      // ── Colonnade — decorative columns in front of facade ──
      {
        const colZ = -2.8;
        [-17, -12, -7, 7, 12, 17].forEach(cx => {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.50, WALL_H - 0.3, 8), M.pillar);
          col.position.set(cx, (WALL_H - 0.3) / 2 + 0.15, colZ); scene.add(col);
          box(scene, 1.35, 0.20, 1.35, cx, 0.10, colZ, _moldMat);   // base plinth
          box(scene, 1.20, 0.32, 1.20, cx, WALL_H - 0.05, colZ, _moldMat);  // capital
        });
        // Entablature beams connecting column tops (west + east, avoiding door gap)
        box(scene, 12.5, 0.38, 0.65, -12, WALL_H + 0.09, colZ, mFacade);
        box(scene, 12.5, 0.38, 0.65,  12, WALL_H + 0.09, colZ, mFacade);
      }

      // ── Pediment (triangular gable over entrance) ──────
      {
        const PW = 8.5, PH = 2.2;
        const pedGeo = new THREE.BufferGeometry();
        pedGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
          -PW/2, 0, 0,  PW/2, 0, 0,  0, PH, 0,
           PW/2, 0, 0, -PW/2, 0, 0,  0, PH, 0,
        ]), 3));
        pedGeo.computeVertexNormals();
        const pedMesh = new THREE.Mesh(pedGeo, mFacade);
        pedMesh.position.set(0, WALL_H + 0.2, -0.58); scene.add(pedMesh);
        // Base cornice
        box(scene, PW + 0.3, 0.28, 0.44, 0, WALL_H + 0.14, -0.58, mCorniceExt);
        // Sloped sides
        const sl = Math.sqrt((PW / 2) ** 2 + PH ** 2);
        const sa = Math.atan2(PH, PW / 2);
        const sL = new THREE.Mesh(new THREE.BoxGeometry(sl + 0.2, 0.22, 0.38), mCorniceExt);
        sL.position.set(-PW / 4, WALL_H + PH / 2, -0.58); sL.rotation.z =  sa; scene.add(sL);
        const sR = new THREE.Mesh(new THREE.BoxGeometry(sl + 0.2, 0.22, 0.38), mCorniceExt);
        sR.position.set( PW / 4, WALL_H + PH / 2, -0.58); sR.rotation.z = -sa; scene.add(sR);
      }

      // ── Grand staircase (3 decorative steps leading to door) ──
      box(scene, 12, 0.18, 0.7, 0, 0.09, -1.7, mStep);  // bottom
      box(scene, 10, 0.18, 0.7, 0, 0.27, -1.1, mStep);  // middle
      box(scene,  8, 0.18, 0.7, 0, 0.45, -0.5, mStep);  // top

      // ── Grand entrance pillars flanking the front door ──
      pillar(scene, -5, -3);
      pillar(scene,  5, -3);

      // ── Gold nameplate ─────────────────────────────────
      const plaqueMat = new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.28, metalness: 0.75 });
      box(scene, 5.5, 0.38, 0.14, 0, WALL_H - 0.55, -0.08, plaqueMat);

      // ── Hanging lantern above entrance ────────────────
      box(scene, 0.07, 1.4, 0.07, 0, WALL_H - 0.55, -1.9, mLanternM);  // rod
      box(scene, 0.82, 1.0, 0.82, 0, WALL_H - 1.75, -1.9, mLanternM);  // frame
      box(scene, 0.56, 0.70, 0.07, 0, WALL_H - 1.75, -1.9 - 0.44, mLanternG);  // south glass
      box(scene, 0.56, 0.70, 0.07, 0, WALL_H - 1.75, -1.9 + 0.44, mLanternG);  // north glass
      box(scene, 0.07, 0.70, 0.56, -0.44, WALL_H - 1.75, -1.9, mLanternG);  // west glass
      box(scene, 0.07, 0.70, 0.56,  0.44, WALL_H - 1.75, -1.9, mLanternG);  // east glass
      box(scene, 0.90, 0.20, 0.90, 0, WALL_H - 1.18, -1.9, mLanternM);  // top cap
      const lFin = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.30, 6), mLanternM);
      lFin.position.set(0, WALL_H - 2.37, -1.9); lFin.rotation.x = Math.PI; scene.add(lFin);

      // ── Wall sconces on entrance pillars ───────────────
      wallSconce(scene, -5.22, 2.8, -3,  1);
      wallSconce(scene,  5.22, 2.8, -3, -1);

      // ── Ground uplighting — emissive discs at facade base ──
      const mUplight = new THREE.MeshBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 0.42 });
      [-16.5, -10.75, -5, 5, 10.75, 16.5].forEach(ux => {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 8), mUplight);
        disc.rotation.x = -Math.PI / 2; disc.position.set(ux, 0.02, -1.3); scene.add(disc);
      });

      // ── Lampposts flanking the approach path ──────────
      {
        const poleM2 = new THREE.MeshStandardMaterial({ color: 0x1a1810, roughness: 0.5, metalness: 0.6 });
        const glowM2 = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffe880, emissiveIntensity: 2.5, roughness: 0.2 });
        function entLamp(lx, lz) {
          box(scene, 0.14, 6.5, 0.14, lx, 3.25, lz, poleM2);
          box(scene, 0.10, 0.10, 1.0, lx, 6.5, lz + 0.4, poleM2);
          const globe = new THREE.Mesh(new THREE.SphereGeometry(0.38, 7, 5), glowM2);
          globe.position.set(lx, 6.8, lz + 0.4); scene.add(globe);
        }
        entLamp(-11, -5); entLamp(11, -5);
        entLamp(-11, -16); entLamp(11, -16);
      }

      // ── Flag poles with museum banners ────────────────
      {
        const mBannerA = new THREE.MeshBasicMaterial({ color: 0x4a1828, side: THREE.DoubleSide });
        const mBannerB = new THREE.MeshBasicMaterial({ color: 0x1a3858, side: THREE.DoubleSide });
        function flagpole(fx, fz, bannerMat) {
          box(scene, 0.12, 10.5, 0.12, fx, 5.25, fz, mGoldPole);
          box(scene, 2.2, 0.10, 0.10, fx + 1.06, 9.8, fz, mGoldPole);  // crossbar
          const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.8), bannerMat);
          banner.position.set(fx + 1.06, 8.3, fz); scene.add(banner);
          const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), mGoldPole);
          finial.position.set(fx, 10.85, fz); scene.add(finial);
        }
        flagpole(-16, -7, mBannerA);
        flagpole( 16, -7, mBannerB);
      }

      // ── Lion statues on pedestals flanking the walkway ─
      {
        function lionStatue(lx, lz) {
          // Pedestal
          box(scene, 1.4, 0.28, 2.0, lx, 0.14, lz, mStoneDec);
          box(scene, 1.1, 1.30, 1.7, lx, 0.79, lz, mStoneDec);
          box(scene, 1.4, 0.22, 2.0, lx, 1.55, lz, mStoneDec);
          const BY = 1.66;
          // Body
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.60, 1.45), mLion);
          body.position.set(lx, BY + 0.30, lz); scene.add(body);
          // Head (facing south toward approaching player)
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 6), mLion);
          head.scale.set(1.0, 0.86, 1.12); head.position.set(lx, BY + 0.64, lz - 0.62); scene.add(head);
          // Mane
          const mane = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.10, 5, 10), mLion);
          mane.rotation.y = Math.PI / 2; mane.rotation.z = Math.PI / 2;
          mane.position.set(lx, BY + 0.60, lz - 0.60); scene.add(mane);
          // Paws
          box(scene, 0.22, 0.18, 0.45, lx - 0.24, BY + 0.09, lz - 0.88, mLion);
          box(scene, 0.22, 0.18, 0.45, lx + 0.24, BY + 0.09, lz - 0.88, mLion);
        }
        lionStatue(-9,  -6); lionStatue( 9,  -6);
        lionStatue(-9, -16); lionStatue( 9, -16);
      }

      // ── Central fountain in plaza ──────────────────────
      {
        const mFW = new THREE.MeshStandardMaterial({ color: 0x1e5070, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.75 });
        const mFJ = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.52 });
        const FZ  = -12;
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.58, 12), mStoneDec);
        basin.position.set(0, 0.29, FZ); scene.add(basin);
        const water = new THREE.Mesh(new THREE.CircleGeometry(1.9, 12), mFW);
        water.rotation.x = -Math.PI / 2; water.position.set(0, 0.60, FZ); scene.add(water);
        const cpil = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 1.3, 8), mStoneDec);
        cpil.position.set(0, 1.25, FZ); scene.add(cpil);
        const ubowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 0.22, 10), mStoneDec);
        ubowl.position.set(0, 2.0, FZ); scene.add(ubowl);
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.7, 5), mFJ);
        jet.position.set(0, 2.95, FZ); scene.add(jet);
        addWallAABB(0, FZ, 2.2, 2.2);
      }

      // Baseboard strip
      box(scene, 39.6, 0.22, 0.09, 0, 0.11, -21.75, _baseMat);
    }

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
    box(scene, 0.65, 0.75, 0.1,  3.5, 0.875, 45.5, M.desk);   // backrest
    // Wall locker on west side (guard equipment)
    box(scene, 1.1, 2.3, 0.45, -4.6, 1.15, 43.5, _frameMat);
    box(scene, 0.5, 2.2, 0.06, -4.6, 1.1,  43.27, _moldMat);  // locker door panel
    // Security schedule board
    box(scene, 2.2, 1.5, 0.08, -4.6, 2.8, 49.5, M.terminal);
    box(scene, 1.9, 1.2, 0.05, -4.6, 2.8, 49.45,
      new THREE.MeshStandardMaterial({ color: 0x001a33, emissive: 0x000d1a, emissiveIntensity: 0.4 }));
    // Coin cache — guards left their distraction coin stash on the table
    coinCache(scene, 3.5, 47.5, 3, 0.89);

    // Antique Pocket Watch — optional stealable left on the security room table
    { const watchMat  = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.18, metalness: 0.92 });
      const faceMat   = new THREE.MeshStandardMaterial({ color: 0xfffff5, roughness: 0.75, metalness: 0.0 });
      const pwatch = new THREE.Group();
      const watchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.024, 16), watchMat);
      const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.004, 16), faceMat);
      watchFace.position.y = 0.014; pwatch.add(watchBody); pwatch.add(watchFace);
      const watchCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.032, 8), watchMat);
      watchCrown.position.set(0, 0.028, 0.082); pwatch.add(watchCrown);
      pwatch.rotation.x = -Math.PI / 2;
      pwatch.position.set(-3, 0.915, 47);
      scene.add(pwatch);
      stealables.push({ mesh: pwatch, item: 'watch', x: -3, z: 47, taken: false, bonus: true, label: 'Antique Pocket Watch', value: 180000 });
      const wRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.36, 24),
        new THREE.MeshBasicMaterial({ color: 0xddaa44, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      wRing.rotation.x = -Math.PI / 2; wRing.position.set(-3, 0.02, 47); scene.add(wRing);
      pwatch.userData.floorRing = wRing; }

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
    paintingSpotlight(scene, -24.9, 3.8, 92, 'west');
    const paintMesh = box(scene, 0.05, 2.0, 2.8, -24.9, 3.8, 92, M.monaLisa);
    stealables.push({ mesh: paintMesh, item: 'painting', x: -24.9, z: 92, taken: false, value: 800000000 });
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

    // Velvet rope barrier around the Mona Lisa
    stanchion(scene, -21.2, 89.0);
    stanchion(scene, -21.2, 92.0);
    stanchion(scene, -21.2, 95.0);
    velvetRope(scene, -21.2, 89.0, -21.2, 92.0);
    velvetRope(scene, -21.2, 92.0, -21.2, 95.0);

    // Display cases
    displayCase(scene,  14, 70);
    displayCaseContents(scene,  14, 70, 'coins');
    displayCaseRopes(scene,  14, 70);
    displayCase(scene, -14, 70);
    displayCaseContents(scene, -14, 70, 'ring');
    displayCaseRopes(scene, -14, 70);
    displayCase(scene,   0, 88);
    displayCaseRopes(scene,   0, 88);

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
    stealables.push({ mesh: jadeFig, item: 'jade', x: 0, z: 88, taken: false, bonus: true, label: 'Jade Figurine', value: 2000000 });
    { const jRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.52, 24),
        new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      jRing.rotation.x = -Math.PI / 2; jRing.position.set(0, 0.96, 88); scene.add(jRing);
      jadeFig.userData.floorRing = jRing; }

    // Gold Chalice — optional stealable on a gallery pedestal
    { const chaliceMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, emissive: 0x6a4a00, emissiveIntensity: 0.18, roughness: 0.22, metalness: 0.90 });
      const chalice = new THREE.Group();
      const cup    = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.052, 0.16, 12), chaliceMat);
      cup.position.y = 0.18; chalice.add(cup);
      const stem   = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.10, 8), chaliceMat);
      stem.position.y = 0.07; chalice.add(stem);
      const base   = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.022, 12), chaliceMat);
      base.position.y = 0.011; chalice.add(base);
      const gem    = new THREE.Mesh(new THREE.OctahedronGeometry(0.024),
        new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xcc0000, emissiveIntensity: 0.6, roughness: 0.05 }));
      gem.position.set(0.055, 0.255, 0); chalice.add(gem);
      box(scene, 0.22, 0.85, 0.22, 8, 0.425, 96, M.pedestal);
      chalice.position.set(8, 1.00, 96);
      scene.add(chalice);
      stealables.push({ mesh: chalice, item: 'chalice', x: 8, z: 96, taken: false, bonus: true, label: 'Gold Chalice', value: 2800000 });
      const cRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      cRing.rotation.x = -Math.PI / 2; cRing.position.set(8, 0.02, 96); scene.add(cRing);
      chalice.userData.floorRing = cRing; }

    // Gallery decorative paintings
    wallPainting(scene, -24.9, 3.5, 70, M.paintings[0], true);
    paintingSpotlight(scene, -24.9, 3.5, 70, 'west');
    placard(scene, -24.9, 2.6, 70, 'Liberty Leading the People', 'Eugène Delacroix, 1830', true);
    wallPainting(scene,  24.9, 3.5, 80, M.paintings[1], false);
    paintingSpotlight(scene,  24.9, 3.5, 80, 'east');
    placard(scene,  24.9, 2.6, 80, 'The Raft of the Medusa', 'Théodore Géricault, 1818', false);
    wallPainting(scene,  24.9, 3.5, 60, M.paintings[2], false);
    paintingSpotlight(scene,  24.9, 3.5, 60, 'east');
    placard(scene,  24.9, 2.6, 60, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', false);
    wallPainting(scene,  24.9, 3.5, 92, M.harnoor, false);
    paintingSpotlight(scene,  24.9, 3.5, 92, 'east');
    placard(scene,  24.9, 2.6, 92, 'Dr. Harnoor Dhaliwal', 'Scott Scholars, UNO', false);

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
    paintingSpotlight(scene, -14, 3.5, 55.10, 'south');
    wallPaintingNS(scene,  14, 3.5, 55.10, M.paintings[4], true);
    paintingSpotlight(scene,  14, 3.5, 55.10, 'south');
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
    paintingSpotlight(scene, 49.9, 3.5, 71, 'east');
    wallPainting(scene, 49.9, 3.5, 83, M.paintings[1], false);
    paintingSpotlight(scene, 49.9, 3.5, 83, 'east');
    // Painting on south wall
    wallPaintingNS(scene, 38, 3.5, 67.10, M.paintings[2], true);
    paintingSpotlight(scene, 38, 3.5, 67.10, 'south');
    // Painting on north wall
    wallPaintingNS(scene, 38, 3.5, 86.90, M.paintings[3], false);
    paintingSpotlight(scene, 38, 3.5, 86.90, 'north');

    // Side-room rug (dark forest green with gold border)
    rug(scene, SAX, SAZ, 18, 14, 0x1a3a1a, 0xc8a040);

    // Display case with coin cache
    displayCase(scene, 42, 77);
    displayCaseContents(scene, 42, 77, 'gems');
    displayCaseRopes(scene, 42, 77);
    coinCache(scene, 42, 77, 4, 1.55);

    // Fabergé Egg — optional stealable on a pedestal in the east salon
    { const eggMat  = new THREE.MeshStandardMaterial({ color: 0xd4890a, emissive: 0x7a4400, emissiveIntensity: 0.22, roughness: 0.14, metalness: 0.88 });
      const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.98 });
      const egg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), eggMat);
      body.scale.y = 1.4; egg.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 24), bandMat);
      band.position.y = 0.02; egg.add(band);
      const topGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022),
        new THREE.MeshStandardMaterial({ color: 0x22ffaa, emissive: 0x00cc66, emissiveIntensity: 0.7, roughness: 0.05 }));
      topGem.position.y = 0.15; egg.add(topGem);
      box(scene, 0.22, 0.85, 0.22, 35, 0.425, 82, M.pedestal);
      egg.position.set(35, 1.06, 82);
      egg.userData.float = true;
      scene.add(egg);
      stealables.push({ mesh: egg, item: 'egg', x: 35, z: 82, taken: false, bonus: true, label: "Fabergé Egg", value: 12000000 });
      const eRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
        new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      eRing.rotation.x = -Math.PI / 2; eRing.position.set(35, 0.02, 82); scene.add(eRing);
      egg.userData.floorRing = eRing; }

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

    // ── Sculptures — multi-part forms on tiered pedestals ──
    const sMat1 = new THREE.MeshStandardMaterial({ color: 0xc8c0b4, roughness: 0.55, metalness: 0.06 });
    const sMat2 = new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.50, metalness: 0.08 });
    const sMat3 = new THREE.MeshStandardMaterial({ color: 0xc0b8ac, roughness: 0.52, metalness: 0.08 });
    const sMat4 = new THREE.MeshStandardMaterial({ color: 0x9898a8, roughness: 0.42, metalness: 0.22 });

    // Sculpture 1 — Classical Bust (torso → neck → head)
    box(scene, 1.35, 0.12, 1.35, -34, 0.06, 72, _baseMat);   // plinth lip
    box(scene, 1.0,  0.90, 1.0,  -34, 0.57, 72, M.pedestal); // pedestal, top=1.02
    { const g = new THREE.Group(); g.position.set(-34, 1.02, 72);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.30, 0.36, 10), sMat1);
      torso.position.y = 0.18; g.add(torso);
      const neck  = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.14, 8), sMat1);
      neck.position.y = 0.43; g.add(neck);
      const head  = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), sMat1);
      head.position.y = 0.67; g.add(head);
      g.castShadow = true; scene.add(g); }

    // Sculpture 2 — Greek Amphora (stacked cylinders for vase profile)
    box(scene, 1.35, 0.12, 1.35, -42, 0.06, 72, _baseMat);
    box(scene, 1.0,  1.10, 1.0,  -42, 0.61, 72, M.pedestal); // top=1.16
    { const g = new THREE.Group(); g.position.set(-42, 1.16, 72);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.06, 10), sMat2);
      foot.position.y = 0.03; g.add(foot);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.11, 0.28, 12), sMat2);
      body.position.y = 0.20; g.add(body);
      const shldr= new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.30, 0.20, 12), sMat2);
      shldr.position.y = 0.44; g.add(shldr);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 10), sMat2);
      neck.position.y = 0.62; g.add(neck);
      const rim  = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.05, 10), sMat2);
      rim.position.y = 0.73; g.add(rim);
      g.castShadow = true; scene.add(g); }

    // Sculpture 3 — Standing Figure (lower body → torso → shoulders → head)
    box(scene, 1.35, 0.12, 1.35, -34, 0.06, 82, _baseMat);
    box(scene, 1.0,  0.90, 1.0,  -34, 0.57, 82, M.pedestal); // top=1.02
    { const g = new THREE.Group(); g.position.set(-34, 1.02, 82);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.38, 8), sMat3);
      lower.position.y = 0.19; g.add(lower);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.32, 8), sMat3);
      torso.position.y = 0.54; g.add(torso);
      const shldr = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.16, 0.08, 8), sMat3);
      shldr.position.y = 0.74; g.add(shldr);
      const neck  = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.11, 8), sMat3);
      neck.position.y = 0.84; g.add(neck);
      const head  = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), sMat3);
      head.position.y = 1.04; g.add(head);
      g.castShadow = true; scene.add(g); }

    // Sculpture 4 — Obelisk (square shaft + pyramid cap)
    box(scene, 1.35, 0.12, 1.35, -42, 0.06, 82, _baseMat);
    box(scene, 1.0,  1.00, 1.0,  -42, 0.56, 82, M.pedestal); // top=1.06
    { const g = new THREE.Group(); g.position.set(-42, 1.06, 82);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), sMat4);
      shaft.position.y = 0.36; g.add(shaft);
      const tip   = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.13, 0.28, 4), sMat4);
      tip.position.y = 0.86; g.add(tip);
      g.castShadow = true; scene.add(g); }

    // Coin cache on a small table
    box(scene, 1.4, 0.7, 0.9, -46, 0.35, 77, M.desk);
    coinCache(scene, -46, 77, 3, 1.05);

    // Paintings on west wall — Monet as bonus stealable at z=77 (landscape, wider canvas)
    wallPainting(scene, -49.9, 3.5, 72, M.paintings[2], true);
    paintingSpotlight(scene, -49.9, 3.5, 72, 'west');
    wallPainting(scene, -49.9, 3.5, 82, M.paintings[3], true);
    paintingSpotlight(scene, -49.9, 3.5, 82, 'west');
    // Les Nymphéas — Monet bonus stealable, centred between the two decorative paintings
    wallPainting(scene, -49.9, 3.5, 77, M.monet, true);
    paintingSpotlight(scene, -49.9, 3.5, 77, 'west');
    const monetMesh = box(scene, 0.05, 1.4, 2.1, -49.75, 3.5, 77, M.monet);
    stealables.push({ mesh: monetMesh, item: 'monet', x: -49.9, z: 77, taken: false, bonus: true, label: 'Les Nymphéas', value: 40000000 });
    { const mRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.05, 32),
        new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      mRing.rotation.x = -Math.PI / 2; mRing.position.set(-49.5, 0.02, 77); scene.add(mRing);
      monetMesh.userData.floorRing = mRing; }
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
    box(scene, 0.65, 0.3, 0.38, -4.65, 2.75, 108.2, M.terminal); // small crate on top
    box(scene, 0.55, 0.28, 0.38, -4.65, 2.74, 106.8, M.terminal);
    // Utility table on east side
    box(scene, 1.8, 0.75, 1.0, 3.5, 0.375, 109, M.desk);
    box(scene, 0.55, 0.22, 0.35, 3.5, 0.86, 109, M.terminal);    // item on table
    // Coin cache — maintenance crew left spare coins
    coinCache(scene, 3.5, 109, 2, 0.89);

    // ════════════════════════════════
    //  CROWN VAULT  cx=0  cz=137.5  50×45
    // ════════════════════════════════
    // Skip south and north walls — add stubs manually so corridor/exit connect properly
    roomWalls(scene, 0, 137.5, 50, 45, { south: true, north: true });

    // Crown Vault floor overlay — dark obsidian with gold veining (over standard marble)
    {
      const vaultTex = makeVaultFloorTex();
      vaultTex.repeat.set(50 / 4, 45 / 4);
      const vaultFloorMat = new THREE.MeshStandardMaterial({
        map: vaultTex, color: 0x1a1408, roughness: 0.10, metalness: 0.06,
      });
      const vaultFloor = new THREE.Mesh(new THREE.BoxGeometry(50, 0.018, 45), vaultFloorMat);
      vaultFloor.position.set(0, 0.003, 137.5);
      vaultFloor.receiveShadow = true;
      scene.add(vaultFloor);
    }

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

    // Crown on tiered pedestal
    box(scene, 2.2, 0.26, 2.2, 0, 0.13, 140, _baseMat);   // lowest tier
    box(scene, 1.8, 0.22, 1.8, 0, 0.37, 140, _moldMat);   // second tier
    box(scene, 1.4, 0.50, 1.4, 0, 0.75, 140, M.pedestal); // top column, top=1.00
    const crownMesh = box(scene, 0.8, 0.6, 0.8, 0, 1.5, 140, M.crown);
    crownMesh.userData.float = true;
    stealables.push({ mesh: crownMesh, item: 'crown', x: 0, z: 140, taken: false, needsSafe: true, safeCracked: false, value: 250000000 });
    { const cRing = new THREE.Mesh(new THREE.RingGeometry(0.80, 1.28, 36),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
      cRing.rotation.x = -Math.PI / 2; cRing.position.set(0, 0.02, 140); scene.add(cRing);
      crownMesh.userData.floorRing = cRing; }

    // Velvet rope barrier around the Crown pedestal
    stanchion(scene, -3.8, 136.5);
    stanchion(scene,  3.8, 136.5);
    stanchion(scene, -3.8, 143.5);
    stanchion(scene,  3.8, 143.5);
    velvetRope(scene, -3.8, 136.5,  3.8, 136.5);
    velvetRope(scene, -3.8, 143.5,  3.8, 143.5);
    velvetRope(scene, -3.8, 136.5, -3.8, 143.5);
    velvetRope(scene,  3.8, 136.5,  3.8, 143.5);

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
    stealables.push({ mesh: scepter, item: 'scepter', x: -9, z: 135, taken: false, bonus: true, label: 'Royal Scepter', value: 5000000 });
    { const sRing = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.60, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      sRing.rotation.x = -Math.PI / 2; sRing.position.set(-9, 0.02, 135); scene.add(sRing);
      scepter.userData.floorRing = sRing; }

    // Ivory Figurine — optional stealable on a pedestal opposite the scepter
    { const ivoryMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, emissive: 0x998855, emissiveIntensity: 0.06, roughness: 0.55, metalness: 0.05 });
      const ivFig = new THREE.Group();
      const ivBase = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.07, 10), ivoryMat);
      const ivBody = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.10, 0.22, 10), ivoryMat);
      ivBody.position.y = 0.145; ivFig.add(ivBase); ivFig.add(ivBody);
      const ivHead = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), ivoryMat);
      ivHead.position.y = 0.30; ivFig.add(ivHead);
      const ivArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6), ivoryMat);
      ivArm.rotation.z = 0.6; ivArm.position.set(0.09, 0.21, 0); ivFig.add(ivArm);
      box(scene, 0.22, 0.85, 0.22, 9, 0.425, 135, M.pedestal);
      ivFig.position.set(9, 1.00, 135);
      scene.add(ivFig);
      stealables.push({ mesh: ivFig, item: 'ivory', x: 9, z: 135, taken: false, bonus: true, label: 'Ivory Figurine', value: 1800000 });
      const iRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.50, 24),
        new THREE.MeshBasicMaterial({ color: 0xf0e8c0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      iRing.rotation.x = -Math.PI / 2; iRing.position.set(9, 0.02, 135); scene.add(iRing);
      ivFig.userData.floorRing = iRing; }

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
    paintingSpotlight(scene, -24.9, 3.5, 125, 'west');
    placard(scene, -24.9, 2.6, 125, 'Liberty Leading the People', 'Eugène Delacroix, 1830', true);
    wallPainting(scene, -24.9, 3.5, 150, M.paintings[1], true);
    paintingSpotlight(scene, -24.9, 3.5, 150, 'west');
    placard(scene, -24.9, 2.6, 150, 'The Raft of the Medusa', 'Théodore Géricault, 1818', true);
    wallPainting(scene,  24.9, 3.5, 130, M.paintings[2], false);
    paintingSpotlight(scene,  24.9, 3.5, 130, 'east');
    placard(scene,  24.9, 2.6, 130, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', false);
    wallPainting(scene,  24.9, 3.5, 155, M.paintings[3], false);
    paintingSpotlight(scene,  24.9, 3.5, 155, 'east');
    placard(scene,  24.9, 2.6, 155, 'Oath of the Horatii', 'Jacques-Louis David, 1784', false);
    wallSconce(scene, -24.75, 2.9, 125,  1);
    wallSconce(scene, -24.75, 2.9, 150,  1);
    wallSconce(scene,  24.75, 2.9, 130, -1);
    wallSconce(scene,  24.75, 2.9, 155, -1);

    // Crown Vault pillars — gilded (gold accents match obsidian floor)
    [-12, 12].forEach(px => {
      gildedPillar(scene, px, 127);
      gildedPillar(scene, px, 152);
    });

    // Crown Vault ceiling mural — dark arabesque panels just below ceiling
    {
      const muralTex = makeVaultMuralTex();
      muralTex.repeat.set(3.2, 2.8);
      const muralMat = new THREE.MeshStandardMaterial({
        map: muralTex, color: 0x1a1408,
        emissive: 0xc89010, emissiveMap: muralTex, emissiveIntensity: 0.18,
        roughness: 0.90, metalness: 0.0,
      });
      const mural = new THREE.Mesh(new THREE.BoxGeometry(49, 0.014, 44), muralMat);
      mural.position.set(0, WALL_H - 0.022, 137.5);
      scene.add(mural);
    }

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
      // Central stone walkway (lighter paving, Z 165→215)
      const mWalkway = new THREE.MeshStandardMaterial({ color: 0xd0c8b4, roughness: 0.84, metalness: 0.0 });
      box(scene, 14, 0.29, 50, 0, -0.135, 189, mWalkway);
      // Horizontal accent bands across full courtyard width
      box(scene, COURT_W*2, 0.29, 1.2, 0, -0.135, 175, mWalkway);
      box(scene, COURT_W*2, 0.29, 1.2, 0, -0.135, 200, mWalkway);
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
        const dx=b2[0]-b1[0], dz=b2[2]-b1[2];
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

      // ── Reflecting pools (rectangular, flanking central path) ──
      const mPoolEdge = new THREE.MeshStandardMaterial({ color: 0x989080, roughness: 0.88, metalness: 0.0 });
      // Left pool — stone surround + water surface
      box(scene, 22, 0.55, 28, -26, 0.275, 186, mPoolEdge);
      box(scene, 18, 0.18, 24, -26, 0.62,  186, mWater);
      // Right pool
      box(scene, 22, 0.55, 28,  26, 0.275, 186, mPoolEdge);
      box(scene, 18, 0.18, 24,  26, 0.62,  186, mWater);
      // Fountain jets (translucent cylinders)
      const mJet = new THREE.MeshBasicMaterial({ color: 0xb8e0ff, transparent: true, opacity: 0.5 });
      [-33, -26, -19].forEach(jx => {
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 2.4, 5), mJet);
        jet.position.set(jx, 1.9, 186); scene.add(jet);
      });
      [19, 26, 33].forEach(jx => {
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 2.4, 5), mJet);
        jet.position.set(jx, 1.9, 186); scene.add(jet);
      });

      // ── Pyramid base / entrance structure ─────────────
      // Raised stone plaza around pyramid base
      box(scene, PB*2+8, 0.65, PB*2+8, PX, 0.325, PZ, mPool);
      box(scene, PB*2+5, 0.38, PB*2+5, PX, 0.84,  PZ, mPool);
      // Metallic entrance building at south face of pyramid
      const mMetal = new THREE.MeshStandardMaterial({ color: 0x505860, roughness: 0.3, metalness: 0.75 });
      const mEntGlass = new THREE.MeshBasicMaterial({ color: 0x6090b0, transparent: true, opacity: 0.55 });
      box(scene, 9, 2.2, 4.5, PX, 1.1 + 1.1, PZ - PB - 1.5, mMetal);   // body
      box(scene, 7, 1.8, 0.12, PX, 1.1 + 0.9, PZ - PB - 3.7, mEntGlass); // glass south face
      box(scene, 9.4, 0.22, 4.9, PX, 1.1 + 2.2, PZ - PB - 1.5, mMetal); // roof cap

      // ── Winged Victory of Samothrace (simplified sculpture) ──
      {
        const mMarble = new THREE.MeshStandardMaterial({ color: 0xcdc8bc, roughness: 0.62, metalness: 0.0 });
        const sX = -28, sZ = 193;
        // Pedestal
        box(scene, 3.4, 0.4, 3.4, sX, 0.2,  sZ, mPool);
        box(scene, 2.6, 4.0, 2.2, sX, 2.4,  sZ, mPool);
        box(scene, 3.0, 0.3, 2.6, sX, 4.55, sZ, mPool);
        // Torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.52, 2.2, 6), mMarble);
        torso.position.set(sX, 5.75, sZ); scene.add(torso);
        // Head stump
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), mMarble);
        head.position.set(sX, 7.1, sZ); scene.add(head);
        // Wings (angled flat slabs)
        const wGeo = new THREE.BoxGeometry(2.6, 0.1, 1.6);
        const wL = new THREE.Mesh(wGeo, mMarble); wL.position.set(sX-1.1, 6.3, sZ); wL.rotation.z =  0.42; scene.add(wL);
        const wR = new THREE.Mesh(wGeo, mMarble); wR.position.set(sX+1.1, 6.3, sZ); wR.rotation.z = -0.42; scene.add(wR);
        // Ground spotlight disc
        const spotDisc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 12),
          new THREE.MeshBasicMaterial({ color: 0xfff0cc, transparent: true, opacity: 0.35 }));
        spotDisc.rotation.x = -Math.PI / 2; spotDisc.position.set(sX, 0.02, sZ); scene.add(spotDisc);
      }

      // ── Lampposts along courtyard (emissive only — no PointLights) ───
      {
        const poleM = new THREE.MeshStandardMaterial({ color: 0x1a1810, roughness: 0.5, metalness: 0.6 });
        const glowM = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffe880, emissiveIntensity: 2.5, roughness: 0.2 });
        function lamppost2(lx, lz) {
          box(scene, 0.14, 6.5, 0.14, lx, 3.25, lz, poleM);
          box(scene, 0.1, 0.1, 1.0, lx, 6.5, lz + 0.4, poleM);  // short arm
          const globe = new THREE.Mesh(new THREE.SphereGeometry(0.38, 7, 5), glowM);
          globe.position.set(lx, 6.8, lz + 0.4); scene.add(globe);
        }
        // Outer perimeter along wing walls
        for (let lz = 170; lz <= 244; lz += 12) {
          lamppost2(-COURT_W+2, lz);
          lamppost2( COURT_W-2, lz);
        }
        // Along central walkway edges
        for (let lz = 170; lz <= 212; lz += 14) {
          lamppost2(-8, lz);
          lamppost2( 8, lz);
        }
        // Flanking pyramid plaza
        [[PX-20,PZ-18],[PX+20,PZ-18],[PX+20,PZ+18],[PX-20,PZ+18]].forEach(([lx,lz]) => lamppost2(lx,lz));
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

    // ── Vent shaft grates ─────────────────────────────────────────────────────
    // Two maintenance-tunnel shortcuts that only crouching players can use.
    const grateM = new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.88, metalness: 0.55 });
    const grateBarM = new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.90, metalness: 0.45 });
    function makeVentGrate(x, z) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 1.1), grateM);
      base.receiveShadow = true;
      g.add(base);
      // Cross-hatch bars
      for (let i = -2; i <= 2; i++) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.055, 0.06), grateBarM);
        hBar.position.set(0, 0.04, i * 0.20);
        g.add(hBar);
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 1.05), grateBarM);
        vBar.position.set(i * 0.20, 0.04, 0);
        g.add(vBar);
      }
      // Gold trim
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.04, 1.14), _brassM);
      trim.position.y = -0.015;
      g.add(trim);
      g.position.set(x, 0.035, z);
      scene.add(g);
    }

    // Vent 1: Lobby (z=34) → Gallery (z=60)  — west side, bypasses Corridor 1
    makeVentGrate(-14, 34);
    makeVentGrate(-14, 60);
    vents.push({ entryX: -14, entryZ: 34, exitX: -14, exitZ: 60 });

    // Vent 2: Gallery (z=96) → Crown Vault (z=118) — east side, bypasses Corridor 2
    makeVentGrate(14, 96);
    makeVentGrate(14, 118);
    vents.push({ entryX: 14, entryZ: 96, exitX: 14, exitZ: 118 });

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
      vents,
    };
  }

  return { init };

}());
