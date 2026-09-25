// crypto.js — tout le chiffrement de l'app.
// Aucune bibliothèque externe : on utilise seulement Web Crypto, l'outil
// de chiffrement intégré au navigateur.
//
// Principe (voir la spec, section 3) :
// - Une seule "clé des données" (DEK) chiffre toutes les données (AES-256-GCM).
// - Cette clé est verrouillée deux fois :
//     1. par une clé tirée de la phrase secrète (PBKDF2),
//     2. par une clé tirée de la clé de secours (PBKDF2).
// - Ni la phrase secrète ni la clé de secours ne sont jamais enregistrées.

const enc = new TextEncoder();
const dec = new TextDecoder();

// 600 000 tours de PBKDF2-SHA256 : valeur conseillée par OWASP (à revérifier).
// Le nombre est enregistré avec le coffre, on pourra l'augmenter plus tard.
export const KDF_ITERATIONS = 600000;

// "Étiquettes" liées au chiffrement : un morceau chiffré pour un usage
// ne peut pas être réutilisé pour un autre.
const AAD_PASS = enc.encode('fp-v1-pass');
const AAD_REC = enc.encode('fp-v1-rec');
const AAD_DATA = enc.encode('fp-v1-data');

const SALT_LEN = 16;
const IV_LEN = 12;
const WRAPPED_LEN = 48; // 32 octets de clé + 16 octets de contrôle GCM

// Alphabet "Crockford" : pas de I, L, O, U, pour éviter les confusions à l'écrit.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_BYTES = 20; // 160 bits -> 32 caractères
const RECOVERY_LEN = 32;

export class WrongSecretError extends Error {
  constructor(msg = 'wrong-secret') { super(msg); this.name = 'WrongSecretError'; }
}
export class FormatError extends Error {
  constructor(msg = 'bad-format') { super(msg); this.name = 'FormatError'; }
}
// La clé est bonne, mais les données chiffrées sont abîmées ou modifiées.
export class DataError extends Error {
  constructor(msg = 'data-damaged') { super(msg); this.name = 'DataError'; }
}

// ---------- Petits outils ----------

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(bytes) {
  const u = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
    throw new FormatError('b64');
  }
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

// ---------- Phrase secrète ----------

// Même phrase = même résultat, même si le clavier ajoute des espaces en trop.
// Les majuscules comptent.
export function normalizePassphrase(p) {
  return String(p).normalize('NFC').trim().replace(/\s+/g, ' ');
}

// Renvoie null si la phrase est acceptable, sinon le code de l'erreur.
export function checkPassphrase(p) {
  const n = normalizePassphrase(p);
  if (n.length < 20) return 'errPassShort';
  const words = n.toLowerCase().split(/[\s\-_.]+/).filter((w) => w.length >= 2);
  if (new Set(words).size < 4) return 'errPassWords';
  return null;
}

// ---------- Clé de secours ----------

export function generateRecoveryKey() {
  const bytes = randomBytes(RECOVERY_BYTES);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // garder seulement les bits pas encore utilisés
  }
  return out; // 32 caractères exactement (160 / 5)
}

export function formatRecoveryKey(k) {
  return k.match(/.{1,4}/g).join('-');
}

// Accepte minuscules, espaces et tirets. Corrige O->0, I/L->1.
// Renvoie null si la saisie n'a pas la bonne forme.
export function normalizeRecoveryKey(input) {
  const s = String(input).toUpperCase().replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_LEN) return null;
  for (const ch of s) if (!B32.includes(ch)) return null;
  return s;
}

// ---------- Dérivation et verrouillage de clé ----------

async function deriveKek(secret, salt, iterations) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']);
}

async function wrapWith(dek, kek, salt, aad) {
  const iv = randomBytes(IV_LEN);
  const wrapped = await crypto.subtle.wrapKey(
    'raw', dek, kek, { name: 'AES-GCM', iv, additionalData: aad });
  return { salt: toB64(salt), iv: toB64(iv), wrapped: toB64(wrapped) };
}

