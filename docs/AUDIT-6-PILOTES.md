# Audit des six pilotes Premium

**Dernière exécution :** 18 septembre 2026  
**Périmètre :** Crossy Turfu, 421 Duel, Dés de Bohême, River Room Poker, Cyber-Core Sorter et Pixel Taquin

## Résultat du lot de standardisation

Le socle commun est intégré aux six jeux : tutoriel en trois étapes, menu partagé, pause/reprise,
résultat annoncé, rejeu avec nouvelle session, préférences communes, zoom autorisé, focus visible et
cibles tactiles principales adaptées.

| Contrôle | Résultat | Preuve |
| :-- | :--: | :-- |
| Sélection éditoriale unique | ✅ | `tests/premium-selection.test.js` |
| Contrat statique des six jeux | ✅ | `tests/premium-ux.test.js` |
| Chargement réel des six pages | ✅ | `tests/premium-browser.test.js` |
| Tutoriel avant démarrage | ✅ | 3 cartes, session encore `created` |
| Pause et reprise par le shell | ✅ | état `started` conservé |
| Résultat et rejeu | ✅ | état terminal annoncé puis nouvelle session `created` |
| Largeurs 320, 390 et 1366 px | ✅ | absence de débordement horizontal bloquant |
| Suite complète du dépôt | ✅ | `npm test` |
| Recette humaine tactile sur appareils réels | ⏳ | à effectuer avant certification finale |
| Partie humaine complète clavier/souris | ⏳ | à effectuer avant certification finale |

Commande de recette navigateur :

```bash
npm run serve
npm run test:premium-browser
```

Le serveur local doit être disponible sur `http://127.0.0.1:4173`. Le test utilise Chrome ou Edge
en mode headless, lance chaque pilote dans une vraie session Arcade et vérifie les trois largeurs.

## Statut par pilote

| Pilote | Shell | Tutoriel | Pause | Résultat/rejeu | Responsive automatisé | Certification Premium |
| :-- | :--: | :--: | :--: | :--: | :--: | :--: |
| Crossy Turfu | ✅ | ✅ | ✅ | ✅ | ✅ | En recette humaine |
| 421 Duel | ✅ | ✅ | ✅ | ✅ | ✅ | En recette humaine |
| Dés de Bohême | ✅ | ✅ | ✅ | ✅ | ✅ | En recette humaine |
| River Room Poker | ✅ | ✅ | ✅ | ✅ | ✅ | En recette humaine |
| Cyber-Core Sorter | ✅ | ✅ | ✅ | ✅ | ✅ | En recette humaine |
| Pixel Taquin | ✅ | ✅ | ✅ | ✅ | ✅ | En recette humaine |

## Corrections révélées par la recette navigateur

- le bouton commun « Rejouer » est explicitement autorisé par la protection des sessions terminales ;
- l'initialisation du shell réessaie son raccordement lorsque le HUD de session arrive après lui ;
- la détection historique de victoire/défaite ignore désormais le texte des overlays masqués ;
- le bouton du shell et le retour Accueil conservent une cible tactile d'au moins 44 px ;
- le temps et les actions différées restent suspendus lorsque la page passe en arrière-plan.

## Condition de sortie

Les six pilotes sont **standardisés techniquement**, mais restent des pilotes tant que la recette
humaine définie dans `CONTRAT-UX-PREMIUM.md` n'est pas signée sur mobile et ordinateur. Aucun autre
jeu ne doit entrer dans ce lot Premium avant cette validation.
