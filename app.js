import { Scanner } from './scanner.js';
import { TryOn } from './tryon.js';
import { SwatchBoard } from './swatch.js';
import { runFormats } from './formats.js';
import {
  loadCatalogue, loadContent, byCategory, byId, lipShades, eyeShades,
  nearestShades, matchQuality, CATEGORIES
} from './catalogue.js';
import { deltaE } from './color.js';
import {
  getProfile, saveProfile, clearProfile, getTray, addToTray,
  assess, compareToSkin, SKIN_STEPS, UNDERTONES, BUDGETS
} from './profile.js';

const el = id => document.getElementById(id);

const samples = [];
let activeIndex = -1;
let swatchCategory = 'lipstick';

const scanner = new Scanner({
  video: el('scanVideo'),
  frame: el('frameCanvas'),
  plate: el('plate'),
  stage: el('scanStage'),
  readout: el('readoutText'),
  onMode: syncToolbar,
  onStatus: (kind, message) => setStatus(el('scanStatus'), kind, message)
});

const tryOn = new TryOn({
  video: el('tryVideo'),
  canvas: el('tryCanvas'),
  stage: el('tryStage'),
  onStatus: (kind, message) => {
    setStatus(el('tryStatus'), kind, message);
    el('tryHint').textContent = kind === 'live' ? 'Tracking' : message;
    el('tryHint').hidden = kind === 'live';
  }
});

const board = new SwatchBoard({
  video: el('swatchVideo'),
  frame: el('swatchFrame'),
  paint: el('paintCanvas'),
  plate: el('swatchPlate'),
  stage: el('swatchStage'),
  readout: el('swatchReadout'),
  onSkin: hex => {
    saveProfile({ skinHex: hex, skinSource: 'photo' });
    el('swatchSwatch').style.background = hex;
    positionSkinPin();
    renderProfile();
    renderVerdicts();
    setStatus(el('swatchStatus'), 'review', 'Skin tone read as ' + hex + '. Switch back to Paint and swatch a shade beside it.');
  },
  onChange: renderVerdicts,
  onStatus: (kind, message) => setStatus(el('swatchStatus'), kind, message)
});

function setStatus(node, kind, message) {
  node.textContent = message;
  node.classList.toggle('bad', kind === 'denied' || kind === 'failed' || kind === 'nocamera');
}

function syncToolbar(mode) {
  el('captureBtn').hidden = mode === 'review';
  el('retakeBtn').hidden = mode !== 'review';
  el('captureBtn').disabled = mode === 'idle';
  el('flipBtn').disabled = mode === 'idle';
}

function syncSwatchToolbar() {
  const mode = board.scanner.mode;
  el('swatchCapture').hidden = mode === 'review';
  el('swatchRetake').hidden = mode !== 'review';
  el('swatchCapture').disabled = mode === 'idle';
}

function clearSamples() {
  samples.length = 0;
  activeIndex = -1;
  el('markers').innerHTML = '';
  el('sampleStrip').innerHTML = '';
  el('samples').hidden = true;
  el('result').hidden = true;
  el('compare').hidden = true;
  el('readoutSwatch').style.background = '';
}

function render() {
  renderMarkers();
  renderStrip();
  renderCompare();
  showReading(samples[activeIndex]);
}

function renderMarkers() {
  const holder = el('markers');
  holder.innerHTML = '';
  samples.forEach((s, i) => {
    const pin = document.createElement('button');
    pin.className = 'pin';
    pin.style.left = (s.x * 100).toFixed(3) + '%';
    pin.style.top = (s.y * 100).toFixed(3) + '%';
    pin.style.setProperty('--c', s.reading.hex);
    pin.setAttribute('aria-pressed', String(i === activeIndex));
    pin.setAttribute('aria-label', 'Point ' + (i + 1) + ', ' + s.reading.hex);
    pin.innerHTML = '<b>' + (i + 1) + '</b>';
    pin.addEventListener('click', ev => {
      ev.stopPropagation();
      activeIndex = i;
      render();
    });
    holder.appendChild(pin);
  });
}

