// dashboard.js — le tableau de bord pour ordinateur.
// Il ouvre une SAUVEGARDE (fichier + phrase secrète ou clé de secours), la
// déchiffre en mémoire, et montre tout en graphiques. Il ne garde rien :
// rien n'est enregistré sur l'ordinateur, rien n'est envoyé nulle part.
// Fermer (ou 15 min sans bouger, ou quitter la page) efface tout de la mémoire.

import * as C from './crypto.js';
import * as L from './ledger.js';
import * as FX from './fx.js';
import * as I from './insights.js';
import * as G from './charts.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';

const $ = (id) => document.getElementById(id);
const h = G.h;
const MAX_FILE = 20 * 1024 * 1024;
const IDLE_MS = 15 * 60000;
const PERIODS = [3, 6, 12, 0]; // 0 = tout

let view = null;      // { data, backupAt } — seulement pendant l'affichage
let pending = null;   // { meta, box, name } — fichier lu, pas encore ouvert
let period = 6;
let busy = false;
let draws = [];       // graphiques à redessiner quand la largeur change
let epoch = 0;        // change à chaque fermeture : un déchiffrement en cours est alors abandonné
let lastActivity = 0;
let hiddenAt = 0;
const HIDDEN_MS = 5 * 60000; // onglet caché plus de 5 min -> fermé

const loc = () => (getLang() === 'en' ? 'en-GB' : 'fr-FR');
const money = (n) => `${n < 0 ? '−' : ''}${L.formatAmount(Math.abs(n))} FCFA`;
const signed = (n) => (n > 0 ? '+' : '') + money(n);
const axis = (n) => G.compact(n, getLang());
const pct = (x) => (x === null || !Number.isFinite(x) ? '—' : `${(x * 100).toLocaleString(loc(), { maximumFractionDigits: 1 })} %`);
const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(iso).toLocaleDateString(loc(), opts);
const monthLabel = (key, long = false) => new Date(`${key}-15T12:00:00`).toLocaleDateString(loc(), long ? { month: 'long', year: 'numeric' } : { month: 'short' });

// ---------- Ouvrir une sauvegarde ----------

async function onFile() {
  pending = null;
  $('d-err').textContent = '';
  const f = $('d-file').files[0];
  if (!f) return;
  if (f.size > MAX_FILE) { $('d-err').textContent = t('importTooBig'); return; }
  try {
    const obj = JSON.parse(await f.text());
    C.validateBackup(obj);
    // La date d'une sauvegarde n'est pas chiffrée : on ne l'utilise que si elle est valide.
    const created = typeof obj.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(obj.createdAt)
      && !Number.isNaN(Date.parse(obj.createdAt)) ? obj.createdAt : null;
    pending = { meta: C.cleanMeta(obj.meta), box: C.cleanBox(obj.data), createdAt: created };
  } catch {
    $('d-err').textContent = t('importBadFile');
  }
}

const mode = () => document.querySelector('input[name="d-mode"]:checked').value;

async function onOpen() {
  if (busy) return;
  $('d-err').textContent = '';
  if (!pending) { $('d-err').textContent = t($('d-file').files[0] ? 'importBadFile' : 'importNoFile'); return; }
  const secret = $('d-secret').value;
  if (!secret) return;
  busy = true;
  $('d-open-btn').disabled = true;
  $('d-open-btn').textContent = t('dbOpening');
  const p = pending;
  const start = epoch;
  try {
    const key = mode() === 'rec' ? await C.unlockWithRecovery(p.meta, secret) : await C.unlockWithPassphrase(p.meta, secret);
    const data = L.migrateAndValidate(await C.decryptData(key, p.box));
    if (start !== epoch || document.hidden) { closeView(); return; } // page quittée pendant l'ouverture
    view = { data, backupAt: p.createdAt || data.updatedAt };
    $('d-secret').value = '';
    $('d-file').value = '';
    pending = null;
    showMain();
  } catch (e) {
    $('d-err').textContent = e instanceof C.WrongSecretError ? t('wrongSecret')
      : (e instanceof C.DataError || e instanceof L.DataShapeError) ? t('errDataDamaged') : t('errGeneric');
  } finally {
    busy = false;
    $('d-open-btn').disabled = false;
    $('d-open-btn').textContent = t('dbOpen');
  }
}

