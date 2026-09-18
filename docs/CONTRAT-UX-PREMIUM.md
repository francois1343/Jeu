# Contrat UX commun — Jeux Premium

**Version :** 1.0  
**Statut :** référence normative de la pré-bêta  
**Périmètre :** Crossy Turfu, 421 Duel, Dés de Bohême, River Room Poker, Cyber-Core Sorter et Pixel Taquin

Ce document définit les conditions minimales qu'un jeu doit remplir avant de recevoir le label
**Premium**. Une présence dans la vitrine « À jouer maintenant » ne vaut pas certification.

Les termes **DOIT**, **NE DOIT PAS** et **DEVRAIT** indiquent respectivement une exigence bloquante,
une interdiction et une recommandation. Toutes les exigences bloquantes doivent être validées sur
mobile et ordinateur.

## 1. Parcours commun

Chaque jeu DOIT proposer le parcours suivant :

```text
Ouverture → Tutoriel court → Prêt → Partie → Pause éventuelle → Résultat
                                                        ↘ Rejouer
                                                        ↘ Accueil
```

Le cycle visible du jeu doit rester cohérent avec la session Arcade :

```text
created → started → won
                  → lost
                  → abandoned
```

- `created` : la page est ouverte, mais la partie n'a pas réellement commencé ;
- `started` : le joueur a effectué une action explicite de démarrage ;
- `won` ou `lost` : le moteur a produit un résultat final unique ;
- `abandoned` : le joueur quitte une partie commencée sans résultat.

Le moteur DOIT appeler `ArcadeGameSession.start()`, puis exactement une issue parmi `win()`,
`lose()` ou `abandon()`. Il NE DOIT PAS modifier directement les Coins Arcade.

## 2. Tutoriel compréhensible en dix secondes

Avant la première partie, le joueur DOIT pouvoir comprendre en dix secondes environ :

1. son objectif ;
2. l'action principale ;
3. la condition de victoire ou d'échec.

Le tutoriel DOIT :

- tenir en trois étapes ou cartes maximum et environ 60 mots maximum ;
- montrer les commandes correspondant au périphérique actif ;
- proposer une action explicite « Jouer » ou « Commencer » ;
- pouvoir être ignoré immédiatement ;
- rester accessible ensuite depuis « Règles » ou « Aide » ;
- ne lancer ni minuteur, ni adversaire, ni débit de session avant l'action de démarrage.

Le jeu DEVRAIT mémoriser la consultation du tutoriel par profil et par version majeure du jeu, sans
empêcher sa réouverture.

## 3. Pause, reprise et abandon

### Jeux en temps réel

Un jeu en temps réel DOIT fournir un bouton Pause visible pendant la partie et accepter `Échap` ou
`P` au clavier. Pendant la pause :

- le temps, la physique, les adversaires, le score et les animations de jeu sont suspendus ;
- aucun événement ne peut provoquer une victoire ou une défaite ;
- la musique et les sons continus sont suspendus ;
- « Reprendre », « Règles », « Paramètres » et « Retour à l'Arcade » sont disponibles ;
- la reprise conserve exactement l'état précédent.

Le passage de la page en arrière-plan DEVRAIT déclencher une pause automatique.

### Jeux au tour par tour

Un jeu au tour par tour n'a pas besoin de figer un moteur déjà immobile, mais DOIT offrir un menu de
suspension donnant accès aux mêmes actions sans modifier le tour courant.

### Abandon

Quitter une partie `started` DOIT demander confirmation. Après confirmation, le jeu signale
`abandoned` une seule fois avant le retour à l'accueil. Une partie seulement `created` peut être
quittée sans pénalité.

## 4. Fin de partie

L'écran de résultat DOIT :

- remplacer clairement l'état de jeu et ne pas disparaître automatiquement ;
- annoncer « Victoire », « Défaite » ou un résultat neutre non ambigu ;
- afficher le score ou le résultat pertinent et, si disponible, le record ;
- expliquer brièvement la cause de fin lorsque cela aide le joueur ;
- proposer en premier « Rejouer », puis « Retour à l'Arcade » ;
- annoncer le résultat aux technologies d'assistance avec un statut approprié ;
- empêcher toute seconde soumission du même résultat.

Les crédits internes propres à un jeu DOIVENT être nommés autrement que « Coins » et présentés
comme fictifs. Les symboles monétaires réels sont à éviter.

## 5. Rejouer

« Rejouer » DOIT :

- être disponible depuis tout écran terminal ;
- créer une nouvelle session Arcade via `ArcadeGameSession.replay()` ;
- réinitialiser score, minuteurs, entrées, adversaires, plateau et état audio du moteur ;
- conserver uniquement les préférences, records et éléments explicitement persistants ;
- fonctionner plusieurs fois de suite sans recharger manuellement la page.

Le bouton NE DOIT PAS réutiliser une session `won`, `lost` ou `abandoned`.

## 6. Contrôles mobile, souris et clavier

Chaque action indispensable DOIT disposer d'au moins deux moyens d'entrée, dont une solution tactile
et une solution clavier lorsque le jeu est utilisable sur ordinateur.

### Mobile et tactile

