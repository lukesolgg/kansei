// Unified input: keyboard + on-screen touch controls. The HUD writes into the
// shared TOUCH state; the controller merges both into a single command each frame.

import Phaser from 'phaser';

export const TOUCH = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
};

export function resetTouch() {
  TOUCH.throttle = TOUCH.brake = TOUCH.left = TOUCH.right = TOUCH.handbrake = false;
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
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      p: Phaser.Input.Keyboard.KeyCodes.P,
    });
  }

  read() {
    const k = this.keys;
    const up = k.up.isDown || k.upArrow.isDown || TOUCH.throttle;
    const down = k.down.isDown || k.downArrow.isDown || TOUCH.brake;
    const left = k.left.isDown || k.leftArrow.isDown || TOUCH.left;
    const right = k.right.isDown || k.rightArrow.isDown || TOUCH.right;
    const hb = k.space.isDown || TOUCH.handbrake;
    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: hb,
    };
  }

  pausePressed() {
    return (
      Phaser.Input.Keyboard.JustDown(this.keys.esc) ||
      Phaser.Input.Keyboard.JustDown(this.keys.p)
    );
  }
}
