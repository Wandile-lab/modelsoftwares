/**
 * hero3d.js — Three.js 3D node-network hero visual
 * ES Module. Loaded only by index.html, only when:
 *   - prefers-reduced-motion is false
 *   - connection is not saveData / 2g
 * All Three.js imports are self-contained here.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.167.1/build/three.module.min.js';

/* ------------------------------------------------------------------ */
/*  Device capability detection                                         */
/* ------------------------------------------------------------------ */
const isMobile = navigator.maxTouchPoints > 0 || window.innerWidth < 768;
const isLowEnd  = isMobile && (window.innerWidth < 480);

const NODE_COUNT  = isLowEnd ? 25 : isMobile ? 38 : 72;
const EDGE_DIST   = isLowEnd ? 160 : isMobile ? 180 : 220;
const PIXEL_RATIO = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);

/* ------------------------------------------------------------------ */
/*  Setup renderer                                                      */
/* ------------------------------------------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
    alpha:     true,
    powerPreference: 'high-performance',
  });
} catch (e) {
  // WebGL not available — bail silently, CSS fallback remains visible
  console.warn('[hero3d] WebGL unavailable, using static fallback.');
  document.querySelector('.hero__fallback')?.style.setProperty('display', 'block');
  throw e;
}

renderer.setPixelRatio(PIXEL_RATIO);
renderer.setClearColor(0x000000, 0);

const wrap = document.querySelector('.hero__canvas-wrap');
if (!wrap) throw new Error('[hero3d] Canvas wrap not found');

const canvas = renderer.domElement;
canvas.setAttribute('aria-hidden', 'true');
wrap.appendChild(canvas);

function setSize() {
  renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ */
/*  Scene, camera                                                        */
/* ------------------------------------------------------------------ */
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 1, 2000);
camera.position.z = 520;

/* ------------------------------------------------------------------ */
/*  Node geometry                                                        */
/* ------------------------------------------------------------------ */
const nodeGroup = new THREE.Group();
scene.add(nodeGroup);

// Node positions
const positions = [];
const spread = { x: 700, y: 420, z: 440 };

for (let i = 0; i < NODE_COUNT; i++) {
  positions.push(new THREE.Vector3(
    (Math.random() - 0.5) * spread.x,
    (Math.random() - 0.5) * spread.y,
    (Math.random() - 0.5) * spread.z,
  ));
}

// Node meshes
const nodeMat = new THREE.MeshBasicMaterial({ color: 0x36cff0 });
const nodes   = [];

positions.forEach((pos, i) => {
  const size   = 1.8 + Math.random() * 2.8;
  const geo    = new THREE.SphereGeometry(size, 5, 5);
  const mesh   = new THREE.Mesh(geo, nodeMat.clone());
  mesh.position.copy(pos);

  // Store pulse metadata
  mesh.userData.phaseOffset = Math.random() * Math.PI * 2;
  mesh.userData.pulseSpeed  = 0.6 + Math.random() * 0.8;
  mesh.userData.baseScale   = 1;
  mesh.userData.isPulser     = Math.random() < (isMobile ? 0.08 : 0.12);

  // Depth-based opacity — far nodes are dimmer
  const depthT = (pos.z + spread.z / 2) / spread.z; // 0..1
  const alpha  = 0.28 + depthT * 0.72;
  mesh.material.transparent  = true;
  mesh.material.opacity      = alpha;
  mesh.userData.baseOpacity  = alpha; // stored for pulse animation

  nodeGroup.add(mesh);
  nodes.push(mesh);
});

/* ------------------------------------------------------------------ */
/*  Edge geometry                                                        */
/* ------------------------------------------------------------------ */
const edgePositions = [];
const edgeOpacities = [];

for (let i = 0; i < NODE_COUNT; i++) {
  for (let j = i + 1; j < NODE_COUNT; j++) {
    const d = positions[i].distanceTo(positions[j]);
    if (d < EDGE_DIST) {
      edgePositions.push(
        positions[i].x, positions[i].y, positions[i].z,
        positions[j].x, positions[j].y, positions[j].z,
      );
      // Fade edge by distance
      const t = 1 - (d / EDGE_DIST);
      edgeOpacities.push(t * 0.55, t * 0.55);
    }
  }
}

// Primary thin edge lines
const edgeGeo = new THREE.BufferGeometry();
edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
edgeGeo.setAttribute('opacity',  new THREE.Float32BufferAttribute(edgeOpacities, 1));

// Custom shader material for per-vertex opacity on edges
const edgeMat = new THREE.LineBasicMaterial({
  color:       0x36cff0,
  transparent: true,
  opacity:     0.22,
  depthWrite:  false,
});

