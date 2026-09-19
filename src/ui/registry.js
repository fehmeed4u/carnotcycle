// ---------------------------------------------------------------------------
// Exhaustive toggle registry (spec §7). Each entry: id, label, group, type,
// default. `type` is 'bool' | 'enum' | 'range'. Persisted to localStorage
// under STORAGE_KEY, with named presets.
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'carnot.toggles.v1';

export const GROUPS = ['Scene', 'Gas', 'Flow', 'Physics', 'Graphs', 'Sim', 'Camera'];

export const REGISTRY = [
  // §7.1 Scene — geometry & objects
  { id: 'SHOW_CYLINDER_WALL', label: 'Cylinder wall', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_CYLINDER_HEAD', label: 'Cylinder head', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_PISTON', label: 'Piston', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_PISTON_RINGS', label: 'Piston rings', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_PISTON_ROD', label: 'Piston rod / rack', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_CONNECTING_ROD', label: 'Connecting rod', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_FLYWHEEL', label: 'Flywheel', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_OUTPUT_SHAFT', label: 'Output shaft + work meter', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_HOT_RESERVOIR', label: 'Hot reservoir', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_COLD_RESERVOIR', label: 'Cold reservoir', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_INSULATOR', label: 'Insulator block', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_RESERVOIR_RAIL', label: 'Reservoir rail / actuator', group: 'Scene', type: 'bool', def: false },
  { id: 'SHOW_STAGE', label: 'Stage / ground plane', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_BORE_INTERIOR', label: 'Bore interior surface', group: 'Scene', type: 'bool', def: true },
  { id: 'SHOW_DIMENSION_LINES', label: 'Dimension lines (x, A, V)', group: 'Scene', type: 'bool', def: false },
  { id: 'CUTAWAY_MODE', label: 'Cutaway mode', group: 'Scene', type: 'bool', def: true },

  // §7.2 Scene — gas & thermal
  { id: 'SHOW_GAS_PARTICLES', label: 'Gas particles', group: 'Gas', type: 'bool', def: true },
  { id: 'PARTICLE_COUNT', label: 'Particle count', group: 'Gas', type: 'range', def: 450, min: 0, max: 800, step: 10 },
  { id: 'SHOW_GAS_VOLUME_MESH', label: 'Gas volume haze', group: 'Gas', type: 'bool', def: true },
  { id: 'SHOW_TEMP_GLOW', label: 'Temperature color glow', group: 'Gas', type: 'bool', def: true },
  { id: 'SHOW_PARTICLE_TRAILS', label: 'Particle trails', group: 'Gas', type: 'bool', def: false },
  { id: 'SHOW_COLLISION_FLASH', label: 'Collision flash', group: 'Gas', type: 'bool', def: true },
  { id: 'SHOW_THERMALIZATION_FLASH', label: 'Thermalization flash', group: 'Gas', type: 'bool', def: true },
  { id: 'COLOR_PARTICLES_BY_SPEED', label: 'Color particles by speed', group: 'Gas', type: 'bool', def: true },
  { id: 'SHOW_TEMPERATURE_GRADIENT', label: 'Show T gradient (counterfactual)', group: 'Gas', type: 'bool', def: false },
  { id: 'SHOW_MB_HISTOGRAM', label: 'Maxwell–Boltzmann histogram', group: 'Gas', type: 'bool', def: false },
  { id: 'SHOW_VRMS_VECTOR', label: 'Mean-speed vector overlay', group: 'Gas', type: 'bool', def: false },

  // §7.3 Scene — flow & energy
  { id: 'SHOW_HEAT_ARROWS', label: 'Heat flow arrows', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_HEAT_ARROW_LABELS', label: 'Arrow labels (Q_H, Q_C)', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_WORK_ARROW', label: 'Work output arrow', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_ENERGY_PARTICLES', label: 'Animated energy particles', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_ENTROPY_CLOUD', label: 'Entropy disorder cloud (metaphor)', group: 'Flow', type: 'bool', def: false },
  { id: 'SHOW_PRESSURE_GAUGE', label: 'Analog pressure gauge', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_THERMOMETER', label: 'Thermometer column', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_ENTROPY_METER', label: 'Entropy meter', group: 'Flow', type: 'bool', def: false },
  { id: 'SHOW_VOLUME_SCALE', label: 'Volume scale on cylinder', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_LABELS_3D', label: 'All 3D billboard labels', group: 'Flow', type: 'bool', def: true },
  { id: 'SHOW_STATE_TAGS', label: '"1 2 3 4" tags on piston', group: 'Flow', type: 'bool', def: true },

  // §7.4 Physics options
  { id: 'GAMMA', label: 'Adiabatic index γ', group: 'Physics', type: 'enum', def: '5/3', options: ['5/3', '7/5', '4/3'] },
  { id: 'N_MOLES', label: 'n (mol)', group: 'Physics', type: 'range', def: 1.0, min: 0.1, max: 5, step: 0.1 },
  { id: 'T_H', label: 'T_H (K)', group: 'Physics', type: 'range', def: 600, min: 310, max: 1200, step: 5 },
  { id: 'T_C', label: 'T_C (K)', group: 'Physics', type: 'range', def: 300, min: 100, max: 590, step: 5 },
  { id: 'V1', label: 'V₁ (L)', group: 'Physics', type: 'range', def: 10, min: 1, max: 50, step: 1 },
  { id: 'RATIO_r', label: 'r = V₂/V₁', group: 'Physics', type: 'range', def: 2.5, min: 1.1, max: 6, step: 0.1 },
  { id: 'RUN_REVERSED', label: 'Run reversed (refrigerator/heat pump)', group: 'Physics', type: 'bool', def: false },
  { id: 'SHOW_CARNOT_LIMIT', label: 'Show Carnot limit curve', group: 'Physics', type: 'bool', def: true },
  { id: 'IRREVERSIBILITY', label: 'Add finite-ΔT irreversibility', group: 'Physics', type: 'bool', def: false },
  { id: 'SHOW_IRREV_GAP', label: 'Highlight η gap', group: 'Physics', type: 'bool', def: true },
  { id: 'FRICTION', label: 'Piston friction', group: 'Physics', type: 'bool', def: false },
  { id: 'REALISTIC_SHUTTLING', label: 'Reservoir shuttle time', group: 'Physics', type: 'bool', def: false },
  { id: 'TRUE_SCALE', label: 'True cylinder scale', group: 'Physics', type: 'bool', def: false },
  { id: 'SHOW_ASSUMPTION_LIST', label: 'Overlay of idealizations', group: 'Physics', type: 'bool', def: false },

  // §7.5 Graphs
  { id: 'GRAPH_PV', label: 'P–V diagram', group: 'Graphs', type: 'bool', def: true },
  { id: 'GRAPH_TS', label: 'T–S diagram', group: 'Graphs', type: 'bool', def: true },
  { id: 'GRAPH_SANKEY', label: 'Energy ledger / Sankey', group: 'Graphs', type: 'bool', def: true },
  { id: 'GRAPH_STRIP', label: 'Strip charts panel', group: 'Graphs', type: 'bool', def: true },
  { id: 'GRAPH_TABLE', label: 'Data table', group: 'Graphs', type: 'bool', def: false },
  { id: 'GRAPH_EFFICIENCY', label: 'η vs T_C/T_H plot', group: 'Graphs', type: 'bool', def: false },
  { id: 'SHOW_ISOTHERM_FAMILY', label: 'Dashed isotherm family', group: 'Graphs', type: 'bool', def: true },
  { id: 'SHOW_ADIABAT_FAMILY', label: 'Dashed adiabat family', group: 'Graphs', type: 'bool', def: true },
  { id: 'SHOW_AREA_SHADING', label: 'Shade ∮P dV and ∮T dS', group: 'Graphs', type: 'bool', def: true },
  { id: 'SHOW_STATE_MARKERS', label: 'State dots 1–4', group: 'Graphs', type: 'bool', def: true },
  { id: 'SHOW_GHOST_CYCLE', label: 'Previous-cycle ghost trail', group: 'Graphs', type: 'bool', def: true },
  { id: 'SHOW_LIVE_CURSOR', label: 'Live cursor + tooltip', group: 'Graphs', type: 'bool', def: true },
  { id: 'SHOW_PROCESS_BANDS', label: 'Process bands on strip charts', group: 'Graphs', type: 'bool', def: true },
  { id: 'LOG_SCALE_PV', label: 'Log–log P–V', group: 'Graphs', type: 'bool', def: false },
  { id: 'SHOW_AREA_MATCH_PROOF', label: 'Live ΔS·ΔT vs W_net comparison', group: 'Graphs', type: 'bool', def: false },

  // §7.6 Simulation & playback
  { id: 'PLAYBACK_SPEED', label: 'Speed ×', group: 'Sim', type: 'range', def: 1.0, min: 0.05, max: 4.0, step: 0.05 },
  { id: 'TIME_WEIGHTING', label: 'Phase duration weighting', group: 'Sim', type: 'enum', def: 'EQUAL', options: ['EQUAL', 'PROPORTIONAL_TO_WORK', 'PROPORTIONAL_TO_VOLUME', 'LOG_VOLUME'] },
  { id: 'SMOOTH_VOLUME', label: 'Smooth volume easing', group: 'Sim', type: 'bool', def: false },
  { id: 'LOOP', label: 'Loop cycle', group: 'Sim', type: 'bool', def: true },
  { id: 'PAUSE_AT_PHASE_BOUNDARY', label: 'Auto-pause at 1,2,3,4', group: 'Sim', type: 'bool', def: false },
  { id: 'SLOWMO_ON_ISOTHERMAL', label: '0.5× during isothermal phases', group: 'Sim', type: 'bool', def: false },
  { id: 'SEEDED_PARTICLES', label: 'Deterministic particles', group: 'Sim', type: 'bool', def: true },
  { id: 'PARTICLE_MODE', label: 'Particle coupling', group: 'Sim', type: 'enum', def: 'STATISTICAL', options: ['STATISTICAL', 'EMERGENT'] },
  { id: 'SHOW_FPS', label: 'FPS / perf overlay', group: 'Sim', type: 'bool', def: false },
  { id: 'SHOW_STATE_VECTOR', label: 'Live JSON state dump', group: 'Sim', type: 'bool', def: false },

  // §7.7 Camera & presentation
  { id: 'CAMERA_PRESET', label: 'Camera preset', group: 'Camera', type: 'enum', def: 'ORBIT', options: ['ORBIT', 'FRONT', 'SIDE', 'TOP', 'CUTAWAY', 'FOLLOW_PISTON', 'MACRO_GAS'] },
  { id: 'ORBIT_AUTO', label: 'Auto-orbit', group: 'Camera', type: 'bool', def: false },
  { id: 'DEPTH_OF_FIELD', label: 'DOF blur', group: 'Camera', type: 'bool', def: false },
  { id: 'BLOOM', label: 'Bloom on glow elements', group: 'Camera', type: 'bool', def: true },
  { id: 'SHADOWS', label: 'Shadows', group: 'Camera', type: 'bool', def: true },
  { id: 'HIDE_UI', label: 'Presentation mode', group: 'Camera', type: 'bool', def: false },
  { id: 'DARK_MODE', label: 'Dark theme', group: 'Camera', type: 'bool', def: true },
  { id: 'COLORBLIND_SAFE', label: 'Colorblind-safe palette', group: 'Camera', type: 'bool', def: false },
];

export const PRESETS = {
  Classroom: {
    SHOW_MB_HISTOGRAM: true, SHOW_VRMS_VECTOR: true, SHOW_ASSUMPTION_LIST: true,
    GRAPH_TABLE: true, SHOW_AREA_MATCH_PROOF: true, PLAYBACK_SPEED: 0.5,
    SHOW_DIMENSION_LINES: true, SHOW_ENTROPY_METER: true,
  },
  Minimal: {
    SHOW_PISTON_RINGS: false, SHOW_CONNECTING_ROD: false, SHOW_DIMENSION_LINES: false,
    SHOW_PARTICLE_TRAILS: false, SHOW_MB_HISTOGRAM: false, SHOW_ENTROPY_CLOUD: false,
    GRAPH_STRIP: false, SHOW_ISOTHERM_FAMILY: false, SHOW_ADIABAT_FAMILY: false,
    SHOW_HEAT_ARROW_LABELS: false, SHOW_DIMENSION_LINES: false, SHOW_ASSUMPTION_LIST: false,
  },
  Debug: {
    SHOW_FPS: true, SHOW_STATE_VECTOR: true, SHOW_AREA_MATCH_PROOF: true,
    PARTICLE_MODE: 'EMERGENT', SHOW_DIMENSION_LINES: true, GRAPH_TABLE: true,
  },
  Refrigerator: {
    RUN_REVERSED: true, GRAPH_EFFICIENCY: false, SHOW_WORK_ARROW: true,
  },
};

export function loadToggles() {
  const state = {};
  for (const item of REGISTRY) state[item.id] = item.def;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    Object.assign(state, saved);
  } catch (e) { /* ignore corrupt storage */ }
  return state;
}

export function saveToggles(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota/private mode */ }
}
