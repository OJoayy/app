// app.js — le "chef d'orchestre" : écrans, verrouillage, sauvegardes.
// v0.4 : coffre-fort, comptes/pools/opérations, code PIN, bouton retour.

import * as C from './crypto.js';
import * as S from './store.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';
import * as L from './ledger.js';
import * as screens from './screens.js';

const APP_VERSION = '0.4';
const PASS_EVERY_MS = 7 * 86400000; // la phrase est redemandée tous les 7 jours
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_DELAY_S = 300; // attente maximale après des erreurs : 5 min
const BACKUP_WARN_DAYS = 7;

// Anti-cadre : l'app refuse de tourner dans une page d'un autre site.
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error('framed');
}

const $ = (id) => document.getElementById(id);

// ---------- État ----------
// session = null quand le coffre est verrouillé.
let session = null; // { key, meta, data }
let prefs = { lang: 'fr', lockMinutes: 3 };
let lastActivity = Date.now();
let suppressLockUntil = 0; // pendant le choix d'un fichier ou un partage
let pending = null; // nouveau coffre (création ou changement de phrase) en attente de la clé de secours
let pendingImport = null; // fichier de sauvegarde lu, pas encore importé
let countdownTimer = null;

// "Époque" : augmente à chaque verrouillage ou passage en arrière-plan.
// Une opération lancée avant ne doit pas ouvrir ni écrire après.
let epoch = 0;

// ---------- Outils d'affichage ----------

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  // La barre d'onglets n'apparaît que coffre ouvert, sur les 4 onglets.
  const tabs = Boolean(session) && screens.isTab(id);
  $('tabbar').hidden = !tabs;
  document.body.classList.toggle('has-tabs', tabs);
  for (const b of document.querySelectorAll('[data-tab]')) {
    b.classList.toggle('active', b.dataset.tab === id);
    if (b.dataset.tab === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  syncHistory(id);
  window.scrollTo(0, 0);
}

// ---------- Bouton retour d'Android ----------
// Hors des écrans "racine", on ajoute une étape dans l'historique du
// navigateur. Le bouton retour la consomme : on revient en arrière dans
// l'app au lieu de la fermer.
const ROOT_SCREENS = new Set(['s-home', 's-lock', 's-welcome', 's-loading']);
let backGuard = false;
let ignorePops = 0;

function syncHistory(id) {
  if (!ROOT_SCREENS.has(id)) {
    if (!backGuard) { history.pushState({ sika: 1 }, ''); backGuard = true; }
  } else if (backGuard) {
    backGuard = false;
    ignorePops += 1;
    history.back();
  }
}

function currentScreen() {
  const s = document.querySelector('.screen:not([hidden])');
  return s ? s.id : 's-loading';
}

window.addEventListener('popstate', () => {
  if (ignorePops > 0) { ignorePops -= 1; return; }
  backGuard = false;
  const cur = currentScreen();
  if (isBusy() || !$('modal').hidden) {
    if (!$('modal').hidden && askCancel) askCancel();
    syncHistory(cur); // on reste sur place
    return;
  }
  switch (cur) {
    case 's-create': show('s-welcome'); break;
    case 's-recover': goLock(); break;
    case 's-import': $('btn-import-back').onclick(); break;
    case 's-reckey': syncHistory(cur); break; // on reste : la clé doit être notée
    case 's-tx':
    case 's-account':
      screens.back().then((left) => { if (!left) syncHistory(currentScreen()); });
      break;
    case 's-accounts':
    case 's-history':
    case 's-settings': screens.openTab('s-home'); break;
    default: break; // écran racine : le prochain retour ferme l'app
  }
});

function setMsg(id, text) {
  $(id).textContent = text || '';
}

// Pendant un calcul : tous les boutons bloqués, puis remis comme avant.
let busyState = null;
function isBusy() { return busyState !== null; }
function busy(on) {
  $('busy').hidden = !on;
  if (on && !busyState) {
    busyState = new Map();
    for (const b of document.querySelectorAll('button')) { busyState.set(b, b.disabled); b.disabled = true; }
  } else if (!on && busyState) {
    for (const [b, was] of busyState) b.disabled = was;
    busyState = null;
  }
}

function clearInputs(...ids) {
  for (const id of ids) $(id).value = '';
}

function hideSecrets() {
  for (const c of document.querySelectorAll('.show-pass')) {
    c.checked = false;
    for (const id of c.dataset.target.split(',')) $(id).type = 'password';
  }
}

function sanitizePrefs(p) {
  const out = {};
  if (p && (p.lang === 'fr' || p.lang === 'en')) out.lang = p.lang;
  if (p && [1, 3, 5].includes(p.lockMinutes)) out.lockMinutes = p.lockMinutes;
  return out;
}

function savePrefs() {
  return S.put('prefs', { ...prefs });
}

function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR',
    { dateStyle: 'medium', timeStyle: 'short' });
}

