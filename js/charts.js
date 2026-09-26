// charts.js — petits graphiques du tableau de bord, dessinés à la main en SVG/HTML.
// Aucune bibliothèque extérieure. Règle de sécurité : jamais de HTML, que du texte.
// Style : traits fins, barres ≤ 24 px arrondies en haut, grille discrète,
// légende dès 2 séries, info-bulle au survol, et un tableau pour chaque graphique.

const NS = 'http://www.w3.org/2000/svg';

export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

function s(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

// 1 250 000 -> "1,25 M" ; 85 000 -> "85 k" (axes seulement).
export function compact(n, lang = 'fr') {
  const a = Math.abs(n);
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const f = (x, unit) => `${n < 0 ? '−' : ''}${x.toLocaleString(loc, { maximumFractionDigits: x < 10 ? 2 : x < 100 ? 1 : 0 })}${unit}`;
  if (a >= 1e9) return f(a / 1e9, ' Md');
  if (a >= 1e6) return f(a / 1e6, ' M');
  if (a >= 1e3) return f(a / 1e3, ' k');
  return f(a, '');
}

// Graduations "rondes" couvrant [min, max].
export function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

// ---------- Info-bulle (une par carte) ----------

function tipFor(host) {
  let tip = host.querySelector(':scope > .viz-tip');
  if (!tip) { tip = h('div', 'viz-tip'); tip.setAttribute('role', 'status'); tip.hidden = true; host.append(tip); }
  return tip;
}

// rows: [{ value, label, slot? }] — la valeur d'abord, le nom ensuite.
function showTip(host, x, y, title, rows) {
  const tip = tipFor(host);
  tip.replaceChildren(h('div', 'viz-tip-title', title));
  for (const r of rows) {
    const line = h('div', 'viz-tip-row');
    if (r.slot) { const k = h('span', `viz-key ${r.slot}`); k.setAttribute('aria-hidden', 'true'); line.append(k); }
    line.append(h('strong', null, r.value), h('span', 'viz-tip-label', r.label));
    tip.append(line);
  }
  tip.hidden = false;
  const hw = host.clientWidth;
  const tw = tip.offsetWidth;
  tip.style.left = `${Math.max(4, Math.min(hw - tw - 4, x - tw / 2))}px`;
  tip.style.top = `${Math.max(4, y - tip.offsetHeight - 10)}px`;
}

function hideTip(host) { const t = host.querySelector(':scope > .viz-tip'); if (t) t.hidden = true; }

export function legend(items) {
  const box = h('div', 'viz-legend');
  for (const it of items) {
    const li = h('span', 'viz-legend-item');
    const k = h('span', `viz-swatch ${it.slot}${it.line ? ' line' : ''}`);
    k.setAttribute('aria-hidden', 'true');
    li.append(k, h('span', null, it.label));
    box.append(li);
  }
  return box;
}

// ---------- Colonnes groupées (ex. revenus et dépenses par mois) ----------
// opts: { labels, series: [{ name, slot, values }], fmt, fmtAxis, host }

export function columns(box, opts) {
  box.replaceChildren();
  const W = Math.max(280, box.clientWidth);
  const H = 240;
  const m = { t: 12, r: 8, b: 26, l: 52 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const max = Math.max(1, ...opts.series.flatMap((x) => x.values));
  const ticks = niceTicks(0, max);
  const top = ticks[ticks.length - 1];
  const y = (v) => m.t + ph - (v / top) * ph;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img' });
  svg.setAttribute('aria-label', opts.ariaLabel || '');
  for (const tv of ticks) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: tv === 0 ? 'viz-base' : 'viz-grid' }));
    const tx = s('text', { x: m.l - 8, y: y(tv) + 4, 'text-anchor': 'end', class: 'viz-tick' });
    tx.textContent = opts.fmtAxis(tv);
    svg.append(tx);
  }
  const n = opts.labels.length;
  const band = pw / n;
  const k = opts.series.length;
  const bw = Math.max(3, Math.min(24, (band * 0.7 - (k - 1) * 2) / k));
  const group = k * bw + (k - 1) * 2;
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(pw / 46)));
  const host = opts.host;
  opts.labels.forEach((lab, i) => {
    const x0 = m.l + band * i + (band - group) / 2;
    const hl = s('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, class: 'viz-band' });
    svg.append(hl);
    opts.series.forEach((ser, j) => {
      const v = ser.values[i];
      if (v <= 0) return;
      const bx = x0 + j * (bw + 2);
      const by = y(v);
      const hgt = y(0) - by;
      const r = Math.min(4, bw / 2, hgt);
      svg.append(s('path', {
        d: `M${bx},${y(0)}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${y(0)}Z`,
        class: `viz-mark ${ser.slot}`,
      }));
    });
    if (i % labelEvery === 0 || i === n - 1) {
      const tx = s('text', { x: m.l + band * i + band / 2, y: H - 8, 'text-anchor': 'middle', class: 'viz-tick' });
      tx.textContent = lab;
      svg.append(tx);
    }
    // Zone de survol = toute la colonne du mois (bien plus large que les barres).
    const hit = s('rect', { x: m.l + band * i, y: m.t, width: band, height: ph + m.b, class: 'viz-hit', tabindex: 0 });
    const show = () => {
      hl.classList.add('on');
      const bb = hit.getBoundingClientRect();
      const hb = host.getBoundingClientRect();
      showTip(host, bb.left - hb.left + bb.width / 2, bb.top - hb.top + 10, opts.fullLabels ? opts.fullLabels[i] : lab,
        opts.series.map((ser) => ({ value: opts.fmt(ser.values[i]), label: ser.name, slot: ser.slot })));
    };
    const hide = () => { hl.classList.remove('on'); hideTip(host); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    svg.append(hit);
  });
  box.append(svg);
}

// ---------- Courbe (ex. argent disponible dans le temps) ----------
// opts: { points: [{ t (ms), value, label }], slot, fmt, fmtAxis, host }

export function line(box, opts) {
  box.replaceChildren();
  const pts = opts.points;
  const W = Math.max(280, box.clientWidth);
  const H = 240;
  const m = { t: 14, r: 12, b: 26, l: 56 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const vals = pts.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(1, ...vals));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t === t0 ? t0 + 1 : pts[pts.length - 1].t;
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * pw;
  const y = (v) => m.t + ph - ((v - lo) / (hi - lo)) * ph;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img' });
  svg.setAttribute('aria-label', opts.ariaLabel || '');
  for (const tv of ticks) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: tv === 0 ? 'viz-base' : 'viz-grid' }));
    const tx = s('text', { x: m.l - 8, y: y(tv) + 4, 'text-anchor': 'end', class: 'viz-tick' });
    tx.textContent = opts.fmtAxis(tv);
    svg.append(tx);
  }
  // Dates en bas : début et fin, plus le milieu du temps s'il y a la place.
  const marks = [[t0, 'start'], [t1, 'end']];
  if (pw > 360) marks.push([(t0 + t1) / 2, 'middle']);
  for (const [tm, anchor] of marks) {
    const tx = s('text', { x: x(tm), y: H - 8, 'text-anchor': anchor, class: 'viz-tick' });
    tx.textContent = opts.dateLabel(tm);
    svg.append(tx);
  }
  // Marches : le solde reste le même jusqu'au mouvement suivant.
  let d = `M${x(pts[0].t)},${y(pts[0].value)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i].t)}V${y(pts[i].value)}`;
  const base = y(Math.max(lo, Math.min(0, hi)));
  svg.append(s('path', { d: `${d}V${base}H${x(pts[0].t)}Z`, class: `viz-area ${opts.slot}` }));
  svg.append(s('path', { d, class: `viz-line ${opts.slot}` }));
  const last = pts[pts.length - 1];
  svg.append(s('circle', { cx: x(last.t), cy: y(last.value), r: 4, class: `viz-dot ${opts.slot}` }));
  // Survol : un trait vertical suit la souris et s'accroche au jour le plus proche.
  const cross = s('line', { y1: m.t, y2: m.t + ph, class: 'viz-cross' });
  const dot = s('circle', { r: 4, class: `viz-dot ${opts.slot}` });
  cross.style.display = 'none';
  dot.style.display = 'none';
  svg.append(cross, dot);
  const hit = s('rect', { x: m.l, y: m.t, width: pw, height: ph, class: 'viz-hit', tabindex: 0 });
  const host = opts.host;
  const at = (i) => {
    const p = pts[i];
    cross.setAttribute('x1', x(p.t)); cross.setAttribute('x2', x(p.t));
    dot.setAttribute('cx', x(p.t)); dot.setAttribute('cy', y(p.value));
    cross.style.display = ''; dot.style.display = '';
    const sb = svg.getBoundingClientRect();
    const hb = host.getBoundingClientRect();
    showTip(host, sb.left - hb.left + x(p.t), sb.top - hb.top + y(p.value), p.label, [{ value: opts.fmt(p.value), label: opts.name, slot: opts.slot }]);
  };
  let focusIdx = pts.length - 1;
  hit.addEventListener('pointermove', (e) => {
    const sb = svg.getBoundingClientRect();
    const tx = t0 + ((e.clientX - sb.left - m.l) / pw) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - tx) < Math.abs(pts[best].t - tx)) best = i;
    focusIdx = best;
    at(best);
  });
  const off = () => { cross.style.display = 'none'; dot.style.display = 'none'; hideTip(host); };
  hit.addEventListener('pointerleave', off);
  hit.addEventListener('focus', () => at(focusIdx));
  hit.addEventListener('blur', off);
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { focusIdx = Math.max(0, focusIdx - 1); at(focusIdx); }
    if (e.key === 'ArrowRight') { focusIdx = Math.min(pts.length - 1, focusIdx + 1); at(focusIdx); }
  });
  svg.append(hit);
  box.append(svg);
}

