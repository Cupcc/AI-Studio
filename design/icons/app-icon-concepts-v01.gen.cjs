// Generates the app-icon concepts v01 (bubble / window / layers) in the prototype v04 "unified glass" look.
// Usage from the repository root: node design/icons/app-icon-concepts-v01.gen.cjs design/icons
// macOS grid: 1024 canvas, 824 squircle body at (100,100), drop shadow below.
const fs = require('fs');
const path = require('path');
const out = process.argv[2] || __dirname;

const C = 512, A = 412, N = 5; // superellipse approximating Apple's continuous-corner squircle
function squircle(cx = C, cy = C, a = A, n = N, steps = 360) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = cy + a * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push(x.toFixed(2) + ' ' + y.toFixed(2));
  }
  return 'M' + pts.join('L') + 'Z';
}
const SQ = squircle();

// v04 wallpaper A (blue / lilac / peach), positions as fractions of the body
const WALL_A = [
  [0.10, 0.12, 0.50, '#a9c1f2'], [0.14, 0.82, 0.46, '#d3bff0'], [0.52, 0.40, 0.42, '#c4d3f6'],
  [0.90, 0.14, 0.46, '#b9dced'], [0.88, 0.90, 0.50, '#f4c6b2'], [0.50, 1.02, 0.34, '#efcde3'],
];
// dark: same hues, deep and cool, so the glass reads as the native dark material (~#2c2b29) with colour behind it
const WALL_DARK = [
  [0.10, 0.12, 0.50, '#3a4f86'], [0.14, 0.82, 0.46, '#55437e'], [0.52, 0.40, 0.42, '#34416e'],
  [0.90, 0.14, 0.46, '#2d5a6c'], [0.88, 0.90, 0.50, '#6e4a52'], [0.50, 1.02, 0.34, '#5a3f66'],
];
const WALL_B = [
  [0.10, 0.12, 0.50, '#bfe3cd'], [0.14, 0.82, 0.46, '#b6d5ea'], [0.52, 0.40, 0.42, '#f0e1b6'],
  [0.90, 0.14, 0.46, '#cbe5be'], [0.88, 0.90, 0.50, '#f2cda6'], [0.50, 1.02, 0.34, '#c6e0e6'],
];

function glassBase(id, { wall = WALL_A, base = '#e3e5ee', tint = 0.22, dark = false } = {}) {
  // each blob fades to transparent at 72%, like the prototype's radial-gradient wallpaper
  const grads = wall.map(([, , , c], i) =>
    `<radialGradient id="${id}-w${i}"><stop offset="0" stop-color="${c}"/><stop offset=".72" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
  const blobs = wall.map(([x, y, r], i) =>
    `<circle cx="${100 + x * 824}" cy="${100 + y * 824}" r="${r * 824 * 1.5}" fill="url(#${id}-w${i})"/>`).join('');
  return {
    defs: grads + `
    <clipPath id="${id}-clip"><path d="${SQ}"/></clipPath>
    <filter id="${id}-blur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="40"/><feColorMatrix type="saturate" values="1.55"/>
    </filter>
    <filter id="${id}-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0"/>
    </filter>
    <filter id="${id}-drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="11" flood-color="#000" flood-opacity=".26"/>
    </filter>
    <linearGradient id="${id}-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .10 : .34}"/>
      <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .30 : .85}"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="${dark ? .06 : .25}"/>
      <stop offset="1" stop-color="#fff" stop-opacity="${dark ? .14 : .55}"/>
    </linearGradient>`,
    under: `<path d="${SQ}" fill="${base}" filter="url(#${id}-drop)"/>
    <g clip-path="url(#${id}-clip)">
      <rect x="0" y="0" width="1024" height="1024" fill="${base}"/>
      <g filter="url(#${id}-blur)">${blobs}</g>
      <rect x="0" y="0" width="1024" height="1024" fill="${dark ? '#1c1c1e' : '#f4f4f2'}" opacity="${tint}"/>
      <rect x="0" y="0" width="1024" height="1024" filter="url(#${id}-grain)"/>
      <rect x="0" y="0" width="1024" height="1024" fill="url(#${id}-sheen)"/>`,
    over: `</g>
    <path d="${SQ}" fill="none" stroke="url(#${id}-rim)" stroke-width="3" clip-path="url(#${id}-clip)"/>
    <path d="${SQ}" fill="none" stroke="#000" stroke-opacity="${dark ? .5 : .07}" stroke-width="1"/>`,
  };
}

// a frosted pane: translucent white, top-lit rim, soft shadow (same recipe as v04 panels)
function paneDefs(id, dark = false) {
  return `
    <linearGradient id="${id}-pane" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .20 : .80}"/>
      <stop offset="1" stop-color="#fff" stop-opacity="${dark ? .10 : .56}"/>
    </linearGradient>
    <linearGradient id="${id}-prim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .5 : 1}"/>
      <stop offset="1" stop-color="#fff" stop-opacity="${dark ? .08 : .35}"/>
    </linearGradient>
    <filter id="${id}-pshadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#2a2d4a" flood-opacity="${dark ? .45 : .14}"/>
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#2a2d4a" flood-opacity="${dark ? .3 : .06}"/>
    </filter>`;
}
function pane(id, d, extra = '') {
  return `<g filter="url(#${id}-pshadow)"><path d="${d}" fill="url(#${id}-pane)"/></g>
    <path d="${d}" fill="none" stroke="url(#${id}-prim)" stroke-width="3"/>${extra}`;
}
function rr(x, y, w, h, r) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
// four-point sparkle centred at (cx,cy), radius r
function sparkle(cx, cy, r, k = 0.2) {
  const q = r * k;
  return `M${cx} ${cy - r}C${cx + q * .4} ${cy - q} ${cx + q} ${cy - q * .4} ${cx + r} ${cy}C${cx + q} ${cy + q * .4} ${cx + q * .4} ${cy + q} ${cx} ${cy + r}C${cx - q * .4} ${cy + q} ${cx - q} ${cy + q * .4} ${cx - r} ${cy}C${cx - q} ${cy - q * .4} ${cx - q * .4} ${cy - q} ${cx} ${cy - r}Z`;
}

const INK = '#0d0d0d';

// A — Conversation bubble with a CLI prompt: talking to a CLI agent
function conceptA(opts = {}) {
  const id = 'a' + (opts.dark ? 'd' : '') + (opts.wall === WALL_B ? 'b' : '');
  const g = glassBase(id, opts);
  const ink = opts.dark ? '#f2f2f2' : INK;
  // bubble 576×432, r 120, tail at lower left
  const x = 224, y = 252, w = 576, h = 436, r = 128;
  const bubble = `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + 250}`
    + `C${x + 190} ${y + h} ${x + 140} ${y + h + 40} ${x + 92} ${y + h + 96}`
    + `C${x + 84} ${y + h + 106} ${x + 70} ${y + h + 100} ${x + 74} ${y + h + 86}`
    + `C${x + 84} ${y + h + 54} ${x + 86} ${y + h + 24} ${x + 72} ${y + h - 10}`
    + `C${x + 26} ${y + h - 36} ${x} ${y + h - 84} ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const glyph = `<path d="M398 392L486 470L398 548" fill="none" stroke="${ink}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="530" y="524" width="122" height="50" rx="25" fill="${ink}"/>`;
  return svg(g.defs + paneDefs(id, opts.dark), g.under + g.over + pane(id, bubble) + glyph);
}

