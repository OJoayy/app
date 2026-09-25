// finance.js — écrans des étapes 4 et 5 : Dettes et Investir.
// Les calculs sont dans debts.js et assets.js ; ici, seulement l'affichage.
// Règle de sécurité : on n'écrit JAMAIS de HTML, seulement du texte.

import * as L from './ledger.js';
import * as D from './debts.js';
import * as A from './assets.js';
import * as FX from './fx.js';
import { t, getLang } from './i18n.js';
import { el, money, fmtDay, fmtYmd, todayStr, poolName, accountName, avatar, renderChips, sparkline } from './ui.js';

const $ = (id) => document.getElementById(id);

let ctx = null;  // vient de app.js (données, enregistrement, écrans…)
let api = null;  // vient de screens.js (formulaire d'opération, onglets)

let currentDebtId = null;
let currentAssetId = null;
let debtEditing = null;
let debtOrigin = 'account';
let debtMode = 'auto';
let scheduleAll = false;
let assetEditing = null;
let assetCategory = 'stocks';
let assetOrigin = 'buy';
let valueCurrency = 'XOF';
let strategyExtra = 0;
let formSnapshot = '';

// ---------- Petits outils ----------

export const debtName = (data, id) => (data.debts.find((d) => d.id === id) || {}).lender || '?';
export const assetName = (data, id) => (data.assets.find((a) => a.id === id) || {}).name || '?';
export const isDebtDone = (debt, data) => D.debtStatus(debt, data).done;

