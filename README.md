<div align="center">
  <img src="assets/icons/arcade-icon-v2-192.png" alt="Logo Francis Arcade" width="112" />

# Francis Arcade

### L'arcade néon où chaque partie compte.

  <p>
    <a href="#-démarrer"><img src="https://img.shields.io/badge/Version-1.1-9b5cff?style=for-the-badge" alt="Version 1.1" /></a>
    <img src="https://img.shields.io/badge/HTML-CSS-JavaScript-00e5ff?style=for-the-badge" alt="HTML, CSS et JavaScript" />
    <img src="https://img.shields.io/badge/PWA-Ready-47f5a0?style=for-the-badge" alt="PWA prête" />
  </p>

  <p>Mini-jeux, défis, collection cosmétique et progression locale dans une expérience arcade pensée pour le web et le mobile.</p>

<a href="#-démarrer">Démarrer</a> · <a href="#-fonctionnalités">Fonctionnalités</a> · <a href="#-feuille-de-route">Feuille de route</a>

</div>

---

## ✨ Version 1.1 — l'arcade prend forme

La version 1.1 fait évoluer Francis Arcade vers une vraie plateforme : une économie commune, une boutique cosmétique, un catalogue plus clair, des statistiques et un canal de retours pour les joueurs.

| 🪙 Progression                    | 🛍️ Personnalisation                 | 📊 Pilotage                       |
| :-------------------------------- | :---------------------------------- | :-------------------------------- |
| Coins, profil et historique local | Boutique, inventaire et équipements | Statistiques par jeu et catégorie |

> Les achats restent exclusivement cosmétiques : Francis Arcade est et restera **non pay-to-win**.

---

## 🎮 Fonctionnalités

<details open>
<summary><b>🪙 Profil & économie</b></summary>

- Pseudo, portefeuille de Coins et historique des mouvements ;
- Économie partagée entre les jeux ;
- Architecture prête à évoluer vers de vrais comptes utilisateurs.
</details>

<details open>
<summary><b>🛍️ Boutique Arcade</b></summary>

- Thèmes, avatars, cadres, effets, ambiances et badges ;
- Vérification du solde, inventaire et équipement sans coût supplémentaire ;
- Catalogue centralisé dans `ARCADE_CONFIG.shop.items`.
</details>

<details open>
<summary><b>🔎 Catalogue de jeux</b></summary>

- Recherche, filtres par catégorie et tri ;
- Difficulté, classement et popularité ;
- Navigation adaptée aux écrans d'ordinateur comme aux mobiles.
</details>

<details>
<summary><b>📊 Statistiques & retours</b></summary>

- Parties, victoires, défaites, abandons, scores et temps de jeu ;
- Regroupement possible par catégorie ;
- Formulaire « Signaler un problème / Donner un avis » avec intégration EmailJS.
</details>

<details>
<summary><b>📱 Expérience PWA</b></summary>

- Installation sur ordinateur et mobile ;
- Manifest, icônes et mode autonome ;
- Service Worker, cache et amélioration progressive du hors-ligne.
</details>

---

## 🕹️ Aperçu

<div align="center">
  <img src="assets/icons/arcade-icon-v2-512.png" alt="Identité visuelle Francis Arcade" width="180" />
  <p><i>Une identité néon, des parties rapides et une progression à collectionner.</i></p>
</div>

> Ajoute ici tes futures captures de l'accueil, du catalogue et de la boutique pour rendre la page encore plus immersive.

---

## 🚀 Démarrer

**Prérequis :** Python 3 et un navigateur moderne.

```bash
npm run serve
```

