# SIKA — v0.7

- **Étape 1 :** le coffre-fort (chiffrement, phrase secrète, clé de secours, sauvegarde).
- **Étape 2 :** comptes, pools, revenus, dépenses, transferts, Go/No-Go.
- **v0.4 :** code PIN, images de compte, bouton retour d'Android, look plus compact.
- **v0.5 (étape 3) :** solde en FCFA, £ et €, mode discret (œil), bouton + flottant, PIN à 7 chiffres en cases rondes, œil dans les champs secrets.
- **Nouveau en v0.6 (étapes 4 et 5) :** gestionnaire de dettes et gestionnaire d'investissements. Mode discret en étoiles, seulement sur le solde principal.
- **Nouveau en v0.7 :** bouton + réorganisé (Dépense et Revenu côte à côte en bas), mode discret aussi sur les dettes, flèche des dates alignée, « Solde des pools » sur la page Comptes.
- **Réglages (v0.6) :** ils ne sont plus dans la barre du bas. Touche l'icône en haut à gauche du Dashboard.

**Règle : n'entre que des données fictives jusqu'à la fin de l'étape 7.**

---

## 1. Avant de commencer : un compte GitHub réservé à l'app

**Pourquoi ?** Tous les sites GitHub Pages d'un même compte partagent la même adresse (`[COMPTE].github.io`). Si ce compte publie un autre site, ou en publie un un jour, ce site pourrait lire ou effacer les données de l'app sur ton téléphone.

**Ce qu'il faut faire :**

1. Crée un nouveau compte GitHub gratuit qui ne servira qu'à cette app. Il faut une adresse e-mail : [EMAIL].
2. Choisis un nom de compte neutre, sans ton nom ni le mot « finance ». Il apparaîtra dans l'adresse de l'app.
3. Active la **double authentification (2FA)** : Settings → Password and authentication → Two-factor authentication. Utilise une app d'authentification, pas les SMS.
4. Range le mot de passe du compte ([MOTDEPASSE]) et ses codes de secours dans un endroit sûr.

**Pourquoi la 2FA est obligatoire :** quelqu'un qui prend ce compte peut remplacer le code de l'app par un faux, qui volerait ta phrase secrète la prochaine fois que tu l'ouvres.

## 2. Mettre l'app en ligne (sans installer de logiciel)

1. Connecte-toi au compte réservé, sur un ordinateur.
2. Clique **+** (en haut à droite) → **New repository**.
3. Nom du dépôt : `app`. Visibilité : **Public**. Coche **Add a README file**. Clique **Create repository**.
4. Dans le dépôt : **Add file** → **Upload files**.
5. Décompresse le fichier `sika-v0.5.zip` sur l'ordinateur. Ouvre le dossier `sika`, sélectionne **tout ce qu'il contient** (pas le dossier lui-même) et glisse-le dans la page GitHub. Les dossiers `css`, `js` et `icons` doivent apparaître.
6. En bas, clique **Commit changes**.
7. Va dans **Settings** → **Pages**. Sous « Build and deployment » : Source = **Deploy from a branch**, Branch = **main**, dossier **/ (root)**. Clique **Save**.
8. Attends 1 à 3 minutes. L'adresse de l'app s'affiche en haut de la page Pages : `https://[COMPTE].github.io/app/`.

Le code est public. Ce n'est pas un problème : il ne contient aucun secret et aucune donnée. Tes données restent sur ton téléphone.

## 3. Installer l'app sur ton téléphone Android

1. Ouvre **Chrome** (pas un autre navigateur, pas un onglet privé).
2. Va à l'adresse `https://[COMPTE].github.io/app/`.
3. Menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil** → **Installer**).
4. Ferme Chrome. À partir de maintenant, ouvre toujours l'app **depuis son icône**.

## 4. Premier lancement