const pct = (x) => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 1 })} %`);
const signed = (n) => (n >= 0 ? '+' : '−') + money(Math.abs(n));

function statRow(grid, label, value, cls = 'amt') {
  grid.append(el('span', null, label), el('span', cls, value));
}

// "AAAA-MM-JJ" -> date ISO (aujourd'hui = maintenant, sinon midi).
function isoFromDay(ymd) {
  if (ymd === todayStr()) return new Date().toISOString();
  return new Date(`${ymd}T12:00:00`).toISOString();
}

function parseDecimal(v) {
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.').replace('%', '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

// Listes déroulantes du formulaire d'opération.
export function debtOptions(select, data, selectedId) {
  select.replaceChildren();
  for (const d of data.debts) {
    const st = D.debtStatus(d, data);
    if (st.done && d.id !== selectedId) continue;
    const o = el('option', null, `${d.lender} (${money(st.balance)})`);
    o.value = d.id;
    select.append(o);
  }
  if (selectedId) select.value = selectedId;
}

export function assetOptions(select, data, selectedId) {
  select.replaceChildren();
  for (const a of data.assets) {
    if (a.closed && a.id !== selectedId) continue;
    const o = el('option', null, a.name);
    o.value = a.id;
    select.append(o);
  }
  if (selectedId) select.value = selectedId;
}

// ---------- Dashboard : dettes en retard et valeur nette ----------

export function renderHomeFinance(b) {
  const data = ctx.data();
  let late = 0;
  let owed = 0;
  for (const d of data.debts) {
    const st = D.debtStatus(d, data);
    late += st.lateCount;
    owed += st.balance;
  }
  let assets = 0;
  for (const a of data.assets) if (!a.closed) assets += A.assetStatus(a, data).value;
  $('home-late').hidden = late === 0;
  $('home-late').textContent = t('lateBanner', { n: late });
  const show = data.debts.length > 0 || data.assets.length > 0;
  $('home-worth').hidden = !show;
  if (show) {
    $('worth-assets').textContent = money(assets);
    $('worth-debts').textContent = (owed > 0 ? '−' : '') + money(owed);
    // Mode discret : la valeur nette permettrait de retrouver le solde caché.
    $('worth-net').textContent = ctx.isDiscreet() ? '•••••• FCFA' : money(b.liquid + assets - owed);
    $('worth-assets').parentElement.hidden = data.assets.length === 0;
    $('worth-debts').parentElement.hidden = data.debts.length === 0;
  }
}

// ---------- Onglet Dettes ----------

export function renderDebts() {
  const data = ctx.data();
  const today = D.todayYmd();
  let total = 0;
  let toPay = 0;
  let late = 0;
  let next = null;
  const active = [];
  const done = [];
  for (const d of data.debts) {
    const st = D.debtStatus(d, data, today);
    if (st.done) { done.push({ d, st }); continue; }
    active.push({ d, st });
    total += st.balance;
    toPay += st.remainingToPay;
    late += st.lateCount;
    if (st.next && (!next || st.next.date < next.row.date)) next = { row: st.next, d };
  }
  $('debts-total').textContent = money(total);
  $('debts-topay').textContent = t('toPayNote', { x: money(toPay) });
  $('debts-next').textContent = next ? t(next.row.late ? 'dueLateNote' : 'nextDueNote', { date: fmtYmd(next.row.date), x: money(next.row.amount), name: next.d.lender }) : '';
  $('debts-late').hidden = late === 0;
  $('debts-late').textContent = t('lateBanner', { n: late });

  const list = $('debts-list');
  list.replaceChildren();
  if (!active.length) list.append(el('p', 'muted', t('noDebts')));
  for (const { d, st } of active) list.append(debtRow(d, st));
  $('debts-done-wrap').hidden = done.length === 0;
  $('debts-done').replaceChildren(...done.map(({ d, st }) => debtRow(d, st)));
  renderStrategy(active);
}

function debtRow(d, st) {
  const row = el('button', 'acc-row');
  row.type = 'button';
  const name = el('span', 'acc-name');
  const mid = el('span', 'tx-mid');
  const meta = st.done ? t('debtDone') : st.lateCount ? t('lateShort', { n: st.lateCount })
    : st.next ? t('nextShort', { date: fmtYmd(st.next.date, false) }) : '';
  mid.append(el('span', 'tx-title', d.lender), el('span', 'tx-meta' + (st.lateCount ? ' nogo-note' : ''), meta));
  name.append(avatar(d.lender, 'bank'), mid);
  row.append(name, el('span', 'amt', money(st.balance)));
  row.onclick = () => openDebt(d.id);
  return row;
}

function activeDebts() {
  const data = ctx.data();
  return data.debts.map((d) => ({ d, st: D.debtStatus(d, data) })).filter((x) => !x.st.done);
}

function renderStrategy(active) {
  const data = ctx.data();
  $('strategy').hidden = active.length === 0;
  if (!active.length) return;
  renderChips($('strategy-methods'), L.DEBT_METHODS.map((m) => ({ id: m, label: t('method_' + m) })), data.debtMethod,
    async (id) => {
      if (ctx.isBusy() || id === data.debtMethod) return;
      const before = data.debtMethod;
      data.debtMethod = id;
      renderStrategy(activeDebts());
      if (!(await ctx.save())) { data.debtMethod = before; if (ctx.data() === data) renderStrategy(activeDebts()); }
    });
  const items = active.map(({ d, st }) => ({ id: d.id, balance: st.balance, rate: d.rate, payment: Math.max(1, st.payment) }));
  const box = $('strategy-result');
  box.replaceChildren();
  for (const m of L.DEBT_METHODS) {
    const r = D.simulate(items, m, strategyExtra);
    statRow(box, t('method_' + m), r.months === null ? t('neverEnds')
      : `${fmtYmd(D.addMonths(D.todayYmd(), r.months))} · ${t('interestShort', { x: money(r.interest) })}`);
  }
  const first = D.priorityOrder(items, data.debtMethod)[0];
  const firstDebt = data.debts.find((d) => d.id === first.id);
  $('strategy-priority').textContent = t('priorityNote', { name: firstDebt.lender });
  // Argent en trop dans le pool Dette -> proposé sur la dette prioritaire.
  const pool = L.computeBalances(data).pools.DET;
  const suggest = Math.min(Math.max(0, pool), first.balance);
  $('strategy-suggest').hidden = suggest <= 0;
  $('btn-strategy-pay').hidden = suggest <= 0;
  if (suggest > 0) {
    $('strategy-suggest').textContent = t('poolSuggest', { x: money(suggest), name: firstDebt.lender });
    $('btn-strategy-pay').textContent = t('payNow', { x: money(suggest) });
    $('btn-strategy-pay').onclick = () => api.openTxForm('repay', null, { debt: first.id, amount: suggest });
  }
}

// ---------- Une dette ----------

export function openDebt(id) {
  currentDebtId = id;
  scheduleAll = false;
  if (!renderDebt()) return;
  ctx.show('s-debt');
}

function renderDebt() {
  const data = ctx.data();
  const d = data && data.debts.find((x) => x.id === currentDebtId);
  if (!d) return false;
  const st = D.debtStatus(d, data);
  $('debt-title').textContent = d.lender;
  $('debt-late').hidden = st.lateCount === 0;
  $('debt-late').textContent = t('lateBanner', { n: st.lateCount });
  const grid = $('debt-stats');
  grid.replaceChildren();
  statRow(grid, t('statBalance'), money(st.balance));
  statRow(grid, t('statToPay'), money(st.remainingToPay));
  statRow(grid, t('statPaid'), money(st.paidTotal));
  statRow(grid, t('statPayment'), st.payment ? money(st.payment) : '—');
  statRow(grid, t('statRate'), `${d.rate.toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR')} %`);
  statRow(grid, t('statCost'), money(st.totalCost));
  $('debt-next').textContent = st.done ? t('debtDone')
    : st.next ? t(st.next.late ? 'dueLate' : 'nextDue', { date: fmtYmd(st.next.date), x: money(st.next.amount) }) : '';
  $('btn-debt-repay').hidden = st.done;
  $('btn-debt-ics').hidden = st.done || !st.schedule.some((r) => !r.paid && r.date >= D.todayYmd());

  const box = $('debt-schedule');
  box.replaceChildren();
  const rows = scheduleAll ? st.schedule : st.schedule.filter((r) => !r.paid).slice(0, 12);
  const paidCount = st.schedule.filter((r) => r.paid).length;
  if (!scheduleAll && paidCount) box.append(el('p', 'muted', t('paidCount', { n: paidCount })));
  for (const r of rows) {
    const line = el('div', 'sched-row' + (r.late ? ' late' : r.paid ? ' paid' : ''));
    line.append(el('span', null, fmtYmd(r.date)), el('span', 'amt', money(r.amount)),
      el('span', 'sched-status', r.paid ? t('schedPaid') : r.late ? t('schedLate') : t('schedNext')));
    box.append(line);
  }
  $('btn-debt-more').hidden = scheduleAll || rows.length + paidCount >= st.schedule.length;

  const reps = $('debt-repays');
  reps.replaceChildren();
  const list = D.repaymentsOf(d, data).reverse();
  if (!list.length) reps.append(el('p', 'muted', t('noRepays')));
  for (const tx of list) {
    const row = el('button', 'tx-row');
    row.type = 'button';
    const mid = el('span', 'tx-mid');
    mid.append(el('span', 'tx-title', tx.desc || t('repayOf', { name: d.lender })),
      el('span', 'tx-meta', `${accountName(data, tx.from)} · ${fmtDay(tx.date)}`));
    row.append(el('span', 'tx-icon', '↗'), mid, el('span', 'amt', '−' + money(tx.amount)));
    row.onclick = () => { api.setReturn('s-debt'); api.openTxForm('repay', tx); api.setReturn('s-debt'); };
    reps.append(row);
  }
  return true;
}

