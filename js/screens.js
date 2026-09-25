// screens.js — les écrans de l'étape 2 : accueil, comptes et pools,
// historique, formulaires (revenu, dépense, transfert, compte).
// Règle de sécurité : on n'écrit JAMAIS de HTML, seulement du texte.

import * as L from './ledger.js';
import { t, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

// ctx vient de app.js : { data(), save(), show(), ask(), busy(), isBusy() }
let ctx = null;
let returnTo = 's-home';
let editing = null;       // opération en cours de modification (ou null)
let txType = 'expense';
let txMood = null;
let txSource = 'client';
let accEditing = null;    // compte en cours de modification (ou null)
let accCategory = 'mobile';
let histFilter = 'all';
let histLimit = 200; // l'historique s'affiche par paquets de 200

// ---------- Petits outils d'affichage ----------

// Crée un élément avec du texte seulement (jamais de HTML).
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const money = (n) => `${L.formatAmount(n)} FCFA`;

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
}

function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const poolName = (id) => t('pool' + id);
const moodOf = (id) => L.MOODS.find((m) => m.id === id);
const accountName = (data, id) => (data.accounts.find((a) => a.id === id) || {}).name || '?';

// ---------- Lignes d'opérations ----------

function txRow(data, tx) {
  const row = el('button', 'tx-row');
  row.type = 'button';
  let icon = '⇄';
  let title = tx.desc || t('noDesc');
  let meta = '';
  let amount = money(tx.amount);
  let amountCls = 'amt';
  if (tx.type === 'expense') {
    icon = moodOf(tx.mood).emoji;
    meta = `${accountName(data, tx.from)} · ${poolName(tx.pool)} · ${fmtDay(tx.date)}`;
    amount = '−' + amount;
  } else if (tx.type === 'income') {
    icon = '＋';
    title = tx.desc || t('source_' + tx.source);
    meta = `${accountName(data, tx.to)} · ${fmtDay(tx.date)}`;
    amount = '+' + amount;
    amountCls = 'amt in';
  } else {
    title = tx.desc || t('transferLabel');
    meta = `${accountName(data, tx.from)} → ${accountName(data, tx.to)} · ${fmtDay(tx.date)}`;
  }
  const left = el('span', 'tx-icon', icon);
  left.setAttribute('aria-hidden', 'true');
  const mid = el('span', 'tx-mid');
  mid.append(el('span', 'tx-title', title), el('span', 'tx-meta', meta));
  if (tx.reason) mid.append(el('span', 'tx-meta nogo-note', '⚠ ' + tx.reason));
  row.append(left, mid, el('span', amountCls, amount));
  row.onclick = () => openTxForm(tx.type, tx);
  return row;
}

function fillList(box, data, list, emptyKey) {
  box.replaceChildren();
  if (!list.length) { box.append(el('p', 'muted', t(emptyKey))); return; }
  for (const tx of list) box.append(txRow(data, tx));
}

// ---------- Accueil ----------

export function renderHome() {
  const data = ctx.data();
  const b = L.computeBalances(data);
  $('home-total').textContent = money(b.liquid);
  $('home-pools-note').textContent = t('poolsTotalNote', { x: money(b.poolTotal) });
  const noAccount = data.accounts.filter((a) => !a.archived).length === 0;
  $('home-empty').hidden = !noAccount;
  $('home-actions').hidden = noAccount;
  $('btn-new-transfer').hidden = data.accounts.filter((a) => !a.archived).length < 2;
  fillList($('home-expenses'), data, L.sortedTx(data, (x) => x.type === 'expense').slice(0, 5), 'emptyExpenses');
  fillList($('home-incomes'), data, L.sortedTx(data, (x) => x.type === 'income').slice(0, 5), 'emptyIncomes');
  ctx.renderHomeExtras();
}

// ---------- Comptes et pools ----------

