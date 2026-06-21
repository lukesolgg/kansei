// Unified input: keyboard + on-screen touch + gamepad, blended into one analog
// command each frame. Steering and throttle are smoothed so taps feather in/out
// instead of snapping — the foundation of a premium drift feel.

import Phaser from 'phaser';
import { TUNING } from '../config/gameplay.js';

export const TOUCH = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
  boost: false,
};

export function resetTouch() {
  TOUCH.throttle = TOUCH.brake = TOUCH.left = TOUCH.right = TOUCH.handbrake = TOUCH.boost = false;
}

function approach(cur, target, maxStep) {
  if (cur < target) return Math.min(target, cur + maxStep);
  if (cur > target) return Math.max(target, cur - maxStep);
  return cur;
}

export class InputController {
  constructor(scene) {
    this.scene = scene;
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
      downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT, // alt handbrake (Ctrl would close the tab)
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      p: Phaser.Input.Keyboard.KeyCodes.P,
    });

    // Smoothed analog state.
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.steerRaw = 0;
    this.usingGamepad = false;

    // Gamepad (optional). Phaser surfaces pads once a button is pressed.
    this.pad = null;
    if (scene.input.gamepad) {
      const gp = scene.input.gamepad;
      if (gp.total) this.pad = gp.getPad(0);
      gp.on('connected', (p) => {
        this.pad = p;
      });
    }
    this._prevStart = false;
    // Reused each frame so read() doesn't allocate a fresh command object.
    this._cmd = { throttle: 0, brake: 0, steer: 0, steerRaw: 0, handbrake: false, boost: false };
  }

  _gamepad() {
    const gp = this.scene.input.gamepad;
    if (!gp) return null;
    if (!this.pad && gp.total) this.pad = gp.getPad(0);
    return this.pad && this.pad.connected ? this.pad : null;
  }

  read(dt = 1 / 60) {
    const k = this.keys;
    const pad = this._gamepad();

    // ---- Raw targets from all sources ----
    let steerTarget = 0;
    if (k.left.isDown || k.leftArrow.isDown || TOUCH.left) steerTarget -= 1;
    if (k.right.isDown || k.rightArrow.isDown || TOUCH.right) steerTarget += 1;

    let thrTarget = k.up.isDown || k.upArrow.isDown || TOUCH.throttle ? 1 : 0;
    let brkTarget = k.down.isDown || k.downArrow.isDown || TOUCH.brake ? 1 : 0;
    // Drift/handbrake on SHIFT; boost released with SPACE — so you can drift AND
    // fire the mini-turbo at the same time. (Ctrl can't be the drift key: Ctrl+W,
    // with W as throttle, closes the browser tab.)
    let hb = k.shift.isDown || TOUCH.handbrake;
    let boost = k.space.isDown || TOUCH.boost;

    if (pad) {
      const ax = pad.axes.length ? pad.axes[0].getValue() : 0;
      if (Math.abs(ax) > 0.14) {
        steerTarget = Phaser.Math.Clamp(ax, -1, 1);
        this.usingGamepad = true;
      }
      if (pad.left) steerTarget = -1;
      if (pad.right) steerTarget = 1;
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0; // right trigger
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0; // left trigger
      if (rt > 0.04) { thrTarget = Math.max(thrTarget, rt); this.usingGamepad = true; }
      if (lt > 0.04) brkTarget = Math.max(brkTarget, lt);
      if (pad.A) thrTarget = 1; // A as a digital throttle too
      // Handbrake: B or left bumper. Boost: right bumper or X.
      if (pad.B || (pad.buttons[4] && pad.buttons[4].pressed)) hb = true;
      if (pad.X || (pad.buttons[5] && pad.buttons[5].pressed)) boost = true;
    }

    steerTarget = Phaser.Math.Clamp(steerTarget, -1, 1);
    this.steerRaw = steerTarget;

    // ---- Smoothing ----
    const toCenter = steerTarget === 0;
    const reversing = steerTarget * this.steer < 0;
    const steerRate = toCenter
      ? TUNING.steerReturn
      : reversing
        ? TUNING.steerSmoothing * 1.7
        : TUNING.steerSmoothing;
    this.steer = approach(this.steer, steerTarget, steerRate * dt);

    this.throttle = approach(
      this.throttle,
      thrTarget,
      (thrTarget > this.throttle ? TUNING.throttleRamp : TUNING.throttleRelease) * dt,
    );
    this.brake = approach(this.brake, brkTarget, TUNING.throttleRamp * dt);

    const cmd = this._cmd;
    cmd.throttle = this.throttle;
    cmd.brake = this.brake;
    cmd.steer = this.steer;
    cmd.steerRaw = steerTarget;
    cmd.handbrake = hb;
    cmd.boost = boost;
    return cmd;
  }

  // Gamepad Start only — keyboard pause is handled by an edge-triggered keydown
  // event in GameScene (polling JustDown can stick "down" if the key-up happens
  // while the scene is paused, which then swallows the next pause press).
  pausePressed() {
    let pressed = false;
    const pad = this._gamepad();
    if (pad && pad.buttons[9]) {
      const down = pad.buttons[9].pressed; // Start
      if (down && !this._prevStart) pressed = true;
      this._prevStart = down;
    }
    return pressed;
  }
}