// ---------- Barres horizontales (HTML) ----------
// rows: [{ label, value, note? }] ; valeur au bout de la barre.
// opts.diverging : valeurs négatives en rouge, vers la gauche.

export function hbars(box, rows, opts) {
  box.replaceChildren();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const neg = opts.diverging && rows.some((r) => r.value < 0);
  const list = h('div', 'hbars' + (neg ? ' diverging' : ''));
  for (const r of rows) {
    const row = h('div', 'hbar-row');
    row.tabIndex = 0;
    const lab = h('span', 'hbar-label', r.label);
    const track = h('span', 'hbar-track');
    const bar = h('span', `hbar ${r.value < 0 ? 'series-neg' : opts.slot || 'series-1'}`);
    const pct = (Math.abs(r.value) / max) * (neg ? 50 : 100);
    bar.style.width = `${pct}%`;
    if (neg) { if (r.value < 0) bar.style.right = '50%'; else bar.style.left = '50%'; }
    track.append(bar);
    const val = h('span', 'hbar-value', opts.fmt(r.value));
    row.append(lab, track, val);
    if (r.note) row.title = r.note;
    list.append(row);
  }
  box.append(list);
}

// ---------- Barre empilée (part d'un tout) ----------
// parts: [{ label, value, slot }] ; une légende avec les valeurs en dessous.

