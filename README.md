<div align="center">
  <img src="assets/icons/arcade-icon-v2-192.png" alt="Logo Francis Arcade" width="112" />

# Francis Arcade

### L'arcade néon où chaque partie compte.

  <p>
    <a href="#-démarrer"><img src="https://img.shields.io/badge/Version-1.2-9b5cff?style=for-the-badge" alt="Version 1.2" /></a>
    <img src="https://img.shields.io/badge/Statut-Pré--bêta-f6c344?style=for-the-badge" alt="Statut pré-bêta" />
    <img src="https://img.shields.io/badge/PWA-Ready-47f5a0?style=for-the-badge" alt="PWA prête" />
  </p>

  <p>Mini-jeux, défis et progression cosmétique dans une expérience arcade web et mobile.</p>

  <p><strong>Cap actuel : consolider une sélection de jeux Premium avant d'agrandir le catalogue.</strong></p>

<a href="#-état-du-projet">État du projet</a> · <a href="#-sélection-premium">Sélection Premium</a> · <a href="#-feuille-de-route">Feuille de route</a> · <a href="#-démarrer">Démarrer</a>

</div>

---

## 🚀 État du projet

Francis Arcade est aujourd'hui une **pré-bêta locale fonctionnelle**. Le socle technique est en place : identité néon, PWA, profils locaux, économie fictive, boutique cosmétique, statistiques, catalogue filtrable, console d'administration locale et tests automatisés.

La priorité n'est plus d'ajouter des jeux. Le travail porte maintenant sur la cohérence, la fiabilité et la qualité éditoriale des meilleures expériences.

| Domaine                          |    État     | Détail                                                         |
| :------------------------------- | :---------: | :------------------------------------------------------------- |
| Identité et interface néon       |     ✅      | Accueil responsive et direction artistique installée           |
| PWA                              |     ✅      | Installation, mises à jour et cache progressif                 |
| Profils, Coins et historique     |  ✅ Local   | Données conservées dans le navigateur                          |
| Boutique cosmétique              |  ✅ Local   | Achat, inventaire et équipement sans avantage compétitif       |
| Statistiques et retours          |  ✅ Local   | Statistiques par jeu et formulaire EmailJS                     |
| Défis quotidiens                 |  ✅ Local   | Trois défis gratuits, récompenses et bonus journalier          |
| Vitrine « À jouer maintenant »   |     ✅      | Six jeux mis en avant sur l'accueil                            |
| Bridge de session commun         |     ✅      | Les 43 pages de jeu communiquent avec la plateforme            |
| Console ADMIN et audit           |  ✅ Local   | Recherche, sauvegarde, import et export des données de test    |
| Expérience Premium unifiée       | 🟠 En cours | Pause, tutoriel, fin de partie et contrôles encore hétérogènes |
| Comptes et synchronisation Cloud | 🟡 Préparé  | Backend Supabase présent mais non relié à la production        |
| Production commerciale           | ⚪ À venir  | RGPD, analytics, support et validation sécurité requis         |

> Le mode actif reste `local-test`. Les Coins sont fictifs, non achetables, non transférables et non convertibles en argent réel.

### Le catalogue en chiffres

- **43 expériences accessibles** depuis l'accueil, dont Pile ou Face intégré directement à la page ;
- **42 pages de jeu reliées** à l'accueil ;
- **1 prototype supplémentaire**, Neon Dice Arena, conservé hors catalogue pendant son évaluation ;
- **43 pages de jeu équipées** du bridge de session ;
- **44 pages HTML au total**, accueil compris.

Les tests comptent les pages HTML, tandis que l'accueil compte les expériences uniques. Ces mesures ne doivent pas être confondues avec un nombre de jeux certifiés Premium.

---

## 💎 Stratégie Pré-bêta & Qualité Premium

Un jeu n'est considéré **Premium** que lorsqu'il respecte l'ensemble du contrat qualité :

- compréhension des règles ou tutoriel en dix secondes environ ;
- commandes clavier, souris et tactiles clairement indiquées ;
- parcours accessible et utilisable sur mobile comme sur ordinateur ;
- pause, reprise, abandon et rejeu fiables ;
- écran de fin clair avec score, résultat et prochaine action ;
- intégration correcte au profil, aux sessions et aux statistiques Arcade ;
- absence de blocage, de lien cassé ou de régression connue ;
- validation manuelle sur les navigateurs et formats d'écran ciblés.

La quantité de jeux ne constitue plus un objectif de version. Une expérience reste en entraînement ou hors catalogue tant qu'elle ne satisfait pas ces critères.

## 🌟 Sélection Premium

La vitrine « À jouer maintenant » présente désormais six candidats. Leur présence dans la sélection ne signifie pas encore qu'ils ont obtenu le label Premium :

