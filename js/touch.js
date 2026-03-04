'use strict';
// ── touch.js ───────────────────────────────────────────────
// Virtual joystick + action buttons for touch/mobile devices.
// Injects DOM, handles touch events, drives Player.simulateKey().
// Only activates on touch-capable devices.

window.Touch = (function () {

  if (!('ontouchstart' in window) && navigator.maxTouchPoints < 1) {
    return { init() {} };
  }

  // ── Build overlay DOM ──────────────────────────────────
  function buildUI() {
    const overlay = document.createElement('div');
    overlay.id = 'touch-overlay';
    overlay.innerHTML = `
      <div id="joystick-zone">
        <div id="joystick-base"><div id="joystick-stick"></div></div>
      </div>
      <div id="touch-buttons">
        <div class="touch-row">
          <button class="tch-btn" data-key="KeyR"      id="tch-sprint">RUN</button>
          <button class="tch-btn" data-key="Space"     id="tch-jump">JUMP</button>
        </div>
        <div class="touch-row">
          <button class="tch-btn" data-key="ShiftLeft" id="tch-crouch">CROUCH</button>
          <button class="tch-btn" data-key="KeyE"      id="tch-action">USE</button>
          <button class="tch-btn" data-key="KeyQ"      id="tch-distract">DIST</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  // ── Joystick logic ─────────────────────────────────────
  const DEAD = 10;   // px dead-zone radius
  const MAX  = 48;   // px max stick travel

  let joyActive  = false;
  let joyOriginX = 0;
  let joyOriginY = 0;
  let joyTouchId = null;

  function updateJoy(dx, dy) {
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const clamX = dist > MAX ? (dx / dist) * MAX : dx;
    const clamY = dist > MAX ? (dy / dist) * MAX : dy;

    document.getElementById('joystick-stick').style.transform =
      `translate(calc(-50% + ${clamX}px), calc(-50% + ${clamY}px))`;

    // Map to WASD keys based on angle + magnitude
    const active = dist > DEAD;
    const angle  = Math.atan2(dy, dx); // right=0, down=π/2

    Player.simulateKey('KeyW', active && angle > -Math.PI * 0.75 && angle < Math.PI * 0.25);
    Player.simulateKey('KeyS', active && (angle > Math.PI * 0.75 || angle < -Math.PI * 0.75));
    Player.simulateKey('KeyA', active && angle > -Math.PI * 1.0  && angle < -Math.PI * 0.25);
    Player.simulateKey('KeyD', active && angle > Math.PI * 0.25  && angle < Math.PI * 0.75);
  }

  function clearJoy() {
    document.getElementById('joystick-stick').style.transform = 'translate(-50%, -50%)';
    Player.simulateKey('KeyW', false);
    Player.simulateKey('KeyS', false);
    Player.simulateKey('KeyA', false);
    Player.simulateKey('KeyD', false);
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    const overlay = buildUI();
    const joyZone = document.getElementById('joystick-zone');

    // Joystick touch
    joyZone.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyTouchId = t.identifier;
      joyOriginX = t.clientX;
      joyOriginY = t.clientY;
      joyActive  = true;
    }, { passive: false });

    joyZone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) {
          updateJoy(t.clientX - joyOriginX, t.clientY - joyOriginY);
        }
      }
    }, { passive: false });

    joyZone.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) {
          joyActive  = false;
          joyTouchId = null;
          clearJoy();
        }
      }
    }, { passive: false });

    // Action buttons — simulate key hold on touchstart, release on touchend
    overlay.querySelectorAll('.tch-btn').forEach(btn => {
      const code = btn.dataset.key;
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.classList.add('pressed');
        Player.simulateKey(code, true);
        // Space/jump: also fire as keydown event for the jump handler
        if (code === 'Space') {
          const ev = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
          document.dispatchEvent(ev);
        }
        if (code === 'KeyE') {
          const ev = new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true });
          document.dispatchEvent(ev);
        }
        if (code === 'KeyQ') {
          const ev = new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true });
          document.dispatchEvent(ev);
        }
      }, { passive: false });
      btn.addEventListener('touchend', e => {
        e.preventDefault();
        btn.classList.remove('pressed');
        Player.simulateKey(code, false);
      }, { passive: false });
    });

    // Prevent default scroll / zoom on the overlay
    overlay.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  return { init };

}());
