import { hexToRgb, rgbToLab, deltaE } from './color.js';

const CATALOGUE_PATHS = ['shades.json', 'data/shades.json'];
const CONTENT_PATHS = ['content.json', 'data/content.json'];

let items = [];
let content = { reviews: {}, creators: {} };

export const CATEGORIES = [
  { key: 'lipstick', label: 'Lipstick', plural: 'Lipsticks' },
  { key: 'eyeshadow', label: 'Eye shadow', plural: 'Eye shadows' },
  { key: 'nail', label: 'Nail colour', plural: 'Nail polishes' },
  { key: 'hair', label: 'Hair colour', plural: 'Hair colours' }
];

async function loadFirst(paths, fallbackKey) {
  if (globalThis[fallbackKey]) return globalThis[fallbackKey];
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      return await res.json();
    } catch (err) {
      continue;
    }
  }
  throw new Error('Could not load ' + paths.join(' or '));
}

export async function loadCatalogue() {
  const raw = await loadFirst(CATALOGUE_PATHS, 'SHADE_CATALOGUE');
  items = raw.map(entry => {
    const rgb = hexToRgb(entry.hex);
    return { ...entry, rgb, lab: rgbToLab(rgb.r, rgb.g, rgb.b) };
  });
  return items;
}

export async function loadContent() {
  try {
    content = await loadFirst(CONTENT_PATHS, 'SHADE_CONTENT');
  } catch (err) {
    content = { reviews: {}, creators: {} };
  }
  return content;
}

export function allShades() {
  return items;
}

export function byCategory(key) {
  return items.filter(s => s.category === key);
}

export function byId(id) {
  return items.find(s => s.id === id) || null;
}

export function lipShades() {
  return byCategory('lipstick');
}

export function eyeShades() {
  return byCategory('eyeshadow');
}

export function families(key) {
  const set = new Set(byCategory(key).map(s => s.family));
  return [...set].sort();
}

export function finishes(key) {
  const set = new Set(byCategory(key).map(s => s.finish));
  return [...set].sort();
}

export function nearestShades(lab, count = 3, pool = items) {
  return pool
    .map(s => ({ shade: s, distance: deltaE(s.lab, lab) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

export function matchQuality(distance) {
  if (distance < 6) return { key: 'close', label: 'Close match' };
  if (distance < 14) return { key: 'near', label: 'Visible difference' };
  return { key: 'far', label: 'Clearly different' };
}

function hashOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function pick(pool, id, count) {
  if (!pool || !pool.length) return [];
  const start = hashOf(id) % pool.length;
  const out = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    out.push(pool[(start + i * 3) % pool.length]);
  }
  return out;
}

export function reviewsFor(product, count = 4) {
  return pick(content.reviews[product.category], product.id, count)
    .map((r, i) => ({ ...r, id: product.id + '-r' + i }));
}

export function creatorsFor(product, count = 2) {
  return pick(content.creators[product.category], product.id + 'c', count)
    .map((c, i) => ({ ...c, id: product.id + '-c' + i }));
}

export function ratingSpread(product) {
  const r = Math.min(4.9, Math.max(1.2, product.rating));
  const mixed = 0.15;
  let unhappy = (0.85 * 4.75 + mixed * 3.4 - r) / 3.42;
  unhappy = Math.min(0.8, Math.max(0.02, unhappy));
  const happy = Math.max(0, 0.85 - unhappy);
  const shares = [
    happy * 0.75,
    happy * 0.25 + mixed * 0.4,
    mixed * 0.6,
    unhappy * 0.33,
    unhappy * 0.67
  ];
  const sum = shares.reduce((a, b) => a + b, 0) || 1;
  return shares.map(s => Math.max(1, Math.round((s / sum) * product.reviewCount)));
}
