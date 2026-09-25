// wishes.js — « Mes envies » : ce que j'aimerais acheter ou faire un jour.
// Écran caché : on l'ouvre en appuyant longtemps sur le nom SIKA du Dashboard
// (ou depuis les Réglages). Pas d'argent déplacé : c'est une simple liste.
// Règle de sécurité : on n'écrit JAMAIS de HTML, seulement du texte.

import * as L from './ledger.js';
import * as FX from './fx.js';
import { t } from './i18n.js';
import { el, money, fmtDay, renderChips, liveAmount } from './ui.js';

const $ = (id) => document.getElementById(id);

let ctx = null;
let editing = null;
let currency = 'XOF';
let showDone = false;
let formSnapshot = '';
let origin = 's-home'; // écran d'où l'on vient (Dashboard ou Réglages)

const SYMBOL = { XOF: 'FCFA', EUR: '€', GBP: '£' };

// Montant dans sa devise : "250 000 FCFA", "1 200 €", "900 £".
function inCurrency(amount, cur) {
  return `${L.formatAmount(amount)} ${SYMBOL[cur]}`;
}

// Équivalent en FCFA (le £ a besoin du taux du jour ; sinon null).
export function toXof(amount, cur, fx) {
  if (cur === 'XOF') return amount;
  if (cur === 'EUR') return Math.round(amount * FX.XOF_PER_EUR);
  const f = FX.cleanFx(fx);
  return f ? Math.round((amount / f.rate) * FX.XOF_PER_EUR) : null;
}

// ---------- Liste ----------

export function renderWishes() {
  const data = ctx.data();
  const open = data.wishes.filter((w) => !w.done);
  const done = data.wishes.filter((w) => w.done).sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1));
  let total = 0;
  let unknown = 0;
  for (const w of open) {
    if (w.amount === null) continue;
    const x = toXof(w.amount, w.currency, data.fx);
    if (x === null) unknown += 1; else total += x;
  }
  $('wishes-total').textContent = money(total);
  $('wishes-count').textContent = t(unknown ? 'wishesCountFx' : 'wishesCount', { n: open.length, d: done.length });
  const list = $('wishes-list');
  list.replaceChildren();
  if (!open.length) list.append(el('p', 'muted', t('noWishes')));
  for (const w of open) list.append(wishRow(w, data));
  $('wishes-done-wrap').hidden = done.length === 0;
  $('btn-wishes-done').textContent = t(showDone ? 'hideDone' : 'showDone', { n: done.length });
  $('wishes-done').hidden = !showDone;
  $('wishes-done').replaceChildren(...(showDone ? done.map((w) => wishRow(w, data)) : []));
}

function wishRow(w, data) {
  const row = el('div', 'wish-row' + (w.done ? ' done' : ''));
  const tick = el('button', 'wish-tick', w.done ? '✓' : '');
  tick.type = 'button';
  tick.setAttribute('aria-pressed', String(w.done));
  tick.setAttribute('aria-label', t(w.done ? 'wishUndo' : 'wishDo', { name: w.name }));
  tick.onclick = () => toggleDone(w.id);
  const body = el('button', 'wish-body');
  body.type = 'button';
  body.append(el('span', 'tx-title', w.name));
  if (w.note) body.append(el('span', 'wish-note', w.note));
  if (w.done && w.doneAt) body.append(el('span', 'tx-meta', t('wishDoneOn', { date: fmtDay(w.doneAt) })));
  body.onclick = () => openWishForm(w);
  const price = el('span', 'wish-price');
  if (w.amount !== null) {
    price.append(el('span', 'amt', inCurrency(w.amount, w.currency)));
    if (w.currency !== 'XOF') {
      const x = toXof(w.amount, w.currency, data.fx);
      if (x !== null) price.append(el('span', 'tx-meta', '≈ ' + money(x)));
    }
  } else price.append(el('span', 'tx-meta', t('noPrice')));
  row.append(tick, body, price);
  return row;
}

async function toggleDone(id) {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const w = data.wishes.find((x) => x.id === id);
  if (!w) return;
  const before = { done: w.done, doneAt: w.doneAt };
  w.done = !w.done;
  w.doneAt = w.done ? new Date().toISOString() : null;
  renderWishes();
  if (!(await ctx.save())) { Object.assign(w, before); if (ctx.data() === data) renderWishes(); }
}

export function openWishes(from) {
  if (from) { origin = from; showDone = false; }
  renderWishes();
  ctx.show('s-wishes');
}

