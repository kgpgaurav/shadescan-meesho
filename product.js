import {
  loadCatalogue, loadContent, byId, byCategory, nearestShades,
  matchQuality, reviewsFor, creatorsFor, ratingSpread
} from './catalogue.js';
import { params, artwork, tint, escapeHtml, discount, formatCount, mountHeader, productCard } from './ui.js';
import { assess, addToTray, getProfile } from './profile.js';

const el = id => document.getElementById(id);
const query = params();

function starRow(n) {
  return '★★★★★'.slice(0, n) + '<span class="dim">' + '★★★★★'.slice(0, 5 - n) + '</span>';
}

function spreadBars(product) {
  const spread = ratingSpread(product);
  const max = Math.max(...spread, 1);
  return spread.map((count, i) => {
    const stars = 5 - i;
    return `<div class="bar"><span>${stars} ★</span>
      <span class="track"><span class="fill" style="width:${Math.round((count / max) * 100)}%"></span></span>
      <span class="num">${formatCount(count)}</span></div>`;
  }).join('');
}

function reviewBlock(product) {
  const rows = reviewsFor(product, 5);
  return rows.map(r => `<article class="review">
    <header>
      <span class="stars">${starRow(r.stars)}</span>
      <b>${escapeHtml(r.author)}</b>
      <em>${escapeHtml(r.context)}</em>
    </header>
    <p>${escapeHtml(r.text)}</p>
    ${r.photo ? `<span class="rphoto" style="background:linear-gradient(140deg,${tint(product.hex, .9)},${tint(product.hex, .45)})"></span>` : ''}
  </article>`).join('');
}

function creatorBlock(product) {
  const rows = creatorsFor(product, 2);
  if (!rows.length) return '<p class="muted">No creator demonstration recorded for this variant yet.</p>';
  return rows.map(c => `<article class="demo">
    <span class="dthumb" style="background:linear-gradient(165deg,${tint(product.hex, .95)},${tint(product.hex, .5)})"><span class="play"></span></span>
    <div class="dbody">
      <header>
        <b>@${escapeHtml(c.creator)}</b>
        <span class="disc">${escapeHtml(c.disclosure)}</span>
      </header>
      <div class="dchips">
        <span>${escapeHtml(product.shade)} · ${product.id}</span>
        <span>${escapeHtml(c.lighting)}</span>
        <span>${escapeHtml(c.coats)}</span>
        <span>${escapeHtml(c.wear)}</span>
        <span>${escapeHtml(c.context)}</span>
      </div>
      <p class="liked"><b>What worked</b> ${escapeHtml(c.liked)}</p>
      <p class="disliked"><b>What didn't</b> ${escapeHtml(c.disliked)}</p>
    </div>
  </article>`).join('');
}

function verdictBlock(product) {
  const profile = getProfile();
  const verdict = assess(product, profile);
  if (verdict.level === 'unknown') {
    return `<div class="verdictcard unknown">
      <b>No profile saved</b>
      <p>Set your skin tone and preferences in the swatch test to see how this shade is likely to read on you.</p>
      <a class="chipbtn" href="index.html?swatch=${product.id}">Open swatch test</a>
    </div>`;
  }
  return `<div class="verdictcard ${verdict.level}">
    <b>${verdict.label}</b>
    <ul>${verdict.notes.map(n => '<li>' + escapeHtml(n) + '</li>').join('')}</ul>
    <p class="muted">A suggestion based on what you saved, not a rule. Swatch it and decide for yourself.</p>
  </div>`;
}

