import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const canvas = $('scene');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const b = ([x, y, z]) => new THREE.Vector3(x, z, -y);
const views = {
  overview: { title: '全屋鸟瞰', description: '两间卧室、一间书房，把收纳安放在日常动线里。', position: [22, -17, 26], target: [7.6, 5.4, 0.2], cut: 2.85 },
  plan: { title: '家具与收纳平面', description: '图左下：主卧 A · 图中下：长辈 B · 图上：书房', position: [7.615, 5.57, 32], target: [7.615, 5.57, 0], cut: 0.45 },
  living: { title: '客厅 · 温润相聚', description: '胡桃木、暖白织物与水墨，共同构成家的底色。', position: [7.85, 0.83, 1.58], target: [9.55, 4.25, 1.24] },
  tv: { title: '整墙电视收纳', description: '65 寸电视嵌入柜墙，封闭储物与开放陈列结合。', position: [11.75, 5.75, 1.62], target: [7.25, 3.55, 1.28] },
  'bedroom-a': { title: '主卧 · 长辈 A', description: '床头靠左侧实墙 · 新增浅柜后床尾约 0.77 m', position: [2.87, 5.95, 1.57], target: [0.80, 3.55, 1.12] },
  'bedroom-b': { title: '长辈卧室 B', description: '图中下 · 1.50 m 宽床 · 蜜棕橡木地板', position: [3.83, 5.15, 1.53], target: [5.28, 3.60, 1.15] },
  study: { title: '书房', description: '整墙书柜搭配独立书桌与阅读座。', position: [5.73, 9.91, 1.56], target: [3.98, 8.03, 1.12] },
  dining: { title: '餐厨空间', description: '木框玻璃移门，连接烟火气与相聚的时光。', position: [10.70, 2.15, 1.58], target: [14.04, 3.66, 1.28] },
  wardrobe: { title: '主卧整墙浅柜', description: '3.15 米整墙浅柜 · 总深 35 厘米 · 叠衣与床品收纳', position: [1.03, 5.65, 1.58], target: [3.26, 4.13, 1.32] },
  'study-storage': { title: '书房整墙书柜', description: '下部封闭收纳，上部书籍与器物陈列。', position: [5.73, 9.78, 1.58], target: [3.20, 8.48, 1.29] },
  'river-view': { title: '二楼临河窗景', description: '越过树冠与河岸花园，看与住宅平行的河道。', position: [10.25, 1.38, 1.62], target: [9.65, -12.5, -2.8] },
};
let renderer, scene, controls, camera, perspective, orthographic, model, ground;
let activeView = 'overview', transition, dirty = true, animationId;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.15);
const wallMaterials = new Set();
const ceilings = [];
const exterior = [];
const sectionWalls = [];
const capMaterial = new THREE.MeshStandardMaterial({ color: '#b5af9f', roughness: 1, side: THREE.DoubleSide });
let sectionCaps;
const labels = [];
const metrics = { loaded: false, meshes: 0, triangles: 0, view: 'overview' };
window.__viewer = metrics;

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}

function markDirty() { dirty = true; }
function setExterior() {
  const visible = $('show-exterior').checked;
  exterior.forEach(object => { object.visible = visible; });
  if (ground) ground.position.y = visible ? -4.65 : -0.19;
  metrics.exteriorVisible = visible;
  if (renderer) renderer.shadowMap.needsUpdate = true;
  markDirty();
}
function fitPlan() {
  const aspect = viewport.clientWidth / viewport.clientHeight;
  const width = Math.max(18.3, 14.5 * aspect);
  orthographic.left = -width / 2; orthographic.right = width / 2;
  orthographic.top = width / aspect / 2; orthographic.bottom = -orthographic.top;
  orthographic.updateProjectionMatrix();
}
function overviewPosition() {
  const aspect = viewport.clientWidth / viewport.clientHeight;
  const distance = Math.max(25, 24.2 / Math.min(aspect, 1.3));
  const target = b(views.overview.target);
  return b(views.overview.position).sub(target).normalize().multiplyScalar(distance).add(target);
}
function resize() {
  if (!renderer) return;
  renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
  perspective.aspect = viewport.clientWidth / viewport.clientHeight;
  perspective.updateProjectionMatrix();
  fitPlan();
  if (controls && activeView === 'overview') {
    transition = null;
    camera.position.copy(overviewPosition());
    controls.target.copy(b(views.overview.target));
    camera.lookAt(controls.target);
    controls.update();
  }
  markDirty();
}