| Expérience             | Situation actuelle                           | Prochaine étape                                                |
| :--------------------- | :------------------------------------------- | :------------------------------------------------------------- |
| Crossy Turfu           | Dans la vitrine, bridge et pause disponibles | Audit mobile et fiabilisation du cycle complet                 |
| 421 Duel               | Dans la vitrine, jouable en entraînement     | Valider règles, fin de partie et rejeu                         |
| Farkle / Dés de Bohême | Dans la vitrine, bridge installé             | Uniformiser l'entrée de partie et la revanche                  |
| River Room Poker       | Dans la vitrine, bridge installé             | Clarifier les crédits internes et tester les contrôles mobiles |
| Cyber-Core Sorter      | Dans la vitrine, pause et rejeu disponibles  | Activer le shell commun et effectuer la recette mobile         |
| Pixel Taquin           | Dans la vitrine, bridge et rejeu disponibles | Ajouter le tutoriel court et effectuer la recette mobile       |

Cette liste constitue la première sélection éditoriale. Aucun de ces jeux ne sera présenté comme certifié Premium avant d'avoir franchi toute la recette qualité.

---

## 🎮 Fonctionnalités disponibles

### Profil et économie locale

- pseudo, portefeuille fictif et historique des mouvements ;
- coût et récompense centralisés par la plateforme ;
- sessions créées, démarrées puis réglées de manière idempotente ;
- modes d'entraînement gratuits pour les jeux sans résultat suffisamment vérifiable.

### Boutique Arcade

- thèmes, avatars, cadres, effets, ambiances et badges ;
- vérification du solde, inventaire et équipement ;
- objets exclusivement cosmétiques : **aucun pay-to-win**.

### Catalogue et vitrine

- sélection éditoriale de six jeux sur l'accueil ;
- recherche, catégories, difficulté et tri dans le catalogue complet ;
- navigation responsive ;
- suivi local des parties, victoires, défaites, abandons, scores et temps de jeu.

### Administration locale

- console réservée au profil local `ADMIN` ;
- consultation et export des profils, retours et éléments d'audit ;
- sauvegarde et restauration des données locales en JSON ou CSV ;
- thèmes, polices et intensités visuelles propres au profil administrateur.

### PWA

- installation sur ordinateur et mobile ;
- manifest, icônes, mode autonome et notification de mise à jour ;
- cache du socle applicatif et mise en cache progressive des jeux visités.

---

## 🧭 Feuille de route

### Phase 1 — Socle local

- [x] Identité visuelle néon et accueil responsive
- [x] Catalogue avec recherche, filtres et tri
- [x] Profils, Coins fictifs et historique local
- [x] Boutique, inventaire et équipements cosmétiques
- [x] Statistiques locales, retours joueurs et PWA
- [x] Défis quotidiens et première récompense locale
- [x] Console ADMIN, audit et exports locaux

### Phase 2 — Pré-bêta Premium — priorité actuelle

- [x] Ajouter la vitrine « À jouer maintenant » avec six jeux
- [x] Figer la première sélection éditoriale
- [x] Relier les 43 pages de jeu au bridge de session commun
- [x] Intégrer 421, Farkle et Cyber-Core Sorter à la vitrine et à la plateforme
- [ ] Valider les critères d'acceptation Premium sur chacun des six jeux
- [ ] Unifier chargement, tutoriel, pause, fin de partie et rejeu
- [ ] Harmoniser les commandes clavier, souris et tactiles
- [ ] Déployer progressivement le shell commun sur les jeux pilotes
- [ ] Refactoriser progressivement les 20 scripts inline
- [ ] Effectuer la recette manuelle Mobile/PC des jeux pilotes
- [ ] Ajouter des tests navigateur sur les parcours critiques
- [ ] Uniformiser le nom Francis Arcade dans toute l'interface

### Phase 3 — Bêta fermée

- [ ] Proposer un onboarding court : pseudo → jeu → première récompense
- [ ] Ajouter succès, quêtes et progression visuelle
- [ ] Instrumenter les abandons, erreurs et parcours de jeu de façon respectueuse de la vie privée
- [ ] Tester avec une cohorte fermée et optimiser le Top 3
- [ ] Ajouter captures, vidéos courtes et démonstrations à la page marketing

### Phase 4 — Production

- [ ] Activer les comptes utilisateurs et la synchronisation Supabase
- [ ] Migrer les jeux éligibles vers une validation serveur anti-triche
- [ ] Ajouter mentions légales, politique de confidentialité et gestion du consentement
- [ ] Permettre l'export et la suppression des données
- [ ] Mettre en place sauvegardes, alertes et supervision des erreurs
- [ ] Publier un canal de support et un changelog
- [ ] Mesurer rétention J1/J7 et taux d'abandon sans profilage publicitaire

Les jeux de hasard restent limités à des crédits virtuels non convertibles. Toute future monétisation devra rester séparée des performances et des récompenses de jeu.

---

## 🧪 Qualité et tests

La suite actuelle vérifie notamment :

- le cycle économique local et l'idempotence des sessions ;
- le bridge, les préférences et la configuration partagés entre les jeux ;
- l'architecture de chargement léger des ressources ;
- la boutique, l'inventaire et les équipements ;
- les statistiques et les retours EmailJS ;
- la console ADMIN, l'audit local et les exports ;
- la structure de Dice District ;
- la syntaxe des scripts inline ;
- les liens et ressources des 44 pages HTML ;
- la configuration PWA.

