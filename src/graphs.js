import { derived } from './physics.js';
import { PROCESS_COLOR_BY_INDEX, COLORBLIND_PROCESS_COLOR_BY_INDEX, PROCESS_NAME, GOLD } from './colors.js';

// ---------------------------------------------------------------------------
// Canvas2D graph panels (spec §6). Crisp at DPR<=3, shared x-history ring
// buffer supplied by main.js. Every draw function takes the SAME state `s`
// value the 3D scene rendered this frame — no independent timing.
// ---------------------------------------------------------------------------

export function fitCanvas(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function colorFor(idx, colorblind) {
  return (colorblind ? COLORBLIND_PROCESS_COLOR_BY_INDEX : PROCESS_COLOR_BY_INDEX)[idx];
}

function drawAxes(ctx, w, h, pad, xLabel, yLabel, theme) {
  ctx.strokeStyle = theme.axis;
  ctx.fillStyle = theme.text;
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();
  ctx.fillText(yLabel, 6, pad.t + 4);
  ctx.fillText(xLabel, w - pad.r - ctx.measureText(xLabel).width, h - 4);
}

function scaleFns(pad, w, h, xmin, xmax, ymin, ymax, logX, logY) {
  const X = (v) => {
    const vv = logX ? Math.log10(Math.max(v, 1e-6)) : v;
    const a = logX ? Math.log10(Math.max(xmin, 1e-6)) : xmin;
    const b = logX ? Math.log10(Math.max(xmax, 1e-6)) : xmax;
    return pad.l + (vv - a) / (b - a) * (w - pad.l - pad.r);
  };
  const Y = (v) => {
    const vv = logY ? Math.log10(Math.max(v, 1e-6)) : v;
    const a = logY ? Math.log10(Math.max(ymin, 1e-6)) : ymin;
    const b = logY ? Math.log10(Math.max(ymax, 1e-6)) : ymax;
    return h - pad.b - (vv - a) / (b - a) * (h - pad.t - pad.b);
  };
  return { X, Y };
}

const THEME = {
  axis: 'rgba(255,255,255,0.25)', text: 'rgba(255,255,255,0.55)', grid: 'rgba(255,255,255,0.08)',
};

// --- P-V diagram ------------------------------------------------------------

export function drawPV(canvas, state, cycleHistory, ghostHistory, toggles) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const d = derived;
  const pad = { l: 46, r: 14, t: 14, b: 26 };
  const Vmin = d.V1 * 1000 * 0.85, Vmax = d.V3 * 1000 * 1.08;
  const Pmin = d.P3 / 1000 * 0.5, Pmax = d.P1 / 1000 * 1.1;
  const { X, Y } = scaleFns(pad, w, h, Vmin, Vmax, Pmin, Pmax, toggles.LOG_SCALE_PV, toggles.LOG_SCALE_PV);
  drawAxes(ctx, w, h, pad, 'V (L)', 'P (kPa)', THEME);

  // isotherm / adiabat families
  if (toggles.SHOW_ISOTHERM_FAMILY) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    for (const T of [d.TC, 0.75 * d.TH, 0.5 * d.TH, d.TH]) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const V = Vmin + (i / 40) * (Vmax - Vmin);
        const P = d.n * d.R * T / (V / 1000);
        const px = X(V), py = Y(P / 1000);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  if (toggles.SHOW_ADIABAT_FAMILY) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([2, 6]);
    for (const [V0, P0] of [[d.V1, d.P1], [d.V2, d.P2], [d.V3, d.P3], [d.V4, d.P4]]) {
      const Cconst = P0 * Math.pow(V0, d.gamma);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const V = Vmin + (i / 40) * (Vmax - Vmin);
        const P = Cconst / Math.pow(V / 1000, d.gamma);
        const px = X(V), py = Y(P / 1000);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // process curves from analytic states (always exact, not from history)
  const N = 60;
  const segs = [];
  for (let phase = 0; phase < 4; phase++) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      let V;
      if (phase === 0) V = d.V1 + u * (d.V2 - d.V1);
      else if (phase === 1) V = d.V2 + u * (d.V3 - d.V2);
      else if (phase === 2) V = d.V3 - u * (d.V3 - d.V4);
      else V = d.V4 - u * (d.V4 - d.V1);
      const P = d.n * d.R * (phase === 0 ? d.TH : phase === 2 ? d.TC : phase === 1 ? d.TH * Math.pow(d.V2 / V, d.gamma - 1) : d.TC * Math.pow(d.V4 / V, d.gamma - 1)) / V;
      pts.push([V * 1000, P / 1000]);
    }
    segs.push(pts);
  }

  if (toggles.SHOW_AREA_SHADING) {
    ctx.beginPath();
    let first = true;
    for (const seg of segs) for (const [V, P] of seg) {
      const px = X(V), py = Y(P);
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(245,213,71,0.22)';
    ctx.fill();
  }

  for (let phase = 0; phase < 4; phase++) {
    ctx.strokeStyle = colorFor(phase, toggles.COLORBLIND_SAFE);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    segs[phase].forEach(([V, P], i) => {
      const px = X(V), py = Y(P);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  if (toggles.SHOW_GHOST_CYCLE && ghostHistory && ghostHistory.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ghostHistory.forEach((p, i) => {
      const px = X(p.V * 1000), py = Y(p.P / 1000);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  if (toggles.SHOW_STATE_MARKERS) {
    ctx.font = '11px Inter, sans-serif';
    d.states.forEach(st => {
      const px = X(st.V * 1000), py = Y(st.P / 1000);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(String(st.i), px + 6, py - 6);
    });
  }

  if (toggles.SHOW_LIVE_CURSOR) {
    const px = X(state.V * 1000), py = Y(state.P / 1000);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, h - pad.b); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`${(state.V * 1000).toFixed(2)} L, ${(state.P / 1000).toFixed(1)} kPa, ${state.T.toFixed(0)} K`, px + 8, py - 8);
  }

  if (toggles.SHOW_AREA_SHADING) {
    ctx.fillStyle = 'rgba(245,213,71,0.9)'; ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`W_net = ${d.Wnet.toFixed(1)} J`, w - pad.r - 110, pad.t + 14);
  }
}

// --- T-S diagram -------------------------------------------------------------

export function drawTS(canvas, state, toggles) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const d = derived;
  const pad = { l: 44, r: 14, t: 14, b: 26 };
  const Smax = d.dS * 1.25;
  const Tmin = d.TC * 0.85, Tmax = d.TH * 1.08;
  const { X, Y } = scaleFns(pad, w, h, 0, Smax, Tmin, Tmax, false, false);
  drawAxes(ctx, w, h, pad, 'S (J/K)', 'T (K)', THEME);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([4, 4]);
  for (const T of [d.TC, d.TH]) {
    ctx.beginPath(); ctx.moveTo(X(0), Y(T)); ctx.lineTo(X(Smax), Y(T)); ctx.stroke();
  }
  ctx.setLineDash([]);

  const eps = toggles.IRREVERSIBILITY ? d.dS * 0.06 : 0; // bow the rectangle outward
  const corners = [
    [0, d.TC], [d.dS, d.TC - eps], [d.dS, d.TH + eps], [0, d.TH],
  ];
  if (toggles.SHOW_AREA_SHADING) {
    ctx.beginPath();
    corners.forEach(([S, T], i) => { const px = X(S), py = Y(T); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(245,213,71,0.22)';
    ctx.fill();
  }
  const edgeColors = [PROCESS_COLOR_BY_INDEX[2], PROCESS_COLOR_BY_INDEX[1], PROCESS_COLOR_BY_INDEX[0], PROCESS_COLOR_BY_INDEX[3]];
  const cb = toggles.COLORBLIND_SAFE ? COLORBLIND_PROCESS_COLOR_BY_INDEX : PROCESS_COLOR_BY_INDEX;
  const order = [2, 1, 0, 3]; // edge index -> process color (D:4->1, A:1->2, B:2->3, C:3->4)
  const edgeProcess = [0, 1, 2, 3]; // bottom(A@T? ) simpler: color each edge by its process directly below
  ctx.lineWidth = 2.2;
  const pts = [[0, d.TC], [d.dS, d.TC - eps], [d.dS, d.TH + eps], [0, d.TH], [0, d.TC]];
  const procForEdge = [2, 1, 0, 3]; // 4->1 is D... map edges: (0,TC)->(dS,TC) is process C reversed direction visual; keep simple uniform
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = cb[[2, 1, 0, 3][i]];
    ctx.beginPath();
    ctx.moveTo(X(pts[i][0]), Y(pts[i][1]));
    ctx.lineTo(X(pts[i + 1][0]), Y(pts[i + 1][1]));
    ctx.stroke();
  }

  if (toggles.SHOW_STATE_MARKERS) {
    const labelsAt = [[0, d.TC, '4'], [d.dS, d.TC, '3'], [d.dS, d.TH, '2'], [0, d.TH, '1']];
    ctx.font = '11px Inter, sans-serif';
    for (const [S, T, lab] of labelsAt) {
      const px = X(S), py = Y(T);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(lab, px + 6, py - 6);
    }
  }

  if (toggles.SHOW_LIVE_CURSOR) {
    const px = X(state.S), py = Y(state.T);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, h - pad.b); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  }

  if (toggles.SHOW_AREA_SHADING) {
    ctx.fillStyle = 'rgba(245,213,71,0.9)'; ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`∮T dS = ${d.Wnet.toFixed(1)} J`, w - pad.r - 120, pad.t + 14);
  }
  if (toggles.SHOW_IRREV_GAP && toggles.IRREVERSIBILITY) {
    const etaActual = 1 - (d.QC * (1 + 0.02)) / (d.QH * (1 - 0.005));
    ctx.fillStyle = 'rgba(255,120,90,0.9)'; ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`η_actual ≈ ${etaActual.toFixed(3)} < η_Carnot ${d.etaCarnot.toFixed(3)}`, pad.l + 4, pad.t + 14);
  }
}

