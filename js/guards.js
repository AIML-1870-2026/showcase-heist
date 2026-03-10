'use strict';
// ── guards.js ──────────────────────────────────────────────
// Guard AI: patrol routes, vision cones, state machine, alarm levels.
// Exposes: window.Guards

window.Guards = (function () {

  // ── Constants ──────────────────────────────────────────
  const LOD_CONE_DIST2 = 45 * 45;  // hide vision cone beyond 45 units (fog fully opaque at 75)
  const VISION_ANGLE  = Math.PI / 2.2;  // ~82° total — wider cone, guards feel more present
  const SUSP_TIME     = 3.0;           // seconds suspicious before giving up
  const SEARCH_TIME   = 5.0;           // seconds searching before giving up
  const CATCH_DIST    = 1.0;           // distance to "catch" player

  // ── Navigation grid constants (A* pathfinding) ─────────
  const NAV_CELL  = 2.5;   // world units per cell
  const NAV_COLS  = 20;    // X: -25 to 25 → 50 / 2.5 = 20 cols
  const NAV_ROWS  = 66;    // Z:   0 to 165 → 165 / 2.5 = 66 rows
  const NAV_CLEAR = 0.6;   // expand walls by this much for guard clearance
  const NAV_X0    = -25;   // world X at column 0
  const NAV_Z0    = 0;     // world Z at row 0

  // ── Difficulty-scaled values (let so setDifficulty can mutate) ──
  let BASE_SPEED   = 3.5;
  let VISION_RANGE = 8;
  let DETECT_TIME  = 1.5;

  const _DIFF = {
    easy:    { BASE_SPEED: 2.8, VISION_RANGE: 7,  DETECT_TIME: 2.5 },
    normal:  { BASE_SPEED: 3.5, VISION_RANGE: 11, DETECT_TIME: 1.5 },
    hard:    { BASE_SPEED: 4.8, VISION_RANGE: 14, DETECT_TIME: 0.8 },
    noguard: { BASE_SPEED: 0,   VISION_RANGE: 0,  DETECT_TIME: 999 },
  };

  let _noGuardMode = false;

  function setDifficulty(d) {
    _noGuardMode = (d === 'noguard');
    const p = _DIFF[d] || _DIFF.normal;
    BASE_SPEED   = p.BASE_SPEED;
    VISION_RANGE = p.VISION_RANGE;
    DETECT_TIME  = p.DETECT_TIME;
    // Hide all guard meshes in no-guard mode
    guards.forEach(gr => {
      if (gr.mesh) gr.mesh.visible = !_noGuardMode;
    });
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
  let _navGrid   = null;              // Uint8Array: 0=open, 1=blocked
  const _tmpVec3 = new THREE.Vector3(); // scratch vector to avoid per-frame allocation

  // ── Materials ──────────────────────────────────────────
  const MAT_BODY    = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.85, metalness: 0.05 });
  const MAT_HEAD    = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.9,  metalness: 0.0  });
  const MAT_CONE    = {
    patrol:    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.13, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    suspicious:new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    alerted:   new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.32, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    searching: new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  // Tight hotspot beam at center of cone (brighter, narrower)
  const MAT_BEAM    = {
    patrol:    new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    suspicious:new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    alerted:   new THREE.MeshBasicMaterial({ color: 0xff8866, transparent: true, opacity: 0.38, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    searching: new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.24, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  };

  // ── Vision-cone geometry ───────────────────────────────
  function _buildConeGeo(halfAngle, range, yOff) {
    const SEGS  = 14;
    const verts = [0, yOff, 0];
    for (let i = 0; i <= SEGS; i++) {
      const a = -halfAngle + (i / SEGS) * halfAngle * 2;
      verts.push(Math.sin(a) * range, yOff, Math.cos(a) * range);
    }
    const indices = [];
    for (let i = 0; i < SEGS; i++) indices.push(0, i + 1, i + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    return geo;
  }

  function buildConeMesh(scene) {
    const mesh = new THREE.Mesh(_buildConeGeo(VISION_ANGLE / 2, VISION_RANGE, 0.05), MAT_CONE.patrol);
    scene.add(mesh);
    return mesh;
  }

  function buildBeamMesh(scene) {
    // Narrower (1/3 angle), shorter range — creates a bright hotspot at center
    const mesh = new THREE.Mesh(_buildConeGeo(VISION_ANGLE / 6, VISION_RANGE * 0.6, 0.06), MAT_BEAM.patrol);
    scene.add(mesh);
    return mesh;
  }

  // ── Guard body mesh (female) ────────────────────────────
  // Randomise hair + skin colours per guard for variety
  const _GUARD_HAIR_COLORS = [0x1a0c04, 0x3d1a08, 0x0a0604, 0xcb9b40, 0x7a3c1a];
  const _GUARD_SKIN_COLORS = [0xf5d8c0, 0xd4a07a, 0xc48050, 0x7a4a2a, 0x3b1f0f, 0xb07050];
  let _guardHairIdx = 0;

  function buildGuardMesh(scene) {
    const g = new THREE.Group();
    const matVest   = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.78, metalness: 0.08 });
    const matStrap  = new THREE.MeshStandardMaterial({ color: 0x252530, roughness: 0.88, metalness: 0.08 });
    const matBoot   = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.50, metalness: 0.30 });
    const matGlove  = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.55, metalness: 0.20 });
    const matPatch  = new THREE.MeshStandardMaterial({ color: 0xdde0e8, roughness: 0.80, metalness: 0.0  });
    const matMetal  = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.45, metalness: 0.75 });
    const matBelt   = new THREE.MeshStandardMaterial({ color: 0x1e1e28, roughness: 0.70, metalness: 0.15 });
    const _gIdx     = _guardHairIdx++;
    const matHair   = new THREE.MeshStandardMaterial({ color: _GUARD_HAIR_COLORS[_gIdx % _GUARD_HAIR_COLORS.length], roughness: 0.92, metalness: 0.0 });
    const matBand   = new THREE.MeshStandardMaterial({ color: 0x1a1a28, roughness: 0.80, metalness: 0.10 });
    const matSkin   = new THREE.MeshStandardMaterial({ color: _GUARD_SKIN_COLORS[_gIdx % _GUARD_SKIN_COLORS.length], roughness: 0.88, metalness: 0.0 });

    // ── Legs (slightly wider hips for feminine silhouette) ──
    const legPivots = [-0.15, 0.15].map(xOff => {
      const pivot = new THREE.Group();
      pivot.position.set(xOff, 0.88, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.098, 0.50, 7), MAT_BODY);
      thigh.position.y = -0.25; thigh.castShadow = true;
      pivot.add(thigh);

      // Knee pad (box, not sphere)
      const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.10), matVest);
      kneePad.position.set(0, -0.50, -0.02);
      pivot.add(kneePad);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.40, 7), MAT_BODY);
      shin.position.y = -0.70; shin.castShadow = true;
      pivot.add(shin);

      // Tall boot (shaft wraps lower shin + foot)
      const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.22, 7), matBoot);
      bootShaft.position.y = -0.82; bootShaft.castShadow = true;
      pivot.add(bootShaft);
      const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.33), matBoot);
      bootFoot.position.set(0, -0.94, -0.06); bootFoot.castShadow = true;
      pivot.add(bootFoot);

      g.add(pivot);
      return pivot;
    });
    g.userData.leftLeg  = legPivots[0];
    g.userData.rightLeg = legPivots[1];

    // ── Torso (narrower waist, feminine proportions) ────
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.62, 8), MAT_BODY);
    body.position.y = 1.15; body.castShadow = true;
    g.add(body);
    g.userData.bodyMesh = body;

    // Tactical vest (front plate)
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.52, 0.08), matVest);
    vest.position.set(0, 1.18, -0.23);
    g.add(vest);
    // Vest "LOUVRE SÉCURITÉ" name patch
    const namePatch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.025), matPatch);
    namePatch.position.set(0, 1.15, -0.268);
    g.add(namePatch);
    // Vest top strap / collar
    const vestTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), matStrap);
    vestTop.position.set(0, 1.46, -0.22);
    g.add(vestTop);
    // Vest horizontal straps
    [1.30, 1.10].forEach(y => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.026, 0.09), matStrap);
      s.position.set(0, y, -0.21);
      g.add(s);
    });
    // Walkie-talkie on left shoulder
    const radioBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.05), matVest);
    radioBody.position.set(0.24, 1.40, -0.18);
    g.add(radioBody);
    const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.10, 5), matMetal);
    radioAnt.position.set(0.24, 1.51, -0.18);
    g.add(radioAnt);

    // Tactical belt + pouches
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.228, 0.055, 8), matBelt);
    belt.position.y = 0.855;
    g.add(belt);
    [-0.16, 0.16].forEach(xOff => {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.07), matVest);
      pouch.position.set(xOff, 0.855, -0.19);
      g.add(pouch);
    });

    // ── Arms (slightly slimmer) ─────────────────────────
    const armPivots = [-0.30, 0.30].map(xOff => {
      const pivot = new THREE.Group();
      pivot.position.set(xOff, 1.42, 0);

      // Shoulder armor pad
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.13), matVest);
      shoulder.position.set(0, -0.04, 0);
      pivot.add(shoulder);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.070, 0.36, 7), MAT_BODY);
      upper.position.y = -0.20; upper.castShadow = true;
      pivot.add(upper);

      // Elbow pad
      const elbowPad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.10), matVest);
      elbowPad.position.set(0, -0.38, 0.01);
      pivot.add(elbowPad);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.32, 7), MAT_BODY);
      fore.position.y = -0.55; fore.castShadow = true;
      pivot.add(fore);

      // Box glove
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.12), matGlove);
      glove.position.set(0, -0.73, -0.01);
      pivot.add(glove);

      g.add(pivot);
      return pivot;
    });
    g.userData.leftArm  = armPivots[0];
    g.userData.rightArm = armPivots[1];

    // Pistol in right hand
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.14), matMetal);
    gunBody.position.set(0, -0.73, -0.08);
    armPivots[1].add(gunBody);
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 5), matMetal);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, -0.70, -0.17);
    armPivots[1].add(gunBarrel);

    // ── Neck ───────────────────────────────────────────
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 7), matSkin);
    neck.position.y = 1.53;
    g.add(neck);

    // ── Head ────────────────────────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 7, 5), matSkin);
    head.position.set(0, 1.70, -0.02);
    head.castShadow = true;
    g.add(head);

    // ── Hair — alternating ponytail / bun based on index ──
    const hairIdx = _gIdx % 2; // alternates 0/1 per guard
    if (hairIdx === 0) {
      // Ponytail style
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.060, 0.28, 6), matHair);
      upper.position.set(0, 1.82, 0.22); upper.rotation.x = 0.38; g.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.020, 0.26, 5), matHair);
      lower.position.set(0, 1.58, 0.40); lower.rotation.x = 0.65; g.add(lower);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.014, 5, 10), matBand);
      band.position.set(0, 1.70, 0.32); band.rotation.x = Math.PI / 2 + 0.40; g.add(band);
      // Hair cap over head
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.258, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.48), matHair);
      cap.position.set(0, 1.70, -0.02); g.add(cap);
    } else {
      // Bun style — two buns on top
      [-0.18, 0.18].forEach(xOff => {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.088, 8, 6), matHair);
        bun.position.set(xOff, 1.96, 0.0); bun.scale.set(1, 0.85, 1); g.add(bun);
      });
      // Hair cap over head
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.258, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.48), matHair);
      cap.position.set(0, 1.70, -0.02); g.add(cap);
    }

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

  // ── Navigation grid + A* pathfinding ───────────────────

  function worldToCell(wx, wz) {
    return {
      col: Math.floor((wx - NAV_X0) / NAV_CELL),
      row: Math.floor((wz - NAV_Z0) / NAV_CELL),
    };
  }

  function cellToWorld(col, row) {
    return {
      x: NAV_X0 + col * NAV_CELL + NAV_CELL * 0.5,
      z: NAV_Z0 + row * NAV_CELL + NAV_CELL * 0.5,
    };
  }

  function buildNavGrid() {
    const walls = window.G ? window.G.walls : [];
    _navGrid = new Uint8Array(NAV_COLS * NAV_ROWS); // default 0 = open
    for (const w of walls) {
      const exMinX = w.minX - NAV_CLEAR;
      const exMaxX = w.maxX + NAV_CLEAR;
      const exMinZ = w.minZ - NAV_CLEAR;
      const exMaxZ = w.maxZ + NAV_CLEAR;
      const cMinCol = Math.max(0, Math.floor((exMinX - NAV_X0) / NAV_CELL));
      const cMaxCol = Math.min(NAV_COLS - 1, Math.ceil((exMaxX - NAV_X0) / NAV_CELL));
      const cMinRow = Math.max(0, Math.floor((exMinZ - NAV_Z0) / NAV_CELL));
      const cMaxRow = Math.min(NAV_ROWS - 1, Math.ceil((exMaxZ - NAV_Z0) / NAV_CELL));
      for (let r = cMinRow; r <= cMaxRow; r++) {
        for (let c = cMinCol; c <= cMaxCol; c++) {
          _navGrid[r * NAV_COLS + c] = 1;
        }
      }
    }
  }

  // Simple min-heap for A* open set
  function _heapPush(heap, node) {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].f <= heap[i].f) break;
      const tmp = heap[parent]; heap[parent] = heap[i]; heap[i] = tmp;
      i = parent;
    }
  }

  function _heapPop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r < heap.length && heap[r].f < heap[s].f) s = r;
        if (s === i) break;
        const tmp = heap[s]; heap[s] = heap[i]; heap[i] = tmp;
        i = s;
      }
    }
    return top;
  }

  // Returns array of {x, z} world waypoints from (sx,sz) to (ex,ez), or null if none.
  function astar(sx, sz, ex, ez) {
    if (!_navGrid) return null;

    let { col: sc, row: sr } = worldToCell(sx, sz);
    let { col: ec, row: er } = worldToCell(ex, ez);

    // Clamp to grid bounds
    sc = Math.max(0, Math.min(NAV_COLS - 1, sc));
    sr = Math.max(0, Math.min(NAV_ROWS - 1, sr));
    ec = Math.max(0, Math.min(NAV_COLS - 1, ec));
    er = Math.max(0, Math.min(NAV_ROWS - 1, er));

    // If goal cell is blocked, search nearby for open fallback
    if (_navGrid[er * NAV_COLS + ec] === 1) {
      let found = false;
      outer: for (let radius = 1; radius <= 3; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = er + dr, nc = ec + dc;
            if (nr < 0 || nr >= NAV_ROWS || nc < 0 || nc >= NAV_COLS) continue;
            if (_navGrid[nr * NAV_COLS + nc] === 0) {
              er = nr; ec = nc; found = true; break outer;
            }
          }
        }
      }
      if (!found) return null;
    }

    // If start equals goal, nothing to do
    if (sc === ec && sr === er) return [];

    const closed   = new Uint8Array(NAV_COLS * NAV_ROWS);
    const parents  = new Int32Array(NAV_COLS * NAV_ROWS).fill(-1);
    const heap     = [];
    const DIRS     = [
      [-1,-1,Math.SQRT2],[0,-1,1],[1,-1,Math.SQRT2],
      [-1, 0,1],                  [1, 0,1],
      [-1, 1,Math.SQRT2],[0, 1,1],[1, 1,Math.SQRT2],
    ];

    const heur = (c, r) => Math.sqrt((c-ec)*(c-ec)+(r-er)*(r-er));
    _heapPush(heap, { col: sc, row: sr, g: 0, f: heur(sc, sr), parentIdx: -1 });

    let expansions = 0;
    while (heap.length > 0 && expansions < NAV_COLS * NAV_ROWS) {
      const cur = _heapPop(heap);
      const idx = cur.row * NAV_COLS + cur.col;
      if (closed[idx]) continue;
      closed[idx]   = 1;
      parents[idx]  = cur.parentIdx >= 0 ? cur.parentIdx : idx;
      expansions++;

      if (cur.col === ec && cur.row === er) {
        // Reconstruct path
        const path = [];
        let ci = idx;
        while (ci !== parents[ci]) {
          const c = ci % NAV_COLS, r = Math.floor(ci / NAV_COLS);
          path.push(cellToWorld(c, r));
          ci = parents[ci];
        }
        path.reverse();
        return path;
      }

      for (const [dc, dr, cost] of DIRS) {
        const nc = cur.col + dc, nr = cur.row + dr;
        if (nc < 0 || nc >= NAV_COLS || nr < 0 || nr >= NAV_ROWS) continue;
        const ni = nr * NAV_COLS + nc;
        if (closed[ni] || _navGrid[ni] === 1) continue;
        const g = cur.g + cost;
        _heapPush(heap, { col: nc, row: nr, g, f: g + heur(nc, nr), parentIdx: idx });
      }
    }
    return null; // no path found
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
      this._subduedTimer = 0;

      this.pos        = new THREE.Vector3(data.spawnX, 0, data.spawnZ);
      this.facing     = new THREE.Vector3(0, 0, 1);
      this.smoothYaw  = 0;   // lerped rotation for smooth turning

      this._lastSaw     = false;   // cached vision result, updated on this guard's vision frame
      this._wasClose    = false;   // true once detectT exceeded 45% of DETECT_TIME this pass
      this._walkT       = 0;       // walk animation accumulator
      this._searchPhase = 'move';  // 'move' | 'look' — investigation sub-state
      this._lookT       = 0;       // time spent in look-around phase
      this._lookYawBase = 0;       // facing angle when look phase started
      this._path        = [];      // A* waypoints [{x,z}, ...]
      this._pathIdx     = 0;       // current waypoint index
      this._pathTimer   = 0;       // countdown until next path recompute

      this.mesh     = buildGuardMesh(scene);
      this.coneMesh = buildConeMesh(scene);
      this.beamMesh = buildBeamMesh(scene);
      this.detectBar  = this.mesh.userData.detectBar;
      this.detectFill = this.mesh.userData.detectFill;
      this._body      = this.mesh.userData.bodyMesh;
      this._leftLeg   = this.mesh.userData.leftLeg;
      this._rightLeg  = this.mesh.userData.rightLeg;
      this._leftArm   = this.mesh.userData.leftArm;
      this._rightArm  = this.mesh.userData.rightArm;

      this.mesh.position.copy(this.pos);

      this._flash       = null;
      this._flashTarget = null;

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

    requestPath(targetX, targetZ) {
      const result = astar(this.pos.x, this.pos.z, targetX, targetZ);
      this._path    = result || [];
      this._pathIdx = 0;
    }

    // Follow A* path; returns true when fully arrived. Returns false if no path.
    followPath(dt) {
      if (this._path.length === 0 || this._pathIdx >= this._path.length) return false;
      const wp = this._path[this._pathIdx];
      _tmpVec3.set(wp.x, 0, wp.z);
      if (this.moveTo(_tmpVec3, dt)) {
        this._pathIdx++;
        if (this._pathIdx >= this._path.length) return true;
      }
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

      // Smoke cloud — player invisible when inside active cloud
      const clouds = window.G && window.G._smokeClouds;
      if (clouds && clouds.length) {
        for (const c of clouds) {
          const sdx = playerPos.x - c.x, sdz = playerPos.z - c.z;
          if (sdx * sdx + sdz * sdz < c.r * c.r) return false;
        }
      }

      // Wall occlusion — blocked if a wall AABB intersects the sight line
      return hasLineOfSight(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
    }

    facingAngle() {
      return Math.atan2(this.facing.x, this.facing.z);
    }

    updateCone(playerPos) {
      const dx = playerPos.x - this.pos.x;
      const dz = playerPos.z - this.pos.z;
      const tooFar = dx * dx + dz * dz > LOD_CONE_DIST2;
      this.coneMesh.visible = !tooFar;
      this.beamMesh.visible = !tooFar;
      if (tooFar) return;
      // Use smoothYaw so cone matches the body's visual rotation, not the raw facing vector
      this.coneMesh.position.set(this.pos.x, 0, this.pos.z);
      this.coneMesh.rotation.y = this.smoothYaw;
      this.coneMesh.material   = MAT_CONE[this.state] || MAT_CONE.patrol;
      this.beamMesh.position.set(this.pos.x, 0, this.pos.z);
      this.beamMesh.rotation.y = this.smoothYaw;
      this.beamMesh.material   = MAT_BEAM[this.state] || MAT_BEAM.patrol;
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

        case 'subdued': {
          this._subduedTimer -= dt;
          if (this._subduedTimer <= 0) this._wakeUp();
          // Sync mesh position (guard stays flat at last pos)
          this.mesh.position.x = this.pos.x;
          this.mesh.position.z = this.pos.z;
          return; // skip all other update logic
        }

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
          // Chase player using A* pathfinding; recompute path every 0.5s
          this.lastKnown.copy(playerPos);
          this._pathTimer -= dt;
          if (this._pathTimer <= 0) {
            this.requestPath(playerPos.x, playerPos.z);
            this._pathTimer = 0.5;
          }
          const followed = this.followPath(dt);
          if (!followed && this._path.length === 0) {
            // No path found — fall back to direct movement
            this.moveTo(playerPos, dt);
          }

          // Catch check
          const dx   = playerPos.x - this.pos.x;
          const dz   = playerPos.z - this.pos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < CATCH_DIST && G) {
            G.playerCaught = true;
          }

          if (!sees) {
            this.state        = 'searching';
            this.stateT       = 0;
            this._searchPhase = 'move';
            this.requestPath(this.lastKnown.x, this.lastKnown.z);
            this._pathTimer   = Infinity;
          }
          break;
        }

        case 'searching': {
          if (sees) {
            this.state        = 'alerted';
            this.stateT       = 0;
            this._searchPhase = 'move';
            this._pathTimer   = 0;
            break;
          }
          if (this._searchPhase === 'move') {
            this.stateT += dt;
            const pathArrived = this.followPath(dt);
            const arrived = pathArrived ||
              (this._path.length === 0 && this.moveTo(this.lastKnown, dt));
            if (arrived) {
              // Reached last-known position — now look around
              this._searchPhase = 'look';
              this._lookT       = 0;
              this._lookYawBase = this.facingAngle();
            } else if (this.stateT > SEARCH_TIME) {
              this.state        = 'patrol';
              this.stateT       = 0;
              this._searchPhase = 'move';
            }
          } else {
            // Sweep gaze left/right at the investigation point
            this._lookT += dt;
            const sweepYaw = this._lookYawBase + Math.sin(this._lookT * 2.2) * 0.82;
            this.facing.set(Math.sin(sweepYaw), 0, Math.cos(sweepYaw));
            if (this._lookT > 2.8) {
              this.state        = 'patrol';
              this.stateT       = 0;
              this._searchPhase = 'move';
            }
          }
          break;
        }
      }

      // Walk animation
      const isMoving = this.state === 'patrol' || this.state === 'alerted' ||
                       (this.state === 'searching' && this._searchPhase === 'move');
      if (isMoving) this._walkT += dt * this.speed() * 0.9;
      const walkCycle = Math.sin(this._walkT * 3.2);
      const legSwing  = isMoving ? 0.52 : 0.03;
      const armSwing  = legSwing * 0.65;
      if (this._body) {
        this._body.position.y = 1.15 + walkCycle * (isMoving ? 0.025 : 0.006);
        this._body.rotation.z = Math.sin(this._walkT * 3.2 + Math.PI * 0.5) * (isMoving ? 0.035 : 0.006);
      }
      if (this._leftLeg)  this._leftLeg.rotation.x  =  walkCycle * legSwing;
      if (this._rightLeg) this._rightLeg.rotation.x  = -walkCycle * legSwing;
      if (this._leftArm)  this._leftArm.rotation.x   = -walkCycle * armSwing;
      if (this._rightArm) this._rightArm.rotation.x  =  walkCycle * armSwing;

      // Sync mesh — smoothly lerp yaw toward target angle
      const targetYaw = this.facingAngle();
      let delta = targetYaw - this.smoothYaw;
      // Wrap delta to [-π, π] so guards take the short arc
      while (delta >  Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.smoothYaw += delta * Math.min(1, dt * 12);
      // Hard boundary: guards must stay inside the museum (south wall at Z≈0)
      if (this.pos.z < 1.5) this.pos.z = 1.5;
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.smoothYaw + Math.PI;
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

    tickFlashlight() {}

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

    subdue() {
      this.state          = 'subdued';
      this._subduedTimer  = 45;
      this.detectT        = 0;
      this._path          = [];
      this._pathIdx       = 0;
      // Visually slump: tilt sideways and sink slightly
      this.mesh.rotation.z  = Math.PI / 2;
      this.mesh.position.y  = 0.5;
      this.coneMesh.visible = false;
      this.beamMesh.visible = false;
      this.bubble.visible   = false;
      this.detectBar.visible = false;
    }

    _wakeUp() {
      this.mesh.rotation.z  = 0;
      this.mesh.position.y  = 0;
      this.state            = 'searching';
      this.stateT           = 0;
      this._searchPhase     = 'look';
      this._lookT           = 0;
      this._lookYawBase     = this.facingAngle();
      this.lastKnown.copy(this.pos);
      triggerAlarmLevel(1);
      if (window.UI) UI.showAlert('Guard waking up — alarm raised!', 2500);
      if (window.UI) UI.SFX.alert();
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
      g.state       = 'patrol';
      g.detectT     = 0;
      g.stateT      = 0;
      g._path       = [];
      g._pathIdx    = 0;
      g._pathTimer  = 0;
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
    buildNavGrid();
    _guardHairIdx = 0; // reset per run so colours are consistent
    guards = spawnData.map(d => new Guard(d, scene));
  }

  let _visionFrame = 0;
  function update(dt, playerPos, isCrouching) {
    if (_noGuardMode) return; // exploration mode — no guards active
    // Stagger vision checks across 3 frames — only ~1/3 of guards check vision per frame.
    // Alerted guards always check (they're chasing) to keep catch logic responsive.
    _visionFrame = (_visionFrame + 1) % 3;
    guards.forEach((g, i) => g.update(dt, playerPos, isCrouching, i % 3 === _visionFrame));

    // Body discovery: patrolling guards that walk near a subdued guard raise alarm
    guards.forEach((g, i) => {
      if (g.state !== 'subdued') return;
      guards.forEach((other, j) => {
        if (i === j || other.state !== 'patrol') return;
        const dx = g.pos.x - other.pos.x;
        const dz = g.pos.z - other.pos.z;
        if (dx * dx + dz * dz < 5 * 5) {
          other.state      = 'alerted';
          other.stateT     = 0;
          other._pathTimer = 0;
          other.lastKnown.copy(playerPos);
          if (window.G) window.G.guardsAlerted++;
          triggerAlarmLevel(2);
          if (window.UI) UI.showAlert('Guard found a body!', 3000);
          if (window.UI) UI.SFX.alert();
        }
      });
    });
  }

  // Returns true and subdues the guard if player is behind a valid target.
  function tryTakedown(px, pz) {
    for (const g of guards) {
      if (g.state === 'subdued' || g.state === 'alerted') continue;
      const dx = g.pos.x - px;
      const dz = g.pos.z - pz;
      if (dx * dx + dz * dz > 2.0 * 2.0) continue;
      // Player must be behind guard: vector from guard→player should be opposite to guard facing
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.01) continue;
      const toPlayerX = -dx / dist; // guard→player, but dx = guard - player so negate
      const toPlayerZ = -dz / dist;
      const behindDot = toPlayerX * g.facing.x + toPlayerZ * g.facing.z;
      if (behindDot > -0.2) continue; // not behind guard
      g.subdue();
      return true;
    }
    return false;
  }

  // Returns true if player is behind an eligible guard (for prompt display).
  function checkTakedownAvailable(px, pz) {
    for (const g of guards) {
      if (g.state === 'subdued' || g.state === 'alerted') continue;
      const dx = g.pos.x - px;
      const dz = g.pos.z - pz;
      if (dx * dx + dz * dz > 2.5 * 2.5) continue;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.01) continue;
      const toPlayerX = -dx / dist;
      const toPlayerZ = -dz / dist;
      const behindDot = toPlayerX * g.facing.x + toPlayerZ * g.facing.z;
      if (behindDot <= -0.2) return true;
    }
    return false;
  }

  function getGuardPositions() {
    return guards.map(g => ({ x: g.pos.x, z: g.pos.z }));
  }

  // Returns positions of guards that are suspicious or alerted (for companion auto-distract)
  function getAlertedGuardPositions() {
    return guards
      .filter(g => g.state === 'suspicious' || g.state === 'alerted')
      .map(g => ({ x: g.pos.x, z: g.pos.z }));
  }

  // ── Power breaker effect ───────────────────────────────
  let _savedVisionRange = null;
  function setPowerOut(on) {
    if (on) {
      if (_savedVisionRange === null) _savedVisionRange = VISION_RANGE;
      VISION_RANGE = _savedVisionRange * 0.5;
    } else {
      // Restore VISION_RANGE only if the power-out effect was active
      if (_savedVisionRange !== null) {
        VISION_RANGE = _savedVisionRange;
      }
      _savedVisionRange = null;
    }
  }

  return {
    init,
    update,
    getGuardPositions,
    getAlertedGuardPositions,
    astar,   // exposed for companion pathfinding
    getAlertLevel()  { return alertLevel; },
    triggerAlarmLevel,
    resetAlarm,
    notifyNoise,
    setDifficulty,
    tryTakedown,
    checkTakedownAvailable,
    setPowerOut,
  };

}());
