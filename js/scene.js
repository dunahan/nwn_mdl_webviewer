/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Three.js Scene & Orbit Controls
   ═══════════════════════════════════════════════ */

//  Three.js scene
// ─────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x0a0c0f);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
camera.position.set(2, 2, 4);
camera.lookAt(0, 0, 0);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff0d0, 1.0);
dirLight.position.set(5, 10, 8);
dirLight.castShadow = true;
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xd0e0ff, 0.4);
dirLight2.position.set(-6, 3, -5);
scene.add(dirLight2);

// Grid
const gridHelper = new THREE.GridHelper(10, 20, 0x2a3040, 0x1a2030);
scene.add(gridHelper);

// Axes
const axesHelper = new THREE.AxesHelper(0.5);
scene.add(axesHelper);

// Scene group for loaded model
let modelGroup = null;
let bboxHelper = null;
let autoRotate = false;
let currentModel = null;
let nodeObjects = {};    // name -> THREE.Object3D
let selectedNodeName = null;
let wireOpacity = 0;
// Name des Supermodells das noch erwartet wird (null = keins ausstehend)
let pendingSupermodel = null;

// ─────────────────────────────────────────────
//  Orbit Controls (custom, minimal)
// ─────────────────────────────────────────────
const orbit = {
  theta: 0.5, phi: 1.1, radius: 5,
  target: new THREE.Vector3(0, 0, 0),
  dragging: false, panning: false,
  lastX: 0, lastY: 0,
  panStart: null,
};

function updateCamera() {
  orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbit.phi));
  orbit.radius = Math.max(0.1, Math.min(500, orbit.radius));
  const x = orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
  const y = orbit.radius * Math.cos(orbit.phi);
  const z = orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
  camera.position.set(
    orbit.target.x + x,
    orbit.target.y + y,
    orbit.target.z + z
  );
  camera.lookAt(orbit.target);
}

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { orbit.dragging = true; }
  if (e.button === 1 || e.button === 2) { orbit.panning = true; }
  orbit.lastX = e.clientX; orbit.lastY = e.clientY;
});
window.addEventListener('mouseup', () => { orbit.dragging = false; orbit.panning = false; });
window.addEventListener('mousemove', e => {
  const dx = e.clientX - orbit.lastX;
  const dy = e.clientY - orbit.lastY;
  orbit.lastX = e.clientX; orbit.lastY = e.clientY;
  if (orbit.dragging) {
    orbit.theta -= dx * 0.007;
    orbit.phi   += dy * 0.007;
    updateCamera();
  }
  if (orbit.panning) {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.getWorldDirection(new THREE.Vector3());
    right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
    up.copy(camera.up);
    const speed = orbit.radius * 0.001;
    orbit.target.addScaledVector(right, -dx * speed);
    orbit.target.addScaledVector(up, dy * speed);
    updateCamera();
  }
});
canvas.addEventListener('wheel', e => {
  orbit.radius *= 1 + e.deltaY * 0.001;
  updateCamera();
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
// Touch support
let touches = {};
canvas.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
  if (e.touches.length === 1) { orbit.dragging = true; orbit.lastX = e.touches[0].clientX; orbit.lastY = e.touches[0].clientY; }
}, { passive: true });
canvas.addEventListener('touchend', e => {
  for (const t of e.changedTouches) delete touches[t.identifier];
  if (e.touches.length === 0) orbit.dragging = false;
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 1 && orbit.dragging) {
    const dx = e.touches[0].clientX - orbit.lastX;
    const dy = e.touches[0].clientY - orbit.lastY;
    orbit.lastX = e.touches[0].clientX; orbit.lastY = e.touches[0].clientY;
    orbit.theta -= dx * 0.007; orbit.phi += dy * 0.007; updateCamera();
  }
  e.preventDefault();
}, { passive: false });

// ─────────────────────────────────────────────