1. Choisis la langue, puis **Créer mon coffre**.
2. **Phrase secrète :** au moins 4 mots différents choisis au hasard, par exemple en ouvrant un livre à des pages au hasard. Les majuscules comptent. Si Android ou Google propose de l'enregistrer, **refuse**.
3. **Clé de secours :** 32 caractères, en 8 groupes. **Recopie-la à la main** sur papier, en 2 exemplaires, rangés dans 2 endroits différents. Pas de photo, pas de PDF, pas de message.
   - La clé ne contient jamais les lettres I, L, O ni U. Un rond est donc toujours un **zéro**.
4. Retape la clé **en entier** depuis ton papier. Si ça ne correspond pas, ta copie contient une faute : corrige le papier.

## 5. Tests de l'étape 1 (données fictives seulement)

Fais-les dans l'ordre et note ce qui ne se passe pas comme prévu.

| # | Action | Résultat attendu |
| --- | --- | --- |
| 1 | Écris une note fictive, puis **Enregistrer** | « Enregistré et chiffré. » |
| 2 | **Verrouiller**, puis ouvrir avec une mauvaise phrase, 2 fois | Un message d'attente qui grandit (1 s, puis 2 s) |
| 3 | Ouvrir avec la bonne phrase | La note est là |
| 4 | Ne touche à rien pendant 3 min | Le coffre se verrouille tout seul |
| 5 | Ouvre l'app, puis appuie sur le bouton d'accueil du téléphone et reviens | Le coffre est verrouillé |
| 6 | Coupe le Wi-Fi et les données mobiles, puis ferme et rouvre l'app | L'app s'ouvre quand même |
| 7 | Réglages → **Télécharger la sauvegarde** | Un fichier `sika-sauvegarde-AAAA-MM-JJ.bak` apparaît dans Téléchargements |
| 8 | Si le bouton **Partager** s'affiche : envoie la sauvegarde vers Google Drive | Le fichier est dans Drive |
| 9 | Réglages → **Stockage** | Note ce qui est écrit (« protégé » ou « non protégé ») |
| 10 | Réglages → **Test agenda** : essaie les 2 boutons | Note lequel ajoute un rappel dans ton agenda |
| 11 | Réglages → **Effacer le coffre** (tape EFFACER) | Écran de bienvenue |
| 12 | **Restaurer une sauvegarde** → choisis le fichier du test 7 → ta phrase | La note fictive revient à l'identique |
| 13 | Verrouiller → **Phrase oubliée** → ta clé de secours papier + une nouvelle phrase | Le coffre s'ouvre, la note est là |

**L'étape 1 est finie quand :** le test 12 marche, et on sait lequel des 2 boutons du test 10 fonctionne.

Envoie-moi les résultats des tests 8, 9 et 10, et tout ce qui a cloché. Ne m'envoie jamais ta phrase, ta clé de secours ni un fichier de sauvegarde.

## 5 bis. Tests de l'étape 2 (données fictives seulement)

| # | Action | Résultat attendu |
| --- | --- | --- |
| 1 | Comptes → **Ajouter un compte** : « Wave », Mobile Money, solde au départ 50 000, case « Répartir » cochée | Pools : Nécessité 25 000, les 5 autres 5 000 |
| 2 | Ajoute « Espèces », Espèces, 20 000, case **décochée** | Argent disponible : 70 000. Pools inchangés |
| 3 | Accueil → **+ Revenu** 10 005 sur Wave | Aperçu : Nécessité 5 005, les autres 1 000 |
| 4 | **− Dépense** 3 000, humeur Routine, pool Plaisir | Plaisir passe de 6 000 à 3 000 |
| 5 | **− Dépense** 5 000 dans Plaisir | Bannière rouge No-Go + raison obligatoire |
| 6 | **⇄ Transfert** 10 000 de Wave vers Espèces | Soldes des comptes changent, pools ne bougent pas |
| 7 | Historique → touche une opération → change le montant | Tous les soldes suivent |
| 8 | Historique → une opération → **Supprimer** | Tous les soldes suivent |
| 9 | Verrouiller, puis rouvrir | Tout est là. Écran verrouillé : aucun montant visible |
| 10 | Réglages → sauvegarde → Effacer → Restaurer | Comptes et opérations reviennent à l'identique |

