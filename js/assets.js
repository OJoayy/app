// assets.js — les calculs du gestionnaire d'investissements (spec, section 8).
// Valeur et coût de chaque actif, reconstruits à partir de son historique :
//   - valeur saisie à la main -> la valeur devient ce chiffre ;
//   - achat de X -> coût + X, valeur + X (on suppose l'achat au prix du marché) ;
//   - vente d'une part s -> coût × (1 − s), valeur × (1 − s), gain réalisé = prix − coût retiré.

export const STALE_DAYS = 90;
const DAY = 86400000;

export function assetEvents(asset, data) {
  const events = [];
  for (const v of asset.values) events.push({ kind: 'value', date: v.date, value: v.value, order: 1 });
  for (const t of data.tx) {
    if (t.asset !== asset.id) continue;
    if (t.type === 'buy') events.push({ kind: 'buy', date: t.date, amount: t.amount, tx: t, order: 0 });
    else if (t.type === 'sell') events.push({ kind: 'sell', date: t.date, amount: t.amount, shareBp: t.shareBp, tx: t, order: 0 });
    else if (t.type === 'income') events.push({ kind: 'income', date: t.date, amount: t.amount, tx: t, order: 2 });
  }
  // Par date ; le même jour, achats/ventes d'abord, puis la valeur saisie.
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
}

export function assetStatus(asset, data, now = Date.now()) {
  let cost = asset.initialCost;
  let value = asset.initialCost; // tant qu'aucune valeur n'est saisie : valeur = coût
  let realized = 0;
  let income = 0;
  let lastValueDate = null;
  const points = [];
  for (const e of assetEvents(asset, data)) {
    if (e.kind === 'value') {
      value = e.value;
      lastValueDate = e.date;
    } else if (e.kind === 'buy') {
      cost += e.amount;
      value += e.amount;
      if (!lastValueDate) lastValueDate = e.date;
    } else if (e.kind === 'sell') {
      const s = e.shareBp / 10000;
      const removed = cost * s;
      realized += e.amount - removed;
      cost -= removed;
      value *= 1 - s;
    } else if (e.kind === 'income') {
      income += e.amount;
      continue;
    }
    points.push({ date: e.date, value: Math.round(value) });
  }
  cost = Math.round(cost);
  value = Math.round(value);
  const gain = value - cost;
  const days = lastValueDate ? (now - Date.parse(lastValueDate)) / DAY : Infinity;
  return {
    cost,
    value,
    gain,
    gainPct: cost > 0 ? gain / cost : null,
    realized: Math.round(realized),
    income,
    lastValueDate,
    stale: days > STALE_DAYS,
    estimate: asset.category === 'land', // un terrain n'a pas de prix de marché
    empty: value === 0 && cost === 0,
    points,
  };
}
