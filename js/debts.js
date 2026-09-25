// debts.js — les calculs du gestionnaire de dettes (spec, section 7).
// Pas d'écran ici : seulement des calculs, faciles à tester.
// Montants en FCFA entiers ; taux annuel en % ; dates "AAAA-MM-JJ".

const DAY = 86400000;

export function todayYmd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Date + k mois. Le 31 janvier + 1 mois = le 28 (ou 29) février.
export function addMonths(ymd, k) {
  const [y, m, d] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

const dayOf = (iso) => iso.slice(0, 10);
const daysBetween = (a, b) => Math.max(0, Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY));

// Mensualité constante : M = P × r / (1 − (1 + r)^−n), r = taux annuel ÷ 12.
// Sans intérêt : P ÷ n. Arrondi au FCFA supérieur.
export function monthlyPayment(principal, ratePct, months) {
  const r = ratePct / 100 / 12;
  if (r === 0) return Math.ceil(principal / months);
  return Math.ceil((principal * r) / (1 - (1 + r) ** -months));
}

// Échéancier : recopié du contrat, ou calculé (dernière échéance ajustée).
// Chaque ligne : { date, amount, interest?, principal? }.
export function scheduleOf(debt) {
  if (debt.mode === 'manual') return debt.rows.map((r) => ({ date: r.date, amount: r.amount }));
  const r = debt.rate / 100 / 12;
  const m = monthlyPayment(debt.principal, debt.rate, debt.months);
  const rows = [];
  let balance = debt.principal;
  for (let k = 1; k <= debt.months && balance > 0; k++) {
    const interest = Math.round(balance * r);
    let amount = m;
    if (k === debt.months || amount >= balance + interest) amount = balance + interest; // dernière échéance
    const principal = amount - interest;
    balance -= principal;
    rows.push({ date: addMonths(debt.start, k), amount, interest, principal });
  }
  return rows;
}

// Remboursements d'une dette, du plus ancien au plus récent.
export function repaymentsOf(debt, data) {
  return data.tx.filter((t) => t.type === 'repay' && t.debt === debt.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// État d'une dette à une date donnée.
// - Capital restant : estimé jour par jour (intérêts courus depuis le dernier paiement).
// - Échéancier : ce qui a été payé couvre les échéances dans l'ordre.
// - Recopié du contrat : le contrat fait foi (terminée quand tout est payé).
// - Calculé : on projette ce qui reste vraiment dû (un remboursement anticipé
//   réduit les dernières échéances ; un retard ajoute des intérêts à la dernière).
export function debtStatus(debt, data, today = todayYmd()) {
  const repays = repaymentsOf(debt, data);
  const rows = scheduleOf(debt);
  const totalScheduled = rows.reduce((s, r) => s + r.amount, 0);
  const rate = debt.rate / 100;

  let balance = debt.principal;
  let last = debt.start;
  let accrued = 0;
  let interestPaid = 0;
  let paidTotal = 0;
  for (const p of repays) {
    const day = dayOf(p.date);
    if (balance > 0) accrued += (balance * rate * daysBetween(last, day)) / 365;
    last = day > last ? day : last;
    const interest = Math.min(p.amount, Math.round(accrued));
    accrued = Math.max(0, accrued - interest);
    interestPaid += interest;
    balance -= p.amount - interest;
    paidTotal += p.amount;
  }
  // Ce qui est dû aujourd'hui : capital + intérêts courus jusqu'à aujourd'hui.
  let owed = balance > 0 ? balance + accrued + (balance * rate * daysBetween(last, today)) / 365 : 0;
  balance = Math.max(0, Math.round(balance));

  // Chaque échéance reçoit sa part de l'argent déjà versé, dans l'ordre.
  let covered = paidTotal;
  const out = rows.map((r) => {
    const part = Math.min(covered, r.amount);
    covered -= part;
    return { ...r, due: r.amount - part };
  });

  const manual = debt.mode === 'manual';
  let done;
  if (manual) {
    done = paidTotal >= totalScheduled;
  } else {
    done = paidTotal > 0 && (paidTotal >= totalScheduled || owed < 1);
    if (!done) {
      // Projection : chaque échéance future ajoute les intérêts depuis la précédente.
      let from = today > last ? today : last;
      let lastOpen = null;
      for (const r of out) {
        if (r.due <= 0) continue;
        if (owed < 1) { r.due = 0; continue; }
        if (r.date > from) { owed += (owed * rate * daysBetween(from, r.date)) / 365; from = r.date; }
        r.due = Math.min(r.due, Math.ceil(owed));
        owed -= r.due;
        lastOpen = r;
      }
      if (owed >= 1) {
        if (lastOpen) lastOpen.due += Math.ceil(owed); // la dernière échéance absorbe le reste
        else out.push({ date: out.length ? out[out.length - 1].date : today, amount: Math.ceil(owed), due: Math.ceil(owed), extra: true });
      }
    }
  }
  const schedule = out.map((r) => {
    const paid = done || r.due <= 0;
    return { ...r, paid, late: !paid && r.date < today };
  });
  const open = schedule.find((r) => !r.paid) || null;
  const next = done || !open ? null : { ...open, amount: open.due };
  return {
    balance: done ? 0 : balance,               // capital restant (estimation)
    paidTotal,                                 // total déjà remboursé
    interestPaid,                              // part d'intérêts dans ce total (estimation)
    remainingToPay: done ? 0 : schedule.reduce((s, r) => s + (r.paid ? 0 : r.due), 0), // reste à payer, intérêts compris
    totalCost: Math.max(0, totalScheduled - debt.principal), // coût total prévu du prêt
    payment: manual ? (next ? next.amount : 0) : monthlyPayment(debt.principal, debt.rate, debt.months),
    schedule,
    next,
    lateCount: schedule.filter((r) => r.late).length,
    done,
  };
}

// ---------- Stratégie : avalanche ou boule de neige ----------
// Chaque mois : les intérêts s'ajoutent, chaque dette reçoit sa mensualité,
// puis le reste du budget (extra + mensualités libérées) va à la dette prioritaire.
//   avalanche     = d'abord le taux le plus élevé (coûte le moins cher)
//   boule de neige = d'abord la plus petite dette (victoires rapides)

export function priorityOrder(items, method) {
  const list = items.slice();
  if (method === 'snowball') list.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  else list.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  return list;
}

// items : [{ id, balance, rate, payment }] ; extra : FCFA en plus chaque mois.
export function simulate(items, method, extra = 0, maxMonths = 600) {
  const debts = priorityOrder(items.filter((d) => d.balance > 0), method).map((d) => ({ ...d }));
  const budget = debts.reduce((s, d) => s + d.payment, 0) + extra;
  let interest = 0;
  let month = 0;
  const payoffOrder = [];
  while (debts.some((d) => d.balance > 0) && month < maxMonths) {
    month += 1;
    let left = budget;
    for (const d of debts) {
      if (d.balance <= 0) continue;
      const i = d.balance * (d.rate / 100 / 12);
      d.balance += i;
      interest += i;
    }
    for (const d of debts) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.payment, d.balance, left);
      d.balance -= pay;
      left -= pay;
    }
    for (const d of debts) {
      if (left <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, left);
      d.balance -= pay;
      left -= pay;
    }
    for (const d of debts) {
      if (d.balance <= 0.5 && !payoffOrder.includes(d.id)) { d.balance = 0; payoffOrder.push(d.id); }
    }
  }
  const finished = debts.every((d) => d.balance <= 0.5);
  return { months: finished ? month : null, interest: Math.round(interest), payoffOrder };
}