Envoie-moi seulement ce qui ne se passe pas comme prévu.

## 5 ter. Le code PIN (v0.4)

- **À quoi il sert :** ouvrir vite. Réglages → Code PIN (il faut ta phrase pour le créer).
- **Règles :** exactement 7 chiffres ; les codes trop simples (1234567, 1111111, 1212121…) sont refusés. Un ancien code à 6 chiffres marche encore jusqu'à ce que tu le changes.
- **5 erreurs** (tous onglets confondus) : le PIN est effacé, la phrase est demandée.
- **La phrase est redemandée** tous les 7 jours, après 30 ouvertures au PIN, et si l'horloge du téléphone recule.
- **Jamais dans une sauvegarde.** Après une restauration, un changement de phrase ou l'usage de la clé de secours, recrée ton PIN.
- **Limite honnête :** quelqu'un qui copie la mémoire du téléphone avec des outils spéciaux (téléphone déverrouillé, rooté ou en mode débogage) peut essayer tous les PIN à 6 chiffres en moins d'une heure. Garde donc le **verrouillage d'écran d'Android** actif et le téléphone à jour. Sans PIN, seule la phrase protège, et c'est plus fort.

| # | Test | Résultat attendu |
| --- | --- | --- |
| 1 | Réglages → Code PIN : ta phrase + un code, 2 fois | « Code PIN enregistré » |
| 2 | Verrouiller (cadenas en haut) | L'écran demande le PIN ; l'app s'ouvre dès le dernier chiffre |
| 3 | 5 mauvais codes | Le PIN est désactivé, la phrase est demandée |
| 4 | Dans un formulaire, touche le bouton retour d'Android | Retour à l'écran d'avant, pas de sortie de l'app. Si tu as tapé quelque chose, l'app demande avant d'effacer |
| 5 | Comptes → un compte → Choisir une image | L'image remplace la lettre du compte |

## 5 quater. Devises et mode discret (v0.5)

- **£ et € :** le FCFA est fixé à l'euro (1 € = 655,957 FCFA). Le taux € → £ vient de la Banque centrale européenne, via le service gratuit Frankfurter, une fois par jour au plus, et seulement quand le coffre est ouvert.
- **Ce que cette demande révèle :** aucune donnée financière. Comme toute connexion, elle montre au service l'adresse IP du téléphone, l'adresse du site et l'heure. Tu peux la couper : Réglages → « Taux £ en ligne ».
- **Hors ligne :** l'app garde le dernier taux. Après 7 jours, une petite ligne « Taux £ ancien » apparaît sous le solde.
- **Mode discret (v0.7) :** un seul réglage, deux boutons œil (Dashboard et Dettes). Passent en étoiles (•••) : le solde principal, les dettes et la valeur nette du Dashboard, le total et le reste à payer des dettes, et le solde de chaque dette dans la liste. Tout le reste reste visible, y compris la fiche détaillée d'une dette.

| # | Test | Résultat attendu |
| --- | --- | --- |
| 1 | Ouvre le Dashboard avec internet | Sous le solde : « … £ · … € » |
| 2 | Touche l'œil de la carte du solde | Le solde devient « •••••• FCFA » ; le reste de l'app ne change pas |
| 3 | Touche le bouton + rond (avec 2 comptes ou plus) | En bas : Dépense et Revenu côte à côte. Au-dessus de Revenu : Transfert, puis Remboursement et Investir. Le bouton retour ferme le menu |
| 4 | Réglages → Créer un code PIN → 7 chiffres → « Afficher les chiffres » | Les chiffres apparaissent dans les cases ; après Enregistrer, le formulaire se referme |
| 5 | Verrouille, puis tape le PIN | 7 cases rondes ; l'app s'ouvre au 7e chiffre |

## 5 quinquies. Dettes (étape 4, v0.6)

**Les mots :**