export function renderAccounts() {
  const data = ctx.data();
  const b = L.computeBalances(data);
  $('acc-total').textContent = money(b.liquid);

  const grid = $('pool-grid');
  grid.replaceChildren();
  for (const p of L.POOLS) {
    const card = el('div', 'pool-card' + (b.pools[p.id] < 0 ? ' neg' : ''));
    card.append(el('span', 'pool-name', `${poolName(p.id)} · ${p.pct} %`), el('span', 'pool-amt', money(b.pools[p.id])));
    grid.append(card);
  }

  const groups = $('acc-groups');
  groups.replaceChildren();
  const active = data.accounts.filter((a) => !a.archived);
  if (!active.length) groups.append(el('p', 'muted', t('emptyText')));
  for (const cat of L.CATEGORIES) {
    const list = active.filter((a) => a.category === cat);
    if (!list.length) continue;
    const card = el('div', 'card');
    card.append(el('h2', null, t('cat_' + cat)));
    for (const a of list) card.append(accountRow(a, b.accounts.get(a.id)));
    groups.append(card);
  }
  const archived = data.accounts.filter((a) => a.archived);
  if (archived.length) {
    const card = el('div', 'card archived');
    card.append(el('h2', null, t('archivedTitle')));
    for (const a of archived) card.append(accountRow(a, b.accounts.get(a.id)));
    groups.append(card);
  }
  $('btn-acc-transfer').hidden = active.length < 2;
}

function accountRow(a, balance) {
  const row = el('button', 'acc-row');
  row.type = 'button';
  row.append(el('span', 'tx-title', a.name), el('span', 'amt' + (balance < 0 ? ' negtxt' : ''), money(balance)));
  row.onclick = () => openAccountForm(a);
  return row;
}

// ---------- Historique ----------

export function renderHistory() {
  const data = ctx.data();
  for (const c of document.querySelectorAll('#hist-filters .chip')) {
    c.classList.toggle('active', c.dataset.filter === histFilter);
    c.setAttribute('aria-pressed', String(c.dataset.filter === histFilter));
  }
  const list = L.sortedTx(data, (x) => histFilter === 'all' || x.type === histFilter);
  fillList($('hist-list'), data, list.slice(0, histLimit), 'emptyHistory');
  $('btn-hist-more').hidden = list.length <= histLimit;
}

// ---------- Formulaire d'opération ----------

function accountOptions(select, data, selectedId, excludeId) {
  select.replaceChildren();
  const b = L.computeBalances(data, editing && editing.id);
  for (const a of data.accounts) {
    if (a.archived && a.id !== selectedId) continue;
    if (a.id === excludeId) continue;
    const o = el('option', null, `${a.name} (${money(b.accounts.get(a.id))})`);
    o.value = a.id;
    select.append(o);
  }
  if (selectedId) select.value = selectedId;
}

function renderChips(box, items, current, onPick) {
  box.replaceChildren();
  for (const it of items) {
    const c = el('button', 'chip' + (it.id === current ? ' active' : ''), it.label);
    c.type = 'button';
    c.setAttribute('aria-pressed', String(it.id === current));
    c.onclick = () => onPick(it.id);
    box.append(c);
  }
}

function renderMoodChips() {
  renderChips($('tx-moods'), L.MOODS.map((m) => ({ id: m.id, label: `${m.emoji} ${t('mood' + m.id)}` })), txMood,
    (id) => { txMood = id; renderMoodChips(); });
}

function renderSourceChips() {
  renderChips($('tx-sources'), L.INCOME_SOURCES.map((s) => ({ id: s, label: t('source_' + s) })), txSource,
    (id) => { txSource = id; renderSourceChips(); });
}

