// app.js — le "chef d'orchestre" : écrans, verrouillage, sauvegardes.
// Étape 1 du plan (v0.1) : le coffre-fort. Aucune donnée réelle.

import * as C from './crypto.js';
import * as S from './store.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';

const APP_VERSION = '0.2';
const DATA_SCHEMA = 1;
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
let prefs = { lang: 'fr', lockMinutes: 3, failures: 0, retryAt: 0 };
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
  window.scrollTo(0, 0);
}

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
  if (p && Number.isInteger(p.failures) && p.failures >= 0) out.failures = p.failures;
  // Si l'horloge du téléphone a sauté, l'attente ne dépasse jamais 5 min.
  if (p && Number.isFinite(p.retryAt) && p.retryAt >= 0) out.retryAt = Math.min(p.retryAt, Date.now() + MAX_DELAY_S * 1000);
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
function ask(text, word) {
  return new Promise((resolve) => {
    $('modal-text').textContent = text;
    const input = $('modal-input');
    input.hidden = !word;
    input.value = '';
    $('modal').hidden = false;
    const done = (ok) => {
      $('modal').hidden = true;
      $('modal-ok').onclick = null;
      $('modal-cancel').onclick = null;
      resolve(ok);
    };
    $('modal-ok').onclick = () => {
      if (word && input.value.trim().toUpperCase() !== word) { input.focus(); return; }
      done(true);
    };
    $('modal-cancel').onclick = () => done(false);
    if (word) input.focus();
  });
}

// ---------- Données ----------

function newData() {
  const now = new Date().toISOString();
  return { schema: DATA_SCHEMA, createdAt: now, updatedAt: now, testNote: '', lastBackupAt: null };
}

function validateData(d) {
  if (!d || typeof d !== 'object' || d.schema !== DATA_SCHEMA) throw new C.FormatError('data');
  if (typeof d.testNote !== 'string' || d.testNote.length > 2000) throw new C.FormatError('note');
  if (d.lastBackupAt !== null && typeof d.lastBackupAt !== 'string') throw new C.FormatError('backupAt');
  return d;
}

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
  renderHome();
  show('s-home');
  return true;
}

function lock() {
  epoch += 1;
  session = null;
  pending = null;
  pendingImport = null;
  // Effacer ce qui est affiché. (JavaScript ne permet pas d'effacer la
  // mémoire elle-même : on retire les références, le navigateur libère.)
  clearInputs('test-note', 'lock-pass', 'cp-old', 'cp-new', 'cp-new2', 'reckey-verify',
    'import-secret', 'import-pass', 'import-pass2', 'recover-key', 'recover-pass', 'recover-pass2');
  $('reckey-groups').replaceChildren();
  $('import-file').value = '';
  $('modal').hidden = true;
  hideSecrets();
  for (const id of ['note-msg', 'export-msg', 'cp-msg', 'import-msg', 'home-msg']) setMsg(id, '');
  goLock();
}

async function goLock() {
  const meta = await S.get('meta');
  if (!meta) { show('s-welcome'); return; }
  show('s-lock');
  updateCountdown();
}

function registerFailure() {
  prefs.failures += 1;
  const delay = Math.min(2 ** (prefs.failures - 1), MAX_DELAY_S);
  prefs.retryAt = Date.now() + delay * 1000;
  return savePrefs();
}

function resetFailures() {
  prefs.failures = 0;
  prefs.retryAt = 0;
  return savePrefs();
}