// Fenêtre de confirmation. Si "word" est donné, il faut le taper.
let askCancel = null; // pour fermer une question ouverte au verrouillage
function ask(text, word) {
  return new Promise((resolve) => {
    $('modal-text').textContent = text;
    const input = $('modal-input');
    input.hidden = !word;
    input.value = '';
    $('modal').hidden = false;
    const done = (ok) => {
      $('modal').hidden = true;
      $('modal-text').textContent = '';
      input.value = '';
      $('modal-ok').onclick = null;
      $('modal-cancel').onclick = null;
      askCancel = null;
      resolve(ok);
    };
    askCancel = () => done(false);
    $('modal-ok').onclick = () => {
      if (word && input.value.trim().toUpperCase() !== word) { input.focus(); return; }
      done(true);
    };
    $('modal-cancel').onclick = () => done(false);
    if (word) input.focus();
  });
}

// ---------- Données ----------

// Contenu déchiffré : vérifié et mis à jour (v1 -> v2) par ledger.js.
const validateData = (d) => L.migrateAndValidate(d);
const newData = () => L.newData();
const isDataProblem = (e) => e instanceof C.DataError || e instanceof C.FormatError || e instanceof L.DataShapeError;

async function saveData() {
  const s = session;
  s.data.updatedAt = new Date().toISOString();
  const box = await C.encryptData(s.key, s.data);
  await S.put('data', box);
  return box;
}

// ---------- Ouverture / verrouillage ----------

// N'ouvre que si rien ne s'est passé entre-temps (écran éteint, verrouillage).
function openSession(key, meta, data, startEpoch) {
  if (document.hidden || startEpoch !== epoch) { goLock(); return false; }
  session = { key, meta, data };
  lastActivity = Date.now();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  screens.openTab('s-home');
  return true;
}

function lock() {
  epoch += 1;
  session = null;
  pending = null;
  pendingImport = null;
  // Effacer ce qui est affiché. (JavaScript ne permet pas d'effacer la
  // mémoire elle-même : on retire les références, le navigateur libère.)
  clearInputs('lock-pass', 'lock-pin', 'pin-pass', 'pin-new', 'pin-new2', 'cp-old', 'cp-new', 'cp-new2', 'reckey-verify',
    'import-secret', 'import-pass', 'import-pass2', 'recover-key', 'recover-pass', 'recover-pass2');
  $('reckey-groups').replaceChildren();
  $('import-file').value = '';
  if (askCancel) askCancel();
  $('modal').hidden = true;
  $('modal-text').textContent = '';
  hideSecrets();
  for (const id of ['export-msg', 'cp-msg', 'import-msg', 'home-msg', 'pin-msg']) setMsg(id, '');
  screens.clearAll();
  $('tabbar').hidden = true;
  goLock();
}

async function goLock(forcePass = false, note = '') {
  const meta = await S.get('meta');
  if (!meta) { show('s-welcome'); return; }
  await loadGuard();
  await setLockMode(forcePass, note);
  show('s-lock');
  updateCountdown();
  const field = lockMode === 'pin' ? $('lock-pin') : $('lock-pass');
  if (document.visibilityState === 'visible') field.focus();
}

// ---------- Compteur d'essais (partagé entre onglets) ----------
// Stocké à part ('guard'), toujours lu ET écrit dans une seule transaction.
// Chaque essai est compté comme raté AVANT le calcul lent : ouvrir un
// 2e onglet, recharger ou couper l'app ne donne donc aucun essai gratuit.
const MAX_PIN_UNLOCKS = 30; // ouvertures au PIN avant de redemander la phrase
let guard = { failures: 0, retryAt: 0, pinFailures: 0, lastPassAt: 0, pinUnlocks: 0 };

function cleanGuard(g) {
  const n = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
  const out = { failures: n(g && g.failures), retryAt: n(g && g.retryAt), pinFailures: n(g && g.pinFailures),
    lastPassAt: n(g && g.lastPassAt), pinUnlocks: n(g && g.pinUnlocks) };
  // Horloge du téléphone reculée ou avancée : l'attente ne dépasse jamais 5 min.
  out.retryAt = Math.min(out.retryAt, Date.now() + MAX_DELAY_S * 1000);
  return out;
}

async function loadGuard() {
  guard = cleanGuard(await S.get('guard'));
  return guard;
}