- les cibles tactiles DOIVENT mesurer au moins 44 × 44 pixels CSS ;
- les contrôles DOIVENT rester dans les zones sûres définies par `env(safe-area-inset-*)` ;
- aucune action essentielle ne doit dépendre du survol ;
- les gestes doivent avoir une alternative visible par bouton lorsque leur découverte n'est pas évidente ;
- le défilement de page ne peut être bloqué que dans la surface de jeu qui consomme le geste ;
- le jeu DOIT rester utilisable à 320 pixels de large, sans contrôle masqué ni texte tronqué ;
- une orientation conseillée peut être affichée, mais l'orientation NE DOIT PAS être verrouillée sans solution de repli.

### Clavier et souris

- toutes les commandes essentielles DOIVENT être atteignables au clavier ;
- les touches sont annoncées avant ou pendant la partie ;
- `Tab` conserve un ordre logique et un indicateur de focus visible ;
- `Entrée` et `Espace` activent les contrôles qui se comportent comme des boutons ;
- une saisie dans un champ NE DOIT PAS déclencher une commande de jeu globale.

Le jeu DEVRAIT adapter automatiquement ses indications au dernier périphérique utilisé.

## 7. Accessibilité

Un jeu Premium DOIT respecter les exigences suivantes :

- langue de page définie et structure `main`, titres et boutons sémantiques ;
- nom accessible pour chaque bouton uniquement graphique et chaque surface de jeu ;
- information jamais transmise uniquement par la couleur, le son ou la vibration ;
- contraste minimal WCAG AA : 4,5:1 pour le texte courant et 3:1 pour le grand texte ;
- focus clavier visible et non masqué par un overlay ;
- dialogues nommés, focus placé à l'ouverture, contenu arrière inactif et focus restauré à la fermeture ;
- messages importants exposés avec `role="status"`, `aria-live` ou une alternative équivalente ;
- animations non essentielles désactivables et respect de `prefers-reduced-motion` ;
- son, musique et vibration désactivables via les préférences communes ;
- zoom navigateur autorisé : la page NE DOIT PAS imposer `user-scalable=no` ;
- aucun clignotement dangereux ni effet indispensable dépassant les recommandations d'accessibilité.

Pour un jeu sur `canvas`, une description textuelle de l'objectif et des commandes est obligatoire.
Les actions essentielles doivent rester disponibles hors du canvas ou via des contrôles clavier nommés.

## 8. Shell et préférences partagés

Chaque pilote DOIT charger `arcade-game-bridge.js`. Il DEVRAIT activer le shell commun avec
`data-arcade-shell="true"` dès que son adaptateur de pause et de reprise est prêt.

Le shell commun centralise :

- le retour à Francis Arcade ;
- l'état de session ;
- les règles courtes ;
- le classement local ;
- le rejeu après un état terminal ;
- les préférences de son, musique, vibration, animations et intensité visuelle.

Un moteur ne doit pas créer une seconde préférence contradictoire. Lorsqu'un réglage local subsiste,
il DOIT se synchroniser avec `ArcadeGamePreferences`.

## 9. Recette obligatoire

Chaque pilote doit être testé au minimum dans les conditions suivantes :

| Environnement | Vérification minimale |
| :-- | :-- |
| Mobile 320 × 568 | Lisibilité, commandes accessibles, aucun débordement bloquant |
| Mobile 390 × 844 | Partie complète au tactile, pause, reprise et rejeu |
| Tablette 768 × 1024 | Portrait et paysage, zones sûres et overlays |
| Ordinateur 1366 × 768 | Partie complète au clavier et à la souris |
| Clavier uniquement | Tutoriel, jeu, pause, résultat, rejeu et retour |
| Mouvement réduit | Aucun effet essentiel ou inconfortable imposé |
| Son coupé | Toutes les informations de jeu restent compréhensibles |
| Arrière-plan/reprise | Aucun temps, score ou résultat fantôme pendant la suspension |

Pour chaque environnement, la recette couvre au minimum : première ouverture, tutoriel, démarrage,
pause, reprise, victoire, défaite si applicable, rejeu deux fois, abandon et retour à l'accueil.

## 10. Checklist de certification

Un pilote reçoit le label Premium uniquement lorsque chaque ligne est validée avec une preuve de test :

- [ ] tutoriel compris en dix secondes et toujours rouvrable ;
- [ ] démarrage explicite et session `started` au bon moment ;
- [ ] pause ou suspension sans progression cachée ;
- [ ] victoire, défaite et abandon soumis exactement une fois ;
- [ ] écran final clair, persistant et annoncé ;
- [ ] rejeu fiable au moins deux fois consécutives ;
- [ ] partie complète au tactile ;
- [ ] partie complète au clavier lorsque pertinent ;
- [ ] cibles tactiles, focus, contraste et zoom conformes ;
- [ ] son, vibration, couleur et animations non indispensables à la compréhension ;
- [ ] aucune erreur console bloquante, ressource manquante ou navigation cassée ;
- [ ] tests automatisés du dépôt et recette manuelle réussis.

Une exigence bloquante non validée maintient le jeu en statut **pilote**, même s'il reste visible dans
la vitrine. Les écarts et leurs preuves sont consignés dans l'audit avant toute certification.