// Tout effacer : données, graphiques, champs.
function closeView() {
  epoch += 1;
  view = null;
  pending = null;
  draws = [];
  $('d-grid').replaceChildren();
  $('d-when').textContent = '';
  $('d-late').textContent = '';
  $('d-late').hidden = true;
  $('d-secret').value = '';
  $('d-file').value = '';
  $('d-main').hidden = true;
  $('d-open').hidden = false;
}

// Inactivité : on compare à l'horloge réelle (un ordinateur en veille ne fait
// pas avancer les minuteries), toutes les 10 s et au retour sur l'onglet.
function touchIdle() {
  if (!view) return;
  lastActivity = Date.now();
}

function checkIdle() {
  if (view && Date.now() - lastActivity > IDLE_MS) closeView();
}

// ---------- Mise en page ----------

function card(span, title, sub) {
  const c = h('section', `card span-${span}`);
  const head = h('div', 'card-head');
  head.append(h('h2', null, title));
  if (sub) head.append(h('p', 'muted small', sub));
  c.append(head);
  return c;
}

function withTable(c, tableEl) {
  const d = h('details', 'as-table');
  d.append(h('summary', null, t('dbShowTable')), tableEl);
  c.append(d);
}

// Un graphique qui se redessine à la bonne largeur.
function chartBox(c, draw) {
  const box = h('div', 'viz');
  c.append(box);
  draws.push({ box, draw, w: 0 });
  return box;
}

function redraw(force = false) {
  for (const d of draws) {
    const w = d.box.clientWidth;
    if (!force && w === d.w) continue;
    d.w = w;
    d.draw(d.box);
  }
}

function tile(label, value, sub, cls = '') {
  const x = h('div', `tile ${cls}`);
  x.append(h('span', 'tile-label', label), h('span', 'tile-value', value));
  if (sub) x.append(h('span', 'tile-sub', sub));
  return x;
}

// ---------- Le tableau de bord ----------

function showMain() {
  $('d-open').hidden = true;
  $('d-main').hidden = false;
  lastActivity = Date.now();
  render();
}

function renderPeriods() {
  const box = $('d-periods');
  box.replaceChildren();
  for (const p of PERIODS) {
    const b = h('button', 'chip' + (p === period ? ' active' : ''), p ? t('dbMonths', { n: p }) : t('dbAll'));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(p === period));
    b.onclick = () => { period = p; render(); };
    box.append(b);
  }
}

