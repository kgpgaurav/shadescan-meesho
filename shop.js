import { loadCatalogue, byCategory, families, finishes, CATEGORIES } from './catalogue.js';
import { hexToRgb, rgbToLab, deltaE } from './color.js';
import { params, productCard, mountHeader, escapeHtml } from './ui.js';

const el = id => document.getElementById(id);
const query = params();

const state = {
  category: query.get('cat') || 'lipstick',
  hex: query.get('hex'),
  lab: null,
  tolerance: 14,
  families: new Set(),
  finishes: new Set(),
  price: new Set(),
  rating: 0,
  sort: 'match'
};

const PRICE_BANDS = [
  { key: 'u150', label: 'Under ₹150', test: p => p.price < 150 },
  { key: '150-200', label: '₹150 – ₹200', test: p => p.price >= 150 && p.price <= 200 },
  { key: '200-250', label: '₹200 – ₹250', test: p => p.price > 200 && p.price <= 250 },
  { key: 'o250', label: 'Above ₹250', test: p => p.price > 250 }
];

if (state.hex) {
  const rgb = hexToRgb(state.hex);
  if (rgb) state.lab = rgbToLab(rgb.r, rgb.g, rgb.b);
}

function categoryLabel() {
  const cat = CATEGORIES.find(c => c.key === state.category);
  return cat ? cat.label : 'Products';
}

function withDistance(list) {
  if (!state.lab) return list.map(p => ({ product: p, distance: null }));
  return list.map(p => ({ product: p, distance: deltaE(p.lab, state.lab) }));
}

function filtered() {
  let rows = withDistance(byCategory(state.category));
  if (state.lab) rows = rows.filter(r => r.distance <= state.tolerance);
  if (state.families.size) rows = rows.filter(r => state.families.has(r.product.family));
  if (state.finishes.size) rows = rows.filter(r => state.finishes.has(r.product.finish));
  if (state.price.size) {
    rows = rows.filter(r => [...state.price].some(key => {
      const band = PRICE_BANDS.find(b => b.key === key);
      return band && band.test(r.product);
    }));
  }
  if (state.rating) rows = rows.filter(r => r.product.rating >= state.rating);

  const sorters = {
    match: (a, b) => (a.distance ?? 0) - (b.distance ?? 0) || b.product.rating - a.product.rating,
    popular: (a, b) => b.product.reviewCount - a.product.reviewCount,
    low: (a, b) => a.product.price - b.product.price,
    high: (a, b) => b.product.price - a.product.price,
    rating: (a, b) => b.product.rating - a.product.rating
  };
  return rows.sort(sorters[state.sort] || sorters.match);
}

function widenToFit(minimum = 6) {
  if (!state.lab) return false;
  const distances = byCategory(state.category)
    .map(p => deltaE(p.lab, state.lab))
    .sort((a, b) => a - b);
  if (!distances.length) return false;
  if (distances.filter(d => d <= state.tolerance).length >= 1) return false;
  const target = distances[Math.min(minimum, distances.length) - 1];
  state.tolerance = Math.min(40, Math.ceil(target));
  return true;
}

function toleranceWording() {
  const t = state.tolerance;
  if (t <= 8) return 'Only shades a shopper would call the same colour.';
  if (t <= 16) return 'Shades in the same family, with differences you would notice side by side.';
  if (t <= 26) return 'A wider sweep, including clearly different shades of a similar character.';
  return 'Almost the whole category.';
}

function renderCatBar() {
  const bar = el('catBar');
  bar.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat.plural;
    btn.setAttribute('aria-current', cat.key === state.category ? 'page' : 'false');
    btn.addEventListener('click', () => {
      state.category = cat.key;
      state.families.clear();
      state.finishes.clear();
      const widened = widenToFit();
      renderCatBar();
      renderFilters();
      renderGrid();
      if (widened) {
        setNote('No ' + cat.label.toLowerCase() + ' sits that close to your scan, so the closeness was opened to ΔE ' + state.tolerance + '.');
      }
      const next = new URL(location.href);
      next.searchParams.set('cat', cat.key);
      history.replaceState(null, '', next);
    });
    bar.appendChild(btn);
  });
}