export function openRepay(preset = {}) {
  const data = ctx.data();
  let debt = preset.debt;
  if (!debt) {
    const active = data.debts.filter((d) => !D.debtStatus(d, data).done);
    if (!active.length) return;
    debt = active[0].id;
  }
  const d = data.debts.find((x) => x.id === debt);
  const st = D.debtStatus(d, data);
  api.openTxForm('repay', null, { debt, amount: preset.amount || (st.next ? Math.min(st.next.amount, st.remainingToPay) : undefined) });
}

// Fichier agenda avec toutes les échéances à venir (titre neutre, rappel 3 jours avant).
function onDebtIcs() {
  const data = ctx.data();
  const d = data.debts.find((x) => x.id === currentDebtId);
  if (!d) return;
  const st = D.debtStatus(d, data);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sika//v0.6//FR', 'CALSCALE:GREGORIAN'];
  for (const r of st.schedule) {
    if (r.paid || r.date < D.todayYmd()) continue;
    const day = r.date.replace(/-/g, '');
    const uid = `${d.id}-${day}@sika`;
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${day}T090000`, `DTEND:${day}T091500`,
      `SUMMARY:${t('calDueTitle')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${t('calDue')}`, 'TRIGGER:-P3D', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR', '');
  ctx.download(new File([lines.join('\r\n')], 'echeances.ics', { type: 'text/calendar' }));
}

// ---------- Formulaire de dette ----------

function renderDebtChips() {
  renderChips($('debt-origins'), [{ id: 'account', label: t('originAccount') }, { id: 'existing', label: t('originExisting') }], debtOrigin,
    (id) => { debtOrigin = id; renderDebtChips(); syncDebtForm(); });
  renderChips($('debt-modes'), [{ id: 'auto', label: t('modeAuto') }, { id: 'manual', label: t('modeManual') }], debtMode,
    (id) => { debtMode = id; renderDebtChips(); syncDebtForm(); });
}

function syncDebtForm() {
  $('debt-account-wrap').hidden = debtOrigin !== 'account';
  $('debt-principal-label').textContent = t(debtOrigin === 'account' ? 'principalBorrowed' : 'principalRemaining');
  $('debt-start-label').textContent = t(debtOrigin === 'account' ? 'loanDateLabel' : 'startDateLabel');
  $('debt-rows-wrap').hidden = debtMode !== 'manual';
  if (debtMode === 'manual' && !$('debt-rows').children.length) addRowEl();
  updateDebtPreview();
}

function addRowEl(date = '', amount = '') {
  const row = el('div', 'debt-row');
  const di = el('input');
  di.type = 'date';
  di.value = date;
  di.setAttribute('aria-label', t('dateLabel'));
  const ai = el('input');
  ai.type = 'text';
  ai.inputMode = 'numeric';
  ai.placeholder = '0';
  ai.value = amount;
  ai.setAttribute('aria-label', t('amountLabel'));
  const rm = el('button', 'link', '✕');
  rm.type = 'button';
  rm.setAttribute('aria-label', t('removeRow'));
  rm.onclick = () => { row.remove(); updateDebtPreview(); };
  for (const x of [di, ai]) x.addEventListener('input', updateDebtPreview);
  row.append(di, ai, rm);
  $('debt-rows').append(row);
}

function readDebtForm() {
  const principal = L.parseAmount($('debt-principal').value);
  const rate = $('debt-rate').value.trim() === '' ? 0 : parseDecimal($('debt-rate').value);
  const months = /^\d{1,3}$/.test($('debt-months').value.trim()) ? Number($('debt-months').value.trim()) : null;
  const start = $('debt-start').value;
  const rows = [...$('debt-rows').children].map((r) => {
    const [di, ai] = r.querySelectorAll('input');
    return { date: di.value, amount: L.parseAmount(ai.value), raw: ai.value.trim() };
  }).filter((r) => r.date || r.raw).map(({ date, amount }) => ({ date, amount }));
  return { principal, rate, months, start, rows };
}

function updateDebtPreview() {
  const f = readDebtForm();
  const box = $('debt-preview');
  if (debtMode === 'auto' && f.principal && f.rate !== null && f.months && f.months <= 600 && L.isDay(f.start)) {
    const rows = D.scheduleOf({ principal: f.principal, rate: f.rate, months: f.months, start: f.start, mode: 'auto' });
    const total = rows.reduce((s, r) => s + r.amount, 0);
    box.textContent = t('debtPreview', { m: money(D.monthlyPayment(f.principal, f.rate, f.months)), c: money(total - f.principal) });
  } else if (debtMode === 'manual' && f.rows.length && f.rows.every((r) => r.amount)) {
    const total = f.rows.reduce((s, r) => s + r.amount, 0);
    box.textContent = t('debtPreviewManual', { n: f.rows.length, x: money(total) });
  } else box.textContent = '';
  box.hidden = !box.textContent;
}

export function openDebtForm(d = null) {
  const data = ctx.data();
  debtEditing = d;
  $('debt-form-title').textContent = t(d ? 'editDebt' : 'addDebt');
  $('debt-lender').value = d ? d.lender : '';
  debtOrigin = d ? (d.viaAccount ? 'account' : 'existing') : 'account';
  debtMode = d ? d.mode : 'auto';
  $('debt-origin-wrap').hidden = Boolean(d); // l'origine ne change plus après création
  const loan = d && data.tx.find((x) => x.type === 'loan' && x.debt === d.id);
  const sel = $('debt-account');
  sel.replaceChildren();
  for (const a of data.accounts) {
    if (a.archived && !(loan && loan.to === a.id)) continue;
    const o = el('option', null, a.name);
    o.value = a.id;
    sel.append(o);
  }
  if (loan) sel.value = loan.to;
  $('debt-principal').value = d ? L.formatAmount(d.principal) : '';
  $('debt-rate').value = d ? String(d.rate).replace('.', ',') : '';
  $('debt-months').value = d ? String(d.months) : '';
  $('debt-start').value = d ? d.start : todayStr();
  $('debt-start').max = todayStr();
  $('debt-rows').replaceChildren();
  if (d && d.mode === 'manual') for (const r of d.rows) addRowEl(r.date, L.formatAmount(r.amount));
  $('debt-err').textContent = '';
  $('btn-debt-delete').hidden = !d;
  renderDebtChips();
  syncDebtForm();
  ctx.show('s-debt-form');
  formSnapshot = snapshot('s-debt-form');
  if (!d) $('debt-lender').focus();
}

function fillRowsFromCalc() {
  const f = readDebtForm();
  if (!f.principal || f.rate === null || !f.months || !L.isDay(f.start)) { $('debt-err').textContent = t('errDebtFields'); return; }
  $('debt-rows').replaceChildren();
  for (const r of D.scheduleOf({ principal: f.principal, rate: f.rate, months: f.months, start: f.start, mode: 'auto' })) {
    addRowEl(r.date, L.formatAmount(r.amount));
  }
  updateDebtPreview();
}

async function onDebtSave() {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const err = (k) => { $('debt-err').textContent = t(k); };
  const lender = $('debt-lender').value.trim();
  if (!lender) return err('errLender');
  const f = readDebtForm();
  if (!f.principal) return err('errAmount');
  if (f.rate === null || f.rate > 100) return err('errRate');
  if (debtMode === 'manual') f.months = f.rows.length || f.months; // la durée = nombre d'échéances
  if (!f.months || f.months < 1 || f.months > 600) return err('errMonths');
  if (!L.isDay(f.start) || f.start > todayStr()) return err('errDate');
  if (debtMode === 'manual' && (!f.rows.length || f.rows.some((r) => !L.isDay(r.date) || !r.amount))) return err('errRows');
  const accountId = $('debt-account').value;
  if (debtOrigin === 'account' && !accountId) return err('errAccount');
  if (!debtEditing && data.debts.length >= L.LIMITS.debts) return err('errTooManyDebts');
  if (debtOrigin === 'account' && !data.tx.some((x) => x.type === 'loan' && debtEditing && x.debt === debtEditing.id)
    && data.tx.length >= L.LIMITS.tx) return err('errTooManyTx');

  let clean;
  try {
    clean = L.cleanDebt({
      id: debtEditing ? debtEditing.id : L.newId(), lender, principal: f.principal, rate: f.rate, months: f.months,
      start: f.start, mode: debtMode, rows: debtMode === 'manual' ? f.rows : undefined, viaAccount: debtOrigin === 'account',
    });
  } catch { return err('errGeneric'); }

  const beforeDebts = data.debts.slice();
  const beforeTx = data.tx.slice();
  const i = data.debts.findIndex((x) => x.id === clean.id);
  if (i >= 0) data.debts[i] = clean; else data.debts.push(clean);
  // Prêt reçu : l'argent arrive sur le compte (une seule opération liée à la dette).
  if (clean.viaAccount) {
    const j = data.tx.findIndex((x) => x.type === 'loan' && x.debt === clean.id);
    const old = j >= 0 ? data.tx[j] : null;
    const loan = {
      id: old ? old.id : L.newId(), type: 'loan', to: accountId, amount: clean.principal, debt: clean.id, desc: '',
      date: old && old.date.slice(0, 10) === clean.start ? old.date : isoFromDay(clean.start),
    };
    let cleanLoan;
    try { cleanLoan = L.cleanTx(loan, L.refsOf(data)); } catch { data.debts = beforeDebts; return err('errGeneric'); }
    if (j >= 0) data.tx[j] = cleanLoan; else data.tx.push(cleanLoan);
  }
  if (!(await ctx.save())) { data.debts = beforeDebts; data.tx = beforeTx; return err('errGeneric'); }
  if (!ctx.data()) return;
  debtEditing = null;
  openDebt(clean.id);
}

async function onDebtDelete() {
  if (!debtEditing || ctx.isBusy()) return;
  const data = ctx.data();
  const target = debtEditing;
  if (data.tx.some((x) => x.type === 'repay' && x.debt === target.id)) { $('debt-err').textContent = t('errDebtHasRepays'); return; }
  if (!(await ctx.ask(t('deleteDebtConfirm', { name: target.lender })))) return;
  if (ctx.data() !== data) return;
  const beforeDebts = data.debts.slice();
  const beforeTx = data.tx.slice();
  data.debts = data.debts.filter((x) => x.id !== target.id);
  data.tx = data.tx.filter((x) => !(x.type === 'loan' && x.debt === target.id));
  if (!(await ctx.save())) { data.debts = beforeDebts; data.tx = beforeTx; $('debt-err').textContent = t('errGeneric'); return; }
  if (!ctx.data()) return;
  debtEditing = null;
  api.openTab('s-debts');
}

// ---------- Onglet Investir ----------

export function renderAssets() {
  const data = ctx.data();
  let value = 0;
  let cost = 0;
  const groups = $('assets-groups');
  groups.replaceChildren();
  const open = data.assets.filter((a) => !a.closed);
  for (const a of open) { const s = A.assetStatus(a, data); value += s.value; cost += s.cost; }
  $('assets-total').textContent = money(value);
  $('assets-gain').textContent = open.length ? t('costGain', { c: money(cost), g: signed(value - cost), p: pct(cost ? (value - cost) / cost : null) }) : '';
  if (!data.assets.length) groups.append(el('p', 'muted card', t('noAssets')));
  for (const cat of L.ASSET_CATEGORIES) {
    const list = open.filter((a) => a.category === cat);
    if (!list.length) continue;
    const card = el('div', 'card');
    card.append(el('h2', null, t('acat_' + cat)));
    for (const a of list) card.append(assetRow(a, A.assetStatus(a, data)));
    groups.append(card);
  }
  const closed = data.assets.filter((a) => a.closed);
  if (closed.length) {
    const card = el('div', 'card archived');
    card.append(el('h2', null, t('assetsClosed')));
    for (const a of closed) card.append(assetRow(a, A.assetStatus(a, data)));
    groups.append(card);
  }
}

function assetRow(a, s) {
  const row = el('button', 'acc-row');
  row.type = 'button';
  const name = el('span', 'acc-name');
  const mid = el('span', 'tx-mid');
  mid.append(el('span', 'tx-title', a.name), el('span', 'tx-meta' + (s.gain < 0 ? ' negtxt' : ''), pct(s.gainPct)));
  name.append(avatar(a.name, 'asset-' + a.category), mid);
  row.append(name, el('span', 'amt', money(s.value)));
  row.onclick = () => openAsset(a.id);
  return row;
}

// ---------- Un actif ----------

export function openAsset(id) {
  currentAssetId = id;
  valueCurrency = 'XOF';
  $('asset-new-value').value = '';
  $('asset-value-msg').textContent = '';
  if (!renderAsset()) return;
  ctx.show('s-asset');
}

function renderAsset() {
  const data = ctx.data();
  const a = data && data.assets.find((x) => x.id === currentAssetId);
  if (!a) return false;
  const s = A.assetStatus(a, data);
  $('asset-title').textContent = a.name;
  const tags = [t('acat_' + a.category)];
  if (s.estimate) tags.push(t('tagEstimate'));
  if (s.lastValueDate) tags.push(t('tagUpdated', { date: fmtDay(s.lastValueDate) }));
  if (s.stale) tags.push(t('tagStale'));
  $('asset-tags').textContent = tags.join(' · ');
  $('asset-value').textContent = money(s.value);
  $('asset-gain').textContent = t('gainLine', { g: signed(s.gain), p: pct(s.gainPct) });
  $('asset-gain').classList.toggle('negtxt', s.gain < 0);
  $('asset-spark').replaceChildren(sparkline(s.points));
  const grid = $('asset-stats');
  grid.replaceChildren();
  statRow(grid, t('statCostBasis'), money(s.cost));
  statRow(grid, t('statRealized'), signed(s.realized));
  statRow(grid, t('statAssetIncome'), money(s.income));
  const fx = FX.cleanFx(data.fx);
  const cur = [{ id: 'XOF', label: 'FCFA' }, { id: 'EUR', label: '€' }];
  if (fx) cur.push({ id: 'GBP', label: '£' });
  if (!cur.some((c) => c.id === valueCurrency)) valueCurrency = 'XOF';
  const renderCur = () => renderChips($('asset-currencies'), cur, valueCurrency, (id) => { valueCurrency = id; renderCur(); });
  renderCur();
  $('btn-asset-sell').hidden = s.value <= 0 && s.cost <= 0;

  const box = $('asset-events');
  box.replaceChildren();
  const events = A.assetEvents(a, data).reverse();
  if (!events.length) box.append(el('p', 'muted', t('noEvents')));
  for (const e of events) {
    const row = el(e.tx ? 'button' : 'div', 'tx-row');
    if (e.tx) row.type = 'button';
    const mid = el('span', 'tx-mid');
    const label = e.kind === 'value' ? t('evValue') : e.kind === 'buy' ? t('evBuy') : e.kind === 'sell'
      ? t('evSell', { pct: (e.shareBp / 100).toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR') }) : t('evIncome');
    mid.append(el('span', 'tx-title', label), el('span', 'tx-meta', fmtDay(e.date)));
    const amount = e.kind === 'value' ? money(e.value) : (e.kind === 'buy' ? '−' : '+') + money(e.amount);
    row.append(el('span', 'tx-icon', e.kind === 'value' ? '✎' : e.kind === 'buy' ? '◆' : e.kind === 'sell' ? '◇' : '＋'), mid,
      el('span', 'amt' + (e.kind === 'income' ? ' in' : ''), amount));
    if (e.tx) row.onclick = () => { api.setReturn('s-asset'); api.openTxForm(e.tx.type, e.tx); api.setReturn('s-asset'); };
    box.append(row);
  }
  return true;
}

// Nouvelle valeur saisie en FCFA, € ou £ -> enregistrée en FCFA.
async function onAssetValue() {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const a = data.assets.find((x) => x.id === currentAssetId);
  const raw = $('asset-new-value').value;
  let value = null;
  if (valueCurrency === 'XOF') value = L.parseAmount(raw);
  else {
    const n = parseDecimal(raw.replace(/\s/g, ''));
    const fx = FX.cleanFx(data.fx);
    if (n !== null && n > 0) {
      const eur = valueCurrency === 'EUR' ? n : fx ? n / fx.rate : null;
      if (eur !== null) value = Math.round(eur * FX.XOF_PER_EUR);
    }
  }
  if (!value || value > L.MAX_AMOUNT) { $('asset-value-msg').textContent = t('errAmount'); return; }
  if (a.values.length >= L.LIMITS.values) { $('asset-value-msg').textContent = t('errTooManyValues'); return; }
  const before = a.values.slice();
  a.values.push({ date: new Date().toISOString(), value });
  try { Object.assign(a, L.cleanAsset(a)); } catch { a.values = before; $('asset-value-msg').textContent = t('errGeneric'); return; }
  if (!(await ctx.save())) { a.values = before; $('asset-value-msg').textContent = t('errGeneric'); return; }
  if (!ctx.data()) return;
  $('asset-new-value').value = '';
  $('asset-value-msg').textContent = '';
  renderAsset();
}

export function openBuy(preset = {}) {
  const data = ctx.data();
  if (!data.assets.some((a) => !a.closed)) { openAssetForm(); return; }
  api.openTxForm('buy', null, preset);
}

// ---------- Formulaire d'actif ----------

function renderAssetChips() {
  renderChips($('asset-cats'), L.ASSET_CATEGORIES.map((c) => ({ id: c, label: t('acat_' + c) })), assetCategory,
    (id) => { assetCategory = id; renderAssetChips(); });
  renderChips($('asset-origins'), [{ id: 'buy', label: t('originBuy') }, { id: 'own', label: t('originOwn') }], assetOrigin,
    (id) => { assetOrigin = id; renderAssetChips(); syncAssetForm(); });
}

function syncAssetForm() {
  $('asset-buy-wrap').hidden = Boolean(assetEditing) || assetOrigin !== 'buy';
  $('asset-own-wrap').hidden = Boolean(assetEditing) || assetOrigin !== 'own';
}

export function openAssetForm(a = null) {
  const data = ctx.data();
  assetEditing = a;
  $('asset-form-title').textContent = t(a ? 'editAsset' : 'addAsset');
  $('asset-name').value = a ? a.name : '';
  assetCategory = a ? a.category : 'stocks';
  assetOrigin = 'buy';
  $('asset-origin-wrap').hidden = Boolean(a);
  $('asset-closed-wrap').hidden = !a;
  $('asset-closed').checked = a ? a.closed : false;
  const sel = $('asset-account');
  sel.replaceChildren();
  for (const acc of data.accounts) {
    if (acc.archived) continue;
    const o = el('option', null, acc.name);
    o.value = acc.id;
    sel.append(o);
  }
  for (const id of ['asset-buy-amount', 'asset-cost', 'asset-value-now']) $(id).value = '';
  $('asset-err').textContent = '';
  $('btn-asset-delete').hidden = !a;
  renderAssetChips();
  syncAssetForm();
  ctx.show('s-asset-form');
  formSnapshot = snapshot('s-asset-form');
  if (!a) $('asset-name').focus();
}

async function onAssetSave() {
  if (ctx.isBusy()) return;
  const data = ctx.data();
  const err = (k) => { $('asset-err').textContent = t(k); };
  const name = $('asset-name').value.trim();
  if (!name) return err('errAssetName');
  const beforeAssets = data.assets.map((x) => ({ ...x, values: x.values.slice() }));
  const beforeTx = data.tx.slice();
  let id;
  if (assetEditing) {
    id = assetEditing.id;
    const cur = data.assets.find((x) => x.id === id);
    let clean;
    try { clean = L.cleanAsset({ ...cur, name, category: assetCategory, closed: $('asset-closed').checked }); } catch { return err('errGeneric'); }
    Object.assign(cur, clean);
  } else {
    if (data.assets.length >= L.LIMITS.assets) return err('errTooManyAssets');
    if (assetOrigin === 'buy' && data.tx.length >= L.LIMITS.tx) return err('errTooManyTx');
    id = L.newId();
    if (assetOrigin === 'buy') {
      const amount = L.parseAmount($('asset-buy-amount').value);
      const from = $('asset-account').value;
      if (!amount) return err('errAmount');
      if (!from) return err('errAccount');
      data.assets.push(L.cleanAsset({ id, name, category: assetCategory, initialCost: 0, values: [], closed: false }));
      try {
        data.tx.push(L.cleanTx({ id: L.newId(), type: 'buy', from, amount, asset: id, date: new Date().toISOString(), desc: '' }, L.refsOf(data)));
      } catch { data.assets = beforeAssets; return err('errGeneric'); }
    } else {
      const costRaw = $('asset-cost').value.trim();
      const cost = costRaw === '' ? 0 : L.parseAmount(costRaw);
      const valueRaw = $('asset-value-now').value.trim();
      const value = valueRaw === '' ? null : L.parseAmount(valueRaw);
      if (cost === null || (valueRaw !== '' && value === null)) return err('errAmount');
      if (!cost && value === null) return err('errAssetOwn');
      data.assets.push(L.cleanAsset({
        id, name, category: assetCategory, initialCost: cost, closed: false,
        values: value !== null ? [{ date: new Date().toISOString(), value }] : [],
      }));
    }
  }
  if (!(await ctx.save())) { data.assets = beforeAssets; data.tx = beforeTx; return err('errGeneric'); }
  if (!ctx.data()) return;
  assetEditing = null;
  openAsset(id);
}

async function onAssetDelete() {
  if (!assetEditing || ctx.isBusy()) return;
  const data = ctx.data();
  const target = assetEditing;
  if (data.tx.some((x) => x.asset === target.id)) { $('asset-err').textContent = t('errAssetHasTx'); return; }
  if (!(await ctx.ask(t('deleteAssetConfirm', { name: target.name })))) return;
  if (ctx.data() !== data) return;
  const before = data.assets.slice();
  data.assets = data.assets.filter((x) => x.id !== target.id);
  if (!(await ctx.save())) { data.assets = before; $('asset-err').textContent = t('errGeneric'); return; }
  if (!ctx.data()) return;
  assetEditing = null;
  api.openTab('s-assets');
}

// ---------- Navigation ----------

// État d'un formulaire, pour savoir si une saisie serait perdue.
function snapshot(id) {
  const ids = id === 's-debt-form'
    ? ['debt-lender', 'debt-account', 'debt-principal', 'debt-rate', 'debt-months', 'debt-start']
    : ['asset-name', 'asset-account', 'asset-buy-amount', 'asset-cost', 'asset-value-now', 'asset-closed'];
  const vals = ids.map((x) => ($(x).type === 'checkbox' ? $(x).checked : $(x).value));
  const rows = [...$('debt-rows').querySelectorAll('input')].map((x) => x.value);
  return JSON.stringify([vals, rows, debtOrigin, debtMode, assetCategory, assetOrigin]);
}

// Revenir sur l'écran de détail après un formulaire (s'il existe encore).
export function reopenDetail(id) {
  const data = ctx.data();
  if (!data) return false;
  if (id === 's-debt' && data.debts.some((d) => d.id === currentDebtId)) { renderDebt(); ctx.show('s-debt'); return true; }
  if (id === 's-asset' && data.assets.some((a) => a.id === currentAssetId)) { renderAsset(); ctx.show('s-asset'); return true; }
  return false;
}

export const SCREENS = ['s-debt', 's-asset', 's-debt-form', 's-asset-form'];

function closeForm(id) {
  if (id === 's-debt-form') {
    const wasEditing = debtEditing;
    debtEditing = null;
    if (!(wasEditing && reopenDetail('s-debt'))) api.openTab('s-debts');
  } else {
    const wasEditing = assetEditing;
    assetEditing = null;
    if (!(wasEditing && reopenDetail('s-asset'))) api.openTab('s-assets');
  }
}

// Bouton retour (Android ou "Annuler"). Renvoie true si l'écran est quitté.
export async function back(id) {
  if (id === 's-debt') { api.openTab('s-debts'); return true; }
  if (id === 's-asset') { api.openTab('s-assets'); return true; }
  if (snapshot(id) !== formSnapshot) {
    const data = ctx.data();
    if (!(await ctx.ask(t('discardConfirm')))) return false;
    if (ctx.data() !== data) return true; // verrouillé pendant la question
  }
  closeForm(id);
  return true;
}

// Au verrouillage : effacer tout ce qui montre de l'argent.
export function clearFinance() {
  for (const id of ['debts-total', 'debts-topay', 'debts-next', 'debt-title', 'debt-next', 'assets-total', 'assets-gain',
    'asset-title', 'asset-tags', 'asset-value', 'asset-gain', 'worth-assets', 'worth-debts', 'worth-net', 'debt-preview',
    'strategy-priority', 'strategy-suggest', 'btn-strategy-pay', 'home-late', 'debts-late', 'debt-late']) $(id).textContent = '';
  for (const id of ['debts-list', 'debts-done', 'debt-stats', 'debt-schedule', 'debt-repays', 'strategy-result',
    'assets-groups', 'asset-stats', 'asset-events', 'asset-spark', 'debt-rows', 'debt-account', 'asset-account',
    'strategy-methods', 'tx-debt', 'tx-asset']) $(id).replaceChildren();
  for (const id of ['debt-lender', 'debt-principal', 'debt-rate', 'debt-months', 'asset-name', 'asset-buy-amount',
    'asset-cost', 'asset-value-now', 'asset-new-value', 'strategy-extra']) $(id).value = '';
  currentDebtId = null;
  currentAssetId = null;
  debtEditing = null;
  assetEditing = null;
  strategyExtra = 0;
}

export function initFinance(context, screensApi) {
  ctx = context;
  api = screensApi;
  $('btn-add-debt').onclick = () => openDebtForm();
  $('btn-debt-repay').onclick = () => { api.setReturn('s-debt'); openRepay({ debt: currentDebtId }); api.setReturn('s-debt'); };
  $('btn-debt-ics').onclick = onDebtIcs;
  $('btn-debt-edit').onclick = () => { const d = ctx.data().debts.find((x) => x.id === currentDebtId); if (d) openDebtForm(d); };
  $('btn-debt-back').onclick = () => api.openTab('s-debts');
  $('btn-debt-more').onclick = () => { scheduleAll = true; renderDebt(); };
  $('btn-debt-save').onclick = onDebtSave;
  $('btn-debt-delete').onclick = onDebtDelete;
  $('btn-debt-cancel').onclick = () => closeForm('s-debt-form');
  $('btn-debt-fill').onclick = fillRowsFromCalc;
  $('btn-debt-addrow').onclick = () => { addRowEl(); updateDebtPreview(); };
  for (const id of ['debt-principal', 'debt-rate', 'debt-months', 'debt-start']) $(id).addEventListener('input', updateDebtPreview);
  // Seulement la carte Stratégie : reconstruire la liste avalerait le toucher en cours.
  $('strategy-extra').addEventListener('change', () => { strategyExtra = L.parseAmount($('strategy-extra').value) || 0; renderStrategy(activeDebts()); });

  $('btn-add-asset').onclick = () => openAssetForm();
  $('btn-asset-value').onclick = onAssetValue;
  $('btn-asset-buy').onclick = () => { api.setReturn('s-asset'); api.openTxForm('buy', null, { asset: currentAssetId }); api.setReturn('s-asset'); };
  $('btn-asset-sell').onclick = () => { api.setReturn('s-asset'); api.openTxForm('sell', null, { asset: currentAssetId }); api.setReturn('s-asset'); };
  $('btn-asset-income').onclick = () => { api.setReturn('s-asset'); api.openTxForm('income', null, { asset: currentAssetId }); api.setReturn('s-asset'); };
  $('btn-asset-edit').onclick = () => { const a = ctx.data().assets.find((x) => x.id === currentAssetId); if (a) openAssetForm(a); };
  $('btn-asset-back').onclick = () => api.openTab('s-assets');
  $('btn-asset-save').onclick = onAssetSave;
  $('btn-asset-delete').onclick = onAssetDelete;
  $('btn-asset-cancel').onclick = () => closeForm('s-asset-form');
}
