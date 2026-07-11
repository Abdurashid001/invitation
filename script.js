/* =========================================================
   TAKLIFNOMA — script.js
   Modular vanilla JS. Each section below is self-contained
   and only talks to the others through small init() calls
   fired at the bottom of the file.
========================================================= */

(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =======================================================
     MODULE: DeviceGate
     Blocks the whole experience on screens under 1024px and
     keeps re-checking on resize/orientation change.
  ======================================================= */
  const DeviceGate = (() => {
    const BREAKPOINT = 1024;

    function isSmallScreen() {
      return window.innerWidth < BREAKPOINT;
    }

    function apply() {
      document.body.classList.toggle('is-blocked', isSmallScreen());
    }

    function init() {
      apply();
      window.addEventListener('resize', apply);
      window.addEventListener('orientationchange', apply);
    }

    return { init, isSmallScreen };
  })();

  /* =======================================================
     MODULE: AmbientCanvas
     Two lightweight canvases: slow rising hearts + twinkling
     sparkles. Pure requestAnimationFrame, no dependencies.
  ======================================================= */
  const AmbientCanvas = (() => {
    let heartsCanvas, sparkleCanvas, hctx, sctx;
    let hearts = [], sparkles = [];
    let rafId = null;
    let width = 0, height = 0;

    const HEART_COUNT = prefersReducedMotion ? 0 : 16;
    const SPARKLE_COUNT = prefersReducedMotion ? 0 : 40;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      [heartsCanvas, sparkleCanvas].forEach((c) => {
        c.width = width * devicePixelRatio;
        c.height = height * devicePixelRatio;
        c.style.width = width + 'px';
        c.style.height = height + 'px';
      });
      hctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      sctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function makeHeart() {
      return {
        x: Math.random() * width,
        y: height + Math.random() * height,
        size: 10 + Math.random() * 16,
        speed: 0.25 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.6,
        sway: Math.random() * Math.PI * 2,
        opacity: 0.15 + Math.random() * 0.35,
        hue: Math.random() > 0.5 ? '242,168,194' : '241,220,174',
      };
    }

    function makeSparkle() {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.03,
      };
    }

    function drawHeart(ctx, x, y, size, opacity, hue) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 20, size / 20);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-10, -4, -10, -12, 0, -12);
      ctx.bezierCurveTo(10, -12, 10, -4, 0, 6);
      ctx.closePath();
      ctx.fillStyle = `rgba(${hue}, ${opacity})`;
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      hctx.clearRect(0, 0, width, height);
      sctx.clearRect(0, 0, width, height);

      hearts.forEach((h) => {
        h.y -= h.speed;
        h.sway += 0.01;
        h.x += Math.sin(h.sway) * h.drift;
        if (h.y < -40) Object.assign(h, makeHeart(), { y: height + 40 });
        drawHeart(hctx, h.x, h.y, h.size, h.opacity, h.hue);
      });

      sparkles.forEach((s) => {
        s.phase += s.speed;
        const twinkle = (Math.sin(s.phase) + 1) / 2;
        sctx.beginPath();
        sctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        sctx.fillStyle = `rgba(255, 246, 235, ${0.15 + twinkle * 0.5})`;
        sctx.fill();
      });

      rafId = requestAnimationFrame(tick);
    }

    function init() {
      heartsCanvas = document.getElementById('heartsCanvas');
      sparkleCanvas = document.getElementById('sparkleCanvas');
      if (!heartsCanvas || !sparkleCanvas) return;

      hctx = heartsCanvas.getContext('2d');
      sctx = sparkleCanvas.getContext('2d');

      resize();
      hearts = Array.from({ length: HEART_COUNT }, makeHeart);
      sparkles = Array.from({ length: SPARKLE_COUNT }, makeSparkle);

      window.addEventListener('resize', resize);

      if (!prefersReducedMotion) {
        tick();
      }
    }

    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
    }

    return { init, stop };
  })();

  /* =======================================================
     MODULE: CursorTrail
     Leaves tiny fading heart glyphs as the mouse moves.
  ======================================================= */
  const CursorTrail = (() => {
    let layer;
    let lastSpawn = 0;
    const THROTTLE_MS = 60;
    const GLYPHS = ['💗', '💕', '♡'];

    function spawn(x, y) {
      const el = document.createElement('span');
      el.className = 'cursor-heart';
      el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      layer.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }

    function onMove(e) {
      const now = performance.now();
      if (now - lastSpawn < THROTTLE_MS) return;
      lastSpawn = now;
      spawn(e.clientX, e.clientY);
    }

    function init() {
      layer = document.getElementById('cursorLayer');
      if (!layer || prefersReducedMotion || DeviceGate.isSmallScreen()) return;
      window.addEventListener('mousemove', onMove);
    }

    return { init };
  })();

  /* =======================================================
     MODULE: MusicPlayer
     Never autoplays. Rather than hot-linking an external MP3
     (fragile — links rot, get blocked, or need a real host),
     this synthesizes a soft, looping romantic piano motif
     entirely in the browser with the Web Audio API. It only
     ever starts from a user click, so autoplay policies are
     satisfied automatically.
  ======================================================= */
  const MusicPlayer = (() => {
    let button, label, icon;
    let audioCtx = null;
    let masterGain = null;
    let isPlaying = false;
    let schedulerTimer = null;
    let nextNoteTime = 0;

    // A gentle C major / A minor progression, arpeggiated —
    // reads as warm and romantic rather than a full "song".
    const NOTE_FREQ = {
      C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
      A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
      G3: 196.00, A3: 220.00, E3: 164.81, C3: 130.81,
    };

    const PATTERN = [
      // [note, beat length in units of one eighth-note]
      ['C3', 4], ['G3', 4],
      ['C4', 1], ['E4', 1], ['G4', 1], ['E4', 1],
      ['A3', 4], ['E3', 4],
      ['C4', 1], ['E4', 1], ['A4', 1], ['E4', 1],
      ['F4', 4], ['C3', 4],
      ['A4', 1], ['F4', 1], ['C5', 1], ['A4', 1],
      ['G3', 4], ['D4', 4],
      ['G4', 1], ['B4', 1], ['D5', 1], ['B4', 1],
    ];

    const EIGHTH_NOTE_SECONDS = 0.34; // tempo of the arpeggio
    const SCHEDULE_AHEAD = 0.2;
    const LOOKAHEAD_MS = 60;

    let patternIndex = 0;

    function playNote(freq, startTime, duration) {
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Soft piano-like envelope: quick attack, slow release.
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(0.16, startTime + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    }

    function scheduler() {
      while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
        const [noteName, beats] = PATTERN[patternIndex];
        const freq = NOTE_FREQ[noteName];
        const duration = beats * EIGHTH_NOTE_SECONDS * 1.1;

        playNote(freq, nextNoteTime, duration);

        nextNoteTime += beats * EIGHTH_NOTE_SECONDS;
        patternIndex = (patternIndex + 1) % PATTERN.length;
      }

      schedulerTimer = window.setTimeout(scheduler, LOOKAHEAD_MS);
    }

    function buildAudioGraph() {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.5;

      // A short feedback delay gives the notes a soft, hall-like
      // "reverb" tail without needing an impulse-response file.
      const delay = audioCtx.createDelay();
      delay.delayTime.value = 0.32;

      const feedback = audioCtx.createGain();
      feedback.gain.value = 0.35;

      const delayFilter = audioCtx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 2200;

      masterGain.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delay);
      delay.connect(audioCtx.destination);

      masterGain.connect(audioCtx.destination);
    }

    function setUI(playing) {
      button.classList.toggle('is-playing', playing);
      button.setAttribute('aria-pressed', String(playing));
      label.textContent = playing ? 'Musiqani to\u2018xtatish' : 'Musiqani yoqish';
      icon.textContent = playing ? '🎶' : '🎵';
    }

    function start() {
      if (!audioCtx) buildAudioGraph();

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      patternIndex = 0;
      nextNoteTime = audioCtx.currentTime + 0.1;
      scheduler();

      isPlaying = true;
      setUI(true);
    }

    function stop() {
      if (schedulerTimer) window.clearTimeout(schedulerTimer);
      if (audioCtx) audioCtx.suspend();

      isPlaying = false;
      setUI(false);
    }

    function toggle() {
      if (isPlaying) {
        stop();
      } else {
        start();
      }
    }

    function init() {
      button = document.getElementById('musicToggle');
      if (!button) return;
      label = button.querySelector('.music-toggle__label');
      icon = button.querySelector('.music-toggle__icon');
      button.addEventListener('click', toggle);
    }

    return { init };
  })();

  /* =======================================================
     MODULE: EvasiveNoButton
     The "Yo'q" button can never be hovered successfully: the
     moment the pointer gets close it teleports to a fresh
     nearby spot and relabels itself as a gentle "Iltimos...".
  ======================================================= */
  const EvasiveNoButton = (() => {
    let btn, area;
    let hasEscapedOnce = false;

    function randomNearbyPosition(rect) {
      const margin = 24;
      const btnW = 190;
      const btnH = 58;

      // Try to land somewhere near the original area, but always
      // fully inside the viewport with a safe margin.
      const maxX = window.innerWidth - btnW - margin;
      const maxY = window.innerHeight - btnH - margin;

      const anchorX = rect.left + rect.width / 2;
      const anchorY = rect.top + rect.height / 2;

      const spread = 220;
      let x = anchorX + (Math.random() - 0.5) * spread * 2;
      let y = anchorY + (Math.random() - 0.5) * spread;

      x = Math.min(Math.max(x, margin), maxX);
      y = Math.min(Math.max(y, margin), maxY);

      return { x, y };
    }

    function escape() {
      const rect = btn.getBoundingClientRect();

      btn.classList.add('is-hiding');

      window.setTimeout(() => {
        const { x, y } = randomNearbyPosition(rect);

        if (!btn.classList.contains('is-floating')) {
          btn.classList.add('is-floating');
        }

        btn.style.left = x + 'px';
        btn.style.top = y + 'px';

        if (!hasEscapedOnce) {
          btn.textContent = '🥺 Iltimos...';
          hasEscapedOnce = true;
        }

        btn.classList.remove('is-hiding');
      }, 180);
    }

    function init() {
      btn = document.getElementById('noBtn');
      area = document.getElementById('buttonsArea');
      if (!btn) return;

      // Desktop-only interaction: pointerenter fires on hover.
      btn.addEventListener('pointerenter', escape);
      btn.addEventListener('focus', escape); // keyboard users can't trap it either
      btn.addEventListener('click', (e) => {
        // Safety net: even a lucky click never counts as "no".
        e.preventDefault();
        escape();
      });
    }

    return { init };
  })();

  /* =======================================================
     MODULE: Celebration
     Confetti + firework bursts + heart explosion, drawn on a
     full-screen canvas that sits above the thank-you card.
  ======================================================= */
  const Celebration = (() => {
    let canvas, ctx, width, height;
    let particles = [];
    let rafId = null;
    let running = false;

    const CONFETTI_COLORS = ['#f2a8c2', '#f7c6d9', '#e3bb7d', '#cf9d55', '#fff1f5'];

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * devicePixelRatio;
      canvas.height = height * devicePixelRatio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function addConfettiBurst(count) {
      for (let i = 0; i < count; i++) {
        particles.push({
          type: 'confetti',
          x: width / 2 + (Math.random() - 0.5) * width * 0.6,
          y: -20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 2,
          vy: 2 + Math.random() * 3,
          size: 6 + Math.random() * 6,
          rotation: Math.random() * Math.PI,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          life: 0,
          maxLife: 240 + Math.random() * 60,
        });
      }
    }

    function addHeartBurst(originX, originY, count) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        particles.push({
          type: 'heart',
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          size: 12 + Math.random() * 14,
          opacity: 1,
          life: 0,
          maxLife: 90 + Math.random() * 40,
        });
      }
    }

    function addFirework() {
      const originX = width * (0.2 + Math.random() * 0.6);
      const originY = height * (0.2 + Math.random() * 0.35);
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

      for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 * i) / 40;
        const speed = 1.5 + Math.random() * 2.5;
        particles.push({
          type: 'spark',
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2 + Math.random() * 2,
          color,
          life: 0,
          maxLife: 50 + Math.random() * 20,
        });
      }
    }

    function drawHeartShape(x, y, size, opacity, color) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(x, y);
      ctx.scale(size / 20, size / 20);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-10, -4, -10, -12, 0, -12);
      ctx.bezierCurveTo(10, -12, 10, -4, 0, 6);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);

      particles = particles.filter((p) => p.life < p.maxLife);

      particles.forEach((p) => {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;

        if (p.type === 'confetti') {
          p.vy += 0.02;
          p.rotation += p.rotationSpeed;
          const fade = 1 - p.life / p.maxLife;
          ctx.save();
          ctx.globalAlpha = Math.max(fade, 0);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }

        if (p.type === 'heart') {
          p.vy += 0.015;
          const fade = 1 - p.life / p.maxLife;
          drawHeartShape(p.x, p.y, p.size, Math.max(fade, 0), 'rgba(242,168,194,0.9)');
        }

        if (p.type === 'spark') {
          p.vx *= 0.97;
          p.vy = p.vy * 0.97 + 0.02;
          const fade = 1 - p.life / p.maxLife;
          ctx.save();
          ctx.globalAlpha = Math.max(fade, 0);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
        }
      });

      if (particles.length > 0 || running) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }

    function play() {
      if (!canvas) return;
      resize();
      running = true;

      addConfettiBurst(prefersReducedMotion ? 0 : 140);
      addHeartBurst(width / 2, height / 2, prefersReducedMotion ? 0 : 24);

      if (!prefersReducedMotion) {
        let fireworksLaunched = 0;
        const fireworkInterval = window.setInterval(() => {
          addFirework();
          fireworksLaunched++;
          if (fireworksLaunched >= 4) window.clearInterval(fireworkInterval);
        }, 500);
      }

      window.setTimeout(() => { running = false; }, 3200);

      if (!rafId) tick();
    }

    function init() {
      canvas = document.getElementById('celebrationCanvas');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      window.addEventListener('resize', resize);
      resize();
    }

    return { init, play };
  })();

  /* =======================================================
     MODULE: InvitationFlow
     Wires the YES button to the scene transition + celebration.
  ======================================================= */
  const InvitationFlow = (() => {
    function showThanks() {
      const inviteScene = document.getElementById('inviteScene');
      const thanksScene = document.getElementById('thanksScene');
      if (!inviteScene || !thanksScene) return;

      inviteScene.style.transition = 'opacity 420ms ease, transform 420ms ease';
      inviteScene.style.opacity = '0';
      inviteScene.style.transform = 'scale(0.97)';

      window.setTimeout(() => {
        inviteScene.hidden = true;
        thanksScene.hidden = false;
        Celebration.play();
      }, 420);
    }

    function init() {
      const yesBtn = document.getElementById('yesBtn');
      if (!yesBtn) return;
      yesBtn.addEventListener('click', showThanks);
    }

    return { init };
  })();

  /* =======================================================
     BOOT
  ======================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    DeviceGate.init();

    if (DeviceGate.isSmallScreen()) return; // don't bother wiring up the rest

    AmbientCanvas.init();
    CursorTrail.init();
    MusicPlayer.init();
    EvasiveNoButton.init();
    Celebration.init();
    InvitationFlow.init();
  });
})();
