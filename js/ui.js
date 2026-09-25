// ui.js — petits outils d'affichage partagés par tous les écrans.
// Règle de sécurité : on n'écrit JAMAIS de HTML, seulement du texte.

import * as L from './ledger.js';
import { t, getLang } from './i18n.js';

// ---------- Petits outils d'affichage ----------

// Crée un élément avec du texte seulement (jamais de HTML).
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const money = (n) => `${L.formatAmount(n)} FCFA`;

export function fmtDay(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
}

export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const poolName = (id) => t('pool' + id);
export const moodOf = (id) => L.MOODS.find((m) => m.id === id);
export const accountName = (data, id) => (data.accounts.find((a) => a.id === id) || {}).name || '?';

// Pastille du compte : son image, sinon sa première lettre sur une couleur.
export function avatar(name, category, icon, cls = '') {
  if (icon && L.isIcon(icon)) {
    const img = el('img', 'avatar ' + cls);
    img.alt = '';
    img.src = icon;
    return img;
  }
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const span = el('span', `avatar letter cat-${category} ${cls}`, letter);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

// Réduit une photo à 96 × 96 et la ré-encode (retire aussi ses infos cachées).
export async function imageToIcon(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif|heic|heif|avif)$/.test(file.type) || file.size > 15 * 1024 * 1024) throw new Error('image');
  // Décodage directement en petit (évite de charger une photo géante en mémoire).
  const bmp = await createImageBitmap(file, { resizeWidth: 256, resizeQuality: 'medium' });
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const side = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  let url = canvas.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
  if (!L.isIcon(url)) throw new Error('image');
  return url;
}


// Jour "AAAA-MM-JJ" -> "12 oct. 2026".
export function fmtYmd(ymd, withYear = true) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'fr-FR',
    withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

// Boutons-pastilles (un seul choisi).
export function renderChips(box, items, current, onPick) {
  box.replaceChildren();
  for (const it of items) {
    const c = el('button', 'chip' + (it.id === current ? ' active' : ''), it.label);
    c.type = 'button';
    c.setAttribute('aria-pressed', String(it.id === current));
    c.onclick = () => onPick(it.id);
    box.append(c);
  }
}

// Petit graphique en ligne (SVG), sans bibliothèque externe.
export function sparkline(points, width = 300, height = 60) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('aria-hidden', 'true');
  if (points.length < 2) return svg;
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.value);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const px = (x) => (x1 === x0 ? width / 2 : ((x - x0) / (x1 - x0)) * (width - 8) + 4);
  const py = (y) => (y1 === y0 ? height / 2 : height - 4 - ((y - y0) / (y1 - y0)) * (height - 8));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(xs[i]).toFixed(1)} ${py(ys[i]).toFixed(1)}`).join(' ');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  const last = document.createElementNS(NS, 'circle');
  last.setAttribute('cx', px(xs[xs.length - 1]).toFixed(1));
  last.setAttribute('cy', py(ys[ys.length - 1]).toFixed(1));
  last.setAttribute('r', '3');
  svg.append(last);
  return svg;
}

// Montant tapé : espaces ajoutés tout seuls pendant la frappe ("1250000" -> "1 250 000").
// decimals: true accepte aussi une virgule et 2 chiffres après (pour € et £).
// Le curseur reste après le même chiffre, même quand des espaces sont ajoutés.
// Règle : on ne supprime JAMAIS un caractère en silence. Dès que le texte n'est
// pas un nombre simple (lettre, signe moins, point en FCFA, plus de 12 chiffres,
// plusieurs virgules, plus de 2 décimales…), il est laissé tel quel et la
// vérification à l'enregistrement le refuse avec un message.
export function groupDigits(raw, decimals = false) {
  const text = String(raw);
  const s = text.replace(/\s/g, '');
  const m = decimals ? s.match(/^(\d{0,12})(?:[.,](\d{0,2}))?$/) : s.match(/^(\d{0,12})$/);
  if (!m) return text;
  const int = m[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return m[2] === undefined ? int : `${int || '0'},${m[2]}`;
}

export function liveAmount(input, opts = {}) {
  const decimals = () => (typeof opts.decimals === 'function' ? opts.decimals() : Boolean(opts.decimals));
  input.addEventListener('input', () => {
    const before = input.value;
    const caret = input.selectionStart ?? before.length;
    const keep = before.slice(0, caret).replace(/[^\d.,]/g, '').length; // chiffres (et virgule) avant le curseur
    const after = groupDigits(before, decimals());
    if (after === before) return;
    input.value = after;
    let pos = 0;
    let seen = 0;
    while (pos < after.length && seen < keep) { if (/[\d,]/.test(after[pos])) seen += 1; pos += 1; }
    try { input.setSelectionRange(pos, pos); } catch { /* champ sans curseur */ }
  });
}