// Un seul essai à la fois, même avec plusieurs onglets ouverts.
function withAttemptLock(fn) {
  if (navigator.locks && navigator.locks.request) return navigator.locks.request('sika-unlock', fn);
  return fn();
}

// Renvoie true si l'essai peut avoir lieu (et le compte déjà comme raté).
async function beginAttempt(kind) {
  let allowed = false;
  guard = cleanGuard(await S.update('guard', (g0) => {
    const g = cleanGuard(g0);
    const now = Date.now();
    if (now < g.retryAt) return g;
    if (kind === 'pin' && g.pinFailures >= C.PIN_MAX_TRIES) return g;
    allowed = true;
    g.failures += 1;
    g.retryAt = now + Math.min(2 ** (g.failures - 1), MAX_DELAY_S) * 1000;
    if (kind === 'pin') g.pinFailures += 1;
    return g;
  }));
  return allowed;
}

// L'essai a réussi : on efface l'attente. 'pass' = phrase ou clé de secours.
async function attemptSucceeded(kind) {
  guard = cleanGuard(await S.update('guard', (g0) => {
    const g = cleanGuard(g0);
    g.failures = 0;
    g.retryAt = 0;
    g.pinFailures = 0;
    if (kind === 'pin') g.pinUnlocks += 1;
    else { g.lastPassAt = Date.now(); g.pinUnlocks = 0; }
    return g;
  }));
}

// ---------- Code PIN ----------
let lockMode = 'pass';
let pinLen = 0;

// 'ok' = le PIN peut servir ; 'expired' = phrase exigée ; 'none' = pas de PIN.
async function pinState() {
  const rec = await S.get('pin');
  if (!rec) return { state: 'none' };
  try { C.validatePinRecord(rec); } catch { await S.del('pin'); return { state: 'none' }; }
  await loadGuard();
  if (guard.pinFailures >= C.PIN_MAX_TRIES) { await S.del('pin'); return { state: 'none' }; }
  const now = Date.now();
  // Phrase exigée : après 7 jours, si l'horloge a reculé, ou après 30 ouvertures au PIN.
  if (now - guard.lastPassAt > PASS_EVERY_MS || now < guard.lastPassAt || guard.pinUnlocks >= MAX_PIN_UNLOCKS) {
    return { state: 'expired', rec };
  }
  return { state: 'ok', rec };
}

async function setLockMode(forcePass = false, note = '') {
  const { state, rec } = await pinState();
  lockMode = state === 'ok' && !forcePass ? 'pin' : 'pass';
  pinLen = rec ? rec.len : 0;
  clearInputs('lock-pin');
  $('lock-pin-wrap').hidden = lockMode !== 'pin';
  $('lock-pass-wrap').hidden = lockMode !== 'pass';
  $('btn-use-pin').hidden = !(lockMode === 'pass' && state === 'ok');
  $('lock-info').textContent = note || (state === 'expired' ? t('pinExpired') : '');
}

async function onUnlockPin() {
  if (isBusy()) return;
  const pin = $('lock-pin').value;
  if (!pin) return;
  const startEpoch = epoch;
  let failed = false;
  let disabled = false;
  let expired = false;
  busy(true);
  try {
    await withAttemptLock(async () => {
      const { state, rec } = await pinState();
      if (state !== 'ok') { expired = true; return; }
      if (!(await beginAttempt('pin'))) { failed = true; return; }
      const meta = await S.get('meta');
      let key;
      try {
        key = await C.unlockWithPin(rec, pin);
      } catch (e) {
        if (!(e instanceof C.WrongSecretError)) throw e;
        failed = true;
        if (guard.pinFailures >= C.PIN_MAX_TRIES) { await S.del('pin'); disabled = true; }
        return;
      }
      let data;
      try {
        data = validateData(await C.decryptData(key, await S.get('data')));
      } catch (e) {
        // Le PIN ne correspond plus à ce coffre : on l'efface, la phrase décidera.
        if (e instanceof C.DataError) { await S.del('pin'); disabled = true; return; }
        throw e;
      }
      await attemptSucceeded('pin');
      setMsg('lock-msg', '');
      openSession(key, meta, data, startEpoch);
    });
  } catch (e) {
    setMsg('lock-msg', isDataProblem(e) ? t('errDataDamaged') : t('errGeneric'));
  } finally {
    clearInputs('lock-pin');
    busy(false);
    if (disabled) await goLock(true, t('pinDisabled'));
    else if (expired) await goLock(true);
    else if (failed) updateCountdown();
  }
}

