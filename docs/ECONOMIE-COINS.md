# Paramètres économiques initiaux

La base stocke les Coins en unités entières : 100 unités valent 1 Coin. Cette méthode évite les
erreurs d’arrondi et permet des récompenses comme 0,25 Coin.

| Paramètre | Valeur initiale | Rôle |
| --- | ---: | --- |
| Bonus de bienvenue | 3 Coins | Permet de découvrir les défis sans pub |
| Coût d’un défi | 1 Coin | Mise commune par défaut |
| Paiement d’une victoire | 2 Coins | Mise rendue + mise adverse ou du robot |
| Pub récompensée | 1 Coin | Maximum 3 par jour |
| Plafond des anciens défis certifiés | 5 Coins/jour | Ne concerne pas les sessions catalogue à pot fixe |
| Départs payants | 10/minute, 100/jour | Freine automatisation et boucles accidentelles |

Une victoire produit un gain net de 1 Coin et une défaite perd la mise de 1 Coin. Les sessions
et leurs règlements sont idempotents afin qu’un même résultat ne puisse pas payer deux fois.

Les valeurs globales vivent uniquement dans `economy_config`. Un jeu peut avoir un coût ou un
paiement différent dans `game_catalog`. La version de configuration utilisée est enregistrée
avec chaque session et chaque gain afin de conserver un historique explicable.