function setCutaway() {
  const enabled = $('cutaway').checked;
  clipPlane.constant = Number($('cut-height').value);
  $('height-value').textContent = clipPlane.constant.toFixed(2) + ' m';
  $('cut-control').classList.toggle('disabled', !enabled);
  $('cut-height').disabled = !enabled;
  for (const material of wallMaterials) {
    material.clippingPlanes = enabled ? [clipPlane] : null;
    material.clipShadows = true;
    material.needsUpdate = true;
  }
  // The ceiling must follow the section so it never covers a cutaway model.
  for (const object of ceilings) object.visible = $('ceiling').checked && !enabled;
  $('ceiling').disabled = enabled;
  if (sectionCaps) { sectionCaps.geometry.dispose(); scene.remove(sectionCaps); sectionCaps = null; }
  if (enabled && sectionWalls.length) {
    const pieces = [];
    for (const bounds of sectionWalls) {
      if (bounds.min.y >= clipPlane.constant || bounds.max.y <= clipPlane.constant) continue;
      const piece = new THREE.PlaneGeometry(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
      piece.rotateX(-Math.PI / 2);
      piece.translate((bounds.min.x + bounds.max.x) / 2, clipPlane.constant + 0.001, (bounds.min.z + bounds.max.z) / 2);
      pieces.push(piece);
    }
    if (pieces.length) {
      sectionCaps = new THREE.Mesh(mergeGeometries(pieces), capMaterial);
      pieces.forEach(piece => piece.dispose()); sectionCaps.receiveShadow = true; scene.add(sectionCaps);
    }
  }
  if (renderer) renderer.shadowMap.needsUpdate = true;
  markDirty();
}

function selectView(id, animate = true) {
  if (!views[id] || !controls) return;
  const view = views[id];
  activeView = id; metrics.view = id;
  $('view-title').textContent = view.title;
  $('view-description').textContent = view.description;
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === id);
    button.setAttribute('aria-pressed', String(button.dataset.view === id));
  });
  const isPlan = id === 'plan', isOverview = id === 'overview';
  const previousPosition = camera.position.clone(), previousTarget = controls.target.clone();
  camera = isPlan ? orthographic : perspective;
  controls.object = camera;
  controls.enableRotate = !isPlan;
  controls.maxPolarAngle = isOverview ? Math.PI * 0.49 : Math.PI * 0.9;
  controls.minDistance = isOverview ? 9 : 0.25;
  controls.maxDistance = 65;
  controls.minZoom = 0.5; controls.maxZoom = 7;
  controls.zoomSpeed = isOverview ? 0.8 : 0.45;
  camera.up.set(...(isPlan ? [0, 0, -1] : [0, 1, 0]));
  camera.zoom = 1;
  perspective.fov = isOverview ? 45 : 73;
  camera.updateProjectionMatrix();
  $('cutaway').checked = view.cut !== undefined;
  if (view.cut !== undefined) $('cut-height').value = view.cut;
  $('ceiling').checked = view.cut === undefined;
  $('show-exterior').checked = !isPlan;
  setExterior();
  setCutaway();
  const position = isOverview ? overviewPosition() : b(view.position);
  const target = b(view.target);
  transition = animate && !reducedMotion && !isPlan ? { start: performance.now(), from: previousPosition, to: position, fromTarget: previousTarget, target } : null;
  if (!transition) { camera.position.copy(position); controls.target.copy(target); camera.lookAt(target); controls.update(); }
  markDirty();
}

function addLabels() {
  const points = [
    ['主卧 · 长辈 A', [1.7, 3.9, 0.9]], ['长辈卧室 B', [5.2, 3.6, 0.9]],
    ['书房', [4.5, 9.1, 0.9]], ['客厅', [9.7, 2.7, 0.4]],
    ['餐厅', [12.3, 4.9, 0.9]], ['厨房', [14.15, 2.8, 0.9]],
    ['玄关', [14.0, 6.0, 0.6]], ['卫浴 A', [1.55, 7.3, 0.6]], ['卫浴 B', [6.8, 9.4, 0.6]],
  ];
  for (const [title, point] of points) {
    const element = document.createElement('span'); element.className = 'room-label'; element.textContent = title;
    $('labels').append(element); labels.push({ element, point: b(point) });
  }
}
function updateLabels() {
  const visible = $('show-labels').checked && ['overview', 'plan'].includes(activeView);
  $('labels').hidden = !visible;
  if (!visible) return;
  for (const { element, point } of labels) {
    const projected = point.clone().project(camera);
    const x = (projected.x + 1) / 2 * viewport.clientWidth, y = (1 - projected.y) / 2 * viewport.clientHeight;
    element.hidden = projected.z < -1 || projected.z > 1 || x < 15 || x > viewport.clientWidth - 15 || y < 125 || y > viewport.clientHeight - 100;
    element.style.left = x + 'px'; element.style.top = y + 'px';
  }
}