function renderStrip() {
  const strip = el('sampleStrip');
  strip.innerHTML = '';
  samples.forEach((s, i) => {
    const card = document.createElement('button');
    card.className = 'swatchcard';
    card.setAttribute('aria-pressed', String(i === activeIndex));
    card.innerHTML =
      '<span class="sw" style="background:' + s.reading.hex + '"></span>' +
      '<b>' + s.reading.hex + '</b><em>Point ' + (i + 1) + '</em>';
    card.addEventListener('click', () => { activeIndex = i; render(); });
    const kill = document.createElement('span');
    kill.className = 'kill';
    kill.textContent = '×';
    kill.setAttribute('role', 'button');
    kill.addEventListener('click', ev => {
      ev.stopPropagation();
      samples.splice(i, 1);
      if (!samples.length) { clearSamples(); return; }
      activeIndex = Math.min(activeIndex, samples.length - 1);
      render();
    });
    card.appendChild(kill);
    strip.appendChild(card);
  });
  el('samples').hidden = samples.length === 0;
}

function renderCompare() {
  const node = el('compare');
  if (samples.length < 2 || activeIndex < 0) { node.hidden = true; return; }
  const active = samples[activeIndex];
  const others = samples
    .map((s, i) => ({ i, d: deltaE(active.reading.lab, s.reading.lab) }))
    .filter(x => x.i !== activeIndex)
    .sort((a, b) => a.d - b.d);
  const closest = others[0];
  const furthest = others[others.length - 1];
  const verdict = d => d < 2 ? 'the same colour' : d < 6 ? 'a close match' : d < 14 ? 'visibly different' : 'clearly different';
  let text = 'Point ' + (activeIndex + 1) + ' against point ' + (closest.i + 1) +
    ': ΔE ' + closest.d.toFixed(1) + ', <b>' + verdict(closest.d) + '</b>.';
  if (others.length > 1) text += ' Widest gap is point ' + (furthest.i + 1) + ' at ΔE ' + furthest.d.toFixed(1) + '.';
  node.innerHTML = text;
  node.hidden = false;
}

function drawLoupe(sample) {
  const canvas = el('loupe');
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sample.patch, 0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.34);
  ctx.lineTo(size / 2, size * 0.66);
  ctx.moveTo(size * 0.34, size / 2);
  ctx.lineTo(size * 0.66, size / 2);
  ctx.stroke();
}

function renderCategoryLinks(hex) {
  const grid = el('catGrid');
  grid.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const link = document.createElement('a');
    link.className = 'catbtn';
    link.href = 'shop.html?hex=' + encodeURIComponent(hex) + '&cat=' + cat.key;
    link.innerHTML = '<span class="catsw" style="background:' + hex + '"></span>' + cat.label;
    grid.appendChild(link);
  });
}

function showReading(sample) {
  if (!sample) return;
  const reading = sample.reading;
  el('result').hidden = false;
  el('bigHex').textContent = reading.hex;
  el('readoutSwatch').style.background = reading.hex;
  el('readoutText').textContent = reading.hex;
  drawLoupe(sample);
  renderCategoryLinks(reading.hex);

  const conf = el('confidence');
  conf.className = 'confidence ' + reading.confidence;
  conf.textContent = {
    high: 'Even colour across the point',
    medium: 'Some variation here — try a flatter area',
    low: 'Mixed colours here — move off the edge or highlight'
  }[reading.confidence];

  const list = el('formats');
  list.innerHTML = '';
  runFormats(reading).forEach(f => {
    const row = document.createElement('div');
    row.className = 'row';
    const dt = document.createElement('dt');
    dt.textContent = f.label;
    const dd = document.createElement('dd');
    dd.textContent = f.value;
    if (f.detail) {
      const small = document.createElement('small');
      small.textContent = f.detail;
      dd.appendChild(small);
    }
    row.append(dt, dd);
    list.appendChild(row);
  });

  const matches = el('matches');
  matches.innerHTML = '<h4>Closest shades in the catalogue</h4>';
  nearestShades(reading.lab, 3).forEach(({ shade, distance }) => {
    const q = matchQuality(distance);
    const link = document.createElement('a');
    link.className = 'match';
    link.href = 'product.html?id=' + shade.id;
    link.innerHTML =
      '<span class="sw" style="background:' + shade.hex + '"></span>' +
      '<span><b>' + shade.shade + ' · ' + shade.id + '</b>' +
      '<em>' + shade.categoryLabel + ' · ' + shade.finish + ' · ' + shade.seller + '</em>' +
      '<span class="tag ' + q.key + '">' + q.label + ' (ΔE ' + distance.toFixed(1) + ')</span></span>' +
      '<span class="price">₹' + shade.price + '</span>';
    matches.appendChild(link);
  });

  paintScannedSwatch(reading.hex);
}

