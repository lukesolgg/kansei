// Drift scoring + multiplier. While the car slides, a chain accumulates with a
// rising multiplier; a short grace window lets you link corners. Ending the slide
// banks the chain into the score; crashing banks a penalised remainder and resets.

import { TUNING } from '../config/gameplay.js';

export class DriftScorer {
  constructor() {
    this.reset();
  }

  reset() {
    this.total = 0; // banked
    this.chain = 0; // current unbanked combo (multiplier already applied)
    this.multiplier = 1;
    this.graceMs = 0;
    this.driftActive = false;
    this._bankedFlash = 0; // amount banked since last consume (for popups)
    this.bestMultiplier = 1;
    this.speedMult = 1; // separate multiplier driven by how fast you're going
  }

  // Running score shown live = banked + current chain.
  get score() {
    return this.total + this.chain;
  }

  update(dt, car) {
    // Speed multiplier (always live): rewards pace — 1x crawling up to ~3.4x flat-out
    // (and beyond with wall/drift boosts). Feeds the drift score too.
    const maxSp = car.phys && car.phys.maxSpeed ? car.phys.maxSpeed : 1;
    const spF = Math.max(0, Math.min(1.6, car.speed / maxSp));
    this.speedMult = 1 + spF * 1.5;

    if (car.isDrifting) {
      this.driftActive = true;
      this.graceMs = TUNING.comboGraceMs;
      const angleF = Math.min(1.3, car.effDrift / 0.7);
      this.multiplier = Math.min(
        TUNING.multiplierMax,
        this.multiplier + TUNING.multiplierRamp * (0.6 + angleF * 0.6) * dt,
      );
      this.bestMultiplier = Math.max(this.bestMultiplier, this.multiplier);
      this.chain += car.speed * angleF * this.multiplier * this.speedMult * TUNING.scoreRate * dt;
    } else {
      this.driftActive = false;
      if (this.graceMs > 0) {
        // Within grace: hold the combo, hoping for the next slide.
        this.graceMs -= dt * 1000;
      } else {
        // Grace expired: bank the chain and bleed the multiplier back down.
        if (this.chain > 0) this._bank();
        if (this.multiplier > 1) {
          this.multiplier = Math.max(1, this.multiplier - TUNING.multiplierDecay * dt);
        }
      }
    }
  }

  _bank() {
    this._bankedFlash += this.chain;
    this.total += this.chain;
    this.chain = 0;
  }

  // Flat bonus banked straight into the score (e.g. a shortcut jump).
  addBonus(amt) {
    this.total += amt;
    this._bankedFlash += amt;
  }

  crash() {
    this.chain *= 1 - TUNING.bankPenaltyOnCrash;
    if (this.chain > 0) this._bank();
    this.multiplier = 1;
    this.graceMs = 0;
    this.driftActive = false;
  }

  // Returns (and clears) the amount banked since the last call — for floating popups.
  consumeBanked() {
    const v = this._bankedFlash;
    this._bankedFlash = 0;
    return v;
  }
}