function loop(now) {
  animationId = requestAnimationFrame(loop);
  if (transition) {
    const t = Math.min((now - transition.start) / 800, 1), eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, eased);
    controls.target.lerpVectors(transition.fromTarget, transition.target, eased);
    camera.lookAt(controls.target);
    if (t === 1) transition = null;
    dirty = true;
  }
  if (controls.update()) dirty = true;
  if (dirty) {
    renderer.render(scene, camera); updateLabels(); dirty = false;
    metrics.calls = renderer.info.render.calls;
    metrics.renderedTriangles = renderer.info.render.triangles;
  }
}

function initializeViewer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  scene = new THREE.Scene(); scene.background = new THREE.Color('#eae7df');
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  scene.environmentIntensity = 0.55; environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff7e8, 0xb5b8b0, 1.15));
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.9); sun.position.set(4, 15, 6);
  sun.target.position.set(8, 0, -5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -13; sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 13; sun.shadow.camera.bottom = -13; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xe9f0ff, 0.55); fill.position.set(12, 9, -12); scene.add(fill);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e4e1d7', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.19; ground.receiveShadow = true; scene.add(ground);
  perspective = new THREE.PerspectiveCamera(45, 1, 0.035, 300);
  orthographic = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.05, 200); camera = perspective;
  controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.09; controls.screenSpacePanning = true;
  controls.addEventListener('change', markDirty); controls.addEventListener('start', () => { transition = null; });
  resize(); selectView('overview', false); addLabels();
  new ResizeObserver(resize).observe(viewport);
  requestAnimationFrame(loop);
  new GLTFLoader().load('./assets/home.glb?v=20261017-master-shallow', gltf => {
    model = gltf.scene;
    const wallPattern = /外墙|内墙|墙体|门|窗|玻璃|垭口|踢脚|吊顶|顶角|线脚|灯带|画|水墨|墨竹|电视墙|吊灯|灯具木圈|灯底漫射/;
    const materialCache = new Map();
    model.updateMatrixWorld(true);
    model.traverse(object => {
      // GLTFLoader puts a multi-material node's extras on its parent Group.
      const role = object.userData.web_role || object.userData.architecture_role || object.parent?.userData.web_role;
      if (role) object.userData.web_role = role;
      if (!object.userData.storage_id && object.parent?.userData.storage_id) object.userData.storage_id = object.parent.userData.storage_id;
      if (role === 'ceiling' || object.userData.hidden_by_default || /吊顶|天花|顶面/.test(object.name)) ceilings.push(object);
      if (!object.isMesh) return;
      if (role === 'wall') sectionWalls.push(new THREE.Box3().setFromObject(object));
      metrics.meshes++; metrics.triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
      if (role === 'exterior') metrics.exteriorTriangles = (metrics.exteriorTriangles || 0) + (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
      object.castShadow = true; object.receiveShadow = true;
      const sectioned = role !== 'exterior' && !object.userData.storage_id && (role === 'wall' || wallPattern.test(object.name));
      const convert = original => {
        if (original.transparent && original.opacity < 0.5) object.castShadow = false;
        const key = original.uuid + ':' + sectioned;
        if (materialCache.has(key)) return materialCache.get(key);
        const material = original.clone();
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        }
        if (sectioned) { material.side = THREE.DoubleSide; wallMaterials.add(material); }
        if (material.transparent && material.opacity < 0.5) { object.castShadow = false; material.depthWrite = false; }
        materialCache.set(key, material); return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    // Static interior: merge identical materials to keep draw calls low on phones.
    const groups = new Map();
    const meshes = [];
    model.traverse(object => { if (object.isMesh && !Array.isArray(object.material)) meshes.push(object); });
    for (const object of meshes) {
      const ceiling = ceilings.includes(object);
      const outside = object.userData.web_role === 'exterior';
      const key = object.material.uuid + ':' + ceiling + ':' + outside + ':' + object.castShadow;
      if (!groups.has(key)) groups.set(key, { material: object.material, ceiling, outside, castShadow: object.castShadow, geometries: [] });
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
      if (normalized !== geometry) geometry.dispose();
      groups.get(key).geometries.push(normalized);
      object.removeFromParent();
    }
    ceilings.length = 0;
    for (const group of groups.values()) {
      const geometry = mergeGeometries(group.geometries);
      group.geometries.forEach(item => item.dispose());
      const mesh = new THREE.Mesh(geometry, group.material); mesh.castShadow = group.castShadow; mesh.receiveShadow = true;
      if (group.ceiling) ceilings.push(mesh);
      if (group.outside) exterior.push(mesh);
      model.add(mesh);
    }
    metrics.batches = groups.size;
    metrics.texturedMaterials = [...materialCache.values()].filter(material => material.map).length;
    metrics.normalMappedMaterials = [...materialCache.values()].filter(material => material.normalMap).length;
    metrics.exteriorBatches = exterior.length;
    scene.add(model); setCutaway(); setExterior();
    metrics.loaded = true; metrics.wallMaterials = wallMaterials.size; metrics.ceilings = ceilings.length;
    $('progress-fill').style.width = '100%'; $('loader').classList.add('loaded');
    $('model-status').textContent = '新中式 · 两卧一书房 · 临河居所';
    markDirty();
  }, event => {
    const percent = event.total ? Math.min(99, Math.round(event.loaded / event.total * 100)) : null;
    $('load-detail').textContent = percent === null ? `已加载 ${(event.loaded / 1048576).toFixed(1)} MB` : `加载三维模型 · ${percent}%`;
    $('progress-fill').style.width = (percent || 10) + '%';
  }, error => {
    console.error('Model load failed', error); metrics.error = String(error);
    $('load-title').textContent = '模型暂时未能载入';
    $('load-detail').textContent = '请刷新重试，也可以先浏览下方效果图。';
  });
  canvas.addEventListener('dblclick', event => {
    if (!model) return;
    const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = ray.intersectObject(model).find(hit => {
      for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
      const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
      return !material.clippingPlanes?.length || hit.point.y <= clipPlane.constant;
    });
    if (hit) { controls.target.copy(hit.point); controls.update(); markDirty(); }
  });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cancelAnimationFrame(animationId); toast('图形资源暂时不足，请刷新页面恢复。'); });
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
$('reset').addEventListener('click', () => selectView('overview'));
$('cutaway').addEventListener('change', setCutaway);
$('cut-height').addEventListener('input', setCutaway);
$('ceiling').addEventListener('change', setCutaway);
$('show-labels').addEventListener('change', markDirty);
$('show-exterior').addEventListener('change', setExterior);
for (const [id, factor] of [['zoom-in', 0.8], ['zoom-out', 1.25]]) $(id).addEventListener('click', () => {
  if (!controls) return;
  if (camera.isOrthographicCamera) { camera.zoom = THREE.MathUtils.clamp(camera.zoom / factor, 0.5, 7); camera.updateProjectionMatrix(); }
  else { const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(offset); }
  controls.update(); markDirty();
});
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (viewport.requestFullscreen) await viewport.requestFullscreen(); else toast('当前浏览器不支持全屏，可横屏查看。'); } catch { toast('当前浏览器未能进入全屏。'); }
});
$('capture').addEventListener('click', () => {
  if (!metrics.loaded) return toast('模型加载完成后即可保存。');
  renderer.render(scene, camera);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `和光-${views[activeView].title}.png`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('当前视图已保存为图片。'); });
});

