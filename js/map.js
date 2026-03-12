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
//   Salle des Statues  X −80→−40,  Z  90→120  (off Gallery west wall via corridor)

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

  // ── Lobby floor texture — warm amber/terracotta marble ───
  function makeMarbleTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0.0, '#a07848');
    grad.addColorStop(0.5, '#987040');
    grad.addColorStop(1.0, '#b08850');
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
        const dark = vein * vein * 32;
        const i = (y * S + x) * 4;
        d[i]   = Math.max(0, d[i]   - dark * 0.45);
        d[i+1] = Math.max(0, d[i+1] - dark * 0.55);
        d[i+2] = Math.max(0, d[i+2] - dark * 0.70);
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(80,40,10,0.35)';
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

  // ── Gallery floor — deep cobalt/navy marble ───────────────
  function makeGalleryFloorTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0.0, '#1a2850');
    grad.addColorStop(0.5, '#152040');
    grad.addColorStop(1.0, '#1e2e58');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const t = x * 0.011 + y * 0.009
                + Math.sin(x * 0.038 + y * 0.022) * 2.8
                + Math.sin(y * 0.028 + x * 0.019) * 2.2;
        const vein = Math.abs(Math.sin(t * Math.PI));
        const bright = vein * vein * 20;
        const i = (y * S + x) * 4;
        d[i]   = Math.min(255, d[i]   + bright * 0.3);
        d[i+1] = Math.min(255, d[i+1] + bright * 0.4);
        d[i+2] = Math.min(255, d[i+2] + bright * 0.9);
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(60,90,180,0.40)';
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

  // ── Corridor 1 floor — warm herringbone parquet wood ─────────────────
  function makeHerringboneTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const woodColors = ['#7a4e2a', '#8a5e32', '#6a3e1a', '#9a6e3a', '#704828'];
    const bw = 24, bh = 48; // brick dimensions
    for (let row = -2; row < S / bh + 2; row++) {
      for (let col = -2; col < S / bw + 2; col++) {
        const even = (row + col) % 2 === 0;
        const wx = col * bw + (even ? 0 : bw / 2);
        const wy = row * bh;
        const base = woodColors[Math.abs(row * 7 + col * 3) % woodColors.length];
        ctx.save();
        ctx.translate(wx + bw / 2, wy + bh / 2);
        ctx.rotate(even ? 0 : Math.PI / 2);
        // Plank
        ctx.fillStyle = base;
        ctx.fillRect(-bh / 2, -bw / 2, bh, bw);
        // Wood grain lines
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.8;
        for (let g = -bh / 2 + 6; g < bh / 2; g += 8) {
          ctx.beginPath(); ctx.moveTo(g, -bw / 2); ctx.lineTo(g, bw / 2); ctx.stroke();
        }
        // Plank border
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-bh / 2 + 0.6, -bw / 2 + 0.6, bh - 1.2, bw - 1.2);
        ctx.restore();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex._tileSize = 3;
    return tex;
  }

  // ── Corridor 2 floor — dark slate hexagonal tiles ─────────────────────
  function makeHexTileTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, S, S);
    const r = 30, h = r * Math.sqrt(3);
    const tileColors = ['#1a1030', '#20183a', '#181028', '#221840'];
    for (let row = -1; row < S / h + 2; row++) {
      for (let col = -1; col < S / (r * 3) + 2; col++) {
        const cx = col * r * 3 + (row % 2) * r * 1.5;
        const cy = row * h;
        const fill = tileColors[(row * 5 + col * 3) % tileColors.length];
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          i === 0 ? ctx.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2))
                  : ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        // Purple-ish grout line
        ctx.strokeStyle = 'rgba(120,60,200,0.40)'; ctx.lineWidth = 2; ctx.stroke();
        // Inner shimmer highlight
        ctx.strokeStyle = 'rgba(180,140,255,0.15)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
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

  // ── Egyptian Catacomb floor — sandy limestone with stone-block grid ──────────
  function makeEgyptianFloorTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0.0, '#7a6040');
    grad.addColorStop(0.4, '#6a5030');
    grad.addColorStop(0.8, '#7c6244');
    grad.addColorStop(1.0, '#6a5232');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Per-pixel wear/noise
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = Math.sin(x * 0.07 + y * 0.13) * Math.cos(x * 0.09 - y * 0.06) * 14
                + Math.sin(x * 0.03 + y * 0.04) * 8;
        const i4 = (y * S + x) * 4;
        d[i4]   = Math.max(0, Math.min(255, d[i4]   + n));
        d[i4+1] = Math.max(0, Math.min(255, d[i4+1] + n * 0.85));
        d[i4+2] = Math.max(0, Math.min(255, d[i4+2] + n * 0.55));
      }
    }
    ctx.putImageData(img, 0, 0);
    // Stone block grid
    ctx.strokeStyle = 'rgba(35,20,8,0.52)';
    ctx.lineWidth = 3.5;
    for (let i = 0; i <= S; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    // Inner highlight lines (mortar shadow)
    ctx.strokeStyle = 'rgba(25,14,5,0.22)';
    ctx.lineWidth = 1;
    for (let i = 8; i < S; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    // Faint hieroglyph-like marks in random blocks
    ctx.strokeStyle = 'rgba(160,120,40,0.28)';
    ctx.lineWidth = 1.5;
    for (let bx = 0; bx < 4; bx++) {
      for (let by = 0; by < 4; by++) {
        if ((bx + by) % 3 === 0) {
          const ox = bx * 128 + 24, oy = by * 128 + 24;
          ctx.beginPath();
          ctx.moveTo(ox, oy + 20); ctx.lineTo(ox + 40, oy + 20);
          ctx.moveTo(ox + 20, oy); ctx.lineTo(ox + 20, oy + 40);
          ctx.stroke();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex._tileSize = 4;
    return tex;
  }

  // ── Egyptian rug — deep red with gold border and geometric pattern ───────────
  function makeEgyptianRugTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    // Deep red base
    ctx.fillStyle = '#7a1a10';
    ctx.fillRect(0, 0, S, S);
    // Subtle field noise
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = Math.sin(x * 0.11 + y * 0.07) * 8 + Math.cos(x * 0.05 - y * 0.09) * 6;
        const i4 = (y * S + x) * 4;
        d[i4]   = Math.max(0, Math.min(255, d[i4]   + n));
        d[i4+1] = Math.max(0, Math.min(255, d[i4+1] + n * 0.4));
        d[i4+2] = Math.max(0, Math.min(255, d[i4+2] + n * 0.2));
      }
    }
    ctx.putImageData(img, 0, 0);
    // Gold outer border
    ctx.strokeStyle = '#d4a020'; ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, S - 18, S - 18);
    // Inner border line
    ctx.strokeStyle = '#b88010'; ctx.lineWidth = 5;
    ctx.strokeRect(28, 28, S - 56, S - 56);
    // Central diamond grid pattern
    ctx.strokeStyle = 'rgba(212,160,32,0.55)'; ctx.lineWidth = 2.5;
    for (let i = 64; i < S; i += 96) {
      ctx.beginPath(); ctx.moveTo(i, 36); ctx.lineTo(i, S - 36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(36, i); ctx.lineTo(S - 36, i); ctx.stroke();
    }
    // Diagonal cross-hatch for texture depth
    ctx.strokeStyle = 'rgba(180,100,20,0.28)'; ctx.lineWidth = 1.2;
    for (let i = -S; i < S * 2; i += 52) {
      ctx.beginPath(); ctx.moveTo(i, 36); ctx.lineTo(i + S, S - 36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, S - 36); ctx.lineTo(i + S, 36); ctx.stroke();
    }
    // Central lotus medallion
    ctx.fillStyle = 'rgba(212,160,32,0.60)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d4a020'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#7a1a10';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(212,160,32,0.80)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 18, 0, Math.PI * 2); ctx.fill();
    // Corner lotus marks
    [[80,80],[S-80,80],[80,S-80],[S-80,S-80]].forEach(([cx,cy]) => {
      ctx.fillStyle = 'rgba(212,160,32,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d4a020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.stroke();
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
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

  // ── Procedural Impressionist painting textures ────────────────────────────
  function makeVanGoghStarryNight() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1b3e'; ctx.fillRect(0, 0, S, S);
    const skyColors = ['#1e3f7a','#2a52a8','#163266','#3a6ac8','#1040a0'];
    for (let i = 0; i < 120; i++) {
      const x = Math.random()*S, y = Math.random()*S*0.7, r = 15+Math.random()*45;
      ctx.strokeStyle = skyColors[Math.floor(Math.random()*skyColors.length)];
      ctx.lineWidth = 2+Math.random()*7;
      ctx.beginPath(); ctx.arc(x, y, r, Math.random()*Math.PI, Math.random()*Math.PI*2); ctx.stroke();
    }
    for (let i = 0; i < 25; i++) {
      const sx = Math.random()*S, sy = Math.random()*S*0.65, sr = 3+Math.random()*10;
      const grd = ctx.createRadialGradient(sx,sy,0,sx,sy,sr*3.5);
      grd.addColorStop(0,'rgba(255,240,160,0.95)'); grd.addColorStop(0.3,'rgba(255,220,80,0.6)'); grd.addColorStop(1,'rgba(255,220,80,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sx,sy,sr*3.5,0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle='rgba(255,245,180,0.9)'; ctx.beginPath(); ctx.arc(S*0.82,S*0.12,30,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a1810'; ctx.fillRect(0,S*0.62,S,S*0.38);
    ctx.fillStyle='#0d0e0a'; ctx.beginPath(); ctx.moveTo(S*0.25,S*0.35); ctx.lineTo(S*0.22,S*0.62); ctx.lineTo(S*0.28,S*0.62); ctx.fill();
    ctx.fillStyle='#14200a'; ctx.beginPath(); ctx.moveTo(0,S*0.62);
    for (let x=0;x<=S;x+=20) ctx.lineTo(x, S*0.62-Math.sin(x*0.03)*25);
    ctx.lineTo(S,S); ctx.lineTo(0,S); ctx.fill();
    for (let i=0;i<18;i++) {
      ctx.fillStyle=`rgba(255,200,80,${0.5+Math.random()*0.5})`;
      ctx.fillRect(Math.random()*S, S*0.65+Math.random()*S*0.15, 3+Math.random()*7, 3+Math.random()*5);
    }
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  function makeVanGoghSunflowers() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle='#d8a800'; ctx.fillRect(0,0,S,S);
    ctx.fillStyle='#6a3c10'; ctx.fillRect(0,S*0.78,S,S);
    ctx.fillStyle='#8a5018'; ctx.beginPath(); ctx.moveTo(S*0.28,S*0.78); ctx.lineTo(S*0.22,S*0.98); ctx.lineTo(S*0.78,S*0.98); ctx.lineTo(S*0.72,S*0.78); ctx.fill();
    const flowerDefs=[[S*0.5,S*0.3,55],[S*0.2,S*0.45,40],[S*0.78,S*0.4,45],[S*0.35,S*0.18,35],[S*0.65,S*0.22,38],[S*0.5,S*0.55,38],[S*0.15,S*0.6,30],[S*0.82,S*0.58,32]];
    const petalC=['#f0a000','#e08000','#f0c000','#d89000','#f0b820'];
    flowerDefs.forEach(([fx,fy,fr]) => {
      for (let p=0;p<14;p++) {
        const pa=(p/14)*Math.PI*2; ctx.fillStyle=petalC[Math.floor(Math.random()*petalC.length)];
        ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*fr*0.95,fy+Math.sin(pa)*fr*0.95,fr*0.35,fr*0.18,pa+Math.PI/2,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='#2a1200'; ctx.beginPath(); ctx.arc(fx,fy,fr*0.38,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#2a6010'; ctx.lineWidth=4+fr*0.05; ctx.beginPath(); ctx.moveTo(fx,fy+fr); ctx.quadraticCurveTo(fx+(Math.random()-0.5)*50,fy+fr+60,S*0.5,S*0.78); ctx.stroke();
    });
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  function makeVanGoghIrises() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle='#c87828'; ctx.fillRect(0,0,S,S);
    ctx.fillStyle='#6a4010'; ctx.fillRect(0,S*0.6,S,S);
    ctx.strokeStyle='#1a5010'; ctx.lineWidth=3;
    for (let i=0;i<60;i++) {
      const lx=Math.random()*S, ly=S*0.55+Math.random()*S*0.3, lh=40+Math.random()*120, curve=(Math.random()-0.5)*60;
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.quadraticCurveTo(lx+curve,ly-lh/2,lx+curve*0.5,ly-lh); ctx.stroke();
    }
    const irisDefs=[[S*0.18,S*0.38],[S*0.35,S*0.28],[S*0.52,S*0.4],[S*0.68,S*0.3],[S*0.82,S*0.35],[S*0.25,S*0.55],[S*0.6,S*0.52],[S*0.78,S*0.5]];
    const irisC=['#4a1a8a','#5a2aaa','#3a0a70','#6030c0','#7040d0'];
    const irisA=['#9060e0','#a070f0','#8050d0'];
    irisDefs.forEach(([fx,fy]) => {
      for (let p=0;p<3;p++) { const pa=(p/3)*Math.PI*1.4-0.7; ctx.fillStyle=irisC[Math.floor(Math.random()*irisC.length)]; ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*15,fy-20,11,22,pa,0,Math.PI*2); ctx.fill(); }
      for (let p=0;p<3;p++) { const pa=(p/3)*Math.PI*2; ctx.fillStyle=irisA[Math.floor(Math.random()*irisA.length)]; ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*16,fy+12,9,18,pa,0,Math.PI*2); ctx.fill(); }
      ctx.fillStyle='#e8c000'; ctx.beginPath(); ctx.ellipse(fx,fy,5,10,0,0,Math.PI*2); ctx.fill();
    });
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  function makeMonetSunrise() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const skyGrad = ctx.createLinearGradient(0,0,0,S*0.5);
    skyGrad.addColorStop(0,'#1a2848'); skyGrad.addColorStop(0.4,'#4a3060'); skyGrad.addColorStop(0.7,'#9a4820'); skyGrad.addColorStop(1,'#d06820');
    ctx.fillStyle=skyGrad; ctx.fillRect(0,0,S,S*0.5);
    const waterGrad = ctx.createLinearGradient(0,S*0.5,0,S);
    waterGrad.addColorStop(0,'#1a3060'); waterGrad.addColorStop(0.5,'#102030'); waterGrad.addColorStop(1,'#080d18');
    ctx.fillStyle=waterGrad; ctx.fillRect(0,S*0.5,S,S*0.5);
    const sunGrad = ctx.createRadialGradient(S*0.6,S*0.48,0,S*0.6,S*0.48,55);
    sunGrad.addColorStop(0,'rgba(255,180,0,1)'); sunGrad.addColorStop(0.4,'rgba(255,100,0,0.8)'); sunGrad.addColorStop(1,'rgba(255,80,0,0)');
    ctx.fillStyle=sunGrad; ctx.beginPath(); ctx.arc(S*0.6,S*0.48,55,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#0a0e18'; ctx.fillRect(S*0.05,S*0.35,8,S*0.15); ctx.fillRect(S*0.15,S*0.4,6,S*0.1); ctx.fillRect(S*0.82,S*0.38,8,S*0.12);
    ctx.fillStyle='#080c14'; ctx.beginPath(); ctx.moveTo(S*0.3,S*0.58); ctx.lineTo(S*0.22,S*0.62); ctx.lineTo(S*0.38,S*0.62); ctx.fill();
    for (let i=0;i<50;i++) {
      const ry=S*0.5+Math.random()*S*0.5, rxLen=20+Math.random()*80, rxStart=Math.random()*(S-rxLen);
      ctx.strokeStyle=`rgba(${40+Math.floor(Math.random()*80)},${60+Math.floor(Math.random()*80)},${80+Math.floor(Math.random()*100)},${0.1+Math.random()*0.25})`;
      ctx.lineWidth=1+Math.random()*2; ctx.beginPath(); ctx.moveTo(rxStart,ry); ctx.lineTo(rxStart+rxLen,ry); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  function makeMonetPoppies() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const skyGrad = ctx.createLinearGradient(0,0,0,S*0.45);
    skyGrad.addColorStop(0,'#4a80c0'); skyGrad.addColorStop(1,'#90b8e0');
    ctx.fillStyle=skyGrad; ctx.fillRect(0,0,S,S*0.45);
    ctx.fillStyle='rgba(255,255,255,0.85)';
    [[S*0.15,S*0.1,60,30],[S*0.6,S*0.08,80,35],[S*0.82,S*0.15,50,22]].forEach(([cx,cy,rw,rh]) => { ctx.beginPath(); ctx.ellipse(cx,cy,rw,rh,0,0,Math.PI*2); ctx.fill(); });
    const hillGrad = ctx.createLinearGradient(0,S*0.42,0,S);
    hillGrad.addColorStop(0,'#5a9040'); hillGrad.addColorStop(0.3,'#4a7830'); hillGrad.addColorStop(1,'#3a5c20');
    ctx.fillStyle=hillGrad; ctx.beginPath(); ctx.moveTo(0,S*0.45);
    for (let x=0;x<=S;x+=15) ctx.lineTo(x, S*0.42+Math.sin(x*0.018)*18+Math.sin(x*0.008)*25);
    ctx.lineTo(S,S); ctx.lineTo(0,S); ctx.fill();
    for (let i=0;i<200;i++) {
      const px=Math.random()*S, py=S*0.45+Math.random()*S*0.55, pr=2+Math.random()*8;
      ctx.fillStyle=`rgba(${180+Math.floor(Math.random()*75)},${Math.floor(Math.random()*30)},${Math.floor(Math.random()*30)},${0.7+Math.random()*0.3})`;
      ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  function makeRenoirPortrait() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle='#e8b880'; ctx.fillRect(0,0,S,S);
    for (let i=0;i<200;i++) {
      const x=Math.random()*S, y=Math.random()*S, r=8+Math.random()*20;
      const lC=['rgba(255,220,180,','rgba(255,200,160,','rgba(240,180,140,'];
      ctx.fillStyle=lC[Math.floor(Math.random()*lC.length)]+(0.08+Math.random()*0.2)+')';
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle='#a06030'; ctx.beginPath(); ctx.ellipse(S*0.5,S*0.85,S*0.25,S*0.2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#c09050'; ctx.beginPath(); ctx.arc(S*0.5,S*0.55,S*0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#8a3020'; ctx.beginPath(); ctx.ellipse(S*0.5,S*0.48,S*0.15,S*0.06,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#d02040';
    for (let p=0;p<6;p++) { const pa=p/6*Math.PI*2; ctx.beginPath(); ctx.ellipse(S*0.5+Math.cos(pa)*S*0.06,S*0.46+Math.sin(pa)*S*0.04,8,5,pa,0,Math.PI*2); ctx.fill(); }
    const vibC=['#ff4040','#ff8820','#ffcc20','#40aa40','#4088ff','#cc40ff'];
    for (let i=0;i<40;i++) {
      ctx.fillStyle=vibC[Math.floor(Math.random()*vibC.length)];
      ctx.beginPath(); ctx.arc(Math.random()*S, S*0.6+Math.random()*S*0.4, 3+Math.random()*8, 0, Math.PI*2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  function makeCezanneLandscape() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const skyGrad = ctx.createLinearGradient(0,0,0,S*0.4);
    skyGrad.addColorStop(0,'#7090b8'); skyGrad.addColorStop(1,'#a0b8d8');
    ctx.fillStyle=skyGrad; ctx.fillRect(0,0,S,S*0.4);
    const mtC=['#9098b0','#8898c0','#6878a0'];
    [[S*0.2,S*0.38,S*0.5,S*0.08,S*0.8,S*0.38],[S*0.2,S*0.38,S*0.38,S*0.2,S*0.5,S*0.08],[S*0.5,S*0.08,S*0.65,S*0.22,S*0.8,S*0.38]].forEach(([x1,y1,x2,y2,x3,y3],i) => {
      ctx.fillStyle=mtC[i]; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.fill();
    });
    const valGrad = ctx.createLinearGradient(0,S*0.38,0,S);
    valGrad.addColorStop(0,'#709048'); valGrad.addColorStop(1,'#486028');
    ctx.fillStyle=valGrad; ctx.fillRect(0,S*0.38,S,S*0.62);
    [[S*0.08,S*0.35],[S*0.15,S*0.42],[S*0.88,S*0.38],[S*0.78,S*0.44]].forEach(([tx,ty]) => {
      ctx.fillStyle='#1a4010'; ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx-15,ty+45); ctx.lineTo(tx+15,ty+45); ctx.fill();
    });
    for (let i=0;i<80;i++) {
      const bx=Math.random()*S, by=S*0.4+Math.random()*S*0.6, br=8+Math.random()*18;
      ctx.fillStyle=`rgba(${50+Math.floor(Math.random()*60)},${80+Math.floor(Math.random()*60)},${30+Math.floor(Math.random()*40)},0.4)`;
      ctx.fillRect(bx,by,br,br*0.6);
    }
    ctx.fillStyle='#c8a870'; ctx.fillRect(S*0.38,S*0.55,S*0.28,S*0.22);
    ctx.fillStyle='#8a3820'; ctx.fillRect(S*0.35,S*0.5,S*0.34,S*0.06);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; return tex;
  }

  // ── Load real painting texture from URL (public domain, Wikimedia Commons) ──
  const _loader = new THREE.TextureLoader();
  function loadPaintingTex(url) {
    const tex = _loader.load(url);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ── Painting placard (canvas-texture label beneath a painting) ──
  // wallDir: 'west' | 'east' | 'north' | 'south'
  function placard(scene, x, y, z, title, artist, wallDir) {
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
    const pw = 1.4, ph = 0.4, thin = 0.04;
    let mesh;
    if (wallDir === 'west') {
      // Plaque flat on west wall, visible face points east (+X)
      mesh = new THREE.Mesh(new THREE.BoxGeometry(thin, ph, pw), mat);
      mesh.position.set(x + 0.15, y, z);
    } else if (wallDir === 'east') {
      // Plaque flat on east wall, visible face points west (-X)
      mesh = new THREE.Mesh(new THREE.BoxGeometry(thin, ph, pw), mat);
      mesh.position.set(x - 0.15, y, z);
    } else if (wallDir === 'north') {
      // Plaque flat on north wall, visible face points south (-Z, toward player)
      mesh = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, thin), mat);
      mesh.position.set(x, y, z - 0.15);
    } else { // 'south'
      // Plaque flat on south wall, visible face points north (+Z, toward player)
      mesh = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, thin), mat);
      mesh.position.set(x, y, z + 0.15);
    }
    scene.add(mesh);
  }

  const _tileTex          = makeMarbleTex();
  const _galleryFloorTex  = makeGalleryFloorTex();
  const _herringboneTex   = makeHerringboneTex();
  const _hexTileTex       = makeHexTileTex();
  const _ceilTex        = makeTileTex('#2a1a42', '#1a0e2e', 3);   // deep purple ceiling
  const _galleryCeilTex = makeTileTex('#0e1a38', '#080e22', 3);   // deep navy gallery ceiling
  const _vaultCeilTex   = makeTileTex('#0e1a0e', '#060e06', 3);   // deep emerald vault ceiling
  const _baseMat    = new THREE.MeshStandardMaterial({ color: 0x9a7030, roughness: 0.75, metalness: 0.10 });  // warm brass baseboard
  const _wainMat    = new THREE.MeshStandardMaterial({ color: 0x4a2010, roughness: 0.78, metalness: 0.0  });  // deep mahogany wainscoting
  const _moldMat    = new THREE.MeshStandardMaterial({ color: 0xb88030, roughness: 0.45, metalness: 0.55 });  // gold-brass molding
  const _frameMat   = new THREE.MeshStandardMaterial({ color: 0x2a1008, roughness: 0.72, metalness: 0.06 });  // dark walnut door frame
  const _handleMat  = new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.3,  metalness: 0.85 });  // gold handle
  const _stripeMat  = new THREE.MeshStandardMaterial({ color: 0x0e0c08, roughness: 0.95, metalness: 0.05 });
  const _chipMat    = new THREE.MeshStandardMaterial({ color: 0xc09040, roughness: 0.35, metalness: 0.75 });

  // ── Materials ──────────────────────────────────────────
  const M = {
    floor:          new THREE.MeshStandardMaterial({ map: _tileTex,          roughness: 0.22, metalness: 0.04 }),
    galleryFloor:   new THREE.MeshStandardMaterial({ map: _galleryFloorTex,  roughness: 0.20, metalness: 0.06 }),
    corridorFloor1: new THREE.MeshStandardMaterial({ map: _herringboneTex,   roughness: 0.30, metalness: 0.02 }),
    corridorFloor2: new THREE.MeshStandardMaterial({ map: _hexTileTex,       roughness: 0.18, metalness: 0.08 }),
    wall:         new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.88, metalness: 0.0  }),  // warm amber stone
    galleryWall:  new THREE.MeshStandardMaterial({ color: 0x1e1848, roughness: 0.88, metalness: 0.0  }),  // deep midnight blue
    vaultWall:    new THREE.MeshStandardMaterial({ color: 0x0c2a18, roughness: 0.88, metalness: 0.0  }),  // deep emerald
    corridorWall: new THREE.MeshStandardMaterial({ color: 0x5a2e10, roughness: 0.88, metalness: 0.0  }),  // warm cinnamon
    ceiling:      new THREE.MeshStandardMaterial({ map: _ceilTex,         roughness: 0.92, metalness: 0.0 }),
    galleryCeil:  new THREE.MeshStandardMaterial({ map: _galleryCeilTex,  roughness: 0.92, metalness: 0.0 }),
    vaultCeil:    new THREE.MeshStandardMaterial({ map: _vaultCeilTex,    roughness: 0.92, metalness: 0.0 }),
    desk:         new THREE.MeshStandardMaterial({ color: 0x3a1808, roughness: 0.75, metalness: 0.0  }),  // dark walnut
    glass:        new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 }),
    frame:        new THREE.MeshStandardMaterial({ color: 0x1a0808, roughness: 0.70, metalness: 0.08 }),  // dark frame
    door:         new THREE.MeshStandardMaterial({ color: 0x3a1408, roughness: 0.72, metalness: 0.06 }),  // dark walnut door
    pillar:       new THREE.MeshStandardMaterial({ color: 0xc09040, roughness: 0.55, metalness: 0.20 }),  // warm gold stone pillar
    pedestal:     new THREE.MeshStandardMaterial({ color: 0x9a6828, roughness: 0.50, metalness: 0.15 }),  // warm amber pedestal
    crown:        new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2,  metalness: 0.9  }),
    terminal:     new THREE.MeshStandardMaterial({ color: 0x0e1a08, roughness: 0.80, metalness: 0.10 }),  // dark green cabinet
    exit:         new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.3,  metalness: 0.0, transparent: true, opacity: 0.7 }),
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
    // Procedural Impressionist paintings
    vangoghStarry:     new THREE.MeshStandardMaterial({ map: makeVanGoghStarryNight(),  roughness: 0.88, metalness: 0.0 }),
    vangoghSunflowers: new THREE.MeshStandardMaterial({ map: makeVanGoghSunflowers(),   roughness: 0.88, metalness: 0.0 }),
    vangoghIrises:     new THREE.MeshStandardMaterial({ map: makeVanGoghIrises(),        roughness: 0.88, metalness: 0.0 }),
    monetSunrise:      new THREE.MeshStandardMaterial({ map: makeMonetSunrise(),         roughness: 0.88, metalness: 0.0 }),
    monetPoppies:      new THREE.MeshStandardMaterial({ map: makeMonetPoppies(),         roughness: 0.88, metalness: 0.0 }),
    renoir:            new THREE.MeshStandardMaterial({ map: makeRenoirPortrait(),       roughness: 0.88, metalness: 0.0 }),
    cezanne:           new THREE.MeshStandardMaterial({ map: makeCezanneLandscape(),     roughness: 0.88, metalness: 0.0 }),
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
  let skylightHatch    = null;

  // Pick a random patrol route from multiple options each run
  function _route(...sets) {
    return sets[Math.floor(Math.random() * sets.length)];
  }

  // ── Low-level helpers ──────────────────────────────────
  function box(scene, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // Decorative box — no shadow casting (used for tiny detail pieces)
  function boxD(scene, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = false;
    mesh.receiveShadow = false;
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
  function wall(scene, cx, cz, w, d, mat) {
    box(scene, w, WALL_H, d, cx, WALL_H / 2, cz, mat || M.wall);
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

  function floor(scene, cx, cz, w, d, floorMat) {
    const mat = (floorMat || M.floor).clone();
    if (floorMat && mat.map) {
      // Custom floor: tile using its own texture
      const tex = mat.map.clone();
      const ts = tex._tileSize || 4;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w / ts, d / ts);
      mat.map = tex;
    } else {
      const tex  = _tileTex.clone();
      tex.wrapS  = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w / _tileTex._tileSize, d / _tileTex._tileSize);
      mat.map = tex;
    }
    box(scene, w, FLOOR_T, d, cx, -FLOOR_T / 2, cz, mat);
  }

  function ceiling(scene, cx, cz, w, d, ceilMat) {
    const mat = (ceilMat || M.ceiling).clone();
    if (ceilMat && mat.map) {
      // Custom ceiling: tile using its own texture (tile size 3)
      const tex = mat.map.clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w / 3, d / 3);
      mat.map = tex;
    } else {
      const tex  = _ceilTex.clone();
      tex.wrapS  = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w / _ceilTex._tileSize, d / _ceilTex._tileSize);
      mat.map = tex;
    }
    const ceilSlab = box(scene, w, FLOOR_T, d, cx, WALL_H + FLOOR_T / 2, cz, mat);
    ceilSlab.userData.aerialhide = true;
    // Recessed ceiling panel strip (thin dark inset frame)
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1028, roughness: 0.95, metalness: 0.0 });
    const ceilPanel = box(scene, w - 0.6, 0.05, d - 0.6, cx, WALL_H - 0.02, cz, panelMat);
    ceilPanel.userData.aerialhide = true;
  }

  // Full room shell: floor + ceiling + 4 walls with opening gap
  // Openings (door slots) are left by NOT drawing that full wall segment —
  // instead two partial segments are drawn, leaving a gap for corridor passage.
  // doorW: optional width of the north opening in units (default 10 = corridor width)
  function roomWalls(scene, cx, cz, rw, rd, openings, wallMat, floorMat, ceilMat, doorW) {
    openings = openings || {};
    doorW = doorW || 10; // match the 10-unit-wide corridors (X ±5)

    // South wall (−Z face)
    if (!openings.south) {
      wall(scene, cx, cz - rd / 2, rw, WALL_T, wallMat);
    }
    // North wall (+Z face)
    if (!openings.north) {
      wall(scene, cx, cz + rd / 2, rw, WALL_T, wallMat);
    } else {
      // Two stubs flanking the corridor gap (doorW units wide, centered)
      const stub = (rw - doorW) / 2;
      wall(scene, cx - (rw / 2 - stub / 2), cz + rd / 2, stub, WALL_T, wallMat);
      wall(scene, cx + (rw / 2 - stub / 2), cz + rd / 2, stub, WALL_T, wallMat);
    }
    // East wall (+X face)
    if (!openings.east) {
      wall(scene, cx + rw / 2, cz, WALL_T, rd, wallMat);
    }
    // West wall (−X face)
    if (!openings.west) {
      wall(scene, cx - rw / 2, cz, WALL_T, rd, wallMat);
    }

    floor(scene, cx, cz, rw, rd, floorMat);
    ceiling(scene, cx, cz, rw, rd, ceilMat);
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
    // Glass vitrine — returned so callers can reference it for shatter
    const glassMesh = box(scene, 1.0, 1.20, 1.0, x, 1.40, z, M.glass);
    // Slim metal corner posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0xb87820, roughness: 0.22, metalness: 0.88 });
    [[-0.50, -0.50], [-0.50, 0.50], [0.50, -0.50], [0.50, 0.50]].forEach(([ox, oz]) => {
      box(scene, 0.065, 1.28, 0.065, x + ox, 1.44, z + oz, postMat);
    });
    // Lid cap
    box(scene, 1.08, 0.048, 1.08, x, 2.064, z, postMat);
    addWallAABB(x, z, 1.2, 1.2);
    return glassMesh;
  }

  // Painting on a wall (frame + canvas) — returns the canvas mesh so callers can hide it on steal
  function wallPainting(scene, x, y, z, mat, isWestWall) {
    const offset = isWestWall ? 0.15 : -0.15;
    box(scene, Math.abs(offset) + 0.02, 1.6, 2.4, x, y, z, M.frame);
    return box(scene, 0.08, 1.4, 2.1, x + offset, y, z, mat);
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
    const mainMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.38, metalness: 0.0 });
    box(scene, w, 0.042, d, cx, 0.021, cz, mainMat);
    if (accentColor !== undefined) {
      const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.20, metalness: 0.12 });
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
  const _brassM = new THREE.MeshStandardMaterial({ color: 0xb87820, roughness: 0.22, metalness: 0.85 });

  // ── Ornate wall lantern (wrought-iron cage with warm flame glow) ────────────
  // extX: +1 = lantern points toward +X (on west wall), -1 = toward -X (on east wall)
  function wallLantern(scene, wx, y, wz, extX) {
    const ironM = new THREE.MeshStandardMaterial({ color: 0x1a0e04, roughness: 0.42, metalness: 0.72 });
    const glowM = new THREE.MeshStandardMaterial({
      color: 0xff8800, emissive: 0xff6000, emissiveIntensity: 2.2,
      transparent: true, opacity: 0.82, roughness: 0.10,
    });
    const EX = extX * 0.54;
    // Bracket arm extending from wall
    box(scene, Math.abs(EX) * 0.85, 0.05, 0.05, wx + EX * 0.44, y + 0.06, wz, ironM);
    // Vertical drop rod
    box(scene, 0.04, 0.22, 0.04, wx + EX * 0.88, y - 0.03, wz, ironM);
    // Lantern cage (outer frame)
    box(scene, 0.30, 0.40, 0.30, wx + EX, y - 0.14, wz, ironM);
    // Warm glass panels (4 sides, slightly inset)
    box(scene, 0.22, 0.30, 0.03, wx + EX, y - 0.14, wz - 0.148, glowM);
    box(scene, 0.22, 0.30, 0.03, wx + EX, y - 0.14, wz + 0.148, glowM);
    box(scene, 0.03, 0.30, 0.22, wx + EX - 0.148 * Math.sign(extX), y - 0.14, wz, glowM);
    box(scene, 0.03, 0.30, 0.22, wx + EX + 0.148 * Math.sign(extX), y - 0.14, wz, glowM);
    // Roof cap
    box(scene, 0.32, 0.05, 0.32, wx + EX, y + 0.08, wz, ironM);
    // Pyramid finial top
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.18, 4), ironM);
    top.position.set(wx + EX, y + 0.20, wz); scene.add(top);
    // Pendant drop finial
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), ironM);
    fin.rotation.x = Math.PI; fin.position.set(wx + EX, y - 0.36, wz); scene.add(fin);
    // Scroll curl decoration on bracket
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 5, 10, Math.PI), ironM);
    scroll.rotation.z = extX > 0 ? -Math.PI / 2 : Math.PI / 2;
    scroll.position.set(wx + EX * 0.7, y + 0.05, wz); scene.add(scroll);
  }

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

  // ── Elegant bay tree (Louvre-style topiary in stone urn) ────────────────────
  // Shared lorTree materials & geometries (created once)
  const _lorTreeMats = {
    urn:   new THREE.MeshStandardMaterial({ color: 0x8c9090, roughness: 0.72, metalness: 0.08 }),
    rim:   new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.28, metalness: 0.75, emissive: 0x806418, emissiveIntensity: 0.20 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.88, metalness: 0.0  }),
    leaf:  new THREE.MeshStandardMaterial({ color: 0x2a5518, roughness: 0.80, metalness: 0.0,  emissive: 0x0a1a06, emissiveIntensity: 0.15 }),
  };
  const _lorTreeGeos = {
    urn:   new THREE.CylinderGeometry(0.34, 0.24, 0.55, 12),
    rim:   new THREE.TorusGeometry(0.34, 0.03, 6, 20),
    trunk: new THREE.CylinderGeometry(0.06, 0.09, 1.8, 7),
    ball:  new THREE.SphereGeometry(0.68, 9, 7),
    top:   new THREE.SphereGeometry(0.28, 7, 5),
  };
  function lorTree(scene, x, z) {
    const { urn: urnMat, rim: goldRim, trunk: trunkMat, leaf: leafMat } = _lorTreeMats;
    const urn = new THREE.Mesh(_lorTreeGeos.urn, urnMat);
    urn.position.set(x, 0.275, z); urn.castShadow = true; scene.add(urn);
    const rim = new THREE.Mesh(_lorTreeGeos.rim, goldRim);
    rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.55, z); scene.add(rim);
    const trunk = new THREE.Mesh(_lorTreeGeos.trunk, trunkMat);
    trunk.position.set(x, 1.45, z); trunk.castShadow = true; scene.add(trunk);
    const ball = new THREE.Mesh(_lorTreeGeos.ball, leafMat);
    ball.position.set(x, 3.08, z); ball.castShadow = true; scene.add(ball);
    const top = new THREE.Mesh(_lorTreeGeos.top, leafMat);
    top.position.set(x, 3.92, z); top.castShadow = true; scene.add(top);
    addWallAABB(x, z, 0.9, 0.9);
  }

  // ── Room name sign — hanging gold panel above a doorway ─────────────────────
  function roomLabel(scene, cx, cz, text, rotY) {
    const W = 512, H = 128;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#110e07';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = '#9a7a20'; ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, W - 32, H - 32);
    ctx.fillStyle = '#e8c870';
    ctx.font = 'bold italic 38px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(cv), roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.045), mat);
    sign.position.set(cx, WALL_H - 0.48, cz);
    if (rotY) sign.rotation.y = rotY;
    scene.add(sign);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.28, metalness: 0.78 });
    [-0.85, 0.85].forEach(ox => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 5), rodMat);
      rod.position.set(cx + (rotY ? 0 : ox), WALL_H - 0.15, cz + (rotY ? ox : 0));
      scene.add(rod);
    });
  }

  // ── Gold ceiling perimeter trim (Louvre cornice) ────────────────────────────
  function goldCeilEdge(scene, cx, cz, w, d) {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc8a040, roughness: 0.22, metalness: 0.80, emissive: 0x806418, emissiveIntensity: 0.22,
    });
    const T = 0.20, yy = WALL_H - 0.10;
    box(scene, w + T, T, T, cx, yy, cz - d / 2, goldMat);
    box(scene, w + T, T, T, cx, yy, cz + d / 2, goldMat);
    box(scene, T, T, d - T, cx - w / 2, yy, cz, goldMat);
    box(scene, T, T, d - T, cx + w / 2, yy, cz, goldMat);
  }

  function galleryBench(scene, x, z, rotY) {
    const woodM  = new THREE.MeshStandardMaterial({ color: 0x5a2e10, roughness: 0.72, metalness: 0.0 });
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
    // Lobby walls — skip west wall so we can add a service exit gap
    roomWalls(scene, 0, 20, 40, 40, { north: true, south: true, west: true });

    // Lobby west wall — full continuous wall X=-20, Z 0→40
    wall(scene, -20, 20, WALL_T, 40);

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

    // Guard spawns — Lobby (2 guards, randomized routes each run)
    guardData.push({
      spawnX: -8, spawnZ: 4,
      waypoints: _route(
        // Route A: outer rectangle
        [new THREE.Vector3(-8,0,4), new THREE.Vector3(-8,0,36), new THREE.Vector3(8,0,36), new THREE.Vector3(8,0,4)],
        // Route B: diagonal cross sweep
        [new THREE.Vector3(-14,0,4), new THREE.Vector3(14,0,36), new THREE.Vector3(14,0,4), new THREE.Vector3(-14,0,36)],
        // Route C: north-side focus with center pass
        [new THREE.Vector3(-8,0,4), new THREE.Vector3(0,0,20), new THREE.Vector3(8,0,4), new THREE.Vector3(8,0,36), new THREE.Vector3(-8,0,36)]
      ),
    });
    guardData.push({
      spawnX: 8, spawnZ: 36,
      waypoints: _route(
        // Route A: outer rectangle (counter-clockwise)
        [new THREE.Vector3(8,0,36), new THREE.Vector3(-8,0,36), new THREE.Vector3(-8,0,4), new THREE.Vector3(8,0,4)],
        // Route B: east-side tight loop
        [new THREE.Vector3(8,0,36), new THREE.Vector3(14,0,20), new THREE.Vector3(8,0,4), new THREE.Vector3(0,0,20)],
        // Route C: south-heavy patrol
        [new THREE.Vector3(8,0,4), new THREE.Vector3(-8,0,4), new THREE.Vector3(-8,0,20), new THREE.Vector3(8,0,20)]
      ),
    });

    // Security camera — Lobby
    cameraData.push({
      x: 0, y: WALL_H - 0.3, z: 20,
      sweepAngle: Math.PI / 3, facingZ: -1,
    });

    // Wall lanterns — Lobby west wall (lanterns between paintings)
    wallLantern(scene, -19.85, 3.2,  3.0,  1);
    wallLantern(scene, -19.85, 3.2, 11.5,  1);
    wallLantern(scene, -19.85, 3.2, 17.5,  1);
    wallLantern(scene, -19.85, 3.2, 24.0,  1);
    wallLantern(scene, -19.85, 3.2, 31.5,  1);
    wallLantern(scene, -19.85, 3.2, 37.0,  1);
    // Wall lanterns — Lobby east wall
    wallLantern(scene,  19.85, 3.2,  2.5, -1);
    wallLantern(scene,  19.85, 3.2,  7.0, -1);
    wallLantern(scene,  19.85, 3.2, 13.5, -1);
    wallLantern(scene,  19.85, 3.2, 19.0, -1);
    wallLantern(scene,  19.85, 3.2, 25.5, -1);
    wallLantern(scene,  19.85, 3.2, 32.0, -1);
    wallLantern(scene,  19.85, 3.2, 38.0, -1);
    // Museum visitors removed
    // Yellow keycard door at corridor entrance
    door(scene, 0, 39.75, 'yellow');

    // Lobby fountain — grand centerpiece
    lobbyFountain(scene, 0, 26);
    lobbyChandelier(scene, 0, 26);

    // Ceiling lamps above existing point lights
    [[-8, 10], [8, 10], [-8, 30], [8, 30]].forEach(([lx, lz]) => ceilingLamp(scene, lx, lz));

    // Corner plants
    [[-17, 4], [17, 4], [-17, 36], [17, 36]].forEach(([px, pz]) => plantPot(scene, px, pz, 1.4));

    // Decorative bay trees flanking the fountain
    lorTree(scene, -14, 22);
    lorTree(scene,  14, 22);

    // Gold ceiling cornice trim
    goldCeilEdge(scene, 0, 20, 40, 40);

    // Room labels above doorways
    roomLabel(scene, 0,  2.0, 'Vestibule');               // entry side
    roomLabel(scene, 0, 37.8, 'Grande Galerie');           // gallery-side label above yellow door

    // Paintings on the lobby north-wall stubs (flanking yellow door), facing south into lobby
    wallPaintingNS(scene, -15, 3.5, 39.65, M.paintings[1], false);
    paintingSpotlight(scene, -15, 3.5, 39.65, 'north');
    placard(scene, -15, 2.6, 39.65, 'The Raft of the Medusa', 'Théodore Géricault, 1818', 'north');
    wallPaintingNS(scene,  15, 3.5, 39.65, M.paintings[2], false);
    paintingSpotlight(scene,  15, 3.5, 39.65, 'north');
    placard(scene,  15, 2.6, 39.65, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', 'north');

    // Velvet runner carpet toward the gallery door
    rug(scene, 0, 38, 3, 4, 0x6b1a1a, 0xc8a040);

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

    // Extra lobby paintings — west wall (Z=14 was inside the service exit gap Z=13.5→16.5, moved to Z=11)
    wallPainting(scene, -19.9, 3.5, 11, M.vangoghSunflowers, true);
    paintingSpotlight(scene, -19.9, 3.5, 11, 'west');
    placard(scene, -19.9, 2.6, 11, 'Sunflowers', 'Vincent van Gogh, 1888', 'west');
    wallPainting(scene, -19.9, 3.5, 20, M.monetSunrise, true);
    paintingSpotlight(scene, -19.9, 3.5, 20, 'west');
    placard(scene, -19.9, 2.6, 20, 'Impression, Sunrise', 'Claude Monet, 1872', 'west');
    wallPainting(scene, -19.9, 3.5, 34, M.cezanne, true);
    paintingSpotlight(scene, -19.9, 3.5, 34, 'west');
    placard(scene, -19.9, 2.6, 34, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', 'west');
    // Extra lobby paintings — east wall
    wallPainting(scene, 19.9, 3.5, 10, M.vangoghStarry, false);
    paintingSpotlight(scene, 19.9, 3.5, 10, 'east');
    placard(scene, 19.9, 2.6, 10, 'The Starry Night', 'Vincent van Gogh, 1889', 'east');
    wallPainting(scene, 19.9, 3.5, 22, M.renoir, false);
    paintingSpotlight(scene, 19.9, 3.5, 22, 'east');
    placard(scene, 19.9, 2.6, 22, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', 'east');
    wallPainting(scene, 19.9, 3.5, 36, M.monetPoppies, false);
    paintingSpotlight(scene, 19.9, 3.5, 36, 'east');
    placard(scene, 19.9, 2.6, 36, 'Poppies', 'Claude Monet, 1873', 'east');
    // Extra lobby paintings — south wall (entrance wall stubs)
    wallPaintingNS(scene, -16, 3.5, 0.10, M.vangoghIrises, true);
    paintingSpotlight(scene, -16, 3.5, 0.10, 'south');
    placard(scene, -16, 2.6, 0.10, 'Irises', 'Vincent van Gogh, 1889', 'south');
    wallPaintingNS(scene,  16, 3.5, 0.10, M.monetSunrise, true);
    paintingSpotlight(scene,  16, 3.5, 0.10, 'south');
    placard(scene,  16, 2.6, 0.10, 'Impression, Sunrise', 'Claude Monet, 1872', 'south');
    // Extra lobby paintings — north wall stubs
    wallPaintingNS(scene, -8, 3.5, 39.65, M.vangoghStarry, false);
    paintingSpotlight(scene, -8, 3.5, 39.65, 'north');
    placard(scene, -8, 2.6, 39.65, 'The Starry Night', 'Vincent van Gogh, 1889', 'north');
    wallPaintingNS(scene,  8, 3.5, 39.65, M.vangoghSunflowers, false);
    paintingSpotlight(scene,  8, 3.5, 39.65, 'north');
    placard(scene,  8, 2.6, 39.65, 'Sunflowers', 'Vincent van Gogh, 1888', 'north');
    // Extra lobby bay trees
    lorTree(scene, -5, 6);
    lorTree(scene,  5, 6);
    lorTree(scene, -14, 10);
    lorTree(scene,  14, 10);

    // Glowing archway at yellow keycard door so the exit is obvious
    doorGlow(scene, 0, 39.75, 0xf0c040);

    // ── FEATURE 2: Skylight in Lobby ceiling (rappel entry) ─────────────────
    // Rappel players start on the rooftop and must pry open this hatch to drop in.
    {
      const HATCH_Y = WALL_H + FLOOR_T + 0.12;  // top surface of the closed hatch
      const metalFrameMat = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.4, metalness: 0.7 });
      const hatchBodyMat  = new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.55, metalness: 0.85 });
      const hatchRimMat   = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.35, metalness: 0.90, emissive: 0x102030, emissiveIntensity: 0.2 });

      // Glass pane under the hatch (visible from inside lobby once hatch is open)
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff, roughness: 0.05, metalness: 0.1,
        transparent: true, opacity: 0.22,
        emissive: 0x4488cc, emissiveIntensity: 0.18,
        side: THREE.DoubleSide,
      });
      box(scene, 4.0, 0.06, 4.0, 0, WALL_H + FLOOR_T + 0.03, 20, glassMat);

      // Metal frame lips around the skylight hole (raised above rooftop surface)
      box(scene, 4.6, 0.16, 0.16, 0, WALL_H + FLOOR_T + 0.08, 17.92, metalFrameMat); // south lip
      box(scene, 4.6, 0.16, 0.16, 0, WALL_H + FLOOR_T + 0.08, 22.08, metalFrameMat); // north lip
      box(scene, 0.16, 0.16, 4.6, -2.23, WALL_H + FLOOR_T + 0.08, 20, metalFrameMat); // west lip
      box(scene, 0.16, 0.16, 4.6,  2.23, WALL_H + FLOOR_T + 0.08, 20, metalFrameMat); // east lip

      // Hatch cover — solid panel the player stands on before opening
      const hatchMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.14, 4.2),
        hatchBodyMat
      );
      hatchMesh.position.set(0, HATCH_Y, 20);
      scene.add(hatchMesh);

      // Hatch rim bevel
      const rimMesh = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.06, 4.5), hatchRimMat);
      rimMesh.position.set(0, HATCH_Y - 0.04, 20);
      scene.add(rimMesh);

      // Hatch handle — raised latch knob
      const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4aa30, roughness: 0.22, metalness: 0.95, emissive: 0x332200, emissiveIntensity: 0.3 });
      box(scene, 0.55, 0.08, 0.18, 0, HATCH_Y + 0.11, 20.5, handleMat);   // latch bar
      box(scene, 0.14, 0.22, 0.14, -0.20, HATCH_Y + 0.11, 20.5, handleMat); // left post
      box(scene, 0.14, 0.22, 0.14,  0.20, HATCH_Y + 0.11, 20.5, handleMat); // right post

      // Rooftop AC unit near the skylight (visual detail)
      const acMat  = new THREE.MeshStandardMaterial({ color: 0x4a5060, roughness: 0.65, metalness: 0.6 });
      const acVent = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.8, metalness: 0.4 });
      box(scene, 1.8, 0.9, 1.2,  3.5, HATCH_Y + 0.45, 18, acMat);      // AC body
      box(scene, 1.75, 0.5, 0.08,  3.5, HATCH_Y + 0.50, 17.42, acVent); // front vent grille
      box(scene, 0.1, 0.7, 1.1, 4.42, HATCH_Y + 0.45, 18, acMat);       // side panel

      // Cable conduit running from AC toward south wall
      box(scene, 0.12, 0.10, 2.5,  3.8, HATCH_Y + 0.06, 15.5, acMat);

      skylightHatch = {
        open:    false,
        opening: false,
        _animT:  0,
        mesh:    hatchMesh,
        rimMesh: rimMesh,
        x:       0,
        z:       20,
        roofY:   HATCH_Y,  // Y at which rooftop floor clamp engages
        origX:   0,
        origY:   HATCH_Y,
        origZ:   20,
      };
    }


    // ── FEATURE 3: Trapdoor in Lobby → Underground Service Tunnel ──────────
    {
      const trapdoorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75, metalness: 0.65 });
      const tdMesh = box(scene, 1.8, 0.10, 1.8, 0, 0.05, 28, trapdoorMat);
      // Latch/handle detail
      const latchMat = new THREE.MeshStandardMaterial({ color: 0xc09030, roughness: 0.3, metalness: 0.8 });
      box(scene, 0.5, 0.06, 0.1, 0, 0.12, 28.6, latchMat);
      vents.push({ entryX: 0, entryZ: 28, exitX: 0, exitZ: 130, exitY: 0, label: 'Tunnel', mesh: tdMesh });
    }

    // ── FEATURE 3: Underground tunnel corridor Y=-3, Z=28→130 ─────────────
    {
      const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 0.90, metalness: 0.0 });
      const tunnelCeilMat = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95, metalness: 0.0 });
      const tunnelFloorMat = new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.85, metalness: 0.0 });
      const tunnelLen = 102; // Z 28→130
      const tunnelCZ  = (28 + 130) / 2; // 79
      // Floor slab
      box(scene, 4, 0.3, tunnelLen, 0, -3.15, tunnelCZ, tunnelFloorMat);
      // Ceiling slab
      box(scene, 4, 0.3, tunnelLen, 0, -0.65, tunnelCZ, tunnelCeilMat);
      // West wall
      box(scene, 0.25, 2.5, tunnelLen, -2.125, -2.0, tunnelCZ, tunnelMat);
      // East wall
      box(scene, 0.25, 2.5, tunnelLen,  2.125, -2.0, tunnelCZ, tunnelMat);
      // Tunnel walls use emissive strip lights rather than PointLights (no per-light cost)
      const tunnelGlowMat = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.55 });
      [50, 75, 100].forEach(lz => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 0.3), tunnelGlowMat);
        strip.position.set(0, -0.8, lz);
        scene.add(strip);
      });
    }

    // ════════════════════════════════
    //  EXTERIOR ENTRANCE PLAZA  Z=-22→0  X=-20→20
    //  Player spawns here and must pick the front lock.
    // ════════════════════════════════
    {
      // ── Materials ──────────────────────────────────────
      const extFloorMat = new THREE.MeshStandardMaterial({ color: 0x8a8480, roughness: 0.96, metalness: 0.0 });
      const mFacade     = new THREE.MeshStandardMaterial({ color: 0x787068, roughness: 0.92, metalness: 0.0 });
      const mCorniceExt = new THREE.MeshStandardMaterial({ color: 0x9a8860, roughness: 0.60, metalness: 0.12 });
      const mWinExt     = new THREE.MeshBasicMaterial({ color: 0x1a2a3a });
      const mWalkExt    = new THREE.MeshStandardMaterial({ color: 0xa09888, roughness: 0.90, metalness: 0.0 });
      const mStoneDec   = new THREE.MeshStandardMaterial({ color: 0x6a6460, roughness: 0.82, metalness: 0.0 });
      const mStep       = new THREE.MeshStandardMaterial({ color: 0x807870, roughness: 0.88, metalness: 0.0 });
      const mHedge      = new THREE.MeshStandardMaterial({ color: 0x224a1c, roughness: 0.98, metalness: 0.0 });
      const mSoil       = new THREE.MeshStandardMaterial({ color: 0x3a2810, roughness: 0.99, metalness: 0.0 });
      const mGardenStat = new THREE.MeshStandardMaterial({ color: 0x928e88, roughness: 0.80, metalness: 0.0 });
      const mGrass      = new THREE.MeshStandardMaterial({ color: 0x3a6830, roughness: 0.98, metalness: 0.0 });
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

      // ── Stone quoins at facade corners ─────────────────
      {
        const mQuoin = new THREE.MeshStandardMaterial({ color: 0x5e5a56, roughness: 0.90, metalness: 0.0 });
        // Alternating tall/short quoin blocks at building corners
        [0.22, 1.00, 1.72, 2.48, 3.28, 4.14, 5.05].forEach((qy, i) => {
          const qh = (i % 2 === 0) ? 0.56 : 0.40;
          const qd = (i % 2 === 0) ? 0.62 : 0.46;
          const qw = (i % 2 === 0) ? 0.80 : 0.60;
          box(scene, qw, qh, qd, -18.95, qy + qh / 2, -0.52, mQuoin);
          box(scene, qw, qh, qd,  18.95, qy + qh / 2, -0.52, mQuoin);
        });
        // Horizontal rustication grooves on lower base (scored-stone look)
        [0.82, 1.64, 2.45].forEach(gy => {
          box(scene, 18.2, 0.055, 0.40, -10.75, gy, -0.42, mQuoin);
          box(scene, 18.2, 0.055, 0.40,  10.75, gy, -0.42, mQuoin);
        });
        // Window keystones above each facade window
        [-16.5, -10.75, -5, 5, 10.75, 16.5].forEach(kx => {
          box(scene, 0.52, 0.34, 0.20, kx, 5.38, -0.50, mQuoin);
        });
      }

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

      // ── "THE LOUVRE" entrance sign — canvas texture ────
      {
        const sCv = document.createElement('canvas');
        sCv.width = 1024; sCv.height = 128;
        const sCtx = sCv.getContext('2d');
        // Rich dark background gradient
        const sBg = sCtx.createLinearGradient(0, 0, 0, 128);
        sBg.addColorStop(0, '#0d0c0a'); sBg.addColorStop(1, '#1a1510');
        sCtx.fillStyle = sBg; sCtx.fillRect(0, 0, 1024, 128);
        // Outer gold border
        sCtx.strokeStyle = '#c8a030'; sCtx.lineWidth = 5;
        sCtx.strokeRect(5, 5, 1014, 118);
        // Inner thin border
        sCtx.strokeStyle = '#e8c050'; sCtx.lineWidth = 2;
        sCtx.strokeRect(14, 14, 996, 100);
        // Corner diamond ornaments
        const drawDiamond = (dx, dy, sz) => {
          sCtx.save(); sCtx.translate(dx, dy); sCtx.rotate(Math.PI / 4);
          sCtx.fillStyle = '#e8c050'; sCtx.fillRect(-sz / 2, -sz / 2, sz, sz); sCtx.restore();
        };
        drawDiamond(14, 14, 9); drawDiamond(1010, 14, 9);
        drawDiamond(14, 114, 9); drawDiamond(1010, 114, 9);
        // Decorative vertical rules at sides
        sCtx.strokeStyle = '#c8a030'; sCtx.lineWidth = 1.5;
        [25, 999].forEach(ex => { sCtx.beginPath(); sCtx.moveTo(ex, 28); sCtx.lineTo(ex, 100); sCtx.stroke(); });
        // Main text — THE LOUVRE
        sCtx.shadowColor = '#c8900a'; sCtx.shadowBlur = 10;
        sCtx.fillStyle = '#ead060';
        sCtx.font = 'bold 58px "Times New Roman", Georgia, serif';
        sCtx.textAlign = 'center'; sCtx.textBaseline = 'alphabetic';
        sCtx.fillText('THE LOUVRE', 512, 76);
        // Subtitle
        sCtx.shadowBlur = 0; sCtx.fillStyle = '#b89030';
        sCtx.font = 'italic 20px "Times New Roman", Georgia, serif';
        sCtx.fillText('Musée du Louvre  ·  Paris', 512, 106);
        // Horizontal rules flanking title
        sCtx.strokeStyle = '#c8a030'; sCtx.lineWidth = 1;
        sCtx.beginPath(); sCtx.moveTo(34, 62); sCtx.lineTo(300, 62); sCtx.stroke();
        sCtx.beginPath(); sCtx.moveTo(724, 62); sCtx.lineTo(990, 62); sCtx.stroke();
        const sTex = new THREE.CanvasTexture(sCv);
        // Sign backing (dark stone frame)
        const mSignBack = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 0.5, metalness: 0.3 });
        box(scene, 8.8, 1.20, 0.14, 0, WALL_H - 0.88, -0.22, mSignBack);
        // Sign face panel
        const signMat = new THREE.MeshStandardMaterial({
          map: sTex, emissiveMap: sTex, emissive: 0xffd868, emissiveIntensity: 0.40,
          roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide,
        });
        const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 1.05), signMat);
        signMesh.position.set(0, WALL_H - 0.88, -0.14); scene.add(signMesh);
        // Gold accent moldings above and below sign
        const mGoldMold = new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.22, metalness: 0.80 });
        box(scene, 9.0, 0.13, 0.22, 0, WALL_H - 0.30, -0.20, mGoldMold);
        box(scene, 9.0, 0.13, 0.22, 0, WALL_H - 1.46, -0.20, mGoldMold);
        // Gold bolt rivets at sign corners
        [-3.9, 3.9].forEach(bx => {
          const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8), mGoldMold);
          bolt.rotation.x = Math.PI / 2; bolt.position.set(bx, WALL_H - 0.88, -0.12); scene.add(bolt);
        });
      }

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

      // ── Lawn panels flanking the central walkway ─────────
      box(scene, 10, 0.018, 20, -15, 0.009, -11, mGrass);
      box(scene, 10, 0.018, 20,  15, 0.009, -11, mGrass);

      // ── Formal hedge borders ──────────────────────────────
      // Long hedge rows against the building side walls
      box(scene, 0.55, 1.05, 20, -18.7, 0.525, -11, mHedge);
      box(scene, 0.55, 1.05, 20,  18.7, 0.525, -11, mHedge);
      // Cross hedges dividing lawn into garden compartments
      box(scene, 9.5, 1.05, 0.55, -15, 0.525,  -4, mHedge);
      box(scene, 9.5, 1.05, 0.55,  15, 0.525,  -4, mHedge);
      box(scene, 9.5, 1.05, 0.55, -15, 0.525, -19, mHedge);
      box(scene, 9.5, 1.05, 0.55,  15, 0.525, -19, mHedge);

      // ── Flower beds in garden compartments ───────────────
      {
        // Shared materials & geometries (created once, reused across all beds)
        const mStem = new THREE.MeshLambertMaterial({ color: 0x2a6020 });
        const bedColors = [0xee3333, 0xffcc00, 0xff88bb, 0x9933ee, 0xff6600, 0x44bbee, 0xff4488, 0x88dd44];
        const flowerMats = bedColors.map(c => new THREE.MeshLambertMaterial({ color: c }));
        const flowerGeoSm = new THREE.SphereGeometry(0.09, 5, 4);
        const flowerGeoLg = new THREE.SphereGeometry(0.12, 5, 4);
        const stemGeo = new THREE.BoxGeometry(0.04, 1, 0.04); // scaled per stem
        function flowerBed(fbx, fbz, fw, fd) {
          box(scene, fw, 0.12, fd, fbx, 0.06, fbz, mSoil);
          let fi = 0;
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5; col++) {
              const fx = fbx - fw / 2 + 0.28 + col * ((fw - 0.56) / 4);
              const fz = fbz - fd / 2 + 0.28 + row * ((fd - 0.56) / 2);
              const fh = 0.20 + (fi % 3) * 0.09;
              const stem = new THREE.Mesh(stemGeo, mStem);
              stem.scale.y = fh; stem.position.set(fx, fh / 2 + 0.12, fz); scene.add(stem);
              const flwr = new THREE.Mesh(fi % 2 === 0 ? flowerGeoSm : flowerGeoLg,
                flowerMats[fi % flowerMats.length]);
              flwr.position.set(fx, 0.12 + fh + 0.05, fz); scene.add(flwr);
              fi++;
            }
          }
        }
        flowerBed(-15, -11.5, 7.5, 5.5);  // west central bed (large)
        flowerBed( 15, -11.5, 7.5, 5.5);  // east central bed (large)
        flowerBed(-15,  -2.0, 7.5, 1.6);  // west near-entrance bed
        flowerBed( 15,  -2.0, 7.5, 1.6);  // east near-entrance bed
        flowerBed(-15, -20.5, 7.5, 1.6);  // west far bed (near fence)
        flowerBed( 15, -20.5, 7.5, 1.6);  // east far bed (near fence)
      }

      // ── Classical garden statues on pedestals ─────────────
      {
        function gardenStatue(sx, sz) {
          // Tiered stone pedestal
          box(scene, 1.05, 0.18, 1.05, sx, 0.09, sz, mStoneDec);
          box(scene, 0.78, 1.22, 0.78, sx, 0.79, sz, mStoneDec);
          box(scene, 1.05, 0.18, 1.05, sx, 1.47, sz, mStoneDec);
          const PY = 1.65;
          // Draped lower figure (robe/skirt)
          const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.27, 1.05, 8), mGardenStat);
          robe.position.set(sx, PY + 0.525, sz); scene.add(robe);
          // Torso
          const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.55, 8), mGardenStat);
          torso.position.set(sx, PY + 1.30, sz); scene.add(torso);
          // Head (slight tilt for life)
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mGardenStat);
          head.scale.set(0.88, 1.10, 0.88);
          head.position.set(sx + 0.04, PY + 1.88, sz - 0.06); scene.add(head);
          // Arms (Venus de Milo style — graceful partial limbs)
          const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.068, 0.38, 6), mGardenStat);
          armL.position.set(sx - 0.21, PY + 1.27, sz); armL.rotation.z = 0.55; scene.add(armL);
          const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.068, 0.44, 6), mGardenStat);
          armR.position.set(sx + 0.20, PY + 1.33, sz); armR.rotation.z = -0.38; scene.add(armR);
        }
        gardenStatue(-17,  -8);
        gardenStatue( 17,  -8);
        gardenStatue(-17, -16);
        gardenStatue( 17, -16);
      }

      // ── Ornamental trees flanking entrance and fence ──────
      lorTree(scene, -13, -3.5);
      lorTree(scene,  13, -3.5);
      lorTree(scene, -13, -20);
      lorTree(scene,  13, -20);

      // Baseboard strip
      box(scene, 39.6, 0.22, 0.09, 0, 0.11, -21.75, _baseMat);
    }

    // ════════════════════════════════
    //  CORRIDOR 1  cx=0  cz=47.5  10×15
    //  Guard checkpoint / break room
    // ════════════════════════════════
    floor(scene, 0, 47.5, 10, 15, M.corridorFloor1);
    ceiling(scene, 0, 47.5, 10, 15);
    wall(scene, -5, 47.5, WALL_T, 15, M.corridorWall);
    wall(scene,  5, 47.5, WALL_T, 15, M.corridorWall);

    // Corridor 1 lanterns
    wallLantern(scene, -4.85, 3.0, 44,  1);
    wallLantern(scene, -4.85, 3.0, 51,  1);
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
    // Corridor 1 paintings — south wall stub (west side, X=-3 avoids the center doorway gap)
    // and west wall center (north face of corridor has no backing wall at X=0)
    wallPaintingNS(scene, -3, 3.5, 40.35, M.vangoghIrises, true);
    paintingSpotlight(scene, -3, 3.5, 40.35, 'south');
    wallPainting(scene, -4.85, 3.5, 47.5, M.renoir, true);
    paintingSpotlight(scene, -4.85, 3.5, 47.5, 'west');
    // Velvet carpet runner through corridor 1
    rug(scene, 0, 47.5, 3.5, 14, 0x6b1a1a, 0xc8a040);

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

    // Corridor 1 — water cooler against west wall
    {
      const coolerBodyMat = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.40, metalness: 0.22 });
      const coolerBlueMat = new THREE.MeshStandardMaterial({ color: 0x3a7ecf, roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.72 });
      // Main cabinet
      box(scene, 0.52, 1.05, 0.46, -3.6, 0.525, 52.5, coolerBodyMat);
      // Water jug on top (semi-transparent blue)
      const jugMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.38, 10), coolerBlueMat);
      jugMesh.position.set(-3.6, 1.24, 52.5); scene.add(jugMesh);
      // Drip tray
      box(scene, 0.38, 0.04, 0.18, -3.6, 1.04, 52.5, _moldMat);
      // Dispenser buttons (tiny)
      box(scene, 0.08, 0.06, 0.04, -3.73, 0.82, 52.4,
        new THREE.MeshStandardMaterial({ color: 0xe03030, roughness: 0.3, metalness: 0.4 }));  // hot
      box(scene, 0.08, 0.06, 0.04, -3.73, 0.72, 52.4,
        new THREE.MeshStandardMaterial({ color: 0x3060e0, roughness: 0.3, metalness: 0.4 }));  // cold
    }

    // Corridor 1 — coffee mug on the guard break table
    {
      const mugMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.65, metalness: 0.05 });
      const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.040, 0.08, 8), mugMat);
      mugBody.position.set(2.2, 0.915, 48.2); scene.add(mugBody);
      // Handle (torus segment)
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.010, 5, 8, Math.PI), mugMat);
      handle.rotation.y = Math.PI / 2; handle.position.set(2.165, 0.915, 48.2); scene.add(handle);
    }

    // Corridor 1 — potted fern in south-east corner
    {
      const potMat  = new THREE.MeshStandardMaterial({ color: 0x8a4a20, roughness: 0.72, metalness: 0.0 });
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95, metalness: 0.0 });
      const fernMat = new THREE.MeshStandardMaterial({ color: 0x1a6010, roughness: 0.80, metalness: 0.0 });
      // Terracotta pot
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.14, 0.28, 8), potMat);
      pot.position.set(3.5, 0.14, 41.5); scene.add(pot);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 8), soilMat);
      soil.position.set(3.5, 0.295, 41.5); scene.add(soil);
      // Simple fern fronds (flat ellipses fanned out)
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4), fernMat);
        frond.scale.set(0.5, 0.32, 1.0);
        frond.position.set(
          3.5 + Math.cos(ang) * 0.18,
          0.50 + Math.abs(Math.sin(ang)) * 0.06,
          41.5 + Math.sin(ang) * 0.18
        );
        frond.rotation.y = ang; scene.add(frond);
      }
      // Central upright frond
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.10, 5, 4), fernMat);
      top.scale.set(0.45, 0.55, 0.45); top.position.set(3.5, 0.62, 41.5); scene.add(top);
    }

    // ════════════════════════════════
    //  GALLERY  cx=0  cz=77.5  50×45
    // ════════════════════════════════
    // Skip south/east/west walls — replace with stubs so corridor + side room openings work
    roomWalls(scene, 0, 77.5, 50, 45, { south: true, north: true, east: true, west: true }, M.galleryWall, M.galleryFloor, M.galleryCeil);

    // Gallery south wall stubs — 10-unit gap at X=0 matching corridor width (Z=55)
    wall(scene, -15, 55, 20, WALL_T, M.galleryWall);  // west stub: X -25→-5
    wall(scene,  15, 55, 20, WALL_T, M.galleryWall);  // east stub: X +5→+25

    // Gallery east wall stubs — 3-unit gap at Z=77 leading to the Salon des Antiquités
    wall(scene, 25, 65.25, WALL_T, 20.5, M.galleryWall);  // Z 55→75.5 (solid, south of Salon)
    // North stub split for Taxidermie entrance at Z=93 (3-unit gap, Z 91.5→94.5)
    wall(scene, 25, 85,    WALL_T, 13,  M.galleryWall);  // Z 78.5→91.5  south of taxi door
    wall(scene, 25, 97.25, WALL_T, 5.5, M.galleryWall);  // Z 94.5→100   north of taxi door

    // Gallery west wall stubs — 3-unit gap at Z=77 leading to the Galerie des Sculptures
    //   and additional 3-unit gap at Z=64 leading to the Power Breaker Room (Feature 7)
    // South section: Z 55→62.5 (length 7.5, centre 58.75) — solid, south of breaker door
    wall(scene, -25, 58.75, WALL_T, 7.5, M.galleryWall);
    // Middle stub: Z 65.5→75.5 (length 10, centre 70.5) — between breaker gap and Galerie gap
    wall(scene, -25, 70.5, WALL_T, 10, M.galleryWall);
    // North stub split for Salle des Statues corridor at Z=90→96 (6-unit gap)
    wall(scene, -25, 84.25, WALL_T, 11.5, M.galleryWall);  // Z 78.5→90  south of Statues corridor
    wall(scene, -25, 98,    WALL_T,  4.0, M.galleryWall);  // Z 96→100   north of Statues corridor

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

    // La Joconde (Mona Lisa) — main stealable painting on west wall of gallery (Z=86, on solid wall stub Z=78.5→90)
    const monaWallMesh = wallPainting(scene, -24.9, 3.8, 86, M.monaLisa, true);
    paintingSpotlight(scene, -24.9, 3.8, 86, 'west');
    const paintMesh = box(scene, 0.05, 2.0, 2.8, -24.9, 3.8, 86, M.monaLisa);
    stealables.push({ mesh: paintMesh, wallMesh: monaWallMesh, item: 'painting', x: -24.9, z: 86, taken: false, value: 800000000 });
    placard(scene, -24.9, 2.6, 86, 'Mona Lisa', 'Léonard de Vinci, c. 1503', 'west');
    // Glowing floor ring — guides player to the stealable painting
    const paintRingMat = new THREE.MeshStandardMaterial({
      color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 0.8, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const paintRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 32), paintRingMat);
    paintRing.rotation.x = -Math.PI / 2;
    paintRing.position.set(-24.5, 0.02, 86);
    scene.add(paintRing);
    paintMesh.userData.floorRing = paintRing;  // hidden when painting is taken

    // Velvet rope barrier around the Mona Lisa
    stanchion(scene, -21.2, 83.0);
    stanchion(scene, -21.2, 86.0);
    stanchion(scene, -21.2, 89.0);
    velvetRope(scene, -21.2, 83.0, -21.2, 86.0);
    velvetRope(scene, -21.2, 86.0, -21.2, 89.0);

    // Display cases
    displayCase(scene,  14, 70);
    displayCaseContents(scene,  14, 70, 'coins');
    displayCaseRopes(scene,  14, 70);
    displayCase(scene, -14, 70);
    displayCaseContents(scene, -14, 70, 'ring');
    displayCaseRopes(scene, -14, 70);
    const _jadeGlass = displayCase(scene,   0, 88);
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
    stealables.push({ mesh: jadeFig, item: 'jade', x: 0, z: 88, taken: false, bonus: true, label: 'Jade Figurine', value: 2000000, hasCase: true, caseBroken: false, caseMesh: _jadeGlass });
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

    // Gallery marble busts — on tall pedestals between pillars
    {
      const bustMat = new THREE.MeshStandardMaterial({ color: 0xeae0d0, roughness: 0.55, metalness: 0.04 });
      const bustPositions = [
        [18, 65], [-18, 65], [18, 88], [-8, 96],
      ];
      bustPositions.forEach(([bx, bz]) => {
        // Pedestal plinth
        box(scene, 0.55, 0.90, 0.55, bx, 0.45, bz, M.pedestal);
        // Neck / torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.28, 8), bustMat);
        torso.position.set(bx, 1.04, bz);
        scene.add(torso);
        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), bustMat);
        head.position.set(bx, 1.37, bz);
        scene.add(head);
        // Slight face-forward tilt
        head.rotation.x = -0.12;
        // Simple nose bump
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), bustMat);
        nose.position.set(bx, 1.37, bz - 0.19);
        nose.scale.set(0.7, 0.6, 0.5);
        scene.add(nose);
        addWallAABB(bx, bz, 0.7, 0.7);
      });
    }

    // Gallery floor-standing urns flanking the Mona Lisa alcove
    {
      const urnMat = new THREE.MeshStandardMaterial({ color: 0x1a1040, roughness: 0.60, metalness: 0.12 });
      const goldBand = new THREE.MeshStandardMaterial({ color: 0xc89830, roughness: 0.30, metalness: 0.72 });
      [86, 98].forEach(uz => {
        const ux = -22;
        // Urn base disc
        const uBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10), goldBand);
        uBase.position.set(ux, 0.03, uz); scene.add(uBase);
        // Urn body — tapered
        const uBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.72, 10), urnMat);
        uBody.position.set(ux, 0.39, uz); scene.add(uBody);
        // Gold mid-band ring
        const uRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 6, 14), goldBand);
        uRing.rotation.x = Math.PI / 2; uRing.position.set(ux, 0.55, uz); scene.add(uRing);
        // Urn neck
        const uNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 0.22, 10), urnMat);
        uNeck.position.set(ux, 0.86, uz); scene.add(uNeck);
        // Urn mouth
        const uMouth = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.030, 6, 14), goldBand);
        uMouth.rotation.x = Math.PI / 2; uMouth.position.set(ux, 0.99, uz); scene.add(uMouth);
        addWallAABB(ux, uz, 0.5, 0.5);
      });
    }

    // Gallery decorative paintings
    wallPainting(scene, -24.9, 3.5, 70, M.paintings[0], true);
    paintingSpotlight(scene, -24.9, 3.5, 70, 'west');
    placard(scene, -24.9, 2.6, 70, 'Liberty Leading the People', 'Eugène Delacroix, 1830', 'west');
    wallPainting(scene,  24.9, 3.5, 80, M.paintings[1], false);
    paintingSpotlight(scene,  24.9, 3.5, 80, 'east');
    placard(scene,  24.9, 2.6, 80, 'The Raft of the Medusa', 'Théodore Géricault, 1818', 'east');
    wallPainting(scene,  24.9, 3.5, 60, M.paintings[2], false);
    paintingSpotlight(scene,  24.9, 3.5, 60, 'east');
    placard(scene,  24.9, 2.6, 60, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', 'east');
    // Hack terminal
    terminal(scene, 20, 78);

    // Guard spawns — Gallery (3 guards, randomized routes each run)
    guardData.push({
      spawnX: -10, spawnZ: 60,
      waypoints: _route(
        // Route A: south gallery rectangle
        [new THREE.Vector3(-10,0,60), new THREE.Vector3(10,0,60), new THREE.Vector3(10,0,78), new THREE.Vector3(-10,0,78)],
        // Route B: west-wall sweep
        [new THREE.Vector3(-20,0,60), new THREE.Vector3(-20,0,78), new THREE.Vector3(-5,0,78), new THREE.Vector3(-5,0,60)],
        // Route C: diagonal through gallery center
        [new THREE.Vector3(-10,0,60), new THREE.Vector3(10,0,78), new THREE.Vector3(-10,0,78), new THREE.Vector3(10,0,60)]
      ),
    });
    guardData.push({
      spawnX: 0, spawnZ: 92,
      waypoints: _route(
        // Route A: north gallery sweep
        [new THREE.Vector3(0,0,92), new THREE.Vector3(16,0,92), new THREE.Vector3(16,0,98), new THREE.Vector3(-16,0,98), new THREE.Vector3(-16,0,92)],
        // Route B: east-to-center loop
        [new THREE.Vector3(16,0,90), new THREE.Vector3(16,0,98), new THREE.Vector3(0,0,98), new THREE.Vector3(0,0,90)],
        // Route C: wide north patrol
        [new THREE.Vector3(-18,0,88), new THREE.Vector3(18,0,88), new THREE.Vector3(18,0,98), new THREE.Vector3(-18,0,98)]
      ),
    });
    guardData.push({
      spawnX: -15, spawnZ: 65,
      waypoints: _route(
        // Route A: west corridor loop
        [new THREE.Vector3(-15,0,65), new THREE.Vector3(-15,0,75), new THREE.Vector3(5,0,75), new THREE.Vector3(5,0,65)],
        // Route B: bench area sweep
        [new THREE.Vector3(-15,0,68), new THREE.Vector3(0,0,68), new THREE.Vector3(0,0,80), new THREE.Vector3(-15,0,80)],
        // Route C: tight west-wall post
        [new THREE.Vector3(-20,0,62), new THREE.Vector3(-20,0,78), new THREE.Vector3(-10,0,78), new THREE.Vector3(-10,0,62)]
      ),
    });

    // Cameras — Gallery
    cameraData.push({ x: -10, y: WALL_H - 0.3, z: 84, sweepAngle: Math.PI / 2.5, facingZ:  1 });
    cameraData.push({ x:  10, y: WALL_H - 0.3, z: 64, sweepAngle: Math.PI / 2.5, facingZ:  1 });

    // Wall lanterns — Gallery west wall
    wallLantern(scene, -24.85, 3.2, 62,  1);
    wallLantern(scene, -24.85, 3.2, 68,  1);
    wallLantern(scene, -24.85, 3.2, 79,  1);
    wallLantern(scene, -24.85, 3.2, 89,  1);
    wallLantern(scene, -24.85, 3.2, 97,  1);
    // Wall lanterns — Gallery east wall
    wallLantern(scene,  24.85, 3.2, 62, -1);
    wallLantern(scene,  24.85, 3.2, 68, -1);
    wallLantern(scene,  24.85, 3.2, 80, -1);  // moved from 77 — Z=75.5→78.5 is Salon entrance gap
    wallLantern(scene,  24.85, 3.2, 88, -1);
    wallLantern(scene,  24.85, 3.2, 97, -1);
    // Museum visitors removed
    // Blue keycard door
    door(scene, 0, 99.75, 'blue');

    // Gallery ceiling lamps above point lights
    [[-10, 65], [10, 65], [0, 80], [-10, 95], [10, 95]].forEach(([lx, lz]) => ceilingLamp(scene, lx, lz));

    // Gallery chandeliers
    lobbyChandelier(scene,  0, 72);
    lobbyChandelier(scene, -8, 88);
    lobbyChandelier(scene,  8, 88);

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

    // Gold ceiling cornice trim
    goldCeilEdge(scene, 0, 77.5, 50, 45);

    // Room labels
    roomLabel(scene, 0, 56.5, 'Grande Galerie');              // south entrance label
    roomLabel(scene, 0, 98.5, 'Galerie des Couronnes');       // north exit toward vault

    // Decorative bay trees in gallery corners and center
    lorTree(scene, -18, 63);
    lorTree(scene,  18, 63);
    lorTree(scene, -18, 91);
    lorTree(scene,  18, 91);

    // Extra gallery pillars — inner colonnade row
    pillar(scene, -7, 62);
    pillar(scene,  7, 62);
    pillar(scene, -7, 92);
    pillar(scene,  7, 92);

    // Additional paintings on gallery walls (salon-style density)
    wallPainting(scene, -24.9, 3.5, 82, M.paintings[2], true);
    paintingSpotlight(scene, -24.9, 3.5, 82, 'west');
    placard(scene, -24.9, 2.6, 82, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', 'west');
    wallPainting(scene, -24.9, 3.5, 60, M.paintings[4], true);
    paintingSpotlight(scene, -24.9, 3.5, 60, 'west');
    placard(scene, -24.9, 2.6, 60, 'Wedding at Cana', 'Paolo Veronese, 1563', 'west');
    wallPainting(scene,  24.9, 3.5, 70, M.paintings[3], false);
    paintingSpotlight(scene,  24.9, 3.5, 70, 'east');
    placard(scene,  24.9, 2.6, 70, 'Oath of the Horatii', 'Jacques-Louis David, 1784', 'east');

    // Paintings on gallery north-wall stubs (flanking blue door), facing south
    wallPaintingNS(scene, -15, 3.5, 99.90, M.paintings[3], false);
    paintingSpotlight(scene, -15, 3.5, 99.90, 'north');
    placard(scene, -15, 2.6, 99.90, 'Oath of the Horatii', 'Jacques-Louis David, 1784', 'north');
    wallPaintingNS(scene,  15, 3.5, 99.90, M.paintings[0], false);
    paintingSpotlight(scene,  15, 3.5, 99.90, 'north');
    placard(scene,  15, 2.6, 99.90, 'Liberty Leading the People', 'Eugène Delacroix, 1830', 'north');

    // Extra gallery paintings — west wall (between existing)
    // Z=64 was inside the breaker-room doorway gap (Z=62.5→65.5), moved to Z=67
    wallPainting(scene, -24.9, 3.5, 67, M.vangoghStarry, true);
    paintingSpotlight(scene, -24.9, 3.5, 67, 'west');
    placard(scene, -24.9, 2.6, 67, 'The Starry Night', 'Vincent van Gogh, 1889', 'west');
    // Z=76 was inside the Galerie gap (Z=75.5→78.5), moved to Z=73
    wallPainting(scene, -24.9, 3.5, 73, M.vangoghIrises, true);
    paintingSpotlight(scene, -24.9, 3.5, 73, 'west');
    placard(scene, -24.9, 2.6, 73, 'Irises', 'Vincent van Gogh, 1889', 'west');
    wallPainting(scene, -24.9, 3.5, 88, M.monetSunrise, true);
    paintingSpotlight(scene, -24.9, 3.5, 88, 'west');
    placard(scene, -24.9, 2.6, 88, 'Impression, Sunrise', 'Claude Monet, 1872', 'west');
    wallPainting(scene, -24.9, 3.5, 98, M.monetPoppies, true);
    paintingSpotlight(scene, -24.9, 3.5, 98, 'west');
    placard(scene, -24.9, 2.6, 98, 'Poppies', 'Claude Monet, 1873', 'west');
    // Extra gallery paintings — east wall (between existing)
    wallPainting(scene,  24.9, 3.5, 65, M.vangoghSunflowers, false);
    paintingSpotlight(scene,  24.9, 3.5, 65, 'east');
    placard(scene,  24.9, 2.6, 65, 'Sunflowers', 'Vincent van Gogh, 1888', 'east');
    wallPainting(scene,  24.9, 3.5, 73, M.renoir, false);  // moved from 75 — frame at Z=75 clipped into Salon entrance gap (Z=75.5→78.5)
    paintingSpotlight(scene,  24.9, 3.5, 73, 'east');
    placard(scene,  24.9, 2.6, 73, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', 'east');
    wallPainting(scene,  24.9, 3.5, 85, M.cezanne, false);
    paintingSpotlight(scene,  24.9, 3.5, 85, 'east');
    placard(scene,  24.9, 2.6, 85, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', 'east');
    wallPainting(scene,  24.9, 3.5, 97, M.vangoghIrises, false);
    paintingSpotlight(scene,  24.9, 3.5, 97, 'east');
    placard(scene,  24.9, 2.6, 97, 'Irises', 'Vincent van Gogh, 1889', 'east');
    // (Extra gallery south wall paintings removed — too close to entrance)
    // Extra gallery north wall
    wallPaintingNS(scene, -8, 3.5, 99.90, M.renoir, false);
    paintingSpotlight(scene, -8, 3.5, 99.90, 'north');
    placard(scene, -8, 2.6, 99.90, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', 'north');
    wallPaintingNS(scene,  8, 3.5, 99.90, M.cezanne, false);
    paintingSpotlight(scene,  8, 3.5, 99.90, 'north');
    placard(scene,  8, 2.6, 99.90, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', 'north');
    // Extra gallery trees (center colonnade)
    lorTree(scene, -10, 75);
    lorTree(scene,  10, 75);

    // Velvet carpet runners leading to the blue door
    rug(scene, 0, 98, 3, 4, 0x0a1a4a, 0xc8a040);

    // Glowing archway at blue keycard door
    doorGlow(scene, 0, 99.75, 0x4a9eff);

    // ════════════════════════════════
    //  SALON DES ANTIQUITÉS  (side room off Gallery east wall)
    //  X 25→50  Z 67→87  (centre 37.5, 77)
    // ════════════════════════════════
    const SAX = 37.5, SAZ = 77, SAW = 25, SAD = 20;
    floor(scene,   SAX, SAZ, SAW, SAD, M.galleryFloor);
    ceiling(scene, SAX, SAZ, SAW, SAD, M.galleryCeil);
    // South wall (Z=67) and north wall (Z=87)
    wall(scene, SAX, SAZ - SAD / 2, SAW, WALL_T, M.galleryWall);
    wall(scene, SAX, SAZ + SAD / 2, SAW, WALL_T, M.galleryWall);
    // East wall (X=50)
    wall(scene, SAX + SAW / 2, SAZ, WALL_T, SAD, M.galleryWall);
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

    // Extra Salon paintings
    wallPainting(scene, 49.9, 3.5, 75, M.vangoghStarry, false);
    paintingSpotlight(scene, 49.9, 3.5, 75, 'east');
    placard(scene, 49.9, 2.6, 75, 'The Starry Night', 'Vincent van Gogh, 1889', 'east');
    wallPainting(scene, 49.9, 3.5, 79, M.monetPoppies, false);
    paintingSpotlight(scene, 49.9, 3.5, 79, 'east');
    placard(scene, 49.9, 2.6, 79, 'Poppies', 'Claude Monet, 1873', 'east');
    wallPaintingNS(scene, 30, 3.5, 67.10, M.vangoghSunflowers, true);
    paintingSpotlight(scene, 30, 3.5, 67.10, 'south');
    wallPaintingNS(scene, 44, 3.5, 67.10, M.monetSunrise, true);
    paintingSpotlight(scene, 44, 3.5, 67.10, 'south');
    wallPaintingNS(scene, 30, 3.5, 86.90, M.renoir, false);
    paintingSpotlight(scene, 30, 3.5, 86.90, 'north');
    wallPaintingNS(scene, 44, 3.5, 86.90, M.cezanne, false);
    paintingSpotlight(scene, 44, 3.5, 86.90, 'north');
    // Room label for Salon des Antiquités
    roomLabel(scene, SAX, SAZ, 'Salon des Antiquités', Math.PI / 2);

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
      stealables.push({ mesh: egg, item: 'egg', x: 35, z: 82, taken: false, bonus: true, label: "Fabergé Egg", value: 12000000, hasCase: true, caseBroken: false });
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
    floor(scene,   GWX, GWZ, GWW, GWD, M.galleryFloor);
    ceiling(scene, GWX, GWZ, GWW, GWD, M.galleryCeil);
    // South wall (Z=67) and north wall (Z=87)
    wall(scene, GWX, GWZ - GWD / 2, GWW, WALL_T, M.galleryWall);
    wall(scene, GWX, GWZ + GWD / 2, GWW, WALL_T, M.galleryWall);
    // West wall (X=-50)
    wall(scene, GWX - GWW / 2, GWZ, WALL_T, GWD, M.galleryWall);
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

    // ── Sculptures — non-figurative forms on tiered pedestals ──
    const sMat2 = new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.50, metalness: 0.08 });
    const sMat4 = new THREE.MeshStandardMaterial({ color: 0x9898a8, roughness: 0.42, metalness: 0.22 });

    // Sculpture 1 — Greek Amphora
    box(scene, 1.35, 0.12, 1.35, -34, 0.06, 72, _baseMat);
    box(scene, 1.0,  1.10, 1.0,  -34, 0.61, 72, M.pedestal);
    { const g = new THREE.Group(); g.position.set(-34, 1.16, 72);
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

    // Sculpture 2 — Obelisk (square shaft + pyramid cap)
    box(scene, 1.35, 0.12, 1.35, -42, 0.06, 72, _baseMat);
    box(scene, 1.0,  1.00, 1.0,  -42, 0.56, 72, M.pedestal);
    { const g = new THREE.Group(); g.position.set(-42, 1.06, 72);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), sMat4);
      shaft.position.y = 0.36; g.add(shaft);
      const tip   = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.13, 0.28, 4), sMat4);
      tip.position.y = 0.86; g.add(tip);
      g.castShadow = true; scene.add(g); }

    // Sculpture 3 — Second Amphora variant
    box(scene, 1.35, 0.12, 1.35, -34, 0.06, 82, _baseMat);
    box(scene, 1.0,  1.10, 1.0,  -34, 0.61, 82, M.pedestal);
    { const g = new THREE.Group(); g.position.set(-34, 1.16, 82);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.06, 10), sMat4);
      foot.position.y = 0.03; g.add(foot);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.10, 0.32, 12), sMat4);
      body.position.y = 0.22; g.add(body);
      const shldr= new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.18, 12), sMat4);
      shldr.position.y = 0.47; g.add(shldr);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.14, 10), sMat4);
      neck.position.y = 0.63; g.add(neck);
      const rim  = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.07, 0.04, 10), sMat4);
      rim.position.y = 0.73; g.add(rim);
      g.castShadow = true; scene.add(g); }

    // Sculpture 4 — Tall Obelisk
    box(scene, 1.35, 0.12, 1.35, -42, 0.06, 82, _baseMat);
    box(scene, 1.0,  1.00, 1.0,  -42, 0.56, 82, M.pedestal);
    { const g = new THREE.Group(); g.position.set(-42, 1.06, 82);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 0.18), sMat2);
      shaft.position.y = 0.44; g.add(shaft);
      const tip   = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.11, 0.24, 4), sMat2);
      tip.position.y = 0.96; g.add(tip);
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
    const monetWallMesh = wallPainting(scene, -49.9, 3.5, 77, M.monet, true);
    paintingSpotlight(scene, -49.9, 3.5, 77, 'west');
    const monetMesh = box(scene, 0.05, 1.4, 2.1, -49.75, 3.5, 77, M.monet);
    stealables.push({ mesh: monetMesh, wallMesh: monetWallMesh, item: 'monet', x: -49.9, z: 77, taken: false, bonus: true, label: 'Les Nymphéas', value: 40000000 });
    { const mRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.05, 32),
        new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      mRing.rotation.x = -Math.PI / 2; mRing.position.set(-49.5, 0.02, 77); scene.add(mRing);
      monetMesh.userData.floorRing = mRing; }
    placard(scene, -49.9, 2.6, 77, 'Les Nymphéas', 'Claude Monet, c. 1906', 'west');

    // Extra Galerie des Sculptures paintings
    wallPaintingNS(scene, -30, 3.5, 67.10, M.vangoghStarry, true);
    paintingSpotlight(scene, -30, 3.5, 67.10, 'south');
    wallPaintingNS(scene, -44, 3.5, 67.10, M.vangoghIrises, true);
    paintingSpotlight(scene, -44, 3.5, 67.10, 'south');
    wallPaintingNS(scene, -30, 3.5, 86.90, M.monetSunrise, false);
    paintingSpotlight(scene, -30, 3.5, 86.90, 'north');
    wallPaintingNS(scene, -44, 3.5, 86.90, M.monetPoppies, false);
    paintingSpotlight(scene, -44, 3.5, 86.90, 'north');
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
    //  CONSERVATION LAB content — housed inside the Salon des Antiquités (east side room)
    //  Items placed within the Salon's existing X=28–52, Z=58–100 space
    // ════════════════════════════════
    {
      // UV light (emissive-only material used on items; single low-intensity point for ambience)
      const uvLight = new THREE.PointLight(0x8844ff, 0.7, 22);
      uvLight.position.set(42, 3, 72);
      scene.add(uvLight);

      // UV key pickup — glowing green box in the gallery, near the lab entrance
      // at X=30, Z=80 (gallery side)
      const uvKeyMat = new THREE.MeshStandardMaterial({
        color: 0x00ff88, emissive: 0x00cc66, emissiveIntensity: 1.8,
        roughness: 0.3, metalness: 0.1,
      });
      const uvKeyMesh = box(scene, 0.25, 0.25, 0.25, 30, 0.85, 80, uvKeyMat);
      uvKeyMesh.userData.isUVKey = true;
      // Glow ring under UV key
      const uvRingMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88, transparent: true, opacity: 0.38,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const uvRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.38, 20), uvRingMat);
      uvRing.rotation.x = -Math.PI / 2;
      uvRing.position.set(30, 0.02, 80);
      scene.add(uvRing);
      uvKeyMesh.userData.floorRing = uvRing;
      // Register as a special keycard-style pickup
      keycardPickups.push({ mesh: uvKeyMesh, key: 'uvKey', x: 30, z: 80, collected: false, floorRing: uvRing, isUVKey: true });

      // Stealables in the Conservation Lab
      // Greek Vase
      { const vaseMat = new THREE.MeshStandardMaterial({ color: 0xc87020, roughness: 0.55, metalness: 0.12 });
        const vase = new THREE.Group();
        const vFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.05, 10), vaseMat);
        vFoot.position.y = 0.025; vase.add(vFoot);
        const vBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.09, 0.22, 12), vaseMat);
        vBody.position.y = 0.16; vase.add(vBody);
        const vNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.14, 10), vaseMat);
        vNeck.position.y = 0.37; vase.add(vNeck);
        const vRim = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.04, 10), vaseMat);
        vRim.position.y = 0.47; vase.add(vRim);
        box(scene, 0.22, 0.65, 0.22, 36, 0.325, 63, M.pedestal);
        vase.position.set(36, 0.90, 63);
        vase.userData.float = true;
        scene.add(vase);
        stealables.push({ mesh: vase, item: 'vase', x: 36, z: 63, taken: false, bonus: true, label: 'Greek Vase', value: 8500000 });
        const vRing2 = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
        vRing2.rotation.x = -Math.PI / 2; vRing2.position.set(36, 0.02, 63); scene.add(vRing2);
        vase.userData.floorRing = vRing2; }

      // Illuminated Manuscript
      { const msMat = new THREE.MeshStandardMaterial({ color: 0x8a5a14, roughness: 0.80, metalness: 0.0 });
        const msPageMat = new THREE.MeshStandardMaterial({ color: 0xf8f0d8, roughness: 0.90, metalness: 0.0,
          emissive: 0x9a6a10, emissiveIntensity: 0.28 });
        const ms = new THREE.Group();
        box(scene, 0.38, 0.04, 0.28, 0, 0, 0, msMat);
        const msPages = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.008, 0.24), msPageMat);
        msPages.position.y = 0.024; ms.add(msPages);
        ms.position.set(36, 0.99, 78);
        scene.add(ms);
        stealables.push({ mesh: ms, item: 'manuscript', x: 36, z: 78, taken: false, bonus: true, label: 'Illuminated Manuscript', value: 15000000 });
        const msRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xddaa44, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
        msRing.rotation.x = -Math.PI / 2; msRing.position.set(36, 0.02, 78); scene.add(msRing);
        ms.userData.floorRing = msRing; }

      // Bronze Bust
      { const bbMat = new THREE.MeshStandardMaterial({ color: 0x7a4c18, roughness: 0.45, metalness: 0.72,
          emissive: 0x3a2008, emissiveIntensity: 0.15 });
        const bb = new THREE.Group();
        const bbTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.30, 10), bbMat);
        bbTorso.position.y = 0.15; bb.add(bbTorso);
        const bbNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.12, 8), bbMat);
        bbNeck.position.y = 0.36; bb.add(bbNeck);
        const bbHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bbMat);
        bbHead.position.y = 0.59; bb.add(bbHead);
        box(scene, 0.22, 0.65, 0.22, 50, 0.325, 65, M.pedestal);
        bb.position.set(50, 0.90, 65);
        bb.userData.float = true;
        scene.add(bb);
        stealables.push({ mesh: bb, item: 'bust', x: 50, z: 65, taken: false, bonus: true, label: 'Bronze Bust', value: 6200000 });
        const bbRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xaa7722, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
        bbRing.rotation.x = -Math.PI / 2; bbRing.position.set(50, 0.02, 65); scene.add(bbRing);
        bb.userData.floorRing = bbRing; }

      // UV-locked Sapphire Brooch
      { const sbMat = new THREE.MeshStandardMaterial({ color: 0x1a44cc, roughness: 0.04, metalness: 0.08,
          emissive: 0x0a1a66, emissiveIntensity: 0.50, transparent: true, opacity: 0.90 });
        const sbFrameMat = new THREE.MeshStandardMaterial({ color: 0xd4a030, roughness: 0.18, metalness: 0.92 });
        const sb = new THREE.Group();
        const sbGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.065), sbMat);
        sb.add(sbGem);
        const sbFrame = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.018, 6, 16), sbFrameMat);
        sbFrame.position.y = 0; sb.add(sbFrame);
        box(scene, 0.22, 0.65, 0.22, 50, 0.325, 78, M.pedestal);
        sb.position.set(50, 1.02, 78);
        sb.userData.float = true;
        scene.add(sb);
        stealables.push({ mesh: sb, item: 'brooch', x: 50, z: 78, taken: false, bonus: true, label: 'Sapphire Brooch', value: 22000000, needsUV: true });
        const sbRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        sbRing.rotation.x = -Math.PI / 2; sbRing.position.set(50, 0.02, 78); scene.add(sbRing);
        sb.userData.floorRing = sbRing; }

      // Conservation Lab guard
      guardData.push({
        spawnX: 36, spawnZ: 65,
        waypoints: _route(
          [new THREE.Vector3(36, 0, 63), new THREE.Vector3(50, 0, 65), new THREE.Vector3(50, 0, 78), new THREE.Vector3(36, 0, 78)],
          [new THREE.Vector3(36, 0, 63), new THREE.Vector3(36, 0, 78), new THREE.Vector3(50, 0, 78), new THREE.Vector3(50, 0, 65)]
        ),
      });
    }

    // ════════════════════════════════
    //  POWER BREAKER ROOM  X -31→-25  Z 60→68
    //  Side room west of Gallery (Feature 7)
    // ════════════════════════════════
    {
      // Floor and ceiling
      floor(scene, -28, 64, 6, 8);
      ceiling(scene, -28, 64, 6, 8);
      // West wall (X=-31)
      wall(scene, -31, 64, WALL_T, 8);
      // North wall (Z=68)
      wall(scene, -28, 68, 6, WALL_T);
      // South wall (Z=60)
      wall(scene, -28, 60, 6, WALL_T);
      // East face — door only; gallery west wall stubs already cover this side
      // Door into breaker room
      door(scene, -25, 64, null, Math.PI / 2);

      // Breaker panel on west wall
      const breakerMat = new THREE.MeshStandardMaterial({ color: 0x151e28, roughness: 0.80, metalness: 0.18 });
      const breakerScreenMat = new THREE.MeshStandardMaterial({
        color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.1,
        transparent: true, opacity: 0.82,
      });
      const breakerMesh = box(scene, 0.8, 1.2, 0.15, -30.6, 1.2, 64, breakerMat);
      box(scene, 0.55, 0.55, 0.05, -30.6, 1.3, 63.93, breakerScreenMat);
      // Breaker switches (small boxes on panel)
      const switchMat = new THREE.MeshStandardMaterial({ color: 0x303838, roughness: 0.5, metalness: 0.4 });
      for (let si = 0; si < 4; si++) {
        box(scene, 0.08, 0.12, 0.04, -30.54, 0.72 + si * 0.16, 63.93, switchMat);
      }
      // Register breaker terminal
      const breakerTerminal = { mesh: breakerMesh, x: -30.6, z: 64, hacked: false, type: 'breaker' };
      terminals.push(breakerTerminal);
    }

    // ════════════════════════════════════════════════════════
    //  COULOIR DES STATUES  (Statues Corridor)
    //  X -25→-40  Z 90→96  (cx=-32.5, cz=93, 15×6)
    //  Connects Gallery west wall (opening Z=90→96) to Salle des Statues
    // ════════════════════════════════════════════════════════
    floor(scene,   -32.5, 93, 15, 6);
    ceiling(scene, -32.5, 93, 15, 6);
    wall(scene, -32.5, 90, 15, WALL_T, M.galleryWall);  // south wall Z=90
    wall(scene, -32.5, 96, 15, WALL_T, M.galleryWall);  // north wall Z=96
    // East side covered by gallery west-wall stubs; west side opens into Salle des Statues
    // Glowing archway at gallery-side entrance (X=-25, Z=93)
    { const corrArchM = new THREE.MeshStandardMaterial({
        color: 0xe8d060, emissive: 0xe8d060, emissiveIntensity: 1.1,
        roughness: 0.2, transparent: true, opacity: 0.88,
      });
      box(scene, 0.14, 0.14, 6.4, -25, WALL_H + 0.16, 93, corrArchM);          // top bar
      box(scene, 0.14, WALL_H + 0.32, 0.14, -25, WALL_H / 2, 89.9, corrArchM); // south post
      box(scene, 0.14, WALL_H + 0.32, 0.14, -25, WALL_H / 2, 96.1, corrArchM); // north post
    }
    // Wall lanterns in corridor
    wallLantern(scene, -38, 3.0, 90.12,  1);  // south wall
    wallLantern(scene, -38, 3.0, 95.88, -1);  // north wall

    // ════════════════════════════════════════════════════════
    //  SALLE DES STATUES  (Hall of Statues)
    //  X -40→-80  Z 90→120  (cx=-60, cz=105, 40×30)
    //  Life-sized Roman & Greek marble statues, bonsai trees, central fountain
    // ════════════════════════════════════════════════════════
    {
      const SCX = -60, SCZ = 105, SCW = 40, SCD = 30;

      // ── Materials ─────────────────────────────────────────
      const sFloorMat = new THREE.MeshStandardMaterial({
        color: 0xE4E0D4, roughness: 0.14, metalness: 0.05,  // white veined marble
      });
      const sWallMat = new THREE.MeshStandardMaterial({
        color: 0xDDD6C4, roughness: 0.86, metalness: 0.0,   // warm cream stone
      });
      const sCeilMat = new THREE.MeshStandardMaterial({
        color: 0xF2EDE4, roughness: 0.90, metalness: 0.0,   // ivory ceiling
      });
      const statueMarbMat = new THREE.MeshStandardMaterial({
        color: 0xE2DAC8, roughness: 0.60, metalness: 0.02,  // classical white marble
      });
      const statuePedMat = new THREE.MeshStandardMaterial({
        color: 0xC4BAA8, roughness: 0.72, metalness: 0.03,  // slightly darker pedestal
      });
      const statueBaseMat = new THREE.MeshStandardMaterial({
        color: 0xA8A090, roughness: 0.82, metalness: 0.0,   // grey-stone base slab
      });

      // ── Room shell ─────────────────────────────────────────
      floor(scene,   SCX, SCZ, SCW, SCD, sFloorMat);
      ceiling(scene, SCX, SCZ, SCW, SCD, sCeilMat);
      wall(scene, SCX, 90,  SCW, WALL_T, sWallMat);  // south wall Z=90
      wall(scene, SCX, 120, SCW, WALL_T, sWallMat);  // north wall Z=120
      wall(scene, -80, SCZ, WALL_T, SCD, sWallMat);  // west wall  X=-80
      wall(scene, -40, 108, WALL_T,  24, sWallMat);  // east wall  Z=96→120 (Z=90→96 open for corridor)

      // ── Archway frame at corridor entrance (X=-40, Z=93) ──
      { const arch2M = new THREE.MeshStandardMaterial({
          color: 0xC8B080, emissive: 0x8a6828, emissiveIntensity: 0.14,
          roughness: 0.44, metalness: 0.46,
        });
        box(scene, 0.14, 0.14, 6.4, -40, WALL_H + 0.16, 93, arch2M);           // top bar
        box(scene, 0.14, WALL_H + 0.32, 0.14, -40, WALL_H / 2, 89.9, arch2M);  // south post
        box(scene, 0.14, WALL_H + 0.32, 0.14, -40, WALL_H / 2, 96.1, arch2M);  // north post
      }

      // ── Pillars flanking corridor entrance ─────────────────
      pillar(scene, -43, 91);
      pillar(scene, -43, 95);

      // ── Room label ─────────────────────────────────────────
      roomLabel(scene, SCX, SCZ, 'Salle des Statues', -Math.PI / 2);

      // ── Warm ambient point lights ───────────────────────────
      [[-52, 97], [-68, 97], [-52, 113], [-68, 113]].forEach(([lx, lz]) => {
        const pt = new THREE.PointLight(0xfff6e8, 1.0, 28);
        pt.position.set(lx, 4.5, lz); scene.add(pt);
      });
      // Blue-tinted water glow over fountain
      { const centerPt = new THREE.PointLight(0xddeeff, 0.60, 18);
        centerPt.position.set(SCX, 4.5, SCZ); scene.add(centerPt); }

      // ── Ceiling lamps ──────────────────────────────────────
      [[-52, 97], [-68, 97], [-52, 113], [-68, 113]].forEach(([lx, lz]) => {
        ceilingLamp(scene, lx, lz);
      });

      // ── Wall lanterns on west wall ──────────────────────────
      wallLantern(scene, -79.85, 3.0, 97,  1);
      wallLantern(scene, -79.85, 3.0, 113, 1);

      // ── Wall sconces on east wall (north section) ───────────
      wallSconce(scene, -40.12, 2.9, 100, -1);
      wallSconce(scene, -40.12, 2.9, 116, -1);

      // ── Roman/Greek life-sized marble statues ──────────────
      // type A=arms at sides, B=right arm raised, C=athlete arms extended,
      //      D=toga-draped arms crossed, E=armless (Venus style)
      const romanStatue = (sx, sz, rotY, type) => {
        const g = new THREE.Group();
        if (rotY) g.rotation.y = rotY;
        // Base slab
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 1.05), statueBaseMat);
        slab.position.y = 0.06; g.add(slab);
        // Pedestal column
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.92, 0.82), statuePedMat);
        ped.position.y = 0.58; g.add(ped);
        // Pedestal top cap
        const pedCap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.92), statueBaseMat);
        pedCap.position.y = 1.11; g.add(pedCap);
        const BY = 1.18; // body base Y
        // Feet
        const feet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.30, 0.28), statueMarbMat);
        feet.position.y = BY + 0.15; g.add(feet);
        // Calves
        const calves = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.42, 0.26), statueMarbMat);
        calves.position.y = BY + 0.51; g.add(calves);
        // Thighs
        const thighs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.40, 0.28), statueMarbMat);
        thighs.position.y = BY + 0.91; g.add(thighs);
        // Toga / draped cloth at hips
        const toga = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.36, 0.36), statueMarbMat);
        toga.position.y = BY + 1.23; g.add(toga);
        // Abdomen
        const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.32), statueMarbMat);
        abdomen.position.y = BY + 1.63; g.add(abdomen);
        // Chest
        const chest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 0.34), statueMarbMat);
        chest.position.y = BY + 2.09; g.add(chest);
        // Shoulder cross-bar
        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.36), statueMarbMat);
        shoulders.position.y = BY + 2.45; g.add(shoulders);
        // Neck
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.24, 8), statueMarbMat);
        neck.position.y = BY + 2.66; g.add(neck);
        // Head (slightly elongated sphere)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), statueMarbMat);
        head.scale.set(0.90, 1.10, 0.88);
        head.position.y = BY + 3.02; g.add(head);
        // Hair cap (low hemisphere on top of head)
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 5), statueMarbMat);
        hairCap.scale.set(0.94, 0.46, 0.92);
        hairCap.position.y = BY + 3.20; g.add(hairCap);
        // Arms vary by type
        if (type === 'A' || !type) {
          // Both arms hanging at sides
          const lA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), statueMarbMat);
          lA.position.set(-0.46, BY + 2.00, 0); g.add(lA);
          const rA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), statueMarbMat);
          rA.position.set( 0.46, BY + 2.00, 0); g.add(rA);
          const lF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), statueMarbMat);
          lF.position.set(-0.46, BY + 1.44, 0); g.add(lF);
          const rF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), statueMarbMat);
          rF.position.set( 0.46, BY + 1.44, 0); g.add(rF);
        } else if (type === 'B') {
          // Left arm down, right arm raised (orator / emperor pose)
          const lA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), statueMarbMat);
          lA.position.set(-0.46, BY + 2.00, 0); g.add(lA);
          const lF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), statueMarbMat);
          lF.position.set(-0.46, BY + 1.44, 0); g.add(lF);
          const rA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.60, 0.18), statueMarbMat);
          rA.rotation.z = -Math.PI / 3; rA.position.set(0.68, BY + 2.60, 0); g.add(rA);
          const rF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), statueMarbMat);
          rF.rotation.z = -Math.PI / 3; rF.position.set(1.00, BY + 3.10, 0); g.add(rF);
        } else if (type === 'C') {
          // Both arms extended outward (athlete / discus thrower pose)
          const lA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.60, 0.18), statueMarbMat);
          lA.rotation.z = Math.PI / 2.2; lA.position.set(-0.66, BY + 2.40, 0); g.add(lA);
          const lF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), statueMarbMat);
          lF.rotation.z = Math.PI / 2.5; lF.position.set(-1.04, BY + 2.32, 0); g.add(lF);
          const rA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.60, 0.18), statueMarbMat);
          rA.rotation.z = -0.32; rA.position.set(0.46, BY + 1.98, 0); g.add(rA);
          const rF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), statueMarbMat);
          rF.rotation.z = -0.22; rF.position.set(0.48, BY + 1.42, 0); g.add(rF);
        } else if (type === 'D') {
          // Arms draped / toga-wrapped across chest
          const lA = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.56, 0.22), statueMarbMat);
          lA.rotation.z = 0.42; lA.position.set(-0.30, BY + 2.20, 0.06); g.add(lA);
          const rA = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.56, 0.22), statueMarbMat);
          rA.rotation.z = -0.42; rA.position.set(0.30, BY + 2.20, 0.06); g.add(rA);
        }
        // type 'E' = armless (Venus de Milo style) — no arms added
        g.position.set(sx, 0, sz);
        g.castShadow = true;
        g.receiveShadow = true;
        scene.add(g);
        addWallAABB(sx, sz, 1.2, 1.2);
      };

      // ── Place statues throughout the room ─────────────────
      // Near entrance (Z=91–97)
      romanStatue(-46, 91,  Math.PI * 0.15, 'A');
      romanStatue(-46, 97, -Math.PI * 0.15, 'B');
      // South section (Z=95–99)
      romanStatue(-55, 96,  0,              'D');
      romanStatue(-65, 95,  Math.PI,        'A');
      romanStatue(-65, 97,  Math.PI,        'B');
      romanStatue(-76, 95,  Math.PI * 0.5,  'D');
      // Just south of fountain (Z=99)
      romanStatue(-52, 99,  0,              'C');
      romanStatue(-68, 99,  Math.PI,        'C');
      // Against west wall
      romanStatue(-77, 99,  Math.PI,        'A');
      romanStatue(-77, 111, Math.PI,        'B');
      // Just north of fountain (Z=111)
      romanStatue(-52, 111, 0,              'A');
      romanStatue(-68, 111, Math.PI,        'D');
      // North section (Z=113–117)
      romanStatue(-46, 114, 0,              'E');
      romanStatue(-55, 116, 0,              'A');
      romanStatue(-65, 116, 0,              'B');
      romanStatue(-75, 113, Math.PI * 0.5,  'D');
      romanStatue(-75, 117, Math.PI * 0.5,  'C');

      // ── Central fountain ──────────────────────────────────
      { const FX = SCX, FZ = SCZ;  // fountain center at room center (-60, 105)
        const fStoneMat = new THREE.MeshStandardMaterial({
          color: 0xC4BEB0, roughness: 0.58, metalness: 0.08,
        });
        const fWaterMat = new THREE.MeshStandardMaterial({
          color: 0x3A88CC, emissive: 0x103888, emissiveIntensity: 0.22,
          roughness: 0.06, metalness: 0.02, transparent: true, opacity: 0.70,
        });
        const fGoldMat = new THREE.MeshStandardMaterial({
          color: 0xD4A020, emissive: 0x5a3c00, emissiveIntensity: 0.14,
          roughness: 0.18, metalness: 0.88,
        });
        // Outer basin rim
        const outerRim = new THREE.Mesh(new THREE.CylinderGeometry(3.40, 3.60, 0.28, 24), fStoneMat);
        outerRim.position.set(FX, 0.14, FZ); outerRim.castShadow = true; scene.add(outerRim);
        // Basin floor
        const basinFloor = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.12, 24), fStoneMat);
        basinFloor.position.set(FX, 0.06, FZ); scene.add(basinFloor);
        // Water surface
        const water = new THREE.Mesh(new THREE.CylinderGeometry(2.90, 2.90, 0.04, 24), fWaterMat);
        water.position.set(FX, 0.27, FZ); scene.add(water);
        // Gold decorative ring around basin lip
        const goldRing = new THREE.Mesh(new THREE.TorusGeometry(3.48, 0.042, 6, 32), fGoldMat);
        goldRing.rotation.x = Math.PI / 2; goldRing.position.set(FX, 0.28, FZ); scene.add(goldRing);
        // Centre column base
        const colBase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.46, 12), fStoneMat);
        colBase.position.set(FX, 0.23, FZ); colBase.castShadow = true; scene.add(colBase);
        // Column shaft
        const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.82, 12), fStoneMat);
        colShaft.position.set(FX, 1.14, FZ); colShaft.castShadow = true; scene.add(colShaft);
        // Column capital
        const colCap = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.30, 0.30, 12), fStoneMat);
        colCap.position.set(FX, 2.20, FZ); scene.add(colCap);
        // Gold capital band
        const capBand = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.032, 6, 16), fGoldMat);
        capBand.rotation.x = Math.PI / 2; capBand.position.set(FX, 2.36, FZ); scene.add(capBand);
        // Upper bowl rim
        const uBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.40, 1.56, 0.24, 16), fStoneMat);
        uBowl.position.set(FX, 2.50, FZ); uBowl.castShadow = true; scene.add(uBowl);
        // Upper water pool
        const uWater = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.28, 0.05, 16), fWaterMat);
        uWater.position.set(FX, 2.63, FZ); scene.add(uWater);
        // Gold ring on upper bowl
        const uGoldRing = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.030, 6, 20), fGoldMat);
        uGoldRing.rotation.x = Math.PI / 2; uGoldRing.position.set(FX, 2.62, FZ); scene.add(uGoldRing);
        // Finial spire
        const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 0.60, 8), fGoldMat);
        finial.position.set(FX, 3.16, FZ); scene.add(finial);
        const finialSphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fGoldMat);
        finialSphere.position.set(FX, 3.50, FZ); scene.add(finialSphere);
        // Subtle blue water glow light
        const waterPt = new THREE.PointLight(0x66aaff, 0.55, 8);
        waterPt.position.set(FX, 1.5, FZ); scene.add(waterPt);
        addWallAABB(FX, FZ, 7.4, 7.4);  // fountain collision zone
      }

      // ── Bonsai trees ──────────────────────────────────────
      const bonsaiTree = (bx, bz) => {
        const potM   = new THREE.MeshStandardMaterial({ color: 0x7A3A18, roughness: 0.92, metalness: 0.0 });
        const soilM  = new THREE.MeshStandardMaterial({ color: 0x281A0C, roughness: 0.96, metalness: 0.0 });
        const trunkM = new THREE.MeshStandardMaterial({ color: 0x3A1E08, roughness: 0.88, metalness: 0.0 });
        const leafM  = new THREE.MeshStandardMaterial({ color: 0x2A5A18, roughness: 0.86, metalness: 0.0 });
        // Shallow oval pot
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.22, 0.22, 10), potM);
        pot.position.set(bx, 0.11, bz); pot.castShadow = true; scene.add(pot);
        // Soil disc
        const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 10), soilM);
        soil.position.set(bx, 0.24, bz); scene.add(soil);
        // Main trunk — slightly leaning
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.62, 7), trunkM);
        trunk.rotation.z = 0.20; trunk.position.set(bx + 0.07, 0.57, bz);
        trunk.castShadow = true; scene.add(trunk);
        // Side branch sweeping outward
        const br1 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.038, 0.38, 6), trunkM);
        br1.rotation.z = Math.PI / 2.4; br1.position.set(bx + 0.24, 0.82, bz); scene.add(br1);
        // Small secondary branch
        const br2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.028, 0.26, 5), trunkM);
        br2.rotation.z = -Math.PI / 3.5; br2.position.set(bx - 0.14, 0.78, bz); scene.add(br2);
        // Foliage clusters (pom-pom spheres)
        [[bx + 0.08, 1.10, bz, 0.23],
         [bx + 0.32, 0.88, bz + 0.08, 0.17],
         [bx - 0.10, 1.18, bz - 0.06, 0.15],
         [bx + 0.16, 1.26, bz + 0.04, 0.13]].forEach(([fx, fy, fz, fr]) => {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(fr, 7, 5), leafM);
          leaf.position.set(fx, fy, fz); leaf.castShadow = true; scene.add(leaf);
        });
      };

      // Place bonsai trees in corners and along walls
      bonsaiTree(-42, 91);   // near entrance, south
      bonsaiTree(-42, 95);   // near entrance, north
      bonsaiTree(-78, 92);   // far west, south corner
      bonsaiTree(-78, 118);  // far west, north corner
      bonsaiTree(-58, 119);  // north wall, centre-west
      bonsaiTree(-66, 119);  // north wall, centre-east
      bonsaiTree(-44, 119);  // north wall, east side

      // ── Classic pillar colonnade ────────────────────────────
      pillar(scene, -48, 98);
      pillar(scene, -72, 98);
      pillar(scene, -48, 112);
      pillar(scene, -72, 112);

      // ── Garden pond (impluvium) — west mid-section ──────────
      { const PX = -74, PZ = 105;
        const pStoneMat = new THREE.MeshStandardMaterial({
          color: 0xB8B4A8, roughness: 0.68, metalness: 0.04,
        });
        const pWaterMat = new THREE.MeshStandardMaterial({
          color: 0x2A7A5C, emissive: 0x0A3222, emissiveIntensity: 0.20,
          roughness: 0.04, metalness: 0.02, transparent: true, opacity: 0.74,
        });
        const lilyMat = new THREE.MeshStandardMaterial({
          color: 0x2C6418, roughness: 0.90, metalness: 0.0,
        });
        // Border slabs (4 sides of stone frame)
        box(scene, 5.40, 0.32, 0.32, PX,        0.16, PZ - 2.04, pStoneMat); // south
        box(scene, 5.40, 0.32, 0.32, PX,        0.16, PZ + 2.04, pStoneMat); // north
        box(scene, 0.32, 0.32, 3.76, PX - 2.54, 0.16, PZ,        pStoneMat); // west
        box(scene, 0.32, 0.32, 3.76, PX + 2.54, 0.16, PZ,        pStoneMat); // east
        // Basin floor
        box(scene, 4.76, 0.10, 3.44, PX, 0.05, PZ, pStoneMat);
        // Water surface
        const waterMesh = new THREE.Mesh(new THREE.BoxGeometry(4.56, 0.06, 3.24), pWaterMat);
        waterMesh.position.set(PX, 0.22, PZ); scene.add(waterMesh);
        // Lily pads
        [[PX - 0.80, PZ + 0.70], [PX + 0.55, PZ - 0.85], [PX + 0.20, PZ + 0.95]].forEach(([lx, lz]) => {
          const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 9), lilyMat);
          lily.position.set(lx, 0.26, lz); scene.add(lily);
        });
        // Subtle teal water glow
        const pondPt = new THREE.PointLight(0x44cc88, 0.28, 8);
        pondPt.position.set(PX, 1.4, PZ); scene.add(pondPt);
        addWallAABB(PX, PZ, 5.8, 4.5);
      }

      // ── Central decorative rug ──────────────────────────────
      rug(scene, SCX, SCZ, 20, 14, 0x1C1408, 0xD4A828);

      // ── Stealables ─────────────────────────────────────────
      // Golden Laurel Crown — on a marble pedestal near the west wall
      { const goldLaurelMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.14, metalness: 0.92, emissive: 0x5a3000, emissiveIntensity: 0.22 });
        const pedMat = new THREE.MeshStandardMaterial({ color: 0xd0ccc4, roughness: 0.55, metalness: 0.06 });
        // Pedestal
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.55), pedMat);
        ped.position.set(-75, 0.5, 105); ped.castShadow = true; scene.add(ped);
        const pedTop = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), pedMat);
        pedTop.position.set(-75, 1.04, 105); scene.add(pedTop);
        // Laurel crown — torus + small leaf bumps
        const crown = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 7, 22), goldLaurelMat);
        ring.rotation.x = Math.PI / 2; crown.add(ring);
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), goldLaurelMat);
          leaf.position.set(Math.cos(ang) * 0.18, 0.03, Math.sin(ang) * 0.18);
          leaf.scale.set(1.2, 0.6, 0.8); crown.add(leaf);
        }
        crown.position.set(-75, 1.14, 105);
        scene.add(crown);
        // Glass case (faint)
        const caseMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.12 });
        const caseBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.46), caseMat);
        caseBox.position.set(-75, 1.38, 105); scene.add(caseBox);
        stealables.push({ mesh: crown, item: 'laurel', x: -75, z: 105, taken: false, bonus: true, label: 'Golden Laurel Crown', value: 12000000 });
      }

      // Marble Bust of Augustus — on a pedestal near the north wall
      { const marbMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.48, metalness: 0.0 });
        const pedMat2 = new THREE.MeshStandardMaterial({ color: 0xc8c4bc, roughness: 0.60, metalness: 0.04 });
        const ped2 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.1, 0.52), pedMat2);
        ped2.position.set(-70, 0.55, 116); ped2.castShadow = true; scene.add(ped2);
        const pedTop2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.62), pedMat2);
        pedTop2.position.set(-70, 1.115, 116); scene.add(pedTop2);
        // Bust — simplified head+neck+shoulders
        const bust = new THREE.Group();
        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.28, 0.34), marbMat);
        bust.add(shoulders);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.22, 8), marbMat);
        neck.position.y = 0.25; bust.add(neck);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), marbMat);
        head.position.y = 0.50; bust.add(head);
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 5), marbMat);
        hairCap.position.set(0, 0.56, -0.04); hairCap.scale.y = 0.55; bust.add(hairCap);
        bust.position.set(-70, 1.185, 116);
        scene.add(bust);
        stealables.push({ mesh: bust, item: 'augustus', x: -70, z: 116, taken: false, bonus: true, label: 'Marble Bust of Augustus', value: 9500000 });
      }

      // ── Guard patrol ────────────────────────────────────────
      guardData.push({
        spawnX: -55, spawnZ: 98,
        waypoints: [
          new THREE.Vector3(-55, 0, 98),
          new THREE.Vector3(-55, 0, 112),
          new THREE.Vector3(-65, 0, 112),
          new THREE.Vector3(-65, 0, 98),
        ],
      });

      // ── Security camera watching the corridor entrance ──────
      cameraData.push({ x: -60, y: WALL_H - 0.3, z: 93, sweepAngle: Math.PI / 2.5, facingZ: 1 });

    } // end Salle des Statues

    // ════════════════════════════════
    //  CORRIDOR 2  cx=0  cz=107.5  10×15
    //  Maintenance / service passage
    // ════════════════════════════════
    floor(scene, 0, 107.5, 10, 15, M.corridorFloor2);
    ceiling(scene, 0, 107.5, 10, 15);
    wall(scene, -5, 107.5, WALL_T, 15, M.corridorWall);
    wall(scene,  5, 107.5, WALL_T, 15, M.corridorWall);

    // Corridor 2 paintings on north/south walls
    // (No paintings on south/north walls — both ends are open doorways)

    // Velvet carpet runner through corridor 2
    rug(scene, 0, 107.5, 3.5, 14, 0x0a1a4a, 0xc8a040);

    // Corridor 2 lanterns
    wallLantern(scene, -4.85, 3.0, 104,  1);
    wallLantern(scene, -4.85, 3.0, 111,  1);
    // Shelving unit + boxes against west wall
    box(scene, 2.4, 2.6, 0.45, -4.65, 1.3, 107.5, M.desk);
    box(scene, 0.65, 0.3, 0.38, -4.65, 2.75, 108.2, M.terminal); // small crate on top
    box(scene, 0.55, 0.28, 0.38, -4.65, 2.74, 106.8, M.terminal);
    // Utility table on east side
    box(scene, 1.8, 0.75, 1.0, 3.5, 0.375, 109, M.desk);
    box(scene, 0.55, 0.22, 0.35, 3.5, 0.86, 109, M.terminal);    // item on table
    // Coin cache — maintenance crew left spare coins
    coinCache(scene, 3.5, 109, 2, 0.89);

    // Corridor 2 — fire extinguisher on east wall
    {
      const extMat = new THREE.MeshStandardMaterial({ color: 0xcc2010, roughness: 0.40, metalness: 0.35 });
      const extSilMat = new THREE.MeshStandardMaterial({ color: 0xd0d0c8, roughness: 0.32, metalness: 0.55 });
      // Tank cylinder
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10), extMat);
      tank.position.set(4.62, 0.9, 102); scene.add(tank);
      // Valve top
      const valve = new THREE.Mesh(new THREE.SphereGeometry(0.062, 7, 5), extSilMat);
      valve.position.set(4.62, 1.14, 102); scene.add(valve);
      // Nozzle hose (thin box)
      box(scene, 0.025, 0.025, 0.22, 4.62, 0.82, 102.11, extSilMat);
    }

    // Corridor 2 — wall-mounted security panel / warning sign on west wall
    {
      const warnMat = new THREE.MeshStandardMaterial({ color: 0xd4a800, roughness: 0.55, metalness: 0.10 });
      const warnFaceMat = new THREE.MeshStandardMaterial({ color: 0x080606, roughness: 0.60, metalness: 0.0 });
      // Panel housing
      box(scene, 0.08, 0.55, 0.38, -4.73, 2.2, 111, warnMat);
      // Dark face
      box(scene, 0.05, 0.44, 0.28, -4.73, 2.2, 111, warnFaceMat);
      // Tiny blinking light dots (3 small spheres)
      [[2.35, 110.9], [2.0, 111.0], [1.65, 111.1]].forEach(([ly, lz], i) => {
        const lMat = new THREE.MeshStandardMaterial({
          color: i === 0 ? 0x00ff44 : (i === 1 ? 0xff4400 : 0x4488ff),
          emissive: i === 0 ? 0x00ff44 : (i === 1 ? 0xff4400 : 0x4488ff),
          emissiveIntensity: 1.4, roughness: 0.2,
        });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), lMat);
        dot.position.set(-4.71, ly, lz); scene.add(dot);
      });
    }

    // Corridor 2 — maintenance trolley (wheeled cart) on east side
    {
      const cartMat = new THREE.MeshStandardMaterial({ color: 0x505558, roughness: 0.55, metalness: 0.40 });
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.80, metalness: 0.12 });
      // Cart body (open frame shelves)
      box(scene, 0.80, 0.06, 0.48, 3.5, 0.18, 103.5, cartMat);   // bottom shelf
      box(scene, 0.80, 0.06, 0.48, 3.5, 0.75, 103.5, cartMat);   // mid shelf
      box(scene, 0.80, 0.06, 0.48, 3.5, 1.30, 103.5, cartMat);   // top shelf
      // Vertical poles
      [[-0.36, -0.20], [-0.36, 0.20], [0.36, -0.20], [0.36, 0.20]].forEach(([ox, oz]) => {
        box(scene, 0.04, 1.20, 0.04, 3.5 + ox, 0.78, 103.5 + oz, cartMat);
      });
      // Wheels
      [[-0.30, -0.18], [-0.30, 0.18], [0.30, -0.18], [0.30, 0.18]].forEach(([ox, oz]) => {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 5, 10), wheelMat);
        w.rotation.x = Math.PI / 2; w.position.set(3.5 + ox, 0.07, 103.5 + oz); scene.add(w);
      });
      // Item on top shelf — folded linen stack (light box)
      box(scene, 0.55, 0.14, 0.30, 3.5, 1.37, 103.5,
        new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.80, metalness: 0.0 }));
    }

    // ════════════════════════════════
    //  CROWN VAULT  cx=0  cz=137.5  50×45
    // ════════════════════════════════
    // Skip south and north walls — add stubs manually so corridor/exit connect properly
    roomWalls(scene, 0, 137.5, 50, 45, { south: true, north: true, east: true }, M.vaultWall, null, M.vaultCeil);

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
    wall(scene, -(25 - VS / 2), 115, VS, WALL_T, M.vaultWall);   // west stub centred at (-15, 115)
    wall(scene,  (25 - VS / 2), 115, VS, WALL_T, M.vaultWall);   // east stub centred at ( 15, 115)

    // Vault north wall stubs — 10-unit gap for exit passage
    wall(scene, -(25 - VS / 2), 160, VS, WALL_T, M.vaultWall);   // west stub
    wall(scene,  (25 - VS / 2), 160, VS, WALL_T, M.vaultWall);   // east stub

    // Vault east wall stubs — 3-unit gap at Z=137.5 → Egyptian Catacomb entrance
    // Vault east wall at X=25, Z spans 115→160; gap Z 136→139 (3 units, centred at 137.5)
    wall(scene, 25, 125.5, WALL_T, 21, M.vaultWall);  // south stub  Z 115→136
    wall(scene, 25, 149.5, WALL_T, 21, M.vaultWall);  // north stub  Z 139→160

    // Door into Egyptian Catacomb (east/west wall, no key required)
    door(scene, 25, 137.5, null, Math.PI / 2);

    // Golden glow archway at Egyptian Catacomb entrance
    {
      const egyptArchMat = new THREE.MeshStandardMaterial({
        color: 0xd4a030, emissive: 0xd4a030, emissiveIntensity: 1.0,
        roughness: 0.20, transparent: true, opacity: 0.88,
      });
      box(scene, 0.14, 0.14, 3.80, 25, WALL_H + 0.16, 137.5, egyptArchMat);          // top bar
      box(scene, 0.14, WALL_H + 0.32, 0.14, 25, WALL_H / 2, 135.6, egyptArchMat);   // south strip
      box(scene, 0.14, WALL_H + 0.32, 0.14, 25, WALL_H / 2, 139.4, egyptArchMat);   // north strip
    }

    // ── Crown Vault Door — massive hydraulic steel door blocking entrance ────────
    {
      const vdGroup = new THREE.Group();
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x252c35, roughness: 0.30, metalness: 0.84 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x40505e, roughness: 0.40, metalness: 0.75 });
      const goldHdl  = new THREE.MeshStandardMaterial({ color: 0xb87020, roughness: 0.16, metalness: 0.92 });
      const boltMat  = new THREE.MeshStandardMaterial({ color: 0x303840, roughness: 0.28, metalness: 0.88 });

      // Main door slab
      vdGroup.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 0.32), steelMat));

      // Outer frame border (4 bars)
      [
        [0,  3.08, 0, 10.4, 0.16, 0.38],   // top
        [0, -3.08, 0, 10.4, 0.16, 0.38],   // bottom
        [-5.12, 0, 0, 0.24,  6.0, 0.38],   // left
        [ 5.12, 0, 0, 0.24,  6.0, 0.38],   // right
      ].forEach(([x, y, z, w, h, d]) => {
        vdGroup.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat));
        vdGroup.children[vdGroup.children.length - 1].position.set(x, y, z);
      });

      // Recessed panel insets (2 vertical panels)
      [-2.4, 2.4].forEach(px => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.8, 5.1, 0.06), frameMat);
        panel.position.set(px, 0, -0.14);
        vdGroup.add(panel);
      });

      // Central wheel handle
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.10, 8, 18), goldHdl);
      wheel.position.set(0, 0, 0.22);
      vdGroup.add(wheel);
      // Wheel hub
      const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 10), goldHdl);
      wheelHub.position.set(0, 0, 0.28);
      vdGroup.add(wheelHub);
      vdGroup.children[vdGroup.children.length - 1].rotation.x = Math.PI / 2;
      // Wheel spokes (4)
      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.30, 0.07), goldHdl);
        spoke.position.set(0, 0, 0.24);
        spoke.rotation.z = (i / 4) * Math.PI;
        vdGroup.add(spoke);
      }

      // Locking bolts — 4 per side
      [-2.0, -0.65, 0.65, 2.0].forEach(by => {
        // Left bolts
        const bL = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.28, 8), boltMat);
        bL.rotation.z = Math.PI / 2;
        bL.position.set(-5.22, by, 0.10);
        vdGroup.add(bL);
        // Right bolts
        const bR = bL.clone();
        bR.position.set(5.22, by, 0.10);
        vdGroup.add(bR);
      });

      // Rivets — 5×3 grid on each panel
      [-2.4, 2.4].forEach(px => {
        for (let row = -1; row <= 1; row++) {
          for (let col = -2; col <= 2; col++) {
            const r = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), boltMat);
            r.position.set(px + col * 0.70, row * 1.55, 0.20);
            vdGroup.add(r);
          }
        }
      });

      vdGroup.position.set(0, 3, 115);
      scene.add(vdGroup);

      // AABB covers the 10-wide entrance gap
      addWallAABB(0, 115, 10.4, 0.45);
      doors.push({
        mesh: vdGroup, x: 0, z: 115,
        keyRequired: 'blue',
        open: false, opening: false, openProgress: 0,
        vaultDoor: true, origX: 0,
        aabbHalfW: 5.2, aabbHalfD: 0.225,
      });
    }

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
    // Crown — shaped like a real crown (band + spires + jewels)
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 1.5, 140);
    // Base band
    const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.22, 20), M.crown);
    crownBand.position.set(0, -0.04, 0);
    crownGroup.add(crownBand);
    const JEWEL_COLORS = [0xff2222, 0x2255ff, 0x22cc22, 0xaa22ff, 0xff8800];
    // 5 tall main spires
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const px = Math.sin(angle) * 0.24, pz = Math.cos(angle) * 0.24;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.42, 4), M.crown);
      spike.position.set(px, 0.28, pz); spike.rotation.y = Math.PI / 4;
      crownGroup.add(spike);
      const jMat = new THREE.MeshStandardMaterial({ color: JEWEL_COLORS[i], roughness: 0.08, metalness: 0.2, emissive: JEWEL_COLORS[i], emissiveIntensity: 0.55 });
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), jMat);
      jewel.position.set(px, 0.08, pz);
      crownGroup.add(jewel);
    }
    // 5 shorter arched points between main spires
    for (let i = 0; i < 5; i++) {
      const angle = ((i + 0.5) / 5) * Math.PI * 2;
      const px = Math.sin(angle) * 0.24, pz = Math.cos(angle) * 0.24;
      const arch = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 4), M.crown);
      arch.position.set(px, 0.18, pz); arch.rotation.y = Math.PI / 4;
      crownGroup.add(arch);
    }
    scene.add(crownGroup);
    crownGroup.userData.float = true;
    stealables.push({ mesh: crownGroup, item: 'crown', x: 0, z: 140, taken: false, needsSafe: true, safeCracked: false, value: 250000000 });
    { const cRing = new THREE.Mesh(new THREE.RingGeometry(0.80, 1.28, 36),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
      cRing.rotation.x = -Math.PI / 2; cRing.position.set(0, 0.02, 140); scene.add(cRing);
      crownGroup.userData.floorRing = cRing; }

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

    // Crown Vault — tall imposing columns flanking vault entrance
    [-18, -10, 10, 18].forEach(cx => {
      pillar(scene, cx, 118);
    });

    // Crown Vault — decorative gold torch sconces on north wall
    {
      const sconceMat = new THREE.MeshStandardMaterial({ color: 0xc89030, roughness: 0.28, metalness: 0.82 });
      const flameMat  = new THREE.MeshStandardMaterial({
        color: 0xff8800, emissive: 0xff5500, emissiveIntensity: 2.0, roughness: 0.3, transparent: true, opacity: 0.88,
      });
      [-18, -6, 6, 18].forEach(tx => {
        // Wall bracket
        box(scene, 0.08, 0.08, 0.30, tx, 3.8, 159.85, sconceMat);
        // Torch pole
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.030, 0.50, 7), sconceMat);
        pole.position.set(tx, 3.7, 159.7); scene.add(pole);
        // Flame flicker (cone shape)
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.22, 7), flameMat);
        flame.position.set(tx, 4.05, 159.7); scene.add(flame);
        // Warm glow point light
        const torchLight = new THREE.PointLight(0xff9020, 1.2, 8);
        torchLight.position.set(tx, 4.1, 159.5);
        scene.add(torchLight);
      });
    }

    // Crown Vault — neon/bioluminescent accent strip lights
    {
      const cyanMat = new THREE.MeshStandardMaterial({ color: 0x00ffee, emissive: 0x00ffee, emissiveIntensity: 3.0, roughness: 0.3, metalness: 0.1 });
      const purpleMat = new THREE.MeshStandardMaterial({ color: 0xbb00ff, emissive: 0xbb00ff, emissiveIntensity: 3.0, roughness: 0.3, metalness: 0.1 });
      // West wall — cyan strips at low height
      [120, 133, 146].forEach(bz => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 1.8), cyanMat);
        strip.position.set(-24.7, 0.5, bz); scene.add(strip);
        const pl = new THREE.PointLight(0x00ffee, 0.55, 12);
        pl.position.set(-23.5, 0.8, bz); scene.add(pl);
      });
      // East wall — purple strips at low height
      [120, 133, 146].forEach(bz => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 1.8), purpleMat);
        strip.position.set(24.7, 0.5, bz); scene.add(strip);
        const pl = new THREE.PointLight(0xbb00ff, 0.55, 12);
        pl.position.set(23.5, 0.8, bz); scene.add(pl);
      });
      // Crown pedestal — green-gold uplight
      const crownGlowMat = new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x44ff88, emissiveIntensity: 2.5, roughness: 0.3 });
      const crownRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.04, 6, 32), crownGlowMat);
      crownRing.rotation.x = Math.PI / 2; crownRing.position.set(0, 0.06, 140); scene.add(crownRing);
      const crownGlow = new THREE.PointLight(0x44ff88, 1.0, 10);
      crownGlow.position.set(0, 1.5, 140); scene.add(crownGlow);
    }

    // Crown Vault — tapestry banners hanging on east/west walls
    {
      const tapMat = new THREE.MeshStandardMaterial({ color: 0x4a1a00, roughness: 0.90, metalness: 0.0 });
      const tapGoldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.55, metalness: 0.40 });
      // West wall banners
      [-17, -5].forEach(bz => {
        box(scene, 0.06, 3.50, 1.20, -24.85, 3.25, bz + 130, tapMat);
        box(scene, 0.04, 0.12, 1.30, -24.85, 4.90, bz + 130, tapGoldMat);  // top rod
        box(scene, 0.04, 0.12, 1.30, -24.85, 1.50, bz + 130, tapGoldMat);  // bottom weight
      });
      // East wall banners
      [-17, -5].forEach(bz => {
        box(scene, 0.06, 3.50, 1.20,  24.85, 3.25, bz + 130, tapMat);
        box(scene, 0.04, 0.12, 1.30,  24.85, 4.90, bz + 130, tapGoldMat);
        box(scene, 0.04, 0.12, 1.30,  24.85, 1.50, bz + 130, tapGoldMat);
      });
    }

    // Crown Vault — wide velvet ropes near vault entrance (south barrier)
    {
      stanchion(scene, -14, 119);
      stanchion(scene, -7,  119);
      stanchion(scene,  7,  119);
      stanchion(scene,  14, 119);
      velvetRope(scene, -14, 119, -7, 119);
      velvetRope(scene,  -7, 119,  7, 119);
      velvetRope(scene,   7, 119, 14, 119);
    }

    // Guard spawns — Crown Vault (4 guards, randomized routes each run)
    guardData.push({
      spawnX: -10, spawnZ: 120,
      waypoints: _route(
        // Route A: south vault rectangle
        [new THREE.Vector3(-10,0,120), new THREE.Vector3(10,0,120), new THREE.Vector3(10,0,138), new THREE.Vector3(-10,0,138)],
        // Route B: center focus around crown pedestal
        [new THREE.Vector3(-10,0,120), new THREE.Vector3(0,0,135), new THREE.Vector3(10,0,120), new THREE.Vector3(0,0,128)],
        // Route C: west-side sweep
        [new THREE.Vector3(-16,0,118), new THREE.Vector3(-16,0,140), new THREE.Vector3(-5,0,140), new THREE.Vector3(-5,0,118)]
      ),
    });
    guardData.push({
      spawnX: 10, spawnZ: 155,
      waypoints: _route(
        // Route A: exit corridor pace
        [new THREE.Vector3(10,0,155), new THREE.Vector3(-10,0,155), new THREE.Vector3(-10,0,160), new THREE.Vector3(10,0,160)],
        // Route B: east-side tight watch
        [new THREE.Vector3(16,0,148), new THREE.Vector3(16,0,160), new THREE.Vector3(5,0,160), new THREE.Vector3(5,0,148)],
        // Route C: wide north exit sweep
        [new THREE.Vector3(-14,0,150), new THREE.Vector3(14,0,150), new THREE.Vector3(14,0,160), new THREE.Vector3(-14,0,160)]
      ),
    });
    guardData.push({
      spawnX: -16, spawnZ: 140,
      waypoints: _route(
        // Route A: outer perimeter
        [new THREE.Vector3(-16,0,140), new THREE.Vector3(-16,0,158), new THREE.Vector3(16,0,158), new THREE.Vector3(16,0,140)],
        // Route B: west wall
        [new THREE.Vector3(-20,0,118), new THREE.Vector3(-20,0,158), new THREE.Vector3(-10,0,158), new THREE.Vector3(-10,0,118)],
        // Route C: diagonal vault sweep
        [new THREE.Vector3(-16,0,118), new THREE.Vector3(16,0,158), new THREE.Vector3(-16,0,158), new THREE.Vector3(16,0,118)]
      ),
    });
    guardData.push({
      spawnX: 16, spawnZ: 118,
      waypoints: _route(
        // Route A: east entry rectangle
        [new THREE.Vector3(16,0,118), new THREE.Vector3(16,0,130), new THREE.Vector3(-16,0,130), new THREE.Vector3(-16,0,118)],
        // Route B: east wall sentry
        [new THREE.Vector3(20,0,118), new THREE.Vector3(20,0,140), new THREE.Vector3(10,0,140), new THREE.Vector3(10,0,118)],
        // Route C: entry + center loop
        [new THREE.Vector3(16,0,118), new THREE.Vector3(0,0,130), new THREE.Vector3(-16,0,118), new THREE.Vector3(0,0,122)]
      ),
    });

    // Gold ceiling cornice trim
    goldCeilEdge(scene, 0, 137.5, 50, 45);

    // Room label above vault entrance
    roomLabel(scene, 0, 116.5, 'Galerie des Couronnes');

    // Decorative bay trees flanking vault entrance and crown area
    lorTree(scene, -18, 120);
    lorTree(scene,  18, 120);
    lorTree(scene, -18, 155);
    lorTree(scene,  18, 155);

    // Additional vault pillars — inner colonnade
    pillar(scene, -7, 127);
    pillar(scene,  7, 127);
    pillar(scene, -7, 152);
    pillar(scene,  7, 152);

    // More paintings on vault walls (salon style)
    wallPainting(scene, -24.9, 3.5, 137, M.paintings[2], true);
    paintingSpotlight(scene, -24.9, 3.5, 137, 'west');
    placard(scene, -24.9, 2.6, 137, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', 'west');
    wallPainting(scene,  24.9, 3.5, 143, M.paintings[4], false);
    paintingSpotlight(scene,  24.9, 3.5, 143, 'east');
    placard(scene,  24.9, 2.6, 143, 'Wedding at Cana', 'Paolo Veronese, 1563', 'east');

    // Paintings on vault north wall stubs (facing south, visible from inside vault)
    wallPaintingNS(scene, -12, 3.5, 159.90, M.paintings[1], false);
    paintingSpotlight(scene, -12, 3.5, 159.90, 'north');
    placard(scene, -12, 2.6, 159.90, 'The Raft of the Medusa', 'Théodore Géricault, 1818', 'north');
    wallPaintingNS(scene,  12, 3.5, 159.90, M.paintings[3], false);
    paintingSpotlight(scene,  12, 3.5, 159.90, 'north');
    placard(scene,  12, 2.6, 159.90, 'Oath of the Horatii', 'Jacques-Louis David, 1784', 'north');

    // Extra vault paintings — west wall
    wallPainting(scene, -24.9, 3.5, 120, M.vangoghStarry, true);
    paintingSpotlight(scene, -24.9, 3.5, 120, 'west');
    placard(scene, -24.9, 2.6, 120, 'The Starry Night', 'Vincent van Gogh, 1889', 'west');
    wallPainting(scene, -24.9, 3.5, 131, M.monetSunrise, true);
    paintingSpotlight(scene, -24.9, 3.5, 131, 'west');
    placard(scene, -24.9, 2.6, 131, 'Impression, Sunrise', 'Claude Monet, 1872', 'west');
    wallPainting(scene, -24.9, 3.5, 143, M.vangoghSunflowers, true);
    paintingSpotlight(scene, -24.9, 3.5, 143, 'west');
    placard(scene, -24.9, 2.6, 143, 'Sunflowers', 'Vincent van Gogh, 1888', 'west');
    wallPainting(scene, -24.9, 3.5, 157, M.vangoghIrises, true);
    paintingSpotlight(scene, -24.9, 3.5, 157, 'west');
    placard(scene, -24.9, 2.6, 157, 'Irises', 'Vincent van Gogh, 1889', 'west');
    // Extra vault paintings — east wall
    wallPainting(scene,  24.9, 3.5, 120, M.renoir, false);
    paintingSpotlight(scene,  24.9, 3.5, 120, 'east');
    placard(scene,  24.9, 2.6, 120, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', 'east');
    wallPainting(scene,  24.9, 3.5, 133, M.cezanne, false);
    paintingSpotlight(scene,  24.9, 3.5, 133, 'east');
    placard(scene,  24.9, 2.6, 133, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', 'east');
    wallPainting(scene,  24.9, 3.5, 148, M.monetPoppies, false);
    paintingSpotlight(scene,  24.9, 3.5, 148, 'east');
    placard(scene,  24.9, 2.6, 148, 'Poppies', 'Claude Monet, 1873', 'east');
    wallPainting(scene,  24.9, 3.5, 157, M.vangoghStarry, false);
    paintingSpotlight(scene,  24.9, 3.5, 157, 'east');
    placard(scene,  24.9, 2.6, 157, 'The Starry Night', 'Vincent van Gogh, 1889', 'east');
    // Vault south wall paintings (on stubs flanking corridor entrance)
    wallPaintingNS(scene, -15, 3.5, 115.10, M.vangoghSunflowers, true);
    paintingSpotlight(scene, -15, 3.5, 115.10, 'south');
    placard(scene, -15, 2.6, 115.10, 'Sunflowers', 'Vincent van Gogh, 1888', 'south');
    wallPaintingNS(scene,  15, 3.5, 115.10, M.monetSunrise, true);
    paintingSpotlight(scene,  15, 3.5, 115.10, 'south');
    placard(scene,  15, 2.6, 115.10, 'Impression, Sunrise', 'Claude Monet, 1872', 'south');
    // Vault north wall extra
    wallPaintingNS(scene, -6, 3.5, 159.90, M.cezanne, false);
    paintingSpotlight(scene, -6, 3.5, 159.90, 'north');
    wallPaintingNS(scene,  6, 3.5, 159.90, M.renoir, false);
    paintingSpotlight(scene,  6, 3.5, 159.90, 'north');
    // Diamond cluster display case in vault entrance area
    {
      const diamondM = new THREE.MeshStandardMaterial({ color: 0xddf4ff, roughness: 0.0, metalness: 0.05, transparent: true, opacity: 0.82, emissive: 0x88ccff, emissiveIntensity: 0.45 });
      const goldM2 = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.12, metalness: 0.95, emissive: 0x332200, emissiveIntensity: 0.3 });
      // Tall pedestal with diamond cluster on top
      box(scene, 0.32, 1.4, 0.32, -18, 0.7, 122, goldM2);
      box(scene, 0.55, 0.06, 0.55, -18, 1.43, 122, goldM2);
      [[0,0,0.10],[0.08,0,0.07],[-0.08,0,0.07],[0,0,-0.09],[0.06,0.06,0],[-0.06,0.06,0]].forEach(([ox,oy,r]) => {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(r || 0.07), diamondM);
        gem.position.set(-18+ox, 1.56+oy, 122); gem.rotation.y = Math.random()*Math.PI; scene.add(gem);
      });
      const dRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
      dRing.rotation.x = -Math.PI/2; dRing.position.set(-18, 0.02, 122); scene.add(dRing);
      // Second diamond pedestal on other side
      box(scene, 0.32, 1.4, 0.32, 18, 0.7, 122, goldM2);
      box(scene, 0.55, 0.06, 0.55, 18, 1.43, 122, goldM2);
      [[0,0,0.10],[0.08,0,0.07],[-0.08,0,0.07],[0,0,-0.09]].forEach(([ox,oy,r]) => {
        const gem2 = new THREE.Mesh(new THREE.OctahedronGeometry(r || 0.07), diamondM);
        gem2.position.set(18+ox, 1.56+oy, 122); gem2.rotation.y = Math.random()*Math.PI; scene.add(gem2);
      });
      const dRing2 = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
      dRing2.rotation.x = -Math.PI/2; dRing2.position.set(18, 0.02, 122); scene.add(dRing2);
    }

    // Extended velvet carpets (runners leading to crown)
    rug(scene, 0, 124, 6, 10, 0x2a0a4a, 0xc8a040);
    rug(scene, 0, 150, 6, 10, 0x2a0a4a, 0xc8a040);

    // Crown Vault rug near crown pedestal (royal purple with gold border)
    rug(scene, 0, 140, 14, 10, 0x2a0a4a, 0xc8a040);

    // Vault wall paintings
    wallPainting(scene, -24.9, 3.5, 125, M.paintings[0], true);
    paintingSpotlight(scene, -24.9, 3.5, 125, 'west');
    placard(scene, -24.9, 2.6, 125, 'Liberty Leading the People', 'Eugène Delacroix, 1830', 'west');
    wallPainting(scene, -24.9, 3.5, 150, M.paintings[1], true);
    paintingSpotlight(scene, -24.9, 3.5, 150, 'west');
    placard(scene, -24.9, 2.6, 150, 'The Raft of the Medusa', 'Théodore Géricault, 1818', 'west');
    wallPainting(scene,  24.9, 3.5, 130, M.paintings[2], false);
    paintingSpotlight(scene,  24.9, 3.5, 130, 'east');
    placard(scene,  24.9, 2.6, 130, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', 'east');
    wallPainting(scene,  24.9, 3.5, 155, M.paintings[3], false);
    paintingSpotlight(scene,  24.9, 3.5, 155, 'east');
    placard(scene,  24.9, 2.6, 155, 'Oath of the Horatii', 'Jacques-Louis David, 1784', 'east');
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

    // Wall lanterns — Crown Vault west wall
    wallLantern(scene, -24.85, 3.2, 122,  1);
    wallLantern(scene, -24.85, 3.2, 128,  1);
    wallLantern(scene, -24.85, 3.2, 134,  1);
    wallLantern(scene, -24.85, 3.2, 140,  1);
    wallLantern(scene, -24.85, 3.2, 146,  1);
    wallLantern(scene, -24.85, 3.2, 153,  1);
    wallLantern(scene, -24.85, 3.2, 158,  1);
    // Wall lanterns — Crown Vault east wall
    wallLantern(scene,  24.85, 3.2, 122, -1);
    wallLantern(scene,  24.85, 3.2, 128, -1);
    wallLantern(scene,  24.85, 3.2, 134, -1);
    wallLantern(scene,  24.85, 3.2, 140, -1);
    wallLantern(scene,  24.85, 3.2, 146, -1);
    wallLantern(scene,  24.85, 3.2, 153, -1);
    wallLantern(scene,  24.85, 3.2, 158, -1);
    // Crown Vault ceiling lamps above point lights
    [[-10, 125], [10, 125], [0, 140], [-10, 155], [10, 155]].forEach(([lx, lz]) => ceilingLamp(scene, lx, lz));

    // Crown Vault chandeliers
    lobbyChandelier(scene,  0, 130);
    lobbyChandelier(scene, -8, 145);
    lobbyChandelier(scene,  8, 145);

    // Vault corner plants (smaller scale)
    [[-22, 118], [22, 118], [-22, 158], [22, 158]].forEach(([px, pz]) => plantPot(scene, px, pz, 0.9));

    // Cameras — Crown Vault (4 cameras)
    cameraData.push({ x: -14, y: WALL_H - 0.3, z: 125, sweepAngle: Math.PI / 2.5, facingZ:  1 });
    cameraData.push({ x:  14, y: WALL_H - 0.3, z: 125, sweepAngle: Math.PI / 2.5, facingZ:  1 });
    cameraData.push({ x: -14, y: WALL_H - 0.3, z: 157, sweepAngle: Math.PI / 2.5, facingZ: -1 });
    cameraData.push({ x:  14, y: WALL_H - 0.3, z: 157, sweepAngle: Math.PI / 2.5, facingZ: -1 });

    // ════════════════════════════════════════════════════════
    //  CHAMBRE ÉGYPTIENNE  X 25→57  Z 121→154
    //  Ancient catacomb off Crown Vault east wall
    //  cx=41  cz=137.5  32×33
    // ════════════════════════════════════════════════════════
    {
      const ECX = 41, ECZ = 137.5, ECW = 32, ECD = 33;

      // ── Materials ───────────────────────────────────────
      const sandStoneMat = new THREE.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.92, metalness: 0.0 });
      const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x2c1c08, roughness: 0.95, metalness: 0.0 });
      const goldEgyptMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.16, metalness: 0.92, emissive: 0x5a3c00, emissiveIntensity: 0.18 });
      const turqMat      = new THREE.MeshStandardMaterial({ color: 0x1a9888, roughness: 0.22, metalness: 0.08, emissive: 0x084438, emissiveIntensity: 0.22 });
      const torchGlowMat = new THREE.MeshStandardMaterial({
        color: 0xff8800, emissive: 0xff5500, emissiveIntensity: 2.4,
        transparent: true, opacity: 0.88, roughness: 0.08,
      });

      // ── Floor with sandy limestone texture ──────────────
      const egyptFloorTex = makeEgyptianFloorTex();
      egyptFloorTex.repeat.set(ECW / 4, ECD / 4);
      const egyptFloorMat = new THREE.MeshStandardMaterial({
        map: egyptFloorTex, color: 0x6a5030, roughness: 0.88, metalness: 0.0,
      });

      // ── Room shell ──────────────────────────────────────
      floor(scene,   ECX, ECZ, ECW, ECD, egyptFloorMat);
      ceiling(scene, ECX, ECZ, ECW, ECD, darkStoneMat);
      wall(scene, ECX,          ECZ - ECD / 2, ECW,  WALL_T, sandStoneMat);  // south Z=121
      wall(scene, ECX,          ECZ + ECD / 2, ECW,  WALL_T, sandStoneMat);  // north Z=154
      wall(scene, ECX + ECW / 2, ECZ,          WALL_T, ECD,  sandStoneMat);  // east  X=57
      // West wall (X=25) covered by vault east-wall stubs

      // ── Wall torch helper ────────────────────────────────
      // px,py,pz = wall attachment point;  dx,dz = outward direction (one is 0)
      function egyptTorch(px, py, pz, dx, dz) {
        const ironM = new THREE.MeshStandardMaterial({ color: 0x1a0e04, roughness: 0.50, metalness: 0.65 });
        const reach = 0.44;
        const tipX = px + dx * reach, tipZ = pz + dz * reach;
        const armW = Math.abs(dx) * reach * 0.9 + 0.04;
        const armD = Math.abs(dz) * reach * 0.9 + 0.04;
        box(scene, armW, 0.042, armD, px + dx * reach * 0.45, py + 0.042, pz + dz * reach * 0.45, ironM);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.52, 6), ironM);
        stick.castShadow = false; stick.position.set(tipX, py - 0.14, tipZ); scene.add(stick);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.098, 7, 6), torchGlowMat);
        flame.castShadow = false; flame.scale.set(1.0, 1.35, 1.0); flame.position.set(tipX, py + 0.12, tipZ); scene.add(flame);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.145, 6, 5), new THREE.MeshStandardMaterial({
          color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.60,
          transparent: true, opacity: 0.28, roughness: 0.1,
        }));
        halo.castShadow = false; halo.position.set(tipX, py + 0.16, tipZ); scene.add(halo);
      }

      // West wall torches (pointing east)
      egyptTorch(25.2, 3.2, ECZ - 9,  1, 0);
      egyptTorch(25.2, 3.2, ECZ,       1, 0);
      egyptTorch(25.2, 3.2, ECZ + 9,  1, 0);
      // East wall torches (pointing west)
      egyptTorch(56.8, 3.2, ECZ - 9, -1, 0);
      egyptTorch(56.8, 3.2, ECZ,     -1, 0);
      egyptTorch(56.8, 3.2, ECZ + 9, -1, 0);
      // South wall torches (pointing north)
      egyptTorch(ECX - 8, 3.2, 121.2, 0, 1);
      egyptTorch(ECX + 8, 3.2, 121.2, 0, 1);
      // North wall torches (pointing south)
      egyptTorch(ECX - 8, 3.2, 153.8, 0, -1);
      egyptTorch(ECX + 8, 3.2, 153.8, 0, -1);

      // ── Square Egyptian columns ──────────────────────────
      function egyptColumn(cx, cz) {
        const hieroBandMat = new THREE.MeshStandardMaterial({
          color: 0x8a6820, emissive: 0xd4a020, emissiveIntensity: 0.20, roughness: 0.80,
        });
        box(scene, 0.88, WALL_H - 0.40, 0.88, cx, (WALL_H - 0.40) / 2 + 0.20, cz, sandStoneMat);
        box(scene, 1.18, 0.20, 1.18, cx, 0.10, cz, darkStoneMat);          // base plinth
        box(scene, 1.18, 0.20, 1.18, cx, WALL_H - 0.10, cz, darkStoneMat); // capital slab
        boxD(scene, 0.90, 0.14, 0.90, cx, (WALL_H - 0.40) / 2 + 0.20, cz, hieroBandMat); // glyph band
        addWallAABB(cx, cz, 1.2, 1.2);
      }
      egyptColumn(ECX - 7, ECZ - 6);
      egyptColumn(ECX + 7, ECZ - 6);
      egyptColumn(ECX - 7, ECZ + 6);
      egyptColumn(ECX + 7, ECZ + 6);

      // ── Three sarcophagi along south wall ───────────────
      function sarcophagus(sx, sz) {
        const tubMat = new THREE.MeshStandardMaterial({ color: 0x4a3518, roughness: 0.84, metalness: 0.05 });
        const lidMat = new THREE.MeshStandardMaterial({ color: 0x5c4528, roughness: 0.76, metalness: 0.06 });
        box(scene, 0.94, 0.32, 2.20, sx, 0.16, sz, tubMat);  // tub
        box(scene, 0.90, 0.28, 2.16, sx, 0.46, sz, lidMat);  // lid
        // Gold death-mask at head end (−Z)
        const mask = new THREE.Mesh(new THREE.SphereGeometry(0.195, 9, 7), goldEgyptMat);
        mask.castShadow = false; mask.scale.set(0.78, 0.88, 0.55);
        mask.position.set(sx, 0.66, sz - 0.88); scene.add(mask);
        // Gold banding strips
        [-0.55, 0, 0.55].forEach(bz => boxD(scene, 0.92, 0.038, 0.055, sx, 0.50, sz + bz, goldEgyptMat));
        // Turquoise inlay gems
        [[-0.28, 0.18], [0.28, 0.18], [0, -0.30]].forEach(([bx, bz]) => {
          const gem = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.036, 0.048), turqMat);
          gem.castShadow = false; gem.position.set(sx + bx, 0.62, sz + bz); scene.add(gem);
        });
        addWallAABB(sx, sz, 1.05, 2.4);
      }
      sarcophagus(ECX - 10, ECZ - 12);
      sarcophagus(ECX,      ECZ - 12);
      sarcophagus(ECX + 10, ECZ - 12);

      // ── Central stone altar with canopic jars ───────────
      box(scene, 2.20, 0.18, 3.60, ECX, 0.09, ECZ, darkStoneMat);  // base slab
      box(scene, 2.00, 0.50, 3.40, ECX, 0.43, ECZ, sandStoneMat);  // body
      box(scene, 2.30, 0.12, 3.70, ECX, 0.74, ECZ, darkStoneMat);  // top slab
      addWallAABB(ECX, ECZ, 2.5, 4.0);
      // 4 canopic jars on altar
      const jarBodyMat = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.82, metalness: 0.0 });
      const jarGoldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.18, metalness: 0.92 });
      [-0.72, -0.24, 0.24, 0.72].forEach(jx => {
        const jBody = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.058, 0.28, 8), jarBodyMat);
        jBody.castShadow = false; jBody.position.set(ECX + jx, 0.92, ECZ); scene.add(jBody);
        const jLid = new THREE.Mesh(new THREE.SphereGeometry(0.070, 7, 5), jarGoldMat);
        jLid.castShadow = false; jLid.position.set(ECX + jx, 1.085, ECZ); scene.add(jLid);
        const jBand = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 10), jarGoldMat);
        jBand.castShadow = false; jBand.rotation.x = Math.PI / 2; jBand.position.set(ECX + jx, 0.93, ECZ); scene.add(jBand);
      });

      // ── Anubis statue — jackal-headed guardian ───────────
      {
        const anubMat = new THREE.MeshStandardMaterial({
          color: 0x1a1208, roughness: 0.68, metalness: 0.20, emissive: 0x080600, emissiveIntensity: 0.08,
        });
        box(scene, 1.15, 0.90, 1.15, ECX + 11, 0.45, ECZ, darkStoneMat);  // pedestal
        const aBody = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.225, 0.78, 8), anubMat);
        aBody.position.set(ECX + 11, 1.29, ECZ); scene.add(aBody);
        const aHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.27, 0.40), anubMat);
        aHead.position.set(ECX + 11, 1.78, ECZ); scene.add(aHead);
        const aSnout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.28), anubMat);
        aSnout.castShadow = false; aSnout.position.set(ECX + 11, 1.71, ECZ - 0.30); scene.add(aSnout);
        const aEarL = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 4), anubMat);
        aEarL.castShadow = false; aEarL.position.set(ECX + 11 - 0.09, 1.97, ECZ); scene.add(aEarL);
        const aEarR = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 4), anubMat);
        aEarR.castShadow = false; aEarR.position.set(ECX + 11 + 0.09, 1.97, ECZ); scene.add(aEarR);
        const aCollar = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.028, 6, 14), goldEgyptMat);
        aCollar.castShadow = false; aCollar.rotation.x = Math.PI / 2; aCollar.position.set(ECX + 11, 1.53, ECZ); scene.add(aCollar);
        const aStaff = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.88, 6), goldEgyptMat);
        aStaff.castShadow = false; aStaff.position.set(ECX + 11 - 0.20, 1.33, ECZ - 0.16); aStaff.rotation.z = 0.22; scene.add(aStaff);
        addWallAABB(ECX + 11, ECZ, 1.35, 1.35);
      }

      // ── Hieroglyph wall panels (emissive carvings) ───────
      {
        const hieroPanelMat = new THREE.MeshStandardMaterial({
          color: 0x907848, emissive: 0xc09020, emissiveIntensity: 0.14, roughness: 0.88,
        });
        // East wall
        [-8, 0, 8].forEach(dz => box(scene, 0.08, 2.60, 1.85, ECX + ECW / 2 - 0.04, 2.50, ECZ + dz, hieroPanelMat));
        // North wall
        [-8, 0, 8].forEach(dx => box(scene, 1.85, 2.60, 0.08, ECX + dx, 2.50, ECZ + ECD / 2 - 0.04, hieroPanelMat));
        // South wall — placed high, above sarcophagi
        [-8, 0, 8].forEach(dx => box(scene, 1.85, 1.80, 0.08, ECX + dx, 4.00, ECZ - ECD / 2 + 0.04, hieroPanelMat));
      }

      // ── Scarab beetles on altar base ─────────────────────
      {
        const scarabM = new THREE.MeshStandardMaterial({
          color: 0x1a5a8a, roughness: 0.22, metalness: 0.12, emissive: 0x082040, emissiveIntensity: 0.25,
        });
        [[ECX - 0.8, ECZ - 1.6], [ECX + 0.8, ECZ - 1.6], [ECX, ECZ + 1.6]].forEach(([sx, sz]) => {
          const sb = new THREE.Mesh(new THREE.SphereGeometry(0.058, 7, 5), scarabM);
          sb.castShadow = false; sb.scale.set(0.85, 0.55, 1.20); sb.position.set(sx, 0.82, sz); scene.add(sb);
        });
      }

      // ── Stealables ───────────────────────────────────────

      // 1. Eye of Ra Amulet — gold disk with ruby eye  (NW pedestal)
      {
        const amuMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.12, metalness: 0.95, emissive: 0x5a3800, emissiveIntensity: 0.22 });
        const rubyM2 = new THREE.MeshStandardMaterial({ color: 0xff3300, roughness: 0.04, metalness: 0.02, emissive: 0xcc1100, emissiveIntensity: 0.55, transparent: true, opacity: 0.90 });
        const eyeGrp = new THREE.Group();
        const eDisk  = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.016, 14), amuMat);
        eDisk.rotation.x = Math.PI / 2; eyeGrp.add(eDisk);
        const eEye  = new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 5), rubyM2); eyeGrp.add(eEye);
        const eRing = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.014, 6, 14), amuMat);
        eRing.rotation.x = Math.PI / 2; eyeGrp.add(eRing);
        box(scene, 0.22, 0.65, 0.22, ECX - 10, 0.325, ECZ + 11, darkStoneMat);
        eyeGrp.position.set(ECX - 10, 1.02, ECZ + 11);
        eyeGrp.userData.float = true; scene.add(eyeGrp);
        stealables.push({ mesh: eyeGrp, item: 'eyeofra', x: ECX - 10, z: ECZ + 11, taken: false, bonus: true, label: 'Eye of Ra Amulet', value: 5500000 });
        const eFloorRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        eFloorRing.rotation.x = -Math.PI / 2; eFloorRing.position.set(ECX - 10, 0.02, ECZ + 11); scene.add(eFloorRing);
        eyeGrp.userData.floorRing = eFloorRing;
      }

      // 2. Pharaoh's Scepter — gold crook-staff  (NE pedestal)
      {
        const sceptMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.14, metalness: 0.92, emissive: 0x5a3800, emissiveIntensity: 0.20 });
        const bluBand  = new THREE.MeshStandardMaterial({ color: 0x1840c0, roughness: 0.12, metalness: 0.08, emissive: 0x050a44, emissiveIntensity: 0.28 });
        const sceptGrp = new THREE.Group();
        const sShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.64, 8), sceptMat); sceptGrp.add(sShaft);
        const sHook  = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.022, 6, 10, Math.PI * 1.10), sceptMat);
        sHook.position.set(0.055, 0.35, 0); sHook.rotation.z = -0.48; sceptGrp.add(sHook);
        [-0.24, -0.04, 0.16].forEach((sy, i) => {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.040, 8), i % 2 === 0 ? bluBand : sceptMat);
          band.position.y = sy; sceptGrp.add(band);
        });
        box(scene, 0.22, 0.65, 0.22, ECX + 10, 0.325, ECZ + 11, darkStoneMat);
        sceptGrp.position.set(ECX + 10, 1.15, ECZ + 11);
        sceptGrp.rotation.z = -0.28; sceptGrp.userData.float = true; scene.add(sceptGrp);
        stealables.push({ mesh: sceptGrp, item: 'scepter', x: ECX + 10, z: ECZ + 11, taken: false, bonus: true, label: "Pharaoh's Scepter", value: 18000000 });
        const sFloorRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        sFloorRing.rotation.x = -Math.PI / 2; sFloorRing.position.set(ECX + 10, 0.02, ECZ + 11); scene.add(sFloorRing);
        sceptGrp.userData.floorRing = sFloorRing;
      }

      // 3. Scarab Pectoral — jewelled winged collar  (north-center pedestal)
      {
        const collarGold = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.15, metalness: 0.92 });
        const lapMat2    = new THREE.MeshStandardMaterial({ color: 0x1a9888, roughness: 0.08, metalness: 0.04, emissive: 0x084840, emissiveIntensity: 0.32, transparent: true, opacity: 0.92 });
        const wingMat2   = new THREE.MeshStandardMaterial({ color: 0x2244cc, roughness: 0.10, metalness: 0.05, emissive: 0x050a66, emissiveIntensity: 0.28 });
        const scarabGrp  = new THREE.Group();
        const scCollar = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.024, 6, 14, Math.PI), collarGold);
        scCollar.rotation.z = Math.PI; scarabGrp.add(scCollar);
        const scBody = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), lapMat2);
        scBody.scale.set(1.05, 0.66, 1.35); scarabGrp.add(scBody);
        [-1, 1].forEach(side => {
          const wing = new THREE.Mesh(new THREE.SphereGeometry(0.068, 7, 5), wingMat2);
          wing.scale.set(2.1, 0.28, 0.88); wing.position.set(side * 0.115, 0, 0); scarabGrp.add(wing);
        });
        box(scene, 0.22, 0.65, 0.22, ECX, 0.325, ECZ + 11, darkStoneMat);
        scarabGrp.position.set(ECX, 1.02, ECZ + 11);
        scarabGrp.rotation.x = Math.PI / 2; scarabGrp.userData.float = true; scene.add(scarabGrp);
        stealables.push({ mesh: scarabGrp, item: 'scarab', x: ECX, z: ECZ + 11, taken: false, bonus: true, label: 'Scarab Pectoral', value: 7500000 });
        const scFloorRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0x22ddcc, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        scFloorRing.rotation.x = -Math.PI / 2; scFloorRing.position.set(ECX, 0.02, ECZ + 11); scene.add(scFloorRing);
        scarabGrp.userData.floorRing = scFloorRing;
      }

      // ── Mummy statues — flanking west entrance ────────────
      {
        const mummyWrapMat = new THREE.MeshStandardMaterial({ color: 0xb09870, roughness: 0.92, metalness: 0.0 });
        const mummyBandMat = new THREE.MeshStandardMaterial({ color: 0x6a4c24, roughness: 0.90, metalness: 0.0 });
        const mummyGoldM   = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.16, metalness: 0.92, emissive: 0x5a3c00, emissiveIntensity: 0.24 });
        function mummyStatue(mx, mz) {
          // Pedestal
          box(scene, 1.15, 0.30, 1.15, mx, 0.15, mz, darkStoneMat);
          // Feet block
          box(scene, 0.54, 0.28, 0.54, mx, 0.44, mz, mummyWrapMat);
          // Lower body
          box(scene, 0.60, 0.90, 0.56, mx, 0.99, mz, mummyWrapMat);
          // Upper torso
          box(scene, 0.66, 0.96, 0.58, mx, 1.89, mz, mummyWrapMat);
          // Head
          box(scene, 0.56, 0.60, 0.50, mx, 2.82, mz, mummyWrapMat);
          // Gold burial mask face plate
          boxD(scene, 0.50, 0.52, 0.09, mx, 2.80, mz - 0.28, mummyGoldM);
          // Nemes headdress sides (gold cloth hanging)
          boxD(scene, 0.11, 0.58, 0.32, mx - 0.35, 2.76, mz, mummyGoldM);
          boxD(scene, 0.11, 0.58, 0.32, mx + 0.35, 2.76, mz, mummyGoldM);
          // Nemes top slab
          boxD(scene, 0.62, 0.14, 0.56, mx, 3.12, mz, mummyGoldM);
          // Gold broad collar
          const mCol = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.044, 6, 14), mummyGoldM);
          mCol.castShadow = false; mCol.rotation.x = Math.PI / 2; mCol.position.set(mx, 2.46, mz); scene.add(mCol);
          // Crossed arms
          boxD(scene, 0.58, 0.14, 0.17, mx - 0.14, 1.96, mz - 0.17, mummyWrapMat);
          boxD(scene, 0.58, 0.14, 0.17, mx + 0.14, 1.96, mz - 0.17, mummyWrapMat);
          // Horizontal wrap bands
          [0.44, 0.98, 1.55, 2.08, 2.56].forEach(by =>
            boxD(scene, 0.72, 0.055, 0.64, mx, by, mz, mummyBandMat)
          );
          // Gold ankh amulet on chest
          boxD(scene, 0.058, 0.20, 0.058, mx, 1.98, mz - 0.32, mummyGoldM);
          const ankTop = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.018, 5, 8), mummyGoldM);
          ankTop.castShadow = false; ankTop.rotation.x = Math.PI / 2; ankTop.position.set(mx, 2.09, mz - 0.32); scene.add(ankTop);
          addWallAABB(mx, mz, 1.35, 1.35);
        }
        mummyStatue(28, ECZ - 5.5);   // south of entrance
        mummyStatue(28, ECZ + 5.5);   // north of entrance
      }

      // ── Sphinx statues — NW and NE corners, facing inward ─
      {
        const sphinxStoneMat = new THREE.MeshStandardMaterial({ color: 0x9a7c40, roughness: 0.87, metalness: 0.04 });
        const sphinxGoldM    = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.18, metalness: 0.90, emissive: 0x5a3c00, emissiveIntensity: 0.20 });
        // Sphinx facing south (head toward −Z from center). Base centered at (sx, sz).
        function sphinxStatue(sx, sz) {
          // Base platform
          box(scene, 2.00, 0.20, 4.20, sx, 0.10, sz, darkStoneMat);
          // Rear haunches (lion rump)
          box(scene, 1.60, 1.30, 1.50, sx, 0.85, sz + 1.00, sphinxStoneMat);
          // Main lion body
          box(scene, 1.52, 0.96, 2.40, sx, 0.68, sz - 0.10, sphinxStoneMat);
          // Front paw left
          box(scene, 0.44, 0.34, 1.40, sx - 0.48, 0.17, sz - 1.30, sphinxStoneMat);
          // Front paw right
          box(scene, 0.44, 0.34, 1.40, sx + 0.48, 0.17, sz - 1.30, sphinxStoneMat);
          // Chest / shoulder mass
          box(scene, 1.54, 1.00, 1.00, sx, 1.20, sz - 0.80, sphinxStoneMat);
          // Neck
          box(scene, 0.84, 0.80, 0.72, sx, 1.82, sz - 0.98, sphinxStoneMat);
          // Head
          box(scene, 0.88, 0.90, 0.80, sx, 2.56, sz - 1.00, sphinxStoneMat);
          // Nemes headdress (gold-banded cloth)
          box(scene, 1.14, 0.84, 1.00, sx, 2.80, sz - 0.94, sphinxGoldM);
          // Nemes side lappets hanging down
          boxD(scene, 0.14, 0.62, 0.34, sx - 0.60, 2.46, sz - 0.96, sphinxGoldM);
          boxD(scene, 0.14, 0.62, 0.34, sx + 0.60, 2.46, sz - 0.96, sphinxGoldM);
          // Face front plate
          box(scene, 0.72, 0.74, 0.12, sx, 2.54, sz - 1.46, sphinxStoneMat);
          // Brow ridge (gold)
          boxD(scene, 0.64, 0.11, 0.11, sx, 2.80, sz - 1.50, sphinxGoldM);
          // False beard (gold)
          boxD(scene, 0.18, 0.38, 0.14, sx, 2.26, sz - 1.46, sphinxGoldM);
          // Broad collar / gorget
          const sCol = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.060, 6, 14), sphinxGoldM);
          sCol.castShadow = false; sCol.rotation.x = Math.PI / 2; sCol.position.set(sx, 2.22, sz - 1.00); scene.add(sCol);
          addWallAABB(sx, sz - 0.50, 2.2, 4.4);
        }
        sphinxStatue(29.5, ECZ + 13.5);   // NW sphinx
        sphinxStatue(52.5, ECZ + 13.5);   // NE sphinx
      }

      // ── Egyptian rug — center aisle between entrance and altar ─
      {
        const rugTex = makeEgyptianRugTex();
        const rugMat = new THREE.MeshStandardMaterial({
          map: rugTex, roughness: 0.78, metalness: 0.0,
        });
        const rugGeo = new THREE.PlaneGeometry(10, 6);
        const rug = new THREE.Mesh(rugGeo, rugMat);
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(ECX, 0.015, ECZ - 7);
        scene.add(rug);
        // Gold fringe strips along short ends
        const fringeMat = new THREE.MeshStandardMaterial({ color: 0xc89018, roughness: 0.30, metalness: 0.55 });
        boxD(scene, 10.4, 0.04, 0.14, ECX, 0.020, ECZ - 10.07, fringeMat);
        boxD(scene, 10.4, 0.04, 0.14, ECX, 0.020, ECZ -  3.93, fringeMat);
      }

      // ── Papyrus scroll display — east wall, south section ─
      {
        const scrollStoneMat = new THREE.MeshStandardMaterial({ color: 0x3c2a10, roughness: 0.88, metalness: 0.0 });
        const papyrusMat = new THREE.MeshStandardMaterial({ color: 0xd4b870, roughness: 0.82, metalness: 0.0, emissive: 0x5a3c00, emissiveIntensity: 0.06 });
        const scrollInkMat = new THREE.MeshStandardMaterial({ color: 0x5a3800, roughness: 0.90, metalness: 0.0 });
        const scrollGoldM  = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.20, metalness: 0.90 });
        const dSX = ECX + ECW / 2 - 0.60;  // against east wall
        const dSZ = ECZ - 5;
        // Stone display shelf
        box(scene, 0.20, 0.28, 2.80, dSX, 0.14, dSZ, darkStoneMat);          // wall bracket
        boxD(scene, 0.18, 0.08, 3.00, dSX - 0.16, 0.28, dSZ, scrollStoneMat); // shelf ledge
        box(scene, 0.18, 1.30, 3.00, dSX - 0.20, 1.10, dSZ, scrollStoneMat);  // back panel
        // Top rail with gold trim
        boxD(scene, 0.24, 0.08, 3.04, dSX - 0.18, 1.80, dSZ, scrollGoldM);
        // 3 open papyrus scrolls on the shelf (lying flat, rotated)
        const openPositions = [dSZ - 0.80, dSZ, dSZ + 0.80];
        openPositions.forEach(oz => {
          const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 1.00), papyrusMat);
          scroll.castShadow = false; scroll.rotation.y = Math.PI / 2;
          scroll.position.set(dSX - 0.28, 0.36, oz);
          scene.add(scroll);
          // Rolled end caps (cylinders at top and bottom)
          const rollerGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.60, 7);
          const rollTop = new THREE.Mesh(rollerGeo, scrollGoldM);
          rollTop.castShadow = false; rollTop.rotation.z = Math.PI / 2; rollTop.position.set(dSX - 0.28, 0.36, oz - 0.52); scene.add(rollTop);
          const rollBot = new THREE.Mesh(rollerGeo, scrollGoldM);
          rollBot.castShadow = false; rollBot.rotation.z = Math.PI / 2; rollBot.position.set(dSX - 0.28, 0.36, oz + 0.52); scene.add(rollBot);
          // Faint ink lines on papyrus (simulated text)
          [0.20, 0.04, -0.12, -0.28].forEach(iy => {
            boxD(scene, 0.005, 0.012, 0.38, dSX - 0.28, 0.36 + iy, oz, scrollInkMat);
          });
        });
        // 2 rolled scroll tubes on upper shelf
        [dSZ - 0.55, dSZ + 0.55].forEach(rz => {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.52, 8), papyrusMat);
          tube.castShadow = false; tube.rotation.z = Math.PI / 2; tube.position.set(dSX - 0.28, 1.90, rz); scene.add(tube);
          const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.030, 8), scrollGoldM);
          capL.castShadow = false; capL.rotation.z = Math.PI / 2; capL.position.set(dSX - 0.28, 1.90, rz - 0.28); scene.add(capL);
          const capR = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.030, 8), scrollGoldM);
          capR.castShadow = false; capR.rotation.z = Math.PI / 2; capR.position.set(dSX - 0.28, 1.90, rz + 0.28); scene.add(capR);
        });
      }

      // ── Large stepped pyramid — north wall centerpiece ────
      {
        const pyramidStoneMat = new THREE.MeshStandardMaterial({ color: 0x7a6030, roughness: 0.88, metalness: 0.02 });
        const pyramidDarkMat  = new THREE.MeshStandardMaterial({ color: 0x3c2a10, roughness: 0.92, metalness: 0.0 });
        const pyramidGoldMat  = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.14, metalness: 0.94, emissive: 0x5a3c00, emissiveIntensity: 0.30 });
        const hieroPyrMat     = new THREE.MeshStandardMaterial({ color: 0x9a7840, emissive: 0xd4a020, emissiveIntensity: 0.16, roughness: 0.82 });
        // 4-step pyramid centered at (ECX, 152) against north wall
        const PX = ECX, PZ = 151.5;
        // Step 1 — base
        box(scene, 12.0, 1.60, 5.0, PX, 0.80, PZ, pyramidStoneMat);
        // Hieroglyph band on step 1 front face
        boxD(scene, 11.6, 0.36, 0.10, PX, 0.90, PZ - 2.54, hieroPyrMat);
        // Step 2
        box(scene, 8.5,  1.60, 3.5, PX, 2.40, PZ, pyramidStoneMat);
        boxD(scene, 8.1,  0.30, 0.10, PX, 2.50, PZ - 1.79, hieroPyrMat);
        // Step 3
        box(scene, 5.5,  1.60, 2.2, PX, 4.00, PZ, pyramidStoneMat);
        boxD(scene, 5.1,  0.26, 0.10, PX, 4.10, PZ - 1.14, hieroPyrMat);
        // Step 4
        box(scene, 3.0,  1.60, 1.2, PX, 5.60, PZ, pyramidStoneMat);
        // Capstone — polished gold
        box(scene, 1.4,  1.00, 0.55, PX, 7.30, PZ, pyramidGoldMat);
        // Shadow groove lines between steps (darker inset strips)
        [1.59, 3.19, 4.79].forEach(by => {
          boxD(scene, 12.4, 0.08, 0.08, PX, by, PZ - 2.56, pyramidDarkMat);
        });
        // Gold corner accent caps on each step
        [[6.1, PZ - 2.5], [-6.1, PZ - 2.5], [4.35, PZ - 1.75], [-4.35, PZ - 1.75],
         [2.85, PZ - 1.10], [-2.85, PZ - 1.10]].forEach(([ox, oz]) => {
          boxD(scene, 0.22, 0.22, 0.22, PX + ox, 1.60, oz, pyramidGoldMat);
        });
        addWallAABB(PX, PZ, 12.5, 5.2);
        // Flanking obelisks
        [-5.5, 5.5].forEach(ox => {
          const obX = PX + ox, obZ = PZ - 3.8;
          box(scene, 0.60, 0.30, 0.60, obX, 0.15, obZ, pyramidDarkMat);   // base
          box(scene, 0.48, 3.50, 0.48, obX, 1.95, obZ, pyramidStoneMat);  // shaft
          boxD(scene, 0.50, 0.36, 0.50, obX, 0.44, obZ, hieroPyrMat);     // glyph band
          // Pyramid tip (small gold cap)
          const obeliskTip = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.24, 0.42, 4), pyramidGoldMat);
          obeliskTip.position.set(obX, 3.92, obZ); scene.add(obeliskTip);
          addWallAABB(obX, obZ, 0.70, 0.70);
        });
      }

      // ── Horus falcon statue — east wall, north section ───
      {
        const horusMat  = new THREE.MeshStandardMaterial({ color: 0x1a0e04, roughness: 0.66, metalness: 0.22, emissive: 0x080400, emissiveIntensity: 0.08 });
        const horusGold = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.16, metalness: 0.92, emissive: 0x5a3c00, emissiveIntensity: 0.22 });
        const horusEyeM = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xcc4400, emissiveIntensity: 0.68, roughness: 0.04 });
        box(scene, 1.0, 0.80, 1.0, ECX + 13, 0.40, ECZ + 6, darkStoneMat);  // pedestal
        // Body (standing upright)
        box(scene, 0.54, 1.10, 0.52, ECX + 13, 1.35, ECZ + 6, horusMat);
        // Wings folded against sides
        [-1, 1].forEach(s => {
          box(scene, 0.28, 0.90, 0.50, ECX + 13 + s * 0.41, 1.30, ECZ + 6, horusMat);
          // Wing gold trim
          boxD(scene, 0.06, 0.88, 0.48, ECX + 13 + s * 0.55, 1.30, ECZ + 6, horusGold);
        });
        // Falcon head
        const hHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), horusMat);
        hHead.scale.set(0.90, 1.08, 1.02); hHead.position.set(ECX + 13, 2.08, ECZ + 6); scene.add(hHead);
        // Beak
        const hBeak = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.14, 5), horusMat);
        hBeak.rotation.x = Math.PI / 2 + 0.60; hBeak.position.set(ECX + 13, 1.98, ECZ + 6 - 0.20); scene.add(hBeak);
        // Eyes of Horus
        [-0.07, 0.07].forEach(ex => {
          const he = new THREE.Mesh(new THREE.SphereGeometry(0.034, 6, 5), horusEyeM);
          he.position.set(ECX + 13 + ex, 2.10, ECZ + 6 - 0.16); scene.add(he);
        });
        // Double crown (gold pschent)
        const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 8), horusGold);
        crownBase.position.set(ECX + 13, 2.34, ECZ + 6); scene.add(crownBase);
        const crownTop  = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.38, 8), horusGold);
        crownTop.position.set(ECX + 13, 2.65, ECZ + 6); scene.add(crownTop);
        // Gold broad collar
        const hCollar = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.038, 6, 14), horusGold);
        hCollar.rotation.x = Math.PI / 2; hCollar.position.set(ECX + 13, 1.86, ECZ + 6); scene.add(hCollar);
        // Gold ankh held in hands
        box(scene, 0.044, 0.28, 0.044, ECX + 13 + 0.32, 1.22, ECZ + 6 - 0.18, horusGold);
        const ankLoop = new THREE.Mesh(new THREE.TorusGeometry(0.060, 0.020, 5, 8), horusGold);
        ankLoop.rotation.x = Math.PI / 2; ankLoop.position.set(ECX + 13 + 0.32, 1.42, ECZ + 6 - 0.18); scene.add(ankLoop);
        addWallAABB(ECX + 13, ECZ + 6, 1.30, 1.30);
      }

      // ── Two additional sarcophagi — east wall alcoves ─────
      {
        const tubMat2 = new THREE.MeshStandardMaterial({ color: 0x4a3518, roughness: 0.84, metalness: 0.05 });
        const lidMat2 = new THREE.MeshStandardMaterial({ color: 0x5c4528, roughness: 0.76, metalness: 0.06 });
        [[ECX + 13, ECZ - 8], [ECX + 13, ECZ + 0]].forEach(([sx, sz]) => {
          box(scene, 0.94, 0.32, 2.20, sx, 0.16, sz, tubMat2);
          box(scene, 0.90, 0.28, 2.16, sx, 0.46, sz, lidMat2);
          const mask = new THREE.Mesh(new THREE.SphereGeometry(0.195, 9, 7), goldEgyptMat);
          mask.scale.set(0.78, 0.88, 0.55); mask.position.set(sx, 0.66, sz - 0.88); scene.add(mask);
          [-0.55, 0, 0.55].forEach(bz => boxD(scene, 0.92, 0.038, 0.055, sx, 0.50, sz + bz, goldEgyptMat));
          addWallAABB(sx, sz, 1.05, 2.4);
        });
      }

      // ── Golden treasure chest near altar ─────────────────
      {
        const chestWoodM = new THREE.MeshStandardMaterial({ color: 0x3c2410, roughness: 0.82, metalness: 0.04 });
        const chestGoldM = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.16, metalness: 0.92, emissive: 0x5a3c00, emissiveIntensity: 0.20 });
        const chestGemM  = new THREE.MeshStandardMaterial({ color: 0xcc1100, roughness: 0.04, metalness: 0.04, emissive: 0xaa0800, emissiveIntensity: 0.55, transparent: true, opacity: 0.90 });
        const cX = ECX - 13, cZ = ECZ - 2;
        // Chest body
        box(scene, 1.10, 0.55, 0.72, cX, 0.275, cZ, chestWoodM);
        // Chest lid (slightly raised)
        box(scene, 1.12, 0.25, 0.74, cX, 0.675, cZ, chestWoodM);
        const lidArch = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 1.08, 8, 1, false, 0, Math.PI), chestWoodM);
        lidArch.rotation.z = Math.PI / 2; lidArch.position.set(cX, 0.80, cZ); scene.add(lidArch);
        // Gold corner reinforcements
        [[-0.54, -0.35], [-0.54, 0.35], [0.54, -0.35], [0.54, 0.35]].forEach(([ox, oz]) => {
          box(scene, 0.06, 0.58, 0.06, cX + ox, 0.29, cZ + oz, chestGoldM);
        });
        // Gold banding strips
        [-0.20, 0.20].forEach(oz => {
          boxD(scene, 1.14, 0.06, 0.06, cX, 0.40, cZ + oz, chestGoldM);
        });
        // Front lock plate
        box(scene, 0.12, 0.14, 0.04, cX, 0.38, cZ - 0.37, chestGoldM);
        // Keyhole gem
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 5), chestGemM);
        gem.position.set(cX, 0.38, cZ - 0.40); scene.add(gem);
        // Scattered gold coins spilling from chest
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.012, 10), chestGoldM);
          coin.rotation.x = Math.PI / 2 + (Math.random() * 0.6 - 0.3);
          coin.position.set(cX + Math.cos(a) * (0.34 + i * 0.04), 0.02, cZ + Math.sin(a) * (0.28 + i * 0.03)); scene.add(coin);
        }
        addWallAABB(cX, cZ, 1.22, 0.84);
        // Warm glow from inside the open chest
        const chestPt = new THREE.PointLight(0xffa030, 0.80, 4.0);
        chestPt.position.set(cX, 1.1, cZ); scene.add(chestPt);
      }

      // ── Stone tablet display — south wall, east section ───
      {
        const tabletMat  = new THREE.MeshStandardMaterial({ color: 0x4a3818, roughness: 0.90, metalness: 0.0 });
        const tabletGlyM = new THREE.MeshStandardMaterial({ color: 0xd4a020, emissive: 0xb07000, emissiveIntensity: 0.28, roughness: 0.60 });
        const tX = ECX + 10, tZ = ECZ - 13;
        // Stone stand        box(scene, 0.30, 0.50, 0.30, tX, 0.25, tZ, darkStoneMat);
        // Tablet leaning on stand
        const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.70, 1.20, 0.06), tabletMat);
        tablet.rotation.z = 0.08; tablet.position.set(tX, 1.10, tZ - 0.04); scene.add(tablet);
        // Rounded top of tablet
        const tabTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 12, 1, false, 0, Math.PI), tabletMat);
        tabTop.rotation.z = Math.PI / 2; tabTop.position.set(tX, 1.75, tZ - 0.04); scene.add(tabTop);
        // Gold glyph lines on tablet
        [0.40, 0.20, 0.0, -0.20, -0.40].forEach(dy => {
          boxD(scene, 0.52, 0.038, 0.002, tX, 1.10 + dy, tZ - 0.08, tabletGlyM);
        });
        addWallAABB(tX, tZ, 0.82, 0.50);
      }

      // ── Guard patrol ─────────────────────────────────────
      guardData.push({
        spawnX: ECX, spawnZ: ECZ,
        waypoints: _route(
          [new THREE.Vector3(ECX - 8, 0, ECZ - 12), new THREE.Vector3(ECX + 8, 0, ECZ - 12),
           new THREE.Vector3(ECX + 8, 0, ECZ + 12), new THREE.Vector3(ECX - 8, 0, ECZ + 12)],
          [new THREE.Vector3(ECX, 0, ECZ - 12), new THREE.Vector3(ECX + 10, 0, ECZ),
           new THREE.Vector3(ECX, 0, ECZ + 12), new THREE.Vector3(ECX - 10, 0, ECZ)]
        ),
      });

      // ── Security camera ───────────────────────────────────
      cameraData.push({ x: ECX, y: WALL_H - 0.3, z: ECZ + ECD / 2 - 0.5, sweepAngle: Math.PI / 2.5, facingZ: -1 });

      // ── Room label ────────────────────────────────────────
      roomLabel(scene, ECX - ECW / 2 + 2, ECZ, 'Chambre Égyptienne', Math.PI / 2);
    }

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

    // ── FEATURE 8: Helipad on lobby rooftop (rappel exit) ────────────────────
    {
      const heliMat = new THREE.MeshStandardMaterial({
        color: 0xf0a000, emissive: 0xff8800, emissiveIntensity: 0.70, roughness: 0.55, metalness: 0.0,
      });
      const heliPad = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.05, 24), heliMat);
      heliPad.position.set(0, 8.0, -8);
      scene.add(heliPad);
      // H marking — two vertical bars + crossbar
      const hBarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5 });
      box(scene, 0.20, 0.06, 0.80, -0.50, 8.04, -8, hBarMat);  // left leg of H
      box(scene, 0.20, 0.06, 0.80,  0.50, 8.04, -8, hBarMat);  // right leg of H
      box(scene, 1.20, 0.06, 0.20,  0.00, 8.04, -8, hBarMat);  // crossbar of H
      // Helipad lit by its own emissive material — no extra SpotLight needed
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

    // Vent 3: Taxidermy Hall (z=107) ↔ Egyptian Catacomb (z=123) — east corridor shortcut
    makeVentGrate(43, 107);
    makeVentGrate(43, 123);
    vents.push({ entryX: 43, entryZ: 107, exitX: 43, exitZ: 123 });

    // ── FEATURE 3: Tunnel floor grate in Crown Vault (exit point at Z=130) ──────
    makeVentGrate(0, 130);
    // Crown Vault → Lobby tunnel return vent entry
    vents.push({ entryX: 0, entryZ: 130, exitX: 0, exitZ: 28, exitY: 0, label: 'Tunnel' });

    // ── Hidden loot items ────────────────────────────────────────────────────
    // Small valuables tucked away in corners — no alarm on pickup, add to score.
    (function addHiddenLoot() {
      const gemMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.05, metalness: 0.15, emissive: c, emissiveIntensity: 0.45, transparent: true, opacity: 0.88 });
      const goldSmall = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.18, metalness: 0.90, emissive: 0x6a4a00, emissiveIntensity: 0.2 });

      // 1. Silver compass — behind the lobby east pillar corner
      { const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.022, 14),
          new THREE.MeshStandardMaterial({ color: 0xaaaacc, roughness: 0.14, metalness: 0.95 }));
        g.add(body);
        const needle = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.005, 0.1), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xcc0000, emissiveIntensity: 0.5 }));
        needle.position.y = 0.015; g.add(needle);
        g.position.set(14, 0.38, 35.5);
        scene.add(g);
        stealables.push({ mesh: g, item: 'compass', x: 14, z: 35.5, taken: false, bonus: true, hidden: true, label: 'Silver Compass', value: 95000 }); }

      // 2. Ruby gem — behind west pillar row in Gallery
      { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), gemMat(0xff1133));
        gem.position.set(-22, 0.42, 68); gem.rotation.y = 0.4; scene.add(gem);
        stealables.push({ mesh: gem, item: 'ruby', x: -22, z: 68, taken: false, bonus: true, hidden: true, label: 'Ruby Gemstone', value: 480000 }); }

      // 3. Gold coin purse — under gallery bench (z≈90, tucked against south wall)
      { const g = new THREE.Group();
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.30, metalness: 0.0 }));
        bag.scale.set(1, 0.8, 0.75); g.add(bag);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 10), goldSmall);
        ring.position.y = 0.052; g.add(ring);
        g.position.set(-5, 0.30, 90.5);
        scene.add(g);
        stealables.push({ mesh: g, item: 'coinpurse', x: -5, z: 90.5, taken: false, bonus: true, hidden: true, label: 'Gold Coin Purse', value: 220000 }); }

      // 4. Sapphire — east gallery corner, near the exit corridor entrance
      { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.052), gemMat(0x2255ff));
        gem.position.set(23, 0.40, 97); gem.rotation.z = 0.3; scene.add(gem);
        stealables.push({ mesh: gem, item: 'sapphire', x: 23, z: 97, taken: false, bonus: true, hidden: true, label: 'Sapphire', value: 560000 }); }

      // 5. Emerald ring — corridor 2, tucked in the west corner (x=-4, z=108)
      { const g = new THREE.Group();
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.010, 6, 14), goldSmall);
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), gemMat(0x22ff66));
        stone.position.y = 0.038; g.add(band); g.add(stone);
        g.position.set(-3.5, 0.35, 108);
        scene.add(g);
        stealables.push({ mesh: g, item: 'emeraldring', x: -3.5, z: 108, taken: false, bonus: true, hidden: true, label: 'Emerald Ring', value: 340000 }); }

      // 6. Amethyst pendant — Crown Vault, behind west pillar base (x=-22, z=128)
      { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.058), gemMat(0xaa22ff));
        gem.position.set(-22, 0.44, 128); scene.add(gem);
        stealables.push({ mesh: gem, item: 'amethyst', x: -22, z: 128, taken: false, bonus: true, hidden: true, label: 'Amethyst Pendant', value: 720000 }); }

      // 7. Diamond shard — vault east corner behind display (x=22, z=150)
      { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.048), gemMat(0xeeeeff));
        gem.position.set(22, 0.40, 150); gem.rotation.x = 0.5; scene.add(gem);
        stealables.push({ mesh: gem, item: 'diamond', x: 22, z: 150, taken: false, bonus: true, hidden: true, label: 'Diamond Shard', value: 1200000 }); }

      // 8. Antique brooch — lobby west corner near entrance (x=-18, z=5)
      { const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 12), goldSmall);
        const ctr  = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), gemMat(0xff8800));
        ctr.position.y = 0.015; g.add(base); g.add(ctr);
        g.position.set(-18, 0.35, 5);
        scene.add(g);
        stealables.push({ mesh: g, item: 'broochlobby', x: -18, z: 5, taken: false, bonus: true, hidden: true, label: 'Antique Brooch', value: 160000 }); }
    }());

    // ════════════════════════════════════════════════════════
    //  SALLE DE TAXIDERMIE  (Victorian Taxidermy Hall)
    //  X 25→53  Z 90→110  (cx=39, cz=100, 28×20)
    //  Attached to Gallery east wall — door at X=25, Z=93
    // ════════════════════════════════════════════════════════
    {
      const TXX = 39, TXZ = 100, TXW = 28, TXD = 20;

      // ── Materials ─────────────────────────────────────────
      const taxiWallMat = new THREE.MeshStandardMaterial({
        color: 0x1a2a18, roughness: 0.90, metalness: 0.0,  // dark peeling damask green
      });
      const taxiFloorMat = new THREE.MeshStandardMaterial({
        color: 0x271507, roughness: 0.95, metalness: 0.0,  // worn dark floorboards
      });
      const taxiCeilMat = new THREE.MeshStandardMaterial({
        color: 0x141310, roughness: 0.93, metalness: 0.0,  // stained plaster ceiling
      });
      const mahogMat = new THREE.MeshStandardMaterial({
        color: 0x3c1808, roughness: 0.68, metalness: 0.04, // mahogany wood
      });
      const brassSmMat = new THREE.MeshStandardMaterial({
        color: 0xc09030, roughness: 0.30, metalness: 0.82,
      });

      // ── Room shell ────────────────────────────────────────
      floor(scene,   TXX, TXZ, TXW, TXD, taxiFloorMat);
      ceiling(scene, TXX, TXZ, TXW, TXD, taxiCeilMat);
      wall(scene, TXX, 90,  TXW, WALL_T, taxiWallMat);  // south wall Z=90
      wall(scene, TXX, 110, TXW, WALL_T, taxiWallMat);  // north wall Z=110
      wall(scene, 53,  TXZ, WALL_T, TXD, taxiWallMat);  // east wall  X=53
      wall(scene, 25,  105, WALL_T, 10,  taxiWallMat);  // west wall extension Z=100→110

      // ── Entrance archway — dark oxidised timber frame ─────
      const taxiArchMat = new THREE.MeshStandardMaterial({
        color: 0x280f04, emissive: 0x120601, emissiveIntensity: 0.18, roughness: 0.88,
      });
      box(scene, 0.14, 0.14, 3.8, 25, WALL_H + 0.16, 93, taxiArchMat);          // top bar
      box(scene, 0.14, WALL_H + 0.32, 0.14, 25, WALL_H / 2, 91.1, taxiArchMat); // south post
      box(scene, 0.14, WALL_H + 0.32, 0.14, 25, WALL_H / 2, 94.9, taxiArchMat); // north post
      door(scene, 25, 93, null, Math.PI / 2);

      // ── Room label ────────────────────────────────────────
      roomLabel(scene, TXX, TXZ, 'Salle de Taxidermie', Math.PI / 2);

      // ── Dim amber point light (central) ──────────────────
      {
        const taxiPt = new THREE.PointLight(0xffa040, 1.1, 30);
        taxiPt.position.set(TXX, 4.5, TXZ);
        scene.add(taxiPt);
      }

      // ── Wall lanterns on east wall ────────────────────────
      wallLantern(scene, 52.85, 3.5, 93,  -1);
      wallLantern(scene, 52.85, 3.5, 100, -1);
      wallLantern(scene, 52.85, 3.5, 107, -1);

      // ── Simple iron sconces on north wall (pointing south) ─
      {
        const ironScM = new THREE.MeshStandardMaterial({ color: 0x100c04, roughness: 0.54, metalness: 0.70 });
        const amberGM = new THREE.MeshStandardMaterial({
          color: 0xffa030, emissive: 0xff6800, emissiveIntensity: 2.0,
          transparent: true, opacity: 0.82, roughness: 0.10,
        });
        [31, 47].forEach(sx => {
          const reach = 0.40;
          box(scene, 0.04, 0.04, reach + 0.04, sx, 3.54, 109.8 - reach * 0.5, ironScM);  // bracket
          box(scene, 0.032, 0.16, 0.032, sx, 3.44, 109.8 - reach,             ironScM);  // drop rod
          box(scene, 0.22, 0.30, 0.22,   sx, 3.28, 109.8 - reach,             ironScM);  // cage body
          box(scene, 0.15, 0.22, 0.04,   sx, 3.28, 109.8 - reach - 0.11,     amberGM);  // glass panels
          box(scene, 0.15, 0.22, 0.04,   sx, 3.28, 109.8 - reach + 0.11,     amberGM);
          box(scene, 0.04, 0.22, 0.15,   sx - 0.11, 3.28, 109.8 - reach,     amberGM);
          box(scene, 0.04, 0.22, 0.15,   sx + 0.11, 3.28, 109.8 - reach,     amberGM);
          box(scene, 0.26, 0.04, 0.26,   sx, 3.44, 109.8 - reach,             ironScM);  // cap
          const coneMesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 4), ironScM);
          coneMesh.position.set(sx, 3.58, 109.8 - reach); scene.add(coneMesh);
        });
      }

      // ── Central moth-eaten rug ────────────────────────────
      rug(scene, TXX, TXZ, 17, 11, 0x3d1a12, 0x2c2010);

      // ── Cobwebs in ceiling corners (thin transparent quads) ─
      {
        const cobMat = new THREE.MeshStandardMaterial({
          color: 0x808878, roughness: 0.95,
          transparent: true, opacity: 0.20,
          side: THREE.DoubleSide, depthWrite: false,
        });
        box(scene, 2.2, 0.012, 2.2, 26.1, WALL_H - 0.008, 108.9, cobMat);  // NW corner
        box(scene, 2.2, 0.012, 2.2, 51.9, WALL_H - 0.008, 108.9, cobMat);  // NE corner
        box(scene, 1.8, 0.012, 1.8, 51.9, WALL_H - 0.008, 91.1,  cobMat);  // SE corner
        box(scene, 1.4, 0.012, 1.4, 26.1, WALL_H - 0.008, 91.1,  cobMat);  // SW corner
      }

      // ── Tall glass-fronted display cabinets (east wall) ───
      [93, 100, 107].forEach(cz => {
        const cD = 2.0;
        box(scene, 0.52, 2.5, cD,        52.74, 1.25, cz, mahogMat);        // wooden back/sides
        box(scene, 0.04, 2.0, cD - 0.12, 52.43, 1.25, cz, M.glass);         // glass front
        box(scene, 0.56, 0.08, cD + 0.04, 52.74, 2.54, cz, mahogMat);       // top rail
        [-cD / 2 + 0.06, cD / 2 - 0.06].forEach(oz =>
          box(scene, 0.07, 2.58, 0.07, 52.44, 1.29, cz + oz, mahogMat));    // corner posts
        addWallAABB(52.65, cz, 0.64, cD + 0.1);
      });

      // ── Cabinet contents — mounted specimens behind glass ─
      {
        const specBrdMat = new THREE.MeshStandardMaterial({ color: 0x181008, roughness: 0.88 });
        const bonesMat   = new THREE.MeshStandardMaterial({ color: 0xd8cab0, roughness: 0.72 });
        const scaleMat   = new THREE.MeshStandardMaterial({ color: 0x2a380a, roughness: 0.88 });

        // Cabinet at Z=93: mounted raven / bird of prey (standing)
        { const b = new THREE.Group();
          const bd = new THREE.Mesh(new THREE.SphereGeometry(0.10, 7, 5), specBrdMat);
          bd.scale.set(0.88, 0.70, 0.60); b.add(bd);
          const bh = new THREE.Mesh(new THREE.SphereGeometry(0.056, 6, 5), specBrdMat);
          bh.position.set(0, 0.11, 0.08); b.add(bh);
          const bk = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.052, 4),
            new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.3 }));
          bk.rotation.x = Math.PI / 2 + 0.3; bk.position.set(0, 0.07, 0.135); b.add(bk);
          // Wing stubs
          [-1, 1].forEach(s => {
            const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.32), specBrdMat);
            w.rotation.z = s * 0.22; w.position.set(s * 0.12, -0.02, -0.04); b.add(w);
          });
          b.position.set(52.0, 1.36, 93); scene.add(b); }

        // Cabinet at Z=100: small mammal skull
        { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), bonesMat);
          sk.scale.set(1.0, 0.74, 0.88);
          sk.position.set(52.0, 1.34, 100); scene.add(sk);
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.14), bonesMat);
          jaw.position.set(52.0, 1.19, 100.06); scene.add(jaw); }

        // Cabinet at Z=107: coiled preserved snake
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.050, 5, 4), scaleMat);
          seg.position.set(52.0 + Math.cos(a) * 0.17, 1.12 + i * 0.052, 107 + Math.sin(a) * 0.20);
          scene.add(seg);
        }
      }

      // ── Taxidermy wolf mount — predatory centrepiece ──────
      {
        const wFurMat = new THREE.MeshStandardMaterial({ color: 0x3a2d1e, roughness: 0.94, metalness: 0.0 });
        const wEyeMat = new THREE.MeshStandardMaterial({
          color: 0xd4a000, emissive: 0xa07000, emissiveIntensity: 0.58, roughness: 0.04,
        });
        // Wooden display platform
        box(scene, 2.2, 0.14, 1.0, 39, 0.07, 97, mahogMat);
        addWallAABB(39, 97, 2.3, 1.1);
        const wolf = new THREE.Group();
        const wBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.0, 8), wFurMat);
        wBody.rotation.z = Math.PI / 2; wBody.position.set(0, 0.54, 0); wolf.add(wBody);
        const wNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 7), wFurMat);
        wNeck.rotation.z = Math.PI / 2 - 0.40; wNeck.position.set(0.52, 0.60, 0); wolf.add(wNeck);
        const wHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), wFurMat);
        wHead.scale.set(0.92, 0.82, 1.12); wHead.position.set(0.70, 0.66, 0); wolf.add(wHead);
        const wSnout = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.26, 6), wFurMat);
        wSnout.rotation.z = Math.PI / 2; wSnout.position.set(0.93, 0.58, 0); wolf.add(wSnout);
        [-0.09, 0.09].forEach(ez => {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.18, 5), wFurMat);
          ear.position.set(0.62, 0.86, ez); wolf.add(ear);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.040, 6, 5), wEyeMat);
          eye.position.set(0.85, 0.68, ez); wolf.add(eye);
        });
        [[-0.32, -0.38], [-0.32, 0.38], [0.32, -0.38], [0.32, 0.38]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.038, 0.44, 5), wFurMat);
          leg.position.set(lx, 0.20, lz); wolf.add(leg);
        });
        const wTail = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.022, 0.54, 5), wFurMat);
        wTail.rotation.z = 0.62; wTail.position.set(-0.64, 0.66, 0); wolf.add(wTail);
        wolf.position.set(39, 0.14, 97);
        wolf.rotation.y = 0.30;  // slight turn — facing the entrance
        scene.add(wolf);
      }

      // ── Fox mount on pedestal ─────────────────────────────
      {
        const fFurMat = new THREE.MeshStandardMaterial({ color: 0x8a3a0c, roughness: 0.93, metalness: 0.0 });
        const fEyeMat = new THREE.MeshStandardMaterial({
          color: 0xc8b800, emissive: 0x907000, emissiveIntensity: 0.50, roughness: 0.04,
        });
        box(scene, 0.65, 0.90, 0.65, 46, 0.45, 93, mahogMat);
        addWallAABB(46, 93, 0.76, 0.76);
        const fox = new THREE.Group();
        const fBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.58, 7), fFurMat);
        fBody.rotation.z = Math.PI / 2 - 0.28; fBody.position.set(0, 0.22, 0); fox.add(fBody);
        const fHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), fFurMat);
        fHead.scale.set(0.85, 0.88, 1.05); fHead.position.set(0.34, 0.32, 0); fox.add(fHead);
        const fSnout = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.20, 5), fFurMat);
        fSnout.rotation.z = Math.PI / 2; fSnout.position.set(0.50, 0.24, 0); fox.add(fSnout);
        [-0.06, 0.06].forEach(ez => {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.13, 4), fFurMat);
          ear.position.set(0.26, 0.46, ez); fox.add(ear);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 5, 4), fEyeMat);
          eye.position.set(0.44, 0.34, ez); fox.add(eye);
        });
        const fTail = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.022, 0.42, 6), fFurMat);
        fTail.rotation.z = 0.72; fTail.position.set(-0.34, 0.36, 0); fox.add(fTail);
        fox.position.set(46, 0.90, 93);
        fox.rotation.y = -0.50;
        scene.add(fox);
      }

      // ── Imperial Eagle Specimen — stealable centrepiece ───
      {
        const eMat  = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.88, metalness: 0.0 });
        const eHead = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.88, metalness: 0.0 });
        const eBeak = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.32, metalness: 0.12 });
        const eEye  = new THREE.MeshStandardMaterial({
          color: 0xd48000, emissive: 0xb06000, emissiveIntensity: 0.65, roughness: 0.04,
        });
        const brMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 0.88 });
        // Pedestal
        box(scene, 0.55, 1.02, 0.55, 32, 0.51, 95, mahogMat);
        addWallAABB(32, 95, 0.65, 0.65);
        const eagle = new THREE.Group();
        // Perch branch
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.52, 6), brMat);
        branch.rotation.z = Math.PI / 2; eagle.add(branch);
        // Body
        const eBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 7), eMat);
        eBody.scale.set(1.0, 0.72, 0.64); eBody.position.set(0, 0.22, 0); eagle.add(eBody);
        // White head
        const eHd = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), eHead);
        eHd.position.set(0, 0.38, 0.12); eagle.add(eHd);
        // Hooked beak
        const eBk = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.10, 4), eBeak);
        eBk.rotation.x = Math.PI / 2 + 0.55; eBk.position.set(0, 0.30, 0.23); eagle.add(eBk);
        // Eyes
        [-0.06, 0.06].forEach(ex => {
          const ey = new THREE.Mesh(new THREE.SphereGeometry(0.020, 5, 4), eEye);
          ey.position.set(ex, 0.38, 0.19); eagle.add(ey);
        });
        // Spread wings
        [-1, 1].forEach(side => {
          const wA = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.55), eMat);
          wA.rotation.z = side * 0.28; wA.position.set(side * 0.28, 0.16, -0.06); eagle.add(wA);
          const wB = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.30), eMat);
          wB.rotation.z = side * 0.50; wB.position.set(side * 0.46, 0.06, -0.08); eagle.add(wB);
        });
        // Talons gripping the branch
        [-0.14, -0.05, 0.05, 0.14].forEach(ox => {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.004, 0.11, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.60 }));
          t.rotation.x = 0.25; t.position.set(ox, -0.06, 0.06); eagle.add(t);
        });
        eagle.position.set(32, 1.02, 95);
        scene.add(eagle);
        stealables.push({ mesh: eagle, item: 'eagle', x: 32, z: 95, taken: false, bonus: true, label: 'Imperial Eagle Specimen', value: 18500000 });
        { const eRing = new THREE.Mesh(new THREE.RingGeometry(0.40, 0.62, 24),
            new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
          eRing.rotation.x = -Math.PI / 2; eRing.position.set(32, 0.02, 95); scene.add(eRing);
          eagle.userData.floorRing = eRing; }
      }

      // ── Victorian Specimen Jar — stealable on the desk ────
      {
        const jarGM  = new THREE.MeshStandardMaterial({ color: 0xb8d898, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.52 });
        const jarLM  = new THREE.MeshStandardMaterial({ color: 0x2c1208, roughness: 0.65, metalness: 0.18 });
        const crtM   = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.82 });
        const lblM   = new THREE.MeshStandardMaterial({ color: 0xe0d080, roughness: 0.86 });
        const jar = new THREE.Group();
        const jBody = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.26, 10), jarGM);
        jBody.position.y = 0.13; jar.add(jBody);
        const jLid  = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.038, 10), jarLM);
        jLid.position.y = 0.279; jar.add(jLid);
        const crt   = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 5), crtM);
        crt.scale.set(0.9, 0.55, 1.1); crt.position.y = 0.11; jar.add(crt);
        jar.position.set(46, 0.88, 104);
        scene.add(jar);
        // Yellowed paper specimen label
        box(scene, 0.001, 0.082, 0.120, 45.912, 0.972, 104, lblM);
        stealables.push({ mesh: jar, item: 'specimenjar', x: 46, z: 104, taken: false, bonus: true, label: 'Victorian Specimen Jar', value: 3200000 });
        { const jRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.30, 20),
            new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
          jRing.rotation.x = -Math.PI / 2; jRing.position.set(46, 0.02, 104); scene.add(jRing);
          jar.userData.floorRing = jRing; }
      }

      // ── Mahogany taxidermist's desk (NE quadrant) ─────────
      {
        const toolMt  = new THREE.MeshStandardMaterial({ color: 0xa0a0b2, roughness: 0.32, metalness: 0.80 });
        const paperMt = new THREE.MeshStandardMaterial({ color: 0xdfd07a, roughness: 0.92 });
        const inkMt   = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.42 });
        // Desk top
        box(scene, 2.2, 0.08, 0.90, 47, 0.86, 104.7, mahogMat);
        // Legs
        [[-0.95, 0.38], [-0.95, -0.38], [0.95, 0.38], [0.95, -0.38]].forEach(([lx, lz]) =>
          box(scene, 0.07, 0.86, 0.07, 47 + lx, 0.43, 104.7 + lz, mahogMat));
        // Drawer unit
        box(scene, 0.42, 0.82, 0.82, 47.89, 0.43, 104.7, mahogMat);
        box(scene, 0.055, 0.016, 0.016, 47.89, 0.50, 104.32, brassSmMat);  // drawer pulls
        box(scene, 0.055, 0.016, 0.016, 47.89, 0.66, 104.32, brassSmMat);
        addWallAABB(47, 104.7, 2.3, 0.98);
        // Surgical tools scattered on surface
        box(scene, 0.40, 0.016, 0.028, 47.2, 0.908, 104.5, toolMt);   // scalpel
        box(scene, 0.34, 0.016, 0.022, 46.6, 0.908, 104.9, toolMt);   // pin tool
        box(scene, 0.26, 0.016, 0.025, 47.5, 0.908, 105.1, toolMt);   // small blade
        // Ink bottle
        const inkB = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.065, 8), inkMt);
        inkB.position.set(46.4, 0.902, 104.6); scene.add(inkB);
        // Rolled specimen-label papers
        box(scene, 0.20, 0.036, 0.036, 47.0, 0.900, 104.44, paperMt);
        box(scene, 0.16, 0.032, 0.032, 46.8, 0.900, 104.72, paperMt);
        box(scene, 0.14, 0.028, 0.028, 47.3, 0.900, 105.08, paperMt);
      }

      // ── Additional taxidermy specimens ─────────────────────

      // Grizzly bear — rearing mount (NW quadrant)
      {
        const bFurMat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.96, metalness: 0.0 });
        const bEyeMat = new THREE.MeshStandardMaterial({ color: 0x100800, emissive: 0x0a0500, emissiveIntensity: 0.20, roughness: 0.10 });
        box(scene, 2.4, 0.16, 1.6, 30, 0.08, 103, mahogMat);
        addWallAABB(30, 103, 2.5, 1.8);
        const bear = new THREE.Group();
        const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.36, 1.20, 8), bFurMat);
        bBody.position.set(0, 1.00, 0); bear.add(bBody);
        const bNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.30, 7), bFurMat);
        bNeck.position.set(0, 1.68, 0); bear.add(bNeck);
        const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 7), bFurMat);
        bHead.scale.set(0.94, 0.82, 1.08); bHead.position.set(0, 2.04, 0.08); bear.add(bHead);
        const bSnout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.28, 7), bFurMat);
        bSnout.rotation.x = Math.PI / 2 - 0.3; bSnout.position.set(0, 1.92, 0.34); bear.add(bSnout);
        [-0.18, 0.18].forEach(ex => {
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.078, 6, 5), bFurMat);
          ear.position.set(ex, 2.30, -0.04); bear.add(ear);
          const beye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), bEyeMat);
          beye.position.set(ex * 0.6, 2.06, 0.28); bear.add(beye);
        });
        [-1, 1].forEach(s => {
          const armU = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.60, 6), bFurMat);
          armU.rotation.z = s * 0.55; armU.position.set(s * 0.52, 1.52, 0); bear.add(armU);
          const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.52, 6), bFurMat);
          armL.rotation.z = s * 0.95; armL.position.set(s * 0.86, 1.70, 0); bear.add(armL);
          const paw = new THREE.Mesh(new THREE.SphereGeometry(0.10, 7, 5), bFurMat);
          paw.scale.set(0.90, 0.55, 1.20); paw.position.set(s * 1.10, 1.76, 0.06); bear.add(paw);
        });
        [-0.24, 0.24].forEach(lz => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.08, 0.62, 6), bFurMat);
          leg.position.set(0, 0.28, lz); bear.add(leg);
        });
        bear.position.set(30, 0.24, 103);
        scene.add(bear);
      }

      // Stag mount — near north wall with full antlers
      {
        const stagFurMat = new THREE.MeshStandardMaterial({ color: 0x5a3010, roughness: 0.92, metalness: 0.0 });
        const antlerMat  = new THREE.MeshStandardMaterial({ color: 0xb09058, roughness: 0.62, metalness: 0.0 });
        const stagEyeMat = new THREE.MeshStandardMaterial({ color: 0x301808, emissive: 0x180c00, emissiveIntensity: 0.22, roughness: 0.06 });
        box(scene, 1.4, 0.16, 1.0, 36, 0.08, 108, mahogMat);
        addWallAABB(36, 108, 1.5, 1.2);
        const stag = new THREE.Group();
        const stBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.90, 8), stagFurMat);
        stBody.rotation.z = Math.PI / 2; stBody.position.set(0, 0.52, 0); stag.add(stBody);
        const stNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 0.26, 7), stagFurMat);
        stNeck.rotation.z = Math.PI / 2 - 0.45; stNeck.position.set(0.50, 0.58, 0); stag.add(stNeck);
        const stHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), stagFurMat);
        stHead.scale.set(0.82, 0.88, 1.10); stHead.position.set(0.70, 0.66, 0); stag.add(stHead);
        const stSnout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), stagFurMat);
        stSnout.rotation.z = Math.PI / 2; stSnout.position.set(0.86, 0.58, 0); stag.add(stSnout);
        [-0.09, 0.09].forEach(ez => {
          const sear = new THREE.Mesh(new THREE.SphereGeometry(0.052, 5, 4), stagFurMat);
          sear.scale.set(0.40, 0.70, 1.30); sear.position.set(0.60, 0.84, ez); stag.add(sear);
          const seye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 5, 4), stagEyeMat);
          seye.position.set(0.80, 0.68, ez); stag.add(seye);
        });
        [-1, 1].forEach(s => {
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.64, 5), antlerMat);
          beam.rotation.z = s * -0.40; beam.rotation.x = 0.18; beam.position.set(0.60 + s * 0.08, 0.90, 0); stag.add(beam);
          const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.020, 0.28, 4), antlerMat);
          t1.rotation.z = s * -0.70; t1.rotation.x = -0.30; t1.position.set(0.58 + s * 0.18, 1.06, -0.06); stag.add(t1);
          const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, 0.24, 4), antlerMat);
          t2.rotation.z = s * -0.90; t2.position.set(0.56 + s * 0.28, 1.16, 0.04); stag.add(t2);
          const t3 = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 0.20, 4), antlerMat);
          t3.rotation.z = s * -1.10; t3.position.set(0.54 + s * 0.38, 1.26, 0); stag.add(t3);
        });
        [[-0.30, -0.36], [-0.30, 0.36], [0.30, -0.36], [0.30, 0.36]].forEach(([lx, lz]) => {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.034, 0.44, 5), stagFurMat);
          l.position.set(lx, 0.20, lz); stag.add(l);
        });
        stag.position.set(36, 0.16, 108); stag.rotation.y = Math.PI; scene.add(stag);
      }

      // Wild boar — near south wall
      {
        const boarMat  = new THREE.MeshStandardMaterial({ color: 0x2c1e10, roughness: 0.95, metalness: 0.0 });
        const boarEyeM = new THREE.MeshStandardMaterial({ color: 0x800c00, emissive: 0x600800, emissiveIntensity: 0.40, roughness: 0.06 });
        const tuskMat  = new THREE.MeshStandardMaterial({ color: 0xd4c890, roughness: 0.38, metalness: 0.0 });
        box(scene, 1.6, 0.12, 1.1, 35, 0.06, 93, mahogMat);
        addWallAABB(35, 93, 1.7, 1.2);
        const boar = new THREE.Group();
        const boBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.88, 8), boarMat);
        boBody.rotation.z = Math.PI / 2; boBody.position.set(0, 0.44, 0); boar.add(boBody);
        const boNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 7), boarMat);
        boNeck.rotation.z = Math.PI / 2 - 0.30; boNeck.position.set(0.46, 0.50, 0); boar.add(boNeck);
        const boHead = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), boarMat);
        boHead.scale.set(0.80, 0.78, 1.20); boHead.position.set(0.64, 0.54, 0); boar.add(boHead);
        const boSnout = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.22, 6), boarMat);
        boSnout.rotation.z = Math.PI / 2; boSnout.position.set(0.84, 0.48, 0); boar.add(boSnout);
        [-0.07, 0.07].forEach(ez => {
          const tusk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.008, 0.22, 4), tuskMat);
          tusk.rotation.z = Math.PI / 2 + 0.55; tusk.position.set(0.90, 0.38, ez); boar.add(tusk);
          const beye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), boarEyeM);
          beye.position.set(0.76, 0.52, ez); boar.add(beye);
        });
        [[-0.28, -0.32], [-0.28, 0.32], [0.28, -0.32], [0.28, 0.32]].forEach(([lx, lz]) => {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.030, 0.38, 5), boarMat);
          l.position.set(lx, 0.15, lz); boar.add(l);
        });
        const boTail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.008, 0.20, 4), boarMat);
        boTail.rotation.z = -0.80; boTail.position.set(-0.52, 0.52, 0); boar.add(boTail);
        boar.position.set(35, 0.12, 93); boar.rotation.y = -0.40; scene.add(boar);
      }

      // Owl on perch — central east area
      {
        const owlMat  = new THREE.MeshStandardMaterial({ color: 0x4a3c1a, roughness: 0.88, metalness: 0.0 });
        const owlEyeM = new THREE.MeshStandardMaterial({ color: 0xf0a800, emissive: 0xc07800, emissiveIntensity: 0.88, roughness: 0.04 });
        box(scene, 0.72, 0.72, 0.72, 43, 0.36, 103, mahogMat);
        addWallAABB(43, 103, 0.84, 0.84);
        const owl = new THREE.Group();
        const oBody = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), owlMat);
        oBody.scale.set(0.88, 1.10, 0.80); oBody.position.set(0, 0.22, 0); owl.add(oBody);
        const oHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), owlMat);
        oHead.position.set(0, 0.48, 0.02); owl.add(oHead);
        const oDisc = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5),
          new THREE.MeshStandardMaterial({ color: 0x6a5430, roughness: 0.88 }));
        oDisc.scale.set(0.94, 0.88, 0.30); oDisc.position.set(0, 0.47, 0.10); owl.add(oDisc);
        [-0.052, 0.052].forEach(ex => {
          const oe = new THREE.Mesh(new THREE.SphereGeometry(0.030, 6, 5), owlEyeM);
          oe.position.set(ex, 0.48, 0.13); owl.add(oe);
        });
        const oBk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.048, 4), owlMat);
        oBk.rotation.x = Math.PI / 2; oBk.position.set(0, 0.44, 0.13); owl.add(oBk);
        [-0.065, 0.065].forEach(ex => {
          const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.070, 4), owlMat);
          tuft.position.set(ex, 0.60, 0); owl.add(tuft);
        });
        [-1, 1].forEach(s => {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.34), owlMat);
          w.rotation.z = s * 0.10; w.position.set(s * 0.20, 0.22, -0.02); owl.add(w);
        });
        const perc = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.42, 6),
          new THREE.MeshStandardMaterial({ color: 0x2c1808, roughness: 0.86 }));
        perc.rotation.z = Math.PI / 2; owl.add(perc);
        owl.position.set(43, 0.74, 103); scene.add(owl);
      }

      // Peacock with spread tail — NE area
      {
        const peaBlue  = new THREE.MeshStandardMaterial({ color: 0x1040a0, roughness: 0.38, metalness: 0.08, emissive: 0x061040, emissiveIntensity: 0.28 });
        const peaGreen = new THREE.MeshStandardMaterial({ color: 0x0a5a20, roughness: 0.32, metalness: 0.04, emissive: 0x022010, emissiveIntensity: 0.22 });
        const peaGoldM = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.22, metalness: 0.12, emissive: 0x584000, emissiveIntensity: 0.28 });
        box(scene, 1.8, 0.12, 1.0, 46, 0.06, 107, mahogMat);
        addWallAABB(46, 107, 1.9, 1.2);
        const pea = new THREE.Group();
        const peaBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.66, 8), peaBlue);
        peaBody.rotation.z = Math.PI / 2 - 0.18; peaBody.position.set(0, 0.34, 0); pea.add(peaBody);
        const peaNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.10, 0.30, 7), peaBlue);
        peaNeck.rotation.z = -1.10; peaNeck.position.set(0.30, 0.52, 0); pea.add(peaNeck);
        const peaHead = new THREE.Mesh(new THREE.SphereGeometry(0.072, 7, 5), peaBlue);
        peaHead.position.set(0.38, 0.74, 0); pea.add(peaHead);
        for (let i = 0; i < 5; i++) {
          const a = (i / 4) * Math.PI * 0.6 - 0.3;
          const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.10, 4), peaGoldM);
          pl.rotation.z = -a - 1.4; pl.position.set(0.38 + Math.cos(a + 1.5) * 0.08, 0.80 + Math.sin(a + 1.5) * 0.08, 0); pea.add(pl);
        }
        const peaBk = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 4), peaGoldM);
        peaBk.rotation.z = Math.PI / 2; peaBk.position.set(0.46, 0.73, 0); pea.add(peaBk);
        const peaEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4),
          new THREE.MeshStandardMaterial({ color: 0xd8b800, emissive: 0xb08000, emissiveIntensity: 0.60, roughness: 0.06 }));
        peaEye.position.set(0.44, 0.75, 0.04); pea.add(peaEye);
        for (let i = 0; i < 11; i++) {
          const a = -0.82 / 2 + (i / 10) * 0.82;
          const fLen = 0.70 + (1 - Math.abs(i - 5) / 5) * 0.20;
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, fLen, 4), peaGreen);
          shaft.rotation.z = -a - 1.70; shaft.rotation.x = a * 0.6;
          shaft.position.set(-0.18 + Math.sin(a) * fLen * 0.45, 0.36 + Math.cos(a + 1.7) * fLen * 0.42, Math.cos(a) * fLen * 0.25); pea.add(shaft);
          if (i % 2 === 0) {
            const eyeSpot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), peaBlue);
            eyeSpot.scale.set(0.90, 0.90, 0.28);
            eyeSpot.position.set(-0.18 + Math.sin(a) * fLen * 0.84, 0.36 + Math.cos(a + 1.7) * fLen * 0.82, Math.cos(a) * fLen * 0.48); pea.add(eyeSpot);
          }
        }
        pea.position.set(46, 0.12, 107); pea.rotation.y = Math.PI; scene.add(pea);
      }

      // Badger specimen on pedestal — west side
      {
        const badgMat  = new THREE.MeshStandardMaterial({ color: 0x1c1c18, roughness: 0.94, metalness: 0.0 });
        const badgWM   = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.90, metalness: 0.0 });
        const badgEyeM = new THREE.MeshStandardMaterial({ color: 0x1a1000, emissive: 0x0c0800, emissiveIntensity: 0.18, roughness: 0.08 });
        box(scene, 0.60, 0.60, 0.60, 28, 0.30, 96, mahogMat);
        addWallAABB(28, 96, 0.72, 0.72);
        const badger = new THREE.Group();
        const bgBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 0.52, 7), badgMat);
        bgBody.rotation.z = Math.PI / 2; bgBody.position.set(0, 0.18, 0); badger.add(bgBody);
        const bgHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), badgMat);
        bgHead.scale.set(0.84, 0.78, 1.10); bgHead.position.set(0.34, 0.24, 0); badger.add(bgHead);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.062, 0.26), badgWM);
        stripe.position.set(0.34, 0.25, 0); badger.add(stripe);
        const bgSnout = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.14, 5), badgMat);
        bgSnout.rotation.z = Math.PI / 2; bgSnout.position.set(0.46, 0.22, 0); badger.add(bgSnout);
        [-0.06, 0.06].forEach(ez => {
          const bge = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), badgEyeM);
          bge.position.set(0.42, 0.26, ez); badger.add(bge);
        });
        [[-0.16, -0.18], [-0.16, 0.18], [0.16, -0.18], [0.16, 0.18]].forEach(([lx, lz]) => {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.020, 0.24, 5), badgMat);
          l.position.set(lx, 0.04, lz); badger.add(l);
        });
        badger.position.set(28, 0.62, 96); badger.rotation.y = Math.PI / 4; scene.add(badger);
      }

      // Otter specimen — west side, mid
      {
        const ottMat  = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.92, metalness: 0.0 });
        const ottBelM = new THREE.MeshStandardMaterial({ color: 0xb09870, roughness: 0.90, metalness: 0.0 });
        const ottEyeM = new THREE.MeshStandardMaterial({ color: 0x201008, emissive: 0x140800, emissiveIntensity: 0.22, roughness: 0.06 });
        box(scene, 0.58, 0.58, 0.58, 28, 0.29, 101, mahogMat);
        addWallAABB(28, 101, 0.70, 0.70);
        const otter = new THREE.Group();
        const otBody = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.08, 0.56, 7), ottMat);
        otBody.rotation.z = Math.PI / 2 - 0.22; otBody.position.set(0, 0.14, 0); otter.add(otBody);
        const otBelly = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.062, 0.44, 6), ottBelM);
        otBelly.rotation.z = Math.PI / 2 - 0.22; otBelly.position.set(0, 0.12, 0.06); otter.add(otBelly);
        const otHead = new THREE.Mesh(new THREE.SphereGeometry(0.10, 7, 5), ottMat);
        otHead.scale.set(0.86, 0.82, 1.04); otHead.position.set(0.34, 0.22, 0); otter.add(otHead);
        const otSnout = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.12, 5), ottMat);
        otSnout.rotation.z = Math.PI / 2; otSnout.position.set(0.44, 0.19, 0); otter.add(otSnout);
        [-0.05, 0.05].forEach(ez => {
          const oe = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), ottEyeM);
          oe.position.set(0.40, 0.23, ez); otter.add(oe);
        });
        const otTail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.016, 0.42, 5), ottMat);
        otTail.rotation.z = 0.55; otTail.position.set(-0.40, 0.22, 0); otter.add(otTail);
        [[-0.12, -0.14], [-0.12, 0.14], [0.14, -0.14], [0.14, 0.14]].forEach(([lx, lz]) => {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.016, 0.20, 4), ottMat);
          l.position.set(lx, 0.02, lz); otter.add(l);
        });
        otter.position.set(28, 0.60, 101); otter.rotation.y = -Math.PI / 4; scene.add(otter);
      }

      // Trophy fish on south wall — wall-mounted plaque
      {
        const fishMat  = new THREE.MeshStandardMaterial({ color: 0x1a5a8a, roughness: 0.28, metalness: 0.08, emissive: 0x062040, emissiveIntensity: 0.12 });
        const fishBelM = new THREE.MeshStandardMaterial({ color: 0xd0d8d0, roughness: 0.32, metalness: 0.04 });
        const fishEyeM = new THREE.MeshStandardMaterial({ color: 0xd0d800, emissive: 0xa0a800, emissiveIntensity: 0.55, roughness: 0.04 });
        box(scene, 0.06, 0.60, 1.10, 26.03, 3.0, 93, mahogMat);
        const fish = new THREE.Group();
        const fBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.05, 0.88, 8), fishMat);
        fBody.rotation.z = Math.PI / 2; fish.add(fBody);
        const fBelly = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.04, 0.76, 7), fishBelM);
        fBelly.rotation.z = Math.PI / 2; fBelly.position.set(0, -0.06, 0); fish.add(fBelly);
        const fHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), fishMat);
        fHead.scale.set(0.88, 0.82, 0.72); fHead.position.set(0.48, 0.02, 0); fish.add(fHead);
        const fEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), fishEyeM);
        fEye.position.set(0.54, 0.04, 0.10); fish.add(fEye);
        const fTail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.32), fishMat);
        fTail.position.set(-0.48, 0, 0); fish.add(fTail);
        const fDors = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.036), fishMat);
        fDors.position.set(0, 0.18, 0); fish.add(fDors);
        fish.rotation.y = Math.PI / 2; fish.position.set(26.06, 3.0, 93); scene.add(fish);
      }

      // Hare specimen on pedestal — central area
      {
        const hareMat  = new THREE.MeshStandardMaterial({ color: 0x7a6030, roughness: 0.94, metalness: 0.0 });
        const hareEyeM = new THREE.MeshStandardMaterial({ color: 0xcc3000, emissive: 0xaa2000, emissiveIntensity: 0.50, roughness: 0.04 });
        box(scene, 0.50, 0.50, 0.50, 44, 0.25, 97, mahogMat);
        addWallAABB(44, 97, 0.62, 0.62);
        const hare = new THREE.Group();
        const hBody = new THREE.Mesh(new THREE.SphereGeometry(0.10, 7, 5), hareMat);
        hBody.scale.set(0.80, 0.72, 1.40); hBody.position.set(0, 0.12, 0); hare.add(hBody);
        const hHead = new THREE.Mesh(new THREE.SphereGeometry(0.072, 6, 5), hareMat);
        hHead.scale.set(0.88, 0.88, 1.04); hHead.position.set(0, 0.22, 0.14); hare.add(hHead);
        [-0.040, 0.040].forEach(ex => {
          const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.020, 0.32, 4), hareMat);
          ear.position.set(ex, 0.44, 0.12); hare.add(ear);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.020, 5, 4), hareEyeM);
          eye.position.set(ex, 0.24, 0.17); hare.add(eye);
        });
        const hSnout = new THREE.Mesh(new THREE.SphereGeometry(0.024, 5, 4),
          new THREE.MeshStandardMaterial({ color: 0xcc6060, roughness: 0.60 }));
        hSnout.position.set(0, 0.21, 0.20); hare.add(hSnout);
        [-0.06, 0.06].forEach(ez => {
          const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.020, 0.22, 4), hareMat);
          hl.rotation.z = 0.60; hl.position.set(-0.10, 0.06, ez); hare.add(hl);
        });
        hare.position.set(44, 0.52, 97); scene.add(hare);
      }

      // Crocodile — low floor mount near south wall
      {
        const crocMat  = new THREE.MeshStandardMaterial({ color: 0x1a2a0a, roughness: 0.90, metalness: 0.0 });
        const crocBelM = new THREE.MeshStandardMaterial({ color: 0x9aaa70, roughness: 0.88, metalness: 0.0 });
        const crocEyeM = new THREE.MeshStandardMaterial({ color: 0xd4a800, emissive: 0xa07000, emissiveIntensity: 0.55, roughness: 0.04 });
        box(scene, 2.80, 0.10, 1.0, 42, 0.05, 92, mahogMat);
        addWallAABB(42, 92, 2.9, 1.1);
        const croc = new THREE.Group();
        const cBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.60, 8), crocMat);
        cBody.rotation.z = Math.PI / 2; cBody.position.set(0, 0.22, 0); croc.add(cBody);
        const cBelly = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 1.46, 7), crocBelM);
        cBelly.rotation.z = Math.PI / 2; cBelly.position.set(0, 0.16, 0); croc.add(cBelly);
        const cTail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.14, 1.10, 7), crocMat);
        cTail.rotation.z = Math.PI / 2; cTail.position.set(-1.34, 0.20, 0); croc.add(cTail);
        const cHead = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.30), crocMat);
        cHead.position.set(1.06, 0.22, 0); croc.add(cHead);
        const cJawU = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.10, 0.28), crocMat);
        cJawU.rotation.z = 0.20; cJawU.position.set(1.28, 0.24, 0); croc.add(cJawU);
        const cJawL = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 0.24), crocBelM);
        cJawL.rotation.z = -0.12; cJawL.position.set(1.28, 0.14, 0); croc.add(cJawL);
        for (let i = 0; i < 6; i++) {
          const tooth = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.048, 4),
            new THREE.MeshStandardMaterial({ color: 0xf0e8c8, roughness: 0.40 }));
          tooth.position.set(1.06 + i * 0.060, 0.15, (i % 2 === 0 ? 0.08 : -0.08)); croc.add(tooth);
        }
        [-0.12, 0.12].forEach(ez => {
          const ce = new THREE.Mesh(new THREE.SphereGeometry(0.030, 5, 4), crocEyeM);
          ce.position.set(0.94, 0.30, ez); croc.add(ce);
        });
        [[-0.40, -0.24], [-0.40, 0.24], [0.36, -0.24], [0.36, 0.24]].forEach(([lx, lz]) => {
          const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.030, 0.20, 5), crocMat);
          cl.rotation.z = Math.PI / 2; cl.rotation.x = (lz > 0 ? 0.50 : -0.50);
          cl.position.set(lx, 0.10, lz); croc.add(cl);
        });
        croc.position.set(42, 0.10, 92); croc.rotation.y = -0.15; scene.add(croc);
      }

      // Wild turkey mount on pedestal — north wall
      {
        const turkMat  = new THREE.MeshStandardMaterial({ color: 0x2a1c0a, roughness: 0.92, metalness: 0.0 });
        const turkBelM = new THREE.MeshStandardMaterial({ color: 0x5a3a10, roughness: 0.88, metalness: 0.0 });
        const turkRedM = new THREE.MeshStandardMaterial({ color: 0x9a1808, emissive: 0x600800, emissiveIntensity: 0.28, roughness: 0.28 });
        box(scene, 0.65, 0.65, 0.65, 40, 0.325, 108, mahogMat);
        addWallAABB(40, 108, 0.78, 0.78);
        const turk = new THREE.Group();
        const tBody = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), turkMat);
        tBody.scale.set(0.88, 1.0, 0.72); tBody.position.set(0, 0.18, 0); turk.add(tBody);
        const tNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.090, 0.22, 6), turkMat);
        tNeck.rotation.z = -1.0; tNeck.position.set(0.08, 0.38, 0); turk.add(tNeck);
        const tHead = new THREE.Mesh(new THREE.SphereGeometry(0.058, 6, 5), turkRedM);
        tHead.position.set(0.16, 0.50, 0); turk.add(tHead);
        const tSnood = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.010, 0.054, 4), turkRedM);
        tSnood.position.set(0.18, 0.50, 0.04); turk.add(tSnood);
        const tBk = new THREE.Mesh(new THREE.ConeGeometry(0.010, 0.036, 4), turkBelM);
        tBk.rotation.z = Math.PI / 2; tBk.position.set(0.22, 0.49, 0); turk.add(tBk);
        const tEye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4),
          new THREE.MeshStandardMaterial({ color: 0xd8a800, emissive: 0xb07000, emissiveIntensity: 0.55, roughness: 0.04 }));
        tEye.position.set(0.20, 0.51, 0.04); turk.add(tEye);
        for (let i = 0; i < 8; i++) {
          const a = -0.55 + (i / 7) * 1.10;
          const feath = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.52, 0.022), turkBelM);
          feath.rotation.z = a - 1.55; feath.position.set(-0.06 + Math.sin(a) * 0.24, 0.14 + Math.cos(a) * 0.24, 0); turk.add(feath);
        }
        [-0.06, 0.06].forEach(ez => {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.22, 5), turkBelM);
          l.position.set(0, 0.01, ez); turk.add(l);
        });
        turk.position.set(40, 0.68, 108); turk.rotation.y = Math.PI; scene.add(turk);
      }

      // Pheasant on pedestal — SW area
      {
        const pheasMat   = new THREE.MeshStandardMaterial({ color: 0x7a3a0a, roughness: 0.88, metalness: 0.0 });
        const pheasIridM = new THREE.MeshStandardMaterial({ color: 0x1a5020, roughness: 0.22, metalness: 0.08, emissive: 0x081e08, emissiveIntensity: 0.30 });
        const pheasRingM = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.88, metalness: 0.0 });
        box(scene, 0.60, 0.60, 0.60, 31, 0.30, 107, mahogMat);
        addWallAABB(31, 107, 0.72, 0.72);
        const pheas = new THREE.Group();
        const pBody = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.08, 0.46, 7), pheasMat);
        pBody.rotation.z = Math.PI / 2 - 0.18; pBody.position.set(0, 0.16, 0); pheas.add(pBody);
        const pChest = new THREE.Mesh(new THREE.SphereGeometry(0.088, 6, 5), pheasIridM);
        pChest.scale.set(0.60, 0.58, 0.42); pChest.position.set(0.14, 0.20, 0.08); pheas.add(pChest);
        const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.066, 7, 5), pheasIridM);
        pHead.position.set(0.30, 0.28, 0); pheas.add(pHead);
        const pRing = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.010, 5, 10), pheasRingM);
        pRing.rotation.x = Math.PI / 2; pRing.position.set(0.30, 0.28, 0); pheas.add(pRing);
        const pBk = new THREE.Mesh(new THREE.ConeGeometry(0.010, 0.034, 4), pheasMat);
        pBk.rotation.z = Math.PI / 2; pBk.position.set(0.37, 0.28, 0); pheas.add(pBk);
        [-0.04, 0.04].forEach(ez => {
          const pe = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4),
            new THREE.MeshStandardMaterial({ color: 0xd88000, emissive: 0xb06000, emissiveIntensity: 0.55, roughness: 0.04 }));
          pe.position.set(0.35, 0.28, ez); pheas.add(pe);
        });
        for (let i = 0; i < 5; i++) {
          const tLen = 0.28 + i * 0.06;
          const tf = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, tLen, 4), pheasMat);
          tf.rotation.z = 0.30 + i * 0.06; tf.rotation.x = (i - 2) * 0.12;
          tf.position.set(-0.18 - i * 0.02, 0.16 + i * 0.02, (i - 2) * 0.04); pheas.add(tf);
        }
        [-0.04, 0.04].forEach(ez => {
          const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.014, 0.18, 4), pheasMat);
          pl.position.set(0, 0.01, ez); pheas.add(pl);
        });
        pheas.position.set(31, 0.64, 107); pheas.rotation.y = Math.PI * 0.6; scene.add(pheas);
      }

      // Wall-mounted antler trophy — west wall, mid height
      {
        const antlerBrownM = new THREE.MeshStandardMaterial({ color: 0x6a4010, roughness: 0.62, metalness: 0.0 });
        box(scene, 0.06, 0.52, 0.62, 26.03, 4.0, 100, mahogMat);
        const sk2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.15, 0.24), antlerBrownM);
        sk2.position.set(26.10, 4.02, 100); scene.add(sk2);
        [-1, 1].forEach(s => {
          const aBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.68, 5), antlerBrownM);
          aBeam.rotation.z = s * -0.38; aBeam.position.set(26.12, 4.32, 100 + s * 0.14); scene.add(aBeam);
          [0.22, 0.38, 0.52].forEach((t, i) => {
            const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.018, 0.22 + i * 0.04, 4), antlerBrownM);
            tine.rotation.z = s * -(0.80 + i * 0.24); tine.rotation.x = 0.20;
            tine.position.set(26.12 + t * 0.06, 4.14 + t * 0.50, 100 + s * (0.10 + i * 0.06)); scene.add(tine);
          });
        });
      }

      // Mounted lynx on pedestal — south area
      {
        const lynxMat  = new THREE.MeshStandardMaterial({ color: 0x8a6020, roughness: 0.93, metalness: 0.0 });
        const lynxEyeM = new THREE.MeshStandardMaterial({ color: 0x88c800, emissive: 0x609000, emissiveIntensity: 0.70, roughness: 0.04 });
        box(scene, 0.80, 0.80, 0.80, 28, 0.40, 106, mahogMat);
        addWallAABB(28, 106, 0.92, 0.92);
        const lynx = new THREE.Group();
        const lBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.66, 7), lynxMat);
        lBody.rotation.z = Math.PI / 2; lBody.position.set(0, 0.26, 0); lynx.add(lBody);
        const lHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), lynxMat);
        lHead.scale.set(0.90, 0.84, 1.04); lHead.position.set(0.42, 0.30, 0); lynx.add(lHead);
        const lSnout = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 6), lynxMat);
        lSnout.rotation.z = Math.PI / 2; lSnout.position.set(0.56, 0.26, 0); lynx.add(lSnout);
        [-0.09, 0.09].forEach(ez => {
          const lear = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.14, 4), lynxMat);
          lear.position.set(0.34, 0.44, ez); lynx.add(lear);
          const leye = new THREE.Mesh(new THREE.SphereGeometry(0.030, 5, 4), lynxEyeM);
          leye.position.set(0.52, 0.31, ez); lynx.add(leye);
        });
        const lTail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.016, 0.22, 5), lynxMat);
        lTail.rotation.z = -0.72; lTail.position.set(-0.40, 0.36, 0); lynx.add(lTail);
        [[-0.20, -0.22], [-0.20, 0.22], [0.20, -0.22], [0.20, 0.22]].forEach(([lx, lz]) => {
          const ll = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.028, 0.36, 5), lynxMat);
          ll.position.set(lx, 0.08, lz); lynx.add(ll);
        });
        lynx.position.set(28, 0.82, 106); lynx.rotation.y = -0.60; scene.add(lynx);
      }

      // ── Security camera (north wall, watching the room) ───
      cameraData.push({ x: 38, y: WALL_H - 0.3, z: 109.8, sweepAngle: Math.PI / 2.5, facingZ: -1 });

      // ── Guard patrol ──────────────────────────────────────
      guardData.push({
        spawnX: 39, spawnZ: 100,
        waypoints: _route(
          [new THREE.Vector3(32,0,93), new THREE.Vector3(48,0,93), new THREE.Vector3(48,0,108), new THREE.Vector3(30,0,108), new THREE.Vector3(30,0,93)],
          [new THREE.Vector3(35,0,95), new THREE.Vector3(49,0,102), new THREE.Vector3(35,0,108), new THREE.Vector3(49,0,108)],
          [new THREE.Vector3(30,0,92), new THREE.Vector3(50,0,100), new THREE.Vector3(30,0,109), new THREE.Vector3(50,0,100)]
        ),
      });

    } // end Salle de Taxidermie

    // ════════════════════════════════════════════════════════
    //  EAST DISCOVERY WING
    //  Gallery opening Z=62→66, X=25 → connecting corridor → central spine
    //  Spine: X=57→70, Z=55→150
    //  Three themed galleries branch east from the spine:
    //    Fossil Room  X=70→108  Z=55→82
    //    War Room     X=70→108  Z=85→110
    //    Space Room   X=70→108  Z=113→145
    // ════════════════════════════════════════════════════════
    {
      // ── Shared corridor materials ────────────────────────────────────────
      const discWallMat  = new THREE.MeshStandardMaterial({ color: 0x1e1820, roughness: 0.90, metalness: 0.02 });
      const discFloorMat = new THREE.MeshStandardMaterial({ color: 0x16121a, roughness: 0.72, metalness: 0.12 });
      const discCeilMat  = new THREE.MeshStandardMaterial({ color: 0x100e14, roughness: 0.96, metalness: 0.0  });

      // ── East Discovery Corridor (gallery X=25 → spine X=57, Z=62→66) ────
      floor  (scene, 41, 64, 32, 4, discFloorMat);
      ceiling(scene, 41, 64, 32, 4, discCeilMat);
      wall(scene, 41, 62, 32, WALL_T, discWallMat);   // south wall
      wall(scene, 41, 66, 32, WALL_T, discWallMat);   // north wall
      // (west end opens to gallery; east end opens to spine hallway)
      { const lc = new THREE.PointLight(0x88ffee, 0.65, 18);
        lc.position.set(41, 4, 64); scene.add(lc); }

      // ── Discovery Wing Spine Hallway (X=57→70, Z=55→150) ────────────────
      floor  (scene, 63.5, 102.5, 13, 95, discFloorMat);
      ceiling(scene, 63.5, 102.5, 13, 95, discCeilMat);
      wall(scene, 63.5, 55,  13, WALL_T, discWallMat);  // south cap
      wall(scene, 63.5, 150, 13, WALL_T, discWallMat);  // north cap
      // West wall (X=57): solid except Z=62→66 where corridor enters
      wall(scene, 57, 58.5, WALL_T,  7,  discWallMat);   // Z 55→62
      wall(scene, 57, 108,  WALL_T, 84,  discWallMat);   // Z 66→150
      // East wall (X=70): stubs between room openings
      // Fossil opening Z=62→74; War opening Z=91.5→103.5; Space opening Z=123→135
      wall(scene, 70, 58.5,   WALL_T,  7.0, discWallMat);   // Z 55→62
      wall(scene, 70, 82.75,  WALL_T, 17.5, discWallMat);   // Z 74→91.5
      wall(scene, 70, 113.25, WALL_T, 19.5, discWallMat);   // Z 103.5→123
      wall(scene, 70, 142.5,  WALL_T, 15,   discWallMat);   // Z 135→150
      // Spine lights
      [64, 97.5, 147].forEach(z => {
        const sl = new THREE.PointLight(0x9980cc, 0.45, 16);
        sl.position.set(63.5, 4.5, z); scene.add(sl);
      });
    }

    // ════════════════════════════════
    //  FOSSIL ROOM  (X=70→108, Z=55→82, center 89,68.5)
    // ════════════════════════════════
    {
      const FRX = 89, FRZ = 68.5, FRW = 38, FRD = 27;

      // Materials
      const foWallMat  = new THREE.MeshStandardMaterial({ color: 0x6a5230, roughness: 0.93, metalness: 0.0 });
      const foFloorMat = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.88, metalness: 0.0 });
      const foCeilMat  = new THREE.MeshStandardMaterial({ color: 0x3c2a10, roughness: 0.95, metalness: 0.0 });
      const boneMat    = new THREE.MeshStandardMaterial({ color: 0xd4c8a0, roughness: 0.68, metalness: 0.04 });
      const fossilMat  = new THREE.MeshStandardMaterial({ color: 0x9a8060, roughness: 0.85, metalness: 0.0 });
      const explorerMat= new THREE.MeshStandardMaterial({ color: 0x8b6e3a, roughness: 0.72, metalness: 0.0 });
      const khakiMat   = new THREE.MeshStandardMaterial({ color: 0xb8a468, roughness: 0.75, metalness: 0.0 });

      // Room shell — floor, ceiling, 3 closed walls + west wall stubs
      floor  (scene, FRX, FRZ, FRW, FRD, foFloorMat);
      ceiling(scene, FRX, FRZ, FRW, FRD, foCeilMat);
      wall(scene, FRX, 55,  FRW, WALL_T, foWallMat);  // south wall
      wall(scene, FRX, 82,  FRW, WALL_T, foWallMat);  // north wall
      wall(scene, 108, FRZ, WALL_T, FRD, foWallMat);  // east wall
      // West wall stubs (opening Z=62→74 = 12 units)
      wall(scene, 70, 58.5, WALL_T,  7, foWallMat);   // Z 55→62
      wall(scene, 70, 78,   WALL_T,  8, foWallMat);   // Z 74→82

      roomLabel(scene, FRX, FRZ, 'Salle des Fossiles', Math.PI / 2);

      // Glowing archway at fossil room entrance
      const foArchMat = new THREE.MeshStandardMaterial({
        color: 0xd4a840, emissive: 0xd4a840, emissiveIntensity: 0.9,
        roughness: 0.25, transparent: true, opacity: 0.85,
      });
      box(scene, 0.14, 0.14, 12.2, 70, WALL_H + 0.16, 68, foArchMat);
      box(scene, 0.14, WALL_H + 0.32, 0.14, 70, WALL_H / 2, 61.9, foArchMat);
      box(scene, 0.14, WALL_H + 0.32, 0.14, 70, WALL_H / 2, 74.1, foArchMat);

      // ── Lighting ─────────────────────────────────────────
      { const pt = new THREE.PointLight(0xffd080, 0.85, 20);
        pt.position.set(FRX, 4.5, FRZ); scene.add(pt); }
      { const pt2 = new THREE.PointLight(0xffd080, 0.65, 18);
        pt2.position.set(89, 4.5, 60); scene.add(pt2); }

      // ── T-Rex Skeleton (center of room, facing east) ──────────────────────
      {
        const dino = new THREE.Group();

        // Spine — long horizontal cylinder along X axis
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 6.5, 8), boneMat);
        spine.rotation.z = Math.PI / 2; spine.position.set(0, 1.9, 0); dino.add(spine);

        // Neck — angled up-forward
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 7), boneMat);
        neck.rotation.z = -0.55; neck.position.set(3.0, 2.35, 0); dino.add(neck);

        // Skull
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), boneMat);
        skull.scale.set(1.5, 0.9, 0.9); skull.position.set(4.0, 3.10, 0); dino.add(skull);
        // Snout / jaw
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.46), boneMat);
        snout.position.set(4.40, 2.86, 0); dino.add(snout);
        // Teeth (a row of small spikes)
        [-0.16, -0.08, 0, 0.08, 0.16].forEach(tz => {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), boneMat);
          t.rotation.x = Math.PI; t.position.set(4.42, 2.80, tz); dino.add(t);
        });

        // Eye sockets
        [-0.25, 0.25].forEach(ez => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.8 }));
          eye.position.set(3.9, 3.18, ez); dino.add(eye);
        });

        // Ribs (8 pairs)
        for (let i = 0; i < 8; i++) {
          const rx = -1.0 + i * 0.35;
          [-1, 1].forEach(side => {
            const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.040, 1.4, 6), boneMat);
            rib.rotation.z = side * -0.55;
            rib.position.set(rx, 1.55, side * 0.22); dino.add(rib);
          });
        }

        // Tail — tapers to a point (series of decreasing cylinders)
        for (let t = 0; t < 7; t++) {
          const r0 = 0.09 - t * 0.010, r1 = 0.07 - t * 0.010;
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.7, 7), boneMat);
          seg.rotation.z = Math.PI / 2;
          seg.rotation.y = (t % 2 === 0 ? 0.08 : -0.08);
          seg.position.set(-1.6 - t * 0.68, 1.80 - t * 0.08, 0); dino.add(seg);
        }

        // Front legs (T-Rex stubby arms)
        [-0.30, 0.30].forEach(az => {
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.048, 0.56, 6), boneMat);
          upper.rotation.z = 0.40; upper.position.set(2.4, 1.55, az); dino.add(upper);
          const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.040, 0.42, 6), boneMat);
          lower.rotation.z = -0.50; lower.position.set(2.52, 1.18, az); dino.add(lower);
        });

        // Hind legs
        [-0.38, 0.38].forEach(lz => {
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 1.4, 7), boneMat);
          thigh.rotation.z = 0.18; thigh.position.set(-0.20, 0.98, lz); dino.add(thigh);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 1.3, 7), boneMat);
          shin.rotation.z = -0.22; shin.position.set(-0.10, 0.22, lz); dino.add(shin);
          // Foot
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.28), boneMat);
          foot.position.set(0.16, -0.34, lz); dino.add(foot);
        });

        // Hip bone
        const hip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 6), boneMat);
        hip.scale.set(1.0, 0.65, 1.4); hip.position.set(-0.3, 1.8, 0); dino.add(hip);

        dino.position.set(89, 0.38, 68.5);
        dino.rotation.y = Math.PI / 6;
        scene.add(dino);
        addWallAABB(89, 68.5, 7.5, 2.5);
      }

      // ── Small fossil specimens on pedestals ──────────────────────────────

      // Ammonite fossil (spiral approximation with torus segments)
      { box(scene, 1.0, 0.80, 1.0, 76, 0.40, 59, fossilMat);
        const amm = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const r = 0.12 + i * 0.06;
          const seg = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022 + i * 0.005, 5, 12, Math.PI * 1.7), boneMat);
          seg.rotation.x = Math.PI / 2;
          seg.position.set(0, r * 0.1, 0); amm.add(seg);
        }
        amm.position.set(76, 1.21, 59); scene.add(amm); }

      // Trilobite fossil (flattened oval with ridges)
      { box(scene, 1.0, 0.80, 1.0, 103, 0.40, 60, fossilMat);
        const tri = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), boneMat);
        body.scale.set(0.80, 0.22, 1.40); tri.add(body);
        for (let i = -2; i <= 2; i++) {
          const seg = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.06, 0.05), boneMat);
          seg.position.set(0, 0.06, i * 0.07); tri.add(seg);
        }
        tri.position.set(103, 1.20, 60); scene.add(tri); }

      // Pterosaur skull on wall
      { const sk = new THREE.Group();
        const nskull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), boneMat);
        nskull.scale.set(2.6, 0.7, 0.7); sk.add(nskull);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 6), boneMat);
        beak.rotation.z = -Math.PI / 2; beak.position.set(0.55, 0, 0); sk.add(beak);
        sk.position.set(107.8, 3.6, 70); sk.rotation.y = Math.PI; scene.add(sk); }

      // Raptor claws in display case
      { displayCase(scene, 76, 76);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 5), boneMat);
        claw.rotation.z = 0.55; claw.position.set(76, 1.72, 76); scene.add(claw);
        const claw2 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 5), boneMat);
        claw2.rotation.z = -0.70; claw2.position.set(76.12, 1.68, 76); scene.add(claw2); }

      // ── Treasure maps on walls ────────────────────────────────────────────

      // Map 1 — south wall
      { const mapMat = new THREE.MeshStandardMaterial({ color: 0xd4b870, roughness: 0.65, metalness: 0.0 });
        box(scene, 0.04, 1.4, 1.8, FRX - 8, 3.2, 55.1, mapMat);
        // Faint lines across the map
        const lineMat = new THREE.MeshStandardMaterial({ color: 0x7a5020, roughness: 0.8 });
        box(scene, 0.06, 0.04, 1.72, FRX - 8, 3.6, 55.1, lineMat);
        box(scene, 0.06, 0.04, 1.72, FRX - 8, 2.9, 55.1, lineMat);
        box(scene, 0.06, 1.32, 0.04, FRX - 8, 3.2, 55.3, lineMat);
        box(scene, 0.06, 1.32, 0.04, FRX - 8, 3.2, 55.5, lineMat); }

      // Map 2 — east wall
      { const mapMat = new THREE.MeshStandardMaterial({ color: 0xc8a858, roughness: 0.65, metalness: 0.0 });
        box(scene, 0.04, 1.6, 2.0, 107.9, 3.4, 74, mapMat); }

      // Map 3 — north wall
      { const mapMat = new THREE.MeshStandardMaterial({ color: 0xdcbc7c, roughness: 0.62, metalness: 0.0 });
        box(scene, 0.04, 1.2, 1.6, FRX + 6, 3.5, 81.9, mapMat); }

      // ── Explorer outfit mannequins ────────────────────────────────────────
      // Mannequin 1 — south-west corner with pith helmet and vest
      { const man = new THREE.Group();
        box(scene, 0.5, 0.06, 0.5, 75, 0.03, 63, explorerMat); // base plinth
        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.72, 0.24), khakiMat);
        torso.position.set(0, 0.56, 0); man.add(torso);
        // Legs
        [-0.08, 0.08].forEach(lx => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.70, 0.20), khakiMat);
          leg.position.set(lx, -0.15, 0); man.add(leg);
        });
        // Arms (reaching out slightly)
        [-0.25, 0.25].forEach(ax => {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.60, 0.14), explorerMat);
          arm.rotation.z = ax > 0 ? 0.18 : -0.18;
          arm.position.set(ax, 0.46, 0); man.add(arm);
        });
        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7),
          new THREE.MeshStandardMaterial({ color: 0xd4a880, roughness: 0.72, metalness: 0.0 }));
        head.position.set(0, 1.05, 0); man.add(head);
        // Pith helmet
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 5),
          new THREE.MeshStandardMaterial({ color: 0xe8d898, roughness: 0.55, metalness: 0.0 }));
        helmet.scale.set(1, 0.60, 1); helmet.position.set(0, 1.22, 0); man.add(helmet);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.04, 12),
          new THREE.MeshStandardMaterial({ color: 0xd8c880, roughness: 0.55, metalness: 0.0 }));
        brim.position.set(0, 1.12, 0); man.add(brim);
        man.position.set(75, 0.10, 63); scene.add(man);
        addWallAABB(75, 63, 0.7, 0.7); }

      // Mannequin 2 — east wall with backpack and compass
      { const man = new THREE.Group();
        box(scene, 0.5, 0.06, 0.5, 103, 0.03, 73, explorerMat);
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.72, 0.24), khakiMat);
        torso.position.set(0, 0.56, 0); man.add(torso);
        [-0.08, 0.08].forEach(lx => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.70, 0.20), khakiMat);
          leg.position.set(lx, -0.15, 0); man.add(leg);
        });
        // Backpack
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.52, 0.22),
          new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.80, metalness: 0.0 }));
        pack.position.set(-0.02, 0.56, -0.22); man.add(pack);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7),
          new THREE.MeshStandardMaterial({ color: 0xd4a880, roughness: 0.72, metalness: 0.0 }));
        head.position.set(0, 1.05, 0); man.add(head);
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 5),
          new THREE.MeshStandardMaterial({ color: 0xc8b870, roughness: 0.55, metalness: 0.0 }));
        helmet.scale.set(1, 0.60, 1); helmet.position.set(0, 1.22, 0); man.add(helmet);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.04, 12),
          new THREE.MeshStandardMaterial({ color: 0xb8a860, roughness: 0.55, metalness: 0.0 }));
        brim.position.set(0, 1.12, 0); man.add(brim);
        man.position.set(103, 0.10, 73); man.rotation.y = Math.PI;
        scene.add(man); addWallAABB(103, 73, 0.7, 0.7); }

      // ── Digging station ───────────────────────────────────────────────────
      { // Table
        box(scene, 3.0, 0.12, 1.6, 98, 0.92, 62, explorerMat);
        // Table legs
        [[0.9,-0.5],[0.9,0.5],[-0.9,-0.5],[-0.9,0.5]].forEach(([dx,dz]) => {
          box(scene, 0.10, 0.92, 0.10, 98+dx, 0.46, 62+dz,
            new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.78, metalness: 0.0 }));
        });
        addWallAABB(98, 62, 3.2, 1.8);

        // Magnifying glass 1
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccee, roughness: 0.06, metalness: 0.12, transparent: true, opacity: 0.62 });
        const rimMat   = new THREE.MeshStandardMaterial({ color: 0xb8a040, roughness: 0.22, metalness: 0.82 });
        const mg1 = new THREE.Group();
        const lens1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 14), glassMat);
        lens1.rotation.x = Math.PI / 2; mg1.add(lens1);
        const rim1 = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 14), rimMat);
        rim1.rotation.x = Math.PI / 2; mg1.add(rim1);
        const handle1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.44, 7), rimMat);
        handle1.rotation.z = 0.55; handle1.position.set(0.22, -0.20, 0); mg1.add(handle1);
        mg1.position.set(97.2, 1.06, 61.5); scene.add(mg1);

        // Magnifying glass 2 (smaller, lying flat)
        const mg2 = new THREE.Group();
        const lens2 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.02, 12), glassMat);
        mg2.add(lens2);
        const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.020, 6, 12), rimMat);
        mg2.add(rim2);
        const handle2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.36, 7), rimMat);
        handle2.position.set(0.24, 0, 0); mg2.add(handle2);
        mg2.position.set(98.8, 1.06, 62.4); mg2.rotation.z = 0.15; scene.add(mg2);

        // Small brush on table
        { const bsh = new THREE.Group();
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.40, 6),
            new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.78, metalness: 0.0 }));
          bsh.add(stick);
          const bristle = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.016, 0.12, 7),
            new THREE.MeshStandardMaterial({ color: 0xd4c490, roughness: 0.95, metalness: 0.0 }));
          bristle.position.y = -0.22; bsh.add(bristle);
          bsh.position.set(99.6, 1.06, 61.8); bsh.rotation.z = 0.30; scene.add(bsh); }

        // Dirt / excavation pile (flattened sphere)
        { const dirtMat = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.98, metalness: 0.0 });
          const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 5), dirtMat);
          dirt.scale.set(1.2, 0.30, 1.0); dirt.position.set(97.4, 0.98, 62.8); scene.add(dirt); } }

      // ── Large dino skeleton — second exhibit: Triceratops skull mount ───────
      { const tric = new THREE.Group();
        const frillBase = new THREE.Mesh(new THREE.SphereGeometry(0.44, 9, 7), boneMat);
        frillBase.scale.set(0.90, 0.80, 0.60); frillBase.position.set(0, 0, 0); tric.add(frillBase);
        const frill = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.50, 0.12, 10), boneMat);
        frill.rotation.z = Math.PI / 2; frill.position.set(-0.10, 0, 0); tric.add(frill);
        // Three horns
        [[0.48, 0.28, -0.16],[0.48, 0.28, 0.16],[0.60, -0.10, 0]].forEach(([hx, hy, hz]) => {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.46, 7), boneMat);
          horn.rotation.z = -0.45;
          horn.position.set(hx, hy, hz); tric.add(horn);
        });
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 7), boneMat);
        beak.rotation.z = Math.PI / 2; beak.position.set(0.54, -0.22, 0); tric.add(beak);
        // Eye sockets
        [-0.20, 0.20].forEach(ez => {
          const esc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a100a, roughness: 0.8 }));
          esc.position.set(0.34, 0.10, ez); tric.add(esc);
        });
        // Mount pedestal
        box(scene, 0.7, 0.06, 0.7, 96, 0.03, 78, fossilMat);
        box(scene, 0.5, 0.60, 0.5, 96, 0.33, 78, fossilMat);
        tric.position.set(96, 1.38, 78);
        tric.rotation.y = -Math.PI / 4;
        scene.add(tric); }

      // ── Raptor skeleton (Velociraptor) ────────────────────────────────────
      { const raptor = new THREE.Group();
        const rSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.060, 3.0, 7), boneMat);
        rSpine.rotation.z = Math.PI / 2; rSpine.position.set(0, 1.2, 0); raptor.add(rSpine);
        const rNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 0.80, 6), boneMat);
        rNeck.rotation.z = -0.65; rNeck.position.set(1.3, 1.52, 0); raptor.add(rNeck);
        const rSkull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 9, 7), boneMat);
        rSkull.scale.set(1.7, 0.78, 0.70); rSkull.position.set(1.88, 1.96, 0); raptor.add(rSkull);
        const rSnout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.24), boneMat);
        rSnout.position.set(2.14, 1.82, 0); raptor.add(rSnout);
        [-0.07, 0, 0.07].forEach(tz => {
          const rt = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 4), boneMat);
          rt.rotation.x = Math.PI; rt.position.set(2.16, 1.78, tz); raptor.add(rt); });
        for (let i = 0; i < 5; i++) {
          const rx = -0.5 + i * 0.26;
          [-1, 1].forEach(s => {
            const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.75, 5), boneMat);
            rib.rotation.z = s * -0.52; rib.position.set(rx, 0.94, s * 0.10); raptor.add(rib); }); }
        for (let t = 0; t < 5; t++) {
          const rseg = new THREE.Mesh(new THREE.CylinderGeometry(0.045 - t*0.006, 0.055 - t*0.006, 0.46, 6), boneMat);
          rseg.rotation.z = Math.PI / 2; rseg.position.set(-1.0 - t*0.44, 1.18 - t*0.05, 0); raptor.add(rseg); }
        [-0.20, 0.20].forEach(lz => {
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.76, 6), boneMat);
          thigh.rotation.z = 0.28; thigh.position.set(-0.04, 0.60, lz); raptor.add(thigh);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.055, 0.68, 6), boneMat);
          shin.rotation.z = -0.26; shin.position.set(0.06, 0.16, lz); raptor.add(shin);
          const sickle = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.18, 5), boneMat);
          sickle.rotation.z = -0.95; sickle.position.set(0.18, -0.14, lz); raptor.add(sickle); });
        [-0.16, 0.16].forEach(az => {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.36, 5), boneMat);
          arm.rotation.z = 0.48; arm.position.set(1.10, 1.08, az); raptor.add(arm); });
        raptor.position.set(93, 0.26, 58); raptor.rotation.y = Math.PI / 5;
        scene.add(raptor); addWallAABB(93, 58, 4.0, 1.5); }

      // ── Stegosaurus skeleton ───────────────────────────────────────────────
      { const steg = new THREE.Group();
        const sSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.090, 4.8, 7), boneMat);
        sSpine.rotation.z = Math.PI / 2; sSpine.position.set(0, 0.95, 0); steg.add(sSpine);
        [0.18, 0.28, 0.38, 0.46, 0.50, 0.44, 0.36, 0.24, 0.16].forEach((ps, i) => {
          [-1, 1].forEach(sd => {
            const plate = new THREE.Mesh(new THREE.ConeGeometry(ps * 0.45, ps * 1.3, 5), boneMat);
            plate.rotation.z = sd * 0.12;
            plate.position.set(-2.0 + i * 0.50, 0.95 + ps * 0.65, sd * 0.08); steg.add(plate); }); });
        [[-0.8, 0.28], [0.8, 0.28], [-0.8, -0.28], [0.8, -0.28]].forEach(([lx, lz]) => {
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.090, 0.86, 6), boneMat);
          thigh.rotation.z = 0.10; thigh.position.set(lx, 0.44, lz); steg.add(thigh);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.060, 0.78, 6), boneMat);
          shin.rotation.z = -0.08; shin.position.set(lx + 0.06, 0.02, lz); steg.add(shin); });
        for (let t = 0; t < 5; t++) {
          const tseg = new THREE.Mesh(new THREE.CylinderGeometry(0.048 - t*0.007, 0.062 - t*0.007, 0.56, 6), boneMat);
          tseg.rotation.z = Math.PI / 2; tseg.position.set(-2.8 - t*0.54, 0.88 - t*0.07, 0); steg.add(tseg); }
        [[0.14, 0.18], [-0.14, 0.18], [0.14, -0.18], [-0.14, -0.18]].forEach(([sx, sz]) => {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.34, 6), boneMat);
          spike.rotation.z = sx > 0 ? 0.38 : -0.38; spike.position.set(-4.4, 0.72, sz); steg.add(spike); });
        steg.position.set(79, 0.06, 60); steg.rotation.y = Math.PI / 8;
        scene.add(steg); addWallAABB(79, 60, 5.5, 1.8); }

      // ── Brachiosaurus neck arching up the west wall ───────────────────────
      { const brach = new THREE.Group();
        const bTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.30, 2.0, 8), boneMat);
        bTorso.rotation.z = Math.PI / 2; bTorso.position.set(0, 0.9, 0); brach.add(bTorso);
        for (let n = 0; n < 7; n++) {
          const nseg = new THREE.Mesh(new THREE.CylinderGeometry(0.10 - n*0.010, 0.12 - n*0.010, 0.80, 7), boneMat);
          nseg.rotation.z = -(0.55 - n * 0.05);
          nseg.position.set(0.80 + n * 0.62, 1.05 + n * 0.74, 0); brach.add(nseg); }
        const bSkull = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), boneMat);
        bSkull.scale.set(1.6, 0.80, 0.80); bSkull.position.set(5.1, 6.4, 0); brach.add(bSkull);
        const bSnout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.22), boneMat);
        bSnout.position.set(5.52, 6.26, 0); brach.add(bSnout);
        brach.position.set(72, 0.06, 66); scene.add(brach); }

      // ── Extra display cases ───────────────────────────────────────────────
      { displayCase(scene, 100, 75);   // Giant T-Rex tooth
        const tooth = new THREE.Group();
        tooth.add(new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.46, 7), boneMat));
        const tRoot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.16, 7), boneMat);
        tRoot.position.y = -0.28; tooth.add(tRoot);
        tooth.position.set(100, 1.78, 75); tooth.userData.float = true; scene.add(tooth); }

      { displayCase(scene, 104, 72);   // Mammoth tusk section
        const tusk = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const r = 0.076 - i * 0.008;
          const tseg = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.008, 0.22, 7), boneMat);
          tseg.rotation.z = 0.16 + i * 0.06; tseg.position.set(i * 0.18 - 0.44, i * 0.06, 0); tusk.add(tseg); }
        tusk.position.set(104, 1.74, 72); tusk.userData.float = true; scene.add(tusk); }

      { displayCase(scene, 100, 80);   // Prehistoric fish fossil
        const fish = new THREE.Group();
        const fbody = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), fossilMat);
        fbody.scale.set(1.9, 0.55, 0.28); fish.add(fbody);
        const fspine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), fossilMat);
        fspine.rotation.z = Math.PI / 2; fspine.position.set(0, 0, 0); fish.add(fspine);
        const ftail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), fossilMat);
        ftail.position.set(-0.38, 0, 0); fish.add(ftail);
        const ffin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.03), fossilMat);
        ffin.rotation.z = 0.36; ffin.position.set(0.06, 0.14, 0); fish.add(ffin);
        fish.rotation.x = -Math.PI / 2;
        fish.position.set(100, 1.74, 80); fish.userData.float = true; scene.add(fish); }

      { displayCase(scene, 104, 78);   // Vertebrae column
        const verts = new THREE.Group();
        for (let v = 0; v < 6; v++) {
          const vert = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.065, 8), boneMat);
          vert.position.y = v * 0.09; verts.add(vert);
          const proc = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.10, 0.032), boneMat);
          proc.position.set(0, v * 0.09 + 0.082, 0); verts.add(proc); }
        verts.position.set(104, 1.70, 78); verts.userData.float = true; scene.add(verts); }

      // ── Stealable: Ancient Bone Key (mission target in display case) ─────
      { displayCase(scene, 85, 78);
        const keyMesh = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.50, 7),
          new THREE.MeshStandardMaterial({ color: 0xf0e0a8, roughness: 0.30, metalness: 0.72, emissive: 0x604800, emissiveIntensity: 0.15 }));
        keyMesh.add(shaft);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 7, 14),
          new THREE.MeshStandardMaterial({ color: 0xf0e0a8, roughness: 0.25, metalness: 0.78 }));
        ring.position.y = 0.27; keyMesh.add(ring);
        keyMesh.position.set(85, 1.72, 78);
        keyMesh.userData.float = true; scene.add(keyMesh);
        const fRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
        fRing.rotation.x = -Math.PI / 2; fRing.position.set(85, 0.02, 78); scene.add(fRing);
        keyMesh.userData.floorRing = fRing;
        stealables.push({ mesh: keyMesh, item: 'fossilKey', x: 85, z: 78, taken: false, bonus: true, label: 'Ancient Bone Key', value: 18000000, hasCase: true, caseBroken: false }); }

      // Stealable: T-Rex Fossil Skull (mission target on pedestal)
      { box(scene, 0.7, 0.06, 0.7, 82, 0.03, 70, fossilMat);
        box(scene, 0.5, 1.00, 0.5, 82, 0.53, 70, fossilMat);
        const skMesh = new THREE.Group();
        const skBase = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), boneMat);
        skBase.scale.set(1.5, 0.9, 0.9); skMesh.add(skBase);
        const skJaw  = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.35), boneMat);
        skJaw.position.set(0.32, -0.22, 0); skMesh.add(skJaw);
        const skSnout= new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.38, 6), boneMat);
        skSnout.rotation.z = -Math.PI / 2; skSnout.position.set(0.50, 0, 0); skMesh.add(skSnout);
        skMesh.position.set(82, 1.52, 70);
        skMesh.userData.float = true; scene.add(skMesh);
        const skRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        skRing.rotation.x = -Math.PI / 2; skRing.position.set(82, 0.02, 70); scene.add(skRing);
        skMesh.userData.floorRing = skRing;
        stealables.push({ mesh: skMesh, item: 'trexSkull', x: 82, z: 70, taken: false, bonus: true, label: 'T-Rex Fossil Skull', value: 45000000 }); }

      // ── Velociraptor skeleton ─────────────────────────────────────────────
      { const raptor = new THREE.Group();
        // Spine
        const rSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.060, 2.8, 7), boneMat);
        rSpine.rotation.z = Math.PI / 2; rSpine.position.set(0, 1.1, 0); raptor.add(rSpine);
        // Neck
        const rNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.052, 0.80, 6), boneMat);
        rNeck.rotation.z = -0.70; rNeck.position.set(1.2, 1.45, 0); raptor.add(rNeck);
        // Skull
        const rSkull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), boneMat);
        rSkull.scale.set(2.0, 0.75, 0.80); rSkull.position.set(1.85, 1.82, 0); raptor.add(rSkull);
        const rSnout = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.22), boneMat);
        rSnout.position.set(2.14, 1.68, 0); raptor.add(rSnout);
        [-0.07, 0, 0.07].forEach(tz => {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 4), boneMat);
          t.rotation.x = Math.PI; t.position.set(2.16, 1.64, tz); raptor.add(t);
        });
        // Eye sockets
        [-0.20, 0.20].forEach(ez => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.050, 5, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a100a, roughness: 0.8 }));
          eye.position.set(1.82, 1.88, ez); raptor.add(eye);
        });
        // Ribs (5 pairs)
        for (let i = 0; i < 5; i++) {
          const rx = -0.35 + i * 0.26;
          [-1, 1].forEach(s => {
            const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.82, 5), boneMat);
            rib.rotation.z = s * -0.50; rib.position.set(rx, 1.0, s * 0.14); raptor.add(rib);
          });
        }
        // Tail (6 tapering segments)
        for (let t = 0; t < 6; t++) {
          const r0 = Math.max(0.010, 0.060 - t * 0.008), r1 = Math.max(0.008, 0.048 - t * 0.008);
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.42, 5), boneMat);
          seg.rotation.z = Math.PI / 2;
          seg.position.set(-0.8 - t * 0.40, 1.10 - t * 0.06, 0); raptor.add(seg);
        }
        // Hind legs
        [-0.22, 0.22].forEach(lz => {
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.85, 6), boneMat);
          thigh.rotation.z = 0.22; thigh.position.set(-0.10, 0.72, lz); raptor.add(thigh);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.055, 0.80, 6), boneMat);
          shin.rotation.z = -0.28; shin.position.set(0.0, 0.22, lz); raptor.add(shin);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.18), boneMat);
          foot.position.set(0.12, -0.22, lz); raptor.add(foot);
          // Sickle claw
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.18, 5), boneMat);
          claw.rotation.z = -0.90; claw.position.set(0.22, -0.18, lz); raptor.add(claw);
        });
        // Arms (small, forward-reaching)
        [-0.18, 0.18].forEach(az => {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.030, 0.38, 5), boneMat);
          arm.rotation.z = -0.60; arm.position.set(0.88, 0.95, az); raptor.add(arm);
          const claw2 = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.12, 4), boneMat);
          claw2.rotation.z = 0.40; claw2.position.set(1.06, 0.72, az); raptor.add(claw2);
        });
        raptor.position.set(77, 0.22, 75);
        raptor.rotation.y = -Math.PI / 5;
        scene.add(raptor);
        addWallAABB(77, 75, 3.5, 1.5); }

      // ── Stegosaurus skeleton ───────────────────────────────────────────────
      { const stego = new THREE.Group();
        const plateMat = new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.72, metalness: 0.06 });
        // Spine
        const sSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.5, 8), boneMat);
        sSpine.rotation.z = Math.PI / 2; sSpine.position.set(0, 1.5, 0); stego.add(sSpine);
        // Neck
        const sNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 7), boneMat);
        sNeck.rotation.z = 0.55; sNeck.position.set(2.5, 1.60, 0); stego.add(sNeck);
        // Head
        const sHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), boneMat);
        sHead.scale.set(1.6, 0.70, 0.80); sHead.position.set(3.1, 1.95, 0); stego.add(sHead);
        const sBeak = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.10, 0.22), boneMat);
        sBeak.position.set(3.45, 1.82, 0); stego.add(sBeak);
        // Eye sockets
        [-0.18, 0.18].forEach(ez => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4),
            new THREE.MeshStandardMaterial({ color: 0x1a100a, roughness: 0.8 }));
          eye.position.set(3.05, 2.02, ez); stego.add(eye);
        });
        // Ribs (6 pairs)
        for (let i = 0; i < 6; i++) {
          const rx = -0.8 + i * 0.38;
          [-1, 1].forEach(s => {
            const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.036, 1.2, 6), boneMat);
            rib.rotation.z = s * -0.48; rib.position.set(rx, 1.2, s * 0.20); stego.add(rib);
          });
        }
        // Dorsal plates (stegosaurus signature — alternating pairs along spine)
        for (let p = 0; p < 8; p++) {
          const px = -1.4 + p * 0.44;
          const ph = 0.36 + Math.abs(Math.sin(p * 0.65)) * 0.50;
          const pw = 0.22 + (p < 4 ? p * 0.04 : (7 - p) * 0.04);
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, ph, pw), plateMat);
          plate.position.set(px, 1.5 + ph / 2, (p % 2 === 0 ? 0.10 : -0.10));
          stego.add(plate);
        }
        // Tail spikes (thagomizer — 4 spikes)
        [[0, 0, -0.26],[0, 0, 0.26],[-0.20, 0.08, 0],[0.20, -0.08, 0]].forEach(([tx, ty, tz]) => {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.52, 6), boneMat);
          spike.rotation.z = Math.PI / 2 + ty * 2;
          spike.rotation.y = tz !== 0 ? 0.45 * Math.sign(tz) : 0;
          spike.position.set(-2.9 + tx, 1.48, tz); stego.add(spike);
        });
        // 4 stout legs
        [[-1.4, -0.24],[0.5, -0.24],[-1.4, 0.24],[0.5, 0.24]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.075, 1.50, 7), boneMat);
          leg.position.set(lx, 0.75, lz); stego.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28), boneMat);
          foot.position.set(lx, 0.00, lz); stego.add(foot);
        });
        // Hip bone
        const sHip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), boneMat);
        sHip.scale.set(1.1, 0.60, 1.4); sHip.position.set(-0.5, 1.48, 0); stego.add(sHip);
        stego.position.set(102, 0.02, 72);
        stego.rotation.y = Math.PI / 6;
        scene.add(stego);
        addWallAABB(102, 72, 6.5, 2.2); }

      // ── Vent in Fossil Room ───────────────────────────────────────────────
      makeVentGrate(63.5, 68.5);   // hallway side
      makeVentGrate(89, 68.5);     // room side
      vents.push({ entryX: 63.5, entryZ: 68.5, exitX: 89, exitZ: 68.5 });
      vents.push({ entryX: 89,   entryZ: 68.5, exitX: 63.5, exitZ: 68.5 });

      // ── Security camera ───────────────────────────────────────────────────
      cameraData.push({ x: 96, y: WALL_H - 0.3, z: 81.8, sweepAngle: Math.PI / 2.2, facingZ: -1 });

      // ── Guard patrol ──────────────────────────────────────────────────────
      guardData.push({
        spawnX: 89, spawnZ: 68.5,
        waypoints: _route(
          [new THREE.Vector3(80,0,60), new THREE.Vector3(105,0,60), new THREE.Vector3(105,0,78), new THREE.Vector3(80,0,78)],
          [new THREE.Vector3(80,0,58), new THREE.Vector3(106,0,62), new THREE.Vector3(106,0,78), new THREE.Vector3(80,0,76)],
          [new THREE.Vector3(78,0,58), new THREE.Vector3(106,0,58), new THREE.Vector3(106,0,80), new THREE.Vector3(78,0,80)]
        ),
      });

    } // end Fossil Room

    // ════════════════════════════════
    //  WAR ROOM  (X=70→108, Z=85→110, center 89,97.5)
    // ════════════════════════════════
    {
      const WRX = 89, WRZ = 97.5, WRW = 38, WRD = 25;

      // Materials — dark stone, battle-scarred
      const waWallMat  = new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.93, metalness: 0.0 });
      const waFloorMat = new THREE.MeshStandardMaterial({ color: 0x141010, roughness: 0.88, metalness: 0.0 });
      const waCeilMat  = new THREE.MeshStandardMaterial({ color: 0x0e0c0c, roughness: 0.97, metalness: 0.0 });
      const metalMat   = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.30, metalness: 0.88 });
      const steelMat   = new THREE.MeshStandardMaterial({ color: 0x7a8090, roughness: 0.22, metalness: 0.92 });
      const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.82, metalness: 0.0 });
      const woodBrownMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 0.80, metalness: 0.0 });

      // Room shell
      floor  (scene, WRX, WRZ, WRW, WRD, waFloorMat);
      ceiling(scene, WRX, WRZ, WRW, WRD, waCeilMat);
      wall(scene, WRX, 85,  WRW, WALL_T, waWallMat);  // south wall
      wall(scene, WRX, 110, WRW, WALL_T, waWallMat);  // north wall
      wall(scene, 108, WRZ, WALL_T, WRD, waWallMat);  // east wall
      // West wall stubs (opening Z=91.5→103.5 = 12 units)
      wall(scene, 70, 88.25,  WALL_T, 6.5, waWallMat);  // Z 85→91.5
      wall(scene, 70, 106.75, WALL_T, 6.5, waWallMat);  // Z 103.5→110

      roomLabel(scene, WRX, WRZ, 'Salle de Guerre', Math.PI / 2);

      // Glowing archway at war room entrance (red/orange war glow)
      const waArchMat = new THREE.MeshStandardMaterial({
        color: 0xff4020, emissive: 0xff2010, emissiveIntensity: 1.0,
        roughness: 0.25, transparent: true, opacity: 0.82,
      });
      box(scene, 0.14, 0.14, 12.2, 70, WALL_H + 0.16, 97.5, waArchMat);
      box(scene, 0.14, WALL_H + 0.32, 0.14, 70, WALL_H / 2, 91.4, waArchMat);
      box(scene, 0.14, WALL_H + 0.32, 0.14, 70, WALL_H / 2, 103.6, waArchMat);

      // ── Lighting (dramatic red-tinted war ambience) ───────────────────────
      { const pt = new THREE.PointLight(0xff3010, 0.65, 20); pt.position.set(WRX, 4.5, WRZ); scene.add(pt); }
      { const pt = new THREE.PointLight(0xffa060, 0.40, 14); pt.position.set(89, 4.5, 97.5); scene.add(pt); }
      { const pt = new THREE.PointLight(0xff3010, 0.55, 20); pt.position.set(89, 4.5, 105); scene.add(pt); }

      // ── Country flag banners on south wall ───────────────────────────────
      const flagConfigs = [
        { x: 76, colors: [0x002395, 0xffffff, 0xed2939] },   // France (blue/white/red)
        { x: 82, colors: [0x000000, 0xdd0000, 0xffce00] },   // Germany (black/red/gold)
        { x: 88, colors: [0xffffff, 0x009246, 0xce2b37] },   // Italy (white/green/red) rotated order
        { x: 94, colors: [0xbc002d, 0xffffff, null] },        // Japan
        { x: 100, colors: [0x012169, 0xffffff, 0xc8102e] },  // UK (blue/white/red)
        { x: 106, colors: [0xb22234, 0xffffff, 0x3c3b6e] },  // USA
      ];
      flagConfigs.forEach(fc => {
        // Flag pole
        box(scene, 0.06, 3.4, 0.06, fc.x, 1.7, 85.1, metalMat);
        // Flag (vertical stripes, 3 sections)
        const sw = 0.50, sh = 0.72;
        fc.colors.forEach((col, idx) => {
          if (!col) return;
          const fm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.72, metalness: 0.0 });
          // If Japan (only 2 colors with null), paint full flag white then red circle
          if (fc.colors[2] === null) {
            if (idx === 0) {
              box(scene, 0.04, sh, sw, fc.x, 3.1, 85.12,
                new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.0 }));
              const circle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14),
                new THREE.MeshStandardMaterial({ color: 0xbc002d, roughness: 0.68, metalness: 0.0 }));
              circle.rotation.x = Math.PI / 2; circle.position.set(fc.x, 3.1, 85.16); scene.add(circle);
            }
          } else {
            box(scene, 0.04, sh, sw / 3, fc.x, 3.1, 85.12 + (idx - 1) * (sw / 3), fm);
          }
        });
      });

      // ── Swords mounted on east wall ───────────────────────────────────────
      [[107.9, 3.8, 88, 0.35], [107.9, 3.4, 92, -0.30], [107.9, 4.0, 96, 0.15],
       [107.9, 3.6, 100, -0.40], [107.9, 3.9, 104, 0.25]].forEach(([wx, wy, wz, angle]) => {
        const sword = new THREE.Group();
        // Blade
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.60, 0.012), steelMat);
        blade.rotation.z = angle; sword.add(blade);
        // Guard (crossguard)
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.30), metalMat);
        guard.position.y = -0.70 * Math.cos(angle); guard.position.z = 0.70 * Math.sin(angle) * 0.1;
        sword.add(guard);
        // Grip
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.38, 6), leatherMat);
        grip.rotation.z = angle; grip.position.y = -0.86 * Math.cos(angle);
        sword.add(grip);
        // Pommel
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.044, 7, 6), metalMat);
        pommel.position.y = -1.04 * Math.cos(angle); sword.add(pommel);
        sword.position.set(wx, wy, wz); scene.add(sword);
      });

      // ── Shields and armor on pedestals ───────────────────────────────────
      // Round shield 1
      { box(scene, 0.9, 0.06, 0.9, 80, 0.03, 88, waWallMat);
        box(scene, 0.7, 0.80, 0.7, 80, 0.43, 88, waWallMat);
        const sh = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 0.07, 14), metalMat);
        face.rotation.x = Math.PI / 2; sh.add(face);
        // Concave inner (darken center)
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 6), steelMat);
        boss.scale.z = 0.40; sh.add(boss);
        // Rim
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.030, 6, 20), metalMat);
        rim.rotation.x = Math.PI / 2; sh.add(rim);
        sh.position.set(80, 1.56, 88); scene.add(sh); addWallAABB(80, 88, 1.1, 1.1); }

      // Kite shield
      { box(scene, 0.9, 0.06, 0.9, 76, 0.03, 106, waWallMat);
        box(scene, 0.7, 0.80, 0.7, 76, 0.43, 106, waWallMat);
        const ksh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.86, 0.07), metalMat);
        ksh.add(body);
        // Pointed bottom
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.28, 4), metalMat);
        tip.rotation.z = Math.PI; tip.position.y = -0.56; ksh.add(tip);
        // Cross decoration
        box(scene, 0.60, 0.04, 0.04, 0, 0, 0.04, new THREE.MeshStandardMaterial({ color: 0xcc2010, roughness: 0.55, metalness: 0.0 }));
        box(scene, 0.04, 0.80, 0.04, 0, 0, 0.04, new THREE.MeshStandardMaterial({ color: 0xcc2010, roughness: 0.55, metalness: 0.0 }));
        ksh.position.set(76, 1.55, 106); ksh.rotation.x = -0.18; scene.add(ksh);
        addWallAABB(76, 106, 1.1, 1.1); }

      // Knight helmet on pedestal
      { box(scene, 0.8, 0.06, 0.8, 100, 0.03, 108, waWallMat);
        box(scene, 0.6, 0.90, 0.6, 100, 0.48, 108, waWallMat);
        const helm = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), steelMat);
        bowl.scale.set(0.90, 1.08, 0.90); helm.add(bowl);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.28),
          new THREE.MeshStandardMaterial({ color: 0x1a1820, roughness: 0.25, metalness: 0.60 }));
        visor.position.y = 0.08; helm.add(visor);
        // Cheek guards
        [-0.22, 0.22].forEach(cx => {
          const cg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.26), steelMat);
          cg.position.set(cx, -0.12, 0); helm.add(cg);
        });
        // Nasal bar
        const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.22, 0.06), steelMat);
        nasal.position.set(0, 0.04, 0.22); helm.add(nasal);
        helm.position.set(100, 1.38, 108); scene.add(helm); }

      // ── Bow and arrow display ─────────────────────────────────────────────
      { const bowMat = new THREE.MeshStandardMaterial({ color: 0x6a3c10, roughness: 0.72, metalness: 0.0 });
        const strMat = new THREE.MeshStandardMaterial({ color: 0xe0d090, roughness: 0.55, metalness: 0.0 });
        // Bow arc — curve made from a series of cylinders
        box(scene, 0.7, 0.06, 0.7, 86, 0.03, 108, waWallMat);
        box(scene, 0.5, 0.80, 0.5, 86, 0.43, 108, waWallMat);
        const bow = new THREE.Group();
        for (let i = 0; i < 8; i++) {
          const ang = -0.8 + i * 0.23;
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.030, 0.28, 6), bowMat);
          seg.rotation.z = ang; seg.position.set(0, Math.cos(ang) * 0.55, Math.sin(ang) * 0.08);
          bow.add(seg);
        }
        // Bowstring
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.25, 4), strMat);
        str.rotation.z = 0; str.position.y = 0; bow.add(str);
        bow.position.set(86, 1.50, 108); scene.add(bow); addWallAABB(86, 108, 0.8, 0.8);

        // Arrows (quiver) — propped against pedestal
        for (let a = 0; a < 6; a++) {
          const arrow = new THREE.Group();
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.88, 5), woodBrownMat);
          arrow.add(shaft);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.08, 5), metalMat);
          tip.position.y = 0.46; arrow.add(tip);
          const fletching = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.003), strMat);
          fletching.position.y = -0.38; arrow.add(fletching);
          arrow.position.set(83.6 + a * 0.14, 1.52, 107.6);
          arrow.rotation.z = 0.18 + a * 0.04;
          scene.add(arrow);
        } }

      // ── Armour display rack (centre) ──────────────────────────────────────
      { const armMat = new THREE.MeshStandardMaterial({ color: 0x888898, roughness: 0.18, metalness: 0.96 });
        box(scene, 0.6, 0.06, 0.6, 93, 0.03, 97.5, waWallMat);
        box(scene, 0.4, 1.50, 0.4, 93, 0.78, 97.5, waWallMat);
        const armour = new THREE.Group();
        // Breastplate
        const breast = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), armMat);
        breast.scale.set(0.95, 0.96, 0.50); armour.add(breast);
        // Pauldrons (shoulder plates)
        [-0.34, 0.34].forEach(px => {
          const paul = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), armMat);
          paul.scale.set(1.0, 0.6, 0.7); paul.position.set(px, 0.24, 0); armour.add(paul);
        });
        // Gorget (neck guard)
        const gorg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.18, 10), armMat);
        gorg.position.y = 0.38; armour.add(gorg);
        // Helmet atop
        const tophelm = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), armMat);
        tophelm.scale.set(0.90, 1.08, 0.90); tophelm.position.y = 0.62; armour.add(tophelm);
        const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.03, 0.32, 7),
          new THREE.MeshStandardMaterial({ color: 0xcc1010, roughness: 0.78, metalness: 0.0 }));
        plume.position.y = 0.92; armour.add(plume);
        armour.position.set(93, 1.56, 97.5); scene.add(armour); addWallAABB(93, 97.5, 0.9, 0.9); }

      // ── Battle standard / stealable mission item ─────────────────────────
      { displayCase(scene, 84, 97.5);
        const std = new THREE.Group();
        // Pole
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.024, 0.72, 6), metalMat);
        std.add(pole);
        // Banner
        const bannerMat = new THREE.MeshStandardMaterial({
          color: 0xcc1010, emissive: 0x660808, emissiveIntensity: 0.20, roughness: 0.65, metalness: 0.0,
        });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.28), bannerMat);
        banner.position.set(0, 0.22, 0.14); std.add(banner);
        // Eagle/crest on top
        const crest = new THREE.Mesh(new THREE.SphereGeometry(0.040, 6, 5),
          new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.18, metalness: 0.90 }));
        crest.position.y = 0.38; std.add(crest);
        std.position.set(84, 1.72, 97.5);
        std.userData.float = true; scene.add(std);
        const stRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
        stRing.rotation.x = -Math.PI / 2; stRing.position.set(84, 0.02, 97.5); scene.add(stRing);
        std.userData.floorRing = stRing;
        stealables.push({ mesh: std, item: 'warStandard', x: 84, z: 97.5, taken: false, bonus: true, label: 'War Standard', value: 25000000, hasCase: true, caseBroken: false }); }

      // Ancient sword — second stealable
      { box(scene, 0.7, 0.06, 0.7, 97, 0.03, 86, waWallMat);
        box(scene, 0.5, 0.90, 0.5, 97, 0.48, 86, waWallMat);
        const aSword = new THREE.Group();
        const aBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.40, 0.012),
          new THREE.MeshStandardMaterial({ color: 0xd0d8e0, roughness: 0.18, metalness: 0.96, emissive: 0x202840, emissiveIntensity: 0.12 }));
        aSword.add(aBlade);
        const aGuard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.48), metalMat);
        aGuard.position.y = -0.58; aSword.add(aGuard);
        const aGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.42, 7), leatherMat);
        aGrip.position.y = -0.82; aSword.add(aGrip);
        const aPommel = new THREE.Mesh(new THREE.SphereGeometry(0.050, 7, 6), metalMat);
        aPommel.position.y = -1.04; aSword.add(aPommel);
        aSword.position.set(97, 2.02, 86);
        aSword.userData.float = true; scene.add(aSword);
        const swRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xff6030, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
        swRing.rotation.x = -Math.PI / 2; swRing.position.set(97, 0.02, 86); scene.add(swRing);
        aSword.userData.floorRing = swRing;
        stealables.push({ mesh: aSword, item: 'ancientSword', x: 97, z: 86, taken: false, bonus: true, label: 'Ancient Sword', value: 32000000 }); }

      // ── Vent in War Room ─────────────────────────────────────────────────
      makeVentGrate(63.5, 97.5);   // hallway side
      makeVentGrate(89, 97.5);     // room side
      vents.push({ entryX: 63.5, entryZ: 97.5, exitX: 89, exitZ: 97.5 });
      vents.push({ entryX: 89,   entryZ: 97.5, exitX: 63.5, exitZ: 97.5 });

      // ── Security camera ───────────────────────────────────────────────────
      cameraData.push({ x: 100, y: WALL_H - 0.3, z: 109.8, sweepAngle: Math.PI / 2.2, facingZ: -1 });

      // ── Guard patrol ──────────────────────────────────────────────────────
      guardData.push({
        spawnX: 89, spawnZ: 97.5,
        waypoints: _route(
          [new THREE.Vector3(80,0,87), new THREE.Vector3(105,0,87), new THREE.Vector3(105,0,108), new THREE.Vector3(80,0,108)],
          [new THREE.Vector3(78,0,86), new THREE.Vector3(106,0,90), new THREE.Vector3(106,0,109), new THREE.Vector3(78,0,105)],
          [new THREE.Vector3(78,0,86), new THREE.Vector3(106,0,86), new THREE.Vector3(106,0,109), new THREE.Vector3(78,0,109)]
        ),
      });

    } // end War Room

    // ════════════════════════════════
    //  SPACE ROOM  (X=70→108, Z=113→145, center 89,129)
    // ════════════════════════════════
    {
      const SPX = 89, SPZ = 129, SPW = 38, SPD = 32;

      // ── Galaxy wall / floor texture (canvas) ─────────────────────────────
      const _galaxyCanvas = document.createElement('canvas');
      _galaxyCanvas.width = _galaxyCanvas.height = 512;
      { const ctx = _galaxyCanvas.getContext('2d');
        ctx.fillStyle = '#020008'; ctx.fillRect(0, 0, 512, 512);
        // Nebula blobs
        const nebulaData = [[120,140,90,260],[300,200,110,280],[200,380,80,200],[400,100,70,300]];
        nebulaData.forEach(([nx, ny, nr, hue]) => {
          const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
          ng.addColorStop(0, `hsla(${hue},85%,45%,0.30)`);
          ng.addColorStop(1, 'transparent');
          ctx.fillStyle = ng; ctx.fillRect(0, 0, 512, 512);
        });
        // Stars
        for (let s = 0; s < 420; s++) {
          const sx = Math.random() * 512, sy = Math.random() * 512;
          const sr = 0.4 + Math.random() * 1.8;
          const bright = 0.4 + Math.random() * 0.6;
          ctx.fillStyle = `rgba(255,255,255,${bright.toFixed(2)})`;
          ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        } }
      const galaxyTex = new THREE.CanvasTexture(_galaxyCanvas);
      galaxyTex.wrapS = galaxyTex.wrapT = THREE.RepeatWrapping;

      // Materials
      const spWallMat  = new THREE.MeshStandardMaterial({ map: galaxyTex, color: 0x080012, roughness: 0.90, metalness: 0.06 });
      const spFloorMat = new THREE.MeshStandardMaterial({ map: galaxyTex, color: 0x060010, roughness: 0.70, metalness: 0.18 });
      const spCeilMat  = new THREE.MeshStandardMaterial({ map: galaxyTex, color: 0x040010, roughness: 0.92, metalness: 0.08, emissive: 0x050010, emissiveIntensity: 0.6 });
      const titaniumMat= new THREE.MeshStandardMaterial({ color: 0xc0c8d0, roughness: 0.16, metalness: 0.96 });
      const whiteMat   = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.35, metalness: 0.10 });


      // Room shell
      floor  (scene, SPX, SPZ, SPW, SPD, spFloorMat);
      ceiling(scene, SPX, SPZ, SPW, SPD, spCeilMat);
      wall(scene, SPX, 113, SPW, WALL_T, spWallMat);   // south wall
      wall(scene, SPX, 145, SPW, WALL_T, spWallMat);   // north wall
      wall(scene, 108, SPZ, WALL_T, SPD, spWallMat);   // east wall
      // West wall stubs (opening Z=123→135 = 12 units)
      wall(scene, 70, 118, WALL_T, 10, spWallMat);     // Z 113→123
      wall(scene, 70, 140, WALL_T, 10, spWallMat);     // Z 135→145

      roomLabel(scene, SPX, SPZ, 'Salle de l\'Espace', Math.PI / 2);

      // Glowing archway at space room entrance (deep blue/purple)
      const spArchMat = new THREE.MeshStandardMaterial({
        color: 0x4444ff, emissive: 0x2222cc, emissiveIntensity: 1.4,
        roughness: 0.18, transparent: true, opacity: 0.88,
      });
      box(scene, 0.14, 0.14, 12.2, 70, WALL_H + 0.16, 129, spArchMat);
      box(scene, 0.14, WALL_H + 0.32, 0.14, 70, WALL_H / 2, 122.9, spArchMat);
      box(scene, 0.14, WALL_H + 0.32, 0.14, 70, WALL_H / 2, 135.1, spArchMat);

      // ── Lighting (deep space ambience) ────────────────────────────────────
      { const pt = new THREE.PointLight(0x4444ff, 0.60, 20); pt.position.set(SPX, 4.5, SPZ); scene.add(pt); }
      { const pt = new THREE.PointLight(0x6622aa, 0.40, 14); pt.position.set(89, 5, 129); scene.add(pt); }
      { const pt = new THREE.PointLight(0x4444ff, 0.50, 20); pt.position.set(89, 4.5, 118); scene.add(pt); }
      { const pt = new THREE.PointLight(0x4444ff, 0.50, 20); pt.position.set(89, 4.5, 140); scene.add(pt); }

      // ── Planets hanging from ceiling ──────────────────────────────────────

      // Earth
      { const earth = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 12),
          new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.60, metalness: 0.0, emissive: 0x081844, emissiveIntensity: 0.18 }));
        // Green continents (bumps)
        const cont = new THREE.Mesh(new THREE.SphereGeometry(0.73, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x228844, roughness: 0.80, metalness: 0.0, transparent: true, opacity: 0.55 }));
        const earthG = new THREE.Group(); earthG.add(earth); earthG.add(cont);
        // Hanging wire
        box(scene, 0.02, 1.60, 0.02, 82, 4.76, 120, titaniumMat);
        earthG.scale.set(1.6, 1.6, 1.6);
        earthG.position.set(82, 3.18, 120); earthG.userData.float = true; scene.add(earthG); }

      // Saturn (with rings)
      { const saturn = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xd4b870, roughness: 0.70, metalness: 0.0, emissive: 0x6a4818, emissiveIntensity: 0.12 }));
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.10, 0.14, 5, 24),
          new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 0.55, metalness: 0.0, transparent: true, opacity: 0.72 }));
        ring1.rotation.x = Math.PI / 5;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.44, 0.09, 5, 24),
          new THREE.MeshStandardMaterial({ color: 0xa08850, roughness: 0.60, metalness: 0.0, transparent: true, opacity: 0.55 }));
        ring2.rotation.x = Math.PI / 5;
        const saturnG = new THREE.Group(); saturnG.add(saturn); saturnG.add(ring1); saturnG.add(ring2);
        box(scene, 0.02, 1.80, 0.02, 95, 4.68, 124, titaniumMat);
        saturnG.scale.set(1.5, 1.5, 1.5);
        saturnG.position.set(95, 3.06, 124); saturnG.userData.float = true; scene.add(saturnG); }

      // Mars
      { const mars = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xcc4422, roughness: 0.82, metalness: 0.0, emissive: 0x6a1808, emissiveIntensity: 0.14 }));
        box(scene, 0.02, 1.52, 0.02, 102, 4.70, 122, titaniumMat);
        mars.scale.set(1.5, 1.5, 1.5);
        mars.position.set(102, 3.26, 122); mars.userData.float = true; scene.add(mars); }

      // Jupiter (with bands)
      { const jup = new THREE.Mesh(new THREE.SphereGeometry(0.88, 14, 12),
          new THREE.MeshStandardMaterial({ color: 0xc8884a, roughness: 0.72, metalness: 0.0, emissive: 0x4a2808, emissiveIntensity: 0.10 }));
        // Band stripes (a few torus rings as rings of latitude)
        [0.35, -0.20, 0.60].forEach((bandY, bi) => {
          const band = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(0.88*0.88 - bandY*bandY), 0.04, 4, 24),
            new THREE.MeshStandardMaterial({ color: bi%2===0 ? 0x8c4822 : 0xe0aa66, roughness: 0.68, metalness: 0.0, transparent: true, opacity: 0.72 }));
          band.rotation.x = Math.PI / 2;
          band.position.y = bandY; jup.add(band);
        });
        box(scene, 0.02, 2.00, 0.02, 89, 4.56, 118, titaniumMat);
        jup.scale.set(1.5, 1.5, 1.5);
        jup.position.set(89, 2.78, 118); jup.userData.float = true; scene.add(jup); }

      // Moon
      { const moon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.95, metalness: 0.0 }));
        // Craters
        [[-0.24, 0.26, 0.14],[0.18, -0.22, 0.28],[0.10, 0.30, -0.18]].forEach(([cx, cy, cz]) => {
          const crater = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x888078, roughness: 0.98, metalness: 0.0 }));
          crater.scale.z = 0.30; crater.position.set(cx, cy, cz + 0.32); moon.add(crater);
        });
        box(scene, 0.02, 1.40, 0.02, 76, 4.74, 125, titaniumMat);
        moon.scale.set(1.5, 1.5, 1.5);
        moon.position.set(76, 3.46, 125); moon.userData.float = true; scene.add(moon); }

      // Neptune
      { const neptune = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0x3355dd, roughness: 0.65, metalness: 0.0, emissive: 0x111844, emissiveIntensity: 0.20 }));
        box(scene, 0.02, 1.58, 0.02, 84, 4.74, 138, titaniumMat);
        neptune.scale.set(1.5, 1.5, 1.5);
        neptune.position.set(84, 3.28, 138); neptune.userData.float = true; scene.add(neptune); }

      // ── Space Shuttle model ───────────────────────────────────────────────
      { box(scene, 1.0, 0.06, 1.0, 100, 0.03, 138, spWallMat);
        box(scene, 0.8, 0.60, 0.8, 100, 0.33, 138, spWallMat);
        const shuttle = new THREE.Group();
        // Main body
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.20, 1.60, 10), whiteMat);
        body.rotation.z = Math.PI / 2; shuttle.add(body);
        // Nose cone
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.50, 10), whiteMat);
        nose.rotation.z = -Math.PI / 2; nose.position.set(1.05, 0, 0); shuttle.add(nose);
        // Tail
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.60, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.20, metalness: 0.90 }));
        tail.position.set(-0.70, 0.30, 0); shuttle.add(tail);
        // Wings (delta shape)
        [-1, 1].forEach(side => {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.06, 0.48), whiteMat);
          wing.rotation.z = side * 0.18;
          wing.position.set(-0.24, -0.04 * side, side * 0.32); shuttle.add(wing);
        });
        // Engine nozzles
        [-0.14, 0, 0.14].forEach(nz => {
          const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8),
            new THREE.MeshStandardMaterial({ color: 0x888080, roughness: 0.28, metalness: 0.88 }));
          nozzle.rotation.z = Math.PI / 2; nozzle.position.set(-0.90, 0, nz); shuttle.add(nozzle);
        });
        // Cockpit windows
        const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.10, 7, 6),
          new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.04, metalness: 0.12, transparent: true, opacity: 0.70, emissive: 0x224466, emissiveIntensity: 0.30 }));
        cockpit.scale.set(1.0, 0.70, 0.80); cockpit.position.set(0.82, 0.14, 0); shuttle.add(cockpit);
        shuttle.position.set(100, 1.34, 138); shuttle.rotation.y = Math.PI / 4;
        scene.add(shuttle); addWallAABB(100, 138, 1.8, 1.8); }

      // ── Astronaut suit on pedestal ────────────────────────────────────────
      { box(scene, 0.9, 0.06, 0.9, 80, 0.03, 138, spWallMat);
        box(scene, 0.7, 1.00, 0.7, 80, 0.53, 138, spWallMat);
        const astro = new THREE.Group();
        // Torso (EMU suit)
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.36), whiteMat);
        torso.position.y = 0; astro.add(torso);
        // Life support backpack
        const lssb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.52, 0.18),
          new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.28, metalness: 0.55 }));
        lssb.position.set(0, 0, -0.26); astro.add(lssb);
        // Legs
        [-0.12, 0.12].forEach(lx => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.72, 0.26), whiteMat);
          leg.position.set(lx, -0.72, 0); astro.add(leg);
          const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.34),
            new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.45, metalness: 0.20 }));
          boot.position.set(lx, -1.12, 0.04); astro.add(boot);
        });
        // Arms
        [-0.34, 0.34].forEach(ax => {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.60, 0.22), whiteMat);
          arm.rotation.z = ax > 0 ? 0.22 : -0.22;
          arm.position.set(ax, -0.08, 0); astro.add(arm);
          const glove = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.22, 0.24),
            new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.40, metalness: 0.30 }));
          glove.position.set(ax * 1.12, -0.42, 0); astro.add(glove);
        });
        // Helmet
        const helmBall = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), whiteMat);
        helmBall.position.y = 0.56; astro.add(helmBall);
        // Gold visor
        const goldVisorMat = new THREE.MeshStandardMaterial({
          color: 0xd4a820, roughness: 0.06, metalness: 0.92, emissive: 0x6a4400, emissiveIntensity: 0.22,
          transparent: true, opacity: 0.80,
        });
        const visorSh = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), goldVisorMat);
        visorSh.scale.set(1.0, 0.70, 0.55); visorSh.position.set(0.08, 0.54, 0.18); astro.add(visorSh);
        astro.position.set(80, 1.78, 138); scene.add(astro); addWallAABB(80, 138, 1.1, 1.1); }

      // ── Stealable: Moon Rock Sample ───────────────────────────────────────
      { displayCase(scene, 84, 125);
        const rock = new THREE.Group();
        const rockBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6),
          new THREE.MeshStandardMaterial({ color: 0x888078, roughness: 0.96, metalness: 0.02 }));
        rockBody.scale.set(1.2, 0.85, 1.0); rock.add(rockBody);
        // Small crystals on surface (emissive glow)
        [[0.08, 0.10, 0.06],[-0.06, 0.12,-0.08],[0.12, 0.02,-0.06]].forEach(([cx, cy, cz]) => {
          const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.030),
            new THREE.MeshStandardMaterial({ color: 0xccddff, emissive: 0x8899ff, emissiveIntensity: 0.55, roughness: 0.04 }));
          crystal.position.set(cx, cy, cz); rock.add(crystal);
        });
        rock.position.set(84, 1.72, 125);
        rock.userData.float = true; scene.add(rock);
        const rkRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0x8888ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
        rkRing.rotation.x = -Math.PI / 2; rkRing.position.set(84, 0.02, 125); scene.add(rkRing);
        rock.userData.floorRing = rkRing;
        stealables.push({ mesh: rock, item: 'moonRock', x: 84, z: 125, taken: false, bonus: true, label: 'Moon Rock Sample', value: 28000000, hasCase: true, caseBroken: false }); }

      // Stealable: Astronaut Helmet
      { box(scene, 0.7, 0.06, 0.7, 93, 0.03, 142, spWallMat);
        box(scene, 0.5, 0.80, 0.5, 93, 0.43, 142, spWallMat);
        const aHelm = new THREE.Group();
        const aHelmBall = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), whiteMat);
        aHelm.add(aHelmBall);
        const goldVisorMat2 = new THREE.MeshStandardMaterial({ color: 0xd4a820, roughness: 0.06, metalness: 0.92, emissive: 0x6a4400, emissiveIntensity: 0.22, transparent: true, opacity: 0.80 });
        const aVisor = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), goldVisorMat2);
        aVisor.scale.set(1, 0.70, 0.55); aVisor.position.set(0.08, 0, 0.20);
        aHelm.add(aVisor);
        aHelm.position.set(93, 1.62, 142);
        aHelm.userData.float = true; scene.add(aHelm);
        const ahRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.44, 24),
          new THREE.MeshBasicMaterial({ color: 0xaaaaff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
        ahRing.rotation.x = -Math.PI / 2; ahRing.position.set(93, 0.02, 142); scene.add(ahRing);
        aHelm.userData.floorRing = ahRing;
        stealables.push({ mesh: aHelm, item: 'astroHelmet', x: 93, z: 142, taken: false, bonus: true, label: 'Astronaut Helmet', value: 38000000 }); }

      // ── Star field decorations on walls ───────────────────────────────────
      // Emissive star dots scattered on east and south/north walls
      { const starGlowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.0 });
        const bigStarMat  = new THREE.MeshStandardMaterial({ color: 0xffd0a0, emissive: 0xffd0a0, emissiveIntensity: 1.4, roughness: 0.0 });
        // Stars on east wall (X=108)
        [[107.9,2.5,116],[107.9,4.2,119],[107.9,3.1,123],[107.9,5.0,128],[107.9,2.2,131],
         [107.9,4.5,136],[107.9,3.6,140],[107.9,1.8,143]].forEach(([wx,wy,wz]) => {
          const sz = 0.030 + Math.random() * 0.040;
          const sm = Math.random() > 0.7 ? bigStarMat : starGlowMat;
          const star = new THREE.Mesh(new THREE.SphereGeometry(sz, 4, 3), sm);
          star.position.set(wx, wy, wz); scene.add(star);
        });
        // Stars on south wall (Z=113)
        [[76,3.2,113.1],[82,4.8,113.1],[89,2.6,113.1],[96,4.0,113.1],[104,3.5,113.1]].forEach(([wx,wy,wz]) => {
          const sz = 0.025 + Math.random() * 0.035;
          const star = new THREE.Mesh(new THREE.SphereGeometry(sz, 4, 3), starGlowMat);
          star.position.set(wx, wy, wz); scene.add(star);
        }); }

      // ── Additional planets ────────────────────────────────────────────────

      // Venus (pale yellow, thick cloud cover)
      { const venus = new THREE.Mesh(new THREE.SphereGeometry(0.88, 14, 12),
          new THREE.MeshStandardMaterial({ color: 0xe8d890, roughness: 0.50, metalness: 0.0, emissive: 0x6a5000, emissiveIntensity: 0.14 }));
        // Cloud layer
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(0.92, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xfffacc, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.55 }));
        const venusG = new THREE.Group(); venusG.add(venus); venusG.add(clouds);
        box(scene, 0.02, 1.70, 0.02, 76, 4.78, 132, titaniumMat);
        venusG.scale.set(1.4, 1.4, 1.4);
        venusG.position.set(76, 3.22, 132); venusG.userData.float = true; scene.add(venusG); }

      // Mercury (small, cratered, grey)
      { const mercury = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.96, metalness: 0.0 }));
        // Craters
        [[-0.14, 0.18, 0.18],[0.20, -0.10, 0.14],[-0.08, -0.20, 0.10]].forEach(([cx, cy, cz]) => {
          const cr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4),
            new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.98, metalness: 0.0 }));
          cr.scale.z = 0.28; cr.position.set(cx, cy, cz + 0.24); mercury.add(cr);
        });
        box(scene, 0.02, 1.30, 0.02, 104, 4.78, 130, titaniumMat);
        mercury.scale.set(1.6, 1.6, 1.6);
        mercury.position.set(104, 3.60, 130); mercury.userData.float = true; scene.add(mercury); }

      // Uranus (ice blue, heavily tilted ring system)
      { const uranus = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0x88ccdd, roughness: 0.55, metalness: 0.0, emissive: 0x082838, emissiveIntensity: 0.16 }));
        const uRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 4, 22),
          new THREE.MeshStandardMaterial({ color: 0x99ddee, roughness: 0.50, metalness: 0.0, transparent: true, opacity: 0.60 }));
        uRing1.rotation.x = Math.PI * 0.42;  // nearly vertical tilt
        const uRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.05, 4, 22),
          new THREE.MeshStandardMaterial({ color: 0x77bbcc, roughness: 0.55, metalness: 0.0, transparent: true, opacity: 0.40 }));
        uRing2.rotation.x = Math.PI * 0.42;
        const uranusG = new THREE.Group(); uranusG.add(uranus); uranusG.add(uRing1); uranusG.add(uRing2);
        box(scene, 0.02, 1.85, 0.02, 98, 4.72, 140, titaniumMat);
        uranusG.scale.set(1.4, 1.4, 1.4);
        uranusG.position.set(98, 3.04, 140); uranusG.userData.float = true; scene.add(uranusG); }

      // Pluto (tiny, brownish-grey, heart marking)
      { const pluto = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7),
          new THREE.MeshStandardMaterial({ color: 0x9c8870, roughness: 0.94, metalness: 0.0 }));
        // Tombaugh Regio (heart-shaped pale patch — simplified as a lighter sphere cap)
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6),
          new THREE.MeshStandardMaterial({ color: 0xe0d0c0, roughness: 0.90, metalness: 0.0, transparent: true, opacity: 0.70 }));
        heart.scale.set(0.7, 0.55, 0.28); heart.position.set(0, 0, 0.18); pluto.add(heart);
        box(scene, 0.02, 1.24, 0.02, 105, 4.78, 143, titaniumMat);
        pluto.scale.set(1.8, 1.8, 1.8);
        pluto.position.set(105, 3.66, 143); pluto.userData.float = true; scene.add(pluto); }

      // Comet (elongated icy body with glowing tail)
      { const cometMat = new THREE.MeshStandardMaterial({ color: 0xd0e8f0, roughness: 0.60, metalness: 0.08, emissive: 0x446688, emissiveIntensity: 0.22 });
        const tailMat  = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.30, metalness: 0.0, transparent: true, opacity: 0.45 });
        const cometG = new THREE.Group();
        // Nucleus (elongated icy rock)
        const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), cometMat);
        nucleus.scale.set(2.2, 0.70, 0.70); cometG.add(nucleus);
        // Ion tail (3 tapered cones streaming behind)
        [0, 0.12, -0.12].forEach(tz => {
          const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.80, 6), tailMat);
          tail.rotation.z = -Math.PI / 2; tail.position.set(-1.10, 0, tz); cometG.add(tail);
        });
        // Dust coma (hazy sphere around nucleus)
        const coma = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xaaddff, roughness: 0.20, metalness: 0.0, transparent: true, opacity: 0.22 }));
        cometG.add(coma);
        box(scene, 0.02, 1.52, 0.02, 103, 4.80, 115, titaniumMat);
        cometG.position.set(103, 3.40, 115); cometG.rotation.y = -0.40;
        cometG.userData.float = true; scene.add(cometG); }

      // ── Vent in Space Room ────────────────────────────────────────────────
      makeVentGrate(63.5, 129);   // hallway side
      makeVentGrate(89, 129);     // room side
      vents.push({ entryX: 63.5, entryZ: 129, exitX: 89, exitZ: 129 });
      vents.push({ entryX: 89,   entryZ: 129, exitX: 63.5, exitZ: 129 });

      // ── Security camera ───────────────────────────────────────────────────
      cameraData.push({ x: 100, y: WALL_H - 0.3, z: 144.8, sweepAngle: Math.PI / 2.2, facingZ: -1 });

      // ── Guard patrol ──────────────────────────────────────────────────────
      guardData.push({
        spawnX: 89, spawnZ: 129,
        waypoints: _route(
          [new THREE.Vector3(78,0,115), new THREE.Vector3(106,0,115), new THREE.Vector3(106,0,143), new THREE.Vector3(78,0,143)],
          [new THREE.Vector3(78,0,115), new THREE.Vector3(106,0,118), new THREE.Vector3(106,0,143), new THREE.Vector3(78,0,140)],
          [new THREE.Vector3(76,0,114), new THREE.Vector3(106,0,114), new THREE.Vector3(106,0,144), new THREE.Vector3(76,0,144)]
        ),
      });

    } // end Space Room

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
      skylightHatch,
    };
  }

  return { init };

}());
