import { params, derived, rebuild, computeState, runAcceptanceTests } from './physics.js';
import { EngineScene } from './scene3d.js';
import { GasParticles } from './particles.js';
import { buildToggleDrawer } from './ui/toggles.js';
import { drawPV, drawTS, drawSankey, drawStrip, renderTable } from './graphs.js';
import { PROCESS_NAME } from './colors.js';

runAcceptanceTests();

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const viewport = document.getElementById('viewport');
const drawerRoot = document.getElementById('drawer-root');
const splitter = document.getElementById('splitter');
const leftPane = document.getElementById('left-pane');
const rightPane = document.getElementById('right-pane');
const app = document.getElementById('app');

const el = {
  phaseBadge: document.getElementById('phase-badge'),
  effReadout: document.getElementById('eff-readout'),
  playBtn: document.getElementById('play-btn'),
  speedRange: document.getElementById('speed-range'),
  speedVal: document.getElementById('speed-val'),
  scrub: document.getElementById('scrub'),
  loopBtn: document.getElementById('loop-btn'),
  stepBack: document.getElementById('step-back'),
  stepFwd: document.getElementById('step-fwd'),
  fps: document.getElementById('fps-overlay'),
  stateDump: document.getElementById('state-dump'),
  presetLayout: document.getElementById('layout-preset'),
  table: document.getElementById('table-panel'),
  strips: document.getElementById('strip-grid'),
  assumptions: document.getElementById('assumptions-overlay'),
};

const canvases = {
  pv: document.getElementById('canvas-pv'),
  ts: document.getElementById('canvas-ts'),
  sankey: document.getElementById('canvas-sankey'),
};

// ---------------------------------------------------------------------------
// Scene + particles
// ---------------------------------------------------------------------------
const engineScene = new EngineScene(viewport);
const particles = new GasParticles(engineScene.gasGroup, 800);

// ---------------------------------------------------------------------------
// Toggle drawer
// ---------------------------------------------------------------------------
const { state: toggles, refreshControl } = buildToggleDrawer(drawerRoot, onToggleChange);
applyStaticToggles();

function onToggleChange(id, value) {
  if (['GAMMA', 'N_MOLES', 'T_H', 'T_C', 'V1', 'RATIO_r'].includes(id)) {
    updatePhysicsParams();
  }
  if (id === 'RUN_REVERSED') params.reversed = !!value;
  if (id === 'IRREVERSIBILITY') params.irreversibility = !!value;
  if (id === 'FRICTION') params.friction = !!value;
  if (id === 'CAMERA_PRESET') engineScene.setCameraPreset(value);
  if (id === 'PARTICLE_COUNT') particles.setActiveCount(value);
  if (id === 'SEEDED_PARTICLES' && value) particles.reseed(derived.TH);
  applyStaticToggles();
}

function updatePhysicsParams() {
  params.gamma = { '5/3': 5 / 3, '7/5': 7 / 5, '4/3': 4 / 3 }[toggles.GAMMA];
  params.n = toggles.N_MOLES;
  params.TH = Math.max(toggles.T_H, toggles.T_C + 10);
  params.TC = Math.min(toggles.T_C, toggles.T_H - 10);
  params.V1_L = toggles.V1;
  params.r = toggles.RATIO_r;
  rebuild();
  particles.reseed(derived.TH);
  historyBuf.length = 0; ghostBuf.length = 0;
  runAcceptanceTests();
}