export function stack(box, parts, fmt) {
  box.replaceChildren();
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const bar = h('div', 'stack');
  for (const p of parts) {
    if (p.value <= 0) continue;
    const seg = h('span', `stack-seg ${p.slot}`);
    seg.style.flexGrow = String(p.value);
    seg.title = `${p.label} : ${fmt(p.value)}`;
    bar.append(seg);
  }
  if (!total) bar.append(h('span', 'stack-empty'));
  const leg = h('div', 'viz-legend values');
  for (const p of parts) {
    const li = h('span', 'viz-legend-item');
    const k = h('span', `viz-swatch ${p.slot}`);
    k.setAttribute('aria-hidden', 'true');
    const share = total ? Math.round((Math.max(0, p.value) / total) * 100) : 0;
    li.append(k, h('span', null, p.label), h('strong', null, `${fmt(p.value)} · ${share} %`));
    leg.append(li);
  }
  box.append(bar, leg);
}

// ---------- Jauge (ex. part d'une dette déjà remboursée) ----------

export function meter(ratio, label) {
  const m = h('span', 'meter');
  m.setAttribute('role', 'meter');
  m.setAttribute('aria-valuemin', '0');
  m.setAttribute('aria-valuemax', '100');
  m.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  if (label) m.setAttribute('aria-label', label);
  const f = h('span', 'meter-fill');
  f.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  m.append(f);
  return m;
}

// ---------- Tableau (la version "texte" de chaque graphique) ----------

export function table(headers, rows, numericCols = []) {
  const tb = h('table', 'viz-table');
  const tr = h('tr');
  headers.forEach((x, i) => { const th = h('th', numericCols.includes(i) ? 'num' : null, x); th.scope = 'col'; tr.append(th); });
  const thead = h('thead');
  thead.append(tr);
  const body = h('tbody');
  for (const r of rows) {
    const row = h('tr');
    r.forEach((c, i) => {
      if (c instanceof Node) { const td = h('td', numericCols.includes(i) ? 'num' : null); td.append(c); row.append(td); } else row.append(h('td', numericCols.includes(i) ? 'num' : null, c));
    });
    body.append(row);
  }
  tb.append(thead, body);
  const wrap = h('div', 'table-wrap'); // défile de côté sur petit écran, sans casser la page
  wrap.append(tb);
  return wrap;
}
