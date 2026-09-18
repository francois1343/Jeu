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

Francis Arcade est aujourd'hui une **pré-bêta locale fonctionnelle**. Le socle technique est en place : identité néon, PWA, profils locaux, économie fictive, boutique cosmétique, statistiques, catalogue filtrable et tests automatisés.

La priorité n'est plus d'ajouter des jeux. Le travail porte maintenant sur la cohérence, la fiabilité et la qualité éditoriale des meilleures expériences.

| Domaine | État | Détail |
| :-- | :--: | :-- |
| Identité et interface néon | ✅ | Accueil responsive et direction artistique installée |
| PWA | ✅ | Installation, mises à jour et cache progressif |
| Profils, Coins et historique | ✅ Local | Données conservées dans le navigateur |
| Boutique cosmétique | ✅ Local | Achat, inventaire et équipement sans avantage compétitif |
| Statistiques et retours | ✅ Local | Statistiques par jeu et formulaire EmailJS |
| Défis quotidiens | ✅ Local | Trois défis gratuits, récompenses et bonus journalier |
| Expérience Premium unifiée | 🟠 En cours | Pause, tutoriel, fin de partie et contrôles encore hétérogènes |
| Comptes et synchronisation Cloud | 🟡 Préparé | Backend Supabase présent mais non relié à la production |
| Production commerciale | ⚪ À venir | RGPD, analytics, support et validation sécurité requis |

> Le mode actif reste `local-test`. Les Coins sont fictifs, non achetables, non transférables et non convertibles en argent réel.

### Le catalogue en chiffres

- **36 expériences visibles** sur l'accueil, dont Pile ou Face intégré directement à la page ;
- **35 pages de jeu reliées** au catalogue ;
- **6 prototypes supplémentaires** conservés hors catalogue pendant leur évaluation ;
- **42 pages HTML au total**, accueil compris.

Le nombre 42 désigne donc les pages HTML vérifiées par les tests, et non 42 jeux publiés.

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

La vitrine cible présentera **6 à 8 jeux maximum**. Les candidats actuels sont :

| Expérience | Situation actuelle | Prochaine étape |
| :-- | :-- | :-- |
| Crossy Turfu | Intégré, pause disponible | Audit mobile et fiabilisation du cycle complet |
| Dice District | Hub intégré ; lancer libre disponible | Finaliser le contrat UX commun |
| Farkle / Dés de Bohême | Accessible depuis Dice District | Intégrer complètement le jeu à la plateforme |
| 421 | Présent dans le hub mais annoncé « bientôt » | Terminer le moteur et ses règles |
| River Room Poker | Intégré au catalogue | Clarifier les crédits internes et tester les contrôles mobiles |
| Cyber-Core Sorter | Prototype avancé avec pause et rejeu | Relier au catalogue, au bridge et aux statistiques |
| Pixel Taquin | Intégré avec rejeu | Ajouter le tutoriel court et effectuer la recette mobile |

Cette liste est une sélection de travail, pas encore un label acquis. La vitrine « À jouer maintenant » sera publiée lorsque les premiers jeux auront franchi la recette Premium.

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

### Catalogue

- recherche, catégories, difficulté et tri ;
- navigation responsive ;
- suivi local des parties, victoires, défaites, abandons, scores et temps de jeu.

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

### Phase 2 — Pré-bêta Premium — priorité actuelle

- [ ] Ajouter la vitrine « À jouer maintenant » avec 6 à 8 jeux
- [ ] Figer la sélection et les critères d'acceptation Premium
- [ ] Unifier chargement, tutoriel, pause, fin de partie et rejeu
- [ ] Harmoniser les commandes clavier, souris et tactiles
- [ ] Refactoriser progressivement les 19 scripts inline
- [ ] Intégrer complètement 421, Farkle et Cyber-Core Sorter
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
- la boutique, l'inventaire et les équipements ;
- les statistiques et les retours EmailJS ;
- la structure de Dice District ;
- la syntaxe des scripts inline ;
- les liens et ressources des 42 pages HTML ;
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

---

## 🧩 Organisation du projet

| Emplacement | Rôle |
| :-- | :-- |
| `index.html` | Accueil, catalogue, profil, boutique, défis et retours |
| `games/` | Pages et ressources propres à chaque jeu |
| `css/home.css` | Interface principale et responsive |
| `css/shared/` | Styles partagés entre plusieurs pages |
| `js/core/arcade-config.js` | Configuration, économie, politiques de jeu et boutique |
| `js/core/arcade-local-store.js` | Profils, sessions, inventaire et historique local |
| `js/core/arcade-game-bridge.js` | Communication entre les jeux et la plateforme |
| `js/core/arcade-shop.js` | Boutique et personnalisation |
| `js/core/arcade-stats.js` | Statistiques des jeux et catégories |
| `js/core/arcade-feedback.js` | Signalements et envoi EmailJS |
| `supabase/` | Schéma et fonctions préparant la future plateforme serveur |
| `docs/` | Architecture, économie, migration, PWA et déploiement |
| `tests/` | Vérifications automatisées du socle |

---

## 🔐 Données, sécurité et confidentialité

Dans la pré-bêta actuelle, les profils, Coins, inventaires, équipements et statistiques sont stockés dans le navigateur. Ils ne sont ni synchronisés entre appareils ni protégés contre la modification locale.

Le dossier `supabase/` prépare les futurs comptes, règles RLS, portefeuilles, transactions et sessions vérifiées. Cette architecture n'est pas encore activée dans l'application publique et ne doit pas être présentée comme une sécurité de production.

Aucune clé secrète ou clé `service_role` ne doit être exposée dans le frontend. Seules les clés publiques prévues pour le navigateur pourront y être configurées.

---

## ✅ Critères de sortie de pré-bêta

La bêta fermée pourra commencer lorsque :

1. six jeux auront passé la recette Premium complète ;
2. la vitrine éditoriale remplacera l'entrée directe par le catalogue complet ;
3. les parcours pseudo, lancement, fin et rejeu seront cohérents ;
4. les principaux scénarios seront testés sur mobile et ordinateur ;
5. les événements nécessaires à l'analyse des abandons seront définis ;
6. les limites connues seront documentées sans ambiguïté.

<div align="center">
  <sub>© 2026 Francis Arcade · Pré-bêta 1.2 · Fait avec 💜</sub>
</div>