function applyStaticToggles() {
  document.body.classList.toggle('light', !toggles.DARK_MODE);
  document.body.classList.toggle('hide-ui', toggles.HIDE_UI);
  document.body.classList.toggle('colorblind', toggles.COLORBLIND_SAFE);
  el.table.style.display = toggles.GRAPH_TABLE ? '' : 'none';
  el.strips.style.display = toggles.GRAPH_STRIP ? '' : 'none';
  el.assumptions.style.display = toggles.SHOW_ASSUMPTION_LIST ? '' : 'none';
  document.getElementById('panel-pv').style.display = toggles.GRAPH_PV ? '' : 'none';
  document.getElementById('panel-ts').style.display = toggles.GRAPH_TS ? '' : 'none';
  document.getElementById('panel-sankey').style.display = toggles.GRAPH_SANKEY ? '' : 'none';
  el.fps.style.display = toggles.SHOW_FPS ? '' : 'none';
  el.stateDump.style.display = toggles.SHOW_STATE_VECTOR ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Clock / playback state machine (§3.1)
// ---------------------------------------------------------------------------
const CYCLE_DURATION = 12.0;
let s = 0;
let mode = 'PLAY';
let prevState = null;
let lastTime = performance.now();
let historyBuf = [];      // ring buffer of {t, phase, ...state}
let ghostBuf = [];          // previous full-cycle snapshot for ghost trail
let cycleStartTime = 0;

// initial physics param sync from defaults
updatePhysicsParams();
let simTime = 0;

el.playBtn.onclick = () => { mode = mode === 'PLAY' ? 'PAUSE' : 'PLAY'; el.playBtn.textContent = mode === 'PLAY' ? '⏸ Pause' : '▶ Play'; };
el.loopBtn.onclick = () => { toggles.LOOP = !toggles.LOOP; el.loopBtn.classList.toggle('active', toggles.LOOP); };
el.loopBtn.classList.toggle('active', toggles.LOOP);
el.stepBack.onclick = () => { s = (((Math.ceil(s - 1.001)) % 4) + 4) % 4; mode = 'PAUSE'; el.playBtn.textContent = '▶ Play'; };
el.stepFwd.onclick = () => { s = ((Math.floor(s + 1.001)) % 4 + 4) % 4; mode = 'PAUSE'; el.playBtn.textContent = '▶ Play'; };
el.speedRange.oninput = () => { toggles.PLAYBACK_SPEED = parseFloat(el.speedRange.value); el.speedVal.textContent = toggles.PLAYBACK_SPEED.toFixed(2) + '×'; refreshControl('PLAYBACK_SPEED'); };
el.speedRange.value = toggles.PLAYBACK_SPEED;
el.speedVal.textContent = toggles.PLAYBACK_SPEED.toFixed(2) + '×';
el.scrub.oninput = () => { s = parseFloat(el.scrub.value); mode = 'SCRUB'; };
el.scrub.onchange = () => { mode = mode === 'SCRUB' ? 'PAUSE' : mode; el.playBtn.textContent = '▶ Play'; };

document.querySelectorAll('.layout-btn').forEach(btn => {
  btn.onclick = () => setLayout(btn.dataset.layout);
});
function setLayout(name) {
  app.dataset.layout = name;
  if (name === '3d-only') { leftPane.style.flex = '1 1 100%'; rightPane.style.display = 'none'; }
  else if (name === 'graphs-only') { leftPane.style.display = 'none'; rightPane.style.flex = '1 1 100%'; }
  else { leftPane.style.display = ''; rightPane.style.display = ''; leftPane.style.flex = name === 'theater' ? '1 1 74%' : '1 1 58%'; rightPane.style.flex = name === 'theater' ? '1 1 26%' : '1 1 42%'; }
  engineScene.resize();
}

// draggable splitter
let dragging = false;
splitter.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const rect = app.getBoundingClientRect();
  const frac = Math.min(0.85, Math.max(0.2, (e.clientX - rect.left) / rect.width));
  leftPane.style.flex = `1 1 ${frac * 100}%`;
  rightPane.style.flex = `1 1 ${(1 - frac) * 100}%`;
  engineScene.resize();
});

// ---------------------------------------------------------------------------
// ds/dt weighting (§3.2) — affects only the s<->time mapping, never physics
// ---------------------------------------------------------------------------
function phaseWeight(phaseIndex) {
  const d = derived;
  switch (toggles.TIME_WEIGHTING) {
    case 'PROPORTIONAL_TO_WORK': {
      const w = [d.QH, d.WB, d.QC, d.WB];
      return Math.abs(w[phaseIndex]);
    }
    case 'PROPORTIONAL_TO_VOLUME': {
      const dv = [d.V2 - d.V1, d.V3 - d.V2, d.V3 - d.V4, d.V4 - d.V1];
      return Math.abs(dv[phaseIndex]);
    }
    case 'LOG_VOLUME': {
      const rat = [d.V2 / d.V1, d.V3 / d.V2, d.V3 / d.V4, d.V4 / d.V1];
      return Math.abs(Math.log(rat[phaseIndex]));
    }
    default: return 1;
  }
}

