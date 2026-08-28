# Migration progressive des jeux vers les Coins

Les jeux existants restent en mode entraînement gratuit tant que leur résultat n’est pas
vérifiable. Le registre `game_catalog` est la source de vérité : activer `economy_enabled`
uniquement après ajout et test d’un validateur serveur.

## Ordre recommandé

### Vague 1 — validation serveur directe

- Calcul Mental
- CyberFind
- Démineur
- Énigme Cosmique
- GeoMinds
- Memory
- Simon Néon
- Sudoku
- Pixel Taquin
- Bataille Navale, après passage à un adversaire serveur

Le serveur génère le plateau, la question ou la séquence, garde la solution secrète et accepte
une seule soumission. C’est le modèle déjà utilisé par les trois défis de l’accueil.

### Vague 2 — rejeu déterministe

- 2048
- Casse-Briques
- Crossy Turfu
- Cyber Flux
- Labyrinthe
- Neon Overdrive
- Neon Runner
- Snake Néon
- Spider Solitaire
- Synthwave Runner
- Tetris

Chaque partie reçoit une graine serveur. Le client renvoie un journal compact des commandes ;
le backend rejoue la simulation avec la même graine et contrôle le score, la durée et les
limites physiques du jeu.

### Entraînement uniquement tant qu’il reste local

- HiFuMi
- Cyber-Morpion
- Tape-Taupe
- Neontron
- Open World
- Pong
- Puissance 4 Advance
- Chrono Réflexe
- Pixel Forge

Les jeux de hasard local, les duels locaux, les clickers et les jeux dont le navigateur décide
seul du résultat sont trop faciles à automatiser. Ils ne doivent ni coûter ni rapporter de Coins
avant une refonte de leur autorité de jeu.

## Contrat d’intégration

Un jeu migré charge `arcade-config.js`, la bibliothèque Supabase, `arcade-platform.js`, puis
`arcade-game-sdk.js`. Il suit quatre étapes :

1. `startVerifiedGame(gameKey)` engage atomiquement la mise et renvoie une session.
2. Le jeu utilise uniquement le défi ou la graine fournie par le serveur.
3. `settleVerifiedGame(sessionId, result)` soumet une seule réponse ou un journal de commandes.
4. Le backend valide, règle la partie et renvoie le nouveau solde.

Le jeu ne calcule jamais lui-même le montant crédité et ne met jamais le solde dans
`localStorage`. Ses scores locaux historiques peuvent être conservés, mais restent séparés des
Coins globaux.

## Passage d’une vague en production

- Ajouter un validateur et des tests de réussite, défaite, expiration et double règlement.
- Laisser le jeu en `candidate` avec `economy_enabled = false` pendant les tests.
- Comparer les taux de victoire et la durée de session sur un échantillon réel.
- Ajuster le coût ou la récompense dans `game_catalog`, pas dans le JavaScript du jeu.
- Passer à `verified` et activer l’économie seulement après revue des abus possibles.
