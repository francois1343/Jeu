# Puissance 4 Live

Puissance 4 Live est le premier prototype multijoueur autoritaire de Francis Arcade.

## Parcours joueur

1. Les deux joueurs se connectent avec leur compte Arcade.
2. Le premier crée un salon et choisit un chrono de 20, 30, 45 ou 60 secondes.
3. Il partage le code de six caractères ou le lien d’invitation.
4. Le second rejoint le salon ; le serveur attribue aléatoirement les couleurs.
5. Chaque coup et chaque expiration du chrono sont validés dans PostgreSQL.
6. Le résultat met à jour le classement Elo des deux joueurs.

Le paramètre `?room=ABC234` conserve le salon dans l’URL. Après un rechargement ou une coupure,
la session Supabase persistante permet de récupérer la grille et le chrono serveur.
Le retour du réseau ou de l’onglet relance automatiquement l’abonnement et une synchronisation
périodique sert de secours. Un bouton **Reconnecter** apparaît si le canal Live tombe.

## Autorité et sécurité

- le navigateur n’insère et ne modifie aucune ligne de partie directement ;
- les RPC vérifient l’identité, le participant, le tour, la colonne et le délai ;
- les règles RLS limitent la lecture du salon et de son historique aux deux joueurs ;
- le flux Realtime diffuse uniquement les mises à jour PostgreSQL autorisées par ces règles ;
- le classement utilise un Elo initial de 1000 et un facteur K de 32 ;
- un abandon ou une expiration du chrono accorde la victoire à l’adversaire ;
- les salons en attente expirent après 30 minutes.

Les Coins ne sont pas liés au classement dans ce prototype.

## Recette manuelle à deux navigateurs

Utiliser deux comptes différents, de préférence dans deux profils de navigateur :

1. ouvrir Puissance 4 et sélectionner **Duel Live** dans les deux fenêtres ;
2. créer un salon dans la première fenêtre ;
3. rejoindre son code dans la seconde ;
4. vérifier que la couleur, le coup et le chrono se synchronisent ;
5. recharger une fenêtre pendant la partie et vérifier la reconnexion ;
6. terminer une partie, puis vérifier le résultat et le nouveau classement ;
7. recommencer et tester **Menu → Abandonner** ainsi que l’expiration du chrono.

## Limites du prototype

- deux joueurs uniquement ;
- grille classique 7 × 6 uniquement ;
- pas encore de matchmaking public, spectateurs, chat ou tournoi ;
- la suppression/anonymisation des historiques doit être intégrée au futur parcours de suppression de compte.
