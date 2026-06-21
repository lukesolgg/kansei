// Central tuning knobs for the drift model, fuel economy, scoring and rewards.
// Tweak here to rebalance the whole game.

export const TUNING = {
  // ---- Drift physics (top-down arcade model) ----------------------------
  // Engine acceleration (world units/s^2) at power 1.0, scaled by car + engine upgrade.
  engineAccel: 720,
  reverseAccel: 320,
  brakeDecel: 900,
  // Natural rolling drag (fraction of speed shed per second) while coasting.
  rollDrag: 0.55,
  offTrackDrag: 2.6, // heavy extra drag when off the road
  // Steering: radians/sec at full lock, scaled by car.turn and speed factor.
  steerRate: 2.05,
  // Lateral grip: fraction of sideways velocity killed per second.
  // Higher = sticks; lower = slides. Lowered for an icy, slidey base feel.
  gripKill: 7.5, // base lateral grip — HIGH, so normal driving is grippy; drift comes from the handbrake
  handbrakeGripMul: 0.3, // grip while drifting: low enough to slide, high enough to carve a corner
  driftTurnRate: 6.0, // how fast the nose eases to the target drift angle (= flip/feint speed)
  coastDrag: 0.85, // extra drag off the throttle — lifting W slows you (engine braking)
  driftAngleForSlide: 0.16, // rad — beyond this heading/velocity gap you're "drifting"
  minDriftSpeed: 70,
  spinDriftAngle: 1.55, // rad — beyond this you've spun; combo breaks

  // ---- Input feel (analog smoothing, units toward target per second) -----
  steerSmoothing: 7.0,
  steerReturn: 10.0,
  throttleRamp: 5.5,
  throttleRelease: 7.5,

  // Extra steering authority while sliding (helps carry the car through a corner).
  driftSteerGain: 1.1,
  // Lateral wash — HANDBRAKE ONLY. The rear washes OUT (opposite the steer) so the
  // car points into the corner but slides wide (real counter-steer feel).
  driftSteerKick: 2.6,

  // Drift angle cap (anti-spin). Depends on handbrake + throttle:
  //   no handbrake        -> gripDriftCap (grippy, barely any slide)
  //   handbrake + tap W    -> driftCapLow  (wide, shallow, long drift)
  //   handbrake + hold W   -> driftCapHigh (tight, more angle)
  gripDriftCap: 0.38,
  driftCapLow: 0.42,
  driftCapHigh: 0.82,
  antiSpinEase: 0.5, // how hard the slip is eased back toward the cap

  // Hold full throttle in a drift too long and the angle WINDS UP past control into
  // a spin — so there's a balance point: feather W to hold a clean drift.
  driftWindThrottle: 0.65, // throttle above this winds the drift up
  driftWindRate: 0.5, // extra cap (rad) gained per second at full throttle
  driftWindDecay: 2.2, // wind-down per second otherwise
  driftWindMax: 1.1, // max extra angle — enough to tip you into a spin

  // Drift-charge → boost (mini-turbo): hold the handbrake in a slide to charge,
  // release for a forward blast that decays back to normal.
  driftBoostChargeMax: 2.2, // seconds of sliding for a full charge
  driftBoostMin: 0.45, // minimum charge to fire any boost
  driftBoostPower: 78, // forward px/s added per charge-second on release
  driftBoostDecay: 1.1, // boost level bled off per second
  driftBoostSpeedBonus: 0.42, // boost lifts the speed cap by up to this fraction

  // ---- Hit-stop / slow-mo (time-scale juice) ----------------------------
  hitStopScale: 0.05, // near-freeze on impact
  hitStopRecover: 6.0, // time-scale units/sec back to normal
  bankSlowmoScale: 0.45, // brief dip when banking a huge combo
  bankSlowmoRecover: 4.0,

  // ---- Fuel --------------------------------------------------------------
  // Units burned per second: idle baseline + throttle component.
  fuelIdleBurn: 1.2,
  fuelThrottleBurn: 3.8,
  fuelRefill: 24, // per fuel can
  lowFuelWarn: 0.22, // fraction of tank that triggers the warning

  // ---- Scoring -----------------------------------------------------------
  // Drift score gained per second = speed * driftAngle factor * multiplier * rate.
  scoreRate: 0.5,
  multiplierRamp: 0.55, // multiplier gained per second while drifting
  multiplierMax: 9.9,
  multiplierDecay: 2.2, // multiplier lost per second shortly after a drift ends
  comboGraceMs: 900, // grace window after a slide before the combo starts decaying
  bankPenaltyOnCrash: 0.45, // fraction of unbanked drift score lost on a crash

  // ---- Rewards -----------------------------------------------------------
  cashPerScore: 0.04, // drift score -> cash conversion
  cashToken: 220, // value of a cash pickup
  finishBonus: 400, // flat cash for finishing
  starBonus: 250, // extra cash per star earned

  // ---- Obstacles & pads --------------------------------------------------
  crashSpeedLoss: 0.55, // fraction of speed lost on obstacle hit
  crashShakeMs: 220,
  trashSlow: 0.7, // velocity multiplier when you clip a trash can (soft slow)
  boostPadPower: 135, // forward px/s kick from a booster pad
  rampMinSpeed: 120, // need at least this speed for a ramp to launch you
  rampLaunch: 95, // forward px/s added on launch so a fast jump carries across a gap
  rampAirMax: 1.35, // max seconds airborne (faster approach = longer flight)
};
