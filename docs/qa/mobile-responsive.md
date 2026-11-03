# Adaptation mobile — Arcade Station

Version préparée le 3 novembre 2026 pour la branche `codex/compact-tablet-arcade`.
Application officielle : https://francois1343.github.io/Jeu/

## Changements

- Catalogue à 2, 3 ou 4 colonnes avec pagination calculée selon la hauteur réelle des cartes et de l'écran. Recherche sur les 42 cartes, y compris 421 Duel auparavant présent uniquement dans la sélection.
- Recherche toujours visible ; classement et catégories dans une fenêtre native avec compteur des filtres actifs. Sélection, informations et liens légaux accessibles depuis la navigation du bas.
- Actions de lancement d'au moins 44 px, noms accessibles spécifiques aux jeux, fermeture des fenêtres et gestion du focus natives. Retour au catalogue sans forcer l'ouverture du clavier. Zoom tactile rétabli sur l'accueil.
- Couleurs et typographie néon conservées. Cartes sans grandes animations décoratives ; description et boutons adaptés à l'espace disponible.
- Dice District : modes en grille, panneau de lancement compact, configuration/statistiques repliables. Memory : menu réduit et thème repliable. Shifumi, Reflex Lab, Taquin et Forge : marges et rubriques compactées.
- Reflex Lab : remplacement de l'arène à chaque réussite ; correction de l'accumulation de grilles, voies et cibles. Style de la cible isolé pour ne pas déplacer la dalle Hypergrid.
- Shifumi : effet décoratif empêché d'intercepter les appuis voisins. Réglages de l'accueil raccordés au bouton du bas. Retour Accueil généré avec les mêmes éléments d'icône et de libellé que les autres jeux.
- Cache PWA v73 pour la prochaine publication. Comptes, Coins et services en ligne inchangés.

## Validation

Les commandes ci-dessous s'exécutent depuis la racine du dépôt, avec Python, Node et Chrome/Chromium disponibles.

```sh
npm test
CHROME_PATH=/chemin/vers/chrome node tests/mobile-discovery-browser.test.js
CHROME_PATH=/chemin/vers/chrome node tests/responsive-browser.test.js
CHROME_PATH=/chemin/vers/chrome node tests/guest-browser.test.js
```

- `npm test` : suites de régression réussies, dont syntaxe, liens, accessibilité structurelle et PWA.
- Recette responsive existante : **216 états réussis** sur 12 jeux, en 1366 × 768, 390 × 844, 320 × 568 et 844 × 390. Vérifications des débordements, collisions de commandes, menus et terrains de jeu.
- Nouvelle recette de découverte : **300 contrôles réussis**, sur cinq formats et leurs orientations inversées. Recherche de chaque titre, accès à toutes les pages, absence de recouvrement par la navigation, filtres, fenêtres modales, clavier et six réussites successives dans chacun des trois modes intégrés de Reflex Lab.
- Mode invité : **43 pages vérifiées**, lancement depuis l’accueil, parties Snake/Pong et anciens liens sans accès Supabase ; données serveur préservées.
- Contrôle visuel et essais de clics tactiles de Dice District, Reflex Lab, Memory et Shifumi sur trois formats mobiles. Les options longues restent défilables ; aucun masquage global du contenu pour faire artificiellement tenir les jeux.

Dans cet environnement, le client HTTP Undici de Node 24 a rencontré une erreur interne sur le harnais existant. Un adaptateur HTTP local temporaire a permis d'exécuter les assertions sans les modifier ; il ne fait pas partie de l'application.

## Limites

Validation dans Chromium avec dimensions et entrées tactiles émulées. Ce n'est pas un test sur le téléphone physique de l'utilisateur ni dans Safari iOS. Le clavier système, les barres du navigateur et l'installation PWA sur appareil restent à contrôler après publication. La recette ne signifie pas que toutes les combinaisons de modes et de niveaux des 43 pages de jeu ont été jouées intégralement. Certaines règles, statistiques et options nécessitent volontairement du défilement.

La version de production demeure celle de `main` jusqu'à fusion et déploiement de la pull request.
