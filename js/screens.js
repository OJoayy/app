// screens.js — les écrans : dashboard, comptes et pools, historique,
// formulaires (revenu, dépense, transfert, remboursement, achat, vente, compte).
// Les écrans Dettes et Investir sont dans finance.js.
// Règle de sécurité : on n'écrit JAMAIS de HTML, seulement du texte.

import * as L from './ledger.js';
import { t, getLang } from './i18n.js';
import * as FX from './fx.js';
import * as W from './widgets.js';
import * as F from './finance.js';
import { el, money, fmtDay, todayStr, poolName, moodOf, accountName, avatar, imageToIcon, renderChips, liveAmount } from './ui.js';

const $ = (id) => document.getElementById(id);

// ctx vient de app.js : { data(), save(), show(), ask(), busy(), isBusy() }
let ctx = null;
let returnTo = 's-home';
let editing = null;       // opération en cours de modification (ou null)
let txType = 'expense';
let txMood = null;
let txSource = 'client';
let txPreset = {};        // valeurs proposées à l'ouverture (dette, actif, montant)
let accEditing = null;    // compte en cours de modification (ou null)
let accCategory = 'mobile';
let accIcon = null;       // image du compte en cours de modification
let imageToken = 0;       // ignore une image arrivée après la fermeture du formulaire
let formSnapshot = '';    // état du formulaire à l'ouverture (pour savoir s'il a changé)
let histFilter = 'all';
let histLimit = 200; // l'historique s'affiche par paquets de 200

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
    title = tx.desc || (tx.source === 'asset' ? F.assetName(data, tx.asset) : t('source_' + tx.source));
    meta = `${accountName(data, tx.to)} · ${tx.source === 'asset' ? t('source_asset') + ' · ' : ''}${fmtDay(tx.date)}`;
    amount = '+' + amount;
    amountCls = 'amt in';
  } else if (tx.type === 'loan') {
    icon = '↘';
    title = t('loanOf', { name: F.debtName(data, tx.debt) });
    meta = `${accountName(data, tx.to)} · ${fmtDay(tx.date)}`;
    amount = '+' + amount;
  } else if (tx.type === 'repay') {
    icon = '↗';
    title = tx.desc || t('repayOf', { name: F.debtName(data, tx.debt) });
    meta = `${accountName(data, tx.from)} · ${poolName('DET')} · ${fmtDay(tx.date)}`;
    amount = '−' + amount;
  } else if (tx.type === 'buy') {
    icon = '◆';
    title = tx.desc || t('buyOf', { name: F.assetName(data, tx.asset) });
    meta = `${accountName(data, tx.from)} · ${poolName('INV')} · ${fmtDay(tx.date)}`;
    amount = '−' + amount;
  } else if (tx.type === 'sell') {
    icon = '◇';
    title = tx.desc || t('sellOf', { name: F.assetName(data, tx.asset), pct: (tx.shareBp / 100).toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR') });
    meta = `${accountName(data, tx.to)} · ${poolName('INV')} · ${fmtDay(tx.date)}`;
    amount = '+' + amount;
  } else {
    title = tx.desc || t('transferLabel');
    meta = `${accountName(data, tx.from)} → ${accountName(data, tx.to)} · ${fmtDay(tx.date)}`;
  }
  const left = el('span', 'tx-icon', icon);
  left.setAttribute('aria-hidden', 'true');
  const mid = el('span', 'tx-mid');
  mid.append(el('span', 'tx-title', title), el('span', 'tx-meta', meta));
  if (tx.fee) mid.append(el('span', 'tx-meta', t('feeMeta', { fee: money(tx.fee) })));
  if (tx.reason) mid.append(el('span', 'tx-meta nogo-note', '⚠ ' + tx.reason));
  row.append(left, mid, el('span', amountCls, amount));
  // Un prêt reçu se modifie depuis sa dette.
  row.onclick = () => (tx.type === 'loan' ? F.openDebt(tx.debt) : openTxForm(tx.type, tx));
  return row;
}

// Ligne de frais (historique) : ouvre l'opération qui les a payés.
function feeRow(data, tx) {
  const row = el('button', 'tx-row fee-row');
  row.type = 'button';
  const icon = el('span', 'tx-icon', '%');
  icon.setAttribute('aria-hidden', 'true');
  const mid = el('span', 'tx-mid');
  const pct = (tx.feeBp / 100).toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR');
  mid.append(el('span', 'tx-title', t('feeTitle', { pct, what: tx.desc || t(tx.type === 'transfer' ? 'transferLabel' : 'newExpense') })),
    el('span', 'tx-meta', `${accountName(data, tx.from)} · ${fmtDay(tx.date)}`));
  row.append(icon, mid, el('span', 'amt', '−' + money(tx.fee)));
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
  // Même solde en € et en £ (le € est fixe ; le £ dépend du taux du jour).
  // Mode discret : seul le solde principal est remplacé par des étoiles.
  const lang = getLang();
  const fx = FX.cleanFx(data.fx);
  if (ctx.isDiscreet()) {
    $('home-total').textContent = '•••••• FCFA';
    $('home-fx').textContent = fx ? '•••• £ · •••• €' : '•••• €';
  } else {
    $('home-total').textContent = money(b.liquid);
    const eur = FX.formatMoney(FX.toEur(b.liquid), 'EUR', lang);
    $('home-fx').textContent = fx ? `${FX.formatMoney(FX.toGbp(b.liquid, fx), 'GBP', lang)} · ${eur}` : eur;
  }
  // Le taux £ n'est signalé que s'il est ancien (plus de 7 jours).
  $('home-fx-stale').hidden = !(fx && FX.isStale(fx));
  $('home-fx-stale').textContent = fx && FX.isStale(fx) ? t('fxOldShort') : '';
  const noAccount = data.accounts.filter((a) => !a.archived).length === 0;
  $('home-empty').hidden = !noAccount;
  refreshDiscreet();
  F.renderHomeFinance(b);
  fillList($('home-expenses'), data, L.sortedTx(data, (x) => x.type === 'expense').slice(0, 5), 'emptyExpenses');
  fillList($('home-incomes'), data, L.sortedTx(data, (x) => x.type === 'income').slice(0, 5), 'emptyIncomes');
  ctx.renderHomeExtras();
}

// ---------- Comptes et pools ----------

export function renderAccounts() {
  const data = ctx.data();
  const b = L.computeBalances(data);
  $('acc-total').textContent = money(b.liquid);
  $('acc-pools-note').textContent = t('poolsTotalNote', { x: money(b.poolTotal) });

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
}

function accountRow(a, balance) {
  const row = el('button', 'acc-row');
  row.type = 'button';
  const name = el('span', 'acc-name');
  name.append(avatar(a.name, a.category, a.icon), el('span', 'tx-title', a.name));
  row.append(name, el('span', 'amt' + (balance < 0 ? ' negtxt' : ''), money(balance)));
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
  // Les frais sont des lignes à part, rangées dans « Autres » (et dans « Tout »),
  // juste sous l'opération qui les a payés.
  const items = [];
  for (const x of L.sortedTx(data)) {
    const main = histFilter === 'all' || x.type === histFilter
      || (histFilter === 'other' && x.type !== 'income' && x.type !== 'expense');
    if (main) items.push(x);
    if (x.fee && (histFilter === 'all' || histFilter === 'other')) items.push({ feeOf: x });
  }
  const box = $('hist-list');
  box.replaceChildren();
  if (!items.length) box.append(el('p', 'muted', t('emptyHistory')));
  for (const it of items.slice(0, histLimit)) box.append(it.feeOf ? feeRow(data, it.feeOf) : txRow(data, it));
  $('btn-hist-more').hidden = items.length <= histLimit;
  // Combien de frais j'ai payé : ce mois-ci, sur 12 mois, et au total.
  const now = new Date();
  const month = `${now.getFullYear()}-${now.getMonth()}`;
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
  let fm = 0; let fy = 0; let fa = 0;
  for (const x of data.tx) {
    if (!x.fee) continue;
    const d = new Date(x.date);
    fa += x.fee;
    if (x.date >= yearAgo) fy += x.fee;
    if (`${d.getFullYear()}-${d.getMonth()}` === month) fm += x.fee;
  }
  $('hist-fees').hidden = fa === 0;
  $('hist-fees').textContent = fa ? t('feesSummary', { m: money(fm), y: money(fy), a: money(fa) }) : '';
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


function renderMoodChips() {
  renderChips($('tx-moods'), L.MOODS.map((m) => ({ id: m.id, label: `${m.emoji} ${t('mood' + m.id)}` })), txMood,
    (id) => { txMood = id; renderMoodChips(); });
}

function renderSourceChips() {
  renderChips($('tx-sources'), L.INCOME_SOURCES.map((s) => ({ id: s, label: t('source_' + s) })), txSource,
    (id) => { txSource = id; renderSourceChips(); syncTxFields(); });
}

// Montre seulement les champs utiles pour ce type d'opération.
function syncTxFields() {
  const type = txType;
  const outgoing = ['expense', 'transfer', 'repay', 'buy'].includes(type);
  const incoming = ['income', 'transfer', 'sell'].includes(type);
  $('tx-mood-wrap').hidden = type !== 'expense';
  $('tx-pool-wrap').hidden = type !== 'expense';
  $('tx-source-wrap').hidden = type !== 'income';
  $('tx-from-wrap').hidden = !outgoing;
  $('tx-to-wrap').hidden = !incoming;
  $('tx-debt-wrap').hidden = type !== 'repay';
  $('tx-asset-wrap').hidden = !(type === 'buy' || type === 'sell' || (type === 'income' && txSource === 'asset'));
  $('tx-share-wrap').hidden = type !== 'sell';
  $('tx-fee-wrap').hidden = !hasFee();
  $('tx-from-label').textContent = t(type === 'transfer' ? 'fromAccount' : 'account');
  $('tx-to-label').textContent = t(type === 'transfer' ? 'toAccount' : 'account');
  $('tx-amount-label').textContent = t(type === 'sell' ? 'amountReceived' : 'amountLabel');
  updateTxChecks();
}

export function openTxForm(type, tx = null, preset = {}) {
  const data = ctx.data();
  editing = tx;
  txType = type;
  txPreset = preset;
  returnTo = currentTab();
  $('tx-title').textContent = t((tx ? 'edit_' : 'new_') + type);
  $('tx-amount').value = tx ? L.formatAmount(tx.amount) : preset.amount ? L.formatAmount(preset.amount) : '';
  $('tx-desc').value = tx ? tx.desc : '';
  $('tx-desc-label').textContent = t(type === 'expense' ? 'descExpense' : 'descOther');
  $('tx-date').value = tx ? todayStr(new Date(tx.date)) : todayStr();
  $('tx-date').max = todayStr(); // pas d'opération dans le futur
  $('tx-reason').value = tx && tx.reason ? tx.reason : '';
  $('tx-err').textContent = '';

  txMood = tx && tx.mood ? tx.mood : null;
  txSource = tx && tx.source ? tx.source : preset.asset && type === 'income' ? 'asset' : 'client';
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

  F.debtOptions($('tx-debt'), data, tx ? tx.debt : preset.debt);
  F.assetOptions($('tx-asset'), data, tx ? tx.asset : preset.asset);
  $('tx-share').value = tx && tx.shareBp ? String(tx.shareBp / 100).replace('.', ',') : '100';
  $('tx-fee').value = tx && tx.feeBp ? String(tx.feeBp / 100).replace('.', ',') : '';

  $('btn-tx-delete').hidden = !tx;
  syncTxFields();
  ctx.show('s-tx');
  formSnapshot = snapshot();
  if (!tx) $('tx-amount').focus();
}

// Frais en % : "1,5" -> 150 (centièmes de %). Vide = 0. null = invalide.
const hasFee = () => txType === 'expense' || txType === 'transfer';
function parseFeeBp(raw) {
  const s = String(raw).trim().replace('%', '').replace(/\s/g, '').replace(',', '.');
  if (s === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp <= L.MAX_FEE_BP ? bp : null;
}

// Recalcule le Go/No-Go, l'aperçu de répartition et l'alerte compte.
function updateTxChecks() {
  const data = ctx.data();
  const base = L.parseAmount($('tx-amount').value);
  const b = L.computeBalances(data, editing && editing.id);
  // Frais : affichés sous la ligne, et comptés dans le Go/No-Go et l'alerte compte.
  const feeBp = hasFee() ? parseFeeBp($('tx-fee').value) : 0;
  const fee = base && feeBp ? L.feeOf(base, feeBp) : 0;
  const note = $('tx-fee-note');
  note.hidden = !(hasFee() && (fee > 0 || feeBp === null));
  note.textContent = feeBp === null ? t('errFee') : fee ? t('feeNote', { fee: money(fee), total: money(base + fee) }) : '';
  const amount = base ? base + fee : base;

  const split = $('tx-split');
  split.hidden = !(txType === 'income' && amount);
  if (!split.hidden) {
    const s = L.splitIncome(amount);
    split.replaceChildren(el('p', 'field-label', t('splitPreview')));
    const grid = el('div', 'split-grid');
    for (const p of L.POOLS) grid.append(el('span', null, poolName(p.id)), el('span', 'amt', money(s[p.id])));
    split.append(grid);
  }

  // Go/No-Go : dépense (raison obligatoire) ; remboursement et achat (simple alerte).
  const nogo = $('tx-nogo');
  const poolId = txType === 'expense' ? $('tx-pool').value : txType === 'repay' ? 'DET' : txType === 'buy' ? 'INV' : null;
  const short = poolId && amount ? L.poolShortfall(b, poolId, amount) : 0;
  // Transfert : ses frais sortent de Nécessité -> simple alerte si ce pool ne suffit pas.
  const feeShort = txType === 'transfer' && fee ? L.poolShortfall(b, 'NEC', fee) : 0;
  nogo.hidden = short === 0 && feeShort === 0;
  $('tx-reason-wrap').hidden = !(short && txType === 'expense');
  if (short) {
    const poolBal = b.pools[poolId];
    nogo.textContent = poolBal > 0 ? t('nogo', { pool: poolName(poolId), x: money(short) })
      : t('nogoEmpty', { pool: poolName(poolId), bal: money(poolBal) });
  } else if (feeShort) {
    nogo.textContent = t('feeNogo', { pool: poolName('NEC'), bal: money(b.pools.NEC) });
  }

  const warn = $('tx-acc-warn');
  const fromId = $('tx-from').value;
  const outgoing = ['expense', 'transfer', 'repay', 'buy'].includes(txType);
  const low = outgoing && amount && fromId && b.accounts.get(fromId) < amount;
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
  const feeBp = hasFee() ? parseFeeBp($('tx-fee').value) : 0;
  if (feeBp === null) return err('errFee');
  if (feeBp) tx.feeBp = feeBp;
  if (txType === 'expense') {
    if (!txMood) return err('errMood');
    tx.from = $('tx-from').value;
    tx.pool = $('tx-pool').value;
    tx.mood = txMood;
    const short = L.poolShortfall(L.computeBalances(data, editing && editing.id), tx.pool, amount + L.feeOf(amount, feeBp));
    if (short) {
      const reason = $('tx-reason').value.trim();
      if (!reason) return err('errReason');
      tx.reason = reason;
    }
  } else if (txType === 'income') {
    tx.to = $('tx-to').value;
    tx.source = txSource;
    if (txSource === 'asset') { tx.asset = $('tx-asset').value; if (!tx.asset) return err('errAsset'); }
  } else if (txType === 'repay') {
    tx.from = $('tx-from').value;
    tx.debt = $('tx-debt').value;
    if (!tx.debt) return err('errDebt');
  } else if (txType === 'buy') {
    tx.from = $('tx-from').value;
    tx.asset = $('tx-asset').value;
    if (!tx.asset) return err('errAsset');
  } else if (txType === 'sell') {
    tx.to = $('tx-to').value;
    tx.asset = $('tx-asset').value;
    if (!tx.asset) return err('errAsset');
    const pct = Number($('tx-share').value.replace(',', '.').replace('%', '').trim());
    if (!Number.isFinite(pct) || Math.round(pct * 100) < 1 || pct > 100) return err('errShare');
    tx.shareBp = Math.round(pct * 100);
  } else {
    tx.from = $('tx-from').value;
    tx.to = $('tx-to').value;
    if (tx.from === tx.to) return err('errSameAccount');
  }
  if ('from' in tx && !tx.from) return err('errAccount');
  if ('to' in tx && !tx.to) return err('errAccount');

  let clean;
  try { clean = L.cleanTx(tx, L.refsOf(data)); } catch { return err('errGeneric'); }
  const before = data.tx.slice();
  const i = data.tx.findIndex((x) => x.id === clean.id);
  if (i < 0 && data.tx.length >= L.LIMITS.tx) return err('errTooManyTx');
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
    (id) => { accCategory = id; renderCatChips(); renderAccAvatar(); });
}

function renderAccAvatar() {
  const slot = $('acc-avatar');
  const a = avatar($('acc-name').value, accCategory, accIcon, 'lg');
  a.id = 'acc-avatar';
  slot.replaceWith(a);
  $('btn-acc-image-remove').hidden = !accIcon;
}

async function onAccImagePicked() {
  ctx.suppressLock(false);
  const file = $('acc-image-file').files[0];
  $('acc-image-file').value = '';
  if (!file) return;
  const token = ++imageToken;
  let icon = null;
  try { icon = await imageToIcon(file); } catch { icon = null; }
  if (token !== imageToken || $('s-account').hidden) return; // formulaire fermé entre-temps
  if (icon) { accIcon = icon; $('acc-err').textContent = ''; } else $('acc-err').textContent = t('errImage');
  renderAccAvatar();
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
  accIcon = a && a.icon ? a.icon : null;
  imageToken += 1;
  renderCatChips();
  renderAccAvatar();
  ctx.show('s-account');
  formSnapshot = snapshot();
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
      icon: accIcon || undefined,
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

const TABS = ['s-home', 's-accounts', 's-debts', 's-assets', 's-history', 's-settings'];

// Écrans de détail (une dette, un actif) : on peut y revenir après un formulaire.
const DETAILS = ['s-debt', 's-asset'];

function currentTab() {
  for (const id of [...TABS, ...DETAILS]) if (!$(id).hidden) return id;
  return returnTo;
}

function goBack() {
  if (DETAILS.includes(returnTo) && F.reopenDetail(returnTo)) return;
  openTab(TABS.includes(returnTo) ? returnTo : 's-home');
}

export function openTab(id) {
  if (id === 's-home') renderHome();
  if (id === 's-accounts') renderAccounts();
  if (id === 's-history') renderHistory();
  if (id === 's-debts') F.renderDebts();
  if (id === 's-assets') F.renderAssets();
  if (id === 's-settings') { ctx.renderSettings(); }
  ctx.show(id);
}

export function isTab(id) {
  return TABS.includes(id);
}

// ---------- Bouton + flottant ----------

export function toggleFab(open) {
  const data = ctx.data();
  const want = open === undefined ? $('fab-menu').hidden : open;
  if (want && data) {
    const active = data.accounts.filter((a) => !a.archived).length;
    // Sans compte, le + ouvre directement la création d'un compte.
    if (!active) { toggleFab(false); openAccountForm(); return; }
    $('fab-transfer').hidden = active < 2;
  }
  $('fab-menu').hidden = !want;
  $('fab-backdrop').hidden = !want;
  $('fab').classList.toggle('open', want);
  $('fab').setAttribute('aria-expanded', String(want));
}

// ---------- Mode discret ----------

export function refreshDiscreet() {
  const on = ctx.isDiscreet();
  for (const id of ['btn-discreet', 'btn-debts-discreet']) {
    const btn = $(id);
    btn.replaceChildren(W.eyeIcon(!on));
    btn.setAttribute('aria-pressed', String(on));
  }
}

// Valeurs actuelles du formulaire ouvert, pour détecter une saisie en cours.
function snapshot() {
  const ids = $('s-tx').hidden
    ? ['acc-name', 'acc-start', 'acc-split', 'acc-archived']
    : ['tx-amount', 'tx-fee', 'tx-desc', 'tx-from', 'tx-to', 'tx-pool', 'tx-date', 'tx-reason', 'tx-debt', 'tx-asset', 'tx-share'];
  const vals = ids.map((id) => ($(id).type === 'checkbox' ? $(id).checked : $(id).value));
  return JSON.stringify([vals, txMood, txSource, accCategory, accIcon]);
}

// Bouton retour sur un formulaire : comme "Annuler", mais on demande
// avant de perdre une saisie. Renvoie true si le formulaire est fermé.
export async function back() {
  if (snapshot() !== formSnapshot) {
    const data = ctx.data();
    if (!(await ctx.ask(t('discardConfirm')))) return false;
    if (ctx.data() !== data) return true; // verrouillé pendant la question
  }
  editing = null;
  accEditing = null;
  imageToken += 1;
  goBack();
  return true;
}

// Au verrouillage : effacer tout ce qui montre de l'argent.
export function clearAll() {
  for (const id of ['home-total', 'home-fx', 'acc-pools-note', 'acc-total', 'acc-current', 'hist-fees', 'tx-fee-note']) $(id).textContent = '';
  F.clearFinance();
  toggleFab(false);
  for (const id of ['home-expenses', 'home-incomes', 'pool-grid', 'acc-groups', 'hist-list', 'tx-split', 'tx-from', 'tx-to']) {
    $(id).replaceChildren();
  }
  for (const id of ['tx-amount', 'tx-fee', 'tx-desc', 'tx-reason', 'acc-name', 'acc-start']) $(id).value = '';
  for (const id of ['tx-nogo', 'tx-acc-warn']) $(id).textContent = '';
  editing = null;
  accEditing = null;
  accIcon = null;
  const av = $('acc-avatar');
  if (av.tagName === 'IMG') av.removeAttribute('src');
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

  // Ouvrir le menu ajoute une étape "retour" ; le fermer à la main la retire.
  $('fab').onclick = () => {
    const open = $('fab-menu').hidden;
    toggleFab(open);
    if (open && !$('fab-menu').hidden) ctx.pushBackGuard(); else ctx.syncBack();
  };
  $('fab-backdrop').onclick = () => { toggleFab(false); ctx.syncBack(); };
  $('fab-income').onclick = () => { toggleFab(false); openTxForm('income'); };
  $('fab-expense').onclick = () => { toggleFab(false); openTxForm('expense'); };
  $('fab-transfer').onclick = () => { toggleFab(false); openTxForm('transfer'); };
  $('btn-discreet').onclick = () => ctx.toggleDiscreet();
  $('btn-debts-discreet').onclick = () => ctx.toggleDiscreet();
  $('btn-home-add-account').onclick = () => openAccountForm();
  $('btn-add-account').onclick = () => openAccountForm();

  liveAmount($('tx-amount')); // d'abord les espaces, puis les vérifications
  for (const id of ['tx-amount', 'tx-fee', 'tx-pool', 'tx-from', 'tx-to']) $(id).addEventListener('input', updateTxChecks);
  for (const id of ['tx-pool', 'tx-from', 'tx-to']) $(id).addEventListener('change', updateTxChecks);
  F.initFinance(ctx, { openTxForm, openTab, currentTab: () => currentTab(), setReturn: (id) => { returnTo = id; } });
  liveAmount($('acc-start'));
  $('tx-amount').addEventListener('blur', () => prettyAmount($('tx-amount')));
  $('acc-start').addEventListener('blur', () => prettyAmount($('acc-start')));
  $('btn-tx-save').onclick = onTxSave;
  $('btn-tx-delete').onclick = onTxDelete;
  $('btn-tx-cancel').onclick = () => { editing = null; goBack(); };
  $('btn-acc-save').onclick = onAccountSave;
  $('btn-acc-cancel').onclick = () => { accEditing = null; goBack(); };
  $('btn-acc-image').onclick = () => { ctx.suppressLock(true); $('acc-image-file').click(); };
  $('acc-image-file').addEventListener('change', onAccImagePicked);
  $('acc-image-file').addEventListener('cancel', () => ctx.suppressLock(false));
  $('btn-acc-image-remove').onclick = () => { accIcon = null; renderAccAvatar(); };
  $('acc-name').addEventListener('input', () => { if (!accIcon) renderAccAvatar(); });
}
