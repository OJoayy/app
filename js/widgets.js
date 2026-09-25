// widgets.js — petits éléments d'interface réutilisables :
// l'œil dans les champs secrets et les cases rondes du code PIN.
// Tout est construit avec du DOM (jamais de HTML en texte).

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(paths) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}

const EYE_OPEN = ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z'];
const EYE_SHUT = ['M3 3l18 18', 'M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.4-1.1',
  'M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2'];

// Dessine l'icône œil (ouvert = on voit, barré = caché).
export function eyeIcon(open) {
  return svg(open ? EYE_OPEN : EYE_SHUT);
}

let labels = { show: 'Show', hide: 'Hide' };
export function setEyeLabels(show, hide) { labels = { show, hide }; }

// Ajoute un bouton œil DANS chaque champ mot de passe (sauf les cases PIN).
export function enhanceSecrets(root = document) {
  for (const input of root.querySelectorAll('input[type="password"]:not(.pin-hidden)')) {
    if (input.parentElement.classList.contains('secret')) continue;
    const wrap = document.createElement('span');
    wrap.className = 'secret';
    input.replaceWith(wrap);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eye';
    btn.dataset.target = input.id;
    wrap.append(input, btn);
    setEye(btn, false);
    btn.onclick = () => setEye(btn, input.type === 'password');
    // Garde le clavier ouvert : l'appui sur l'œil ne retire pas le focus du champ.
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
  }
}

function setEye(btn, visible) {
  const input = document.getElementById(btn.dataset.target);
  input.type = visible ? 'text' : 'password';
  btn.replaceChildren(eyeIcon(!visible));
  btn.setAttribute('aria-label', visible ? labels.hide : labels.show);
  btn.setAttribute('aria-pressed', String(visible));
}

// Recache tous les secrets (au verrouillage, après un enregistrement…).
export function hideAllSecrets(root = document) {
  for (const btn of root.querySelectorAll('.secret .eye')) setEye(btn, false);
  for (const box of root.querySelectorAll('.pin-slots')) {
    box.classList.remove('reveal');
    renderPinSlots(box.dataset.for);
  }
}

// ---------- Cases du code PIN ----------
// Un vrai champ (invisible, posé sur les cases) reçoit le clavier numérique ;
// les cases rondes montrent un point par chiffre tapé.

const pinBoxes = new Map(); // id du champ -> { length, onComplete }

export function setupPinSlots(inputId, length, onComplete) {
  const input = document.getElementById(inputId);
  pinBoxes.set(inputId, { length, onComplete });
  input.maxLength = length;
  if (!input.dataset.pinReady) {
    input.dataset.pinReady = '1';
    input.addEventListener('input', () => {
      const clean = input.value.replace(/\D/g, '').slice(0, pinBoxes.get(inputId).length);
      if (clean !== input.value) input.value = clean;
      renderPinSlots(inputId);
      const cfg = pinBoxes.get(inputId);
      if (cfg.onComplete && clean.length === cfg.length) cfg.onComplete();
    });
    input.addEventListener('focus', () => renderPinSlots(inputId));
    input.addEventListener('blur', () => renderPinSlots(inputId));
  }
  renderPinSlots(inputId);
}

export function renderPinSlots(inputId) {
  const input = document.getElementById(inputId);
  const box = document.querySelector(`.pin-slots[data-for="${inputId}"]`);
  const cfg = pinBoxes.get(inputId);
  if (!box || !cfg) return;
  const reveal = box.classList.contains('reveal');
  box.classList.toggle('many', cfg.length > 8);
  const slots = [];
  for (let i = 0; i < cfg.length; i++) {
    const s = document.createElement('span');
    const filled = i < input.value.length;
    s.className = 'slot' + (filled ? ' filled' : '') +
      (document.activeElement === input && i === Math.min(input.value.length, cfg.length - 1) ? ' current' : '');
    if (filled && reveal) s.textContent = input.value[i];
    slots.push(s);
  }
  box.replaceChildren(...slots);
}

export function revealPin(inputIds, on) {
  for (const id of inputIds) {
    const box = document.querySelector(`.pin-slots[data-for="${id}"]`);
    if (box) box.classList.toggle('reveal', on);
    renderPinSlots(id);
  }
}
