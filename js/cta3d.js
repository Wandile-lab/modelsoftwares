/**
 * cta3d.js — Three.js drifting particle field for the CTA section
 * ES Module. Loaded only by index.html, only when:
 *   - prefers-reduced-motion is false
 *   - connection is not saveData / 2g
 *   - WebGL is available (try/catch)
 *
 * Deliberately different visual vocabulary from hero3d.js:
 *   - No edges / network graph
 *   - Small glowing points drifting upward (ember-like)
 *   - Depth-based opacity + size variation
 *   - Single PointsMaterial draw call — very cheap GPU cost
 *
 * Shares the Three.js CDN import with hero3d.js (browser caches the module).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.167.1/build/three.module.min.js';

/* ------------------------------------------------------------------ */
/*  Device detection                                                    */
/* ------------------------------------------------------------------ */
const isMobile   = navigator.maxTouchPoints > 0 || window.innerWidth < 768;
const PARTICLE_COUNT = isMobile ? 120 : 260;
const PIXEL_RATIO    = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);

/* ------------------------------------------------------------------ */
/*  Mount point — wait for CTA section to exist                        */
/* ------------------------------------------------------------------ */
const ctaSection = document.querySelector('.cta');
if (!ctaSection) {
  console.warn('[cta3d] .cta section not found — aborting');
  throw new Error('[cta3d] mount not found');
}

const canvasWrap = ctaSection.querySelector('.cta__canvas-wrap');
if (!canvasWrap) {
  console.warn('[cta3d] .cta__canvas-wrap not found — aborting');
  throw new Error('[cta3d] canvas wrap not found');
}

/* ------------------------------------------------------------------ */
/*  Renderer                                                            */
/* ------------------------------------------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias:       false,   // points don't need AA
    alpha:           true,
    powerPreference: 'high-performance',
  });
} catch (e) {
  console.warn('[cta3d] WebGL unavailable — using CSS fallback');
  throw e;
}

renderer.setPixelRatio(PIXEL_RATIO);
renderer.setClearColor(0x000000, 0);

const canvas = renderer.domElement;
canvas.setAttribute('aria-hidden', 'true');
canvasWrap.appendChild(canvas);

/* ------------------------------------------------------------------ */
/*  Scene + camera                                                      */
/* ------------------------------------------------------------------ */
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
camera.position.z = 300;

/* ------------------------------------------------------------------ */
/*  Particle geometry                                                   */
/* ------------------------------------------------------------------ */
const positions = new Float32Array(PARTICLE_COUNT * 3);
const alphas    = new Float32Array(PARTICLE_COUNT);   // per-particle base opacity
const sizes     = new Float32Array(PARTICLE_COUNT);   // per-particle base size

// Spread across the section bounding volume
const SPREAD_X = 600, SPREAD_Y = 260, SPREAD_Z = 300;

// Store drift velocities
const velocities = [];

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const x = (Math.random() - 0.5) * SPREAD_X;
  const y = (Math.random() - 0.5) * SPREAD_Y;
  const z = (Math.random() - 0.5) * SPREAD_Z;

  positions[i * 3]     = x;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = z;

  // Depth-based opacity: closer = brighter
  const depthT = (z + SPREAD_Z / 2) / SPREAD_Z;
  alphas[i]    = 0.12 + depthT * 0.55;
  sizes[i]     = 1.2 + depthT * 2.4;

  // Slow upward drift + slight horizontal wander
  velocities.push({
    vy:    0.018 + Math.random() * 0.032,   // drift up at different speeds
    vx:    (Math.random() - 0.5) * 0.008,   // gentle lateral wander
    phase: Math.random() * Math.PI * 2,     // sinusoidal sway phase
  });
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

