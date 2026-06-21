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
  gripKill: 4.2,
  handbrakeGripMul: 0.05, // handbrake almost kills grip → the rear steps right out
  handbrakeSteerBoost: 1.5, // handbrake also sharpens yaw so the tail snaps out
  throttleGripMul: 0.6, // power-on reduces grip (power-over drifts)
  driftAngleForSlide: 0.16, // rad — beyond this heading/velocity gap you're "drifting"
  minDriftSpeed: 70, // below this speed, no drift scoring
  spinDriftAngle: 1.9, // rad — beyond this you've spun; combo breaks

  // ---- Input feel (analog smoothing, units toward target per second) -----
  steerSmoothing: 7.0, // how fast steering eases toward the held direction
  steerReturn: 10.0, // snappier return-to-centre when you let go
  throttleRamp: 5.5, // keyboard throttle/brake ramp-in
  throttleRelease: 7.5, // throttle ramp-out when lifted
  // Counter-steer assist: gently aligns the nose to the travel direction so big
  // slides are catchable. NOTE: in Car.js this assist now scales with THROTTLE —
  // so lifting off lets the car keep rotating (clean ice-slide / 360 on exit),
  // while staying on the gas keeps the drift catchable.
  counterSteerAssist: 2.4, // rad/s max corrective yaw at full throttle
  counterSteerHandbrakeMul: 0.12, // handbrake further loosens the assist

  // Extra steering authority while already sliding — lets you swing the car wide
  // mid-drift to scythe around obstacles.
  driftSteerGain: 0.8,
  // Lifting off the throttle drops grip so the car slides freely (360s on exit).
  offThrottleGripMul: 0.5,

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

  // ---- Obstacles ---------------------------------------------------------
  crashSpeedLoss: 0.55, // fraction of speed lost on obstacle hit
  crashShakeMs: 220,
};
