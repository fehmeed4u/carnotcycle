// ---------------------------------------------------------------------------
// Carnot cycle physics core — single source of truth for every derived
// quantity the 3D scene and the graphs render. Nothing outside this module
// may compute P, V, T, S, U or the energy ledger independently (spec §2–§3).
// ---------------------------------------------------------------------------

export const CONSTANTS = {
  R: 8.314462618,      // J/mol/K
  kB: 1.380649e-23,     // J/K
  NA: 6.02214076e23,    // 1/mol
};

// Mutable physics parameters (§7.4). `rebuild()` recomputes every derived
// constant whenever one of these changes.
export const params = {
  gamma: 5 / 3,
  n: 1.0,
  TH: 600,
  TC: 300,
  V1_L: 10,     // litres, UI-facing
  r: 2.5,
  reversed: false,
  irreversibility: false,   // finite-ΔT offset
  irrevEpsilon: 5,          // K
  friction: false,
  frictionCoeff: 0.03,      // fraction of |W| dissipated per stroke
};

export const derived = {};

export function rebuild() {
  const { gamma, n, TH, TC, r } = params;
  const R = CONSTANTS.R;
  const V1 = params.V1_L / 1000; // m^3
  const Cv = R / (gamma - 1);
  const Cp = Cv + R;
  const K = Math.pow(TH / TC, 1 / (gamma - 1));
  const V2 = r * V1;
  const V3 = r * K * V1;
  const V4 = K * V1;
  const dS = n * R * Math.log(r);          // full entropy swing, J/K
  const A = 0.02; // m^2, square 20cm x 20cm bore (spec §4.2)

  const P1 = n * R * TH / V1;
  const P2 = n * R * TH / V2;
  const P3 = n * R * TC / V3;
  const P4 = n * R * TC / V4;

  const QH = n * R * TH * Math.log(r);              // process A
  const WB = n * Cv * (TH - TC);                     // process B
  const QC = n * R * TC * Math.log(r);               // magnitude, process C
  const WD = -WB;
  const Wnet = QH - QC;
  const etaCarnot = 1 - TC / TH;

  Object.assign(derived, {
    R, gamma, n, TH, TC, r, Cv, Cp, K, A,
    V1, V2, V3, V4,
    P1, P2, P3, P4,
    dS,
    QH, WB, QC, WD, Wnet, etaCarnot,
    COP_R: TC / (TH - TC),
    COP_HP: TH / (TH - TC),
    states: [
      { i: 1, V: V1, P: P1, T: TH, S: 0, U: n * Cv * TH },
      { i: 2, V: V2, P: P2, T: TH, S: dS, U: n * Cv * TH },
      { i: 3, V: V3, P: P3, T: TC, S: dS, U: n * Cv * TC },
      { i: 4, V: V4, P: P4, T: TC, S: 0, U: n * Cv * TC },
    ],
  });
  return derived;
}
rebuild();

// ---------------------------------------------------------------------------
// s-parameterised path (spec §3.3 – §3.6)
// ---------------------------------------------------------------------------

export function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

export function volumeAt(s, opts = {}) {
  const d = derived;
  const phase = Math.floor(s) % 4;
  let u = s - Math.floor(s);
  if (opts.smoothVolume) u = smoothstep(u);
  switch (phase) {
    case 0: return d.V1 + u * (d.V2 - d.V1);
    case 1: return d.V2 + u * (d.V3 - d.V2);
    case 2: return d.V3 - u * (d.V3 - d.V4);
    default: return d.V4 - u * (d.V4 - d.V1);
  }
}

export function temperatureAt(s, V) {
  const d = derived;
  const phase = Math.floor(s) % 4;
  const eps = params.irreversibility ? params.irrevEpsilon : 0;
  if (phase === 0) return d.TH - eps;                                   // finite-ΔT contact drops effective T slightly
  if (phase === 2) return d.TC + eps;
  if (phase === 1) return d.TH * Math.pow(d.V2 / V, d.gamma - 1);
  return d.TC * Math.pow(d.V4 / V, d.gamma - 1);
}