const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
nodeGroup.add(edgeLines);

// Soft glow layer — slightly wider, more transparent
const edgeGlowMat = new THREE.LineBasicMaterial({
  color:       0x5ddaf4,
  transparent: true,
  opacity:     0.07,
  depthWrite:  false,
  linewidth:   1, // WebGL ignores >1 on most platforms, kept for intent
});

const edgeGlowLines = new THREE.LineSegments(edgeGeo.clone(), edgeGlowMat);
nodeGroup.add(edgeGlowLines);

/* ------------------------------------------------------------------ */
/*  Mouse / camera parallax                                             */
/* ------------------------------------------------------------------ */
const mouse    = { x: 0, y: 0 };
const camTarget = { x: 0, y: 0 };
const CAM_INFLUENCE = isMobile ? 12 : 28;
const LERP_SPEED    = 0.04;

window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

/* ------------------------------------------------------------------ */
/*  Scroll parallax                                                      */
/* ------------------------------------------------------------------ */
let scrollY = 0;
window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
}, { passive: true });

/* ------------------------------------------------------------------ */
/*  Performance: pause when tab is hidden                               */
/* ------------------------------------------------------------------ */
let isVisible = true;
document.addEventListener('visibilitychange', () => {
  isVisible = !document.hidden;
  if (isVisible) animate();
});

/* ------------------------------------------------------------------ */
/*  Resize                                                               */
/* ------------------------------------------------------------------ */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(setSize, 120);
}, { passive: true });

setSize();

/* ------------------------------------------------------------------ */
/*  Frame rate measurement (first 120 frames)                           */
/* ------------------------------------------------------------------ */
let frameCount   = 0;
let fpsStartTime = performance.now();
let measuredFPS  = null;

/* ------------------------------------------------------------------ */
/*  Animation loop                                                       */
/* ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let rafId;

function animate() {
  if (!isVisible) return;
  rafId = requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t     = clock.elapsedTime; // read accumulated time after getDelta()

  // Gentle rotation
  nodeGroup.rotation.y += 0.00022;
  nodeGroup.rotation.x  = Math.sin(t * 0.08) * 0.04;

  // Camera parallax — smooth lerp toward mouse target
  camTarget.x += (mouse.x * CAM_INFLUENCE - camTarget.x) * LERP_SPEED;
  camTarget.y += (-mouse.y * CAM_INFLUENCE - camTarget.y) * LERP_SPEED;

  camera.position.x = camTarget.x;
  camera.position.y = camTarget.y;

  // Scroll: gently advance camera Z as user scrolls into hero
  const heroEl = document.querySelector('.hero');
  const heroH  = heroEl ? heroEl.offsetHeight : window.innerHeight;
  const scrollProgress = Math.min(scrollY / heroH, 1);
  camera.position.z   = 520 - scrollProgress * 120;

  // Pulse active nodes
  nodes.forEach((mesh) => {
    if (!mesh.userData.isPulser) return;
    const pulse = 0.85 + Math.sin(t * mesh.userData.pulseSpeed + mesh.userData.phaseOffset) * 0.18;
    mesh.scale.setScalar(pulse);
    mesh.material.opacity = mesh.userData.baseOpacity
      ? mesh.userData.baseOpacity * (0.7 + 0.3 * Math.sin(t * mesh.userData.pulseSpeed + mesh.userData.phaseOffset))
      : mesh.material.opacity;
  });

  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);

  // FPS measurement
  frameCount++;
  if (frameCount === 120) {
    measuredFPS = Math.round(120000 / (performance.now() - fpsStartTime));
    console.info(`[hero3d] Measured FPS (120 frames): ${measuredFPS}`);

    // If very low FPS on mobile, drop node count dynamically
    if (isMobile && measuredFPS < 28) {
      console.warn(`[hero3d] Low FPS (${measuredFPS}) — reducing scene complexity`);
      // Remove every other node
      for (let i = nodes.length - 1; i >= 0; i -= 2) {
        nodeGroup.remove(nodes[i]);
        nodes.splice(i, 1);
      }
    }
  }
}

animate();

/* ------------------------------------------------------------------ */
/*  Fade in canvas once Three.js has rendered at least 1 frame         */
/* ------------------------------------------------------------------ */
canvas.style.opacity = '0';
canvas.style.transition = 'opacity 0.8s ease';
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
  });
});

/* ------------------------------------------------------------------ */
/*  Cleanup on page unload                                              */
/* ------------------------------------------------------------------ */
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(rafId);
  renderer.dispose();
  edgeGeo.dispose();
  edgeMat.dispose();
  edgeGlowMat.dispose();
});
