// ledger.js — les règles d'argent (spec, sections 4 et 5).
// Pas d'écran ici : seulement des calculs, faciles à tester.
// Tous les montants sont des FCFA entiers (le FCFA n'a pas de centimes).

import { cleanFx } from './fx.js';

export const DATA_SCHEMA = 4; // v3 : dettes et investissements ; v4 : liste d'envies
// Garde-fous : 100 milliards FCFA par montant, 50 000 opérations.
// Ainsi, même le plus grand total reste un nombre exact en JavaScript.
export const MAX_AMOUNT = 100_000_000_000;

// Pools : ordre fixe, parts fixes (en %).
export const POOLS = [
  { id: 'NEC', pct: 50 },
  { id: 'PLA', pct: 10 },
  { id: 'DET', pct: 10 },
  { id: 'INV', pct: 10 },
  { id: 'EDU', pct: 10 },
  { id: 'DON', pct: 10 },
];
export const POOL_IDS = POOLS.map((p) => p.id);

// Humeurs du brief.
export const MOODS = [
  { id: 'IMP', emoji: '⚡' },
  { id: 'STR', emoji: '😰' },
  { id: 'REF', emoji: '🧘' },
  { id: 'REC', emoji: '🥳' },
  { id: 'ROU', emoji: '📅' },
];
export const MOOD_IDS = MOODS.map((m) => m.id);

export const CATEGORIES = ['mobile', 'cash', 'bank'];
// income = revenu, expense = dépense, transfer = transfert,
// loan = prêt reçu, repay = remboursement, buy = achat d'actif, sell = vente d'actif.
export const TX_TYPES = ['income', 'expense', 'transfer', 'loan', 'repay', 'buy', 'sell'];
export const INCOME_SOURCES = ['client', 'asset', 'other'];
export const ASSET_CATEGORIES = ['land', 'stocks', 'crypto', 'savings'];
export const DEBT_METHODS = ['avalanche', 'snowball'];

export const LIMITS = { name: 40, desc: 140, reason: 280, accounts: 50, tx: 50_000, debts: 50, assets: 100, rows: 600, values: 2000, wishes: 300, note: 280 };
export const WISH_CURRENCIES = ['XOF', 'EUR', 'GBP'];

// ---------- Outils ----------

export function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

// "12500", "12 500", "12.500", "12 500 FCFA" -> 12500. Renvoie null si invalide.
// Les séparateurs ne sont acceptés que par groupes de 3 chiffres :
// "2.50" ou "12 5" sont refusés (pas de centimes en FCFA).
export function parseAmount(input) {
  const s = String(input).trim().replace(/\s*(f\s?cfa|f)$/i, '');
  if (!/^\d{1,12}$/.test(s) && !/^\d{1,3}([ .  ]\d{3})+$/.test(s)) return null;
  const n = Number(s.replace(/\D/g, ''));
  return n > 0 && n <= MAX_AMOUNT ? n : null;
}

