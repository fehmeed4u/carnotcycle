# Carnot Cycle — 3D Engine

A single-page WebGL application: a 3D-rendered Carnot heat engine, driven
entirely by a shared thermodynamic state vector, with synchronized live
graphs (P–V, T–S, energy ledger, strip charts) and a granular toggle drawer
for every scene, physics, graph, simulation and camera option.

Implements the physics core (ideal-gas relations, the four Carnot
processes, entropy bookkeeping, Carnot efficiency, reversed-cycle
refrigerator/heat-pump mode), a microscopic gas particle simulation with
piston/wall/thermal collision rules, a full 3D engine assembly (cylinder,
piston, connecting rod, flywheel, reservoirs, gauges), and Canvas2D graph
panels — all deriving every visual quantity from one canonical `s`
(cycle-phase) parameter, never from independent keyframes.

## Running it

This is a plain ES-module app with no build step — just serve the
directory over HTTP (opening `index.html` via `file://` will not work,
since browsers block ES module imports from the filesystem):

```bash
python3 -m http.server 8080
# then open http://localhost:8080/
```

Three.js and its `OrbitControls` / `RoomEnvironment` / `CSS2DRenderer`
addons are vendored under `vendor/three/` so the app runs fully offline —
no CDN or `npm install` required. (`package.json` / `node_modules` are
only used during development to keep a local copy of Three.js in sync;
`node_modules` is gitignored.)

## Structure

- `index.html` — layout shell (header/transport, 3D viewport, graph grid,
  toggle drawer) and the import map.
- `src/physics.js` — the single source of truth for `P, V, T, S, U` and
  the energy ledger at any cycle-phase `s`; runs a startup acceptance-test
  suite (logged to the console) verifying the state-point table, energy
  conservation, and entropy bookkeeping against the spec's exact numbers.
- `src/scene3d.js` — the Three.js engine assembly (cylinder, piston,
  reservoirs, flywheel, gauges, heat-flow arrows, camera presets).
- `src/particles.js` — the gas particle simulation (Maxwell–Boltzmann
  sampling, piston/wall/thermal collisions, statistical rescaling).
- `src/graphs.js` — Canvas2D P–V / T–S / energy-ledger / strip-chart /
  data-table rendering.
- `src/ui/registry.js`, `src/ui/toggles.js` — the toggle registry and the
  tabbed drawer UI that renders and persists it.
- `src/colors.js`, `src/scale.js` — shared temperature/process color ramps
  and the true-scale ↔ visually-compressed cylinder-length mapping.

## Scope note

The toggle registry wires up the scene, gas, flow, physics, graph,
simulation and camera controls that materially change what's rendered.
A handful of the most niche spec toggles are registered and persisted
(so they round-trip through `localStorage` and the presets correctly)
but don't yet drive a visual: the Maxwell–Boltzmann histogram inset,
the mean-speed vector overlay, the entropy "disorder cloud" metaphor,
the entropy meter dial, the η-vs-T_C/T_H limit plot, reservoir-shuttle
timing irreversibility, and depth-of-field/bloom post-processing. These
are straightforward follow-ups against the same `CarnotState` source of
truth — none of them require new physics, only new render code.
