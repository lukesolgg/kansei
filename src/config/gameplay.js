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
  // Higher = sticks; lower = slides. Handbrake/throttle reduce effective grip.
  gripKill: 7.5,
  handbrakeGripMul: 0.18, // handbrake slashes grip → big slides
  throttleGripMul: 0.7, // power-on reduces grip a bit (power-over drifts)
  driftAngleForSlide: 0.18, // rad — beyond this heading/velocity gap you're "drifting"
  minDriftSpeed: 90, // below this speed, no drift scoring
  spinDriftAngle: 1.5, // rad — beyond this you've spun; combo breaks

  // ---- Input feel (analog smoothing, units toward target per second) -----
  steerSmoothing: 7.0, // how fast steering eases toward the held direction
  steerReturn: 10.0, // snappier return-to-centre when you let go
  throttleRamp: 5.5, // keyboard throttle/brake ramp-in
  throttleRelease: 7.5, // throttle ramp-out when lifted
  // Counter-steer assist: gently aligns the nose to the travel direction so big
  // slides are catchable rather than spinning out — the key to a premium feel.
  counterSteerAssist: 2.6, // rad/s max corrective yaw
  counterSteerHandbrakeMul: 0.32, // assist is cut while the handbrake holds the slide

  // ---- Hit-stop / slow-mo (time-scale juice) ----------------------------
  hitStopScale: 0.05, // near-freeze on impact
  hitStopRecover: 6.0, // time-scale units/sec back to normal
  bankSlowmoScale: 0.45, // brief dip when banking a huge combo
  bankSlowmoRecover: 4.0,

  // ---- Fuel --------------------------------------------------------------
  // Units burned per second: idle baseline + throttle component.
  fuelIdleBurn: 1.1,
  fuelThrottleBurn: 3.2,
  fuelRefill: 30, // per fuel can
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

  // ---- Obstacles ---------------------------------------------------------
  crashSpeedLoss: 0.55, // fraction of speed lost on obstacle hit
  crashShakeMs: 220,
};
