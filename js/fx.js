// fx.js — conversions FCFA -> € et £ (spec, section 5).
// Le FCFA est fixé à l'euro : 1 € = 655,957 FCFA (taux officiel, ne bouge pas).
// Seul le taux € -> £ change : on le demande une fois par jour au plus à
// Frankfurter, un service gratuit qui publie les taux de la Banque centrale
// européenne. La demande ne contient aucune donnée financière. Comme toute
// connexion, elle montre au service l'adresse IP du téléphone, l'adresse du
// site (ojoayy.github.io) et l'heure. On peut la couper dans les Réglages.

export const XOF_PER_EUR = 655.957;
const RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP';
export const REFRESH_MS = 12 * 3600000;    // on redemande au plus toutes les 12 h
export const STALE_MS = 7 * 86400000;      // au-delà de 7 jours : "taux ancien"

// Vérifie un taux enregistré. Renvoie une copie propre, ou null.
export function cleanFx(fx) {
  if (!fx || typeof fx !== 'object') return null;
  const { rate, date, fetchedAt } = fx;
  if (!Number.isFinite(rate) || rate < 0.3 || rate > 3) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = Date.parse(date + 'T00:00:00Z');
  // Une vraie date (pas le 99/99), et pas dans le futur (1 jour de marge).
  if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== date || day > Date.now() + 86400000) return null;
  if (!Number.isFinite(fetchedAt) || fetchedAt < 0) return null;
  return { rate, date, fetchedAt };
}

export function needsRefresh(fx, now = Date.now()) {
  const f = cleanFx(fx);
  return !f || now - f.fetchedAt > REFRESH_MS || f.fetchedAt > now;
}

export function isStale(fx, now = Date.now()) {
  const f = cleanFx(fx);
  return !f || now - Date.parse(f.date + 'T00:00:00Z') > STALE_MS;
}

// Demande le taux du jour. Renvoie { rate, date, fetchedAt } ou lance une erreur.
export async function fetchRate() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(RATE_URL, {
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error', signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('http ' + res.status);
    if (Number(res.headers.get('content-length') || 0) > 2000) throw new Error('too big');
    const text = await res.text();
    if (text.length > 2000) throw new Error('too big');
    const json = JSON.parse(text);
    if (!json || json.base !== 'EUR') throw new Error('bad base');
    const fx = cleanFx({ rate: json && json.rates && json.rates.GBP, date: json && json.date, fetchedAt: Date.now() });
    if (!fx) throw new Error('bad data');
    return fx;
  } finally {
    clearTimeout(timer);
  }
}

export const toEur = (cfa) => cfa / XOF_PER_EUR;
export const toGbp = (cfa, fx) => (cfa / XOF_PER_EUR) * fx.rate;

export function formatMoney(value, currency, lang) {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}