// 12500 -> "12 500" (espaces normaux, lisibles partout).
export function formatAmount(n) {
  const sign = n < 0 ? '−' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Répartit un revenu : chaque part à 10 % est arrondie vers le bas,
// la Nécessité reçoit le reste, pour que la somme tombe juste.
export function splitIncome(amount) {
  const out = {};
  let rest = amount;
  for (const p of POOLS) {
    if (p.id === 'NEC') continue;
    out[p.id] = Math.floor((amount * p.pct) / 100);
    rest -= out[p.id];
  }
  out.NEC = rest;
  return out;
}

// ---------- Soldes ----------

// Calcule tout à partir du registre. Rien n'est stocké en double.
// "skipTxId" : ignorer une opération (utile quand on la modifie).
export function computeBalances(data, skipTxId = null) {
  const accounts = new Map();
  const pools = Object.fromEntries(POOL_IDS.map((id) => [id, 0]));

  for (const a of data.accounts) {
    accounts.set(a.id, a.start);
    if (a.splitStart && a.start > 0) {
      const s = splitIncome(a.start);
      for (const id of POOL_IDS) pools[id] += s[id];
    }
  }
  for (const tx of data.tx) {
    if (tx.id === skipTxId) continue;
    if (tx.type === 'income') {
      accounts.set(tx.to, accounts.get(tx.to) + tx.amount);
      const s = splitIncome(tx.amount);
      for (const id of POOL_IDS) pools[id] += s[id];
    } else if (tx.type === 'expense') {
      // Les frais sortent du même compte et du même pool que la dépense.
      const fee = tx.fee || 0;
      accounts.set(tx.from, accounts.get(tx.from) - tx.amount - fee);
      pools[tx.pool] -= tx.amount + fee;
    } else if (tx.type === 'transfer') {
      // Un transfert ne change pas les pools ; ses frais, si, : ils sortent de Nécessité.
      const fee = tx.fee || 0;
      accounts.set(tx.from, accounts.get(tx.from) - tx.amount - fee);
      accounts.set(tx.to, accounts.get(tx.to) + tx.amount);
      pools.NEC -= fee;
    } else if (tx.type === 'loan') {
      // Un prêt n'est PAS un revenu : l'argent entre, les pools ne bougent pas.
      accounts.set(tx.to, accounts.get(tx.to) + tx.amount);
    } else if (tx.type === 'repay') {
      accounts.set(tx.from, accounts.get(tx.from) - tx.amount);
      pools.DET -= tx.amount;
    } else if (tx.type === 'buy') {
      accounts.set(tx.from, accounts.get(tx.from) - tx.amount);
      pools.INV -= tx.amount;
    } else if (tx.type === 'sell') {
      // L'argent d'une vente retourne dans le pool Investir (ce n'est pas un revenu).
      accounts.set(tx.to, accounts.get(tx.to) + tx.amount);
      pools.INV += tx.amount;
    }
  }
  let liquid = 0;
  for (const v of accounts.values()) liquid += v;
  let poolTotal = 0;
  for (const id of POOL_IDS) poolTotal += pools[id];
  return { accounts, pools, liquid, poolTotal };
}

// Frais d'une dépense ou d'un transfert : un pourcentage du montant, arrondi au FCFA.
// feeBp = centièmes de % (150 = 1,5 %). Toujours payés par le compte qui paie ou envoie.
export const MAX_FEE_BP = 10000; // 100 %
export function feeOf(amount, feeBp) {
  return feeBp ? Math.round((amount * feeBp) / 10000) : 0;
}

// Go / No-Go : combien il manque au pool (0 = ça passe).
export function poolShortfall(balances, poolId, amount) {
  return Math.max(0, amount - balances.pools[poolId]);
}

// ---------- Contrôle des données ----------

export class DataShapeError extends Error {
  constructor(msg) { super(msg); this.name = 'DataShapeError'; }
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x, max) => typeof x === 'string' && x.length <= max;
const isId = (x) => typeof x === 'string' && /^[0-9a-f]{18}$/.test(x);
const isAmount = (x) => Number.isInteger(x) && x > 0 && x <= MAX_AMOUNT;
// Dates : format ISO strict, en temps universel (comme toISOString()).
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const isDate = (x) => typeof x === 'string' && ISO_RE.test(x) && !Number.isNaN(Date.parse(x));
// Jour seul (AAAA-MM-JJ), vraie date du calendrier.
export const isDay = (x) => typeof x === 'string' && /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(x)
  && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;

function fail(msg) { throw new DataShapeError(msg); }

// Image de compte : petite image (PNG, JPEG ou WebP) encodée en texte, 40 Ko max.
const ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_ICON_CHARS = 40_000;
export const isIcon = (x) => typeof x === 'string' && x.length <= MAX_ICON_CHARS && ICON_RE.test(x);

// Vérifie un compte. Renvoie une copie propre (champs connus seulement).
export function cleanAccount(a) {
  if (!isObj(a) || !isId(a.id)) fail('account.id');
  if (!isStr(a.name, LIMITS.name) || !a.name.trim()) fail('account.name');
  if (!CATEGORIES.includes(a.category)) fail('account.category');
  if (!Number.isInteger(a.start) || a.start < 0 || a.start > MAX_AMOUNT) fail('account.start');
  const out = {
    id: a.id, name: a.name.trim(), category: a.category, start: a.start,
    splitStart: a.splitStart === true, archived: a.archived === true,
  };
  if (a.icon !== undefined && a.icon !== null) {
    if (!isIcon(a.icon)) fail('account.icon');
    out.icon = a.icon;
  }
  return out;
}

// Vérifie une opération par rapport aux comptes, dettes et actifs connus.
// refs = { accounts: Set, debts: Set, assets: Set }.
export function cleanTx(t, refs) {
  const accountIds = refs.accounts;
  const debtIds = refs.debts || new Set();
  const assetIds = refs.assets || new Set();
  if (!isObj(t) || !isId(t.id)) fail('tx.id');
  if (!TX_TYPES.includes(t.type)) fail('tx.type');
  if (!isAmount(t.amount)) fail('tx.amount');
  if (!isDate(t.date)) fail('tx.date');
  const desc = t.desc === undefined ? '' : t.desc;
  if (!isStr(desc, LIMITS.desc)) fail('tx.desc');
  const out = { id: t.id, type: t.type, amount: t.amount, date: new Date(t.date).toISOString(), desc: desc.trim() };
  const acc = (x) => { if (!accountIds.has(x)) fail('tx.account'); return x; };

  const debt = (x) => { if (!debtIds.has(x)) fail('tx.debt'); return x; };
  const asset = (x) => { if (!assetIds.has(x)) fail('tx.asset'); return x; };

  if (t.type === 'income') {
    out.to = acc(t.to);
    if (!INCOME_SOURCES.includes(t.source)) fail('tx.source');
    out.source = t.source;
    if (t.source === 'asset') out.asset = asset(t.asset);
  } else if (t.type === 'loan') {
    out.to = acc(t.to);
    out.debt = debt(t.debt);
  } else if (t.type === 'repay') {
    out.from = acc(t.from);
    out.debt = debt(t.debt);
  } else if (t.type === 'buy') {
    out.from = acc(t.from);
    out.asset = asset(t.asset);
  } else if (t.type === 'sell') {
    out.to = acc(t.to);
    out.asset = asset(t.asset);
    // Part vendue, en centièmes de % : 10000 = tout.
    if (!Number.isInteger(t.shareBp) || t.shareBp < 1 || t.shareBp > 10000) fail('tx.share');
    out.shareBp = t.shareBp;
  } else if (t.type === 'expense') {
    out.from = acc(t.from);
    if (!POOL_IDS.includes(t.pool)) fail('tx.pool');
    if (!MOOD_IDS.includes(t.mood)) fail('tx.mood');
    out.pool = t.pool;
    out.mood = t.mood;
    const reason = t.reason === undefined ? '' : t.reason;
    if (!isStr(reason, LIMITS.reason)) fail('tx.reason');
    if (reason.trim()) out.reason = reason.trim();
  } else {
    out.from = acc(t.from);
    out.to = acc(t.to);
    if (out.from === out.to) fail('tx.sameAccount');
  }
  // Frais (dépense et transfert seulement) : le montant est toujours recalculé
  // à partir du pourcentage, jamais repris tel quel d'un fichier.
  if (t.feeBp !== undefined && t.feeBp !== null && t.feeBp !== 0) {
    if (t.type !== 'expense' && t.type !== 'transfer') fail('tx.fee');
    if (!Number.isInteger(t.feeBp) || t.feeBp < 1 || t.feeBp > MAX_FEE_BP) fail('tx.fee');
    const fee = feeOf(out.amount, t.feeBp);
    if (out.amount + fee > MAX_AMOUNT) fail('tx.fee'); // montant + frais : toujours sous le plafond
    if (fee > 0) { out.feeBp = t.feeBp; out.fee = fee; }
  }
  return out;
}

// ---------- Dettes et actifs ----------

// Une dette : ce que JE dois. Montants en FCFA, taux annuel en %.
export function cleanDebt(d) {
  if (!isObj(d) || !isId(d.id)) fail('debt.id');
  if (!isStr(d.lender, LIMITS.name) || !d.lender.trim()) fail('debt.lender');
  if (!isAmount(d.principal)) fail('debt.principal');
  if (typeof d.rate !== 'number' || !Number.isFinite(d.rate) || d.rate < 0 || d.rate > 100) fail('debt.rate');
  if (!Number.isInteger(d.months) || d.months < 1 || d.months > LIMITS.rows) fail('debt.months');
  if (!isDay(d.start)) fail('debt.start');
  if (d.mode !== 'auto' && d.mode !== 'manual') fail('debt.mode');
  const out = {
    id: d.id, lender: d.lender.trim(), principal: d.principal, rate: Math.round(d.rate * 100) / 100,
    months: d.months, start: d.start, mode: d.mode, viaAccount: d.viaAccount === true,
  };
  if (d.mode === 'manual') {
    if (!Array.isArray(d.rows) || d.rows.length < 1 || d.rows.length > LIMITS.rows) fail('debt.rows');
    out.rows = d.rows.map((r) => {
      if (!isObj(r) || !isDay(r.date) || !isAmount(r.amount)) fail('debt.row');
      return { date: r.date, amount: r.amount };
    }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return out;
}

// Un actif : terrain, actions, crypto, épargne… Valeurs saisies à la main.
export function cleanAsset(a) {
  if (!isObj(a) || !isId(a.id)) fail('asset.id');
  if (!isStr(a.name, LIMITS.name) || !a.name.trim()) fail('asset.name');
  if (!ASSET_CATEGORIES.includes(a.category)) fail('asset.category');
  if (!Number.isInteger(a.initialCost) || a.initialCost < 0 || a.initialCost > MAX_AMOUNT) fail('asset.cost');
  if (!Array.isArray(a.values) || a.values.length > LIMITS.values) fail('asset.values');
  const values = a.values.map((v) => {
    if (!isObj(v) || !isDate(v.date) || !Number.isInteger(v.value) || v.value < 0 || v.value > MAX_AMOUNT) fail('asset.value');
    return { date: new Date(v.date).toISOString(), value: v.value };
  }).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { id: a.id, name: a.name.trim(), category: a.category, initialCost: a.initialCost, values, closed: a.closed === true };
}

// Une envie : quelque chose que j'aimerais acheter ou faire, avec un prix estimé.
// amount : null (pas d'idée du prix) ou entier dans sa devise (FCFA, € ou £).
export function cleanWish(w) {
  if (!isObj(w) || !isId(w.id)) fail('wish.id');
  if (!isStr(w.name, LIMITS.name) || !w.name.trim()) fail('wish.name');
  const note = w.note === undefined ? '' : w.note;
  if (!isStr(note, LIMITS.note)) fail('wish.note');
  if (w.amount !== null && w.amount !== undefined && !isAmount(w.amount)) fail('wish.amount');
  if (!WISH_CURRENCIES.includes(w.currency)) fail('wish.currency');
  // En € ou £, plafond plus bas : converti en FCFA, le total reste exact.
  if (w.currency !== 'XOF' && w.amount && w.amount > MAX_AMOUNT / 1000) fail('wish.amount');
  if (!isDate(w.createdAt)) fail('wish.createdAt');
  if (w.doneAt !== null && w.doneAt !== undefined && !isDate(w.doneAt)) fail('wish.doneAt');
  const done = w.done === true;
  return {
    id: w.id, name: w.name.trim(), note: note.trim(), amount: w.amount ?? null, currency: w.currency,
    done, createdAt: new Date(w.createdAt).toISOString(), doneAt: done && w.doneAt ? new Date(w.doneAt).toISOString() : null,
  };
}

// Données vides d'un nouveau coffre.
export function newData() {
  const now = new Date().toISOString();
  return {
    schema: DATA_SCHEMA, createdAt: now, updatedAt: now, lastBackupAt: null, fx: null,
    debtMethod: 'avalanche', accounts: [], debts: [], assets: [], tx: [], wishes: [],
  };
}

// Tous les liens connus (pour vérifier une opération).
export function refsOf(data) {
  return {
    accounts: new Set(data.accounts.map((a) => a.id)),
    debts: new Set(data.debts.map((d) => d.id)),
    assets: new Set(data.assets.map((a) => a.id)),
  };
}

// Vérifie tout le contenu déchiffré, et met à jour les anciennes versions.
// v1 (étape 1) : { schema:1, testNote, ... } -> v2 : on garde les dates, on ajoute comptes et registre.
export function migrateAndValidate(d) {
  if (!isObj(d)) fail('data');
  if (d.schema === 1) {
    d = { schema: 2, createdAt: d.createdAt, updatedAt: d.updatedAt, lastBackupAt: d.lastBackupAt ?? null, accounts: [], tx: [] };
  }
  // v2 -> v3 : on ajoute les dettes et les actifs (vides).
  if (d.schema === 2) d = { ...d, schema: 3, debts: [], assets: [], debtMethod: 'avalanche' };
  // v3 -> v4 : on ajoute la liste d'envies (vide).
  if (d.schema === 3) d = { ...d, schema: 4, wishes: [] };
  if (d.schema !== DATA_SCHEMA) fail('schema');
  if (!Array.isArray(d.debts) || d.debts.length > LIMITS.debts) fail('debts');
  if (!Array.isArray(d.assets) || d.assets.length > LIMITS.assets) fail('assets');
  if (!Array.isArray(d.accounts) || d.accounts.length > LIMITS.accounts) fail('accounts');
  if (!Array.isArray(d.tx) || d.tx.length > LIMITS.tx) fail('tx');
  if (!Array.isArray(d.wishes) || d.wishes.length > LIMITS.wishes) fail('wishes');
  if (d.lastBackupAt !== null && d.lastBackupAt !== undefined && !isDate(d.lastBackupAt)) fail('lastBackupAt');

  const accounts = d.accounts.map(cleanAccount);
  const debts = d.debts.map(cleanDebt);
  const assets = d.assets.map(cleanAsset);
  const refs = refsOf({ accounts, debts, assets });
  if (refs.accounts.size !== accounts.length) fail('account.duplicate');
  if (refs.debts.size !== debts.length) fail('debt.duplicate');
  if (refs.assets.size !== assets.length) fail('asset.duplicate');
  const tx = d.tx.map((t) => cleanTx(t, refs));
  if (new Set(tx.map((t) => t.id)).size !== tx.length) fail('tx.duplicate');
  const wishes = d.wishes.map(cleanWish);
  if (new Set(wishes.map((w) => w.id)).size !== wishes.length) fail('wish.duplicate');

  return {
    schema: DATA_SCHEMA,
    createdAt: isDate(d.createdAt) ? d.createdAt : new Date().toISOString(),
    updatedAt: isDate(d.updatedAt) ? d.updatedAt : new Date().toISOString(),
    lastBackupAt: d.lastBackupAt ?? null,
    fx: cleanFx(d.fx),
    debtMethod: DEBT_METHODS.includes(d.debtMethod) ? d.debtMethod : 'avalanche',
    accounts,
    debts,
    assets,
    tx,
    wishes,
  };
}

// Opérations triées, les plus récentes d'abord.
// À date égale, la dernière saisie passe en premier.
export function sortedTx(data, filter = () => true) {
  const order = new Map(data.tx.map((x, i) => [x.id, i]));
  return data.tx.filter(filter).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return order.get(b.id) - order.get(a.id);
  });
}
