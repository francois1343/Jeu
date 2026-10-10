# ArcadeMatch

`ArcadeMatch` est le service commun des parties de Francis Arcade. Il sépare le transport
multijoueur, l’état de la partie et la validation du résultat afin qu’un jeu ne puisse plus
modifier directement les données d’un autre joueur ou le portefeuille de Coins.

## Les cinq modes

| Mode | Clé | Joueurs | Réseau | Autorité du résultat |
| --- | --- | ---: | --- | --- |
| Solo | `solo` | 1 | non requis | validateur propre au jeu |
| Contre Bot | `bot` | 1 + bot | non requis | validateur propre au jeu |
| Même écran | `local` | 2 locaux | non requis | validateur propre au jeu |
| Inviter un ami | `invite` | 2 comptes | Supabase Realtime | serveur du jeu |
| Joueur en ligne | `matchmaking` | 2 comptes | Supabase Realtime | serveur du jeu |

Les modes `solo`, `bot` et `local` peuvent utiliser le service pour unifier les tours et la
télémétrie. Leur résultat reste sans effet économique tant qu’un validateur serveur du jeu
n’a pas été créé.

## Données

- `matches` contient la machine d’état, le tour, la version optimiste, les délais et le résultat final ;
- `match_players` contient les places, la présence et la fenêtre de reconnexion ;
- `match_invites` ne conserve que le hash SHA-256 du jeton d’invitation ;
- `match_events` forme le journal append-only des actions, connexions et propositions de résultat.

Toutes les tables ont RLS activé. Les participants peuvent lire leur match en temps réel, mais
aucune écriture directe n’est accordée au navigateur.

## Cycle partagé

```text
création / file d’attente
          ↓
       waiting ── invitation acceptée / adversaire trouvé ──→ active
                                                            ↓
                                         tours versionnés + présence
                                                            ↓
                              résultat proposé au validateur serveur
                                                            ↓
                                         completed / abandoned / expired
```

Chaque action fournit `expectedVersion`. Deux onglets ne peuvent donc pas jouer simultanément
sur la même version. Pour les modes en ligne, seul le compte associé à la place courante peut
agir. En local ou contre un bot, le créateur peut piloter les deux places, mais cela ne constitue
jamais une preuve de victoire économique.

## Invitations et reconnexion

`ArcadeMatch.createInvite()` renvoie un jeton secret une seule fois et construit une URL avec
`?matchInvite=...`. PostgreSQL stocke uniquement son empreinte. Une invitation expire entre
5 minutes et 24 heures et toute nouvelle invitation révoque la précédente.

Le client envoie une présence toutes les 15 secondes. Une coupure marque le joueur déconnecté
sans abandonner immédiatement la partie. Le service laisse 90 secondes par défaut pour revenir ;
la tâche serveur `arcade_match_expire_stale()` transforme ensuite l’expiration en forfait.

## Résultat sécurisé

`ArcadeMatch.reportResult(result)` transmet une **proposition** à `match_events`. Cette opération
ne termine pas le match et ne crédite aucun Coin. Un validateur serveur rejoue ou vérifie les
actions du jeu, puis appelle `arcade_match_settle(...)`, RPC accordée uniquement au rôle
`service_role`. Les abandons et délais sont, eux, conclus directement par PostgreSQL puisqu’ils
sont vérifiables sans faire confiance au navigateur.

## API navigateur

```js
const match = await ArcadeMatch.create({
  gameKey: "mon-jeu",
  mode: ArcadeMatch.MODES.INVITE,
  options: { turn_seconds: 30 },
});

const invite = await ArcadeMatch.createInvite();
await ArcadeMatch.submitTurn({ type: "place", column: 3 });
await ArcadeMatch.reportResult({ winner_slot: 1, replay: [] });
```

Pour le matchmaking :

```js
await ArcadeMatch.findOpponent("mon-jeu", { queue: "public", turn_seconds: 30 });
```

Un jeu doit écouter `ArcadeMatch.subscribe(...)` ou l’événement `arcade:match` pour actualiser
son interface. Il ne doit jamais écrire directement dans les quatre tables.