async function onPinSave() {
  if (isBusy() || !session) return;
  $('pin-msg').className = 'error';
  const pin = $('pin-new').value;
  const err = C.checkPin(pin);
  if (err) return setMsg('pin-msg', t(err));
  if (pin !== $('pin-new2').value) return setMsg('pin-msg', t('errPinMismatch'));
  const s = session;
  busy(true);
  try {
    const rec = await C.makePinRecord(s.meta, $('pin-pass').value, pin);
    if (session !== s) return; // verrouillé entre-temps
    await S.put('pin', rec);
    await attemptSucceeded('pass'); // la phrase vient d'être prouvée
    clearInputs('pin-pass', 'pin-new', 'pin-new2');
    $('pin-msg').className = 'ok';
    setMsg('pin-msg', t('pinSaved'));
    await renderPinStatus();
  } catch (e) {
    setMsg('pin-msg', e instanceof C.WrongSecretError ? t('wrongCurrentPass') : t('errGeneric'));
  } finally {
    busy(false);
  }
}

async function onPinRemove() {
  if (isBusy() || !session) return;
  await S.del('pin');
  $('pin-msg').className = 'ok';
  setMsg('pin-msg', t('pinRemoved'));
  await renderPinStatus();
}

async function renderPinStatus() {
  const has = Boolean(await S.get('pin'));
  $('pin-status').textContent = has ? t('pinOn') : t('pinOff');
  $('btn-pin-remove').hidden = !has;
}

// Bloque les boutons Ouvrir tant que l'attente n'est pas finie.
function updateCountdown() {
  clearInterval(countdownTimer);
  const buttons = [$('btn-unlock'), $('btn-unlock-pin'), $('btn-recover')];
  const tick = () => {
    if (isBusy()) return;
    const left = Math.ceil((guard.retryAt - Date.now()) / 1000);
    if (left > 0) {
      for (const b of buttons) b.disabled = true;
      const msg = t('wrongSecret') + ' ' + t('waitSeconds', { s: left });
      setMsg('lock-msg', msg);
      setMsg('recover-err', msg);
    } else {
      clearInterval(countdownTimer);
      for (const b of buttons) b.disabled = false;
      const msg = guard.failures > 0 ? t('wrongSecret') : '';
      setMsg('lock-msg', msg);
      setMsg('recover-err', msg);
    }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// Verrouillage automatique
function touch() { lastActivity = Date.now(); }

function checkIdle() {
  // Pendant l'écriture de la nouvelle clé de secours sur papier, on attend.
  if (session && !pending && Date.now() - lastActivity > prefs.lockMinutes * 60000) lock();
}

document.addEventListener('pointerdown', touch, { passive: true });
document.addEventListener('keydown', touch, { passive: true });
document.addEventListener('input', touch, { passive: true });
setInterval(checkIdle, 10000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // En arrière-plan : on verrouille, sauf pendant un choix de fichier/partage.
    if (Date.now() <= suppressLockUntil) return;
    epoch += 1; // annule une ouverture en cours
    if (session) lock();
  } else {
    checkIdle();
  }
});
window.addEventListener('pagehide', () => { epoch += 1; if (session) lock(); });

// ---------- Écrans ----------

// Partie "coffre" de l'accueil : rappel de sauvegarde et version.
function renderHomeExtras() {
  $('home-version').textContent = t('versionLine', { v: APP_VERSION });
  const warn = $('home-backup-warn');
  const last = session.data.lastBackupAt;
  if (!last) {
    warn.textContent = t('backupNever');
    warn.hidden = false;
  } else {
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    warn.hidden = days < BACKUP_WARN_DAYS;
    warn.textContent = t('backupOld', { d: days });
  }
}

async function renderSettings() {
  const last = session.data.lastBackupAt;
  $('set-last-backup').textContent = last ? t('lastBackup', { date: formatDate(last) }) : t('lastBackupNever');
  $('lock-delay').value = String(prefs.lockMinutes);
  $('btn-export-share').hidden = !(await shareableBackup());
  $('link-gcal').href = gcalLink();
  let status = t('storageUnknown');
  if (navigator.storage && navigator.storage.persisted) {
    try { status = (await navigator.storage.persisted()) ? t('storagePersisted') : t('storageNotPersisted'); } catch { /* inconnu */ }
  }
  $('storage-status').textContent = status;
  await renderPinStatus();
}

function renderLangChips() {
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.classList.toggle('active', b.dataset.lang === getLang());
  }
}

async function changeLang(l) {
  prefs.lang = l;
  setLang(l);
  applyI18n(document);
  renderLangChips();
  syncImportMode();
  await savePrefs();
  if (session) screens.refresh();
}