Puis ouvre [http://127.0.0.1:4173](http://127.0.0.1:4173).

Pour lancer les vérifications :

```bash
npm test
```

---

## 🧩 Organisation du projet

| Emplacement                     | Rôle                                            |
| :------------------------------ | :---------------------------------------------- |
| `index.html`                    | Accueil, catalogue, profil, boutique et retours |
| `css/home.css`                  | Interface néon et responsive                    |
| `js/core/arcade-config.js`      | Jeux, Coins, récompenses et boutique            |
| `js/core/arcade-local-store.js` | Profils, inventaire et historique local         |
| `js/core/arcade-game-bridge.js` | Cycle commun `created → started → résultat` et Coins |
| `js/core/arcade-game-config.js` | États, préférences et configuration des menus de jeu |
| `js/core/arcade-game-preferences.js` | Son, musique, vibration et intensité par profil |
| `js/core/arcade-game-shell.js`  | Menu commun activé progressivement jeu par jeu  |
| `js/core/arcade-shop.js`        | Boutique et cosmétiques                         |
| `js/core/arcade-stats.js`       | Statistiques des jeux et catégories             |
| `js/core/arcade-feedback.js`    | Signalements et EmailJS                         |
| `js/core/arcade-admin-data.js`  | Contrat CRUD, sauvegarde et import admin local  |
| `js/core/arcade-admin-config.js` | Thèmes, polices et intensités de la console    |
| `francis_arcade_audit_global.json` | Source initiale de l’audit administrable     |
| `francis_arcade_audit_global_export.csv` | Export/import tabulaire de l’audit       |
| `js/core/arcade-audit-store.js` | Copie locale et CRUD des éléments d’audit       |
| `js/arcade-admin.js`            | Console de gestion réservée au profil ADMIN     |
| `supabase/`                     | Préparation de la synchronisation serveur       |

---

## 🌱 Principes de développement

- Rester en HTML, CSS et JavaScript natifs tant qu’une dépendance n’apporte pas un bénéfice clair.
- Charger les fonctions spécialisées à la demande, comme la console ADMIN.
- Partager les comportements communs sans effacer la personnalité de chaque jeu.
- Prévoir mobile, clavier, réduction des animations et appareils modestes dès la conception.
- Mesurer l’intérêt utilisateur, le poids transféré et la maintenance avant d’ajouter une fonction.
- Améliorer et tester un jeu pilote avant de déployer un composant sur tout le catalogue.

Le favicon affiché utilise une icône optimisée de 192 px. Le fichier source haute définition reste réservé à la génération des icônes PWA et n’est pas précaché chez les joueurs.

---

## 🔐 Données & confidentialité

Pour le moment, le profil, les Coins, l'inventaire, les équipements, les statistiques et certains retours sont stockés localement dans le navigateur. Les données restent donc liées à l'appareil utilisé.

Le profil local `ADMIN` affiche une console permettant de rechercher et exporter les données, de gérer l’audit global, les profils et feedbacks, puis de sauvegarder ou restaurer l'ensemble au format JSON ou CSV. Il dispose aussi de thèmes, polices et intensités d’effets propres à son profil, prévisualisables avant enregistrement. `francis_arcade_audit_global.json` initialise une copie de travail dans `localStorage`, tandis que `francis_arcade_audit_global_export.csv` est accepté comme source de secours et format d’import : les changements du navigateur ne réécrivent jamais les fichiers du dépôt, mais peuvent être réexportés. Cette protection reste une commodité de test côté navigateur : elle ne remplace ni une authentification serveur ni des autorisations Supabase. Le catalogue des jeux, la boutique et les statistiques calculées sont volontairement en lecture seule dans cette console, car leur source reste le code du projet.

La structure Supabase prépare la suite : comptes utilisateurs, synchronisation multi-appareils, sauvegarde distante, statistiques globales et espace administrateur.

---

## 🔮 Feuille de route

- [ ] Comptes utilisateurs et synchronisation Supabase
- [ ] Succès, défis et récompenses quotidiennes
- [ ] Classements et nouveaux jeux
- [ ] Nouveaux objets de boutique
- [ ] Publicités récompensées et soutien PayPal
- [ ] Espace administrateur et statistiques globales
- [ ] Améliorations continues de l'expérience PWA

---

## ✅ Avant le déploiement

1. Lancer `npm test`.
2. Vérifier l'accueil et les jeux sur ordinateur et mobile.
3. Tester les Coins, la boutique et l'installation PWA.
4. Contrôler la configuration EmailJS.
5. Vérifier qu'aucune clé privée n'est exposée côté frontend.

<div align="center">
  <sub>© 2026 Francis Arcade · Fait avec 💜</sub>
</div>