- **Capital :** l'argent emprunté, sans les intérêts.
- **Mensualité :** ce que tu paies chaque mois.
- **Échéancier :** la liste des dates et des montants à payer.
- **Avalanche :** rembourser d'abord la dette au taux le plus haut. C'est la méthode qui coûte le moins cher.
- **Boule de neige :** rembourser d'abord la plus petite dette. C'est la méthode qui donne des victoires rapides.

**Comment l'app calcule :**

- **Échéancier calculé :** mensualité fixe, avec la formule classique des prêts bancaires. Exemple vérifié à la main : 1 000 000 FCFA à 12 % sur 12 mois donne 88 849 FCFA par mois.
- **Échéancier recopié :** tu tapes les lignes de ton contrat. Le contrat fait foi : la dette est terminée quand toutes les lignes sont payées.
- **Intérêts d'un remboursement :** comptés jour par jour depuis le paiement d'avant. C'est une **estimation**. Ta banque peut compter un peu autrement.
- **Payer en avance** réduit les dernières échéances. **Payer en retard** ajoute des intérêts à la dernière.
- **Un prêt reçu n'est pas un revenu :** l'argent arrive sur le compte, mais n'est pas réparti dans les pools.
- **Un remboursement** sort du compte choisi et du pool Dette.

**Les rappels :** le bouton « Rappels dans l'agenda » crée un fichier .ics avec toutes les échéances à venir. Chaque rappel sonne 3 jours avant. Le titre est neutre (« Échéance ») : pas de montant, pas de nom.

| # | Test | Résultat attendu |
| --- | --- | --- |
| 1 | Dettes → Ajouter une dette → « Arrive sur un compte » → 1 000 000, 12 %, 12 mois | L'aperçu montre « Mensualité : 88 849 FCFA » ; après Enregistrer, le compte a 1 000 000 de plus |
| 2 | Même test avec une date de prêt 70 jours avant aujourd'hui | Alerte rouge « 2 échéance(s) en retard », sur la fiche et sur le Dashboard |
| 3 | Fiche de la dette → Rembourser → Enregistrer | Montant proposé = 88 849 ; il ne reste qu'1 échéance en retard |
| 4 | Fiche de la dette → Rappels dans l'agenda | Le fichier s'ouvre dans l'agenda ; les rappels n'ont ni montant ni nom |
| 5 | Ajoute une 2e dette « Dette déjà en cours » → « Recopié du contrat » → « Remplir avec le calcul » | Les lignes apparaissent ; tu peux les corriger une par une |
| 6 | Stratégie → touche « Boule de neige » | « À rembourser en premier » passe à la plus petite dette |
| 7 | Essaie de supprimer une dette qui a des remboursements | Refusé : il faut d'abord supprimer les remboursements |

## 5 sexies. Investissements (étape 5, v0.6)

- **Acheter :** l'argent sort du compte et du pool Invest. L'actif prend la valeur du prix payé.
- **Mettre à jour la valeur :** à la main, en FCFA, € ou £. L'app convertit en FCFA.
- **Vendre une part :** l'argent entre sur le compte et **revient dans le pool Invest**. L'app calcule le gain réalisé : prix de vente moins le coût de la part vendue.
- **Revenu d'un investissement** (loyer, dividende, intérêts) : c'est un revenu normal, réparti dans les pools.
- **Terrain :** sa valeur est toujours marquée « estimation ». Il n'a pas de prix de marché.
- **Après 90 jours sans mise à jour**, l'app marque la valeur « à mettre à jour ».
- **Valeur nette** (Dashboard) = argent sur les comptes + valeur des investissements − capital des dettes.

| # | Test | Résultat attendu |
| --- | --- | --- |
| 1 | Investir → Ajouter → « Je l'achète maintenant » → 100 000 | L'actif vaut 100 000 ; le compte et le pool Invest baissent de 100 000 |
| 2 | Nouvelle valeur 130 000 → Enregistrer | « Plus-value : +30 000 FCFA (+30 %) » ; le petit graphique monte |
| 3 | Touche €, tape 200 → Enregistrer | Valeur : 131 191 FCFA |
| 4 | Vendre → 50 % pour 70 000 | Gain réalisé +20 000 FCFA (car le coût de la moitié = 50 000) |
| 5 | Ajoute un terrain « Je l'ai déjà » | Étiquette « estimation » |
| 6 | Historique → filtre « Autres » | Prêt reçu, remboursement, achat, vente apparaissent |

