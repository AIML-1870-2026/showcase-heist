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

  const _tileTex        = makeMarbleTex();
  const _galleryFloorTex = makeGalleryFloorTex();
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
    floor:        new THREE.MeshStandardMaterial({ map: _tileTex,         roughness: 0.22, metalness: 0.04 }),
    galleryFloor: new THREE.MeshStandardMaterial({ map: _galleryFloorTex, roughness: 0.20, metalness: 0.06 }),
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
    // Dr. Harnoor Dhaliwal, PhD — Executive Director, Scott Scholars, UNO
    harnoor: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('assets/paintings/harnoor.jpg'),
      roughness: 0.88, metalness: 0.0,
    }),
    // Jon Smail — Assistant Director, Scott Scholars, UNO
    jon: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('assets/paintings/jon.jpg'),
      roughness: 0.88, metalness: 0.0,
    }),
    // Kaitlyn Baysa — Design Studio Program Coordinator, Scott Scholars, UNO
    kaitlyn: new THREE.MeshStandardMaterial({
      map: loadPaintingTex('assets/paintings/kaitlyn.jpg'),
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
    box(scene, w, FLOOR_T, d, cx, WALL_H + FLOOR_T / 2, cz, mat);
    // Recessed ceiling panel strip (thin dark inset frame)
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1028, roughness: 0.95, metalness: 0.0 });
    box(scene, w - 0.6, 0.05, d - 0.6, cx, WALL_H - 0.02, cz, panelMat);
  }

  // Full room shell: floor + ceiling + 4 walls with opening gap
  // Openings (door slots) are left by NOT drawing that full wall segment —
  // instead two partial segments are drawn, leaving a 3-unit door gap.
  function roomWalls(scene, cx, cz, rw, rd, openings, wallMat, floorMat, ceilMat) {
    openings = openings || {};

    // South wall (−Z face)
    if (!openings.south) {
      wall(scene, cx, cz - rd / 2, rw, WALL_T, wallMat);
    }
    // North wall (+Z face)
    if (!openings.north) {
      wall(scene, cx, cz + rd / 2, rw, WALL_T, wallMat);
    } else {
      // Two stubs flanking the door gap (3 units wide centered)
      const stub = (rw - 3) / 2;
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
    // Glass vitrine
    box(scene, 1.0,  1.20, 1.0,  x, 1.40, z, M.glass);
    // Slim metal corner posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0xb87820, roughness: 0.22, metalness: 0.88 });
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
  function lorTree(scene, x, z) {
    const urnMat   = new THREE.MeshStandardMaterial({ color: 0x8c9090, roughness: 0.72, metalness: 0.08 });
    const goldRim  = new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.28, metalness: 0.75, emissive: 0x806418, emissiveIntensity: 0.20 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.88, metalness: 0.0  });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2a5518, roughness: 0.80, metalness: 0.0,  emissive: 0x0a1a06, emissiveIntensity: 0.15 });
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.55, 12), urnMat);
    urn.position.set(x, 0.275, z); urn.castShadow = true; scene.add(urn);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 20), goldRim);
    rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.55, z); scene.add(rim);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.8, 7), trunkMat);
    trunk.position.set(x, 1.45, z); trunk.castShadow = true; scene.add(trunk);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.68, 9, 7), leafMat);
    ball.position.set(x, 3.08, z); ball.castShadow = true; scene.add(ball);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), leafMat);
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

    // Lobby west wall with 3-unit service exit gap at Z=15
    // Full west wall: X=-20, Z 0→40 (length 40, centre Z=20)
    // Gap at Z 13.5→16.5 (3 units), so stubs: Z 0→13.5 (len 13.5, ctr 6.75) and Z 16.5→40 (len 23.5, ctr 28.25)
    wall(scene, -20,  6.75, WALL_T, 13.5);   // south stub
    wall(scene, -20, 28.25, WALL_T, 23.5);   // north stub

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
    placard(scene, -15, 2.6, 39.65, 'The Raft of the Medusa', 'Théodore Géricault, 1818', false);
    wallPaintingNS(scene,  15, 3.5, 39.65, M.paintings[2], false);
    paintingSpotlight(scene,  15, 3.5, 39.65, 'north');
    placard(scene,  15, 2.6, 39.65, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', false);

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
    placard(scene, -19.9, 2.6, 11, 'Sunflowers', 'Vincent van Gogh, 1888', true);
    wallPainting(scene, -19.9, 3.5, 20, M.monetSunrise, true);
    paintingSpotlight(scene, -19.9, 3.5, 20, 'west');
    placard(scene, -19.9, 2.6, 20, 'Impression, Sunrise', 'Claude Monet, 1872', true);
    wallPainting(scene, -19.9, 3.5, 34, M.cezanne, true);
    paintingSpotlight(scene, -19.9, 3.5, 34, 'west');
    placard(scene, -19.9, 2.6, 34, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', true);
    // Extra lobby paintings — east wall
    wallPainting(scene, 19.9, 3.5, 10, M.vangoghStarry, false);
    paintingSpotlight(scene, 19.9, 3.5, 10, 'east');
    placard(scene, 19.9, 2.6, 10, 'The Starry Night', 'Vincent van Gogh, 1889', false);
    wallPainting(scene, 19.9, 3.5, 22, M.renoir, false);
    paintingSpotlight(scene, 19.9, 3.5, 22, 'east');
    placard(scene, 19.9, 2.6, 22, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', false);
    wallPainting(scene, 19.9, 3.5, 36, M.monetPoppies, false);
    paintingSpotlight(scene, 19.9, 3.5, 36, 'east');
    placard(scene, 19.9, 2.6, 36, 'Poppies', 'Claude Monet, 1873', false);
    // Extra lobby paintings — south wall (entrance wall stubs)
    wallPaintingNS(scene, -16, 3.5, 0.10, M.vangoghIrises, true);
    paintingSpotlight(scene, -16, 3.5, 0.10, 'south');
    placard(scene, -16, 2.6, 0.10, 'Irises', 'Vincent van Gogh, 1889', true);
    wallPaintingNS(scene,  16, 3.5, 0.10, M.monetSunrise, true);
    paintingSpotlight(scene,  16, 3.5, 0.10, 'south');
    placard(scene,  16, 2.6, 0.10, 'Impression, Sunrise', 'Claude Monet, 1872', true);
    // Extra lobby paintings — north wall stubs
    wallPaintingNS(scene, -8, 3.5, 39.65, M.vangoghStarry, false);
    paintingSpotlight(scene, -8, 3.5, 39.65, 'north');
    placard(scene, -8, 2.6, 39.65, 'The Starry Night', 'Vincent van Gogh, 1889', false);
    wallPaintingNS(scene,  8, 3.5, 39.65, M.vangoghSunflowers, false);
    paintingSpotlight(scene,  8, 3.5, 39.65, 'north');
    placard(scene,  8, 2.6, 39.65, 'Sunflowers', 'Vincent van Gogh, 1888', false);
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

    // ── FEATURE 8: Service Exit (west Lobby wall at X=-20, Z=15) ────────────
    // The west wall already runs the full height. We need a gap for the door.
    // The lobby west wall is at X=-20, Z=-11 (exterior section) and the interior
    // is covered by roomWalls(). We add a door mesh and an EXIT sign.
    door(scene, -20, 15, null, Math.PI / 2);
    // Glowing EXIT sign above the service exit
    {
      const exitSignMat = new THREE.MeshStandardMaterial({
        color: 0x00ff55, emissive: 0x00ff55, emissiveIntensity: 2.0,
        roughness: 0.3,
      });
      box(scene, 0.08, 0.35, 1.5, -19.92, WALL_H - 0.45, 15, exitSignMat);
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

    // ════════════════════════════════
    //  GALLERY  cx=0  cz=77.5  50×45
    // ════════════════════════════════
    // Skip south/east/west walls — replace with stubs so corridor + side room openings work
    roomWalls(scene, 0, 77.5, 50, 45, { south: true, north: true, east: true, west: true }, M.galleryWall, M.galleryFloor, M.galleryCeil);

    // Gallery south wall stubs — 10-unit gap at X=0 matching corridor width (Z=55)
    wall(scene, -15, 55, 20, WALL_T, M.galleryWall);  // west stub: X -25→-5
    wall(scene,  15, 55, 20, WALL_T, M.galleryWall);  // east stub: X +5→+25

    // Gallery east wall stubs — 3-unit gap at Z=77 leading to the Salon des Antiquités
    // South stub: Z 55→75.5  (length 20.5, centre 65.25)
    wall(scene, 25, 65.25, WALL_T, 20.5, M.galleryWall);
    // North stub: Z 78.5→100  (length 21.5, centre 89.25)
    wall(scene, 25, 89.25, WALL_T, 21.5, M.galleryWall);

    // Gallery west wall stubs — 3-unit gap at Z=77 leading to the Galerie des Sculptures
    //   and additional 3-unit gap at Z=64 leading to the Power Breaker Room (Feature 7)
    // South section: Z 55→62.5 (length 7.5, centre 58.75) — solid, south of breaker door
    wall(scene, -25, 58.75, WALL_T, 7.5, M.galleryWall);
    // Middle stub: Z 65.5→75.5 (length 10, centre 70.5) — between breaker gap and Galerie gap
    wall(scene, -25, 70.5, WALL_T, 10, M.galleryWall);
    // North stub: Z 78.5→100  (length 21.5, centre 89.25)
    wall(scene, -25, 89.25, WALL_T, 21.5, M.galleryWall);

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
    stealables.push({ mesh: jadeFig, item: 'jade', x: 0, z: 88, taken: false, bonus: true, label: 'Jade Figurine', value: 2000000, hasCase: true, caseBroken: false });
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
    // Scott Scholars portraits — south gallery entrance wall, visible as players enter
    wallPaintingNS(scene,  21, 3.5, 55.10, M.harnoor, true);
    paintingSpotlight(scene,  21, 3.5, 55.10, 'south');
    wallPaintingNS(scene,   8, 3.5, 55.10, M.jon, true);
    paintingSpotlight(scene,   8, 3.5, 55.10, 'south');
    wallPaintingNS(scene, -21, 3.5, 55.10, M.kaitlyn, true);
    paintingSpotlight(scene, -21, 3.5, 55.10, 'south');

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
    placard(scene, -24.9, 2.6, 82, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', true);
    wallPainting(scene, -24.9, 3.5, 60, M.paintings[4], true);
    paintingSpotlight(scene, -24.9, 3.5, 60, 'west');
    placard(scene, -24.9, 2.6, 60, 'Wedding at Cana', 'Paolo Veronese, 1563', true);
    wallPainting(scene,  24.9, 3.5, 70, M.paintings[3], false);
    paintingSpotlight(scene,  24.9, 3.5, 70, 'east');
    placard(scene,  24.9, 2.6, 70, 'Oath of the Horatii', 'Jacques-Louis David, 1784', false);
    wallPainting(scene,  24.9, 3.5, 90, M.paintings[4], false);
    paintingSpotlight(scene,  24.9, 3.5, 90, 'east');
    placard(scene,  24.9, 2.6, 90, 'Wedding at Cana', 'Paolo Veronese, 1563', false);

    // Paintings on gallery north-wall stubs (flanking blue door), facing south
    wallPaintingNS(scene, -15, 3.5, 99.65, M.paintings[3], false);
    paintingSpotlight(scene, -15, 3.5, 99.65, 'north');
    placard(scene, -15, 2.6, 99.65, 'Oath of the Horatii', 'Jacques-Louis David, 1784', false);
    wallPaintingNS(scene,  15, 3.5, 99.65, M.paintings[0], false);
    paintingSpotlight(scene,  15, 3.5, 99.65, 'north');
    placard(scene,  15, 2.6, 99.65, 'Liberty Leading the People', 'Eugène Delacroix, 1830', false);

    // Extra gallery paintings — west wall (between existing)
    // Z=64 was inside the breaker-room doorway gap (Z=62.5→65.5), moved to Z=67
    wallPainting(scene, -24.9, 3.5, 67, M.vangoghStarry, true);
    paintingSpotlight(scene, -24.9, 3.5, 67, 'west');
    placard(scene, -24.9, 2.6, 67, 'The Starry Night', 'Vincent van Gogh, 1889', true);
    // Z=76 was inside the Galerie gap (Z=75.5→78.5), moved to Z=73
    wallPainting(scene, -24.9, 3.5, 73, M.vangoghIrises, true);
    paintingSpotlight(scene, -24.9, 3.5, 73, 'west');
    placard(scene, -24.9, 2.6, 73, 'Irises', 'Vincent van Gogh, 1889', true);
    wallPainting(scene, -24.9, 3.5, 86, M.monetSunrise, true);
    paintingSpotlight(scene, -24.9, 3.5, 86, 'west');
    placard(scene, -24.9, 2.6, 86, 'Impression, Sunrise', 'Claude Monet, 1872', true);
    wallPainting(scene, -24.9, 3.5, 96, M.monetPoppies, true);
    paintingSpotlight(scene, -24.9, 3.5, 96, 'west');
    placard(scene, -24.9, 2.6, 96, 'Poppies', 'Claude Monet, 1873', true);
    // Extra gallery paintings — east wall (between existing)
    wallPainting(scene,  24.9, 3.5, 65, M.vangoghSunflowers, false);
    paintingSpotlight(scene,  24.9, 3.5, 65, 'east');
    placard(scene,  24.9, 2.6, 65, 'Sunflowers', 'Vincent van Gogh, 1888', false);
    wallPainting(scene,  24.9, 3.5, 73, M.renoir, false);  // moved from 75 — frame at Z=75 clipped into Salon entrance gap (Z=75.5→78.5)
    paintingSpotlight(scene,  24.9, 3.5, 73, 'east');
    placard(scene,  24.9, 2.6, 73, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', false);
    wallPainting(scene,  24.9, 3.5, 85, M.cezanne, false);
    paintingSpotlight(scene,  24.9, 3.5, 85, 'east');
    placard(scene,  24.9, 2.6, 85, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', false);
    wallPainting(scene,  24.9, 3.5, 95, M.vangoghIrises, false);
    paintingSpotlight(scene,  24.9, 3.5, 95, 'east');
    placard(scene,  24.9, 2.6, 95, 'Irises', 'Vincent van Gogh, 1889', false);
    // (Extra gallery south wall paintings removed — too close to entrance)
    // Extra gallery north wall
    wallPaintingNS(scene, -8, 3.5, 99.65, M.renoir, false);
    paintingSpotlight(scene, -8, 3.5, 99.65, 'north');
    placard(scene, -8, 2.6, 99.65, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', false);
    wallPaintingNS(scene,  8, 3.5, 99.65, M.cezanne, false);
    paintingSpotlight(scene,  8, 3.5, 99.65, 'north');
    placard(scene,  8, 2.6, 99.65, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', false);
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
    placard(scene, 49.9, 2.6, 75, 'The Starry Night', 'Vincent van Gogh, 1889', false);
    wallPainting(scene, 49.9, 3.5, 79, M.monetPoppies, false);
    paintingSpotlight(scene, 49.9, 3.5, 79, 'east');
    placard(scene, 49.9, 2.6, 79, 'Poppies', 'Claude Monet, 1873', false);
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
    wallPainting(scene, -49.9, 3.5, 77, M.monet, true);
    paintingSpotlight(scene, -49.9, 3.5, 77, 'west');
    const monetMesh = box(scene, 0.05, 1.4, 2.1, -49.75, 3.5, 77, M.monet);
    stealables.push({ mesh: monetMesh, item: 'monet', x: -49.9, z: 77, taken: false, bonus: true, label: 'Les Nymphéas', value: 40000000 });
    { const mRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.05, 32),
        new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
      mRing.rotation.x = -Math.PI / 2; mRing.position.set(-49.5, 0.02, 77); scene.add(mRing);
      monetMesh.userData.floorRing = mRing; }
    placard(scene, -49.9, 2.6, 77, 'Les Nymphéas', 'Claude Monet, c. 1906', true);

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

    // ════════════════════════════════
    //  CORRIDOR 2  cx=0  cz=107.5  10×15
    //  Maintenance / service passage
    // ════════════════════════════════
    floor(scene, 0, 107.5, 10, 15);
    ceiling(scene, 0, 107.5, 10, 15);
    wall(scene, -5, 107.5, WALL_T, 15, M.corridorWall);
    wall(scene,  5, 107.5, WALL_T, 15, M.corridorWall);

    // Corridor 2 paintings on north/south walls
    wallPaintingNS(scene, 0, 3.5, 100.35, M.cezanne, true);
    paintingSpotlight(scene, 0, 3.5, 100.35, 'south');
    wallPaintingNS(scene, 0, 3.5, 114.65, M.monetPoppies, false);
    paintingSpotlight(scene, 0, 3.5, 114.65, 'north');
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

    // ════════════════════════════════
    //  CROWN VAULT  cx=0  cz=137.5  50×45
    // ════════════════════════════════
    // Skip south and north walls — add stubs manually so corridor/exit connect properly
    roomWalls(scene, 0, 137.5, 50, 45, { south: true, north: true }, M.vaultWall, null, M.vaultCeil);

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
    placard(scene, -24.9, 2.6, 137, 'Coronation of Napoleon', 'Jacques-Louis David, 1807', true);
    wallPainting(scene,  24.9, 3.5, 143, M.paintings[4], false);
    paintingSpotlight(scene,  24.9, 3.5, 143, 'east');
    placard(scene,  24.9, 2.6, 143, 'Wedding at Cana', 'Paolo Veronese, 1563', false);

    // Paintings on vault north wall stubs (facing south, visible from inside vault)
    wallPaintingNS(scene, -12, 3.5, 159.65, M.paintings[1], false);
    paintingSpotlight(scene, -12, 3.5, 159.65, 'north');
    placard(scene, -12, 2.6, 159.65, 'The Raft of the Medusa', 'Théodore Géricault, 1818', false);
    wallPaintingNS(scene,  12, 3.5, 159.65, M.paintings[3], false);
    paintingSpotlight(scene,  12, 3.5, 159.65, 'north');
    placard(scene,  12, 2.6, 159.65, 'Oath of the Horatii', 'Jacques-Louis David, 1784', false);

    // Extra vault paintings — west wall
    wallPainting(scene, -24.9, 3.5, 120, M.vangoghStarry, true);
    paintingSpotlight(scene, -24.9, 3.5, 120, 'west');
    placard(scene, -24.9, 2.6, 120, 'The Starry Night', 'Vincent van Gogh, 1889', true);
    wallPainting(scene, -24.9, 3.5, 131, M.monetSunrise, true);
    paintingSpotlight(scene, -24.9, 3.5, 131, 'west');
    placard(scene, -24.9, 2.6, 131, 'Impression, Sunrise', 'Claude Monet, 1872', true);
    wallPainting(scene, -24.9, 3.5, 143, M.vangoghSunflowers, true);
    paintingSpotlight(scene, -24.9, 3.5, 143, 'west');
    placard(scene, -24.9, 2.6, 143, 'Sunflowers', 'Vincent van Gogh, 1888', true);
    wallPainting(scene, -24.9, 3.5, 157, M.vangoghIrises, true);
    paintingSpotlight(scene, -24.9, 3.5, 157, 'west');
    placard(scene, -24.9, 2.6, 157, 'Irises', 'Vincent van Gogh, 1889', true);
    // Extra vault paintings — east wall
    wallPainting(scene,  24.9, 3.5, 120, M.renoir, false);
    paintingSpotlight(scene,  24.9, 3.5, 120, 'east');
    placard(scene,  24.9, 2.6, 120, 'Luncheon of the Boating Party', 'Pierre-Auguste Renoir, 1881', false);
    wallPainting(scene,  24.9, 3.5, 136, M.cezanne, false);
    paintingSpotlight(scene,  24.9, 3.5, 136, 'east');
    placard(scene,  24.9, 2.6, 136, 'Mont Sainte-Victoire', 'Paul Cézanne, 1887', false);
    wallPainting(scene,  24.9, 3.5, 148, M.monetPoppies, false);
    paintingSpotlight(scene,  24.9, 3.5, 148, 'east');
    placard(scene,  24.9, 2.6, 148, 'Poppies', 'Claude Monet, 1873', false);
    wallPainting(scene,  24.9, 3.5, 157, M.vangoghStarry, false);
    paintingSpotlight(scene,  24.9, 3.5, 157, 'east');
    placard(scene,  24.9, 2.6, 157, 'The Starry Night', 'Vincent van Gogh, 1889', false);
    // Vault south wall paintings (on stubs flanking corridor entrance)
    wallPaintingNS(scene, -15, 3.5, 115.10, M.vangoghSunflowers, true);
    paintingSpotlight(scene, -15, 3.5, 115.10, 'south');
    placard(scene, -15, 2.6, 115.10, 'Sunflowers', 'Vincent van Gogh, 1888', true);
    wallPaintingNS(scene,  15, 3.5, 115.10, M.monetSunrise, true);
    paintingSpotlight(scene,  15, 3.5, 115.10, 'south');
    placard(scene,  15, 2.6, 115.10, 'Impression, Sunrise', 'Claude Monet, 1872', true);
    // Vault north wall extra
    wallPaintingNS(scene, -6, 3.5, 159.65, M.cezanne, false);
    paintingSpotlight(scene, -6, 3.5, 159.65, 'north');
    wallPaintingNS(scene,  6, 3.5, 159.65, M.renoir, false);
    paintingSpotlight(scene,  6, 3.5, 159.65, 'north');
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
