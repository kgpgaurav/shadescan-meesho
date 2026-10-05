export function params() {
  return new URLSearchParams(location.search);
}

export function tint(hex, alpha) {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function discount(product) {
  return Math.round((1 - product.price / product.mrp) * 100);
}

export function artwork(product) {
  const hex = product.hex;
  if (product.category === 'eyeshadow') {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="14" y="26" width="72" height="48" rx="6" fill="#2e2a33"/>
      <rect x="20" y="32" width="29" height="36" rx="3" fill="${hex}"/>
      <rect x="53" y="32" width="29" height="36" rx="3" fill="${hex}" opacity=".58"/>
      <rect x="20" y="32" width="29" height="13" rx="3" fill="#fff" opacity=".14"/>
    </svg>`;
  }
  if (product.category === 'nail') {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="36" y="12" width="28" height="20" rx="3" fill="#2e2a33"/>
      <rect x="44" y="30" width="12" height="10" fill="#45404b"/>
      <path d="M32 40h36v38a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8z" fill="${hex}"/>
      <path d="M32 40h11v46h-3a8 8 0 0 1-8-8z" fill="#fff" opacity=".2"/>
    </svg>`;
  }
  if (product.category === 'hair') {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="24" y="16" width="52" height="70" rx="6" fill="#f0ecf2"/>
      <rect x="24" y="16" width="52" height="34" rx="6" fill="${hex}"/>
      <rect x="31" y="58" width="38" height="5" rx="2.5" fill="${hex}" opacity=".75"/>
      <rect x="31" y="68" width="26" height="4" rx="2" fill="#cfc8d4"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect x="38" y="48" width="24" height="42" rx="4" fill="#d7d5de"/>
    <rect x="38" y="48" width="8" height="42" fill="#fff" opacity=".5"/>
    <rect x="36" y="42" width="28" height="9" rx="3" fill="#eceaf0"/>
    <path d="M41 43V18q0-8 9-10l10 5v30z" fill="${hex}"/>
    <path d="M41 43V18q0-8 9-10l3 1-6 6v28z" fill="#fff" opacity=".22"/>
  </svg>`;
}

export function ratingPill(product) {
  return `<span class="ratepill">${product.rating.toFixed(1)} <i>★</i></span><span class="ratecount">${formatCount(product.reviewCount)} Reviews</span>`;
}

export function formatCount(n) {
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function productCard(product, extra) {
  return `<a class="pcard" href="product.html?id=${product.id}">
    <span class="pshot" style="background:linear-gradient(158deg,${tint(product.hex, .16)},${tint(product.hex, .05)})">
      ${artwork(product)}
      <span class="pbadge">Shade Passport</span>
      <span class="pdot" style="background:${product.hex}"></span>
    </span>
    <span class="pmeta">
      <span class="ptitle">${escapeHtml(product.name)}</span>
      <span class="pprice">₹${product.price}<s>₹${product.mrp}</s><em>${discount(product)}% off</em></span>
      <span class="prate">${ratingPill(product)}</span>
      ${extra || ''}
      <span class="pfree">Free Delivery</span>
    </span>
  </a>`;
}

export function mountHeader(node, options = {}) {
  node.innerHTML = `
    <a class="brandlink" href="index.html"><span class="wordmark">meesho</span></a>
    ${options.search === false ? '' : `<div class="searchbar">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <span>${escapeHtml(options.query || 'Search by shade')}</span>
    </div>`}
    <a class="headlink" href="index.html">Shade scan</a>`;
}
