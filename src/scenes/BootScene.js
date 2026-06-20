import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { makeSpark } from '../core/neon.js';

// Boots the game: waits for web fonts, prepares shared textures, hides the HTML
// loading splash, then routes to the profile select (or straight to the menu if
// a driver is already active from a previous session).
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    makeSpark(this, 'spark');

    const proceed = () => {
      const splash = document.getElementById('boot-splash');
      if (splash) {
        splash.classList.add('hidden');
        setTimeout(() => splash.remove(), 500);
      }
      const next = Save.current ? 'MenuScene' : 'ProfileScene';
      this.scene.start(next);
    };

    // Ensure Orbitron/Rajdhani are loaded so the first text renders correctly.
    if (document.fonts && document.fonts.ready) {
      Promise.all([
        document.fonts.load('900 32px Orbitron'),
        document.fonts.load('700 24px Rajdhani'),
      ]).catch(() => {});
      Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1600)),
      ]).then(() => this.time.delayedCall(60, proceed));
    } else {
      this.time.delayedCall(250, proceed);
    }
  }
}