// B — Project View in miniature: conversation left, Preview right
function conceptB(opts = {}) {
  const id = 'b' + (opts.dark ? 'd' : '');
  const g = glassBase(id, opts);
  const ink = opts.dark ? '#f2f2f2' : INK;
  const soft = opts.dark ? 'rgba(255,255,255,.22)' : 'rgba(13,13,13,.16)';
  const win = rr(196, 236, 632, 552, 96);
  const right = rr(536, 296, 236, 432, 52);
  const content = `
    <path d="${right}" fill="#fff" fill-opacity="${opts.dark ? .14 : .78}" stroke="#000" stroke-opacity="${opts.dark ? 0 : .05}" stroke-width="2"/>
    <path d="M300 420L366 478L300 536" fill="none" stroke="${ink}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="270" y="610" width="200" height="34" rx="17" fill="${soft}"/>
    <rect x="270" y="666" width="140" height="34" rx="17" fill="${soft}"/>
    <rect x="574" y="336" width="72" height="72" rx="20" fill="${ink}"/>
    <rect x="662" y="336" width="72" height="72" rx="20" fill="${soft}"/>
    <rect x="574" y="424" width="72" height="72" rx="20" fill="${soft}"/>
    <rect x="662" y="424" width="72" height="72" rx="20" fill="${soft}"/>
    <rect x="574" y="544" width="160" height="26" rx="13" fill="${soft}"/>
    <rect x="574" y="544" width="100" height="26" rx="13" fill="${ink}"/>
    <rect x="574" y="602" width="120" height="26" rx="13" fill="${soft}"/>
    <rect x="574" y="652" width="150" height="26" rx="13" fill="${soft}"/>`;
  return svg(g.defs + paneDefs(id, opts.dark), g.under + g.over + pane(id, win) + content);
}

// C — Stacked glass panes (projects / layers) with prompt + sparkle cursor
function conceptC(opts = {}) {
  const id = 'c' + (opts.dark ? 'd' : '');
  const g = glassBase(id, opts);
  const ink = opts.dark ? '#f2f2f2' : INK;
  const back = rr(312, 212, 440, 440, 108), mid = rr(272, 272, 460, 460, 112), front = rr(232, 332, 480, 480, 116);
  const glyph = `<path d="M352 494L450 572L352 650" fill="none" stroke="${ink}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${sparkle(568, 624, 82, 0.22)}" fill="${ink}"/>`;
  return svg(g.defs + paneDefs(id, opts.dark),
    g.under + g.over
    + `<g opacity=".55">${pane(id, back)}</g><g opacity=".8">${pane(id, mid)}</g>` + pane(id, front) + glyph);
}

function svg(defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>${defs}</defs>${body}</svg>`;
}

const variants = {
  'app-icon-bubble-v01': conceptA(), 'app-icon-bubble-v01-dark': conceptA({ dark: true, wall: WALL_DARK, base: '#24252b', tint: .30 }),
  'app-icon-bubble-v01-wall-b': conceptA({ wall: WALL_B, base: '#e6e9e4' }),
  'app-icon-window-v01': conceptB(), 'app-icon-window-v01-dark': conceptB({ dark: true, wall: WALL_DARK, base: '#24252b', tint: .30 }),
  'app-icon-layers-v01': conceptC(), 'app-icon-layers-v01-dark': conceptC({ dark: true, wall: WALL_DARK, base: '#24252b', tint: .30 }),
};
for (const [k, v] of Object.entries(variants)) fs.writeFileSync(path.join(out, k + '.svg'), v);
console.log(Object.keys(variants).join('\n'));