function render() {
  if (!view) return;
  const data = view.data;
  const now = new Date();
  const from = I.periodStart(period, now);
  const nMonths = period || Math.min(I.monthsSinceFirst(data, now), 60);
  const keys = I.lastMonths(nMonths, now);
  const snap = I.snapshot(data, now);
  const tot = I.totals(data, from);
  const fx = FX.cleanFx(data.fx);
  const periodName = period ? t('dbLastMonths', { n: period }) : t('dbAllTime');

  $('d-when').textContent = t('dbBackupOf', { date: fmtDate(view.backupAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) });
  $('d-late').hidden = snap.lateCount === 0;
  $('d-late').textContent = t('lateBanner', { n: snap.lateCount });
  renderPeriods();
  draws = [];
  const grid = $('d-grid');
  grid.replaceChildren();

  // --- Le chiffre principal ---
  const hero = card(4, t('liquidTitle'));
  hero.classList.add('hero');
  hero.append(h('p', 'hero-value', money(snap.liquid)));
  const eur = FX.formatMoney(FX.toEur(snap.liquid), 'EUR', getLang());
  hero.append(h('p', 'hero-fx', fx ? `${FX.formatMoney(FX.toGbp(snap.liquid, fx), 'GBP', getLang())} · ${eur}` : eur));
  const worth = h('div', 'hero-worth');
  for (const [label, val] of [[t('worthAssets'), money(snap.assetValue)], [t('worthDebts'), (snap.owed ? '−' : '') + money(snap.owed)], [t('worthNet'), money(snap.net)]]) {
    const r = h('div', 'kv');
    r.append(h('span', null, label), h('strong', null, val));
    worth.append(r);
  }
  hero.append(worth);
  grid.append(hero);

  // --- Tuiles de la période ---
  const tiles = card(8, t('dbPeriodTitle', { p: periodName }));
  const tg = h('div', 'tiles');
  tg.append(
    tile(t('dbIncome'), money(tot.income)),
    tile(t('dbExpense'), money(tot.expense), t('dbExpenseCount', { n: tot.count })),
    tile(t('dbLeft'), signed(tot.left), tot.rate === null ? null : t('dbRate', { p: pct(tot.rate) }), tot.left < 0 ? 'neg' : ''),
    tile(t('dbFees'), money(tot.fees)),
    tile(t('dbRepaid'), money(tot.repaid)),
    tile(t('dbInvested'), money(tot.invested)),
    tile(t('dbOverBudget'), String(tot.overBudget), t('dbOverBudgetSub')),
    tile(t('dbDebtLeft'), money(snap.owed), snap.lateCount ? t('lateShort', { n: snap.lateCount }) : null, snap.lateCount ? 'neg' : ''),
  );
  tiles.append(tg);
  grid.append(tiles);

  // --- Revenus et dépenses par mois ---
  const rows = I.monthly(data, keys);
  const c1 = card(8, t('dbMonthlyTitle'), t('dbMonthlySub'));
  const series = [
    { name: t('dbIncome'), slot: 'series-1', values: rows.map((r) => r.income) },
    { name: t('dbExpense'), slot: 'series-2', values: rows.map((r) => r.expense + r.fees) },
  ];
  c1.append(G.legend(series.map((x) => ({ label: x.name, slot: x.slot }))));
  chartBox(c1, (box) => G.columns(box, {
    host: c1, labels: rows.map((r) => monthLabel(r.key)), fullLabels: rows.map((r) => monthLabel(r.key, true)),
    series, fmt: money, fmtAxis: axis, ariaLabel: t('dbMonthlyTitle'),
  }));
  withTable(c1, G.table([t('dbMonth'), t('dbIncome'), t('dbExpense'), t('dbFees'), t('dbLeft')],
    rows.map((r) => [monthLabel(r.key, true), money(r.income), money(r.expense), money(r.fees), signed(r.income - r.expense - r.fees)]), [1, 2, 3, 4]));
  grid.append(c1);

  // --- Dépenses par humeur ---
  const moods = I.byMood(data, from);
  const c2 = card(4, t('dbMoodTitle'), periodName);
  chartBox(c2, (box) => G.hbars(box, moods.map((m) => ({ label: `${m.emoji} ${t('mood' + m.id)}`, value: m.total })), { fmt: money }));
  withTable(c2, G.table([t('dbMood'), t('dbCount'), t('dbTotal')], moods.map((m) => [`${m.emoji} ${t('mood' + m.id)}`, String(m.count), money(m.total)]), [1, 2]));
  grid.append(c2);

  // --- Argent disponible dans le temps ---
  const tl = I.liquidTimeline(data, now);
  let pts = tl;
  if (from) {
    const fromDay = I.dayKey(from);
    const before = tl.filter((p) => p.day < fromDay);
    pts = tl.filter((p) => p.day >= fromDay);
    if (before.length) pts = [{ day: fromDay, value: before[before.length - 1].value }, ...pts];
  }
  const c3 = card(8, t('dbTimelineTitle'), periodName);
  const points = pts.map((p) => ({ t: Date.parse(p.day + 'T12:00:00'), value: p.value, label: fmtDate(p.day + 'T12:00:00'), short: fmtDate(p.day + 'T12:00:00', { day: 'numeric', month: 'short' }) }));
  if (points.length === 1) points.unshift({ ...points[0], t: points[0].t - 86400000 });
  chartBox(c3, (box) => G.line(box, {
    host: c3, points, slot: 'series-1', name: t('liquidTitle'), fmt: money, fmtAxis: axis, ariaLabel: t('dbTimelineTitle'),
    dateLabel: (ms) => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }),
  }));
  withTable(c3, G.table([t('dateLabel'), t('liquidTitle')], pts.slice(-60).reverse().map((p) => [fmtDate(p.day + 'T12:00:00'), money(p.value)]), [1]));
  grid.append(c3);

  // --- Pools : solde actuel ---
  const c4 = card(4, t('poolsTitle'), t('poolsTotalNote', { x: money(snap.balances.poolTotal) }));
  chartBox(c4, (box) => G.hbars(box, L.POOLS.map((p) => ({ label: `${t('pool' + p.id)} · ${p.pct} %`, value: snap.balances.pools[p.id] })), { fmt: money, diverging: true }));
  withTable(c4, G.table([t('dbPool'), t('dbShare'), t('dbBalance')], L.POOLS.map((p) => [t('pool' + p.id), `${p.pct} %`, money(snap.balances.pools[p.id])]), [1, 2]));
  grid.append(c4);

  // --- Dépenses par pool ---
  const pools = I.byPool(data, from);
  const c5 = card(4, t('dbPoolSpendTitle'), `${periodName} · ${t('dbFeesIncluded')}`);
  chartBox(c5, (box) => G.hbars(box, pools.map((p) => ({ label: t('pool' + p.id), value: p.total })), { fmt: money }));
  withTable(c5, G.table([t('dbPool'), t('dbTotal')], pools.map((p) => [t('pool' + p.id), money(p.total)]), [1]));
  grid.append(c5);

  // --- Comptes ---
  const c6 = card(4, t('dbAccountsTitle'), t('dbAccountsSub', { x: money(snap.liquid) }));
  const accRows = data.accounts.filter((a) => !a.archived || snap.balances.accounts.get(a.id) !== 0)
    .map((a) => [a.name, t('cat_' + a.category), money(snap.balances.accounts.get(a.id))]);
  c6.append(G.table([t('dbAccount'), t('dbType'), t('dbBalance')], accRows, [2]));
  grid.append(c6);

  // --- Frais ---
  const fees = I.feesByAccount(data, from);
  const nameOf = (id) => (data.accounts.find((a) => a.id === id) || {}).name || '?';
  const c7 = card(4, t('dbFeesTitle'), `${periodName} · ${money(tot.fees)}`);
  if (fees.length) {
    chartBox(c7, (box) => G.hbars(box, fees.map((f) => ({ label: nameOf(f.id), value: f.total })), { fmt: money, slot: 'series-2' }));
    withTable(c7, G.table([t('dbAccount'), t('dbTotal')], fees.map((f) => [nameOf(f.id), money(f.total)]), [1]));
  } else c7.append(h('p', 'muted', t('dbNoFees')));
  grid.append(c7);

  // --- Dettes ---
  const c8 = card(6, t('debtsTitle'), t('dbDebtsSub', { x: money(snap.owed) }));
  const open = snap.debts.filter((x) => !x.st.done);
  if (open.length) {
    c8.append(G.table([t('lenderLabel'), t('statBalance'), t('dbNext'), t('dbPaid')], open.map(({ debt, st }) => {
      const paid = st.paidTotal + st.remainingToPay ? st.paidTotal / (st.paidTotal + st.remainingToPay) : 0;
      const m = h('span', 'meter-cell');
      m.append(G.meter(paid, debt.lender), h('span', 'small', pct(paid)));
      const next = st.next ? `${fmtDate(st.next.date + 'T12:00:00')} · ${money(st.next.amount)}` : '—';
      const nextCell = h('span', st.lateCount ? 'neg' : null, st.lateCount ? `⚠ ${next}` : next);
      return [debt.lender, money(st.balance), nextCell, m];
    }), [1]));
  } else c8.append(h('p', 'muted', t('noDebts')));
  grid.append(c8);

  // --- Investissements ---
  const c9 = card(6, t('assetsTitle'), t('dbAssetsSub', { x: money(snap.assetValue) }));
  const slots = ['series-1', 'series-2', 'series-3', 'series-4'];
  const openAssets = snap.assets.filter((x) => !x.asset.closed);
  if (openAssets.length) {
    const sb = h('div', 'viz');
    G.stack(sb, snap.byCategory.map((c, i) => ({ label: t('acat_' + c.id), value: c.value, slot: slots[i] })), money);
    c9.append(sb);
    c9.append(G.table([t('assetNameLabel'), t('dbType'), t('dbValue'), t('dbGain')], openAssets.map(({ asset, st }) => [
      asset.name + (st.estimate ? ` (${t('tagEstimate')})` : ''), t('acat_' + asset.category), money(st.value),
      h('span', st.gain < 0 ? 'neg' : 'pos', `${signed(st.gain)} · ${pct(st.gainPct)}`),
    ]), [2, 3]));
  } else c9.append(h('p', 'muted', t('noAssets')));
  grid.append(c9);

  // --- Plus grosses dépenses ---
  const top = I.topExpenses(data, from, 10);
  const c10 = card(6, t('dbTopTitle'), periodName);
  if (top.length) {
    c10.append(G.table([t('dateLabel'), t('dbWhat'), t('dbPool'), t('dbAmount')], top.map((x) => {
      const mood = L.MOODS.find((m) => m.id === x.mood);
      const what = h('span', null, `${mood.emoji} ${x.desc || t('noDesc')}`);
      if (x.reason) { what.append(h('span', 'neg small block', `⚠ ${x.reason}`)); }
      return [fmtDate(x.date, { day: 'numeric', month: 'short' }), what, t('pool' + x.pool), money(x.amount + (x.fee || 0))];
    }), [3]));
  } else c10.append(h('p', 'muted', t('emptyExpenses')));
  grid.append(c10);

  // --- Mes envies ---
  const c11 = card(6, t('wishesTitle'));
  const wishes = data.wishes.filter((w) => !w.done);
  const toXof = (w) => (w.amount === null ? null : w.currency === 'XOF' ? w.amount
    : w.currency === 'EUR' ? Math.round(w.amount * FX.XOF_PER_EUR) : fx ? Math.round((w.amount / fx.rate) * FX.XOF_PER_EUR) : null);
  const wTotal = wishes.reduce((a, w) => a + (toXof(w) || 0), 0);
  c11.querySelector('.card-head').append(h('p', 'muted small', t('dbWishesSub', { n: wishes.length, x: money(wTotal), d: data.wishes.length - wishes.length })));
  if (wishes.length) {
    const sym = { XOF: 'FCFA', EUR: '€', GBP: '£' };
    c11.append(G.table([t('wishNameLabel'), t('dbPrice'), 'FCFA'], wishes.map((w) => {
      const name = h('span', null, w.name);
      if (w.note) name.append(h('span', 'muted small block', w.note));
      const x = toXof(w);
      return [name, w.amount === null ? '—' : `${L.formatAmount(w.amount)} ${sym[w.currency]}`, x === null ? '—' : money(x)];
    }), [1, 2]));
  } else c11.append(h('p', 'muted', t('noWishes')));
  grid.append(c11);

  redraw(true);
}