// --- Energy ledger / Sankey bars ---------------------------------------------

export function drawSankey(canvas, state, toggles) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const d = derived;
  const rows = [
    { label: 'Q_H (in)', value: d.QH, max: d.QH, color: '#FF4B2B' },
    { label: 'W_net (out)', value: d.Wnet, max: d.QH, color: '#F5D547' },
    { label: '|Q_C| (out)', value: -d.QC, max: d.QH, color: '#2E86DE' },
    { label: 'ΔU (cycle)', value: 0, max: d.QH, color: '#888' },
  ];
  const barH = Math.min(26, (h - 20) / rows.length - 8);
  const left = 96, right = w - 76;
  ctx.font = '11px "JetBrains Mono", monospace';
  rows.forEach((r, i) => {
    const y = 12 + i * (barH + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(r.label, 0, y + barH * 0.7);
    const frac = Math.abs(r.value) / r.max;
    const barW = Math.max(1, frac * (right - left));
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(left, y, right - left, barH);
    ctx.fillStyle = r.color;
    if (r.value >= 0) ctx.fillRect(left, y, barW, barH);
    else ctx.fillRect(left + (right - left) - barW, y, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${r.value >= 0 ? '+' : ''}${r.value.toFixed(1)} J`, right + 4, y + barH * 0.7);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`η_Carnot = ${d.etaCarnot.toFixed(3)}  |  live phase energy: ${state.Qphase.toFixed(0)} J`, 0, h - 6);
}

// --- Strip charts --------------------------------------------------------

const STRIP_DEFS = {
  T: { label: 'T (K)', get: s => s.T, min: () => derived.TC * 0.9, max: () => derived.TH * 1.05 },
  P: { label: 'P (kPa)', get: s => s.P / 1000, min: () => derived.P3 / 1000 * 0.5, max: () => derived.P1 / 1000 * 1.1 },
  V: { label: 'V (L)', get: s => s.V * 1000, min: () => derived.V1 * 1000 * 0.8, max: () => derived.V3 * 1000 * 1.1 },
  S: { label: 'S (J/K)', get: s => s.S, min: () => -derived.dS * 0.1, max: () => derived.dS * 1.1 },
  Q: { label: 'Q_cum (J)', get: s => s.Qcum, min: () => -derived.QC * 1.2, max: () => derived.QH * 1.2 },
  W: { label: 'W_cum (J)', get: s => s.Wcum, min: () => -derived.Wnet * 0.3, max: () => derived.Wnet * 1.3 },
  U: { label: 'U (J)', get: s => s.U, min: () => derived.n * derived.Cv * derived.TC * 0.9, max: () => derived.n * derived.Cv * derived.TH * 1.1 },
  eta: { label: 'η running', get: s => s.Qcum > 1e-6 ? Math.max(0, s.Wcum / Math.max(s.Qcum, 1e-6)) : 0, min: () => 0, max: () => 0.7 },
};

export function drawStrip(canvas, key, history, toggles) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const def = STRIP_DEFS[key];
  if (!def || history.length < 2) return;
  const pad = { l: 42, r: 8, t: 10, b: 16 };
  const tmin = history[0].t, tmax = history[history.length - 1].t;
  const ymin = def.min(), ymax = def.max();
  const { X, Y } = scaleFns(pad, w, h, tmin, Math.max(tmax, tmin + 1e-6), ymin, ymax, false, false);

  if (toggles.SHOW_PROCESS_BANDS) {
    let segStart = null, segPhase = history[0].phase;
    for (let i = 0; i <= history.length; i++) {
      const p = i < history.length ? history[i] : null;
      if (segStart === null) { segStart = history[i] ? history[i].t : tmax; segPhase = p ? p.phase : segPhase; }
      if (!p || p.phase !== segPhase) {
        const x0 = X(segStart), x1 = X(p ? p.t : tmax);
        ctx.fillStyle = colorFor(segPhase, toggles.COLORBLIND_SAFE) + '22';
        ctx.fillRect(x0, pad.t, Math.max(1, x1 - x0), h - pad.t - pad.b);
        segStart = p ? p.t : null; segPhase = p ? p.phase : segPhase;
      }
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText(def.label, 4, pad.t + 8);

  ctx.strokeStyle = '#F5D547'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  history.forEach((p, i) => {
    const px = X(p.t), py = Y(def.get(p));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();

  const last = history[history.length - 1];
  const px = X(last.t), py = Y(def.get(last));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
}

// --- Data table --------------------------------------------------------

export function renderTable(container, state) {
  const d = derived;
  const rows = d.states.map(st => {
    const isCurrent = state.phaseIndex === (st.i - 1) % 4 && (Math.abs(state.u) < 0.02 || Math.abs(state.u - 1) < 0.02) && Math.round(state.s) % 4 === (st.i % 4);
    return `<tr class="${isCurrent ? 'current' : ''}"><td>${st.i}</td><td>${(st.V * 1000).toFixed(2)}</td><td>${(st.P / 1000).toFixed(2)}</td><td>${st.T.toFixed(0)}</td><td>${st.S.toFixed(3)}</td><td>${st.U.toFixed(1)}</td></tr>`;
  }).join('');
  container.innerHTML = `<table class="data-table"><thead><tr><th>State</th><th>V (L)</th><th>P (kPa)</th><th>T (K)</th><th>S (J/K)</th><th>U (J)</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="ledger-mini">Q_H=+${d.QH.toFixed(1)} J · W_A=+${d.QH.toFixed(1)} J · W_B=+${d.WB.toFixed(1)} J · |Q_C|=${d.QC.toFixed(1)} J · W_C=-${d.QC.toFixed(1)} J · W_D=-${d.WB.toFixed(1)} J · <b>W_net=+${d.Wnet.toFixed(1)} J</b> · η=${d.etaCarnot.toFixed(3)} · ΔS=${d.dS.toFixed(3)} J/K</div>`;
}
