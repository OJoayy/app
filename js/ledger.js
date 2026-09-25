// ledger.js — les règles d'argent (spec, sections 4 et 5).
// Pas d'écran ici : seulement des calculs, faciles à tester.
// Tous les montants sont des FCFA entiers (le FCFA n'a pas de centimes).

export const DATA_SCHEMA = 2;
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
export const TX_TYPES = ['income', 'expense', 'transfer'];
export const INCOME_SOURCES = ['client', 'other'];

const LIMITS = { name: 40, desc: 140, reason: 280, accounts: 50, tx: 50_000 };

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
      accounts.set(tx.from, accounts.get(tx.from) - tx.amount);
      pools[tx.pool] -= tx.amount;
    } else if (tx.type === 'transfer') {
      accounts.set(tx.from, accounts.get(tx.from) - tx.amount);
      accounts.set(tx.to, accounts.get(tx.to) + tx.amount);
    }
  }
  let liquid = 0;
  for (const v of accounts.values()) liquid += v;
  let poolTotal = 0;
  for (const id of POOL_IDS) poolTotal += pools[id];
  return { accounts, pools, liquid, poolTotal };
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

function fail(msg) { throw new DataShapeError(msg); }

// Vérifie un compte. Renvoie une copie propre (champs connus seulement).
export function cleanAccount(a) {
  if (!isObj(a) || !isId(a.id)) fail('account.id');
  if (!isStr(a.name, LIMITS.name) || !a.name.trim()) fail('account.name');
  if (!CATEGORIES.includes(a.category)) fail('account.category');
  if (!Number.isInteger(a.start) || a.start < 0 || a.start > MAX_AMOUNT) fail('account.start');
  return {
    id: a.id, name: a.name.trim(), category: a.category, start: a.start,
    splitStart: a.splitStart === true, archived: a.archived === true,
  };
}

// Vérifie une opération par rapport aux comptes connus.
export function cleanTx(t, accountIds) {
  if (!isObj(t) || !isId(t.id)) fail('tx.id');
  if (!TX_TYPES.includes(t.type)) fail('tx.type');
  if (!isAmount(t.amount)) fail('tx.amount');
  if (!isDate(t.date)) fail('tx.date');
  const desc = t.desc === undefined ? '' : t.desc;
  if (!isStr(desc, LIMITS.desc)) fail('tx.desc');
  const out = { id: t.id, type: t.type, amount: t.amount, date: new Date(t.date).toISOString(), desc: desc.trim() };
  const acc = (x) => { if (!accountIds.has(x)) fail('tx.account'); return x; };

  if (t.type === 'income') {
    out.to = acc(t.to);
    if (!INCOME_SOURCES.includes(t.source)) fail('tx.source');
    out.source = t.source;
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
  return out;
}

// Données vides d'un nouveau coffre.
export function newData() {
  const now = new Date().toISOString();
  return { schema: DATA_SCHEMA, createdAt: now, updatedAt: now, lastBackupAt: null, accounts: [], tx: [] };
}

// Vérifie tout le contenu déchiffré, et met à jour les anciennes versions.
// v1 (étape 1) : { schema:1, testNote, ... } -> v2 : on garde les dates, on ajoute comptes et registre.
export function migrateAndValidate(d) {
  if (!isObj(d)) fail('data');
  if (d.schema === 1) {
    d = { schema: 2, createdAt: d.createdAt, updatedAt: d.updatedAt, lastBackupAt: d.lastBackupAt ?? null, accounts: [], tx: [] };
  }
  if (d.schema !== DATA_SCHEMA) fail('schema');
  if (!Array.isArray(d.accounts) || d.accounts.length > LIMITS.accounts) fail('accounts');
  if (!Array.isArray(d.tx) || d.tx.length > LIMITS.tx) fail('tx');
  if (d.lastBackupAt !== null && d.lastBackupAt !== undefined && !isDate(d.lastBackupAt)) fail('lastBackupAt');

  const accounts = d.accounts.map(cleanAccount);
  const ids = new Set(accounts.map((a) => a.id));
  if (ids.size !== accounts.length) fail('account.duplicate');
  const tx = d.tx.map((t) => cleanTx(t, ids));
  if (new Set(tx.map((t) => t.id)).size !== tx.length) fail('tx.duplicate');

  return {
    schema: DATA_SCHEMA,
    createdAt: isDate(d.createdAt) ? d.createdAt : new Date().toISOString(),
    updatedAt: isDate(d.updatedAt) ? d.updatedAt : new Date().toISOString(),
    lastBackupAt: d.lastBackupAt ?? null,
    accounts,
    tx,
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
