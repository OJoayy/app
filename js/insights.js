// insights.js — les chiffres du tableau de bord (ordinateur).
// Seulement des calculs sur les données déjà vérifiées : aucun affichage ici,
// pour pouvoir tout tester facilement.

import * as L from './ledger.js';
import * as D from './debts.js';
import * as A from './assets.js';

const pad = (n) => String(n).padStart(2, '0');

// Mois local d'une date ISO : "2026-09".
export const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
// Jour local : "2026-09-26".
export const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Les N derniers mois, du plus ancien au plus récent (mois en cours compris).
export function lastMonths(n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}

// Début de la période : N mois pleins (mois en cours compris), ou tout (null).
export function periodStart(months, now = new Date()) {
  if (!months) return null;
  return new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString();
}

// Mois couverts par "tout" : du premier mouvement à aujourd'hui (au moins 1).
export function monthsSinceFirst(data, now = new Date()) {
  if (!data.tx.length) return 1;
  let first = data.tx[0].date;
  for (const t of data.tx) if (t.date < first) first = t.date;
  const f = new Date(first);
  return Math.max(1, (now.getFullYear() - f.getFullYear()) * 12 + now.getMonth() - f.getMonth() + 1);
}

// Effet d'une opération sur l'argent disponible (tous comptes confondus).
export function liquidDelta(t) {
  switch (t.type) {
    case 'income': case 'loan': case 'sell': return t.amount;
    case 'expense': return -(t.amount + (t.fee || 0));
    case 'transfer': return -(t.fee || 0);
    case 'repay': case 'buy': return -t.amount;
    default: return 0;
  }
}

const inPeriod = (t, from) => !from || t.date >= from;

// Totaux d'une période.
export function totals(data, from) {
  let income = 0; let expense = 0; let fees = 0; let repaid = 0; let invested = 0; let overBudget = 0; let count = 0;
  for (const t of data.tx) {
    if (!inPeriod(t, from)) continue;
    fees += t.fee || 0;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') { expense += t.amount; count += 1; if (t.reason) overBudget += 1; }
    else if (t.type === 'repay') repaid += t.amount;
    else if (t.type === 'buy') invested += t.amount;
  }
  const left = income - expense - fees;
  return { income, expense, fees, repaid, invested, left, overBudget, count, rate: income > 0 ? left / income : null };
}

// Revenus, dépenses et frais par mois.
export function monthly(data, keys) {
  const rows = new Map(keys.map((k) => [k, { key: k, income: 0, expense: 0, fees: 0 }]));
  for (const t of data.tx) {
    const r = rows.get(monthKey(t.date));
    if (!r) continue;
    r.fees += t.fee || 0;
    if (t.type === 'income') r.income += t.amount;
    else if (t.type === 'expense') r.expense += t.amount;
  }
  return [...rows.values()];
}

// Dépenses par humeur et par pool (frais compris dans le pool, pas dans l'humeur).
export function byMood(data, from) {
  const m = Object.fromEntries(L.MOOD_IDS.map((id) => [id, { total: 0, count: 0 }]));
  for (const t of data.tx) if (t.type === 'expense' && inPeriod(t, from)) { m[t.mood].total += t.amount; m[t.mood].count += 1; }
  return L.MOODS.map((x) => ({ id: x.id, emoji: x.emoji, ...m[x.id] }));
}

export function byPool(data, from) {
  const m = Object.fromEntries(L.POOL_IDS.map((id) => [id, 0]));
  for (const t of data.tx) if (t.type === 'expense' && inPeriod(t, from)) m[t.pool] += t.amount + (t.fee || 0);
  return L.POOLS.map((p) => ({ id: p.id, pct: p.pct, total: m[p.id] }));
}

// Argent disponible jour après jour : [{ day, value }], du début à aujourd'hui.
export function liquidTimeline(data, now = new Date()) {
  let value = 0;
  for (const a of data.accounts) value += a.start;
  const byDay = new Map();
  const today = dayKey(now.toISOString());
  for (const t of data.tx) {
    // Une date "après aujourd'hui" (horloge décalée) compte pour aujourd'hui.
    const k = dayKey(t.date) > today ? today : dayKey(t.date);
    byDay.set(k, (byDay.get(k) || 0) + liquidDelta(t));
  }
  const days = [...byDay.keys()].sort();
  const out = [];
  if (days.length) {
    // Point de départ la veille du premier mouvement.
    const d0 = new Date(days[0] + 'T12:00:00');
    d0.setDate(d0.getDate() - 1);
    out.push({ day: dayKey(d0.toISOString()), value });
  }
  for (const k of days) { value += byDay.get(k); out.push({ day: k, value }); }
  if (!out.length || out[out.length - 1].day !== today) out.push({ day: today, value });
  return out;
}

// Plus grosses dépenses de la période.
export function topExpenses(data, from, n = 8) {
  return data.tx.filter((t) => t.type === 'expense' && inPeriod(t, from))
    .sort((a, b) => (b.amount + (b.fee || 0)) - (a.amount + (a.fee || 0)) || (a.date < b.date ? 1 : -1)).slice(0, n);
}

// Frais par compte payeur (période).
export function feesByAccount(data, from) {
  const m = new Map();
  for (const t of data.tx) if (t.fee && inPeriod(t, from)) m.set(t.from, (m.get(t.from) || 0) + t.fee);
  return [...m.entries()].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total);
}

// Photo complète "maintenant" : soldes, dettes, actifs, valeur nette, envies.
export function snapshot(data, now = new Date()) {
  const b = L.computeBalances(data);
  const debts = data.debts.map((d) => ({ debt: d, st: D.debtStatus(d, data) }));
  const assets = data.assets.map((a) => ({ asset: a, st: A.assetStatus(a, data, now.getTime()) }));
  const owed = debts.reduce((s, x) => s + x.st.balance, 0);
  const assetValue = assets.filter((x) => !x.asset.closed).reduce((s, x) => s + x.st.value, 0);
  const byCategory = L.ASSET_CATEGORIES.map((c) => ({
    id: c, value: assets.filter((x) => !x.asset.closed && x.asset.category === c).reduce((s, x) => s + x.st.value, 0),
  }));
  return {
    balances: b, liquid: b.liquid, owed, assetValue, net: b.liquid + assetValue - owed,
    debts, assets, byCategory,
    lateCount: debts.reduce((s, x) => s + x.st.lateCount, 0),
  };
}
