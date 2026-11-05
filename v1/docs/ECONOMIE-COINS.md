# Paramètres économiques initiaux

La base stocke les Coins en unités entières : 100 unités valent 1 Coin. Cette méthode évite les
erreurs d’arrondi et permet des récompenses comme 0,25 Coin.

| Paramètre | Valeur initiale | Rôle |
| --- | ---: | --- |
| Bonus de bienvenue | 3 Coins | Permet de découvrir les défis sans pub |
| Coût d’un défi | 1 Coin | Mise commune par défaut |
| Paiement d’une victoire | 1,25 Coin | Mise rendue + bonus de 0,25 |
| Pub récompensée | 1 Coin | Maximum 3 par jour |
| Bonus net de victoire | 5 Coins/jour | Au-delà, les victoires rendent encore la mise |
| Départs payants | 10/minute, 100/jour | Freine automatisation et boucles accidentelles |

À 80 % de réussite, le joueur est à l’équilibre avant plafond. À 90 %, il gagne en moyenne
0,125 Coin par partie, puis le plafond journalier limite le farming sans bloquer les bons joueurs.

Les valeurs globales vivent uniquement dans `economy_config`. Un jeu peut avoir un coût ou un
paiement différent dans `game_catalog`. La version de configuration utilisée est enregistrée
avec chaque session et chaque gain afin de conserver un historique explicable.