function chipRow(holder, values, selected, onToggle, labelOf) {
  holder.innerHTML = '';
  values.forEach(value => {
    const btn = document.createElement('button');
    btn.className = 'fchip';
    btn.textContent = labelOf ? labelOf(value) : value;
    btn.setAttribute('aria-pressed', String(selected(value)));
    btn.addEventListener('click', () => { onToggle(value); renderFilters(); renderGrid(); });
    holder.appendChild(btn);
  });
}

function renderFilters() {
  el('shadeFilter').hidden = !state.lab;
  if (state.lab) {
    el('shadeSw').style.background = state.hex;
    el('shadeHex').textContent = state.hex.toUpperCase();
    el('tolerance').value = state.tolerance;
    if (!el('toleranceNote').classList.contains('widened')) {
      el('toleranceNote').textContent = toleranceWording();
    }
  }

  chipRow(el('familyChips'), families(state.category),
    v => state.families.has(v),
    v => state.families.has(v) ? state.families.delete(v) : state.families.add(v));

  chipRow(el('finishChips'), finishes(state.category),
    v => state.finishes.has(v),
    v => state.finishes.has(v) ? state.finishes.delete(v) : state.finishes.add(v));

  chipRow(el('priceChips'), PRICE_BANDS.map(b => b.key),
    v => state.price.has(v),
    v => state.price.has(v) ? state.price.delete(v) : state.price.add(v),
    v => PRICE_BANDS.find(b => b.key === v).label);

  chipRow(el('ratingChips'), [4.2, 4, 3.8],
    v => state.rating === v,
    v => { state.rating = state.rating === v ? 0 : v; },
    v => v + ' ★ & above');
}

function setNote(text) {
  const node = el('toleranceNote');
  node.textContent = text;
  node.classList.add('widened');
}

function renderApplied(rows) {
  const holder = el('applied');
  const bits = [];
  if (state.lab) bits.push('Within ΔE ' + state.tolerance + ' of ' + state.hex.toUpperCase());
  state.families.forEach(f => bits.push(f));
  state.finishes.forEach(f => bits.push(f));
  state.price.forEach(k => bits.push(PRICE_BANDS.find(b => b.key === k).label));
  if (state.rating) bits.push(state.rating + ' ★ & above');
  holder.innerHTML = bits.length
    ? bits.map(b => '<span class="applied">' + escapeHtml(b) + '</span>').join('')
    : '';
  if (state.lab) el('shadeCount').textContent = rows.length + ' shades within range';
}

function renderGrid() {
  const rows = filtered();
  renderApplied(rows);
  el('resultTitle').textContent = categoryLabel();
  el('resultCount').textContent = 'Showing ' + rows.length + ' of ' + byCategory(state.category).length + ' products';
  el('empty').hidden = rows.length > 0;
  el('grid').innerHTML = rows.map(({ product, distance }) => productCard(
    product,
    distance === null ? '' : '<span class="pmatch">ΔE ' + distance.toFixed(1) + ' from your scan</span>'
  )).join('');
}

el('tolerance').addEventListener('input', e => {
  state.tolerance = Number(e.target.value);
  el('toleranceNote').classList.remove('widened');
  el('toleranceNote').textContent = toleranceWording();
  renderGrid();
});

el('sortBy').addEventListener('change', e => {
  state.sort = e.target.value;
  renderGrid();
});

el('resetFilters').addEventListener('click', () => {
  state.families.clear();
  state.finishes.clear();
  state.price.clear();
  state.rating = 0;
  state.tolerance = 14;
  renderFilters();
  renderGrid();
});

el('filterFab').addEventListener('click', () => {
  const open = document.body.classList.toggle('filtersopen');
  el('filterFab').textContent = open ? 'Done' : 'Filters';
});

mountHeader(el('storeHeader'), { query: state.hex ? 'Shade ' + state.hex.toUpperCase() : 'Search by shade' });

loadCatalogue().then(() => {
  const widened = widenToFit();
  renderCatBar();
  renderFilters();
  renderGrid();
  if (widened) setNote('Nothing sits that close to your scan here, so the closeness was opened to ΔE ' + state.tolerance + '.');
}).catch(() => {
  el('empty').hidden = false;
  el('empty').textContent = 'Catalogue did not load. Serve the folder over HTTP.';
});