async function initializeGallery() {
  const response = await fetch('./assets/gallery.json?v=20261017-master-shallow');
  if (!response.ok) throw new Error('Gallery load failed');
  const images = await response.json();
  const order = ['tv', 'wardrobe', 'study-storage', 'study', 'living', 'dining', 'bedroom-a', 'bedroom-b', 'river-view', 'overview', 'plan-labeled', 'plan'];
  images.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const item of images) {
    const figure = document.createElement('figure'); figure.className = 'gallery-card';
    figure.dataset.category = ['living', 'tv', 'dining'].includes(item.id) ? 'public' : ['bedroom-a', 'bedroom-b', 'wardrobe'].includes(item.id) ? 'bedroom' : ['study', 'study-storage'].includes(item.id) ? 'study' : item.id === 'river-view' ? 'river' : 'plan';
    const button = document.createElement('button'); button.setAttribute('aria-label', '查看' + item.title);
    const image = new Image(); image.src = item.thumb + '?v=20261017-master-shallow'; image.alt = item.title; image.width = 600; image.height = Math.round(600 * item.height / item.width); image.loading = 'lazy';
    button.append(image);
    button.addEventListener('click', () => { $('lightbox-image').src = item.src + '?v=20261017-master-shallow'; $('lightbox-image').alt = item.title; $('lightbox-caption').textContent = item.title; $('lightbox').showModal(); });
    const caption = document.createElement('figcaption');
    const name = document.createElement('span'); name.textContent = item.title;
    const arrow = document.createElement('span'); arrow.textContent = '↗'; caption.append(name, arrow);
    figure.append(button, caption); $('gallery-grid').append(figure);
  }
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(other => { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button)); });
  document.querySelectorAll('.gallery-card').forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; });
}));
$('close-lightbox').addEventListener('click', () => $('lightbox').close());
$('lightbox').addEventListener('click', event => { if (event.target === $('lightbox')) $('lightbox').close(); });
initializeGallery().catch(error => { console.error(error); $('gallery-grid').textContent = '图集暂未载入，请打开完整设计图册。'; });
try { initializeViewer(); } catch (error) {
  console.error(error); metrics.error = String(error);
  $('load-title').textContent = '当前浏览器暂不支持三维预览';
  $('load-detail').textContent = '请使用支持 WebGL 2 的浏览器，或直接浏览下方效果图。';
}
