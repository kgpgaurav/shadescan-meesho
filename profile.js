import { rgbToLab, hexToRgb, deltaE } from './color.js';

const KEY = 'shadescan.profile';
const TRAY = 'shadescan.tray';

const EMPTY = {
  skinHex: null,
  undertone: null,
  finishes: [],
  families: [],
  budget: null
};

export const SKIN_STEPS = [
  { key: 'very-fair', label: 'Very fair', hex: '#F3D7C4' },
  { key: 'fair', label: 'Fair', hex: '#E7BE9E' },
  { key: 'medium', label: 'Medium', hex: '#CE9D74' },
  { key: 'tan', label: 'Tan', hex: '#A9774F' },
  { key: 'deep', label: 'Deep', hex: '#7A5136' },
  { key: 'very-deep', label: 'Very deep', hex: '#4E3222' }
];

export const UNDERTONES = [
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'unsure', label: 'Not sure' }
];

export const BUDGETS = ['Under ₹149', '₹149–₹249', 'No limit'];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

export function getProfile() {
  return { ...EMPTY, ...read(KEY, {}) };
}

export function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  write(KEY, next);
  return next;
}

export function clearProfile() {
  try { localStorage.removeItem(KEY); } catch (err) { return false; }
  return true;
}

export function hasSkinTone() {
  return Boolean(getProfile().skinHex);
}

export function getTray() {
  return read(TRAY, []);
}

export function addToTray(id) {
  const tray = getTray();
  if (!tray.includes(id)) tray.push(id);
  write(TRAY, tray.slice(-8));
  return getTray();
}

export function removeFromTray(id) {
  write(TRAY, getTray().filter(x => x !== id));
  return getTray();
}

export function clearTray() {
  write(TRAY, []);
  return [];
}

function hueAngle(lab) {
  const deg = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

function toneOfShade(lab) {
  const h = hueAngle(lab);
  if (h < 34) return 'cool';
  if (h > 48) return 'warm';
  return 'neutral';
}

export function skinLab(profile = getProfile()) {
  if (!profile.skinHex) return null;
  const rgb = hexToRgb(profile.skinHex);
  if (!rgb) return null;
  return rgbToLab(rgb.r, rgb.g, rgb.b);
}

export function assess(product, profile = getProfile()) {
  const notes = [];
  let score = 0;
  let known = 0;

  const skin = skinLab(profile);
  if (skin) {
    known++;
    const contrast = Math.abs(product.lab.L - skin.L);
    if (product.category === 'hair') {
      if (contrast < 10) {
        notes.push('Very close to your skin lightness, so the colour will read softly rather than standing out.');
        score += 0;
      } else if (contrast > 45) {
        notes.push('A strong lightness contrast against your skin, which reads as a bold change.');
        score += 0.5;
      } else {
        notes.push('Sits at a workable lightness contrast against your skin.');
        score += 1;
      }
    } else if (contrast < 9) {
      notes.push('Almost the same lightness as your skin, so it will look barely there.');
      score += 0.2;
    } else if (contrast > 52) {
      notes.push('High contrast against your skin, which makes it a statement rather than an everyday shade.');
      score += 0.6;
    } else {
      notes.push('Enough contrast against your skin to show up without taking over.');
      score += 1;
    }
  }

  const stated = profile.undertone && profile.undertone !== 'unsure' ? profile.undertone : null;
  if (stated) {
    known++;
    const shadeTone = toneOfShade(product.lab);
    if (shadeTone === 'neutral' || stated === 'neutral') {
      notes.push('Sits between warm and cool, so your undertone is not a constraint here.');
      score += 0.8;
    } else if (shadeTone === stated) {
      notes.push('Leans ' + shadeTone + ', matching the undertone you saved.');
      score += 1;
    } else {
      notes.push('Leans ' + shadeTone + ' while you saved a ' + stated + ' undertone, so it may read differently on you than in the photo.');
      score += 0.2;
    }
  }

  if (profile.finishes && profile.finishes.length) {
    known++;
    if (profile.finishes.includes(product.finish)) {
      notes.push('Matches a finish you said you prefer.');
      score += 1;
    } else {
      notes.push('A ' + product.finish.toLowerCase() + ' finish, which is not one you saved.');
      score += 0.3;
    }
  }

  if (profile.budget) {
    known++;
    const within =
      profile.budget === 'No limit' ||
      (profile.budget === 'Under ₹149' && product.price < 149) ||
      (profile.budget === '₹149–₹249' && product.price >= 149 && product.price <= 249);
    notes.push(within ? 'Within the budget you saved.' : 'Above the budget you saved.');
    score += within ? 1 : 0.2;
  }

  if (!known) {
    return {
      level: 'unknown',
      label: 'Save a profile to see this',
      notes: ['Set your skin tone and preferences to get a read on this shade.']
    };
  }

  const ratio = score / known;
  const level = ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'worth' : 'against';
  const label = {
    good: 'Fits what you saved',
    worth: 'Worth testing',
    against: 'Goes against what you saved'
  }[level];
  return { level, label, notes };
}

export function compareToSkin(hex, profile = getProfile()) {
  const skin = skinLab(profile);
  if (!skin) return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return deltaE(rgbToLab(rgb.r, rgb.g, rgb.b), skin);
}