function advanceS(dtReal) {
  const speed = toggles.PLAYBACK_SPEED;
  const phaseIndex = Math.floor(s) % 4;
  let slow = toggles.SLOWMO_ON_ISOTHERMAL && (phaseIndex === 0 || phaseIndex === 2) ? 0.5 : 1;
  const weights = [0, 1, 2, 3].map(phaseWeight);
  const sumW = weights.reduce((a, b) => a + b, 0) || 4;
  const wNorm = weights[phaseIndex] / (sumW / 4); // 1.0 average
  let ds = (dtReal * speed * slow / CYCLE_DURATION) * 4 * wNorm;
  if (params.reversed) ds = -ds;
  let sNext = s + ds;
  if (toggles.PAUSE_AT_PHASE_BOUNDARY) {
    const nextBoundary = params.reversed ? Math.ceil(s - 1e-6) - 1 : Math.floor(s + 1e-6) + 1;
    if ((!params.reversed && sNext >= nextBoundary) || (params.reversed && sNext <= nextBoundary)) {
      sNext = nextBoundary;
      mode = 'PAUSE'; el.playBtn.textContent = '▶ Play';
    }
  }
  if (sNext >= 4) {
    if (toggles.LOOP) { ghostBuf.length = 0; ghostBuf.push(...historyBuf.map(h => ({ V: h.V, P: h.P }))); sNext -= 4; historyBuf.length = 0; }
    else { sNext = 3.999; mode = 'PAUSE'; el.playBtn.textContent = '▶ Play'; }
  } else if (sNext < 0) {
    sNext += 4;
  }
  return sNext;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function frame(now) {
  const dtWall = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (mode === 'PLAY') {
    s = advanceS(dtWall);
    simTime += dtWall;
  }

  const opts = { smoothVolume: toggles.SMOOTH_VOLUME };
  const state = computeState(s, mode === 'PLAY' ? Math.max(dtWall, 1e-4) : 1e-4, prevState, opts);
  prevState = state;

  const particleDt = mode === 'PLAY' ? dtWall * toggles.PLAYBACK_SPEED : 0;
  particles.step(particleDt, state, toggles);
  particles.sync(state, toggles);

  engineScene.update(state, toggles, dtWall);
  engineScene.render();

  historyBuf.push({ t: simTime, phase: state.phaseIndex, V: state.V, P: state.P, T: state.T, S: state.S, U: state.U, Qcum: state.Qcum, Wcum: state.Wcum });
  if (historyBuf.length > 3000) historyBuf.shift();

  if (toggles.GRAPH_PV) drawPV(canvases.pv, state, historyBuf, ghostBuf, toggles);
  if (toggles.GRAPH_TS) drawTS(canvases.ts, state, toggles);
  if (toggles.GRAPH_SANKEY) drawSankey(canvases.sankey, state, toggles);
  if (toggles.GRAPH_STRIP) updateStrips(historyBuf);
  if (toggles.GRAPH_TABLE) renderTable(el.table, state);

  updateHeader(state);
  if (toggles.SHOW_FPS) el.fps.textContent = `${(1 / Math.max(dtWall, 1e-4)).toFixed(0)} fps`;
  if (toggles.SHOW_STATE_VECTOR) el.stateDump.textContent = JSON.stringify({
    s: +state.s.toFixed(3), phase: state.phaseIndex, V_L: +(state.V * 1000).toFixed(3), P_kPa: +(state.P / 1000).toFixed(2),
    T_K: +state.T.toFixed(2), S: +state.S.toFixed(3), U_J: +state.U.toFixed(1), Wcum: +state.Wcum.toFixed(1), Qcum: +state.Qcum.toFixed(1), contact: state.contact,
  }, null, 2);

  if (mode !== 'SCRUB') el.scrub.value = s;

  requestAnimationFrame(frame);
}

function updateHeader(state) {
  el.phaseBadge.textContent = `${PROCESS_NAME[state.phaseIndex]} · ${(state.u * 100).toFixed(0)}%`;
  el.phaseBadge.className = 'phase-badge phase-' + state.phaseIndex;
  const eta = derived.etaCarnot;
  el.effReadout.textContent = params.reversed
    ? `COP_R = ${derived.COP_R.toFixed(2)}  COP_HP = ${derived.COP_HP.toFixed(2)}`
    : `η = ${eta.toFixed(3)}  (W_net = ${state.Wcum.toFixed(0)} J)`;
}

let stripSelection = ['T', 'P', 'V', 'S', 'Q', 'W', 'U', 'eta'];
function buildStripDOM() {
  el.strips.innerHTML = '';
  for (const key of stripSelection) {
    const c = document.createElement('canvas');
    c.className = 'strip-canvas';
    c.dataset.key = key;
    el.strips.appendChild(c);
  }
}
buildStripDOM();
function updateStrips(hist) {
  el.strips.querySelectorAll('canvas').forEach(c => drawStrip(c, c.dataset.key, hist, toggles));
}

requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(frame); });