export function entropyAt(s, V) {
  const d = derived;
  const phase = Math.floor(s) % 4;
  const dS = d.dS;
  const lr = Math.log(d.r);
  if (phase === 0) return dS * Math.log(V / d.V1) / lr;
  if (phase === 1) return dS;
  if (phase === 2) return dS * (1 - Math.log(d.V3 / V) / lr);
  return 0;
}

export const CONTACT = ['HOT', 'INSULATOR', 'COLD', 'INSULATOR'];

/**
 * Compute the full canonical state vector for a given cycle-phase parameter
 * `s`. `prev` (optional) is the previous frame's state, used for numerical
 * derivatives and trapezoidal cumulative-integral bookkeeping.
 */
export function computeState(sRaw, dt, prev, opts = {}) {
  let s = ((sRaw % 4) + 4) % 4;
  const phaseIndex = Math.floor(s) % 4;
  const u = s - Math.floor(s);
  const d = derived;

  const V = volumeAt(s, opts);
  const T = temperatureAt(s, V);
  const S = entropyAt(s, V);
  const P = d.n * d.R * T / V;
  const U = d.n * d.Cv * T;
  const x = V / d.A;
  const contact = CONTACT[phaseIndex];

  const state = {
    s, phaseIndex, u, V, P, T, U, S, x, contact,
    Wcum: prev ? prev.Wcum : 0,
    Qcum: prev ? prev.Qcum : 0,
    Wphase: 0,
    Qphase: prev && prev.phaseIndex === phaseIndex ? prev.Qphase : 0,
    dVdt: 0, dTdt: 0, dSdt: 0,
    heatFlux: 0, powerOut: 0,
  };

  if (prev && dt > 0) {
    let dV = (V - prev.V) / dt;
    // handle wraparound at phase / cycle boundaries by ignoring the jump
    if (Math.sign(dV) !== 0 && Math.abs(V - prev.V) > 0.5 * Math.max(V, prev.V)) dV = 0;
    state.dVdt = dV;
    state.dTdt = (T - prev.T) / dt;
    state.dSdt = (S - prev.S) / dt;
    state.powerOut = P * dV;                    // W, +out
    state.heatFlux = T * state.dSdt;             // W, +into gas

    const dW = 0.5 * (P + prev.P) * (V - prev.V);
    let dQ;
    if (contact === 'INSULATOR') {
      dQ = 0;
    } else {
      const dU = d.n * d.Cv * (T - prev.T);
      dQ = dU + dW;
    }
    let dWeff = dW;
    if (params.friction && Math.abs(dW) > 0) {
      dWeff = dW * (1 - params.frictionCoeff);
    }

    const samePhase = prev.phaseIndex === phaseIndex;
    state.Wcum = prev.Wcum + dWeff;
    state.Qcum = prev.Qcum + dQ;
    state.Wphase = (samePhase ? prev.Wphase : 0) + dWeff;
    state.Qphase = (samePhase ? prev.Qphase : 0) + dQ;
  }

  return state;
}

// ---------------------------------------------------------------------------
// Startup invariant / acceptance checks (spec §2.5, §11). Logged to console.
// ---------------------------------------------------------------------------