## 6. Ce qu'il faut savoir sur les sauvegardes

- Une sauvegarde s'ouvre avec la phrase **valable au moment où elle a été faite**, ou avec la clé de secours de ce moment-là.
- **Changer de phrase renouvelle tout** : la clé des données ET la clé de secours. Tu dois donc recopier une nouvelle clé sur papier. Détruis l'ancienne clé papier. Garde les anciennes sauvegardes seulement si tu te souviens de leur phrase.
- Après un changement de phrase, fais tout de suite une nouvelle sauvegarde.
- Fais au moins **une sauvegarde par semaine**, rangée à **2 endroits** (Drive + ordinateur).

## 7. Ce que la sécurité protège, et ce qu'elle ne protège pas

**Protégé :**

- **Téléphone perdu ou volé :** sans la phrase, les données sont illisibles.
- **Fichier de sauvegarde copié :** sans la phrase ou la clé de secours, il est illisible. Chaque essai coûte cher en calcul.
- **Fichier de sauvegarde modifié :** l'app le détecte et le refuse.
- **Code venant d'un autre site :** l'app refuse de charger quoi que ce soit d'extérieur.

**Pas protégé :**

- un téléphone infecté par un logiciel espion ;
- quelqu'un qui prend le téléphone pendant que l'app est ouverte ;
- une phrase faible, ou notée à côté du téléphone ;
- le compte GitHub piraté (d'où la 2FA obligatoire) ;
- la perte du téléphone **et** de toutes les sauvegardes.
- **Aperçu des apps récentes :** Android peut garder une image de l'écran dans cette liste. Verrouille l'app avant de la quitter.

## 8. Pour apprendre : qui fait quoi dans le code

| Fichier | Rôle |
| --- | --- |
| `index.html` | Tous les écrans. Aussi la règle de sécurité (CSP) qui bloque tout code extérieur. |
| `css/app.css` | Couleurs et mise en page (bordeaux, cartes blanc cassé). |
| `js/ledger.js` | Les règles d'argent : répartition 50/10, soldes, contrôle des données. |
| `js/fx.js` | Conversions FCFA → € et £, taux du jour. |
| `js/widgets.js` | L'œil des champs secrets et les cases rondes du PIN. |
| `js/screens.js` | Les écrans de l'étape 2 : accueil, comptes, historique, formulaires. |
| `js/debts.js` | Les calculs des dettes : mensualité, échéancier, retards, avalanche et boule de neige. |
| `js/assets.js` | Les calculs des investissements : coût, valeur, plus-value, gain réalisé. |
| `js/finance.js` | Les écrans Dettes et Investir. |
| `js/ui.js` | Petits outils d'affichage partagés (montants, dates, petit graphique). |
| `fonts/` | La police Figtree et sa licence (OFL). |
| `js/crypto.js` | Tout le chiffrement. Le fichier le plus sensible : ne le modifie pas sans me demander. |
| `js/store.js` | Enregistre sur le téléphone (IndexedDB). Ne voit que des données déjà chiffrées. |
| `js/i18n.js` | Tous les textes, en français et en anglais. **C'est le fichier idéal pour tes premières modifications.** |
| `js/app.js` | Le chef d'orchestre : écrans, verrouillage, sauvegardes. |
| `sw.js` | Garde l'app en mémoire pour le mode hors ligne. |
| `manifest.webmanifest` | Nom, icône et couleur de l'app installée. |

**Mettre à jour plus tard :** remplace les fichiers modifiés sur GitHub (Add file → Upload files, même nom = remplacé). Le téléphone prend la nouvelle version à la 2e ouverture de l'app. Dans `sw.js`, la ligne `VERSION` doit changer à chaque nouvelle version, sinon le téléphone garde l'ancienne.
