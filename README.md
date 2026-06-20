# KANSEI — 慣性ドリフト

> A neon-retro, top-down **JDM drift** game for the browser. Chain drifts to build
> insane multipliers, scoop up fuel and cash, dodge obstacles, and cross the finish
> line before you run dry. Spend your cash to upgrade your ride and unlock a garage
> full of legends — AE86, S15, FD RX-7, IS200, 370Z and the mighty A80 Supra.

Built with **[Phaser 3](https://phaser.io/)** (Matter.js physics) + **[Vite](https://vitejs.dev/)**.
All art is drawn procedurally in code as glowing neon vectors — no image assets.

## 🎮 Controls

| Action            | Keyboard                    |
| ----------------- | --------------------------- |
| Throttle          | `W` / `↑`                   |
| Brake / Reverse   | `S` / `↓`                   |
| Steer             | `A` `D` / `←` `→`           |
| Handbrake (drift) | `Space`                     |
| Pause             | `Esc` / `P`                 |

Touch controls (on-screen pads) appear automatically on mobile/touch devices.

**The drift:** hold the handbrake while steering through a corner to break traction.
The bigger your slide angle and the longer you hold it, the faster your **multiplier**
climbs. Crashing into obstacles or stopping the slide drops the combo.

## 🏁 The loop

1. **Pick a profile** (or make one — username + 4-digit PIN, stored locally in your browser).
2. **Choose a level** across 3 zones: _Neon Docks_, _Mountain Touge_, _Skyline Expressway_.
3. **Drift to the finish** before fuel runs out. Earn cash from your drift score + pickups.
4. **Spend cash** in the Garage on fuel / engine / grip upgrades, and unlock new cars.
5. **Beat the score target** for bonus stars. ⭐⭐⭐

## 🚀 Run locally

```bash
npm install
npm run dev      # http://localhost:5173/kansei/
```

Build a production bundle:

```bash
npm run build
npm run preview
```

## 🌐 Deploy

Pushing to `main` triggers the GitHub Actions workflow in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the game
and publishes it to GitHub Pages at **https://lukesolgg.github.io/kansei/**.

> Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 📁 Project layout

```
src/
  main.js              # Phaser bootstrap + game config
  config/              # theme, cars, levels, upgrades (data only)
  core/                # SaveManager (profiles), audio, neon texture/draw helpers
  game/                # Car drift physics, Track, pickups, obstacles, drift scoring
  scenes/              # Boot, Profile, Menu, Garage, LevelSelect, Game, HUD, Result
  ui/                  # neon UI widgets (buttons, panels)
```

## ⚖️ Note on car names

Vehicle names use real chassis codes / nicknames (AE86, S15, FD, etc.) as an homage to
JDM drift culture. This is a non-commercial fan project; all trademarks belong to their
respective owners.

---

Made with 💜 by [lukesolgg](https://github.com/lukesolgg).