function paintScannedSwatch(hex) {
  ['lipSwatches', 'eyeSwatches'].forEach(id => {
    const holder = el(id);
    let btn = holder.querySelector('.scanned');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'scanned';
      btn.addEventListener('click', () => applyColour(id === 'lipSwatches' ? 'lips' : 'eyes', btn.dataset.hex));
      holder.prepend(btn);
    }
    btn.style.background = hex;
    btn.dataset.hex = hex;
    btn.title = 'Scanned ' + hex;
  });
}

function applyColour(region, hex, finish) {
  tryOn.set(region, finish ? { hex, finish } : { hex });
  const holder = el(region === 'lips' ? 'lipSwatches' : 'eyeSwatches');
  [...holder.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hex === hex)));
  if (finish) {
    const group = el(region === 'lips' ? 'lipFinish' : 'eyeFinish');
    [...group.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finish === finish)));
  }
  const toggle = el(region === 'lips' ? 'lipsOn' : 'eyesOn');
  if (!toggle.checked) {
    toggle.checked = true;
    tryOn.set(region, { on: true });
  }
}

function buildSwatches(holderId, shades, region) {
  const holder = el(holderId);
  shades.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.style.background = s.hex;
    btn.dataset.hex = s.hex;
    btn.title = s.shade + ' · ' + s.id;
    btn.setAttribute('aria-pressed', String(i === 0));
    btn.addEventListener('click', () => applyColour(region, s.hex, s.finish));
    holder.appendChild(btn);
  });
  if (shades.length) tryOn.set(region, { hex: shades[0].hex });
}

function renderSwatchCats() {
  const holder = el('swatchCats');
  holder.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat.label;
    btn.setAttribute('aria-pressed', String(cat.key === swatchCategory));
    btn.addEventListener('click', () => {
      swatchCategory = cat.key;
      renderSwatchCats();
      renderTray();
    });
    holder.appendChild(btn);
  });
}

function renderTray() {
  const holder = el('swatchTray');
  holder.innerHTML = '';
  const saved = getTray().map(byId).filter(Boolean).filter(p => p.category === swatchCategory);
  const rest = byCategory(swatchCategory).filter(p => !saved.includes(p));
  const shown = saved.concat(rest).slice(0, 24);
  shown.forEach((product, i) => {
    const btn = document.createElement('button');
    btn.style.background = product.hex;
    btn.dataset.id = product.id;
    btn.title = product.shade + ' · ₹' + product.price;
    if (saved.includes(product)) btn.classList.add('scanned');
    btn.setAttribute('aria-pressed', String(board.active ? board.active.id === product.id : i === 0));
    btn.addEventListener('click', () => {
      board.setActive(product);
      [...holder.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === product.id)));
      setStatus(el('swatchStatus'), 'review', 'Painting ' + product.shade + '. Drag across your skin to lay a swatch.');
    });
    holder.appendChild(btn);
  });
  if (!board.active && shown.length) board.setActive(shown[0]);
}

function positionSkinPin() {
  const pin = el('skinPin');
  if (!board.skinPoint) { pin.hidden = true; return; }
  pin.hidden = false;
  pin.style.left = (board.skinPoint.x * 100).toFixed(2) + '%';
  pin.style.top = (board.skinPoint.y * 100).toFixed(2) + '%';
  pin.style.setProperty('--c', board.skinPoint.hex);
}

function renderVerdicts() {
  const used = board.usedProducts();
  const holder = el('verdictList');
  el('verdicts').hidden = used.length === 0;
  holder.innerHTML = '';
  used.forEach(stroke => {
    const product = byId(stroke.id);
    if (!product) return;
    const verdict = assess(product);
    const gap = compareToSkin(product.hex);
    const row = document.createElement('div');
    row.className = 'verdict';
    row.innerHTML =
      '<span class="sw" style="background:' + product.hex + '"></span>' +
      '<span class="vtext"><b>' + product.shade + '</b>' +
      '<span class="vlevel ' + verdict.level + '">' + verdict.label + '</span>' +
      '<ul>' + verdict.notes.map(n => '<li>' + n + '</li>').join('') + '</ul>' +
      (gap === null ? '' : '<em>ΔE ' + gap.toFixed(1) + ' from your skin tone</em>') +
      '</span>' +
      '<a class="chipbtn" href="product.html?id=' + product.id + '">Open</a>';
    holder.appendChild(row);
  });
}

