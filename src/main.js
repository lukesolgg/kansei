import Phaser from 'phaser';
import { GAME_W, GAME_H, hex, COLORS } from './config/theme.js';
import { Save } from './core/SaveManager.js';

import BootScene from './scenes/BootScene.js';
import ProfileScene from './scenes/ProfileScene.js';
import MenuScene from './scenes/MenuScene.js';
import GarageScene from './scenes/GarageScene.js';
import LevelSelectScene from './scenes/LevelSelectScene.js';
import GameScene from './scenes/GameScene.js';
import HUDScene from './scenes/HUDScene.js';
import ResultScene from './scenes/ResultScene.js';
import SettingsScene from './scenes/SettingsScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: hex(COLORS.bg),
  width: GAME_W,
  height: GAME_H,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    gamepad: true,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    ProfileScene,
    MenuScene,
    GarageScene,
    LevelSelectScene,
    GameScene,
    HUDScene,
    ResultScene,
    SettingsScene,
  ],
};

const game = new Phaser.Game(config);

// --- Crash-proof the main loop ----------------------------------------------
// An uncaught exception inside Phaser's per-frame step (a scene update, a render,
// or a scene transition fired from a timer callback) escapes requestAnimationFrame
// and the loop is never rescheduled — the game HARD-FREEZES until a refresh. This
// was the intermittent freeze on finish / out-of-fuel: the results transition runs
// inside the step, and any throw there killed the loop. Wrap the loop callback so a
// single bad frame is logged and skipped, never fatal.
// The frame callback (game.step) is assigned during Game.start(), which runs AFTER
// boot — so we re-check for ~1.5s and (re)wrap whenever we see an unwrapped callback,
// catching the real one once start() installs it. The marker prevents double-wrapping.
const installLoopGuard = (attempt = 0) => {
  const loop = game.loop;
  const cb = loop && loop.callback;
  if (typeof cb === 'function' && !cb._kanseiWrapped) {
    const original = cb;
    const wrapped = function (time, delta) {
      try {
        original(time, delta);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[KANSEI] frame error — loop kept alive:', e);
      }
    };
    wrapped._kanseiWrapped = true;
    loop.callback = wrapped;
  }
  if (attempt < 90) window.setTimeout(() => installLoopGuard(attempt + 1), 16);
};
installLoopGuard();

// Re-measure the canvas once layout/fonts settle so the FIT scale used for input
// mapping is accurate from the start (otherwise clicks can land offset until the
// first window resize).
const refit = () => game.scale.refresh();
window.addEventListener('load', refit);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit).catch(() => {});

// Dev-only debug hook for scripted verification (stripped from production build).
if (import.meta.env && import.meta.env.DEV) {
  window.KANSEI = { game, Save };
}
