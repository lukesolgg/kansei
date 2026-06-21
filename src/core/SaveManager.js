// Local profile + persistence layer. Everything lives in localStorage — no server.
// A "login" is just selecting a profile and (optionally) entering its 4-digit PIN.

import { CARS, STARTER_CAR, clampSchemeIndex } from '../config/cars.js';
import { UPGRADES } from '../config/upgrades.js';

const STORAGE_KEY = 'kansei.save.v1';

// Defaults merged over any profile's stored settings so older saves gain new keys.
export const DEFAULT_SETTINGS = {
  sfx: true,
  music: true,
  masterVolume: 0.9,
  musicVolume: 0.8,
  sfxVolume: 1.0,
  shake: true,
  postfx: true,
  reduceMotion: false,
};

function freshUpgrades() {
  const u = {};
  for (const key of Object.keys(UPGRADES)) u[key] = 0;
  return u;
}

function blankProfile(name, pin) {
  return {
    id: 'p_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    name: name.slice(0, 14),
    pin: pin || '',
    createdAt: Date.now(),
    lastPlayed: Date.now(),
    cash: 0,
    selectedCar: STARTER_CAR,
    ownedCars: { [STARTER_CAR]: true },
    // Per-car upgrade levels: { ae86: { fuel:0, engine:0, grip:0, brakes:0 } }
    carUpgrades: { [STARTER_CAR]: freshUpgrades() },
    // Per-car chosen colour-scheme index: { ae86: 0, s15: 3, ... }. Missing
    // entries fall back to the car's stock scheme (see getCarColor).
    carColors: {},
    // Per-level progress: { 'docks-1': { cleared:true, stars:2, bestScore:12345 } }
    levels: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

class SaveManager {
  constructor() {
    this.data = this._read();
    this.current = null;
    if (this.data.lastProfileId && this.data.profiles[this.data.lastProfileId]) {
      this.current = this.data.profiles[this.data.lastProfileId];
    }
  }

  _read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.profiles) return parsed;
      }
    } catch (e) {
      console.warn('[KANSEI] save read failed, starting fresh', e);
    }
    return { profiles: {}, lastProfileId: null };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[KANSEI] save write failed', e);
    }
  }

  // ---- Profiles -----------------------------------------------------------
  listProfiles() {
    return Object.values(this.data.profiles).sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  createProfile(name, pin) {
    name = (name || '').trim();
    if (name.length < 2) return { error: 'Name must be at least 2 characters.' };
    if (this.listProfiles().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return { error: 'That name is already taken.' };
    }
    if (this.listProfiles().length >= 8) return { error: 'Profile limit reached (8).' };
    const p = blankProfile(name, pin);
    this.data.profiles[p.id] = p;
    this.data.lastProfileId = p.id;
    this.current = p;
    this.save();
    return { profile: p };
  }

  // Returns true on success. Empty stored PIN means no PIN required.
  login(id, pin) {
    const p = this.data.profiles[id];
    if (!p) return false;
    if (p.pin && p.pin !== pin) return false;
    p.lastPlayed = Date.now();
    this.data.lastProfileId = id;
    this.current = p;
    this.save();
    return true;
  }

  requiresPin(id) {
    const p = this.data.profiles[id];
    return !!(p && p.pin);
  }

  logout() {
    this.current = null;
    this.data.lastProfileId = null;
    this.save();
  }

  deleteProfile(id) {
    delete this.data.profiles[id];
    if (this.data.lastProfileId === id) this.data.lastProfileId = null;
    if (this.current && this.current.id === id) this.current = null;
    this.save();
  }

  // ---- Cash & cars --------------------------------------------------------
  get cash() {
    return this.current ? this.current.cash : 0;
  }

  addCash(amount) {
    if (!this.current) return;
    this.current.cash = Math.max(0, Math.round(this.current.cash + amount));
    this.save();
  }

  spend(amount) {
    if (!this.current || this.current.cash < amount) return false;
    this.current.cash -= amount;
    this.save();
    return true;
  }

  ownsCar(carId) {
    return !!(this.current && this.current.ownedCars[carId]);
  }

  buyCar(carId) {
    const car = CARS[carId];
    if (!car || !this.current || this.ownsCar(carId)) return false;
    if (!this.spend(car.price)) return false;
    this.current.ownedCars[carId] = true;
    if (!this.current.carUpgrades[carId]) this.current.carUpgrades[carId] = freshUpgrades();
    this.save();
    return true;
  }

  selectCar(carId) {
    if (!this.current || !this.ownsCar(carId)) return false;
    this.current.selectedCar = carId;
    this.save();
    return true;
  }

  get selectedCar() {
    return this.current ? this.current.selectedCar : STARTER_CAR;
  }

  // ---- Colour schemes -----------------------------------------------------
  // The chosen two-tone scheme index for a car. Falls back to the car's stock
  // scheme (its own hand-tuned livery) when the player hasn't repainted it.
  getCarColor(carId) {
    const stock = clampSchemeIndex(CARS[carId]?.stockScheme ?? 0);
    if (!this.current || !this.current.carColors) return stock;
    const stored = this.current.carColors[carId];
    return stored == null ? stock : clampSchemeIndex(stored);
  }

  setCarColor(carId, index) {
    if (!this.current) return;
    if (!this.current.carColors) this.current.carColors = {};
    this.current.carColors[carId] = clampSchemeIndex(index);
    this.save();
  }

  // ---- Upgrades -----------------------------------------------------------
  getUpgrades(carId) {
    if (!this.current) return freshUpgrades();
    if (!this.current.carUpgrades[carId]) this.current.carUpgrades[carId] = freshUpgrades();
    return this.current.carUpgrades[carId];
  }

  getUpgradeLevel(carId, key) {
    return this.getUpgrades(carId)[key] || 0;
  }

  // Cost of the NEXT level of an upgrade, or null if maxed.
  upgradeCost(carId, key) {
    const def = UPGRADES[key];
    const lvl = this.getUpgradeLevel(carId, key);
    if (lvl >= def.levels.length - 1) return null;
    return def.levels[lvl + 1].cost;
  }

  buyUpgrade(carId, key) {
    const cost = this.upgradeCost(carId, key);
    if (cost == null) return false;
    if (!this.spend(cost)) return false;
    this.getUpgrades(carId)[key] += 1;
    this.save();
    return true;
  }

  // ---- Levels -------------------------------------------------------------
  getLevel(levelId) {
    if (!this.current) return { cleared: false, stars: 0, bestScore: 0 };
    return this.current.levels[levelId] || { cleared: false, stars: 0, bestScore: 0 };
  }

  recordLevel(levelId, { cleared, stars, score }) {
    if (!this.current) return;
    const prev = this.getLevel(levelId);
    this.current.levels[levelId] = {
      cleared: prev.cleared || cleared,
      stars: Math.max(prev.stars || 0, stars || 0),
      bestScore: Math.max(prev.bestScore || 0, Math.round(score || 0)),
    };
    this.save();
  }

  totalStars() {
    if (!this.current) return 0;
    return Object.values(this.current.levels).reduce((s, l) => s + (l.stars || 0), 0);
  }

  isLevelUnlocked(level, allLevels) {
    if (!this.current) return level.unlockStars === 0;
    // A level unlocks once you've earned enough total stars (its threshold).
    return this.totalStars() >= (level.unlockStars || 0);
  }

  // ---- Settings -----------------------------------------------------------
  // Lazily backfills missing keys so profiles saved before a setting existed
  // still return sensible defaults.
  get settings() {
    if (!this.current) return { ...DEFAULT_SETTINGS };
    this.current.settings = { ...DEFAULT_SETTINGS, ...this.current.settings };
    return this.current.settings;
  }

  setSetting(key, value) {
    if (!this.current) return;
    this.current.settings = { ...DEFAULT_SETTINGS, ...this.current.settings, [key]: value };
    this.save();
  }
}

// Single shared instance for the whole game.
export const Save = new SaveManager();
