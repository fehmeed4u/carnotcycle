import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { derived } from './physics.js';
import { tempToCss, PROCESS_COLOR_BY_INDEX, COLORBLIND_PROCESS_COLOR_BY_INDEX } from './colors.js';
import { visualX } from './scale.js';

const BORE = 0.2; // m, square bore side (spec §4.2)

const CAMERA_PRESETS = {
  ORBIT: { pos: [3.6, 2.1, 3.6], target: [0.2, 0.9, 0], fov: 42 },
  FRONT: { pos: [0.2, 1.1, 5.0], target: [0.2, 1.0, 0], fov: 35 },
  SIDE: { pos: [5.2, 1.0, 0.2], target: [0.2, 0.9, 0], fov: 35 },
  TOP: { pos: [0.2, 5.6, 0.02], target: [0.2, 0, 0], fov: 40 },
  CUTAWAY: { pos: [1.6, 1.0, 2.6], target: [0.2, 0.8, 0], fov: 45 },
  FOLLOW_PISTON: { pos: [1.4, 1.3, 2.2], target: [0.2, 0.9, 0], fov: 38 },
  MACRO_GAS: { pos: [-0.5, 0.95, 0.02], target: [0.6, 0.95, 0], fov: 60 },
};

function label(text, className = 'label3d') {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return new CSS2DObject(div);
}

