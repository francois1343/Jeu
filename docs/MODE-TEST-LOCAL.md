# Mode temporaire des Coins fictifs

Le mode actif est défini par `mode: "local-test"` dans `arcade-config.js`. Il ne contacte ni
Supabase, ni un réseau publicitaire, ni PayPal.

## Profils

- Un pseudo de 2 à 20 caractères crée ou rouvre un profil sur l’appareil courant.
- Chaque profil conserve son solde, son historique et sa partie éventuellement en attente.
- Les données sont enregistrées dans `localStorage` sous la clé
  `arcade.fictionalCoins.v2`. Les données de la version précédente sont migrées automatiquement.
- Aucun mot de passe ou renseignement personnel n’est demandé.

Le pseudo `ADMIN` ouvre le panneau de test. Il peut ajouter ou retirer des Coins à n’importe
quel profil local. Ce rôle n’est volontairement pas sécurisé et ne doit jamais être utilisé avec
de l’argent ou des récompenses réelles.

## Paramètres d’équilibrage

Toutes les valeurs temporaires sont regroupées dans `arcade-config.js` :

```js
localEconomy: {
  starterCoins: 5,
  playCostCoins: 1,
  winPayoutCoins: 1.25,
  maxHistoryEntries: 60,
  maxSessionEntries: 40,
  adminPseudos: ["ADMIN"],
  gamePolicies: { /* modes gratuits et seuils par jeu */ },
}
```

`winPayoutCoins` est le montant total versé après une victoire. Avec un coût de 1 et un paiement
de 1,25, le gain net d’une victoire est donc de 0,25 Coin.

## Parties existantes

Les 30 jeux accessibles depuis la grille reçoivent maintenant un identifiant de session. La
création de la session ne débite rien. Le moteur signale ensuite son démarrage réel, puis sa
victoire ou sa défaite. Un départ avant le démarrage ne coûte rien ; un départ ou rechargement
après le démarrage devient un abandon et perd la mise.

Open World et Pixel Forge restent provisoirement en entraînement gratuit car leur progression
est ouverte et ne possède pas encore de fin fiable. Les modes libre/créatif de GeoMinds, Insane
de Sudoku et Zen de Tetris sont également gratuits. Ils communiquent tout de même leurs états
de session.

Le détail du protocole commun se trouve dans `docs/COMMUNICATION-JEUX.md`.

## Passage futur aux comptes réels

Le stockage local est isolé dans `arcade-local-store.js`. La grille utilise la façade
`ArcadePlatform`, tandis que les pages de jeu passent par `ArcadeGameSession`. Le stockage pourra
donc être remplacé par l’adaptateur Supabase déjà préparé sans disperser les opérations de solde
dans les jeux.

Les soldes locaux sont fictifs et ne devront pas être importés automatiquement dans les vrais
portefeuilles : cela permet d’éviter qu’un utilisateur modifie son `localStorage` pour obtenir un
avantage réel.