// ---------- Formulaire ----------

function renderCurrency() {
  renderChips($('wish-currencies'), [{ id: 'XOF', label: 'FCFA' }, { id: 'EUR', label: '€' }, { id: 'GBP', label: '£' }], currency,
    (id) => { currency = id; renderCurrency(); });
}

function snapshot() {
  return JSON.stringify([$('wish-name').value, $('wish-note').value, $('wish-amount').value, currency]);
}

export function openWishForm(w = null) {
  editing = w;
  $('wish-form-title').textContent = t(w ? 'editWish' : 'addWish');
  $('wish-name').value = w ? w.name : '';
  $('wish-note').value = w ? w.note : '';
  $('wish-amount').value = w && w.amount !== null ? L.formatAmount(w.amount) : '';
  currency = w ? w.currency : 'XOF';
  $('wish-err').textContent = '';
  $('btn-wish-delete').hidden = !w;
  renderCurrency();
  ctx.show('s-wish-form');
  formSnapshot = snapshot();
  if (!w) $('wish-name').focus();
}

async function onSave() {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const err = (k) => { $('wish-err').textContent = t(k); };
  const name = $('wish-name').value.trim();
  if (!name) return err('errWishName');
  const raw = $('wish-amount').value.trim();
  const amount = raw === '' ? null : L.parseAmount(raw);
  if (raw !== '' && amount === null) return err('errAmount');
  if (amount !== null && currency !== 'XOF' && amount > L.MAX_AMOUNT / 1000) return err('errAmount');
  if (!editing && data.wishes.length >= L.LIMITS.wishes) return err('errTooManyWishes');
  let clean;
  try {
    clean = L.cleanWish({
      id: editing ? editing.id : L.newId(), name, note: $('wish-note').value, amount, currency,
      done: editing ? editing.done : false, doneAt: editing ? editing.doneAt : null,
      createdAt: editing ? editing.createdAt : new Date().toISOString(),
    });
  } catch { return err('errGeneric'); }
  const before = data.wishes.slice();
  const i = data.wishes.findIndex((x) => x.id === clean.id);
  if (i >= 0) data.wishes[i] = clean; else data.wishes.push(clean);
  if (!(await ctx.save())) { data.wishes = before; return err('errGeneric'); }
  if (!ctx.data()) return;
  editing = null;
  openWishes();
}

async function onDelete() {
  if (!editing || ctx.isBusy()) return;
  const data = ctx.data();
  const target = editing;
  if (!(await ctx.ask(t('deleteWishConfirm', { name: target.name })))) return;
  if (ctx.data() !== data) return;
  const before = data.wishes.slice();
  data.wishes = data.wishes.filter((x) => x.id !== target.id);
  if (!(await ctx.save())) { data.wishes = before; $('wish-err').textContent = t('errGeneric'); return; }
  if (!ctx.data()) return;
  editing = null;
  openWishes();
}

// Bouton retour : depuis la liste -> Dashboard ; depuis le formulaire -> la liste
// (en demandant avant de perdre une saisie). Renvoie true si l'écran est quitté.
export async function back(id) {
  if (id === 's-wishes') { ctx.openTab(origin); return true; }
  if (snapshot() !== formSnapshot) {
    const data = ctx.data();
    if (!(await ctx.ask(t('discardConfirm')))) return false;
    if (ctx.data() !== data) return true;
  }
  editing = null;
  openWishes();
  return true;
}

export function clearWishes() {
  for (const id of ['wishes-total', 'wishes-count', 'btn-wishes-done', 'wish-err']) $(id).textContent = '';
  for (const id of ['wishes-list', 'wishes-done']) $(id).replaceChildren();
  for (const id of ['wish-name', 'wish-note', 'wish-amount']) $(id).value = '';
  $('wishes-done-wrap').hidden = true;
  editing = null;
  showDone = false;
  formSnapshot = '';
  currency = 'XOF';
  origin = 's-home';
}

export function initWishes(context) {
  ctx = context;
  $('btn-add-wish').onclick = () => openWishForm();
  $('btn-wishes-back').onclick = () => ctx.openTab(origin);
  $('btn-wishes-done').onclick = () => { showDone = !showDone; renderWishes(); };
  $('btn-wish-save').onclick = onSave;
  $('btn-wish-delete').onclick = onDelete;
  $('btn-wish-cancel').onclick = () => { editing = null; openWishes(); };
  liveAmount($('wish-amount'));
}
