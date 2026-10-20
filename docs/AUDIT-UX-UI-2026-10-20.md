# Audit UX/UI et maturité produit — 20 octobre 2026

## Verdict

Francis Arcade est une **pré-bêta fonctionnelle**, mais pas encore un produit commercialisable. Le socle est déjà riche (43 jeux, shell commun, PWA, Supabase, économie serveur, premiers services multijoueurs), tandis que la qualité perçue varie encore trop d'un jeu à l'autre.

La recette automatique mesure un score UX moyen de **80/100**, avec **38 jeux sur 43** sans débordement ou élément fixe coupé aux deux formats testés. L'indice de préparation commerciale est volontairement plus strict : **68 % vers une pré-bêta**, pas 68 % vers une mise en vente.

Méthode : chaque page a été ouverte dans un vrai moteur Chromium en 1366×768 et 390×844. Le script mesure les débordements, superpositions de contrôles, zones tactiles sous 44 px, éléments fixes coupés et textes minuscules. Le rapport complet est dans `data/ux-audit.json` et peut être régéné avec `npm run audit:ux`.

## Constats prioritaires

### P0 — Bloquants avant bêta publique

1. **Uniformiser l'entrée et la sortie d'une partie.** L'écran technique de session a été transformé en carte compacte non bloquante, mais plusieurs jeux ont encore leur propre plein écran de fin de partie. La cible est une bottom-sheet mobile et une carte latérale desktop, avec Rejouer et Retour Arcade toujours visibles.
2. **Corriger les cinq jeux responsives en échec.** Les contrôles les plus faibles sont notamment Pong mobile (débordement horizontal), Cyber-Symbol Poker mobile, puis des interfaces à nombreuses superpositions mesurées comme Pixel Forge, Cybermorpion, Memory et Simon.
3. **Finir l'autorité serveur.** Aucun gain, abandon, invitation ou résultat compétitif ne doit dépendre d'une affirmation du navigateur. Les Coins et Puissance 4 Live sont déjà durcis; ArcadeMatch fournit le contrat commun, mais chaque jeu doit encore être certifié.
4. **Rendre l'exploitation observable.** Le nouveau centre de pilotage couvre comptes, actifs, sessions, Coins, statuts et progression. Il faudra ensuite ajouter erreurs client anonymisées, latence, taux d'abandon et rétention J1/J7 avant une vraie bêta.

### P1 — Qualité perçue

- Garantir une zone tactile de 44×44 px pour tous les boutons et liens. Le taux actuel mesuré est de **88 %**.
- Conserver une seule barre utilitaire : retour Arcade à gauche, Coins/état et menu à droite, sans doublon propre au jeu.
- Limiter l'en-tête d'un jeu à environ 96 px sur desktop 768 px et placer l'action principale au-dessus de la ligne de flottaison.
- Transformer Règles, Classement et options secondaires en panneaux repliables au lieu de blocs toujours ouverts.
- Définir trois niveaux de boutons partagés : primaire, secondaire, discret/danger. Le thème du jeu change les couleurs, pas la hiérarchie.
- Conserver le choix « J'ai compris / Ignorer » dans le navigateur, tout en laissant le tutoriel accessible depuis le menu.

## Gamification recommandée

La priorité n'est pas d'ajouter plus de monnaies, mais de rendre la progression lisible et honnête.

- **Missions courtes** : 3 objectifs gratuits par jour, une barre hebdomadaire et un bonus cosmétique au 5e jour, sans punir une journée manquée.
- **Maîtrise par jeu** : niveaux gagnés avec l'activité et les performances validées, sans acheter de puissance.
- **Saisons légères** : thème, badges et classement réinitialisé; les statistiques personnelles restent.
- **Défis sociaux** : revanche, invitation par lien, score fantôme et tournoi asynchrone. ArcadeMatch doit être le service unique derrière ces modes.
- **Feedback immédiat** : expliquer chaque variation de Coins et garder un historique consultable; aucune récompense silencieuse.

Les indicateurs à suivre sont la première partie terminée, le deuxième jeu essayé, la rétention J1/J7, le taux de revanche, les abandons, le temps avant la première action et la part de joueurs à solde nul.

## Faut-il migrer vers React ou Vue ?

**Non, pas maintenant.** Une réécriture globale ne résoudrait ni les incohérences de placement, ni les pop-ups, ni la validation serveur. Elle créerait en revanche une longue période où deux architectures devraient cohabiter.

La trajectoire recommandée est :

1. stabiliser le shell, les tokens CSS et 8 à 12 composants d'interface partagés;
2. certifier six jeux pilotes et figer les contrats ArcadeMatch/Coins;
3. mesurer pendant une bêta fermée;
4. ne choisir un framework que si l'état partagé, le routage ou la vitesse de livraison deviennent un frein prouvé.

Si ce seuil est atteint, Vue serait le chemin incrémental le plus doux pour des pages existantes; React serait pertinent avec une équipe déjà experte et un futur back-office très applicatif. Dans les deux cas, commencer par le centre de pilotage ou une nouvelle page, jamais par une réécriture simultanée des 43 jeux.

## Centre de pilotage livré

La page `/admin/` est un écran plein et responsive, distinct de l'ancienne modale QA locale. Elle fournit :

- comptes créés, comptes confirmés, actifs 24 h / 7 jours;
- sessions, victoires, parties ouvertes et terminées;
- Coins en circulation, solde moyen et distribution des soldes;
- courbes d'inscriptions et d'activité;
- jeux les plus utilisés, statuts de session et modes de match;
- liste de joueurs par pseudo, solde, gains/dépenses et activité, **sans exposer leur email**;
- progression UX, constats prioritaires et feuille de route.

L'accès est contrôlé par une Edge Function Supabase. L'agrégation SQL n'est exécutable que par le rôle serveur. Un joueur authentifié ordinaire ne voit pas le bouton et ne peut pas appeler directement le rapport.

## Feuille de route visuelle

| Chantier | Avancement | Condition de sortie |
|---|---:|---|
| Shell et responsive | 58 % | 43/43 jeux sans débordement, superposition critique ni cible < 44 px |
| Six jeux pilotes | 48 % | parcours complet certifié sur mobile et desktop |
| Coins et multijoueur serveur | 38 % | résultats, tours, abandon et reconnexion autoritaires |
| Commercialisation | 18 % | observabilité, support, conformité, modération et paiements validés |

## Critères de commercialisation

Ne pas ouvrir une offre payante avant d'avoir : une bêta fermée stable, un taux de crash mesuré, un support et une procédure de suppression/export des données, une politique de remboursement, une surveillance antifraude, une validation des paiements, une limite d'âge et une revue RGPD/cookies adaptée aux outils réellement activés.

