# Communication entre la grille et les jeux

## Cycle d’une session

Chaque lancement depuis `index.html` ouvre `games/<jeu>/index.html`, crée un identifiant unique et
le transmet au jeu dans le paramètre
`arcadeSession` :

```text
created → started → won
                  → lost
                  → abandoned
```

- `created` : la page va s’ouvrir, aucun Coin n’est encore débité ;
- `started` : le moteur a réellement démarré, la mise est débitée une seule fois ;
- `won` : le paiement de victoire est versé une seule fois ;
- `lost` : la mise reste dépensée ;
- `abandoned` : une fermeture, un retour ou un rechargement termine la session.

Si l’abandon arrive pendant `created`, aucun débit n’a eu lieu. S’il arrive pendant `started`, la
mise reste perdue. Une session terminale ne peut pas être relancée ou payée une seconde fois.

## Responsabilités

`js/core/arcade-local-store.js` est le seul composant autorisé à modifier le solde. Il crée, démarre et
règle les sessions de façon idempotente, puis ajoute les transactions à l’historique.

`js/core/arcade-game-bridge.js` est chargé par les 30 pages de jeu. Il :

- retrouve la session transmise par la grille ;
- affiche son état et le solde dans un petit HUD ;
- transforme un rechargement ou une fermeture en abandon ;
- empêche de rejouer avec une session déjà terminée ;
- reçoit les signaux du moteur sans exposer d’opération directe sur le portefeuille.

Chaque moteur appelle seulement l’une des méthodes suivantes :

```js
ArcadeGameSession.start({ mode: "classic" });
ArcadeGameSession.win({ score: 1200 });
ArcadeGameSession.lose({ reason: "game_over" });
ArcadeGameSession.completeByScore(score);
ArcadeGameSession.completeByAccuracy(accuracy);
```

Les montants ne sont jamais passés par le jeu. Le gestionnaire retrouve le coût, la récompense
et les éventuels seuils dans `js/core/arcade-config.js`.

## Jeux et modes d’entraînement

Les jeux avec une fin naturelle signalent directement leur victoire ou leur défaite. Les jeux
infinis utilisent un seuil central de score ou de niveau. Open World et Pixel Forge sont encore
gratuits, car aucune condition de victoire fiable n’existe actuellement dans leur moteur.

Les modes volontairement sans fin restent également gratuits :

- GeoMinds libre et créatif ;
- Sudoku Insane ;
- Tetris Zen.

Ces exceptions sont déclarées dans `localEconomy.gamePolicies` et pourront être rendues payantes
plus tard sans modifier le portefeuille ni les autres jeux.