```bash
npm test
```

Ces contrôles automatisés ne remplacent pas la recette manuelle mobile et ordinateur exigée pour le label Premium.

---

## 🚀 Démarrer

**Prérequis :** Python 3 et un navigateur moderne.

```bash
npm run serve
```

Puis ouvrir [http://127.0.0.1:4173](http://127.0.0.1:4173).

Pour lancer les vérifications :

```bash
npm test
```

---

## 🧩 Organisation du projet

| Emplacement                              | Rôle                                                            |
| :--------------------------------------- | :-------------------------------------------------------------- |
| `index.html`                             | Accueil, vitrine, catalogue, profil, boutique, défis et retours |
| `games/`                                 | Pages et ressources propres à chaque jeu                        |
| `css/home.css`                           | Interface principale et responsive                              |
| `css/shared/`                            | Styles et shell partagés entre plusieurs pages                  |
| `js/core/arcade-config.js`               | Configuration, économie, politiques de jeu et boutique          |
| `js/core/arcade-local-store.js`          | Profils, sessions, inventaire et historique local               |
| `js/core/arcade-game-bridge.js`          | Communication entre les jeux et la plateforme                   |
| `js/core/arcade-game-config.js`          | États et configuration des menus communs                        |
| `js/core/arcade-game-preferences.js`     | Son, musique, vibration et intensité par profil                 |
| `js/core/arcade-game-shell.js`           | Shell commun activable progressivement sur les jeux             |
| `js/core/arcade-shop.js`                 | Boutique et personnalisation                                    |
| `js/core/arcade-stats.js`                | Statistiques des jeux et catégories                             |
| `js/core/arcade-feedback.js`             | Signalements et envoi EmailJS                                   |
| `js/core/arcade-admin-data.js`           | Sauvegarde, import et export des données locales                |
| `js/core/arcade-admin-config.js`         | Préférences visuelles de la console ADMIN                       |
| `js/core/arcade-audit-store.js`          | Copie locale et gestion de l'audit global                       |
| `js/arcade-admin.js`                     | Console de gestion du profil local ADMIN                        |
| `francis_arcade_audit_global.json`       | Source initiale de l'audit administrable                        |
| `francis_arcade_audit_global_export.csv` | Format tabulaire d'import et d'export de l'audit                |
| `supabase/`                              | Schéma et fonctions préparant la future plateforme serveur      |
| `docs/`                                  | Architecture, économie, migration, PWA et déploiement           |
| `tests/`                                 | Vérifications automatisées du socle                             |

---

## 🌱 Principes de développement

- rester en HTML, CSS et JavaScript natifs tant qu'une dépendance n'apporte pas un bénéfice clair ;
- charger les fonctions spécialisées à la demande, notamment la console ADMIN ;
- partager les comportements communs sans effacer la personnalité de chaque jeu ;
- prévoir mobile, clavier, réduction des animations et appareils modestes dès la conception ;
- mesurer l'intérêt utilisateur, le poids transféré et la maintenance avant d'ajouter une fonction ;
- améliorer et tester un jeu pilote avant de déployer un composant sur tout le catalogue.

Le favicon affiché utilise une icône optimisée de 192 px. La source haute définition reste réservée à la génération des icônes PWA et n'est pas précachée chez les joueurs.

---

## 🔐 Données, sécurité et confidentialité

Dans la pré-bêta actuelle, les profils, Coins, inventaires, équipements et statistiques sont stockés dans le navigateur. Ils ne sont ni synchronisés entre appareils ni protégés contre la modification locale.

Le profil local `ADMIN` donne accès à une console de test pour rechercher, sauvegarder, importer et exporter les profils, retours et éléments d'audit. Les fichiers `francis_arcade_audit_global.json` et `francis_arcade_audit_global_export.csv` servent de sources initiales : les changements effectués dans le navigateur restent locaux jusqu'à leur export. Cette console ne remplace ni une authentification serveur ni des autorisations Supabase.

Le dossier `supabase/` prépare les futurs comptes, règles RLS, portefeuilles, transactions et sessions vérifiées. Cette architecture n'est pas encore activée dans l'application publique et ne doit pas être présentée comme une sécurité de production.

Aucune clé secrète ou clé `service_role` ne doit être exposée dans le frontend. Seules les clés publiques prévues pour le navigateur pourront y être configurées.

---

## ✅ Critères de sortie de pré-bêta

La bêta fermée pourra commencer lorsque :

1. six jeux auront passé la recette Premium complète ;
2. le shell et les états communs seront actifs sur les six jeux pilotes ;
3. les parcours pseudo, lancement, fin et rejeu seront cohérents ;
4. les principaux scénarios seront testés sur mobile et ordinateur ;
5. les événements nécessaires à l'analyse des abandons seront définis ;
6. les limites connues seront documentées sans ambiguïté.

<div align="center">
  <sub>© 2026 Francis Arcade · Pré-bêta 1.2 · Fait avec 💜</sub>
</div>
