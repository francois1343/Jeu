# Accès invité pendant la pause du serveur

Activé le 28 octobre 2026 pour rendre le catalogue jouable sur GitHub Pages sans compte ni Coins.

- `arcadeGuestAccess = true` dans `js/core/arcade-config.js` active le mode public `guest`.
- L'accueil lance tous les jeux gratuitement. Les liens directs et les anciens liens de session fonctionnent aussi en entraînement.
- Aucun client Supabase n'est initialisé. Les jetons de connexion, règlements en attente et portefeuilles serveur ne sont ni effacés ni convertis en monnaie locale.
- Les parties en ligne, comptes, défis avec récompense et dashboard serveur restent en pause. Les bots et parties sur un même appareil restent utilisables.
- Le mode QA local reste distinct et limité à localhost.

Pour rétablir les services : remettre le serveur en service, passer `arcadeGuestAccess` à `false`, vérifier connexion et portefeuille puis publier la configuration. Aucun assouplissement des autorisations SQL ou des contrôles serveur n'est nécessaire.

Recette : `node tests/guest-browser.test.js` bloque toutes les connexions Supabase et contrôle les 43 pages, un lancement depuis l'accueil, des parties effectives et la conservation du stockage d'authentification.
