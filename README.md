# 🎮 Francis Arcade — Version 1.1

**Francis Arcade** est une WebApp d’arcade au style néon, composée de mini-jeux, de défis et d’un système de profil joueur local.

La version **1.1** marque une étape importante du projet : l’arcade devient progressivement une véritable plateforme, avec une économie basée sur les **Coins 🪙**, une boutique cosmétique, un catalogue mieux organisé, des statistiques et un système de retours utilisateurs.

---

## ✨ Nouveautés de la version 1.1

### 🪙 Coins & profils

- profil joueur local basé sur un pseudo ;
- portefeuille de Coins ;
- historique des gains et dépenses ;
- structure prévue pour évoluer vers de vrais comptes utilisateurs ;
- économie commune aux différents jeux de l’arcade.

Les Coins serviront progressivement à jouer, débloquer des éléments cosmétiques et participer à certaines fonctionnalités de l’arcade.

---

### 🛍️ Boutique Arcade

Une boutique permet désormais de dépenser les Coins gagnés.

Les objets disponibles restent principalement **cosmétiques** :

- thèmes / skins ;
- avatars ;
- cadres de profil ;
- effets visuels ;
- sons et ambiances ;
- badges.

Le système gère :

- le contrôle du solde avant achat ;
- l’inventaire du joueur ;
- l’équipement des objets ;
- l’impossibilité d’acheter inutilement deux fois le même objet ;
- le changement d’équipement sans coût supplémentaire.

> Les achats ne donnent aucun avantage direct dans les jeux.
> **Francis Arcade reste une expérience équitable et non pay-to-win.**

Le catalogue est centralisé dans :

`ARCADE_CONFIG.shop.items`

Cette structure permet d’ajouter facilement de nouveaux objets et pourra être synchronisée avec une base de données plus tard.

---

## 🔎 Catalogue de jeux

Le catalogue a été amélioré pour faciliter la découverte des jeux :

- barre de recherche ;
- filtres par catégorie ;
- tri des jeux ;
- niveau de difficulté ;
- classement et popularité ;
- navigation améliorée sur ordinateur et mobile.

Les catégories pourront notamment distinguer :

- arcade ;
- réflexe ;
- mémoire ;
- logique ;
- énigme ;
- stratégie ;
- autres catégories futures.

---

## 📊 Statistiques

Francis Arcade commence également à enregistrer des statistiques locales.

Selon les données disponibles pour chaque jeu :

- nombre de parties ;
- victoires ;
- défaites ;
- abandons ;
- taux de réussite ;
- popularité ;
- score moyen ;
- temps moyen ;
- difficulté réellement observée.

Ces données peuvent aussi être regroupées **par catégorie de jeu**.

Elles serviront plus tard à alimenter un véritable tableau de bord administrateur : jeux les plus joués, plus difficiles, taux d’abandon, catégories populaires, etc.

---

## 🐛 Retours utilisateurs

Un formulaire discret **« Signaler un problème / Donner un avis »** permet aux joueurs de transmettre :

- bugs ;
- suggestions ;
- problèmes visuels ;
- problèmes liés à un jeu ;
- problèmes liés au profil ;
- autres remarques.

Les retours peuvent notamment contenir :

- le pseudo ;
- le jeu concerné ;
- le type de signalement ;
- le niveau d’urgence ;
- une description.

L’envoi peut être effectué via **EmailJS**, avec un stockage local permettant de conserver les informations nécessaires pour le futur espace administrateur.

À terme, ces signalements pourront être classés par :

`Nouveau → À vérifier → En cours → Résolu`

---

## 📲 WebApp / PWA

Francis Arcade est également pensée pour fonctionner comme une **Progressive Web App**.

Le projet prévoit notamment :

- installation sur ordinateur et mobile ;
- manifest WebApp ;
- icônes dédiées ;
- fonctionnement en mode `standalone` ;
- gestion propre des propositions d’installation ;
- Service Worker et gestion du cache ;
- amélioration progressive du fonctionnement hors connexion.

L’objectif est de proposer une expérience proche d’une véritable application tout en conservant la simplicité du Web.

---

## 🎨 Interface & expérience utilisateur

La version 1.1 apporte également plusieurs ajustements :

- meilleure visibilité des boutons ;
- amélioration des contrastes ;
- états `hover` et `focus` plus cohérents ;
- amélioration de certaines fenêtres et actions ;
- meilleure adaptation mobile ;
- conservation de l’identité visuelle néon de Francis Arcade.

---

## 🚀 Lancer le projet

Francis Arcade utilise principalement :

**HTML • CSS • JavaScript**

Aucune compilation complexe n’est nécessaire.

```bash
npm run serve
```

Puis ouvrir :

```text
http://127.0.0.1:4173
```

Pour lancer les vérifications du projet :

```bash
npm test
```

---

## 📁 Organisation principale

| Emplacement                     | Rôle                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `index.html`                    | Accueil, catalogue, profil, boutique et retours        |
| `css/home.css`                  | Interface, identité néon, responsive                   |
| `js/core/arcade-config.js`      | Configuration des jeux, Coins, récompenses et boutique |
| `js/core/arcade-local-store.js` | Profils, Coins, inventaire et historique               |
| `js/core/arcade-shop.js`        | Boutique et cosmétiques                                |
| `js/core/arcade-stats.js`       | Statistiques des jeux et catégories                    |
| `js/core/arcade-feedback.js`    | Signalements et intégration EmailJS                    |
| `supabase/`                     | Préparation d’une future synchronisation serveur       |

---

## 💾 Données & confidentialité

Pour cette version, une grande partie des données est encore conservée dans le **stockage local du navigateur** :

- profil ;
- pseudo ;
- Coins ;
- inventaire ;
- équipements ;
- statistiques ;
- certains retours utilisateurs.

Ces données restent donc actuellement associées au navigateur et à l’appareil utilisés.

La structure Supabase est conservée afin de permettre plus tard :

- de vrais comptes utilisateurs ;
- la synchronisation multi-appareils ;
- la sauvegarde distante ;
- un espace administrateur ;
- des statistiques globales.

---

## 🔮 Et ensuite ?

Francis Arcade continuera progressivement à évoluer avec notamment :

- 👤 comptes utilisateurs complets ;
- ☁️ synchronisation Supabase ;
- 📼 publicités récompensées contre des Coins ;
- ❤️ soutien / dons PayPal ;
- 🏆 succès et défis ;
- 🎁 récompenses quotidiennes ;
- 🥇 classements ;
- 📊 espace administrateur ;
- 🛒 nouveaux objets de boutique ;
- 🎮 nouveaux jeux ;
- 📱 amélioration continue de la PWA.

L’objectif reste simple :

> **Créer une arcade accessible, fun, qualitative et capable de grandir avec sa communauté.**

---

## ✅ Avant un déploiement

1. Lancer `npm test`.
2. Vérifier l’accueil et les jeux sur ordinateur et mobile.
3. Tester les Coins et les achats de la boutique.
4. Vérifier l’installation de la PWA.
5. Contrôler la configuration EmailJS.
6. Vérifier qu’aucune clé privée ou donnée sensible n’est présente côté frontend.

---

**Version : 1.1**

© 2026 **Francis Arcade** • Fait avec 💜