// Bloque les boutons Ouvrir tant que l'attente n'est pas finie.
function updateCountdown() {
  clearInterval(countdownTimer);
  const buttons = [$('btn-unlock'), $('btn-recover')];
  const tick = () => {
    if (isBusy()) return;
    const left = Math.ceil((prefs.retryAt - Date.now()) / 1000);
    if (left > 0) {
      for (const b of buttons) b.disabled = true;
      const msg = t('wrongSecret') + ' ' + t('waitSeconds', { s: left });
      setMsg('lock-msg', msg);
      setMsg('recover-err', msg);
    } else {
      clearInterval(countdownTimer);
      for (const b of buttons) b.disabled = false;
      const msg = prefs.failures > 0 ? t('wrongSecret') : '';
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

function renderHome() {
  $('test-note').value = session.data.testNote;
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
  if (session) { renderHome(); if (!$('s-settings').hidden) await renderSettings(); }
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
    await S.putMany([['meta', p.meta], ['data', box]]);
    await resetFailures();
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
  if (Date.now() < prefs.retryAt) return updateCountdown();
  const pass = $('lock-pass').value;
  if (!pass) return;
  const startEpoch = epoch;
  let failed = false;
  busy(true);
  try {
    const meta = await S.get('meta');
    const key = await C.unlockWithPassphrase(meta, pass);
    await resetFailures();
    const data = validateData(await C.decryptData(key, await S.get('data')));
    clearInputs('lock-pass');
    hideSecrets();
    setMsg('lock-msg', '');
    openSession(key, meta, data, startEpoch);
  } catch (e) {
    if (e instanceof C.WrongSecretError) { await registerFailure(); clearInputs('lock-pass'); failed = true; }
    else if (e instanceof C.DataError || e instanceof C.FormatError) setMsg('lock-msg', t('errDataDamaged'));
    else setMsg('lock-msg', t('errGeneric'));
  } finally {
    busy(false);
    if (failed) updateCountdown();
  }
}

async function onRecover() {
  if (isBusy()) return;
  if (Date.now() < prefs.retryAt) return updateCountdown();
  const p1 = $('recover-pass').value;
  const p2 = $('recover-pass2').value;
  const err = C.checkPassphrase(p1);
  if (err) return setMsg('recover-err', t(err));
  if (C.normalizePassphrase(p1) !== C.normalizePassphrase(p2)) return setMsg('recover-err', t('errMismatch'));
  const startEpoch = epoch;
  let failed = false;
  busy(true);
  try {
    const oldMeta = await S.get('meta');
    const { meta, key } = await C.recoverAndReset(oldMeta, $('recover-key').value, p1);
    await resetFailures();
    const data = validateData(await C.decryptData(key, await S.get('data')));
    await S.put('meta', meta);
    clearInputs('recover-key', 'recover-pass', 'recover-pass2');
    hideSecrets();
    openSession(key, meta, data, startEpoch);
  } catch (e) {
    if (e instanceof C.WrongSecretError) { await registerFailure(); failed = true; }
    else if (e instanceof C.DataError || e instanceof C.FormatError) setMsg('recover-err', t('errDataDamaged'));
    else setMsg('recover-err', t('errGeneric'));
  } finally {
    busy(false);
    if (failed) updateCountdown();
  }
}

// ---------- Note de test ----------

async function onSaveNote() {
  if (isBusy() || !session) return;
  session.data.testNote = $('test-note').value.slice(0, 2000);
  busy(true);
  try {
    await saveData();
    if (session) setMsg('note-msg', t('noteSaved'));
  } catch {
    setMsg('note-msg', t('errGeneric'));
  } finally {
    busy(false);
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
  session.data.lastBackupAt = new Date().toISOString();
  await saveData();
  setMsg('export-msg', msg);
  await renderSettings();
  renderHome();
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
    await S.putMany([['meta', meta], ['data', imp.data]]);
    await resetFailures();
    pendingImport = null;
    clearInputs('import-secret', 'import-pass', 'import-pass2');
    hideSecrets();
    $('import-file').value = '';
    session = null;
    if (openSession(key, meta, data, startEpoch)) setMsg('home-msg', t('importDone'));
  } catch (e) {
    if (e instanceof C.WrongSecretError) setMsg('import-msg', t('importWrongSecret'));
    else if (e instanceof C.DataError) setMsg('import-msg', t('importDamaged'));
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
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sika//v0.2//FR', 'CALSCALE:GREGORIAN',
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
    prefs = { lang: prefs.lang, lockMinutes: prefs.lockMinutes, failures: 0, retryAt: 0 };
    await savePrefs();
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
  $('btn-go-recover').onclick = () => { setMsg('recover-err', ''); show('s-recover'); updateCountdown(); };
  $('btn-recover').onclick = onRecover;
  $('btn-lock-restore').onclick = goImport;

  $('btn-lock').onclick = lock;
  $('btn-save-note').onclick = onSaveNote;
  $('btn-go-settings').onclick = async () => { $('cp-msg').textContent = ''; await renderSettings(); show('s-settings'); };

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
  registerServiceWorker();
  await goLock();
}

init();