export function openTxForm(type, tx = null) {
  const data = ctx.data();
  editing = tx;
  txType = type;
  returnTo = currentTab();
  $('tx-title').textContent = t((tx ? 'edit_' : 'new_') + type);
  $('tx-amount').value = tx ? L.formatAmount(tx.amount) : '';
  $('tx-desc').value = tx ? tx.desc : '';
  $('tx-desc-label').textContent = t(type === 'expense' ? 'descExpense' : 'descOther');
  $('tx-date').value = tx ? todayStr(new Date(tx.date)) : todayStr();
  $('tx-date').max = todayStr(); // pas d'opération dans le futur
  $('tx-reason').value = tx && tx.reason ? tx.reason : '';
  $('tx-err').textContent = '';

  $('tx-mood-wrap').hidden = type !== 'expense';
  $('tx-pool-wrap').hidden = type !== 'expense';
  $('tx-source-wrap').hidden = type !== 'income';
  $('tx-from-wrap').hidden = type === 'income';
  $('tx-to-wrap').hidden = type === 'expense';
  $('tx-from-label').textContent = t(type === 'transfer' ? 'fromAccount' : 'account');
  $('tx-to-label').textContent = t(type === 'transfer' ? 'toAccount' : 'account');

  txMood = tx && tx.mood ? tx.mood : null;
  txSource = tx && tx.source ? tx.source : 'client';
  renderMoodChips();
  renderSourceChips();

  const pool = $('tx-pool');
  pool.replaceChildren();
  for (const p of L.POOLS) { const o = el('option', null, poolName(p.id)); o.value = p.id; pool.append(o); }
  pool.value = tx && tx.pool ? tx.pool : 'NEC';

  accountOptions($('tx-from'), data, tx ? tx.from : undefined);
  accountOptions($('tx-to'), data, tx ? tx.to : undefined);
  if (type === 'transfer' && !tx) {
    const others = [...$('tx-to').options].map((o) => o.value).filter((v) => v !== $('tx-from').value);
    if (others.length) $('tx-to').value = others[0];
  }

  $('btn-tx-delete').hidden = !tx;
  updateTxChecks();
  ctx.show('s-tx');
  if (!tx) $('tx-amount').focus();
}

// Recalcule le Go/No-Go, l'aperçu de répartition et l'alerte compte.
function updateTxChecks() {
  const data = ctx.data();
  const amount = L.parseAmount($('tx-amount').value);
  const b = L.computeBalances(data, editing && editing.id);

  const split = $('tx-split');
  split.hidden = !(txType === 'income' && amount);
  if (!split.hidden) {
    const s = L.splitIncome(amount);
    split.replaceChildren(el('p', 'field-label', t('splitPreview')));
    const grid = el('div', 'split-grid');
    for (const p of L.POOLS) grid.append(el('span', null, poolName(p.id)), el('span', 'amt', money(s[p.id])));
    split.append(grid);
  }

  const nogo = $('tx-nogo');
  const short = txType === 'expense' && amount ? L.poolShortfall(b, $('tx-pool').value, amount) : 0;
  nogo.hidden = short === 0;
  $('tx-reason-wrap').hidden = short === 0;
  if (short) {
    const poolBal = b.pools[$('tx-pool').value];
    nogo.textContent = poolBal > 0
      ? t('nogo', { pool: poolName($('tx-pool').value), x: money(short) })
      : t('nogoEmpty', { pool: poolName($('tx-pool').value), bal: money(poolBal) });
  }

  const warn = $('tx-acc-warn');
  const fromId = $('tx-from').value;
  const low = txType !== 'income' && amount && fromId && b.accounts.get(fromId) < amount;
  warn.hidden = !low;
  if (low) warn.textContent = t('accountLow', { name: accountName(data, fromId), x: money(b.accounts.get(fromId)) });
}

