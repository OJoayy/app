// store.js — enregistrement sur le téléphone (IndexedDB).
// On ne range ici que des choses déjà chiffrées, plus quelques réglages
// sans valeur (langue, délai de verrouillage, compteur d'erreurs).
//
// Clés utilisées :
//   'meta'  -> clés verrouillées + paramètres (pas secret sans la phrase)
//   'data'  -> toutes les données, chiffrées
//   'prefs' -> réglages non sensibles

const DB_NAME = 'finances-perso';
const STORE = 'kv';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const get = (key) => run('readonly', (s) => s.get(key));
export const put = (key, value) => run('readwrite', (s) => s.put(value, key));
export const del = (key) => run('readwrite', (s) => s.delete(key));
export const clearAll = () => run('readwrite', (s) => s.clear());

// Écrit plusieurs clés d'un coup : tout passe, ou rien ne passe.
export const putMany = (entries) => run('readwrite', (s) => {
  for (const [k, v] of entries) s.put(v, k);
  return null;
});
