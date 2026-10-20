# Responsive et superpositions — correctifs du 20 octobre 2026

Les corrections sont vérifiées avec les mêmes interfaces de jeu et sessions locales que le navigateur utilise normalement. Les profils QA ne modifient aucun portefeuille Supabase.

## Résultats

| Vérification | Résultat |
| --- | --- |
| Accueils des 43 jeux, sur 4 formats | 172 mesures, aucun débordement horizontal ni chevauchement de commandes détecté |
| Parties, pauses, menus et paramètres de 12 jeux | 216 états contrôlés avec le bandeau Coins affiché |
| Petite largeur et rotation | 320×568, 390×844, 768×900, 1366×768 pour le catalogue; 844×390 ajouté à la recette interactive |
| Démineur Expert | Défilement interne jusqu'à la dernière colonne, sans élargir la page |
| Cyberfind | Zoom conservant le point sous le pointeur après déplacement de la zone de jeu |
| Tests existants | Suite complète et recette navigateur Premium |

La première mesure avec quatre formats trouvait 39/43 jeux sans débordement. La mesure finale atteint 43/43. Le score UX de 94/100 est un indicateur automatique de géométrie et de lisibilité, pas une certification d'accessibilité ou de commercialisation. Des cibles tactiles trop petites subsistent ailleurs dans le catalogue.

## Changements visibles

- **Pong et Casse-briques** : terrains proportionnels à la largeur et à la hauteur disponibles; menus bornés et défilants; dimensions virtuelles conservées pour la physique.
- **Cyber-Symbol Poker** : cinq cartes contenues dans l'écran, commandes +/− et distribution en grille souple, informations centrales repliées sur mobile.
- **Poker River Room** : table et commandes adaptées au mobile; suppression du minimum de 680 px; espace séparé pour la navigation commune.
- **Poker et Bubble Shooter** : suppression d'anciens réglages de bas d'écran qui étiraient le bandeau Coins entre le haut et le bas de la page.
- **OpenWorld** : en-tête repositionné; panneau Communauté non interactif lorsqu'il est fermé; focus et touche Échap gérés à l'ouverture.
- **Spider Solitaire, Cyberfind, Core Sorter, Neon Overdrive et Synthwave Runner** : espace réservé sous la barre Arcade; boutons Pause et Son accessibles; terrains ajustés à la hauteur disponible.
- **Démineur** : grandes grilles dans une zone défilante au clavier et au toucher; menus contenus dans l'écran.
- **Shell commun** : les panneaux portant `hidden` et le dialogue fermé restent masqués même si les styles d'un jeu redéfinissent leurs éléments.
- **Styles** : suppression de cinq fragments d'anciens imports de polices qui invalidaient le premier bloc CSS, notamment la palette de Cyberfind.
- **Zoom mobile** : réactivé dans les pages remaniées.

## Suivi dans le dashboard

L'onglet UX/UI utilise le rapport actualisé de `data/ux-audit.json` et affiche maintenant le taux d'interfaces sans superposition. Le scanner exclut les fenêtres fermées, les ancêtres transparents, les commandes inertes et les parties de grille en dehors de leur cadre défilant. Il ne traite plus les décors d'arrière-plan comme des commandes coupées.

```text
npm test
npm run audit:ux
npm run test:responsive-browser
npm run test:premium-browser
```

La recette Premium utilise le serveur local habituel sur le port 4173. La nouvelle recette responsive démarre et arrête son propre serveur si `ARCADE_BASE_URL` n'est pas fourni.

## Captures de contrôle

[Poker mobile, 390×844](qa/responsive/Poker-390-game.png) · [Poker desktop, 1366×768](qa/responsive/Poker-1366-game.png)