// ---------- Création du coffre ----------

async function onCreate() {
  if (isBusy()) return;
  const p1 = $('create-pass').value;
  const p2 = $('create-pass2').value;
  const err = C.checkPassphrase(p1);
  if (err) return setMsg('create-err', t(err));
  if (C.normalizePassphrase(p1) !== C.normalizePassphrase(p2)) return setMsg('create-err', t('errMismatch'));
  setMsg('create-err', '');
  busy(true);
  try {
    const { meta, key, recoveryKey } = await C.createVault(p1);
    pending = { kind: 'create', meta, key, recoveryKey, data: newData() };
    clearInputs('create-pass', 'create-pass2');
    hideSecrets();
    showRecoveryKey(recoveryKey);
  } catch {
    setMsg('create-err', t('errGeneric'));
  } finally {
    busy(false);
  }
}

function showRecoveryKey(rk) {
  const box = $('reckey-groups');
  box.replaceChildren();
  for (const g of C.formatRecoveryKey(rk).split('-')) {
    const span = document.createElement('span');
    span.textContent = g;
    box.append(span);
  }
  $('reckey-ack').checked = false;
  clearInputs('reckey-verify');
  setMsg('reckey-err', '');
  $('btn-reckey-done').disabled = true;
  show('s-reckey');
}

// La clé recopiée sur papier doit être retapée EN ENTIER : une faute
// d'écriture serait découverte le jour où on en a besoin, trop tard.
async function onRecKeyDone() {
  if (!pending || isBusy()) return;
  const typed = C.normalizeRecoveryKey($('reckey-verify').value);
  if (typed !== pending.recoveryKey) return setMsg('reckey-err', t('recVerifyErr'));
  const p = pending;
  const startEpoch = epoch;
  busy(true);
  try {
    const box = await C.encryptData(p.key, p.data);
    if (startEpoch !== epoch || pending !== p) return; // verrouillé entre-temps : rien n'est écrit
    // Nouvelle clé : l'ancien PIN ne sert plus (effacé dans la même transaction).
    await S.putMany([['meta', p.meta], ['data', box]], p.kind === 'rotate' ? ['pin'] : []);
    await attemptSucceeded('pass');
    pending = null;
    $('reckey-groups').replaceChildren();
    clearInputs('reckey-verify');
    hideSecrets();
    session = null;
    if (openSession(p.key, p.meta, p.data, startEpoch) && p.kind === 'rotate') {
      setMsg('home-msg', t('changePassDone'));
    }
  } catch {
    setMsg('reckey-err', t('errGeneric'));
  } finally {
    busy(false);
  }
}

// ---------- Ouvrir ----------

async function onUnlock() {
  if (isBusy()) return;
  const pass = $('lock-pass').value;
  if (!pass) return;
  const startEpoch = epoch;
  let failed = false;
  busy(true);
  try {
    await withAttemptLock(async () => {
      if (!(await beginAttempt('pass'))) { failed = true; return; }
      const meta = await S.get('meta');
      let key;
      try { key = await C.unlockWithPassphrase(meta, pass); } catch (e) {
        if (e instanceof C.WrongSecretError) { failed = true; return; }
        throw e;
      }
      await attemptSucceeded('pass');
      const data = validateData(await C.decryptData(key, await S.get('data')));
      hideSecrets();
      setMsg('lock-msg', '');
      openSession(key, meta, data, startEpoch);
    });
  } catch (e) {
    setMsg('lock-msg', isDataProblem(e) ? t('errDataDamaged') : t('errGeneric'));
  } finally {
    clearInputs('lock-pass');
    busy(false);
    if (failed) updateCountdown();
  }
}

async function onRecover() {
  if (isBusy()) return;
  const p1 = $('recover-pass').value;
  const p2 = $('recover-pass2').value;
  const err = C.checkPassphrase(p1);
  if (err) return setMsg('recover-err', t(err));
  if (C.normalizePassphrase(p1) !== C.normalizePassphrase(p2)) return setMsg('recover-err', t('errMismatch'));
  const startEpoch = epoch;
  let failed = false;
  busy(true);
  try {
    await withAttemptLock(async () => {
      if (!(await beginAttempt('pass'))) { failed = true; return; }
      const oldMeta = await S.get('meta');
      let meta;
      let key;
      try { ({ meta, key } = await C.recoverAndReset(oldMeta, $('recover-key').value, p1)); } catch (e) {
        if (e instanceof C.WrongSecretError) { failed = true; return; }
        throw e;
      }
      await attemptSucceeded('pass');
      const data = validateData(await C.decryptData(key, await S.get('data')));
      // Nouvelle phrase : l'ancien PIN est retiré aussi (même transaction).
      await S.putMany([['meta', meta]], ['pin']);
      clearInputs('recover-key', 'recover-pass', 'recover-pass2');
      hideSecrets();
      openSession(key, meta, data, startEpoch);
    });
  } catch (e) {
    setMsg('recover-err', isDataProblem(e) ? t('errDataDamaged') : t('errGeneric'));
  } finally {
    busy(false);
    if (failed) updateCountdown();
  }
}