function chip(label, pressed, onClick, swatchHex) {
  const btn = document.createElement('button');
  btn.className = 'q';
  btn.setAttribute('aria-pressed', String(pressed));
  btn.innerHTML = (swatchHex ? '<span class="sw" style="background:' + swatchHex + '"></span>' : '') + label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderProfile() {
  const profile = getProfile();
  const skin = el('skinSteps');
  skin.innerHTML = '';
  SKIN_STEPS.forEach(step => {
    skin.appendChild(chip(step.label, profile.skinHex === step.hex, () => {
      saveProfile({ skinHex: step.hex, skinSource: 'chosen' });
      renderProfile();
      renderVerdicts();
    }, step.hex));
  });
  el('skinSource').textContent = profile.skinHex
    ? (profile.skinSource === 'photo' ? 'read from your photo · ' + profile.skinHex : profile.skinHex)
    : 'not set';

  const tone = el('undertoneOpts');
  tone.innerHTML = '';
  UNDERTONES.forEach(u => {
    tone.appendChild(chip(u.label, profile.undertone === u.key, () => {
      saveProfile({ undertone: profile.undertone === u.key ? null : u.key });
      renderProfile();
      renderVerdicts();
    }));
  });

  const finishHolder = el('finishOpts');
  finishHolder.innerHTML = '';
  ['Matte', 'Satin', 'Creme', 'Glossy', 'Sheer', 'Shimmer'].forEach(f => {
    const on = profile.finishes.includes(f);
    finishHolder.appendChild(chip(f, on, () => {
      const next = on ? profile.finishes.filter(x => x !== f) : profile.finishes.concat(f);
      saveProfile({ finishes: next });
      renderProfile();
      renderVerdicts();
    }));
  });

  const budget = el('budgetOpts');
  budget.innerHTML = '';
  BUDGETS.forEach(b => {
    budget.appendChild(chip(b, profile.budget === b, () => {
      saveProfile({ budget: profile.budget === b ? null : b });
      renderProfile();
      renderVerdicts();
    }));
  });
}

function switchTab(name) {
  const tabs = el('tabs');
  tabs.dataset.active = name;
  [...tabs.querySelectorAll('[data-tab]')].forEach(b => {
    b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
  });
  el('panel-scan').hidden = name !== 'scan';
  el('panel-tryon').hidden = name !== 'tryon';
  el('panel-swatch').hidden = name !== 'swatch';
  if (name !== 'tryon') {
    tryOn.stop();
    el('tryHint').hidden = false;
    el('tryHint').textContent = 'Camera off';
    el('tryBtn').textContent = 'Start camera';
  }
  if (name !== 'scan' && scanner.mode === 'live') scanner.stop();
  if (name !== 'swatch' && board.scanner.mode === 'live') board.scanner.stop();
  if (name === 'swatch') { renderTray(); renderProfile(); }
}

el('pickArea').addEventListener('click', e => {
  const box = e.currentTarget.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const sample = scanner.sampleAt((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
  if (!sample) {
    setStatus(el('scanStatus'), 'failed', 'Nothing readable at that point. Try a flatter area.');
    return;
  }
  samples.push(sample);
  activeIndex = samples.length - 1;
  render();
  setStatus(el('scanStatus'), 'review', samples.length === 1
    ? 'Tap another point to compare two areas of the same photo.'
    : samples.length + ' points read. Select one to see its codes.');
});

el('tabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-tab]');
  if (btn) switchTab(btn.dataset.tab);
});

el('cameraBtn').addEventListener('click', async () => {
  clearSamples();
  const ok = await scanner.start();
  el('cameraBtn').textContent = ok ? 'Restart' : 'Camera';
});
el('flipBtn').addEventListener('click', () => { clearSamples(); scanner.flip(); });
el('captureBtn').addEventListener('click', () => { clearSamples(); scanner.capture(); });
el('retakeBtn').addEventListener('click', () => { clearSamples(); scanner.resume(); });
el('clearSamples').addEventListener('click', () => {
  clearSamples();
  if (scanner.mode === 'review') el('readoutText').textContent = 'Tap a point';
});

function readPhoto(input, handler) {
  const file = input.files && input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { handler(img); URL.revokeObjectURL(url); };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
  input.value = '';
}

el('fileInput').addEventListener('change', e => readPhoto(e.target, img => {
  clearSamples();
  scanner.release();
  scanner.useImage(img);
}));

el('copyHex').addEventListener('click', async () => {
  if (activeIndex < 0) return;
  const hex = samples[activeIndex].reading.hex;
  try {
    await navigator.clipboard.writeText(hex);
    el('copyHex').textContent = 'Copied';
    setTimeout(() => { el('copyHex').textContent = 'Copy'; }, 1400);
  } catch (err) {
    el('copyHex').textContent = hex;
  }
});

el('toTryOn').addEventListener('click', () => {
  if (activeIndex >= 0) applyColour('lips', samples[activeIndex].reading.hex);
  switchTab('tryon');
});

el('tryBtn').addEventListener('click', async () => {
  el('tryBtn').disabled = true;
  el('tryBtn').textContent = 'Starting';
  const ok = await tryOn.start();
  el('tryBtn').disabled = false;
  el('tryBtn').textContent = ok ? 'Restart camera' : 'Start camera';
});
el('stopTryBtn').addEventListener('click', () => {
  tryOn.stop();
  el('tryHint').hidden = false;
  el('tryHint').textContent = 'Camera off';
  el('tryBtn').textContent = 'Start camera';
});

el('lipsOn').addEventListener('change', e => tryOn.set('lips', { on: e.target.checked }));
el('eyesOn').addEventListener('change', e => tryOn.set('eyes', { on: e.target.checked }));
el('lipIntensity').addEventListener('input', e => tryOn.set('lips', { intensity: e.target.value / 100 }));
el('eyeIntensity').addEventListener('input', e => tryOn.set('eyes', { intensity: e.target.value / 100 }));

[['lipFinish', 'lips'], ['eyeFinish', 'eyes']].forEach(([id, region]) => {
  el(id).addEventListener('click', e => {
    const btn = e.target.closest('[data-finish]');
    if (!btn) return;
    [...el(id).children].forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    tryOn.set(region, { finish: btn.dataset.finish });
  });
});

el('swatchCamera').addEventListener('click', async () => {
  const ok = await board.scanner.start('environment');
  el('swatchCamera').textContent = ok ? 'Restart' : 'Camera';
  syncSwatchToolbar();
});
el('swatchCapture').addEventListener('click', async () => {
  await board.scanner.capture();
  syncSwatchToolbar();
  positionSkinPin();
});
el('swatchRetake').addEventListener('click', () => {
  board.scanner.resume();
  board.clear();
  syncSwatchToolbar();
  positionSkinPin();
});
el('swatchFile').addEventListener('change', e => readPhoto(e.target, img => {
  board.scanner.release();
  board.scanner.useImage(img);
  syncSwatchToolbar();
  positionSkinPin();
}));
el('swatchClear').addEventListener('click', () => board.clear());
el('undoStroke').addEventListener('click', () => board.undo());
el('brushSize').addEventListener('input', e => board.setSize(e.target.value / 100));
el('brushStrength').addEventListener('input', e => board.setIntensity(e.target.value / 100));
el('modePaint').addEventListener('click', () => {
  board.setMode('paint');
  el('modePaint').setAttribute('aria-pressed', 'true');
  el('modeSkin').setAttribute('aria-pressed', 'false');
});
el('modeSkin').addEventListener('click', () => {
  board.setMode('skin');
  el('modePaint').setAttribute('aria-pressed', 'false');
  el('modeSkin').setAttribute('aria-pressed', 'true');
  setStatus(el('swatchStatus'), 'review', 'Tap a bare patch of skin to record your tone.');
});
el('profileClear').addEventListener('click', () => {
  clearProfile();
  renderProfile();
  renderVerdicts();
});

syncToolbar('idle');
syncSwatchToolbar();
switchTab('scan');

Promise.all([loadCatalogue(), loadContent()])
  .then(() => {
    buildSwatches('lipSwatches', lipShades(), 'lips');
    buildSwatches('eyeSwatches', eyeShades(), 'eyes');
    renderSwatchCats();
    renderTray();
    renderProfile();
    const incoming = new URLSearchParams(location.search).get('swatch');
    if (incoming) {
      addToTray(incoming);
      const product = byId(incoming);
      if (product) {
        swatchCategory = product.category;
        renderSwatchCats();
        renderTray();
        board.setActive(product);
        switchTab('swatch');
      }
    }
  })
  .catch(() => {
    setStatus(el('scanStatus'), 'failed', 'Shade catalogue did not load. Serve the folder over HTTP, not from a file path.');
  });