export class EngineScene {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d12);
    this.scene.fog = new THREE.Fog(0x0a0d12, 8, 20);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, this.labelRenderer.domElement);
    this.controls.target.set(0.2, 0.9, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this._buildLights();
    this._buildStage();
    this._buildEngine();

    this._camPresetName = 'ORBIT';
    this._camTween = null;
    this.setCameraPreset('ORBIT', true);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Container size can change from flex-layout settling (fonts, drawer
    // height) without a window resize firing — watch it directly so the
    // canvas never grows to overlap sibling panels.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(container);
    }
  }

  _buildLights() {
    const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
    key.position.set(4, 6, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fc9ff, 0.5);
    fill.position.set(-5, 3, -2);
    this.scene.add(fill);
    const rim = new THREE.PointLight(0x66ccff, 0.6, 10);
    rim.position.set(-1, 2, -3);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x404050, 0.35));
  }

  _buildStage() {
    const g = new THREE.Group();
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.55, metalness: 0.6 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.1, 64), floorMat);
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    g.add(floor);
    const grid = new THREE.GridHelper(6, 24, 0x2a3242, 0x1a1f28);
    grid.position.y = 0.001;
    g.add(grid);
    this.stage = g;
    this.scene.add(g);
  }

  _buildEngine() {
    const eng = new THREE.Group();
    eng.position.set(-0.9, 0.9, 0);
    this.scene.add(eng);
    this.eng = eng;

    const x1 = derived.V1 / derived.A;
    const boreHalf = BORE / 2;

    // --- Cylinder head (thermal contact face) ---
    const headMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.85, roughness: 0.35, emissive: 0x000000 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, BORE + 0.04, BORE + 0.04), headMat);
    head.position.x = -0.015;
    head.castShadow = head.receiveShadow = true;
    eng.add(head);
    this.head = head; this.headMat = headMat;

    // --- Cylinder wall (transmissive glass box, cutaway on +Z half) ---
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0xcfe8ff, roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.02,
      transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    const maxLenVis = visualX(derived.V3 / derived.A, x1, false) + 0.05;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(maxLenVis, BORE + 0.02, BORE + 0.02), wallMat);
    wall.position.x = maxLenVis / 2;
    eng.add(wall);
    this.wall = wall;

    const boreMat = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.5, metalness: 0.2, side: THREE.BackSide });
    const bore = new THREE.Mesh(new THREE.BoxGeometry(maxLenVis, BORE, BORE), boreMat);
    bore.position.x = maxLenVis / 2;
    eng.add(bore);
    this.bore = bore;

    // --- Gas volume haze ---
    const gasMat = new THREE.MeshPhysicalMaterial({ color: 0xff4b2b, transparent: true, opacity: 0.1, roughness: 0.9, transmission: 0.4, emissive: 0xff2200, emissiveIntensity: 0.15 });
    const gas = new THREE.Mesh(new THREE.BoxGeometry(1, BORE - 0.01, BORE - 0.01), gasMat);
    gas.position.x = 0;
    eng.add(gas);
    this.gasMesh = gas; this.gasMat = gasMat;

    // gas particle group (local frame: x=0 at head, +x into cylinder)
    this.gasGroup = new THREE.Group();
    eng.add(this.gasGroup);

    // --- Piston ---
    const pistonGroup = new THREE.Group();
    const pistonMat = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 0.9, roughness: 0.25 });
    const pistonBody = new THREE.Mesh(new THREE.BoxGeometry(0.03, BORE - 0.005, BORE - 0.005), pistonMat);
    pistonBody.castShadow = true;
    pistonGroup.add(pistonBody);
    this.pistonRings = [];
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.4 });
    for (let i = -1; i <= 1; i++) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.004, BORE - 0.003, BORE - 0.003), ringMat);
      ring.position.x = i * 0.009;
      pistonGroup.add(ring);
      this.pistonRings.push(ring);
    }
    eng.add(pistonGroup);
    this.piston = pistonGroup;

    // rod + rack
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 16), rodMat);
    rod.rotation.z = Math.PI / 2;
    eng.add(rod);
    this.rod = rod;

    // telescoping connecting rod (two nested cylinders) -> crank
    const crMat = new THREE.MeshStandardMaterial({ color: 0x7d8892, metalness: 0.85, roughness: 0.25 });
    const crOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 16), crMat);
    crOuter.rotation.z = Math.PI / 2;
    const crInner = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.4, 16), crMat);
    crInner.rotation.z = Math.PI / 2;
    eng.add(crOuter); eng.add(crInner);
    this.crOuter = crOuter; this.crInner = crInner;

    // flywheel
    const flyGroup = new THREE.Group();
    const flyMat = new THREE.MeshStandardMaterial({ color: 0xc9973a, metalness: 0.9, roughness: 0.3 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 16, 48), flyMat);
    rim.rotation.y = Math.PI / 2;
    flyGroup.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 24), flyMat);
    hub.rotation.z = Math.PI / 2;
    flyGroup.add(hub);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.55, 0.02), flyMat);
      spoke.rotation.x = (i / 8) * Math.PI * 2;
      flyGroup.add(spoke);
    }
    flyGroup.position.x = 2.15;
    flyGroup.castShadow = true;
    eng.add(flyGroup);
    this.flywheel = flyGroup;

    // work meter dial near shaft
    const meterGroup = new THREE.Group();
    const meterBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x1e232b, metalness: 0.5, roughness: 0.5 }));
    meterBase.rotation.x = Math.PI / 2;
    meterGroup.add(meterBase);
    const meterNeedle = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xf5d547, emissive: 0x554400 }));
    meterNeedle.position.set(0, 0.04, 0.011);
    meterNeedle.rotation.x = Math.PI / 2;
    meterGroup.add(meterNeedle);
    meterGroup.position.set(2.55, 0.35, 0);
    eng.add(meterGroup);
    this.workMeter = meterGroup; this.workMeterNeedle = meterNeedle;

    // pressure gauge
    const gaugeGroup = new THREE.Group();
    const gaugeFace = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.015, 32), new THREE.MeshStandardMaterial({ color: 0xf2ede1, metalness: 0.1, roughness: 0.6 }));
    gaugeFace.rotation.x = Math.PI / 2;
    gaugeGroup.add(gaugeFace);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.006, 0.006), new THREE.MeshStandardMaterial({ color: 0xd7263d, emissive: 0x330000 }));
    needle.position.set(0.03, 0, 0.01);
    gaugeGroup.add(needle);
    const gaugePost = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.5 }));
    gaugePost.position.y = -0.25;
    gaugeGroup.add(gaugePost);
    gaugeGroup.position.set(0.35, 0.62, 0.12);
    gaugeGroup.rotation.y = -0.4;
    eng.add(gaugeGroup);
    this.gauge = gaugeGroup; this.gaugeNeedle = needle;

    // thermometer
    const thermoGroup = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.85, roughness: 0.05, transparent: true, opacity: 0.5 }));
    thermoGroup.add(tube);
    const mercury = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.46, 16), new THREE.MeshStandardMaterial({ color: 0xff4b2b, emissive: 0x551100 }));
    thermoGroup.add(mercury);
    thermoGroup.position.set(0.6, 0.6, -0.14);
    eng.add(thermoGroup);
    this.thermo = thermoGroup; this.mercury = mercury;

    // reservoirs (arranged along Z, slide-shuttle contact indicator)
    const resGroup = new THREE.Group();
    resGroup.position.x = -0.3;
    eng.add(resGroup);
    this.resGroup = resGroup;

    const plate = (color) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.4), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5, emissive: color, emissiveIntensity: 0.15 }));
      m.castShadow = true;
      return m;
    };
    this.hotRes = plate(0xD7263D); this.hotRes.position.z = -0.45;
    this.coldRes = plate(0x1B6CA8); this.coldRes.position.z = 0.45;
    const insMat = new THREE.MeshStandardMaterial({ color: 0xF2E9D8, roughness: 0.8, metalness: 0.05 });
    this.insRes = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.4), insMat);
    this.insRes.position.z = 0;
    resGroup.add(this.hotRes, this.coldRes, this.insRes);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.0), new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.7, roughness: 0.4 }));
    rail.position.set(0.08, -0.24, 0);
    resGroup.add(rail);
    this.rail = rail;

    const shuttle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, transparent: true, opacity: 0.35 }));
    shuttle.position.x = 0.05;
    resGroup.add(shuttle);
    this.shuttle = shuttle;
    this._shuttleZ = 0;

    // heat arrows (stream of cones travelling between reservoir and head)
    this.heatArrows = [];
    const arrowMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), arrowMat());
      cone.rotation.z = -Math.PI / 2;
      cone.visible = false;
      eng.add(cone);
      this.heatArrows.push(cone);
    }

    // work output arrow (near flywheel)
    const workArrow = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xf5d547, emissive: 0x554400, emissiveIntensity: 0.8 }));
    workArrow.rotation.z = -Math.PI / 2;
    workArrow.position.set(2.15, 0.42, 0);
    eng.add(workArrow);
    this.workArrow = workArrow;

    // dimension lines (off by default): a tick-marked x span below the
    // cylinder, updated live to the piston displacement.
    this.dimGroup = new THREE.Group();
    const dimMat = new THREE.LineBasicMaterial({ color: 0xf5d547 });
    const dimGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, -0.03, 0), new THREE.Vector3(0, 0.03, 0),
      new THREE.Vector3(1, -0.03, 0), new THREE.Vector3(1, 0.03, 0),
    ]);
    const dimLine = new THREE.LineSegments(dimGeo, dimMat);
    this.dimGroup.add(dimLine);
    this.dimLine = dimLine;
    this.dimLabel = label('x = 0.500 m · A = 0.0200 m² · V = 10.00 L', 'label3d small');
    this.dimGroup.add(this.dimLabel);
    this.dimGroup.position.y = -0.16;
    eng.add(this.dimGroup);

    // labels
    this.labelHead = label('CYLINDER HEAD', 'label3d small');
    this.labelHead.position.set(-0.015, 0.14, 0);
    eng.add(this.labelHead);
    this.labelPiston = label('PISTON', 'label3d small');
    this.labelPiston.position.set(0, 0.14, 0);
    eng.add(this.labelPiston);
    this.pistonLabelObj = this.labelPiston;

    this.labelFlywheel = label('FLYWHEEL', 'label3d small');
    this.labelFlywheel.position.set(0, 0.38, 0);
    this.flywheel.add(this.labelFlywheel);

    this.stateTag = label('', 'label3d state-tag');
    this.stateTag.position.set(0, 0.2, 0);
    eng.add(this.stateTag);

    this.hotLabel = label('Q_H', 'label3d hot');
    this.hotLabel.position.set(0, 0.24, -0.45);
    this.eng.add(this.hotLabel);
    this.coldLabel = label('Q_C', 'label3d cold');
    this.coldLabel.position.set(0, 0.24, 0.45);
    this.eng.add(this.coldLabel);
  }

  setCameraPreset(name, instant = false) {
    const p = CAMERA_PRESETS[name] || CAMERA_PRESETS.ORBIT;
    this._camPresetName = name;
    const from = { pos: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
    const to = { pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target), fov: p.fov };
    if (instant) {
      this.camera.position.copy(to.pos);
      this.controls.target.copy(to.target);
      this.camera.fov = to.fov;
      this.camera.updateProjectionMatrix();
      this._camTween = null;
      return;
    }
    this._camTween = { from, to, t0: performance.now(), dur: 800 };
  }

  _updateCameraTween() {
    if (!this._camTween) return;
    const { from, to, t0, dur } = this._camTween;
    const t = Math.min(1, (performance.now() - t0) / dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
    this.camera.position.lerpVectors(from.pos, to.pos, e);
    this.controls.target.lerpVectors(from.target, to.target, e);
    this.camera.fov = from.fov + (to.fov - from.fov) * e;
    this.camera.updateProjectionMatrix();
    if (t >= 1) this._camTween = null;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(state, toggles, dt) {
    const x1 = derived.V1 / derived.A;
    const trueScale = !!toggles.TRUE_SCALE;
    const headX = visualX(0, x1, trueScale);
    const pistonX = visualX(state.x, x1, trueScale);
    const L = pistonX - headX;

    this.head.position.x = headX - 0.015;
    this.piston.position.x = pistonX;
    this.rod.scale.x = 1.5;
    this.rod.position.x = pistonX + 0.75;
    this.gasMesh.position.x = headX + L / 2;
    this.gasMesh.scale.x = Math.max(L, 0.01);
    this.gasGroup.position.x = 0; // particles already in head-relative frame

    // connecting rod telescopes between piston and the crank pin, whose pin
    // position traces the flywheel radius at phase angle phi = 2π s
    const phi = 2 * Math.PI * state.s;
    const crankR = 0.3;
    const crankX = this.flywheel.position.x + Math.cos(phi) * 0.0; // shaft is along x, crank offset in y-z
    const crankY = Math.sin(phi) * crankR;
    const rodLen = Math.max(0.1, this.flywheel.position.x - pistonX);
    this.crOuter.position.set(pistonX + rodLen / 2, 0, 0);
    this.crOuter.scale.x = rodLen / 0.4;
    this.crInner.position.set(pistonX + rodLen * 0.7, crankY * 0.15, 0);
    this.crInner.scale.x = (rodLen * 0.6) / 0.4;
    this.flywheel.rotation.x = phi;

    // temperature-driven color
    const css = tempToCss(state.T, derived.TC, derived.TH);
    this.gasMat.color.set(css);
    this.gasMat.emissive.set(css);
    this.gasMat.opacity = toggles.SHOW_GAS_VOLUME_MESH ? (0.04 + 0.12 * (state.T - derived.TC) / (derived.TH - derived.TC)) : 0;
    if (toggles.SHOW_TEMPERATURE_GRADIENT) this.gasMat.opacity *= 1.3;
    this.mercury.scale.y = THREE.MathUtils.clamp((state.T - 250) / (650 - 250), 0.05, 1);
    this.mercury.position.y = -0.23 + (0.46 * this.mercury.scale.y) / 2;
    this.mercury.material.color.set(css);
    if (toggles.SHOW_TEMP_GLOW) {
      this.headMat.emissiveIntensity = state.contact === 'INSULATOR' ? 0 : 0.8;
    } else {
      this.headMat.emissiveIntensity = 0;
    }
    this.headMat.emissive.set(state.contact === 'HOT' ? 0xff6b35 : state.contact === 'COLD' ? 0x3fa9f5 : 0x000000);
    this.headMat.color.set(state.contact === 'INSULATOR' ? 0x8a8a8a : 0xb87333);

    // pressure gauge
    const angle = THREE.MathUtils.mapLinear(Math.min(state.P, derived.P1 * 1.05), 0, derived.P1 * 1.05, -2.2, 2.2);
    this.gaugeNeedle.rotation.z = angle;

    // work meter (cumulative work), needle sweeps proportional to Wcum/Wnet
    const wFrac = THREE.MathUtils.clamp(state.Wcum / (derived.Wnet * 1.2), -1, 1);
    this.workMeterNeedle.rotation.z = -Math.PI / 2 + wFrac * 2.4;

    // work arrow: length/opacity from instantaneous power
    const pw = THREE.MathUtils.clamp(Math.abs(state.powerOut) / 3000, 0.15, 1.4);
    this.workArrow.scale.setScalar(pw);
    this.workArrow.material.color.set(state.powerOut >= 0 ? 0xf5d547 : 0x6699ff);
    this.workArrow.visible = toggles.SHOW_WORK_ARROW;
    this.workArrow.rotation.z = state.powerOut >= 0 ? -Math.PI / 2 : Math.PI / 2;

    // reservoirs: shuttle slides to the active plate's Z, contact glow pulses
    const targetZ = state.contact === 'HOT' ? -0.45 : state.contact === 'COLD' ? 0.45 : 0;
    this._shuttleZ += (targetZ - this._shuttleZ) * Math.min(1, dt * 6);
    this.shuttle.position.z = this._shuttleZ;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    this.hotRes.material.emissiveIntensity = state.contact === 'HOT' ? 0.5 + 0.3 * pulse : 0.08;
    this.coldRes.material.emissiveIntensity = state.contact === 'COLD' ? 0.5 + 0.3 * pulse : 0.08;

    // heat arrows travel between reservoir slot and cylinder head
    const showHeat = toggles.SHOW_HEAT_ARROWS && state.contact !== 'INSULATOR' && Math.abs(state.heatFlux) > 1e-6;
    const fromZ = state.contact === 'HOT' ? -0.45 : 0.45;
    const dir = state.contact === 'HOT' ? 1 : -1;
    for (let i = 0; i < this.heatArrows.length; i++) {
      const a = this.heatArrows[i];
      a.visible = showHeat && toggles.SHOW_ENERGY_PARTICLES;
      if (!a.visible) continue;
      const t = ((performance.now() * 0.0006 * (0.5 + Math.abs(state.heatFlux) / 4000)) + i / this.heatArrows.length) % 1;
      const tt = state.contact === 'HOT' ? t : 1 - t;
      a.position.set(headX - 0.25 * (1 - tt), 0.02, fromZ * (1 - tt));
      a.rotation.z = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
      a.material.color.set(state.contact === 'HOT' ? 0xff6b35 : 0x3fa9f5);
    }
    this.hotLabel.element.style.opacity = (toggles.SHOW_HEAT_ARROW_LABELS && state.contact === 'HOT') ? '1' : '0.15';
    this.coldLabel.element.style.opacity = (toggles.SHOW_HEAT_ARROW_LABELS && state.contact === 'COLD') ? '1' : '0.15';

    // state tag near piston at exact integer phases
    const nearInt = Math.min(state.u, 1 - state.u) < 0.01;
    this.stateTag.position.set(pistonX, 0.16, 0);
    if (toggles.SHOW_STATE_TAGS && nearInt) {
      const idx = state.u < 0.5 ? state.phaseIndex + 1 : state.phaseIndex + 2;
      this.stateTag.element.textContent = String(((idx - 1) % 4) + 1);
      this.stateTag.element.style.opacity = '1';
    } else {
      this.stateTag.element.style.opacity = '0';
    }

    if (toggles.SHOW_DIMENSION_LINES) {
      this.dimGroup.position.x = headX;
      this.dimLine.scale.x = Math.max(L, 1e-4);
      this.dimLabel.position.x = L / 2;
      this.dimLabel.element.textContent = `x = ${state.x.toFixed(3)} m · A = ${derived.A.toFixed(4)} m² · V = ${(state.V * 1000).toFixed(2)} L`;
    }

    this._applyVisibility(toggles);
    this._updateCameraTween();
    if (toggles.ORBIT_AUTO) this.controls.autoRotate = true; else this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.update();
  }

  _applyVisibility(t) {
    this.wall.visible = t.SHOW_CYLINDER_WALL;
    this.bore.visible = t.SHOW_BORE_INTERIOR;
    this.head.visible = t.SHOW_CYLINDER_HEAD;
    this.piston.visible = t.SHOW_PISTON;
    for (const r of this.pistonRings) r.visible = t.SHOW_PISTON_RINGS;
    this.rod.visible = t.SHOW_PISTON_ROD;
    this.crOuter.visible = this.crInner.visible = t.SHOW_CONNECTING_ROD;
    this.flywheel.visible = t.SHOW_FLYWHEEL;
    this.workMeter.visible = t.SHOW_OUTPUT_SHAFT;
    this.hotRes.visible = t.SHOW_HOT_RESERVOIR;
    this.coldRes.visible = t.SHOW_COLD_RESERVOIR;
    this.insRes.visible = t.SHOW_INSULATOR;
    this.rail.visible = t.SHOW_RESERVOIR_RAIL;
    this.stage.visible = t.SHOW_STAGE;
    this.gauge.visible = t.SHOW_PRESSURE_GAUGE;
    this.thermo.visible = t.SHOW_THERMOMETER;
    this.gasMesh.visible = t.SHOW_GAS_VOLUME_MESH;
    this.dimGroup.visible = t.SHOW_DIMENSION_LINES;
    this.renderer.shadowMap.enabled = t.SHADOWS;
    for (const el of [this.labelHead, this.labelPiston, this.labelFlywheel, this.stateTag, this.hotLabel, this.coldLabel]) {
      el.visible = t.SHOW_LABELS_3D;
    }
    this.wall.material.opacity = t.CUTAWAY_MODE ? 0.18 : 0.5;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
