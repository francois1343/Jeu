# Bingo 75 — version Arcade gratuite

Page : `games/bingo/index.html`. Fonctionne sans compte, accès réseau, mise ou
récompense en Coins. Le catalogue utilise `data-free="true"` et le jeu ne charge
pas le pont économique. Aucun schéma Supabase ou parcours de paiement modifié.

## Fonctionnement

Grille 5 × 5, centre libre, colonnes B/I/N/G/O de quinze numéros chacune. Tirage
sans remise. Objectif fixé avant le début : ligne/colonne/diagonale ou carton plein.
Seuls les numéros annoncés peuvent être cochés. La vérification contrôle à la fois
le tirage et le marquage. La partie s'arrête sur validation de Bingo.

L'auto tire immédiatement puis toutes les quatre secondes ; il s'arrête à une
combinaison disponible, au changement d'onglet, au départ de page ou à une nouvelle
grille. Les records locaux sont séparés par objectif et facultatifs : le jeu reste
utilisable lorsque le stockage est refusé. Ces records ne sont pas un classement
vérifié côté serveur et n'ont aucune valeur économique.

Contrôles HTML natifs accessibles au clavier, annonces de statut, adaptation mobile
et historique complet défilable. Pas de salon multijoueur ou version 90 boules dans
ce premier lot. Le menu de règles est propre au bingo, hors shell des jeux à Coins.

## Vérification

`node tests/bingo.test.js` exerce le moteur et les interactions du script dans un
DOM de test : 250 grilles/tirages, objectifs, faux Bingo, cases non tirées, pause,
nouvelle grille, stockage refusé et absence d'intégration économique.
Ce contrôle ne vaut pas validation visuelle dans un navigateur.

Les variantes 21+ avec gains réels et premium sans mises sont des projets distincts.
Une limite d'âge ne remplace pas les autorisations nécessaires. Cette version
Arcade n'active aucun de ces parcours. Aucun fournisseur publicitaire ajouté.