// ---------- Démarrage ----------

function setLanguage(l) {
  setLang(l);
  applyI18n(document);
  document.title = `SIKA · ${t('dbTitle')}`;
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.classList.toggle('active', b.dataset.lang === l);
    b.setAttribute('aria-pressed', String(b.dataset.lang === l));
  }
  $('d-secret-label').textContent = t(mode() === 'rec' ? 'recKeyLabel' : 'passLabel');
  if (view) render();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let url = './sw.js';
  if (window.trustedTypes && trustedTypes.createPolicy) {
    const policy = trustedTypes.createPolicy('fp-sw', {
      createScriptURL: (u) => { if (u === './sw.js') return u; throw new Error('blocked'); },
    });
    url = policy.createScriptURL('./sw.js');
  }
  navigator.serviceWorker.register(url).catch(() => {});
}

function init() {
  const lang = (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  setLanguage(lang);
  for (const b of document.querySelectorAll('[data-lang]')) b.onclick = () => setLanguage(b.dataset.lang);
  for (const r of document.querySelectorAll('input[name="d-mode"]')) {
    r.onchange = () => { $('d-secret-label').textContent = t(mode() === 'rec' ? 'recKeyLabel' : 'passLabel'); $('d-secret').value = ''; };
  }
  $('d-file').addEventListener('change', onFile);
  $('d-open-btn').onclick = onOpen;
  $('d-secret').addEventListener('keydown', (e) => { if (e.key === 'Enter') onOpen(); });
  $('d-close').onclick = closeView;
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, touchIdle, { passive: true });
  window.addEventListener('pagehide', closeView);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > HIDDEN_MS) closeView();
    hiddenAt = 0;
    checkIdle();
  });
  window.addEventListener('focus', checkIdle);
  setInterval(checkIdle, 10000);
  let raf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => redraw()); }).observe(document.body);
  registerServiceWorker();
}

init();