// ---------- Sauvegarde (export) ----------

async function buildBackup(name, type) {
  const box = await saveData(); // on chiffre l'état le plus récent
  const backup = {
    format: 'fp-backup', v: 1, app: APP_VERSION,
    createdAt: new Date().toISOString(),
    meta: session.meta, data: box,
  };
  return new File([JSON.stringify(backup)], name, { type });
}

// Android ne partage que certains types de fichiers : on teste .bak, puis .txt.
async function shareableBackup() {
  if (!navigator.canShare) return null;
  const base = `sika-sauvegarde-${ymd()}`;
  for (const [ext, type] of [['.bak', 'application/octet-stream'], ['.txt', 'text/plain']]) {
    const probe = new File(['x'], base + ext, { type });
    try { if (navigator.canShare({ files: [probe] })) return { name: base + ext, type }; } catch { /* suivant */ }
  }
  return null;
}

async function markBackup(msg) {
  if (!session) return;
  const previous = session.data.lastBackupAt;
  session.data.lastBackupAt = new Date().toISOString();
  try { await saveData(); } catch (e) { if (session) session.data.lastBackupAt = previous; throw e; }
  setMsg('export-msg', msg);
  await renderSettings();
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function onExportDownload() {
  if (isBusy() || !session) return;
  busy(true);
  try {
    const file = await buildBackup(`sika-sauvegarde-${ymd()}.bak`, 'application/octet-stream');
    downloadFile(file);
    await markBackup(t('exportDownloaded', { name: file.name }));
  } catch {
    setMsg('export-msg', t('errGeneric'));
  } finally {
    busy(false);
  }
}

async function onExportShare() {
  if (isBusy() || !session) return;
  const target = await shareableBackup();
  if (!target) return;
  busy(true);
  try {
    const file = await buildBackup(target.name, target.type);
    suppressLockUntil = Date.now() + 120000;
    await navigator.share({ files: [file], title: file.name });
    await markBackup(t('exportShared', { name: file.name }));
  } catch (e) {
    if (!(e && e.name === 'AbortError')) setMsg('export-msg', t('errGeneric'));
  } finally {
    suppressLockUntil = 0;
    busy(false);
  }
}

// ---------- Importer ----------

function goImport() {
  pendingImport = null;
  $('import-file').value = '';
  clearInputs('import-secret', 'import-pass', 'import-pass2');
  setMsg('import-msg', '');
  document.querySelector('input[name="import-mode"][value="pass"]').checked = true;
  syncImportMode();
  show('s-import');
}

function importMode() {
  return document.querySelector('input[name="import-mode"]:checked').value;
}

function syncImportMode() {
  const rec = importMode() === 'rec';
  $('import-newpass').hidden = !rec;
  $('import-secret').autocapitalize = rec ? 'characters' : 'none';
  $('import-secret-label').textContent = rec ? t('recKeyLabel') : t('passLabel');
}

async function onImportFile() {
  suppressLockUntil = 0;
  pendingImport = null;
  setMsg('import-msg', '');
  const f = $('import-file').files[0];
  if (!f) return;
  if (f.size > MAX_IMPORT_BYTES) return setMsg('import-msg', t('importTooBig'));
  try {
    const obj = JSON.parse(await f.text());
    C.validateBackup(obj);
    pendingImport = { meta: C.cleanMeta(obj.meta), data: C.cleanBox(obj.data) };
  } catch {
    setMsg('import-msg', t('importBadFile'));
  }
}

async function onImport() {
  if (isBusy()) return;
  if (!pendingImport) return setMsg('import-msg', t($('import-file').files[0] ? 'importBadFile' : 'importNoFile'));
  const rec = importMode() === 'rec';
  const secret = $('import-secret').value;
  if (!secret) return;
  if (rec) {
    const p1 = $('import-pass').value;
    const err = C.checkPassphrase(p1);
    if (err) return setMsg('import-msg', t(err));
    if (C.normalizePassphrase(p1) !== C.normalizePassphrase($('import-pass2').value)) return setMsg('import-msg', t('errMismatch'));
  }
  const imp = pendingImport;
  busy(true);
  try {
    let meta = imp.meta;
    let key;
    if (rec) {
      ({ meta, key } = await C.recoverAndReset(meta, secret, $('import-pass').value));
    } else {
      key = await C.unlockWithPassphrase(meta, secret);
    }
    const data = validateData(await C.decryptData(key, imp.data));
    busy(false);
    // Montrer les deux dates pour éviter de remplacer du récent par du vieux.
    if (await S.get('meta')) {
      const current = session ? (session.data.updatedAt || session.data.createdAt) : null;
      const text = t('importReplace', {
        backup: formatDate(data.updatedAt || data.createdAt),
        current: formatDate(current),
      });
      if (!(await ask(text))) return;
    }
    const startEpoch = epoch;
    if (pendingImport !== imp) return; // verrouillé pendant la question
    busy(true);
    // Le PIN n'est jamais dans une sauvegarde : on retire l'ancien (même transaction).
    await S.putMany([['meta', meta], ['data', imp.data]], ['pin']);
    await attemptSucceeded('pass');
    pendingImport = null;
    clearInputs('import-secret', 'import-pass', 'import-pass2');
    hideSecrets();
    $('import-file').value = '';
    session = null;
    if (openSession(key, meta, data, startEpoch)) setMsg('home-msg', t('importDone'));
  } catch (e) {
    if (e instanceof C.WrongSecretError) setMsg('import-msg', t('importWrongSecret'));
    else if (e instanceof C.DataError || e instanceof L.DataShapeError) setMsg('import-msg', t('importDamaged'));
    else setMsg('import-msg', t('importBadFile'));
  } finally {
    busy(false);
  }
}

// ---------- Changer la phrase (= tout renouveler) ----------

async function onChangePass() {
  if (isBusy() || !session) return;
  const oldP = $('cp-old').value;
  const p1 = $('cp-new').value;
  $('cp-msg').className = 'error';
  const err = C.checkPassphrase(p1);
  if (err) return setMsg('cp-msg', t(err));
  if (C.normalizePassphrase(p1) !== C.normalizePassphrase($('cp-new2').value)) return setMsg('cp-msg', t('errMismatch'));
  const s = session;
  const startEpoch = epoch;
  busy(true);
  try {
    const { meta, key, recoveryKey } = await C.rotateVault(s.meta, oldP, p1);
    if (startEpoch !== epoch || session !== s) return; // verrouillé : rien n'a changé
    const data = { ...s.data, lastBackupAt: null }; // les anciennes sauvegardes ne suivent plus
    pending = { kind: 'rotate', meta, key, recoveryKey, data };
    clearInputs('cp-old', 'cp-new', 'cp-new2');
    hideSecrets();
    setMsg('cp-msg', '');
    showRecoveryKey(recoveryKey);
  } catch (e) {
    setMsg('cp-msg', e instanceof C.WrongSecretError ? t('wrongCurrentPass') : t('errGeneric'));
  } finally {
    busy(false);
  }
}

function onRecKeyCancel() {
  // Abandon : rien n'a été écrit, l'ancienne phrase reste valable.
  const kind = pending && pending.kind;
  pending = null;
  $('reckey-groups').replaceChildren();
  clearInputs('reckey-verify');
  if (kind === 'rotate' && session) show('s-settings');
  else show('s-welcome');
}

// ---------- Test agenda ----------

function tomorrowAt9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function icsStamp(d, utc = false) {
  const p = (n) => String(n).padStart(2, '0');
  if (utc) {
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  }
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

// Titre neutre : aucun montant, aucun nom.
function onIcs() {
  const start = tomorrowAt9();
  const end = new Date(start.getTime() + 15 * 60000);
  const uid = C.toB64(C.randomBytes(9)).replace(/[+/=]/g, 'x');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sika//v0.4//FR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}@sika`,
    `DTSTAMP:${icsStamp(new Date(), true)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${t('calEventTitle')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${t('calEventTitle')}`, 'TRIGGER:-PT10M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ];
  downloadFile(new File([lines.join('\r\n')], 'test-echeance.ics', { type: 'text/calendar' }));
}

function gcalLink() {
  const start = tomorrowAt9();
  const end = new Date(start.getTime() + 15 * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: t('calEventTitle'),
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ---------- Effacer ----------

async function onWipe() {
  if (isBusy()) return;
  if (!(await ask(t('wipeConfirm'), t('wipeWord')))) return;
  busy(true);
  try {
    await S.clearAll();
    prefs = { lang: prefs.lang, lockMinutes: prefs.lockMinutes };
    await savePrefs();
    await loadGuard();
    lock();
  } finally {
    busy(false);
  }
}

// ---------- Branchements ----------

function wire() {
  for (const b of document.querySelectorAll('[data-lang]')) b.onclick = () => changeLang(b.dataset.lang);
  for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => show(b.dataset.back);
  for (const c of document.querySelectorAll('.show-pass')) {
    c.onchange = () => { for (const id of c.dataset.target.split(',')) $(id).type = c.checked ? 'text' : 'password'; };
  }
  const onEnter = (id, fn) => { $(id).onkeydown = (e) => { if (e.key === 'Enter') fn(); }; };

  $('btn-go-create').onclick = () => { setMsg('create-err', ''); show('s-create'); };
  $('btn-go-restore').onclick = goImport;
  $('btn-create').onclick = onCreate;
  $('reckey-ack').onchange = () => { $('btn-reckey-done').disabled = !$('reckey-ack').checked; };
  $('btn-reckey-done').onclick = onRecKeyDone;
  $('btn-reckey-cancel').onclick = onRecKeyCancel;

  $('btn-unlock').onclick = onUnlock;
  onEnter('lock-pass', onUnlock);
  $('btn-unlock-pin').onclick = onUnlockPin;
  onEnter('lock-pin', onUnlockPin);
  // Ouverture automatique dès que le code a la bonne longueur.
  $('lock-pin').addEventListener('input', () => {
    const v = $('lock-pin').value;
    if (!/^\d*$/.test(v)) $('lock-pin').value = v.replace(/\D/g, '');
    if (pinLen && $('lock-pin').value.length === pinLen) onUnlockPin();
  });
  $('btn-use-pass').onclick = () => goLock(true);
  $('btn-use-pin').onclick = () => goLock(false);
  $('btn-pin-save').onclick = onPinSave;
  $('btn-pin-remove').onclick = onPinRemove;
  $('btn-go-recover').onclick = () => { setMsg('recover-err', ''); show('s-recover'); updateCountdown(); };
  $('btn-recover').onclick = onRecover;
  $('btn-lock-restore').onclick = goImport;

  $('btn-lock').onclick = lock;

  $('btn-export-dl').onclick = onExportDownload;
  $('btn-export-share').onclick = onExportShare;
  $('btn-go-import').onclick = goImport;
  $('btn-change-pass').onclick = onChangePass;
  $('lock-delay').onchange = async () => { prefs.lockMinutes = Number($('lock-delay').value); await savePrefs(); };
  $('btn-ics').onclick = onIcs;
  $('btn-wipe').onclick = onWipe;

  // Le sélecteur de fichier met l'app en arrière-plan : on ne verrouille pas pendant ce temps.
  $('import-file').onclick = () => { suppressLockUntil = Date.now() + 120000; };
  $('import-file').addEventListener('cancel', () => { suppressLockUntil = 0; });
  $('import-file').onchange = onImportFile;
  for (const r of document.querySelectorAll('input[name="import-mode"]')) r.onchange = syncImportMode;
  $('btn-import').onclick = onImport;
  $('btn-import-back').onclick = () => { pendingImport = null; if (session) show('s-settings'); else goLock(); };
}

// ---------- Démarrage ----------

// Le mode hors ligne. Avec la règle "Trusted Types", le navigateur exige
// qu'on déclare l'adresse du script : on n'accepte que ./sw.js.
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

async function init() {
  if (!window.crypto || !crypto.subtle || !window.indexedDB) {
    setLang(navigator.language && navigator.language.startsWith('en') ? 'en' : 'fr');
    setMsg('fatal', t(window.indexedDB ? 'errNoCrypto' : 'errNoStorage'));
    return;
  }
  try {
    const saved = await S.get('prefs');
    if (saved) prefs = { ...prefs, ...sanitizePrefs(saved) };
    else prefs.lang = navigator.language && navigator.language.startsWith('en') ? 'en' : 'fr';
  } catch {
    setMsg('fatal', t('errNoStorage'));
    return;
  }
  setLang(prefs.lang);
  applyI18n(document);
  renderLangChips();
  wire();
  screens.initScreens({
    data: () => (session ? session.data : null),
    save: async () => {
      if (!session) return false;
      busy(true);
      try { await saveData(); return true; } catch { return false; } finally { busy(false); }
    },
    show,
    ask,
    isBusy,
    renderSettings: () => { $('cp-msg').textContent = ''; $('pin-msg').textContent = ''; return renderSettings(); },
    renderHomeExtras,
    suppressLock: (on) => { suppressLockUntil = on ? Date.now() + 120000 : 0; },
  });
  registerServiceWorker();
  await goLock();
}

init();