// Date choisie -> date ISO. Aujourd'hui = l'heure actuelle (garde l'ordre).
function dateFromInput(value) {
  if (editing && todayStr(new Date(editing.date)) === value) return editing.date;
  if (value === todayStr()) return new Date().toISOString();
  if (value > todayStr()) return null; // futur : refusé
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function onTxSave() {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const err = (k) => { $('tx-err').textContent = t(k); };
  const amount = L.parseAmount($('tx-amount').value);
  if (!amount) return err('errAmount');
  const date = dateFromInput($('tx-date').value);
  if (!date) return err('errDate');
  const tx = { id: editing ? editing.id : L.newId(), type: txType, amount, date, desc: $('tx-desc').value };
  if (txType === 'expense') {
    if (!txMood) return err('errMood');
    tx.from = $('tx-from').value;
    tx.pool = $('tx-pool').value;
    tx.mood = txMood;
    const short = L.poolShortfall(L.computeBalances(data, editing && editing.id), tx.pool, amount);
    if (short) {
      const reason = $('tx-reason').value.trim();
      if (!reason) return err('errReason');
      tx.reason = reason;
    }
  } else if (txType === 'income') {
    tx.to = $('tx-to').value;
    tx.source = txSource;
  } else {
    tx.from = $('tx-from').value;
    tx.to = $('tx-to').value;
    if (tx.from === tx.to) return err('errSameAccount');
  }
  if (!tx.from && txType !== 'income') return err('errAccount');
  if (!tx.to && txType !== 'expense') return err('errAccount');

  let clean;
  try { clean = L.cleanTx(tx, new Set(data.accounts.map((a) => a.id))); } catch { return err('errGeneric'); }
  const before = data.tx.slice();
  const i = data.tx.findIndex((x) => x.id === clean.id);
  if (i >= 0) data.tx[i] = clean; else data.tx.push(clean);
  if (!(await ctx.save())) { data.tx = before; return err('errGeneric'); }
  if (!ctx.data()) return; // verrouillé pendant l'enregistrement
  editing = null;
  goBack();
}

async function onTxDelete() {
  if (!editing || ctx.isBusy()) return;
  const data = ctx.data();
  const target = editing;
  if (!(await ctx.ask(t('deleteConfirm', { x: money(target.amount) })))) return;
  if (ctx.data() !== data) return; // verrouillé pendant la question
  const before = data.tx.slice();
  data.tx = data.tx.filter((x) => x.id !== target.id);
  if (!(await ctx.save())) { data.tx = before; $('tx-err').textContent = t('errGeneric'); return; }
  if (!ctx.data()) return;
  editing = null;
  goBack();
}

// ---------- Formulaire de compte ----------

function renderCatChips() {
  renderChips($('acc-cats'), L.CATEGORIES.map((c) => ({ id: c, label: t('cat_' + c) })), accCategory,
    (id) => { accCategory = id; renderCatChips(); });
}

export function openAccountForm(a = null) {
  accEditing = a;
  returnTo = currentTab();
  $('acc-form-title').textContent = t(a ? 'editAccount' : 'addAccount');
  $('acc-name').value = a ? a.name : '';
  $('acc-start').value = a ? L.formatAmount(a.start) : '';
  $('acc-split').checked = a ? a.splitStart : true;
  $('acc-archived').checked = a ? a.archived : false;
  $('acc-archived-wrap').hidden = !a;
  $('acc-err').textContent = '';
  const cur = $('acc-current');
  cur.hidden = !a;
  if (a) cur.textContent = t('accCurrent', { x: money(L.computeBalances(ctx.data()).accounts.get(a.id)) });
  accCategory = a ? a.category : 'mobile';
  renderCatChips();
  ctx.show('s-account');
  if (!a) $('acc-name').focus();
}

async function onAccountSave() {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const err = (k) => { $('acc-err').textContent = t(k); };
  const name = $('acc-name').value.trim();
  if (!name) return err('errName');
  const raw = $('acc-start').value.trim();
  const start = raw === '' || /^0+$/.test(raw.replace(/\s/g, '')) ? 0 : L.parseAmount(raw);
  if (start === null) return err('errAmount');
  let clean;
  try {
    clean = L.cleanAccount({
      id: accEditing ? accEditing.id : L.newId(), name, category: accCategory, start,
      splitStart: $('acc-split').checked, archived: accEditing ? $('acc-archived').checked : false,
    });
  } catch { return err('errGeneric'); }
  if (accEditing) {
    // Archiver seulement un compte vide : sinon l'argent resterait coincé dedans.
    const bal = L.computeBalances(data).accounts.get(accEditing.id);
    if (clean.archived && !accEditing.archived && bal !== 0) return err('errArchiveNotEmpty');
    // Changer la case "répartir" modifie tous les pools depuis le début : on demande.
    if (clean.splitStart !== accEditing.splitStart && clean.start > 0) {
      if (!(await ctx.ask(t('splitChangeConfirm')))) return;
      if (ctx.data() !== data) return;
    }
  }
  const before = data.accounts.slice();
  const i = data.accounts.findIndex((x) => x.id === clean.id);
  if (i >= 0) data.accounts[i] = clean;
  else {
    if (data.accounts.length >= 50) return err('errTooMany');
    data.accounts.push(clean);
  }
  if (!(await ctx.save())) { data.accounts = before; return err('errGeneric'); }
  if (!ctx.data()) return;
  accEditing = null;
  goBack();
}

// ---------- Navigation ----------

const TABS = ['s-home', 's-accounts', 's-history', 's-settings'];

function currentTab() {
  for (const id of TABS) if (!$(id).hidden) return id;
  return returnTo;
}

function goBack() {
  openTab(TABS.includes(returnTo) ? returnTo : 's-home');
}

export function openTab(id) {
  if (id === 's-home') renderHome();
  if (id === 's-accounts') renderAccounts();
  if (id === 's-history') renderHistory();
  if (id === 's-settings') { ctx.renderSettings(); }
  ctx.show(id);
}

export function isTab(id) {
  return TABS.includes(id);
}

// Au verrouillage : effacer tout ce qui montre de l'argent.
export function clearAll() {
  for (const id of ['home-total', 'home-pools-note', 'acc-total']) $(id).textContent = '';
  for (const id of ['home-expenses', 'home-incomes', 'pool-grid', 'acc-groups', 'hist-list', 'tx-split', 'tx-from', 'tx-to']) {
    $(id).replaceChildren();
  }
  for (const id of ['tx-amount', 'tx-desc', 'tx-reason', 'acc-name', 'acc-start']) $(id).value = '';
  for (const id of ['tx-nogo', 'tx-acc-warn']) $(id).textContent = '';
  editing = null;
  accEditing = null;
}

// Réaffiche les textes après un changement de langue.
export function refresh() {
  const open = currentTab();
  if (isTab(open) && !$(open).hidden) openTab(open);
}

// Met "12 500" joli quand on quitte le champ.
function prettyAmount(input) {
  const n = L.parseAmount(input.value);
  if (n) input.value = L.formatAmount(n);
}

export function initScreens(context) {
  ctx = context;
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => openTab(b.dataset.tab);
  for (const c of document.querySelectorAll('#hist-filters .chip')) c.onclick = () => { histFilter = c.dataset.filter; histLimit = 200; renderHistory(); };
  $('btn-hist-more').onclick = () => { histLimit += 200; renderHistory(); };

  $('btn-new-income').onclick = () => openTxForm('income');
  $('btn-new-expense').onclick = () => openTxForm('expense');
  $('btn-new-transfer').onclick = () => openTxForm('transfer');
  $('btn-acc-transfer').onclick = () => openTxForm('transfer');
  $('btn-home-add-account').onclick = () => openAccountForm();
  $('btn-add-account').onclick = () => openAccountForm();

  for (const id of ['tx-amount', 'tx-pool', 'tx-from', 'tx-to']) $(id).addEventListener('input', updateTxChecks);
  for (const id of ['tx-pool', 'tx-from', 'tx-to']) $(id).addEventListener('change', updateTxChecks);
  $('tx-amount').addEventListener('blur', () => prettyAmount($('tx-amount')));
  $('acc-start').addEventListener('blur', () => prettyAmount($('acc-start')));
  $('btn-tx-save').onclick = onTxSave;
  $('btn-tx-delete').onclick = onTxDelete;
  $('btn-tx-cancel').onclick = () => { editing = null; goBack(); };
  $('btn-acc-save').onclick = onAccountSave;
  $('btn-acc-cancel').onclick = () => { accEditing = null; goBack(); };
}