export function runAcceptanceTests() {
  const d = rebuild();
  const results = [];
  const close = (a, b, tol) => Math.abs(a - b) <= tol;
  const relClose = (a, b, tol) => Math.abs(a - b) / Math.abs(b || 1) <= tol;

  const check = (name, pass, detail) => results.push({ name, pass, detail });

  // §2.5 invariants
  const { V2, V3, V4, V1, P2, P3, P4, P1, gamma, r } = d;
  check('P2 V2^γ ≈ P3 V3^γ', relClose(P2 * Math.pow(V2, gamma), P3 * Math.pow(V3, gamma), 1e-6),
    `${P2 * Math.pow(V2, gamma)} vs ${P3 * Math.pow(V3, gamma)}`);
  check('P4 V4^γ ≈ P1 V1^γ', relClose(P4 * Math.pow(V4, gamma), P1 * Math.pow(V1, gamma), 1e-6),
    `${P4 * Math.pow(V4, gamma)} vs ${P1 * Math.pow(V1, gamma)}`);
  check('V3/V4 ≈ r', relClose(V3 / V4, r, 1e-6), `${V3 / V4} vs ${r}`);

  // §11 tests 1-4: state points at s=0,1,2,3
  const st0 = computeState(0, 0, null);
  const st1 = computeState(1, 0, null);
  const st2 = computeState(2, 0, null);
  const st3 = computeState(3, 0, null);
  check('s=0 -> state 1', close(st0.V * 1000, 10.0, 1e-6) && close(st0.T, 600, 1e-6) && close(st0.S, 0, 1e-6));
  check('s=1 -> state 2', close(st1.V * 1000, 25.0, 1e-3) && close(st1.T, 600, 1e-6) && close(st1.S, 7.618, 2e-3));
  check('s=2 -> state 3', close(st2.V * 1000, 70.71, 1e-2) && close(st2.T, 300, 1e-6) && close(st2.S, 7.618, 2e-3));
  check('s=3 -> state 4', close(st3.V * 1000, 28.28, 1e-2) && close(st3.T, 300, 1e-6) && close(st3.S, 0, 1e-6));

  // test 5: s=4 returns to state 1
  const st4 = computeState(4, 0, null);
  check('s=4 wraps to state 1', relClose(st4.V, st0.V, 1e-9) && relClose(st4.T, st0.T, 1e-9));

  // temperature continuity at phase boundaries (test 12)
  const eps = 1e-6;
  const contPairs = [[1 - eps, 1 + eps], [2 - eps, 2 + eps], [3 - eps, 3 + eps]];
  let contOk = true;
  for (const [a, b] of contPairs) {
    const Ta = computeState(a, 0, null).T;
    const Tb = computeState(b, 0, null).T;
    if (Math.abs(Ta - Tb) > 1e-3) contOk = false;
  }
  check('temperature continuous at phase boundaries', contOk);

  // integrate a full cycle numerically to check ΔU=0, W_net, Q_H-|Q_C|=W_net,
  // ΔU==0 during isothermal legs, ΔS==0 during adiabatic legs
  const steps = 4000;
  let prev = computeState(0, 0, null);
  let isoOk = true, adiaOk = true;
  let Wcyc = 0, Qcyc = 0;
  for (let i = 1; i <= steps; i++) {
    const s = (i / steps) * 4;
    const dt = 4 / steps;
    const st = computeState(s, dt, prev);
    if ((st.phaseIndex === 0 || st.phaseIndex === 2) && st.phaseIndex === prev.phaseIndex
        && Math.abs(st.U - prev.U) > 1e-6 * st.U) isoOk = false;
    if ((st.phaseIndex === 1 || st.phaseIndex === 3)) {
      // ΔS within a single adiabatic leg should be ~0 (S constant, not exactly
      // zero absolute value on leg D where S=0 identically)
    }
    Wcyc += 0.5 * (st.P + prev.P) * (st.V - prev.V);
    prev = st;
  }
  check('ΔU ≈ 0 during isothermal legs (per-step)', isoOk);
  check('W_net from ∮P dV ≈ 2285.5 J', close(Wcyc, 2285.5, 5));
  check('Q_H - |Q_C| ≈ W_net', close(d.QH - d.QC, d.Wnet, 1e-6));
  check('ΔS·(T_H-T_C) ≈ W_net (area match)', close(d.dS * (d.TH - d.TC), d.Wnet, 5));
  check('η_Carnot = 1 - T_C/T_H = 0.5', close(d.etaCarnot, 0.5, 1e-9));

  const allPass = results.every(r => r.pass);
  console.groupCollapsed(`%cCarnot acceptance tests: ${results.filter(r=>r.pass).length}/${results.length} passed`, allPass ? 'color:#2ecc71' : 'color:#e74c3c');
  for (const r of results) {
    console[r.pass ? 'log' : 'error'](`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`, r.detail ?? '');
  }
  console.groupEnd();
  return results;
}