// PointsMaterial — single draw call, no lighting
const mat = new THREE.PointsMaterial({
  color:       0x36cff0,
  size:        2.2,
  transparent: true,
  opacity:     0.45,
  depthWrite:  false,
  sizeAttenuation: true,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

/* ------------------------------------------------------------------ */
/*  Sizing                                                              */
/* ------------------------------------------------------------------ */
function setSize() {
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

setSize();

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(setSize, 120);
}, { passive: true });

/* ------------------------------------------------------------------ */
/*  Visibility: pause when tab hidden                                   */
/* ------------------------------------------------------------------ */
let isVisible = true;
document.addEventListener('visibilitychange', () => {
  isVisible = !document.hidden;
  if (isVisible) animate();
});

/* ------------------------------------------------------------------ */
/*  IntersectionObserver: pause when CTA is offscreen                  */
/* ------------------------------------------------------------------ */
let ctaVisible = false;

const ctaObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { ctaVisible = e.isIntersecting; });
}, { threshold: 0.05 });

ctaObserver.observe(ctaSection);

/* ------------------------------------------------------------------ */
/*  FPS measurement — same pattern as hero3d.js                        */
/* ------------------------------------------------------------------ */
let frameCount    = 0;
let fpsStartTime  = performance.now();
let measuredFPS   = null;

/* ------------------------------------------------------------------ */
/*  Animation loop                                                      */
/* ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let rafId;

function animate() {
  if (!isVisible) return;
  rafId = requestAnimationFrame(animate);

  // Skip render when section is offscreen — saves GPU time
  if (!ctaVisible) return;

  clock.getDelta(); // advance clock
  const t = clock.elapsedTime;

  // Update particle positions
  const pos = geo.attributes.position;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const v = velocities[i];

    // Drift upward
    pos.array[i * 3 + 1] += v.vy;
    // Sinusoidal horizontal sway
    pos.array[i * 3]     += v.vx + Math.sin(t * 0.4 + v.phase) * 0.012;

    // Wrap: when particle drifts above top, reset to bottom
    if (pos.array[i * 3 + 1] > SPREAD_Y / 2 + 20) {
      pos.array[i * 3 + 1] = -SPREAD_Y / 2 - 20;
      // Randomise X on wrap so it doesn't look like a loop
      pos.array[i * 3] = (Math.random() - 0.5) * SPREAD_X;
    }
  }

  pos.needsUpdate = true;

  // Breathe opacity
  mat.opacity = 0.38 + Math.sin(t * 0.35) * 0.07;

  // Very slow rotation for depth cue
  points.rotation.y = Math.sin(t * 0.06) * 0.08;

  renderer.render(scene, camera);

  // FPS measurement — first 120 frames
  frameCount++;
  if (frameCount === 120) {
    measuredFPS = Math.round(120000 / (performance.now() - fpsStartTime));
    console.info(`[cta3d] Measured FPS (120 frames): ${measuredFPS}`);

    if (isMobile && measuredFPS < 28) {
      console.warn(`[cta3d] Low FPS (${measuredFPS}) — halving particle count`);
      // Hide every other particle by zeroing its size (avoids geo rebuild)
      const posArr = geo.attributes.position.array;
      for (let i = 1; i < PARTICLE_COUNT; i += 2) {
        posArr[i * 3]     = 9999; // move offscreen
        posArr[i * 3 + 1] = 9999;
        posArr[i * 3 + 2] = 9999;
      }
      geo.attributes.position.needsUpdate = true;
    }
  }
}

animate();

/* ------------------------------------------------------------------ */
/*  Fade canvas in after first render                                   */
/* ------------------------------------------------------------------ */
canvas.style.opacity    = '0';
canvas.style.transition = 'opacity 1s ease';

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
    canvas.classList.add('is-loaded');
    ctaSection.classList.add('canvas-active');
  });
});

/* ------------------------------------------------------------------ */
/*  Cleanup                                                             */
/* ------------------------------------------------------------------ */
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(rafId);
  ctaObserver.disconnect();
  renderer.dispose();
  geo.dispose();
  mat.dispose();
});