function render(product) {
  const similar = nearestShades(product.lab, 5, byCategory(product.category))
    .filter(r => r.shade.id !== product.id).slice(0, 4);

  el('productMain').innerHTML = `
    <nav class="crumbs">
      <a href="index.html">Shade scan</a> ›
      <a href="shop.html?cat=${product.category}&hex=${encodeURIComponent(product.hex)}">${escapeHtml(product.categoryLabel)}</a> ›
      <span>${escapeHtml(product.shade)}</span>
    </nav>

    <section class="phero">
      <div class="pgallery" style="background:linear-gradient(158deg,${tint(product.hex, .18)},${tint(product.hex, .05)})">
        ${artwork(product)}
        <span class="pbadge">Shade Passport</span>
      </div>

      <div class="pinfo">
        <h1>${escapeHtml(product.name)}</h1>
        <div class="pricerow">
          <span class="big">₹${product.price}</span>
          <s>₹${product.mrp}</s>
          <em>${discount(product)}% off</em>
        </div>
        <div class="raterow">
          <span class="ratepill">${product.rating.toFixed(1)} <i>★</i></span>
          <span class="ratecount">${formatCount(product.reviewCount)} Reviews</span>
          <span class="dot">·</span>
          <span class="ratecount">Sold by ${escapeHtml(product.seller)}</span>
        </div>

        <div class="passport">
          <div class="prow"><span class="sw" style="background:${product.hex}"></span>
            <div><b>${escapeHtml(product.shade)}</b><em>${product.id}</em></div>
            <span class="hexv">${product.hex.toUpperCase()}</span>
          </div>
          <dl>
            <div><dt>Colour</dt><dd>${escapeHtml(product.family)}</dd></div>
            <div><dt>Finish</dt><dd>${escapeHtml(product.finish)}</dd></div>
            <div><dt>Coverage</dt><dd>${escapeHtml(product.coverage)}</dd></div>
            <div><dt>Category</dt><dd>${escapeHtml(product.categoryLabel)}</dd></div>
          </dl>
          <p class="passfoot">Swatch captured by the seller against a D65 reference target and checked before publishing. Digital swatches stay approximate — colour shifts with lighting and application.</p>
        </div>

        ${verdictBlock(product)}

        <div class="pactions">
          <a class="btn ghost" href="index.html?swatch=${product.id}" id="swatchLink">Swatch on my skin</a>
          <button class="btn solid" id="buyBtn">Buy now</button>
        </div>
      </div>
    </section>

    <section class="psection">
      <h2>Creator demonstrations</h2>
      <p class="sublead">Recorded on this exact variant, with lighting and wear time stated, and what the creator did not like kept in.</p>
      ${creatorBlock(product)}
    </section>

    <section class="psection">
      <h2>Customer reviews</h2>
      <div class="ratingsummary">
        <div class="score">
          <b>${product.rating.toFixed(1)}</b>
          <span class="stars">${starRow(Math.round(product.rating))}</span>
          <em>${formatCount(product.reviewCount)} ratings</em>
        </div>
        <div class="bars">${spreadBars(product)}</div>
      </div>
      ${reviewBlock(product)}
    </section>

    <section class="psection">
      <h2>Nearby shades in ${escapeHtml(product.categoryLabel.toLowerCase())}</h2>
      <div class="pgrid">
        ${similar.map(r => productCard(r.shade, '<span class="pmatch">ΔE ' + r.distance.toFixed(1) + ' from this shade · ' + matchQuality(r.distance).label + '</span>')).join('')}
      </div>
    </section>`;

  el('swatchLink').addEventListener('click', () => addToTray(product.id));
  el('buyBtn').addEventListener('click', e => {
    e.currentTarget.textContent = 'Order placed on ' + product.id;
    e.currentTarget.disabled = true;
  });
}

mountHeader(el('storeHeader'), { query: 'Search by shade' });

Promise.all([loadCatalogue(), loadContent()]).then(() => {
  const product = byId(query.get('id'));
  if (!product) {
    el('productMain').innerHTML = '<p class="empty">That product id is not in the catalogue. <a href="shop.html">Browse shades</a></p>';
    return;
  }
  document.title = product.name + ' — Meesho ShadeMatch';
  render(product);
}).catch(() => {
  el('productMain').innerHTML = '<p class="empty">Catalogue did not load. Serve the folder over HTTP.</p>';
});