async function unwrapWith(w, kek, aad, extractable) {
  try {
    return await crypto.subtle.unwrapKey(
      'raw', fromB64(w.wrapped), kek,
      { name: 'AES-GCM', iv: fromB64(w.iv), additionalData: aad },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt']);
  } catch {
    // Mauvais secret OU fichier modifié : on ne peut pas faire la différence.
    throw new WrongSecretError();
  }
}

// ---------- Contrôle des formats (surtout pour les fichiers importés) ----------

function checkLen(b64, len) {
  if (fromB64(b64).length !== len) throw new FormatError('len');
}

export function validateMeta(m) {
  if (!isObj(m) || m.format !== 'fp-vault' || m.v !== 1) throw new FormatError('meta');
  const it = isObj(m.kdf) ? m.kdf.iterations : undefined;
  if (!Number.isInteger(it) || it < 100000 || it > 10000000) throw new FormatError('kdf');
  for (const k of ['pass', 'rec']) {
    const w = m[k];
    if (!isObj(w)) throw new FormatError(k);
    checkLen(w.salt, SALT_LEN);
    checkLen(w.iv, IV_LEN);
    checkLen(w.wrapped, WRAPPED_LEN);
  }
}

export function validateBox(b) {
  if (!isObj(b)) throw new FormatError('box');
  checkLen(b.iv, IV_LEN);
  if (typeof b.ct !== 'string' || b.ct.length > 60_000_000) throw new FormatError('ct');
  if (fromB64(b.ct).length < 16) throw new FormatError('ct');
}

export function validateBackup(o) {
  if (!isObj(o) || o.format !== 'fp-backup' || o.v !== 1) throw new FormatError('backup');
  validateMeta(o.meta);
  validateBox(o.data);
}

// ---------- Opérations du coffre ----------

// Crée un nouveau coffre. Rien n'est enregistré ici.
// Renvoie : meta (à enregistrer), key (clé de session, non exportable),
// recoveryKey (à montrer une seule fois).
export async function createVault(passphrase, iterations = KDF_ITERATIONS) {
  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const recoveryKey = generateRecoveryKey();

  const passSalt = randomBytes(SALT_LEN);
  const recSalt = randomBytes(SALT_LEN);
  const passKek = await deriveKek(normalizePassphrase(passphrase), passSalt, iterations);
  const recKek = await deriveKek(recoveryKey, recSalt, iterations);

  const meta = {
    format: 'fp-vault',
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations },
    pass: await wrapWith(dek, passKek, passSalt, AAD_PASS),
    rec: await wrapWith(dek, recKek, recSalt, AAD_REC),
  };
  // Pour la session, on reprend la clé sous une forme NON exportable.
  const key = await unwrapWith(meta.pass, passKek, AAD_PASS, false);
  return { meta, key, recoveryKey };
}

export async function unlockWithPassphrase(meta, passphrase, extractable = false) {
  validateMeta(meta);
  const kek = await deriveKek(normalizePassphrase(passphrase),
    fromB64(meta.pass.salt), meta.kdf.iterations);
  return unwrapWith(meta.pass, kek, AAD_PASS, extractable);
}

export async function unlockWithRecovery(meta, recoveryInput, extractable = false) {
  validateMeta(meta);
  const rk = normalizeRecoveryKey(recoveryInput);
  if (!rk) throw new WrongSecretError('recovery-format');
  const kek = await deriveKek(rk, fromB64(meta.rec.salt), meta.kdf.iterations);
  return unwrapWith(meta.rec, kek, AAD_REC, extractable);
}

// Changer de phrase = tout renouveler : nouvelle clé des données ET nouvelle
// clé de secours. Ainsi, une ancienne phrase (ou une ancienne sauvegarde)
// ne donne jamais accès aux nouvelles données.
// Vérifie d'abord l'ancienne phrase. Renvoie { meta, key, recoveryKey }.
export async function rotateVault(meta, oldPass, newPass) {
  await unlockWithPassphrase(meta, oldPass);
  return createVault(newPass, Math.max(meta.kdf.iterations, KDF_ITERATIONS));
}

// Phrase oubliée : ouvre avec la clé de secours et pose une nouvelle phrase.
// Renvoie { meta, key } — meta à enregistrer, key pour la session.
export async function recoverAndReset(meta, recoveryInput, newPass) {
  validateMeta(meta);
  const rk = normalizeRecoveryKey(recoveryInput);
  if (!rk) throw new WrongSecretError('recovery-format');
  const recKek = await deriveKek(rk, fromB64(meta.rec.salt), meta.kdf.iterations);
  const dek = await unwrapWith(meta.rec, recKek, AAD_REC, true);
  const salt = randomBytes(SALT_LEN);
  const kek = await deriveKek(normalizePassphrase(newPass), salt, meta.kdf.iterations);
  const newMeta = { ...meta, pass: await wrapWith(dek, kek, salt, AAD_PASS) };
  const key = await unwrapWith(meta.rec, recKek, AAD_REC, false);
  return { meta: newMeta, key };
}

// ---------- Données ----------

export async function encryptData(key, obj) {
  const iv = randomBytes(IV_LEN); // nouvel IV à chaque enregistrement
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD_DATA }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptData(key, box) {
  validateBox(box);
  let pt;
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(box.iv), additionalData: AAD_DATA }, key, fromB64(box.ct));
  } catch {
    throw new DataError();
  }
  return JSON.parse(dec.decode(pt));
}

// Ne garde que les champs connus (un fichier importé peut en contenir d'autres).
export function cleanMeta(m) {
  validateMeta(m);
  const w = (x) => ({ salt: x.salt, iv: x.iv, wrapped: x.wrapped });
  return {
    format: 'fp-vault', v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: m.kdf.iterations },
    pass: w(m.pass), rec: w(m.rec),
  };
}

export function cleanBox(b) {
  validateBox(b);
  return { iv: b.iv, ct: b.ct };
}
