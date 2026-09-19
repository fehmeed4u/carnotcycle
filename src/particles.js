import * as THREE from 'three';
import { derived, CONSTANTS } from './physics.js';
import { tempToHexInt } from './colors.js';
import { visualX } from './scale.js';

const BORE_HALF = 0.095; // m, just inside the 20cm bore wall

// Calibrated visual speed scale: v_rms(T) = VUNIT * sqrt(T), chosen so a
// particle at T_H crosses the (visually compressed) stage in a couple of
// seconds. This preserves the physically-correct v_rms ∝ sqrt(T) scaling
// (§5.1) while staying legible at human timescales.
const VUNIT = 1.4 / Math.sqrt(600);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export class GasParticles {
  constructor(scene, maxCount = 800) {
    this.maxCount = maxCount;
    this.rng = mulberry32(20260919);
    const geo = new THREE.IcosahedronGeometry(0.006, 1);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.35, metalness: 0.1, emissive: 0x111111 });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pos = new Float32Array(maxCount * 3);   // real meters, local cylinder frame (x:0..L along axis)
    this.vel = new Float32Array(maxCount * 3);   // visual-unit m/s
    this.flash = new Float32Array(maxCount);     // remaining flash time
    this.active = maxCount;
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this.measuredT = derived.TH;

    this.reseed(derived.TH);
  }

  reseed(T0) {
    const L0 = derived.V1 / derived.A;
    for (let i = 0; i < this.maxCount; i++) {
      this.pos[i * 3 + 0] = this.rng() * L0;
      this.pos[i * 3 + 1] = (this.rng() - 0.5) * 2 * BORE_HALF;
      this.pos[i * 3 + 2] = (this.rng() - 0.5) * 2 * BORE_HALF;
      this._sampleVelocity(i, T0);
    }
  }

  _sampleVelocity(i, T, rng = this.rng) {
    const sigma = VUNIT * Math.sqrt(Math.max(T, 1)) / Math.sqrt(3);
    this.vel[i * 3 + 0] = gaussian(rng) * sigma;
    this.vel[i * 3 + 1] = gaussian(rng) * sigma;
    this.vel[i * 3 + 2] = gaussian(rng) * sigma;
  }

  setActiveCount(n) {
    this.active = Math.max(0, Math.min(this.maxCount, Math.round(n)));
  }

  /**
   * Advance particles by dt (seconds, already speed-scaled by caller).
   * `state` is the canonical CarnotState for this frame; `toggles` gates
   * optional behaviors. Returns nothing; mutates internal buffers only.
   */
  step(dt, state, toggles) {
    if (dt <= 0) return;
    const A = derived.A;
    const L = state.V / A;                    // true gas length, meters
    const uPiston = state.dVdt / A;            // true piston velocity, m/s (visual-unit-compatible since VUNIT is small)
    const contact = state.contact;
    const T_wall = contact === 'HOT' ? derived.TH : contact === 'COLD' ? derived.TC : null;
    const statistical = toggles.PARTICLE_MODE !== 'EMERGENT';
    const rng = toggles.SEEDED_PARTICLES ? this.rng : Math.random;

    let sumSq = 0;
    for (let i = 0; i < this.active; i++) {
      let x = this.pos[i * 3 + 0], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      let vx = this.vel[i * 3 + 0], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];

      x += vx * dt; y += vy * dt; z += vz * dt;

      if (y > BORE_HALF) { y = BORE_HALF; vy = -Math.abs(vy); }
      if (y < -BORE_HALF) { y = -BORE_HALF; vy = Math.abs(vy); }
      if (z > BORE_HALF) { z = BORE_HALF; vz = -Math.abs(vz); }
      if (z < -BORE_HALF) { z = -BORE_HALF; vz = Math.abs(vz); }

      if (x < 0) {
        x = 0;
        if (T_wall !== null) {
          this._sampleVelocity(i, T_wall, rng);
          vx = Math.abs(this.vel[i * 3 + 0]);
          vy = this.vel[i * 3 + 1]; vz = this.vel[i * 3 + 2];
          if (toggles.SHOW_THERMALIZATION_FLASH) this.flash[i] = 0.12;
        } else {
          vx = Math.abs(vx);
          if (toggles.SHOW_COLLISION_FLASH) this.flash[i] = Math.max(this.flash[i], 0.05);
        }
      } else if (x > L) {
        x = L;
        // elastic reflection in the piston's moving frame (spec §5.2)
        const vRel = vx - uPiston;
        vx = uPiston - vRel;
        if (toggles.SHOW_COLLISION_FLASH) this.flash[i] = Math.max(this.flash[i], 0.05);
      }

      this.pos[i * 3 + 0] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3 + 0] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      sumSq += vx * vx + vy * vy + vz * vz;
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt);
    }

    if (this.active > 0) {
      const ensembleVrms = Math.sqrt(sumSq / this.active);
      const targetVrms = VUNIT * Math.sqrt(Math.max(state.T, 1));
      this.measuredT = 600 * Math.pow(ensembleVrms / 1.4, 2); // report in K via the same calibration
      if (statistical && ensembleVrms > 1e-6) {
        const k = targetVrms / ensembleVrms;
        for (let i = 0; i < this.active; i++) {
          this.vel[i * 3 + 0] *= k; this.vel[i * 3 + 1] *= k; this.vel[i * 3 + 2] *= k;
        }
      }
    }
  }

  /** Push current buffers into the InstancedMesh, mapping real->visual x. */
  sync(state, toggles) {
    const A = derived.A;
    const L = state.V / A;
    const x1 = derived.V1 / A;
    const Lvis = visualX(state.x, x1, toggles.TRUE_SCALE) - visualX(0, x1, toggles.TRUE_SCALE);
    const headVis = visualX(0, x1, toggles.TRUE_SCALE);
    let vmax = 1e-9;
    for (let i = 0; i < this.active; i++) {
      const vx = this.vel[i * 3 + 0], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
      const sp = Math.hypot(vx, vy, vz);
      if (sp > vmax) vmax = sp;
    }
    for (let i = 0; i < this.maxCount; i++) {
      if (i >= this.active) {
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.setScalar(0);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      const frac = L > 0 ? this.pos[i * 3 + 0] / L : 0;
      const worldX = headVis + frac * Lvis;
      this._dummy.position.set(worldX, this.pos[i * 3 + 1] + 0, this.pos[i * 3 + 2] + 0);
      const flashScale = this.flash[i] > 0 ? 1.8 : 1.0;
      this._dummy.scale.setScalar(flashScale);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);

      if (toggles.COLOR_PARTICLES_BY_SPEED) {
        const vx = this.vel[i * 3 + 0], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
        const sp = Math.hypot(vx, vy, vz) / vmax;
        this._color.setHSL(0.62 - 0.62 * sp, 0.85, 0.5 + 0.15 * sp);
      } else {
        this._color.setHex(tempToHexInt(state.T, derived.TC, derived.TH));
      }
      if (this.flash[i] > 0) this._color.lerp(new THREE.Color(0xffffff), 0.7);
      this.mesh.setColorAt(i, this._color);
    }
    this.mesh.count = this.maxCount;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = toggles.SHOW_GAS_PARTICLES;
    this.mesh.position.y = 0;
  }
}
