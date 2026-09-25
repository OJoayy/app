// i18n.js — tous les textes de l'app, en français et en anglais.
// Pour changer un texte : modifier la ligne ici, rien d'autre.

const T = {
  fr: {
    appName: 'Finances Perso',
    loading: 'Chargement…',
    working: 'Un instant…',
    back: 'Retour',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    save: 'Enregistrer',
    settings: 'Réglages',
    showPass: 'Afficher',

    welcomeIntro: 'Ton argent, sur ton téléphone seulement. Choisis ta langue, puis crée ton coffre.',
    createVault: 'Créer mon coffre',
    restoreBackup: 'Restaurer une sauvegarde',

    createTitle: 'Ta phrase secrète',
    createRules: 'Elle ouvre ton coffre. Personne ne peut la retrouver pour toi.',
    createTip1: 'Au moins 4 mots différents et 20 caractères. Exemple de forme : « tortue lampe marché cinq nuage ».',
    createTip2: 'Choisis les mots au hasard (dé, livre ouvert au hasard). Jamais une phrase connue.',
    createTip3: 'Ne l’utilise nulle part ailleurs. Refuse si le téléphone propose de l’enregistrer.',
    passLabel: 'Phrase secrète',
    passConfirmLabel: 'Retape la phrase',
    newPassLabel: 'Nouvelle phrase secrète',
    currentPassLabel: 'Phrase actuelle',
    createBtn: 'Créer le coffre',
    errPassShort: 'Trop court : au moins 20 caractères.',
    errPassWords: 'Il faut au moins 4 mots différents.',
    errMismatch: 'Les deux phrases ne sont pas identiques.',

    recTitle: 'Ta clé de secours',
    recIntro: 'Si tu oublies ta phrase, cette clé est le seul moyen d’ouvrir ton coffre. Elle ne sera plus jamais affichée.',
    recTip1: 'Écris-la à la main sur papier, en 2 exemplaires, rangés dans 2 endroits sûrs.',
    recTip2: 'Jamais en photo, jamais dans un message, jamais dans le cloud.',
    recTip3: 'Quelqu’un qui a cette clé ET une sauvegarde peut lire tes données.',
    recAck: 'Je l’ai écrite sur papier et rangée.',
    recVerifyLabel: 'Pour vérifier ta copie papier : retape toute la clé (les tirets sont facultatifs)',
    recCancel: 'Annuler (rien ne sera changé)',
    recVerifyErr: 'Ça ne correspond pas. Vérifie ce que tu as écrit.',
    recDone: 'C’est fait, ouvrir mon coffre',

    lockIntro: 'Coffre verrouillé.',
    unlockBtn: 'Ouvrir',
    forgotPass: 'Phrase oubliée ? Utiliser la clé de secours',
    wrongSecret: 'Secret incorrect.',
    waitSeconds: 'Réessaie dans {s} s.',

    recoverTitle: 'Clé de secours',
    recoverIntro: 'Tape ta clé de secours, puis choisis une nouvelle phrase secrète.',
    recKeyLabel: 'Clé de secours',
    recoverBtn: 'Ouvrir et changer la phrase',

    lockBtn: 'Verrouiller',
    homeVaultTitle: 'Coffre ouvert',
    homeVaultText: 'Version de test : la sécurité et la sauvegarde d’abord. N’entre que des données fictives.',
    versionLine: 'Version {v}',
    backupNever: 'Aucune sauvegarde faite. Va dans Réglages → Sauvegarde.',
    backupOld: 'Dernière sauvegarde il y a {d} jours. Fais-en une nouvelle.',
    testNoteTitle: 'Note de test',
    testNoteHelp: 'Écris une phrase fictive. Après une restauration, elle doit réapparaître à l’identique.',
    noteSaved: 'Enregistré et chiffré.',

    backupTitle: 'Sauvegarde',
    backupHelp: 'Le fichier est chiffré. Range-le dans 2 endroits (ex. Google Drive et ordinateur).',
    lastBackup: 'Dernière sauvegarde : {date}',
    lastBackupNever: 'Dernière sauvegarde : jamais',
    exportDownload: 'Télécharger la sauvegarde',
    exportShare: 'Partager la sauvegarde (Drive…)',
    exportDownloaded: 'Sauvegarde créée : {name}. Vérifie qu’elle est bien dans Téléchargements.',
    exportShared: 'Sauvegarde partagée : {name}. Vérifie qu’elle est bien arrivée.',
    importBtn: 'Importer une sauvegarde',

    changePassTitle: 'Changer la phrase secrète',
    changePassBtn: 'Changer la phrase',
    changePassHelp: 'Changer la phrase renouvelle aussi la clé des données et la clé de secours. Prépare du papier.',
    changePassDone: 'Nouvelle phrase et nouvelle clé de secours actives. Détruis l’ancienne clé papier. Fais une sauvegarde maintenant : les anciennes ne contiennent pas tes nouvelles données.',
    wrongCurrentPass: 'Phrase actuelle incorrecte.',

    langTitle: 'Langue',
    lockDelayTitle: 'Verrouillage automatique après',

    calTitle: 'Test agenda',
    calHelp: 'Crée un faux rappel pour demain 9 h. Dis-moi lequel des deux marche sur ton téléphone.',
    calIcs: 'Télécharger un fichier agenda (.ics)',
    calLink: 'Ouvrir le lien Google Agenda',
    calEventTitle: 'Échéance (test)',

    storageTitle: 'Stockage',
    storagePersisted: 'Stockage protégé : Android ne doit pas effacer les données tout seul.',
    storageNotPersisted: 'Stockage non protégé : Android pourrait effacer les données s’il manque de place. Installe l’app sur l’écran d’accueil, puis rouvre-la.',
    storageUnknown: 'État du stockage inconnu sur ce navigateur.',

    wipeTitle: 'Effacer ce téléphone',
    wipeHelp: 'Supprime le coffre de ce téléphone. Seule une sauvegarde pourra le ramener.',
    wipeBtn: 'Effacer le coffre',
    wipeConfirm: 'Tout effacer sur ce téléphone ? Tape EFFACER pour confirmer.',
    wipeWord: 'EFFACER',

    importTitle: 'Importer une sauvegarde',
    importIntro: 'Choisis le fichier, puis tape la phrase secrète qui était valable quand la sauvegarde a été faite.',
    importFileLabel: 'Fichier de sauvegarde',
    importModePass: 'Avec la phrase',
    importModeRec: 'Avec la clé de secours',
    importNewPassHelp: 'Avec la clé de secours, tu dois aussi choisir une nouvelle phrase secrète.',
    importCheckBtn: 'Vérifier et importer',
    importNoFile: 'Choisis d’abord un fichier.',
    importBadFile: 'Ce fichier n’est pas une sauvegarde valide.',
    importTooBig: 'Fichier trop gros.',
    importWrongSecret: 'Secret incorrect, ou fichier abîmé.',
    importDamaged: 'Le secret est bon, mais les données du fichier sont abîmées.',
    importReplace: 'Remplacer toutes les données de ce téléphone ? Sauvegarde du : {backup}. Données actuelles du : {current}.',
    importDone: 'Sauvegarde importée.',

    errNoStorage: 'Ce navigateur ne permet pas d’enregistrer des données (mode privé ?). Ouvre l’app dans Chrome normal.',
    errGeneric: 'Erreur inattendue. Réessaie.',
    errDataDamaged: 'Le secret est bon, mais les données de ce téléphone sont abîmées. Utilise « Restaurer une sauvegarde » ci-dessous.',
    errNoCrypto: 'Ce navigateur n’a pas les outils de chiffrement nécessaires. Mets Chrome à jour.',
  },

  en: {
    appName: 'Personal Finances',
    loading: 'Loading…',
    working: 'One moment…',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    settings: 'Settings',
    showPass: 'Show',

    welcomeIntro: 'Your money, on your phone only. Pick your language, then create your vault.',
    createVault: 'Create my vault',
    restoreBackup: 'Restore a backup',

    createTitle: 'Your passphrase',
    createRules: 'It opens your vault. Nobody can recover it for you.',
    createTip1: 'At least 4 different words and 20 characters. Example shape: “turtle lamp market five cloud”.',
    createTip2: 'Pick the words at random (dice, a book opened at random). Never a known phrase.',
    createTip3: 'Use it nowhere else. Say no if the phone offers to save it.',
    passLabel: 'Passphrase',
    passConfirmLabel: 'Type the phrase again',
    newPassLabel: 'New passphrase',
    currentPassLabel: 'Current passphrase',
    createBtn: 'Create the vault',
    errPassShort: 'Too short: at least 20 characters.',
    errPassWords: 'You need at least 4 different words.',
    errMismatch: 'The two phrases are not the same.',

    recTitle: 'Your recovery key',
    recIntro: 'If you forget your passphrase, this key is the only way to open your vault. It will never be shown again.',
    recTip1: 'Write it by hand on paper, 2 copies, kept in 2 safe places.',
    recTip2: 'Never a photo, never in a message, never in the cloud.',
    recTip3: 'Anyone with this key AND a backup can read your data.',
    recAck: 'I wrote it on paper and put it away.',
    recVerifyLabel: 'To check your paper copy: type the whole key again (dashes optional)',
    recCancel: 'Cancel (nothing will change)',
    recVerifyErr: 'That does not match. Check what you wrote.',
    recDone: 'Done, open my vault',

    lockIntro: 'Vault locked.',
    unlockBtn: 'Open',
    forgotPass: 'Forgot your phrase? Use the recovery key',
    wrongSecret: 'Wrong secret.',
    waitSeconds: 'Try again in {s} s.',

    recoverTitle: 'Recovery key',
    recoverIntro: 'Type your recovery key, then choose a new passphrase.',
    recKeyLabel: 'Recovery key',
    recoverBtn: 'Open and change the phrase',

    lockBtn: 'Lock',
    homeVaultTitle: 'Vault open',
    homeVaultText: 'Test version: security and backup first. Enter fake data only.',
    versionLine: 'Version {v}',
    backupNever: 'No backup yet. Go to Settings → Backup.',
    backupOld: 'Last backup {d} days ago. Make a new one.',
    testNoteTitle: 'Test note',
    testNoteHelp: 'Write a fake sentence. After a restore, it must come back exactly the same.',
    noteSaved: 'Saved and encrypted.',

    backupTitle: 'Backup',
    backupHelp: 'The file is encrypted. Keep it in 2 places (e.g. Google Drive and a computer).',
    lastBackup: 'Last backup: {date}',
    lastBackupNever: 'Last backup: never',
    exportDownload: 'Download the backup',
    exportShare: 'Share the backup (Drive…)',
    exportDownloaded: 'Backup created: {name}. Check that it is in Downloads.',
    exportShared: 'Backup shared: {name}. Check that it arrived.',
    importBtn: 'Import a backup',

    changePassTitle: 'Change the passphrase',
    changePassBtn: 'Change the phrase',
    changePassHelp: 'Changing the phrase also renews the data key and the recovery key. Have paper ready.',
    changePassDone: 'New phrase and new recovery key are active. Destroy the old paper key. Make a backup now: old ones do not hold your new data.',
    wrongCurrentPass: 'Current passphrase is wrong.',

    langTitle: 'Language',
    lockDelayTitle: 'Auto-lock after',

    calTitle: 'Calendar test',
    calHelp: 'Creates a fake reminder for tomorrow 9 am. Tell me which of the two works on your phone.',
    calIcs: 'Download a calendar file (.ics)',
    calLink: 'Open the Google Calendar link',
    calEventTitle: 'Payment due (test)',

    storageTitle: 'Storage',
    storagePersisted: 'Storage protected: Android should not erase the data on its own.',
    storageNotPersisted: 'Storage not protected: Android could erase the data if space runs low. Install the app on the home screen, then reopen it.',
    storageUnknown: 'Storage status unknown on this browser.',

    wipeTitle: 'Erase this phone',
    wipeHelp: 'Deletes the vault from this phone. Only a backup can bring it back.',
    wipeBtn: 'Erase the vault',
    wipeConfirm: 'Erase everything on this phone? Type ERASE to confirm.',
    wipeWord: 'ERASE',

    importTitle: 'Import a backup',
    importIntro: 'Pick the file, then type the passphrase that was valid when the backup was made.',
    importFileLabel: 'Backup file',
    importModePass: 'With the phrase',
    importModeRec: 'With the recovery key',
    importNewPassHelp: 'With the recovery key, you must also choose a new passphrase.',
    importCheckBtn: 'Check and import',
    importNoFile: 'Pick a file first.',
    importBadFile: 'This file is not a valid backup.',
    importTooBig: 'File too big.',
    importWrongSecret: 'Wrong secret, or damaged file.',
    importDamaged: 'The secret is right, but the data in the file is damaged.',
    importReplace: 'Replace all data on this phone? Backup from: {backup}. Current data from: {current}.',
    importDone: 'Backup imported.',

    errNoStorage: 'This browser cannot save data (private mode?). Open the app in normal Chrome.',
    errGeneric: 'Unexpected error. Try again.',
    errDataDamaged: 'The secret is right, but the data on this phone is damaged. Use “Restore a backup” below.',
    errNoCrypto: 'This browser lacks the needed encryption tools. Update Chrome.',
  },
};

let lang = 'fr';

export function setLang(l) {
  lang = T[l] ? l : 'fr';
  document.documentElement.lang = lang;
}

export function getLang() {
  return lang;
}

export function t(key, vars = {}) {
  const s = T[lang][key] ?? T.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Remplit tous les éléments marqués data-i18n (texte seulement, jamais de HTML).
export function applyI18n(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  document.title = t('appName');
}
